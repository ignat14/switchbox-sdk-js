import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../src/hash';

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

// Cross-SDK rolloutBucket parity (the 42/user_100/abc values that used to live
// here) now lives in the shared parity vectors' `rollout_bucket` section — run by
// BOTH SDKs, so the pin is genuinely cross-language. See parity.test.ts +
// fixtures/parity/parity_vectors.json.
