import { describe, it, expect } from 'vitest';
import { getSessionDisplay, getLocalTzAbbr } from './market';

describe('getSessionDisplay', () => {
  it('returns PRE for pre-market', () => {
    const result = getSessionDisplay('PRE');
    expect(result.label).toBe('PRE');
    expect(result.description).toContain('Pre-Market');
  });

  it('returns OPEN for regular session', () => {
    const result = getSessionDisplay('REG');
    expect(result.label).toBe('OPEN');
    expect(result.description).toContain('Regular Session');
  });

  it('returns AH for after-hours', () => {
    const result = getSessionDisplay('POST');
    expect(result.label).toBe('AH');
    expect(result.description).toContain('After-Hours');
  });

  it('returns CLOSED for closed session', () => {
    const result = getSessionDisplay('CLOSED');
    expect(result.label).toBe('CLOSED');
    expect(result.description).toBe('Market Closed');
  });

  it('defaults to CLOSED for undefined', () => {
    const result = getSessionDisplay(undefined);
    expect(result.label).toBe('CLOSED');
  });
});

describe('getLocalTzAbbr', () => {
  it('returns a non-empty string', () => {
    const tz = getLocalTzAbbr();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});
