import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent } from './format';

describe('formatCurrency', () => {
  it('formats positive values with $ and 2 decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative values', () => {
    expect(formatCurrency(-42.1)).toBe('-$42.10');
  });

  it('formats large values with commas', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
});

describe('formatPercent', () => {
  it('formats positive percent with + sign', () => {
    expect(formatPercent(5.25)).toBe('+5.25%');
  });

  it('formats negative percent with - sign', () => {
    expect(formatPercent(-3.1)).toBe('-3.10%');
  });

  it('formats zero percent', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });
});
