import { describe, it, expect } from 'vitest';

/**
 * Extracted baseline parsing logic from AccountSettingsModal.
 * Tests that the client-side validation matches server expectations.
 */
function parseBaselineValue(input: string): number | null {
  const parsed = parseFloat(input);
  return input && Number.isFinite(parsed) ? parsed : null;
}

describe('YTD baseline client-side parsing', () => {
  it('parses valid positive number', () => {
    expect(parseBaselineValue('125000')).toBe(125000);
    expect(parseBaselineValue('50000.50')).toBe(50000.50);
    expect(parseBaselineValue('0.01')).toBe(0.01);
  });

  it('returns null for empty string', () => {
    expect(parseBaselineValue('')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseBaselineValue('abc')).toBeNull();
    expect(parseBaselineValue('$125,000')).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(parseBaselineValue('Infinity')).toBeNull();
    expect(parseBaselineValue('-Infinity')).toBeNull();
  });

  it('rejects NaN-producing input', () => {
    expect(parseBaselineValue('NaN')).toBeNull();
  });
});
