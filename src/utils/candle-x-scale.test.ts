import { describe, it, expect } from 'vitest';
import { candleBodyWidth, candleXScale, priceYScale, formatMeasureRange } from './stock-chart';

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

describe('priceYScale', () => {
  const PAD_TOP = 20;
  const PLOT_H = 200;

  describe('linear', () => {
    const at = priceYScale(PAD_TOP, PLOT_H, 100, 200, false);

    it('maps the bounds to the plot edges', () => {
      expect(at(200)).toBeCloseTo(PAD_TOP, 9);              // top
      expect(at(100)).toBeCloseTo(PAD_TOP + PLOT_H, 9);     // bottom
    });

    it('puts the arithmetic midpoint in the middle', () => {
      expect(at(150)).toBeCloseTo(PAD_TOP + PLOT_H / 2, 9);
    });
  });

  describe('logarithmic', () => {
    const at = priceYScale(PAD_TOP, PLOT_H, 1, 10_000, true);

    it('maps the bounds to the plot edges', () => {
      expect(at(10_000)).toBeCloseTo(PAD_TOP, 9);
      expect(at(1)).toBeCloseTo(PAD_TOP + PLOT_H, 9);
    });

    it('puts the GEOMETRIC midpoint in the middle', () => {
      // The whole point: 100 is the middle of 1..10,000 on a log axis, where
      // linearly it would sit at 1% of the height and be unreadable.
      expect(at(100)).toBeCloseTo(PAD_TOP + PLOT_H / 2, 9);
      const linear = priceYScale(PAD_TOP, PLOT_H, 1, 10_000, false);
      expect(linear(100)).toBeGreaterThan(PAD_TOP + PLOT_H * 0.95);
    });

    it('gives equal space to equal percentage moves', () => {
      // 1->10 and 1000->10000 are both 10x, so both must span a quarter.
      const decade1 = at(1) - at(10);
      const decade4 = at(1000) - at(10_000);
      expect(decade1).toBeCloseTo(decade4, 9);
      expect(decade1).toBeCloseTo(PLOT_H / 4, 9);
    });

    it('clamps non-positive prices instead of returning NaN', () => {
      // One bad tick must not blank the entire chart.
      for (const p of [0, -5, -0.0001]) {
        expect(Number.isFinite(at(p)), `price ${p}`).toBe(true);
      }
    });

    it('falls back to linear when the bounds cannot be logged', () => {
      // A negative lower bound is exactly what linear's additive padding
      // produces on a wide range, so this path is reachable.
      const bad = priceYScale(PAD_TOP, PLOT_H, -10, 100, true);
      expect(bad(100)).toBeCloseTo(PAD_TOP, 9);
      expect(bad(-10)).toBeCloseTo(PAD_TOP + PLOT_H, 9);
    });

    it('is monotonically decreasing in y as price rises', () => {
      let prev = Infinity;
      for (const p of [1, 5, 25, 250, 2500, 10_000]) {
        const y = at(p);
        expect(y).toBeLessThan(prev);
        prev = y;
      }
    });
  });
});

describe('formatMeasureRange', () => {
  // The reported bug: measuring from 2018 to today rendered
  // "Dec 28, 2018 -> Aug 7" — one end carrying a year, the other not, leaving
  // the reader to guess which year the end sat in.
  const NOW = new Date('2026-08-20T12:00:00');
  const d = (iso: string) => new Date(iso).getTime();

  it('puts the year on BOTH ends when the range spans years', () => {
    const r = formatMeasureRange(d('2018-12-28T12:00:00'), d('2026-08-07T12:00:00'), NOW);
    expect(r.start).toContain('2018');
    expect(r.end).toContain('2026');
  });

  it('omits the year on both ends inside the current year', () => {
    const r = formatMeasureRange(d('2026-03-02T12:00:00'), d('2026-08-07T12:00:00'), NOW);
    expect(r.start).not.toMatch(/20\d\d/);
    expect(r.end).not.toMatch(/20\d\d/);
  });

  it('never carries a year on one end only', () => {
    // The actual defect. Whatever the range, both ends must agree.
    const ranges: [string, string][] = [
      ['2018-12-28T12:00:00', '2026-08-07T12:00:00'],
      ['2025-12-31T12:00:00', '2026-01-02T12:00:00'],
      ['2026-01-02T12:00:00', '2026-08-07T12:00:00'],
      ['2024-05-01T12:00:00', '2024-09-01T12:00:00'],
    ];
    for (const [a, b] of ranges) {
      const r = formatMeasureRange(d(a), d(b), NOW);
      const startHasYear = /20\d\d/.test(r.start);
      const endHasYear = /20\d\d/.test(r.end);
      expect(startHasYear, `${a} -> ${b}`).toBe(endHasYear);
    }
  });

  it('carries the year when both ends share a PAST year', () => {
    const r = formatMeasureRange(d('2024-05-01T12:00:00'), d('2024-09-01T12:00:00'), NOW);
    expect(r.start).toContain('2024');
    expect(r.end).toContain('2024');
  });

  it('shows times, not dates, within a single day (the 1D chart)', () => {
    const r = formatMeasureRange(d('2026-08-20T09:45:00'), d('2026-08-20T14:30:00'), NOW);
    expect(r.start).toMatch(/\d{1,2}:\d{2}/);
    expect(r.end).toMatch(/\d{1,2}:\d{2}/);
    expect(r.start).not.toMatch(/Aug/);
  });

  it('returns empty strings on unparseable input rather than "Invalid Date"', () => {
    expect(formatMeasureRange(NaN, d('2026-08-07T12:00:00'), NOW)).toEqual({ start: '', end: '' });
  });
});
