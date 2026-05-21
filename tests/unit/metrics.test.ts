import { describe, it, expect } from 'vitest';
import { tokensPerSecond } from '../../src/lib/metrics.js';

describe('tokensPerSecond', () => {
  it('returns tokens divided by latency in seconds', () => {
    expect(tokensPerSecond(100, 1000)).toBe(100);
    expect(tokensPerSecond(50, 500)).toBe(100);
    expect(tokensPerSecond(10, 2000)).toBe(5);
  });

  it('returns null when completion tokens are null or undefined', () => {
    expect(tokensPerSecond(null, 1000)).toBeNull();
    expect(tokensPerSecond(undefined, 1000)).toBeNull();
  });

  it('returns null when latency is null or undefined', () => {
    expect(tokensPerSecond(100, null)).toBeNull();
    expect(tokensPerSecond(100, undefined)).toBeNull();
  });

  it('returns null when completion tokens are zero or negative', () => {
    expect(tokensPerSecond(0, 1000)).toBeNull();
    expect(tokensPerSecond(-5, 1000)).toBeNull();
  });

  it('returns null when latency is zero or negative', () => {
    expect(tokensPerSecond(100, 0)).toBeNull();
    expect(tokensPerSecond(100, -100)).toBeNull();
  });
});
