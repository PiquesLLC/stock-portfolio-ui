import { describe, it, expect } from 'vitest';
import { runDCF, deriveDefaults, fairValueRange, sensitivityGrid } from './DCFCalculator';
import type { FundamentalsResponse } from '../types';

/* ─── fixture ──────────────────────────────────────────────────────── */

interface FixtureOpts {
  revenues?: number[];        // newest first, as the API returns them
  netIncomes?: number[];
  freeCashFlows?: number[];
  interestExpenses?: (number | null)[];
  debt?: number;
  cash?: number;
  beta?: number | null;
  marketCap?: number;
  riskFreeRate?: number | null;
  sector?: string;
}

function fundamentals(o: FixtureOpts = {}): FundamentalsResponse {
  const revenues = o.revenues ?? [1000, 1000];
  const dates = revenues.map((_, i) => `202${5 - i}-12-31`);
  return {
    ticker: 'TEST',
    overview: {
      sector: o.sector ?? 'Technology',
      beta: o.beta === undefined ? 1.0 : o.beta,
      marketCap: o.marketCap ?? 10_000,
      revenueTTM: revenues[0],
      sharesOutstanding: 100,
    },
    incomeStatements: {
      annual: revenues.map((rev, i) => ({
        fiscalDateEnding: dates[i],
        period: 'annual',
        totalRevenue: rev,
        netIncome: o.netIncomes?.[i] ?? null,
        interestExpense: o.interestExpenses ? o.interestExpenses[i] : null,
      })),
      quarterly: [],
    },
    balanceSheets: {
      annual: dates.map(d => ({
        fiscalDateEnding: d,
        period: 'annual',
        longTermDebt: o.debt ?? 0,
        currentDebt: 0,
        cashAndEquivalents: o.cash ?? 0,
      })),
      quarterly: [],
    },
    cashFlows: {
      annual: dates.map((d, i) => ({
        fiscalDateEnding: d,
        period: 'annual',
        freeCashFlow: o.freeCashFlows?.[i] ?? 150,
      })),
      quarterly: [],
    },
    riskFreeRate: o.riskFreeRate === undefined ? null : o.riskFreeRate,
    lastUpdated: '',
    dataAge: 'fresh',
  } as unknown as FundamentalsResponse;
}

/* ─── the model itself ─────────────────────────────────────────────── */

