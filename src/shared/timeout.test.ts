import { describe, expect, it } from 'vitest';
import { parseOptionalTimeout } from './timeout.js';

describe('parseOptionalTimeout', () => {
  it('returns undefined for invalid timeout', () => {
    expect(parseOptionalTimeout(undefined)).toBeUndefined();
    expect(parseOptionalTimeout('abc')).toBeUndefined();
    expect(parseOptionalTimeout('-1')).toBeUndefined();
  });

  it('returns parsed timeout for positive numeric values', () => {
    expect(parseOptionalTimeout('15000')).toBe(15000);
  });
});
