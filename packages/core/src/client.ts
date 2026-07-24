import { FlagCache } from './cache';
import { evaluate } from './evaluator';
import { SyncWorker } from './sync';
import { TelemetryAggregator, TelemetryReporter } from './telemetry';
import type { SwitchboxOptions, UserContext } from './types';
import { SDK_NAME, SDK_VERSION } from './version';

const DEFAULT_CDN_BASE_URL = 'https://cdn.switchbox.dev';

export class Switchbox {
  private cache: FlagCache;
  private sync: SyncWorker;
  private onEvaluation?: SwitchboxOptions['onEvaluation'];
  private onError?: SwitchboxOptions['onError'];
  private telemetry: TelemetryAggregator | null = null;
  private reporter: TelemetryReporter | null = null;
  private listeners = new Set<() => void>();

  /**
   * Create a client and wait for the first config fetch in one call — the
   * recommended entry point:
   *
   *   const sb = await Switchbox.create({ sdkKey: '...' });
   *
   * Use `new Switchbox(options)` + `await sb.init()` directly only when you
   * need to construct before awaiting.
   */
  static async create(options: SwitchboxOptions): Promise<Switchbox> {
    const client = new Switchbox(options);
    await client.init();
    return client;
  }

  constructor(options: SwitchboxOptions) {
    this.cache = new FlagCache();
    this.onEvaluation = options.onEvaluation;
    this.onError = options.onError;
    const base = options.cdnBaseUrl ?? DEFAULT_CDN_BASE_URL;
    const cdnUrl = `${base}/${options.sdkKey}/flags.json`;
    this.sync = new SyncWorker(
      cdnUrl,
      this.cache,
      options.pollInterval ?? 10,
      options.onError,
      () => this.notifyConfigChange(),
    );

    // Anonymous usage telemetry (MEASUREMENT Phase 1 / ADR-055): on by default,
    // `{ telemetry: false }` opts out. Counts evaluations locally and flushes an
    // aggregate summary to the CDN worker's ingest route on its own ~60s
    // cadence. Env key only — never identity/context. Fail-open.
    if (options.telemetry !== false) {
      this.telemetry = new TelemetryAggregator();
      this.reporter = new TelemetryReporter(
        `${base}/${options.sdkKey}/telemetry`,
        this.telemetry,
        SDK_NAME,
        SDK_VERSION,
      );
      this.reporter.start();
    }
  }

  async init(): Promise<void> {
    await this.sync.start();
  }

  /**
   * Subscribe to config updates. The callback fires whenever the polled config
   * version changes. Returns an unsubscribe function.
   *
   * The React hooks subscribe through this so mounted components re-evaluate
   * when a new config arrives — without it, hook values stay frozen at mount
   * even though the cache keeps refreshing (SEC-3).
   */
  onConfigChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyConfigChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        // one throwing listener must not starve the others, and its error
        // must not masquerade as a fetch failure in the sync worker's catch
        this.reportHookError(error);
      }
    }
  }

  /** Surface a caller-supplied hook's exception through onError (never throw). */
  private reportHookError(error: unknown): void {
    try {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    } catch {
      // the onError callback itself must never break evaluation
    }
  }

  /**
   * Shared eval path: look up the flag, evaluate (or use `fallback` when absent),
   * fire the onEvaluation hook, return the result.
   */
  private async evalFlag(
    flagKey: string,
    user: UserContext | undefined,
    fallback: any,
  ): Promise<any> {
    const flag = this.cache.getFlag(flagKey);
    // evaluate never throws (ADR-043) — a malformed rule degrades to the
    // flag's default_value and reports through onError.
    const result = flag
      ? await evaluate(flag, flagKey, user, this.onError)
      : fallback;
    // Record usage telemetry for real evaluations only (not absent-flag
    // fallbacks), matching the Python SDK.
    if (flag && this.telemetry) this.telemetry.record(flagKey, result);
    try {
      this.onEvaluation?.(flagKey, result, user);
    } catch (error) {
      // a caller's hook must never break evaluation (ADR-043) — matches
      // Python; surfaced through onError so the failure isn't invisible
      this.reportHookError(error);
    }
    return result;
  }

  async enabled(flagKey: string, user?: UserContext): Promise<boolean> {
    return Boolean(await this.evalFlag(flagKey, user, false));
  }

  async getValue(
    flagKey: string,
    user?: UserContext,
    defaultValue?: any,
  ): Promise<any> {
    return this.evalFlag(flagKey, user, defaultValue);
  }

  async getAllFlags(user?: UserContext): Promise<Record<string, any>> {
    const config = this.cache.getConfig();
    if (!config) return {};
    const results: Record<string, any> = {};
    for (const [key, flag] of Object.entries(config.flags)) {
      results[key] = await evaluate(flag, key, user, this.onError);
    }
    return results;
  }

  destroy(): void {
    this.sync.stop();
    this.reporter?.stop(); // final best-effort telemetry flush
    this.listeners.clear();
  }
}
