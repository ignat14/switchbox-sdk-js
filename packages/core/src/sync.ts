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
    // response could land last, overwriting a newer config (a 30s flag
    // rollback window). Skipping the tick keeps fetches strictly sequential.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const response = await globalThis.fetch(this.cdnUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const raw = await response.json();

      // Skip update if version hasn't changed
      const currentVersion = this.cache.getVersion();
      if (currentVersion && raw.version === currentVersion) {
        return;
      }

      // Normalise into the canonical shape (two-level DNF, defaults filled,
      // malformed flag entries skipped) so cached flags + getAllFlags are
      // consistent and the evaluator never has to branch on shape.
      this.cache.setConfig(normalizeConfig(raw));
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
