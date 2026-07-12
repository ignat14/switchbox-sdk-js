import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorCode, ProviderEvents } from '@openfeature/web-sdk';
// Real core client (aliased to source in vitest.config.ts) — the provider is a
// pure translation layer, so the tests exercise it over real local evaluation
// against a faked CDN, exactly like the react package's SEC-3 test.
import { Switchbox } from 'switchbox-js';
import { SwitchboxProvider, toUserContext } from '../src/provider';

function config(version: string, greetingOn = 'Buy now') {
  return {
    version,
    flags: {
      bool_flag: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'boolean',
        default_value: false,
        rules: [],
      },
      greeting: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'string',
        default_value: 'Shop',
        enabled_value: greetingOn,
        rules: [],
      },
      limit: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'number',
        default_value: 10,
        enabled_value: 25,
        rules: [],
      },
      theme: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'json',
        default_value: { mode: 'light' },
        enabled_value: { mode: 'dark' },
        rules: [],
      },
      pro_only: {
        enabled: true,
        rollout_pct: 0,
        flag_type: 'string',
        default_value: 'basic',
        enabled_value: 'pro',
        rules: [
          {
            conditions: [
              { attribute: 'plan', operator: 'equals', value: 'pro' },
            ],
          },
        ],
      },
    },
  };
}

function serveCdn(initial: ReturnType<typeof config>) {
  const state = { served: initial };
  globalThis.fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(state.served) }),
    );
  return state;
}

const providers: SwitchboxProvider[] = [];

async function readyProvider(
  context = { targetingKey: 'user-1', plan: 'pro' },
  pollInterval = 1000,
) {
  const provider = new SwitchboxProvider({ sdkKey: 'test-key', pollInterval });
  providers.push(provider);
  await provider.initialize(context);
  return provider;
}

afterEach(async () => {
  // Stop every provider-owned poll timer so tests never leak intervals.
  for (const provider of providers.splice(0)) await provider.onClose();
  vi.restoreAllMocks();
});

describe('toUserContext — context mapping', () => {
  it('maps targetingKey to user_id and passes attributes through', () => {
    expect(toUserContext({ targetingKey: 'u1', plan: 'pro' })).toEqual({
      user_id: 'u1',
      plan: 'pro',
    });
  });

  it('maps an empty context to no user at all', () => {
    expect(toUserContext({})).toBeUndefined();
  });

  it('keeps attribute-only contexts (no targetingKey)', () => {
    expect(toUserContext({ plan: 'pro' })).toEqual({ plan: 'pro' });
  });

  it('targetingKey is authoritative over a stray user_id attribute', () => {
    expect(toUserContext({ targetingKey: 'u1', user_id: 'legacy-7' })).toEqual(
      { user_id: 'u1' },
    );
  });
});

describe('resolution — each getter translates onto the pre-evaluated cache', () => {
  it('resolves boolean, string, number and object values', async () => {
    serveCdn(config('v1'));
    const provider = await readyProvider();

    expect(provider.resolveBooleanEvaluation('bool_flag', false)).toMatchObject(
      { value: true, reason: 'CACHED' },
    );
    expect(provider.resolveStringEvaluation('greeting', 'x')).toMatchObject({
      value: 'Buy now',
      reason: 'CACHED',
    });
    expect(provider.resolveNumberEvaluation('limit', 0)).toMatchObject({
      value: 25,
      reason: 'CACHED',
    });
    expect(provider.resolveObjectEvaluation('theme', {})).toMatchObject({
      value: { mode: 'dark' },
      reason: 'CACHED',
    });
  });

  it('evaluates targeting rules against the mapped context attributes', async () => {
    serveCdn(config('v1'));
    const provider = await readyProvider({ targetingKey: 'u1', plan: 'pro' });
    expect(provider.resolveStringEvaluation('pro_only', 'x').value).toBe(
      'pro',
    );
  });

  it('returns FLAG_NOT_FOUND with the code default for unknown flags', async () => {
    serveCdn(config('v1'));
    const provider = await readyProvider();
    expect(provider.resolveBooleanEvaluation('nope', true)).toMatchObject({
      value: true,
      reason: 'ERROR',
      errorCode: ErrorCode.FLAG_NOT_FOUND,
    });
  });

  it('returns TYPE_MISMATCH when the evaluated value is not the requested type', async () => {
    serveCdn(config('v1'));
    const provider = await readyProvider();
    expect(provider.resolveBooleanEvaluation('greeting', false)).toMatchObject(
      {
        value: false,
        reason: 'ERROR',
        errorCode: ErrorCode.TYPE_MISMATCH,
      },
    );
    expect(provider.resolveObjectEvaluation('limit', {})).toMatchObject({
      errorCode: ErrorCode.TYPE_MISMATCH,
    });
  });
});

