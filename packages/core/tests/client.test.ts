import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '../src/client';
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
    json: () => Promise.resolve(config),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Client', () => {
  it('enabled returns false for nonexistent flag', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Client({ cdnUrl: 'https://cdn.test/flags.json' });
    await client.init();
    expect(await client.enabled('nonexistent')).toBe(false);
    client.destroy();
  });

  it('getValue returns default for nonexistent flag', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Client({ cdnUrl: 'https://cdn.test/flags.json' });
    await client.init();
    expect(await client.getValue('nonexistent', undefined, 'fallback')).toBe('fallback');
    client.destroy();
  });

  it('works with mocked fetch response', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const client = new Client({ cdnUrl: 'https://cdn.test/flags.json' });
    await client.init();
    expect(await client.enabled('new_dashboard', { user_id: '1' })).toBe(true);
    expect(await client.getValue('theme', { user_id: '1' })).toBe('dark');
    client.destroy();
  });

  it('handles fetch failure gracefully', async () => {
    const onError = vi.fn();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const client = new Client({
      cdnUrl: 'https://cdn.test/flags.json',
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
    const client = new Client({
      cdnUrl: 'https://cdn.test/flags.json',
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

  it('destroy stops polling', async () => {
    globalThis.fetch = mockFetch(sampleConfig);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const client = new Client({
      cdnUrl: 'https://cdn.test/flags.json',
      pollInterval: 1,
    });
    await client.init();
    client.destroy();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
