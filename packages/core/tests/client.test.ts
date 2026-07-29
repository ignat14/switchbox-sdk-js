import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Switchbox } from '../src/client';
import type { FlagConfig } from '../src/types';

const sampleConfig: FlagConfig = {
  version: '2026-04-07T12:00:00Z',
  flags: {
    new_dashboard: {
      enabled: true,
      rollout_pct: 100,
      flag_type: 'boolean',
      default_value: false,
      rules: [],
    },
    theme: {
      enabled: true,
      rollout_pct: 100,
      flag_type: 'string',
      default_value: 'dark',
      rules: [],
    },
  },
};

function mockFetch(config: FlagConfig) {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers(),
    json: () => Promise.resolve(config),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Switchbox', () => {
  it('enabled returns false for nonexistent flag', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Switchbox({ sdkKey: 'test-key' });
    await client.init();
    expect(await client.enabled('nonexistent')).toBe(false);
    client.destroy();
  });

  it('getValue returns default for nonexistent flag', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Switchbox({ sdkKey: 'test-key' });
    await client.init();
    expect(await client.getValue('nonexistent', undefined, 'fallback')).toBe('fallback');
    client.destroy();
  });

  it('works with mocked fetch response', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Switchbox({ sdkKey: 'test-key' });
    await client.init();
    expect(await client.enabled('new_dashboard', { user_id: '1' })).toBe(true);
    expect(await client.getValue('theme', { user_id: '1' })).toBe('dark');
    client.destroy();
  });

  it('handles fetch failure gracefully', async () => {
    const onError = vi.fn();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const client = new Switchbox({
      sdkKey: 'test-key',
      onError,
    });
    await client.init();
    expect(onError).toHaveBeenCalled();
    expect(await client.enabled('new_dashboard')).toBe(false);
    client.destroy();
  });

  it('onEvaluation callback fires on every evaluation', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const onEvaluation = vi.fn();
    const client = new Switchbox({
      sdkKey: 'test-key',
      onEvaluation,
    });
    await client.init();

    const user = { user_id: '1' };
    await client.enabled('new_dashboard', user);
    expect(onEvaluation).toHaveBeenCalledWith('new_dashboard', true, user);

    await client.getValue('nonexistent', user, 'default');
    expect(onEvaluation).toHaveBeenCalledWith('nonexistent', 'default', user);

    expect(onEvaluation).toHaveBeenCalledTimes(2);
    client.destroy();
  });

  it('a throwing onEvaluation hook never breaks evaluation and reports via onError', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const hookError = new Error('analytics handler blew up');
    const onEvaluation = vi.fn(() => {
      throw hookError;
    });
    const onError = vi.fn();
    const client = new Switchbox({ sdkKey: 'test-key', onEvaluation, onError });
    await client.init();

    expect(await client.enabled('new_dashboard', { user_id: '1' })).toBe(true);
    expect(await client.getValue('theme', { user_id: '1' })).toBe('dark');
    expect(onEvaluation).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(hookError);
    client.destroy();
  });

  it('a throwing onConfigChange listener does not starve later listeners', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const onError = vi.fn();
    const client = new Switchbox({ sdkKey: 'test-key', onError });
    const listenerError = new Error('subscriber blew up');
    const second = vi.fn();
    client.onConfigChange(() => {
      throw listenerError;
    });
    client.onConfigChange(second);
    await client.init(); // first config load notifies subscribers

    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(listenerError);
    client.destroy();
  });

  it('onConfigChange fires when a config version arrives (SEC-3)', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Switchbox({ sdkKey: 'test-key' });
    const listener = vi.fn();
    client.onConfigChange(listener);
    await client.init(); // first config load → notify subscribers
    expect(listener).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  it('onConfigChange unsubscribe stops notifications', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Switchbox({ sdkKey: 'test-key' });
    const listener = vi.fn();
    const off = client.onConfigChange(listener);
    off();
    await client.init();
    expect(listener).not.toHaveBeenCalled();
    client.destroy();
  });

  it('destroy stops polling', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const client = new Switchbox({
      sdkKey: 'test-key',
      pollInterval: 1,
    });
    await client.init();
    client.destroy();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
