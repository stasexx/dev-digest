import { describe, it, expect } from 'vitest';
import { backoffDelay } from '../src/platform/backoff.js';

describe('backoffDelay', () => {
  it('returns a positive delay for the first attempt', () => {
    expect(backoffDelay(0)).toBeGreaterThan(0);
  });

  it('accepts ms-style duration strings', () => {
    expect(backoffDelay(1, '100ms', '1s')).toBeGreaterThan(0);
  });
});
