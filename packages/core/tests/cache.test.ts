import { describe, it, expect } from 'vitest';
import { FlagCache } from '../src/cache';
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
  },
};

describe('FlagCache', () => {
  it('starts empty, returns null', () => {
    const cache = new FlagCache();
    expect(cache.getConfig()).toBeNull();
    expect(cache.getVersion()).toBeNull();
    expect(cache.getFlag('anything')).toBeNull();
  });

  it('set and get config', () => {
    const cache = new FlagCache();
    cache.setConfig(sampleConfig);
    expect(cache.getConfig()).toEqual(sampleConfig);
    expect(cache.getVersion()).toBe('2026-04-07T12:00:00Z');
  });

  it('getFlag returns correct flag', () => {
    const cache = new FlagCache();
    cache.setConfig(sampleConfig);
    const flag = cache.getFlag('new_dashboard');
    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(true);
    expect(flag!.rollout_pct).toBe(100);
  });

  it('getFlag returns null for missing key', () => {
    const cache = new FlagCache();
    cache.setConfig(sampleConfig);
    expect(cache.getFlag('nonexistent')).toBeNull();
  });
});
