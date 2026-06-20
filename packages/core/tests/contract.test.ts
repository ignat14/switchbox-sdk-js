// CDN JSON contract — JS SDK side of the 3-repo handshake (TESTING Phase 2).
//
// Parses the canonical fixtures (tests/fixtures/cdn-json/, synced from the
// workspace fixtures/cdn-json/ by fixtures/sync.py) and pins how the JS SDK reads
// the format the backend publisher emits. A format change not mirrored here fails
// these tests; see the workspace fixtures/cdn-json/README.md.

import { describe, it, expect } from 'vitest';
import { toRuleGroups, enabledValue, evaluate } from '../src/evaluator';
import type { Flag, FlagConfig } from '../src/types';
// Vite resolves JSON imports relative to this file — robust across environments
// (import.meta.url / cwd are unreliable under vitest's transformed runtime).
import full_config from './fixtures/cdn-json/full_config.json';
import defaults from './fixtures/cdn-json/defaults.json';
import unknown_fields from './fixtures/cdn-json/unknown_fields.json';
import legacy_flat_rules from './fixtures/cdn-json/legacy_flat_rules.json';
import empty from './fixtures/cdn-json/empty.json';

const FIXTURES = {
  full_config,
  defaults,
  unknown_fields,
  legacy_flat_rules,
  empty,
} as unknown as Record<string, FlagConfig>;

function load(name: string): FlagConfig {
  return FIXTURES[name];
}

const ALL = ['full_config', 'defaults', 'unknown_fields', 'legacy_flat_rules', 'empty'];

describe('CDN JSON contract (TESTING Phase 2)', () => {
  it.each(ALL)('parses %s without error', (name) => {
    const config = load(name);
    expect(typeof config.version).toBe('string');
    expect(typeof config.flags).toBe('object');
  });

  it('full_config: flag types and variation values', () => {
    const f = load('full_config').flags;

    expect(f.bool_on.flag_type).toBe('boolean');
    expect(f.bool_on.enabled).toBe(true);
    expect(f.bool_on.rollout_pct).toBe(100);
    expect(f.bool_on.rules).toEqual([]);
    expect(f.bool_off.enabled).toBe(false);

    expect(f.string_ab.default_value).toBe('control');
    expect(f.string_ab.enabled_value).toBe('treatment');
    expect(f.number_rollout.enabled_value).toBe(42);
    expect(f.number_rollout.rollout_pct).toBe(25);
    expect(f.json_variant.default_value).toEqual({ theme: 'light' });
    expect(f.json_variant.enabled_value).toEqual({ theme: 'dark' });
    expect(f.bool_on.enabled_value).toBeUndefined();
  });

  it('enabledValue: boolean → true, variation → enabled_value', () => {
    const f = load('full_config').flags;
    expect(enabledValue(f.bool_on)).toBe(true);
    expect(enabledValue(f.string_ab)).toBe('treatment');
    expect(enabledValue(f.number_rollout)).toBe(42);
  });

  it('full_config: all seven operators present; in_list stays an array', () => {
    const groups = toRuleGroups(load('full_config').flags.all_operators.rules);
    const ops = new Set(groups.flatMap((g) => g.conditions.map((c) => c.operator)));
    expect([...ops].sort()).toEqual([
      'contains',
      'ends_with',
      'equals',
      'gt',
      'in_list',
      'lt',
      'not_equals',
    ]);
    const inList = groups
      .flatMap((g) => g.conditions)
      .find((c) => c.operator === 'in_list');
    expect(inList?.value).toEqual(['US', 'CA', 'GB']);
  });

  it('full_config: DNF structure is OR of AND-groups', () => {
    const groups = toRuleGroups(load('full_config').flags.all_operators.rules);
    expect(groups.length).toBe(3);
    expect(groups.map((g) => g.conditions.length)).toEqual([2, 2, 3]);
  });

  it('segments are inlined, not referenced', () => {
    const groups = toRuleGroups(load('full_config').flags.segment_flag.rules);
    expect(groups.length).toBe(1);
    expect(groups[0].conditions[0]).toMatchObject({
      attribute: 'plan',
      operator: 'equals',
      value: 'enterprise',
    });
  });

  it('defaults: omitted rules normalise to [] and evaluate does not throw', async () => {
    const flag = load('defaults').flags.minimal as Flag;
    expect(flag.enabled).toBe(true);
    expect(toRuleGroups(flag.rules)).toEqual([]); // rules omitted → []
    // rollout_pct + flag_type omitted; evaluating with a user must not throw.
    await expect(
      evaluate(flag, 'minimal', { user_id: 'u1' }),
    ).resolves.toBeUndefined(); // no default_value → undefined
  });

  it('unknown fields are ignored by the evaluator', async () => {
    const config = load('unknown_fields');
    // The extra keys are present in the JSON…
    expect((config as Record<string, unknown>).future_top_level_field).toBeDefined();
    // …but the evaluator only reads known fields and still works.
    const flag = config.flags.fwd_compat;
    await expect(evaluate(flag, 'fwd_compat')).resolves.toBe(true);
  });

  it('legacy flat rule → single-condition group', () => {
    const groups = toRuleGroups(load('legacy_flat_rules').flags.legacy.rules);
    expect(groups.length).toBe(1);
    expect(groups[0].conditions.length).toBe(1);
    expect(groups[0].conditions[0]).toMatchObject({
      attribute: 'country',
      operator: 'equals',
      value: 'US',
    });
  });

  it('empty flags object', () => {
    expect(load('empty').flags).toEqual({});
  });
});
