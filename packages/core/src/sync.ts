import { FlagCache } from './cache';
import { toRuleGroups } from './evaluator';
import type { FlagConfig } from './types';

// Abort a hung config fetch after this long — mirrors the Python SDK's
// `timeout=10`. Without it, `await Switchbox.create()` on a black-holed
// connection blocks until the platform's TCP timeout (minutes) — the JS half
// of SEC-9.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Normalise a raw CDN payload into the canonical FlagConfig shape:
 * - targeting → two-level DNF RuleGroups (also accepts legacy flat configs)
 * - omitted `flag_type` defaults to "boolean", omitted `rollout_pct` to 0 —
 *   matching the Python parser (`FlagConfig.from_dict`), parity-pinned
 * - non-object flag entries are skipped (a malformed flag from a future
 *   publisher bug must not poison the cache), like Python's per-flag skip
 *
 * Exported so the parity-vector suite exercises the real parse path the
 * SyncWorker uses, not hand-built Flag literals.
 */
export function normalizeConfig(raw: any): FlagConfig {
  const entries = Object.entries(raw.flags ?? {})
    .filter(
      ([, flag]) =>
        flag !== null && typeof flag === 'object' && !Array.isArray(flag),
    )
    .map(([key, flag]: [string, any]) => [
      key,
      {
        ...flag,
        flag_type: flag.flag_type ?? 'boolean',
        rollout_pct: flag.rollout_pct ?? 0,
        rules: toRuleGroups(flag.rules),
      },
    ]);
  return { version: raw.version ?? '', flags: Object.fromEntries(entries) };
}

export class SyncWorker {
  private cdnUrl: string;
  private cache: FlagCache;
  private interval: number;
  private onError?: (error: Error) => void;
  private onUpdate?: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  // Last ETag the CDN gave us, echoed back as If-None-Match (REF-8). Polls are
  // serialised by the in-flight guard below, so a single field is enough.
  private etag: string | null = null;

  constructor(
    cdnUrl: string,
    cache: FlagCache,
    interval: number,
    onError?: (error: Error) => void,
    onUpdate?: () => void,
  ) {
    this.cdnUrl = cdnUrl;
    this.cache = cache;
    this.interval = interval;
    this.onError = onError;
    this.onUpdate = onUpdate;
  }

  async start(): Promise<void> {
    await this.fetch();
    this.timer = setInterval(() => {
      this.fetch();
    }, this.interval * 1000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async fetch(): Promise<void> {
    // In-flight guard: interval ticks fire un-awaited, so a poll slower than
    // the interval would otherwise overlap the next one — and the *older*
    // response could land last, overwriting a newer config (a full poll
    // interval's rollback window). Skipping the tick keeps fetches sequential.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      // Conditional fetch (REF-8): once we hold a config, ask the CDN to answer
      // 304-with-no-body unless it actually changed, so steady-state polling
      // costs the browser no payload. `If-None-Match` isn't CORS-safelisted, so
      // this makes the poll preflighted — the Worker answers OPTIONS with a
      // long Access-Control-Max-Age, so it's one preflight per browser, not one
      // per poll. Degrades to a plain 200 on a CDN that sends no ETag.
      const headers: Record<string, string> = {};
      if (this.etag) headers['If-None-Match'] = this.etag;
      const response = await globalThis.fetch(this.cdnUrl, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // Unchanged: no body to parse, cache and subscribers untouched. Must come
      // before the ok check — a 304 is deliberately not `ok`.
      if (response.status === 304) {
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // Null when the CDN sends no ETag, so we never send a validator it didn't
      // issue. Committed to `this.etag` only once the config it describes is in
      // the cache (below): storing it for a body we failed to parse would make
      // every later poll a 304 we skip — wedging the client on defaults until
      // the next publish changes the ETag.
      const etag = response.headers.get('ETag');
      const raw = await response.json();

      // Skip update if version hasn't changed
      const currentVersion = this.cache.getVersion();
      if (currentVersion && raw.version === currentVersion) {
        this.etag = etag;
        return;
      }

      // Normalise into the canonical shape (two-level DNF, defaults filled,
      // malformed flag entries skipped) so cached flags + getAllFlags are
      // consistent and the evaluator never has to branch on shape.
      this.cache.setConfig(normalizeConfig(raw));
      this.etag = etag;
      // Notify subscribers (e.g. React hooks) that a new config is live.
      this.onUpdate?.();
    } catch (error) {
      if (this.onError) {
        this.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } finally {
      this.inFlight = false;
    }
  }
}
