import { describe, it, expect } from 'vitest';
import { generateApiKey, maskApiKey, apiKeyPrefix, API_KEY_PREFIX } from '../../src/lib/api-key.js';

describe('generateApiKey', () => {
  it('returns a key with the mc_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('has the expected length (prefix + 64 hex chars)', () => {
    const key = generateApiKey();
    expect(key.length).toBe(3 + 64);
  });

  it('produces different keys on two calls', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe('maskApiKey', () => {
  it('masks a long key as mc_...<last4>', () => {
    const key = 'mc_abcdef1234567890';
    expect(maskApiKey(key)).toBe('mc_...7890');
  });

  it('returns a 4-char-or-shorter key unchanged', () => {
    expect(maskApiKey('mc_1')).toBe('mc_1');
    expect(maskApiKey('abcd')).toBe('abcd');
    expect(maskApiKey('x')).toBe('x');
  });
});

describe('apiKeyPrefix', () => {
  it('returns the first 7 characters', () => {
    const key = 'mc_abc123456789';
    expect(apiKeyPrefix(key)).toBe('mc_abc1');
  });

  it('works for shorter strings', () => {
    expect(apiKeyPrefix('short')).toBe('short');
  });
});
