import {
  ErrorCode,
  OpenFeatureEventEmitter,
  ProviderEvents,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';
import type {
  EvaluationContext,
  JsonValue,
  Provider,
  ResolutionDetails,
} from '@openfeature/web-sdk';
import { Switchbox } from 'switchbox-js';
import type { SwitchboxOptions, UserContext } from 'switchbox-js';

/**
 * OpenFeature web provider for Switchbox.
 *
 * A pure translation layer over the `switchbox-js` client — it contains zero
 * evaluation logic. Evaluation stays exactly what the SDK does today: poll the
 * CDN every 30s, evaluate rules locally in the browser.
 *
 * The web SDK's static-context paradigm requires synchronous `resolve*`
 * methods, but the Switchbox client evaluates asynchronously (Web Crypto
 * hashing). The fit: pre-evaluate every flag on `initialize` and on each
 * context change (`getAllFlags`), cache the results, and serve each `resolve*`
 * as a synchronous cache lookup. Because evaluation is local, a context change
 * costs zero network — the re-evaluation is pure computation.
 *
 * Usage:
 *
 *   import { OpenFeature } from '@openfeature/web-sdk';
 *   import { SwitchboxProvider } from '@switchbox/openfeature';
 *
 *   await OpenFeature.setContext({ targetingKey: 'user-42', plan: 'pro' });
 *   await OpenFeature.setProviderAndWait(new SwitchboxProvider({ sdkKey: '...' }));
 *   const client = OpenFeature.getClient();
 *   client.getBooleanValue('new_checkout', false);
 */
export class SwitchboxProvider implements Provider {
  readonly metadata = { name: 'switchbox' } as const;
  readonly runsOn = 'client' as const;
  readonly events = new OpenFeatureEventEmitter();

  private client: Switchbox;
  /** Provider-owned clients are init'd + destroyed here; passed-in ones are the caller's. */
  private ownsClient: boolean;
  /** Flag key → locally pre-evaluated value for the current context. */
  private values: Record<string, unknown> = {};
  private context: EvaluationContext = {};
  private unsubscribe?: () => void;
  /** First fetch error captured while our own client initializes (see initialize). */
  private initError?: Error;

  /**
   * Pass Switchbox options to let the provider own the client lifecycle, or an
   * existing `Switchbox` instance to share one you already manage (the provider
   * will then neither init nor destroy it).
   */
  constructor(clientOrOptions: Switchbox | SwitchboxOptions) {
    // Duck-type rather than instanceof: options always carry `sdkKey`, a
    // client never does — and instanceof would break across duplicate copies
    // of switchbox-js (e.g. source vs dist in a test runner).
    if ('sdkKey' in clientOrOptions) {
      // Wrap onError so a failed *first* fetch can reject initialize() below —
      // the core client reports fetch failures via callback, never by throwing.
      const userOnError = clientOrOptions.onError;
      this.client = new Switchbox({
        ...clientOrOptions,
        onError: (error) => {
          this.initError ??= error;
          userOnError?.(error);
        },
      });
      this.ownsClient = true;
    } else {
      this.client = clientOrOptions;
      this.ownsClient = false;
    }
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    this.context = context ?? {};
    // Reset per-attempt state so a re-initialize after a transient failure
    // isn't poisoned by a stale error (or a stray later-poll error) and never
    // stacks a second config-change subscription.
    this.initError = undefined;
    this.unsubscribe?.();
    if (this.ownsClient) {
      await this.client.init();
      // init() resolves even when the first fetch failed (errors surface via
      // the onError callback). Rejecting here puts the provider in ERROR state
      // so OpenFeature serves code defaults — same fail-safe posture as the
      // SDKs' own never-throw evaluation (ADR-043).
      if (this.initError) throw this.initError;
    }
    this.unsubscribe = this.client.onConfigChange(() => {
      // getAllFlags never throws by contract (ADR-043); the catch guards a
      // caller-managed client with exotic overrides from becoming an
      // unhandled rejection that would silently kill future updates.
      void this.refresh(true).catch(() => undefined);
    });
    await this.refresh(false);
  }

  /**
   * Re-evaluate for the new static context. Local evaluation means this is
   * pure computation — no network round trip, unlike remote-eval providers.
   */
  async onContextChange(
    _oldContext: EvaluationContext,
    newContext: EvaluationContext,
  ): Promise<void> {
    this.context = newContext;
    await this.refresh(false);
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.ownsClient) this.client.destroy();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
  ): ResolutionDetails<boolean> {
    return this.fromCache(flagKey, defaultValue, 'boolean');
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
  ): ResolutionDetails<string> {
    return this.fromCache(flagKey, defaultValue, 'string');
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
  ): ResolutionDetails<number> {
    return this.fromCache(flagKey, defaultValue, 'number');
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
  ): ResolutionDetails<T> {
    return this.fromCache(flagKey, defaultValue, 'object');
  }

  /** Monotonic token: only the newest refresh may publish its results. */
  private refreshSeq = 0;

  /** Re-run getAllFlags for the current context and cache the results. */
  private async refresh(emitChanged: boolean): Promise<void> {
    // Refreshes can overlap (a config poll landing mid-context-change), and
    // per-flag Web Crypto hashing makes completion order ≠ start order — an
    // older pass must never overwrite a newer one with stale evaluations.
    const seq = ++this.refreshSeq;
    const values = await this.client.getAllFlags(toUserContext(this.context));
    if (seq !== this.refreshSeq) return;
    this.values = values;
    if (emitChanged) {
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'flag configuration changed',
      });
    }
  }

  private fromCache<T>(
    flagKey: string,
    defaultValue: T,
    expected: 'boolean' | 'string' | 'number' | 'object',
  ): ResolutionDetails<T> {
    if (!Object.hasOwn(this.values, flagKey)) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `flag "${flagKey}" was not found`,
      };
    }
    const value = this.values[flagKey];
    const matches =
      expected === 'object'
        ? typeof value === 'object' && value !== null
        : typeof value === expected;
    if (!matches) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `flag "${flagKey}" resolved to a ${typeof value}, not a ${expected}`,
      };
    }
    return { value: value as T, reason: StandardResolutionReasons.CACHED };
  }
}

/**
 * OpenFeature context → Switchbox user context: `targetingKey` becomes
 * `user_id` (the rollout-bucketing identity), everything else passes through
 * as targeting attributes. An empty context maps to no user at all.
 *
 * `targetingKey` is authoritative per the OpenFeature spec: it wins over an
 * attribute literally named `user_id`, so bucketing can't silently key off a
 * stray attribute.
 */
export function toUserContext(
  context: EvaluationContext,
): UserContext | undefined {
  const { targetingKey, ...attributes } = context;
  if (targetingKey === undefined && Object.keys(attributes).length === 0) {
    return undefined;
  }
  return targetingKey === undefined
    ? { ...attributes }
    : { ...attributes, user_id: targetingKey };
}
