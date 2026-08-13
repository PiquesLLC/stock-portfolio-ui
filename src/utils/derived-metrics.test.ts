import { describe, expect, it } from 'vitest';
import { computeDerivedMetrics, findYearAgo, sumTtm } from './derived-metrics';
import {
  FundamentalsResponse,
  ParsedBalanceSheet,
  ParsedCashFlow,
  ParsedIncomeStatement,
  ParsedOverview,
} from '../types';

const overview = (patch: Partial<ParsedOverview> = {}): ParsedOverview => ({
  name: 'Test Co', description: '', sector: '', industry: '',
  marketCap: 2_770_000_000, peRatio: 67.41, pegRatio: null, eps: null,
  forwardPE: 27.61, profitMargin: 0.0984, returnOnEquity: null,
  revenueTTM: 416_000_000, dividendYield: null, beta: null,
  analystTargetPrice: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
  bookValue: 6.47, sharesOutstanding: 54_800_000,
  ...patch,
});

const income = (date: string, patch: Partial<ParsedIncomeStatement> = {}): ParsedIncomeStatement => ({
  fiscalDateEnding: date, period: 'quarterly',
  totalRevenue: 100_000_000, grossProfit: null, operatingIncome: 22_130_000,
  netIncome: 9_840_000, ebitda: 28_000_000, researchAndDevelopment: null,
  ...patch,
});

const cash = (date: string, patch: Partial<ParsedCashFlow> = {}): ParsedCashFlow => ({
  fiscalDateEnding: date, period: 'quarterly',
  operatingCashflow: 35_000_000, capitalExpenditures: 3_500_000,
  freeCashFlow: 31_500_000, dividendPayout: null, netIncome: null,
  ...patch,
});

const sheet = (date: string, patch: Partial<ParsedBalanceSheet> = {}): ParsedBalanceSheet => ({
  fiscalDateEnding: date, period: 'quarterly',
  totalAssets: null, totalLiabilities: null, totalShareholderEquity: null,
  cashAndEquivalents: 159_920_000, longTermDebt: 200_000_000, currentDebt: 43_800_000,
  ...patch,
});

// Newest-first, matching what the API returns.
const QUARTER_DATES = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30'];

const response = (patch: Partial<FundamentalsResponse> = {}): FundamentalsResponse => ({
  ticker: 'TEST',
  overview: overview(),
  incomeStatements: { annual: [], quarterly: QUARTER_DATES.map(d => income(d)) },
  balanceSheets: { annual: [], quarterly: [sheet('2026-06-30')] },
  cashFlows: { annual: [], quarterly: QUARTER_DATES.map(d => cash(d)) },
  lastUpdated: '2026-08-12T00:00:00Z',
  dataAge: 'fresh',
  ...patch,
});

describe('sumTtm', () => {
  it('sums the four most recent quarters and reports the basis', () => {
    const rows = QUARTER_DATES.map(d => income(d, { totalRevenue: 10 }));
    expect(sumTtm(rows, [], r => r.totalRevenue)).toEqual({ value: 40, basis: 'quarters' }); // four, not all five
  });

  it('falls back to the latest annual rather than under-counting a partial year', () => {
    const threeQuarters = QUARTER_DATES.slice(0, 3).map(d => income(d, { totalRevenue: 10 }));
    const annual = [income('2025-12-31', { period: 'annual', totalRevenue: 95 })];
    expect(sumTtm(threeQuarters, annual, r => r.totalRevenue)).toEqual({ value: 95, basis: 'annual' });
  });

  it('falls back when any of the four quarters is null — a 3-quarter sum would flatter every margin', () => {
    const rows = QUARTER_DATES.map((d, i) => income(d, { totalRevenue: i === 2 ? null : 10 }));
    const annual = [income('2025-12-31', { period: 'annual', totalRevenue: 95 })];
    expect(sumTtm(rows, annual, r => r.totalRevenue)).toEqual({ value: 95, basis: 'annual' });
  });

  it('refuses four rows that straddle a dropped quarter — fifteen months is not a TTM', () => {
    // Mar 2026 missing: these four span Jun'25 -> Jun'26.
    const rows = ['2026-06-30', '2025-12-31', '2025-09-30', '2025-06-30'].map(d => income(d, { totalRevenue: 10 }));
    const annual = [income('2025-12-31', { period: 'annual', totalRevenue: 95 })];
    expect(sumTtm(rows, annual, r => r.totalRevenue)).toEqual({ value: 95, basis: 'annual' });
  });

  it('accepts 4-4-5 fiscal drift', () => {
    const rows = ['2026-06-27', '2026-03-28', '2025-12-27', '2025-09-27'].map(d => income(d, { totalRevenue: 10 }));
    expect(sumTtm(rows, [], r => r.totalRevenue)?.basis).toBe('quarters');
  });

  it('returns null when there is neither a full four quarters nor an annual', () => {
    expect(sumTtm([income('2026-06-30')], [], r => r.totalRevenue)).toBeNull();
  });
});

