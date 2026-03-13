import { describe, it, expect } from 'vitest';
import { evaluate, matchRule, enabledValue } from '../src/evaluator';
import { rolloutBucket } from '../src/hash';
import type { Flag, Rule } from '../src/types';

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    enabled: true,
    rollout_pct: 100,
    flag_type: 'boolean',
    default_value: false,
    rules: [],
    ...overrides,
  };
}

describe('evaluate', () => {
  it('disabled flag returns default_value', async () => {
    const flag = makeFlag({ enabled: false, default_value: 'off' });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe('off');
  });

  it('enabled flag with 100% rollout returns true', async () => {
    const flag = makeFlag({ rollout_pct: 100 });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe(true);
  });

  it('enabled flag with 0% rollout returns default_value', async () => {
    const flag = makeFlag({ rollout_pct: 0 });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe(false);
  });

  it('no user context with rollout < 100 returns default_value', async () => {
    const flag = makeFlag({ rollout_pct: 50 });
    expect(await evaluate(flag, 'test')).toBe(false);
  });

  it('no user context with rollout == 100 returns enabled value', async () => {
    const flag = makeFlag({ rollout_pct: 100 });
    expect(await evaluate(flag, 'test')).toBe(true);
  });

  it('rule matching — equals', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'pro' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'free' })).toBe(false);
  });

  it('rule matching — not_equals', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'plan', operator: 'not_equals', value: 'free' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'pro' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'free' })).toBe(false);
  });

  it('rule matching — contains', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'email', operator: 'contains', value: 'company' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', email: 'a@company.com' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', email: 'a@other.com' })).toBe(false);
  });

  it('rule matching — ends_with', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'email', operator: 'ends_with', value: '@company.com' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', email: 'a@company.com' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', email: 'a@other.com' })).toBe(false);
  });

  it('rule matching — in_list', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'country', operator: 'in_list', value: ['US', 'CA', 'UK'] }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', country: 'US' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', country: 'DE' })).toBe(false);
  });

  it('rule matching — gt', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'age', operator: 'gt', value: '18' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', age: '25' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', age: '15' })).toBe(false);
  });

  it('rule matching — lt', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'age', operator: 'lt', value: '18' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', age: '10' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', age: '25' })).toBe(false);
  });

  it('rule with missing attribute in context does not match', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [{ attribute: 'email', operator: 'equals', value: 'a@b.com' }],
    });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe(false);
  });

  it('multiple rules — OR logic (any match wins)', async () => {
    const flag = makeFlag({
      rollout_pct: 0,
      rules: [
        { attribute: 'plan', operator: 'equals', value: 'enterprise' },
        { attribute: 'email', operator: 'ends_with', value: '@company.com' },
      ],
    });
    expect(await evaluate(flag, 'test', { user_id: '1', email: 'a@company.com', plan: 'free' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'enterprise' })).toBe(true);
    expect(await evaluate(flag, 'test', { user_id: '1', plan: 'free' })).toBe(false);
  });

  it('rollout is deterministic — same user always same result', async () => {
    const flag = makeFlag({ rollout_pct: 50, rules: [] });
    const results: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(Boolean(await evaluate(flag, 'feature_x', { user_id: 'user_42' })));
    }
    expect(new Set(results).size).toBe(1);
  });

  it('rollout distribution — 10000 users at 30% yields ~3000', async () => {
    const flag = makeFlag({ rollout_pct: 30, rules: [] });
    let enabled = 0;
    for (let i = 0; i < 10000; i++) {
      const result = await evaluate(flag, 'distribution_test', { user_id: `user_${i}` });
      if (result === true) enabled++;
    }
    expect(enabled).toBeGreaterThan(2500);
    expect(enabled).toBeLessThan(3500);
  });

  it('string flag type returns string default_value', async () => {
    const flag = makeFlag({
      flag_type: 'string',
      default_value: 'v1',
      rollout_pct: 100,
    });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe('v1');
  });

  it('number flag type returns number default_value', async () => {
    const flag = makeFlag({
      flag_type: 'number',
      default_value: 42,
      rollout_pct: 100,
    });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toBe(42);
  });

  it('json flag type returns object default_value', async () => {
    const config = { theme: 'dark', limit: 10 };
    const flag = makeFlag({
      flag_type: 'json',
      default_value: config,
      rollout_pct: 100,
    });
    expect(await evaluate(flag, 'test', { user_id: '1' })).toEqual(config);
  });
});
