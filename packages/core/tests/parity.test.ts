import { describe, it, expect } from 'vitest';
import { matchRule, evaluate } from '../src/evaluator';
import { rolloutBucket } from '../src/hash';
import type { Flag, Rule, UserContext } from '../src/types';
// Canonical fixtures/parity/parity_vectors.json (workspace root), synced into this
// repo by `python3 fixtures/sync.py`; the Python suite runs the same bytes. Both
// SDKs must evaluate identical inputs identically (SEC-4). Edit the canonical and
// re-sync — never hand-edit this copy. See DECISIONS.md ADR-013 + ADR-024.
import vectors from './fixtures/parity/parity_vectors.json';

describe('SEC-4 rule_match parity vectors', () => {
  for (const c of vectors.rule_match) {
    it(c.name, () => {
      expect(matchRule(c.rule as Rule, c.context as UserContext)).toBe(
        c.expected,
      );
    });
  }
});

describe('SEC-4 evaluate parity vectors', () => {
  for (const c of vectors.evaluate) {
    it(c.name, async () => {
      const result = await evaluate(
        c.flag as Flag,
        c.flag_key,
        c.user ?? undefined,
      );
      expect(result).toBe(c.expected);
    });
  }
});

describe('SEC-4 rollout_bucket parity vectors', () => {
  for (const c of vectors.rollout_bucket) {
    it(c.name, async () => {
      // The rollout hash itself: sha256(`${user_id}:${flag_key}`) % 100. The
      // Python suite asserts the same values (it recovers the bucket via
      // _check_rollout's boundary, since it has no public bucket accessor).
      expect(await rolloutBucket(c.user_id, c.flag_key)).toBe(c.expected);
    });
  }
});

describe('SEC-4 user_id resolution', () => {
  it('user_id wins over id (null-only fallback)', async () => {
    const flag = {
      enabled: true,
      rollout_pct: 50,
      flag_type: 'boolean',
      default_value: false,
      rules: [],
    } as Flag;
    const a = await evaluate(flag, 'f', { user_id: 'stable', id: 'aaa' });
    const b = await evaluate(flag, 'f', { user_id: 'stable', id: 'bbb' });
    expect(a).toBe(b);
  });
});
