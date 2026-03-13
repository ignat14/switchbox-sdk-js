import { describe, it, expect } from 'vitest';
import { sha256Hex, rolloutBucket } from '../src/hash';

describe('sha256Hex', () => {
  it('produces correct hex for known inputs', async () => {
    expect(await sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(await sha256Hex('test')).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
  });
});

describe('rolloutBucket — cross-SDK compatibility', () => {
  // These values are pre-computed from the Python SDK to guarantee identical results
  it('rolloutBucket("42", "new_checkout") matches Python SDK', async () => {
    expect(await rolloutBucket('42', 'new_checkout')).toBe(98);
  });

  it('rolloutBucket("user_100", "feature_x") matches Python SDK', async () => {
    expect(await rolloutBucket('user_100', 'feature_x')).toBe(4);
  });

  it('rolloutBucket("abc", "search_version") matches Python SDK', async () => {
    expect(await rolloutBucket('abc', 'search_version')).toBe(10);
  });
});
