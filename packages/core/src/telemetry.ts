/**
 * Anonymous usage telemetry (MEASUREMENT Phase 1 / ADR-055).
 *
 * Counts flag *evaluations* locally and flushes a compact per-flag summary
 * every ~60s to the CDN worker's ingest route, which fans each `(flag, value)`
 * count into Cloudflare Analytics Engine (per-flag counts, value distribution,
 * per-flag liveness, stale-flag + outdated-SDK views) — see ARCHITECTURE.md
 * §5/§6.
 *
 * Invariants (do not weaken):
 * - **Anonymous** — the only identifier is the environment's SDK key (in the
 *   request path). Never send identity, user context, or cookies.
 * - **Aggregate** — one summary per window, not one message per evaluation, so
 *   cost scales with flag/value cardinality x flush cadence x client count, not
 *   with evaluation volume.
 * - **Fail-open** — a flush never blocks or breaks evaluation; errors are
 *   swallowed (the window's counts are dropped).
 * - **On by default, opt-out** via `{ telemetry: false }`.
 *
 * The value-repr and top-N-per-flag rules are pinned cross-SDK by the shared
 * fixture `fixtures/telemetry/value_reprs.json` — the Python SDK's
 * `telemetry.py` must produce identical reprs.
 */

/** ~60s flush window, its own request (decoupled from the flag poll). */
export const DEFAULT_FLUSH_INTERVAL = 60;
/** Distinct values tracked per flag before folding the rest into `$other`. */
export const MAX_VALUES_PER_FLAG = 10;
/**
 * Sentinel bucket for values beyond the cap. Never collides with a real repr:
 * every real repr is JSON, so a string value "$other" reprs as `"$other"`.
 */
export const OTHER_BUCKET = '$other';

const FLUSH_TIMEOUT_MS = 10_000;

/**
 * Canonical string key for a resolved flag value, for count bucketing.
 * Compact, key-sorted JSON so it matches the Python SDK's `value_repr` for
 * every JSON value: `true` / `false` / `42` / `"A"` / `null` / `{"a":1,"b":2}`.
 */
export function valueRepr(value: any): string {
  try {
    return stableStringify(value);
  } catch {
    return String(value);
  }
}

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  // Sort keys so two SDKs (and two JS objects with different insertion order)
  // produce the same repr for the same logical value.
  const keys = Object.keys(v).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') +
    '}'
  );
}

/** Thread-free (single JS thread) `counts[flagKey][valueRepr] -> n` accumulator. */
export class TelemetryAggregator {
  // Null-prototype maps: a flag key like "constructor" or a repr must never
  // collide with inherited Object properties (mirrors FlagCache).
  private counts: Record<string, Record<string, number>> = Object.create(null);

  constructor(private maxValues: number = MAX_VALUES_PER_FLAG) {}

  record(flagKey: string, value: any): void {
    const repr = valueRepr(value);
    let flag = this.counts[flagKey];
    if (flag === undefined) {
      flag = Object.create(null);
      this.counts[flagKey] = flag;
    }
    if (flag[repr] !== undefined) {
      flag[repr] += 1;
    } else if (Object.keys(flag).length < this.maxValues) {
      flag[repr] = 1;
    } else {
      flag[OTHER_BUCKET] = (flag[OTHER_BUCKET] ?? 0) + 1;
    }
  }

  /** Return the accumulated counts and reset the window. */
  drain(): Record<string, Record<string, number>> {
    const counts = this.counts;
    this.counts = Object.create(null);
    return counts;
  }
}

/** Flushes the aggregator's window on a timer and once on `stop()`. */
export class TelemetryReporter {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private url: string,
    private aggregator: TelemetryAggregator,
    private sdkName: string,
    private sdkVersion: string,
    private interval: number = DEFAULT_FLUSH_INTERVAL,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.interval * 1000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final best-effort flush of the last partial window on shutdown.
    this.flush();
  }

  /** Drain and send the current window. Fail-open: drops the window on error. */
  async flush(): Promise<void> {
    const counts = this.aggregator.drain();
    if (Object.keys(counts).length === 0) return;
    try {
      await globalThis.fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdk_name: this.sdkName,
          sdk_version: this.sdkVersion,
          flags: counts,
        }),
        // keepalive lets the final flush land during page unload.
        keepalive: true,
        signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
      });
    } catch {
      // Telemetry must never surface — drop the window.
    }
  }
}
