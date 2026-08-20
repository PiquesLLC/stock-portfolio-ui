import { describe, it, expect } from 'vitest';
import { candleBodyWidth, candleXScale } from './stock-chart';

/**
 * The invariant this whole helper exists for: a candle is drawn CENTRED on its
 * x, so the first and last bodies must fall entirely inside the plot. With a
 * plain point scale (first at the left edge, last at the right edge) each was
 * sliced in half — visible on the AAPL MAX chart, 2026-08-20.
 */
describe('candleXScale — end candles fit inside the plot', () => {
  const PAD_LEFT = 0;

  // Real-world shapes: a full MAX history, a 5-session week, a single bar.
  const cases = [
    { plotW: 1200, count: 500 },
    { plotW: 1200, count: 34 },
    { plotW: 1200, count: 2 },
    { plotW: 320, count: 120 },
    { plotW: 320, count: 3 },
    { plotW: 800, count: 1 },
  ];

  for (const { plotW, count } of cases) {
    it(`keeps both end bodies within bounds (plotW=${plotW}, n=${count})`, () => {
      const scale = candleXScale(PAD_LEFT, plotW, count);
      const half = candleBodyWidth(plotW, count) / 2;

      const firstX = scale.atIndex(0, count);
      const lastX = scale.atIndex(count - 1, count);

      // Left edge of the first body, right edge of the last — both inside.
      expect(firstX - half).toBeGreaterThanOrEqual(PAD_LEFT - 1e-9);
      expect(lastX + half).toBeLessThanOrEqual(PAD_LEFT + plotW + 1e-9);
    });
  }

  it('is exactly the reported half-body inset at each end', () => {
    const scale = candleXScale(0, 1000, 50);
    expect(scale.atIndex(0, 50)).toBeCloseTo(scale.halfBody, 9);
    expect(scale.atIndex(49, 50)).toBeCloseTo(1000 - scale.halfBody, 9);
  });

  it('still spans nearly the whole plot — an inset, not a squeeze', () => {
    // Sanity: the fix must not visibly shrink the chart. bodyW caps at 20, so
    // the most it can ever pull in is 10px per side.
    const scale = candleXScale(0, 1200, 300);
    const span = scale.atIndex(299, 300) - scale.atIndex(0, 300);
    expect(span).toBeGreaterThan(1200 - 21);
  });

  it('centres a lone candle', () => {
    const scale = candleXScale(0, 800, 1);
    expect(scale.atIndex(0, 1)).toBeCloseTo(400, 9);
  });

  it('honours a non-zero left pad', () => {
    const scale = candleXScale(40, 1000, 25);
    expect(scale.atIndex(0, 25)).toBeCloseTo(40 + scale.halfBody, 9);
    expect(scale.atIndex(24, 25)).toBeCloseTo(40 + 1000 - scale.halfBody, 9);
  });

  it('maps ratios monotonically across the inset range', () => {
    const scale = candleXScale(0, 1000, 100);
    expect(scale.at(0)).toBeLessThan(scale.at(0.5));
    expect(scale.at(0.5)).toBeLessThan(scale.at(1));
    expect(scale.at(0)).toBeCloseTo(scale.halfBody, 9);
    expect(scale.at(1)).toBeCloseTo(1000 - scale.halfBody, 9);
  });

  it('does not divide by zero on a degenerate plot', () => {
    const scale = candleXScale(0, 0, 10);
    expect(Number.isFinite(scale.atIndex(0, 10))).toBe(true);
    expect(Number.isFinite(scale.at(1))).toBe(true);
  });
});

describe('candleBodyWidth', () => {
  it('caps at 20px so a sparse chart does not draw slabs', () => {
    expect(candleBodyWidth(1200, 2)).toBe(20);
  });

  it('never goes below 1px so a dense chart still renders', () => {
    expect(candleBodyWidth(300, 5000)).toBe(1);
  });

  it('is 65% of the slot in between', () => {
    expect(candleBodyWidth(1000, 100)).toBeCloseTo(6.5, 9);
  });

  it('survives a zero count', () => {
    expect(candleBodyWidth(1000, 0)).toBe(20);
  });
});
