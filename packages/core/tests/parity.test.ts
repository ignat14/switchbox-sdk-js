import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { matchRule, evaluate } from '../src/evaluator';
import type { Flag, Rule, UserContext } from '../src/types';

// Shared with switchbox-sdk-python/tests/parity_vectors.json — byte-identical.
// Both SDKs run the same vectors so they evaluate identical inputs identically
// (SEC-4). See the sdk-parity skill and DECISIONS.md ADR-013.
const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(here, 'parity_vectors.json'), 'utf-8'),
);

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