describe('runDCF', () => {
  it('matches a DCF worked by hand', () => {
    // Growth fades 10% -> terminal 2% across the two projection years:
    //   rev 1100 then 1122 (1100 x 1.02); FCF 220 then 224.4
    //   TV  = 224.4 x 1.02 / (0.10 - 0.02) = 2861.10, a value as at year 2,
    //         so discounted at the FULL exponent: 2861.10/1.21 = 2364.5455
    //   FCFs discount MID-YEAR, i.e. the year-end figures scaled by 1.1^0.5:
    //         (220/1.1 + 224.4/1.21) x 1.1^0.5 = 385.4545 x 1.0488088 = 404.2679
    //   EV 2768.8134, + 100 cash - 50 debt = 2818.8134, over 10 shares
    const r = runDCF({
      revenueGrowth: 0.10, fcfMargin: 0.20, discountRate: 0.10, terminalGrowth: 0.02,
      projectionYears: 2, ttmRevenue: 1000, cash: 100, totalDebt: 50, sharesOutstanding: 10,
    });
    // Written as arithmetic rather than transcribed decimals: the literals (220 and
    // 224.4 from the fade, 1.02/0.08 from Gordon, sqrt for mid-year) are the model
    // stated independently of the implementation, and the fade itself is pinned
    // separately by projectedRevenues below.
    const pvFcf = (220 / 1.1 + 224.4 / 1.21) * Math.sqrt(1.1);  // ~404.27
    const pvTv = (224.4 * 1.02 / 0.08) / 1.21;                  // ~2364.55
    expect(r.projectedRevenues).toEqual([1100, 1122]);
    expect(r.pvProjectedFCFs).toBeCloseTo(pvFcf, 9);
    expect(r.pvTerminalValue).toBeCloseTo(pvTv, 9);
    expect(r.enterpriseValue).toBeCloseTo(pvFcf + pvTv, 9);
    expect(r.equityValue).toBeCloseTo(pvFcf + pvTv + 100 - 50, 9);
    expect(r.fairValuePerShare).toBeCloseTo((pvFcf + pvTv + 50) / 10, 9);
  });

  it('discounts cash flows mid-year, worth exactly a (1+r)^0.5 uplift', () => {
    // Cash arrives across the year, not on 31 December. The whole effect is a
    // clean sqrt(1+r) factor on the projected leg; terminal value is unaffected.
    const base = {
      revenueGrowth: 0, fcfMargin: 0.10, discountRate: 0.10, terminalGrowth: 0,
      projectionYears: 4, ttmRevenue: 1000, cash: 0, totalDebt: 0, sharesOutstanding: 1,
    };
    const r = runDCF(base);
    const yearEnd = [1, 2, 3, 4].reduce((sum, y) => sum + 100 / Math.pow(1.1, y), 0);
    expect(r.pvProjectedFCFs / yearEnd).toBeCloseTo(Math.sqrt(1.1), 12);
    expect(r.pvTerminalValue).toBeCloseTo((100 / 0.10) / Math.pow(1.1, 4), 9);
  });

  it('fades growth to the terminal rate instead of dropping off a cliff', () => {
    // 20% fading to 0 over 5 years => 20, 15, 10, 5, 0 percent.
    const r = runDCF({
      revenueGrowth: 0.20, fcfMargin: 1, discountRate: 0.10, terminalGrowth: 0,
      projectionYears: 5, ttmRevenue: 100, cash: 0, totalDebt: 0, sharesOutstanding: 1,
    });
    expect(r.projectedRevenues[0]).toBeCloseTo(120, 9);
    expect(r.projectedRevenues[1]).toBeCloseTo(138, 9);       // 120 x 1.15
    expect(r.projectedRevenues[2]).toBeCloseTo(151.8, 9);     // 138 x 1.10
    expect(r.projectedRevenues[3]).toBeCloseTo(159.39, 9);    // 151.8 x 1.05
    expect(r.projectedRevenues[4]).toBeCloseTo(159.39, 9);    // x 1.00 — already terminal
    // The old flat-growth model compounded to 100 x 1.2^5 = 248.8.
    expect(r.projectedRevenues[4]).toBeLessThan(200);
  });

  it('gives each year its own exponent rather than one blended factor', () => {
    const r = runDCF({
      revenueGrowth: 0, fcfMargin: 0.10, discountRate: 0.10, terminalGrowth: 0,
      projectionYears: 3, ttmRevenue: 1000, cash: 0, totalDebt: 0, sharesOutstanding: 1,
    });
    // Flat $100 FCF, mid-year: 100/1.1^0.5 + 100/1.1^1.5 + 100/1.1^2.5
    const expected = [0.5, 1.5, 2.5].reduce((s, e) => s + 100 / Math.pow(1.1, e), 0);
    expect(r.pvProjectedFCFs).toBeCloseTo(expected, 9);
    expect(r.pvTerminalValue).toBeCloseTo((100 / 0.10) / 1.331, 9);
  });
});

/* ─── the headline range ───────────────────────────────────────────── */

describe('fairValueRange', () => {
  const base = {
    revenueGrowth: 0.10, fcfMargin: 0.20, discountRate: 0.10, terminalGrowth: 0.02,
    projectionYears: 5, ttmRevenue: 1000, cash: 100, totalDebt: 50, sharesOutstanding: 10,
  };

  it('brackets the base case, and every bound is a cell of the shown grid', () => {
    const range = fairValueRange(base)!;
    const base1 = runDCF(base).fairValuePerShare;
    expect(range.low).toBeLessThan(base1);
    expect(range.high).toBeGreaterThan(base1);
    // The header must never show a number the user can't find in the table.
    const cells = sensitivityGrid(base).flat().filter((v): v is number => v != null);
    expect(cells).toContain(range.low);
    expect(cells).toContain(range.high);
  });

  it('skips grid cells the model refuses rather than reporting a bogus bound', () => {
    // discountRate 0.05 - 2pp = 0.03 vs terminal 0.02 is under the perpetuity floor.
    const tight = { ...base, discountRate: 0.05 };
    expect(sensitivityGrid(tight).flat().some(v => v == null)).toBe(true);
    const range = fairValueRange(tight)!;
    expect(Number.isFinite(range.low)).toBe(true);
    expect(range.high).toBeGreaterThanOrEqual(range.low);
  });
});

/* ─── the inputs, which is where it was wrong ──────────────────────── */