describe('findYearAgo', () => {
  it('matches the quarter one year back', () => {
    const rows = QUARTER_DATES.map(d => income(d));
    expect(findYearAgo(rows)?.fiscalDateEnding).toBe('2025-06-30');
  });

  it('tolerates fiscal-calendar drift', () => {
    const rows = [income('2026-06-27'), income('2026-03-28'), income('2025-12-27'), income('2025-09-27'), income('2025-07-04')];
    expect(findYearAgo(rows)?.fiscalDateEnding).toBe('2025-07-04'); // 7 days of drift
  });

  it('returns null when the year-ago quarter is missing rather than silently using the wrong one', () => {
    // 2025-06-30 absent — index 4 would hand back 2025-03-31, five quarters back.
    const rows = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-03-31'].map(d => income(d));
    expect(findYearAgo(rows)).toBeNull();
  });

  it('returns null for a single row', () => {
    expect(findYearAgo([income('2026-06-30')])).toBeNull();
  });
});

describe('computeDerivedMetrics', () => {
  it('computes the valuation block from data already on hand', () => {
    const m = computeDerivedMetrics(response(), 50.55);

    // 54.8m shares x $50.55 / revenueTTM 416m
    expect(m.priceToSales).toBeCloseTo(6.66, 2);
    // price 50.55 / bookValue 6.47
    expect(m.priceToBook).toBeCloseTo(7.81, 2);
    // cap + 243.8m debt - 159.92m cash
    expect(m.enterpriseValue).toBeCloseTo(2_854_020_000, 0);
    expect(m.totalDebt).toBe(243_800_000);
    expect(m.netCash).toBe(-83_880_000);
    // EV / (4 x 28m EBITDA)
    expect(m.evToEbitda).toBeCloseTo(25.48, 2);
    // 4 x 22.13m operating income / 4 x 100m revenue — both on the quarterly
    // basis, never the overview TTM against a statement numerator
    expect(m.operatingMargin).toBeCloseTo(0.2213, 4);
    // 4 x 31.5m FCF / 2.77b
    expect(m.fcfYield).toBeCloseTo(0.0455, 3);
    expect(m.fcfPerShare).toBeCloseTo(2.299, 2);
  });

  it('reports YoY growth against the year-ago quarter, not an adjacent one', () => {
    // Intervening quarters carry distinct revenues, so picking the wrong
    // comparison row changes the answer and fails the assertion.
    const quarterly = [
      income('2026-06-30', { totalRevenue: 112_170_000, netIncome: 13_685_000 }),
      income('2026-03-31', { totalRevenue: 108_000_000 }),
      income('2025-12-31', { totalRevenue: 105_000_000 }),
      income('2025-09-30', { totalRevenue: 102_000_000 }),
      income('2025-06-30', { totalRevenue: 100_000_000, netIncome: 10_000_000 }),
    ];
    const m = computeDerivedMetrics(response({ incomeStatements: { annual: [], quarterly } }), 50.55);
    expect(m.revenueGrowthYoY).toBeCloseTo(0.1217, 4);
    expect(m.earningsGrowthYoY).toBeCloseTo(0.3685, 4);
    expect(m.yoyLatestPeriod).toBe('2026-06-30');
    expect(m.yoyComparisonPeriod).toBe('2025-06-30');
  });

  it('prices ratios off the LIVE price, not a market cap that may be a week stale', () => {
    // Cached cap says $2.52b (written when the stock was $46); shares x live
    // price says $2.77b. Every cap-based ratio must use the latter, so the grid
    // is self-consistent with the price shown beside it.
    const m = computeDerivedMetrics(response({ overview: overview({ marketCap: 2_520_000_000 }) }), 50.55);
    expect(m.marketCap).toBeCloseTo(2_770_140_000, 0);
    expect(m.priceToSales).toBeCloseTo(6.66, 2);
    // The FCF yield must equal its own displayed sub-line, fcfPerShare / price.
    expect(m.fcfYield).toBeCloseTo((m.fcfPerShare as number) / 50.55, 6);
  });

  it('falls back to the reported market cap when shares or price are missing', () => {
    const m = computeDerivedMetrics(response({ overview: overview({ sharesOutstanding: null }) }), 50.55);
    expect(m.marketCap).toBe(2_770_000_000);
  });

  it('will not divide one twelve-month basis by another', () => {
    // Operating income falls back to annual (a null quarter), while revenue
    // still has four clean quarters. A margin across the two matches no period.
    const quarterly = QUARTER_DATES.map((d, i) => income(d, { operatingIncome: i === 1 ? null : 22_130_000 }));
    const annual = [income('2025-12-31', { period: 'annual', operatingIncome: 60_000_000, totalRevenue: 330_000_000 })];
    const m = computeDerivedMetrics(response({ incomeStatements: { annual, quarterly } }), 50.55);
    expect(m.operatingMargin).toBeNull();
  });

  it('computes a margin on a consistent annual basis when both sides fall back', () => {
    const quarterly: ReturnType<typeof income>[] = [];
    const annual = [income('2025-12-31', { period: 'annual', operatingIncome: 60_000_000, totalRevenue: 330_000_000 })];
    const m = computeDerivedMetrics(response({ incomeStatements: { annual, quarterly } }), 50.55);
    expect(m.operatingMargin).toBeCloseTo(0.1818, 4);
  });

  it('suppresses EV/EBITDA when net cash exceeds market cap', () => {
    // EV negative over positive EBITDA would render as the cheapest multiple
    // on the screen.
    const m = computeDerivedMetrics(
      response({
        overview: overview({ sharesOutstanding: null, marketCap: 500_000_000 }),
        balanceSheets: { annual: [], quarterly: [sheet('2026-06-30', { cashAndEquivalents: 900_000_000, longTermDebt: 50_000_000, currentDebt: 0 })] },
      }),
      50.55,
    );
    expect(m.enterpriseValue).toBeLessThan(0);
    expect(m.evToEbitda).toBeNull();
  });

  it('declines to express growth from a loss as a percentage', () => {
    const quarterly = [
      income('2026-06-30', { netIncome: 5_000_000 }),
      income('2026-03-31'), income('2025-12-31'), income('2025-09-30'),
      income('2025-06-30', { netIncome: -10_000_000 }),
    ];
    const m = computeDerivedMetrics(response({ incomeStatements: { annual: [], quarterly } }), 50.55);
    // -10m -> +5m is a real turnaround, but "+150%" sorts against genuine
    // growth as though it were comparable.
    expect(m.earningsGrowthYoY).toBeNull();
  });

  it('suppresses multiples whose sign makes them meaningless', () => {
    const quarterly = QUARTER_DATES.map(d => income(d, { ebitda: -5_000_000 }));
    const m = computeDerivedMetrics(
      response({ incomeStatements: { annual: [], quarterly }, overview: overview({ bookValue: -2.5 }) }),
      50.55,
    );
    // A more negative EBITDA would otherwise read as a "cheaper" multiple.
    expect(m.evToEbitda).toBeNull();
    expect(m.priceToBook).toBeNull();
  });

  it('keeps a negative FCF yield, which is informative rather than meaningless', () => {
    const quarterly = QUARTER_DATES.map(d => cash(d, { freeCashFlow: -10_000_000 }));
    const m = computeDerivedMetrics(response({ cashFlows: { annual: [], quarterly } }), 50.55);
    expect(m.fcfYield).toBeCloseTo(-0.01444, 4);
  });

  it('returns nulls rather than guesses when inputs are absent', () => {
    const m = computeDerivedMetrics(
      response({
        overview: null,
        balanceSheets: { annual: [], quarterly: [] },
        incomeStatements: { annual: [], quarterly: [] },
        cashFlows: { annual: [], quarterly: [] },
      }),
      undefined,
    );
    expect(m.priceToSales).toBeNull();
    expect(m.evToEbitda).toBeNull();
    expect(m.priceToBook).toBeNull();
    expect(m.fcfYield).toBeNull();
    expect(m.operatingMargin).toBeNull();
    expect(m.enterpriseValue).toBeNull();
    expect(m.totalDebt).toBeNull();
  });

  it('distinguishes "no current debt" from "no debt data"', () => {
    const noCurrent = computeDerivedMetrics(
      response({ balanceSheets: { annual: [], quarterly: [sheet('2026-06-30', { currentDebt: null })] } }),
      50.55,
    );
    expect(noCurrent.totalDebt).toBe(200_000_000);

    const noData = computeDerivedMetrics(
      response({ balanceSheets: { annual: [], quarterly: [sheet('2026-06-30', { longTermDebt: null, currentDebt: null })] } }),
      50.55,
    );
    expect(noData.totalDebt).toBeNull();
    expect(noData.enterpriseValue).toBeNull();
  });

  it('needs a live price for price-to-book but not for the rest', () => {
    const m = computeDerivedMetrics(response(), undefined);
    expect(m.priceToBook).toBeNull();
    expect(m.priceToSales).toBeCloseTo(6.66, 2);
    expect(m.fcfYield).toBeCloseTo(0.0455, 3);
  });

  it('handles a null response', () => {
    expect(computeDerivedMetrics(null, 50.55).priceToSales).toBeNull();
  });
});