describe('context change — re-evaluates locally, zero network', () => {
  it('serves new values after onContextChange without another CDN fetch', async () => {
    serveCdn(config('v1'));
    const provider = await readyProvider({ targetingKey: 'u1', plan: 'pro' });
    expect(provider.resolveStringEvaluation('pro_only', 'x').value).toBe(
      'pro',
    );
    const fetchesBefore = vi.mocked(globalThis.fetch).mock.calls.length;

    await provider.onContextChange(
      { targetingKey: 'u1', plan: 'pro' },
      { targetingKey: 'u1' },
    );

    expect(provider.resolveStringEvaluation('pro_only', 'x').value).toBe(
      'basic',
    );
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchesBefore);
  });
});

describe('config change — emits ConfigurationChanged and refreshes the cache', () => {
  it('picks up a new config version within one poll interval', async () => {
    const cdn = serveCdn(config('v1'));
    const provider = await readyProvider(
      { targetingKey: 'u1', plan: 'pro' },
      0.05,
    );
    const changed = vi.fn();
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, changed);

    cdn.served = config('v2', 'New copy');

    await vi.waitFor(
      () => {
        expect(changed).toHaveBeenCalled();
        expect(provider.resolveStringEvaluation('greeting', 'x').value).toBe(
          'New copy',
        );
      },
      { timeout: 2000 },
    );
  });
});

describe('lifecycle', () => {
  it('initialize rejects when the first config fetch fails (provider ERROR state)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() => Promise.reject(new Error('CDN unreachable')));
    const provider = new SwitchboxProvider({
      sdkKey: 'test-key',
      pollInterval: 1000,
    });
    providers.push(provider);
    await expect(provider.initialize({})).rejects.toThrow('CDN unreachable');
  });

  it('still forwards fetch errors to a user-supplied onError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() => Promise.reject(new Error('boom')));
    const onError = vi.fn();
    const provider = new SwitchboxProvider({
      sdkKey: 'test-key',
      pollInterval: 1000,
      onError,
    });
    providers.push(provider);
    await expect(provider.initialize({})).rejects.toThrow('boom');
    expect(onError).toHaveBeenCalled();
  });

  it('onClose stops reacting to config changes', async () => {
    const cdn = serveCdn(config('v1'));
    const provider = await readyProvider(
      { targetingKey: 'u1', plan: 'pro' },
      0.05,
    );
    const changed = vi.fn();
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, changed);

    await provider.onClose();
    cdn.served = config('v2');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(changed).not.toHaveBeenCalled();
  });

  it('wraps a caller-managed client without owning its lifecycle', async () => {
    serveCdn(config('v1'));
    const client = new Switchbox({ sdkKey: 'shared-key', pollInterval: 1000 });
    await client.init();
    const initSpy = vi.spyOn(client, 'init');
    const destroySpy = vi.spyOn(client, 'destroy');

    const provider = new SwitchboxProvider(client);
    await provider.initialize({ targetingKey: 'u1' });
    // No second init: the provider evaluated from the client's existing cache.
    expect(initSpy).not.toHaveBeenCalled();
    expect(provider.resolveStringEvaluation('greeting', 'x').value).toBe(
      'Buy now',
    );

    // Closing the provider must NOT tear down the caller's client.
    await provider.onClose();
    expect(destroySpy).not.toHaveBeenCalled();
    client.destroy();
  });
});