describe('deriveDefaults', () => {
  it('adjusts beta toward 1 (Blume) instead of using the raw regression figure', () => {
    // A raw beta of 2.8 used to give cost of equity 4.2 + 2.8x5.5 = 19.6%, which
    // pinned the discount-rate slider at its 20% ceiling.
    const d = deriveDefaults(fundamentals({ beta: 2.8, riskFreeRate: 0.04 }), 100);
    expect(d.assumptions.rawBeta).toBe(2.8);
    expect(d.assumptions.beta).toBeCloseTo(2.2, 9);          // 2/3 x 2.8 + 1/3
    expect(d.discountRate).toBeCloseTo(0.161, 3);            // 0.04 + 2.2 x 0.055
    expect(d.discountRate).toBeLessThan(0.04 + 2.8 * 0.055); // strictly below the raw figure
  });

  it('caps an absurd beta rather than trusting the data', () => {
    const d = deriveDefaults(fundamentals({ beta: 10 }), 100);
    expect(d.assumptions.beta).toBe(2.5);
  });

  it('anchors on the live 10Y when the API supplies one, else the fallback', () => {
    expect(deriveDefaults(fundamentals({ riskFreeRate: 0.031 }), 100).assumptions.riskFree)
      .toBeCloseTo(0.031, 9);
    expect(deriveDefaults(fundamentals({ riskFreeRate: null }), 100).assumptions.riskFree)
      .toBeCloseTo(0.042, 9);
    // Implausible values are ignored rather than discounted at.
    expect(deriveDefaults(fundamentals({ riskFreeRate: 0.9 }), 100).assumptions.riskFree)
      .toBeCloseTo(0.042, 9);
  });

  it('unlevers free cash flow by adding interest back after tax', () => {
    // CFO - capex is net of interest paid; discounting it at WACC and then
    // subtracting debt would charge the company for its leverage twice.
    const levered = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [null, null],
    }), 100);
    const unlevered = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [40, 40],
    }), 100);
    expect(levered.fcfMargin).toBeCloseTo(0.10, 9);
    expect(levered.assumptions.unlevered).toBe(false);
    // (100 + 40 x 0.79) / 1000 = 0.1316, which deriveDefaults rounds to 3dp.
    expect(unlevered.fcfMargin).toBeCloseTo(0.132, 9);
    expect(unlevered.assumptions.unlevered).toBe(true);
  });

  it('refuses to unlever a bank — interest is its operating cost, not financing', () => {
    // Polygon fills interest_expense_operating for exactly these filers, and their
    // deposits never appear in totalDebt to offset the add-back in the bridge.
    const bank = fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [40, 40], sector: 'Financials',
    });
    const d = deriveDefaults(bank, 100);
    expect(d.assumptions.isFinancial).toBe(true);
    expect(d.assumptions.unlevered).toBe(false);
    expect(d.fcfMargin).toBeCloseTo(0.10, 9);   // levered, not 0.132
  });

  it('ignores interest that is too large to be interest', () => {
    // A mis-scaled or cumulative tag would otherwise run the margin into its clamp,
    // and the margin is the single biggest lever on fair value.
    const d = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [500, 500], debt: 100,
    }), 100);
    expect(d.assumptions.unlevered).toBe(false);
    expect(d.fcfMargin).toBeCloseTo(0.10, 9);
  });

  it('treats negative interest as income, not an expense to add back', () => {
    // The net tag goes negative when a cash-rich company earns more than it pays.
    const d = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [-40, -40],
    }), 100);
    expect(d.assumptions.unlevered).toBe(false);
    expect(d.fcfMargin).toBeCloseTo(0.10, 9);   // NOT 0.132 via Math.abs
  });

  it('only claims "unlevered" when every year could be unlevered', () => {
    // Mixing a levered year and an unlevered year into one average is two
    // definitions in one number, and the panel would still say "Unlevered FCF".
    const d = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [100, 100], interestExpenses: [40, null],
    }), 100);
    expect(d.assumptions.unlevered).toBe(false);
    expect(d.fcfMargin).toBeCloseTo(0.10, 9);
  });

  it('takes cost of debt from interest actually paid, not a flat 5%', () => {
    const d = deriveDefaults(fundamentals({ debt: 1000, interestExpenses: [80, 80] }), 100);
    expect(d.assumptions.preTaxCostOfDebt).toBeCloseTo(0.08, 9);
    // No interest broken out -> documented fallback.
    expect(deriveDefaults(fundamentals({ debt: 1000 }), 100).assumptions.preTaxCostOfDebt)
      .toBeCloseTo(0.05, 9);
  });

  it('no longer floors the FCF margin at net margin', () => {
    // The discriminating case: a capex-heavy company earning 11% net but
    // converting only 2% to cash used to be valued on the 11%.
    const d = deriveDefaults(fundamentals({
      revenues: [1000, 1000], freeCashFlows: [20, 20], netIncomes: [110, 110],
    }), 100);
    expect(d.fcfMargin).toBeCloseTo(0.02, 9);
  });

  it('keeps the auto discount rate inside the slider it has to render on', () => {
    const d = deriveDefaults(fundamentals({ beta: 10, riskFreeRate: 0.12 }), 100);
    expect(d.discountRate).toBeLessThanOrEqual(0.20);
    expect(d.discountRate).toBeGreaterThanOrEqual(0.04);
  });
});
