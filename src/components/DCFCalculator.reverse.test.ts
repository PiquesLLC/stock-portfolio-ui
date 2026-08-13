import { describe, expect, it } from 'vitest';
import { impliedGrowth, runDCF } from './DCFCalculator';

// A reverse DCF has one job: given today's price, recover the growth rate that
// the forward model would need in order to produce it. So the strongest test is
// a round trip — price the model at a known growth, then check the solver hands
// that growth back.
const BASE = {
  revenueGrowth: 0.08,
  fcfMargin: 0.15,
  discountRate: 0.09,
  terminalGrowth: 0.025,
  projectionYears: 5,
  ttmRevenue: 1_000_000_000,
  cash: 100_000_000,
  totalDebt: 200_000_000,
  sharesOutstanding: 100_000_000,
};

const priceAtGrowth = (growth: number, patch: Partial<typeof BASE> = {}) =>
  runDCF({ ...BASE, ...patch, revenueGrowth: growth }).fairValuePerShare;

describe('impliedGrowth — reverse DCF', () => {
  it('recovers the growth rate that produced a given price', () => {
    for (const growth of [-0.1, 0, 0.05, 0.08, 0.25, 0.6]) {
      const price = priceAtGrowth(growth);
      const solved = impliedGrowth(BASE, price);
      expect(solved.outOfRange).toBeNull();
      expect(solved.growth).toBeCloseTo(growth, 5);
    }
  });

  it('works when growth DESTROYS value, not just when it creates it', () => {
    // A business burning cash on every incremental sale is worth less the
    // faster it grows. Cash-rich and lightly burning, so equity stays positive
    // while falling as growth rises — a solver that assumed the usual direction
    // would walk the wrong way.
    const burning = { fcfMargin: -0.02, cash: 3_000_000_000, totalDebt: 0 };
    expect(priceAtGrowth(0.5, burning)).toBeLessThan(priceAtGrowth(0.05, burning));

    const price = priceAtGrowth(0.3, burning);
    expect(price).toBeGreaterThan(0);
    const solved = impliedGrowth({ ...BASE, ...burning }, price);
    expect(solved.outOfRange).toBeNull();
    expect(solved.growth).toBeCloseTo(0.3, 5);
  });

  it('declines when no growth rate can justify the price, rather than inventing one', () => {
    // A company the model values negatively at every growth rate cannot explain
    // a positive share price. Saying so is the honest output.
    const solved = impliedGrowth({ ...BASE, fcfMargin: -0.1 }, 25);
    expect(solved.growth).toBeNull();
    expect(solved.outOfRange).toBe('above');
  });

  it('reports out-of-range rather than pinning to the bracket edge', () => {
    // A pinned number reads as a real answer. "> 100%" is honest; "100.0%" is
    // a fabrication that happens to sit at our search boundary.
    const tooRich = impliedGrowth(BASE, priceAtGrowth(1.0) * 5);
    expect(tooRich.growth).toBeNull();
    expect(tooRich.outOfRange).toBe('above');

    const tooCheap = impliedGrowth(BASE, priceAtGrowth(-0.5) / 5);
    expect(tooCheap.growth).toBeNull();
    expect(tooCheap.outOfRange).toBe('below');
  });

  it('declines when the perpetuity spread is too thin to model', () => {
    // Gordon Growth divides by (discount - terminal); a hair's gap produces an
    // enormous terminal multiple off a rounding error.
    const solved = impliedGrowth({ ...BASE, discountRate: 0.03, terminalGrowth: 0.025 }, 20);
    expect(solved.growth).toBeNull();
    expect(solved.outOfRange).toBeNull();
  });

  it('declines on a missing or nonsensical price', () => {
    expect(impliedGrowth(BASE, 0).growth).toBeNull();
    expect(impliedGrowth(BASE, -5).growth).toBeNull();
  });

  it('implies higher growth for a higher price, on a cash-generative business', () => {
    const cheap = impliedGrowth(BASE, priceAtGrowth(0.05)).growth as number;
    const dear = impliedGrowth(BASE, priceAtGrowth(0.30)).growth as number;
    expect(dear).toBeGreaterThan(cheap);
  });

  it('is consistent with the forward model it inverts', () => {
    // Feed the solved growth back through runDCF and the price must return.
    const price = 42.5;
    const solved = impliedGrowth(BASE, price);
    expect(solved.growth).not.toBeNull();
    expect(priceAtGrowth(solved.growth as number)).toBeCloseTo(price, 4);
  });
});
