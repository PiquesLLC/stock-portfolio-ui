import { describe, it, expect } from 'vitest';
import { formatCurrency, formatLargeNumber, formatVolume, formatPercent, inferExchangeLabel } from './stock-detail';

describe('formatCurrency', () => {
  it('formats with dollar sign and 2 decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });
});

describe('formatLargeNumber', () => {
  it('formats millions', () => {
    expect(formatLargeNumber(500)).toBe('500.00M');
  });

  it('formats billions', () => {
    expect(formatLargeNumber(2500)).toBe('2.50B');
  });

  it('formats trillions', () => {
    expect(formatLargeNumber(3000000)).toBe('3.00T');
  });
});

describe('formatVolume', () => {
  it('returns N/A for null', () => {
    expect(formatVolume(null)).toBe('N/A');
  });

  it('formats millions', () => {
    expect(formatVolume(45.3)).toBe('45.30M');
  });

  it('formats billions', () => {
    expect(formatVolume(1500)).toBe('1.50B');
  });
});

describe('formatPercent', () => {
  it('formats positive with + sign', () => {
    expect(formatPercent(3.14)).toBe('+3.14%');
  });

  it('formats negative with - sign', () => {
    expect(formatPercent(-2.5)).toBe('-2.50%');
  });
});

describe('inferExchangeLabel', () => {
  it('returns TSX for .TO suffix', () => {
    expect(inferExchangeLabel('SHOP.TO')).toBe('TSX');
  });

  it('returns LSE for .L suffix', () => {
    expect(inferExchangeLabel('HSBA.L')).toBe('LSE');
  });

  it('returns Crypto for -USD suffix', () => {
    expect(inferExchangeLabel('BTC-USD')).toBe('Crypto');
  });

  it('returns Futures for =F', () => {
    expect(inferExchangeLabel('ES=F')).toBe('Futures');
  });

  it('returns null for US stocks', () => {
    expect(inferExchangeLabel('AAPL')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(inferExchangeLabel('shop.to')).toBe('TSX');
  });
});
