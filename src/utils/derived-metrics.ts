import {
  FundamentalsResponse,
  ParsedBalanceSheet,
  ParsedCashFlow,
  ParsedIncomeStatement,
} from '../types';

/**
 * Valuation ratios derived from data the fundamentals endpoint already returns.
 * Nothing here needs a new upstream call — every input is present in
 * `FundamentalsResponse`.
 *
 * Every field is `null` rather than 0 or NaN when it cannot be computed
 * honestly. A missing input, a non-positive denominator, or a multiple whose
 * sign makes it meaningless all yield `null` so the UI shows an em dash instead
 * of a number a user might act on.
 *
 * Ratios are decimals, not percentages: 0.0456 means 4.56%.
 */
export interface DerivedMetrics {
  priceToSales: number | null;
  /**
   * NOT SAFE TO DISPLAY as things stand — see the note on `evToEbitda` in
   * `computeDerivedMetrics`. Computed and tested so the tile can be turned on
   * the moment the API reports a real D&A figure.
   */
  evToEbitda: number | null;
  priceToBook: number | null;
  fcfYield: number | null;
  fcfPerShare: number | null;
  operatingMargin: number | null;
  revenueGrowthYoY: number | null;
  earningsGrowthYoY: number | null;
  /** Fiscal period ends behind the YoY figures, for labelling (e.g. 2026-06-30). */
  yoyLatestPeriod: string | null;
  yoyComparisonPeriod: string | null;
  enterpriseValue: number | null;
  marketCap: number | null;
  totalDebt: number | null;
  cash: number | null;
  netCash: number | null;
}

const EMPTY: DerivedMetrics = {
  priceToSales: null,
  evToEbitda: null,
  priceToBook: null,
  fcfYield: null,
  fcfPerShare: null,
  operatingMargin: null,
  revenueGrowthYoY: null,
  earningsGrowthYoY: null,
  yoyLatestPeriod: null,
  yoyComparisonPeriod: null,
  enterpriseValue: null,
  marketCap: null,
  totalDebt: null,
  cash: null,
  netCash: null,
};

/** A ratio is only meaningful when the denominator is a positive number. */
function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A quarter is ~91 days. This window accepts 52/53-week and 4-4-5 fiscal
// calendars (which drift about a week) while staying far enough from ~182 days
// that a gap left by a dropped quarter can't pass as a normal one.
const MIN_QUARTER_GAP_MS = 75 * DAY_MS;
const MAX_QUARTER_GAP_MS = 115 * DAY_MS;

export type TtmBasis = 'quarters' | 'annual';
export interface TtmValue {
  value: number;
  /** Which twelve months this covers, so callers can refuse to mix the two. */
  basis: TtmBasis;
}

/** Are these four rows genuinely four consecutive quarters? */
function fourConsecutiveQuarters(rows: { fiscalDateEnding: string }[]): boolean {
  if (rows.length !== 4) return false;
  const times = rows.map(r => Date.parse(r.fiscalDateEnding));
  if (times.some(t => !Number.isFinite(t))) return false;
  for (let i = 0; i < times.length - 1; i++) {
    const gap = times[i] - times[i + 1]; // newest-first
    if (gap < MIN_QUARTER_GAP_MS || gap > MAX_QUARTER_GAP_MS) return false;
  }
  return true;
}

/**
 * Trailing twelve months from the four most recent quarters.
 *
 * Requires all four to be present AND to actually be consecutive quarters.
 * Summing three would silently understate the year and flatter every margin
 * built on it; summing four rows that straddle a dropped quarter would cover
 * fifteen months while claiming to cover twelve. Falls back to the latest
 * annual, which is a true twelve months even if staler — the returned `basis`
 * tells callers which they got.
 */
export function sumTtm<T extends { fiscalDateEnding: string }>(
  quarterly: T[],
  annual: T[],
  pick: (row: T) => number | null,
): TtmValue | null {
  const rows = quarterly.slice(0, 4);
  const values = rows.map(pick);
  if (
    rows.length === 4 &&
    fourConsecutiveQuarters(rows) &&
    values.every(v => v != null && Number.isFinite(v))
  ) {
    return { value: (values as number[]).reduce((sum, v) => sum + v, 0), basis: 'quarters' };
  }
  const latestAnnual = annual.length > 0 ? pick(annual[0]) : null;
  return latestAnnual != null && Number.isFinite(latestAnnual)
    ? { value: latestAnnual, basis: 'annual' }
    : null;
}

const YEAR_MS = 365 * DAY_MS;
const YEAR_AGO_TOLERANCE_MS = 45 * DAY_MS;

/**
 * The row one year before `rows[0]`, matched by date rather than by index.
 *
 * Indexing four back assumes an unbroken quarterly series. When a provider
 * drops a quarter — which happens — index 4 is five quarters back, and the
 * "YoY" number silently compares the wrong periods.
 *
 * Known gap: a company that changes its fiscal year end emits a short stub
 * period. A 2-month stub falling inside the window would be compared against a
 * 3-month quarter, showing a phantom decline. Rare enough to accept for now.
 */
export function findYearAgo<T extends { fiscalDateEnding: string }>(rows: T[]): T | null {
  if (rows.length < 2) return null;
  const latest = Date.parse(rows[0].fiscalDateEnding);
  if (!Number.isFinite(latest)) return null;
  const target = latest - YEAR_MS;

  let best: T | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of rows.slice(1)) {
    const at = Date.parse(row.fiscalDateEnding);
    if (!Number.isFinite(at)) continue;
    const gap = Math.abs(at - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = row;
    }
  }
  return bestGap <= YEAR_AGO_TOLERANCE_MS ? best : null;
}

/**
 * Year-over-year change against the year-ago quarter.
 *
 * Returns `null` when the base is zero or negative. A swing from -$10m to
 * +$5m is a real turnaround, but "+150%" describes it in a way that sorts and
 * compares wrongly against a company that grew 150% from a profit — so we
 * decline to express it as a percentage at all.
 */
function yoyChange(latest: number | null, yearAgo: number | null): number | null {
  if (latest == null || yearAgo == null) return null;
  if (!Number.isFinite(latest) || !Number.isFinite(yearAgo)) return null;
  if (yearAgo <= 0) return null;
  return (latest - yearAgo) / yearAgo;
}

/** Latest balance-sheet row, preferring the more recent quarterly filing. */
function latestBalance(sheets: { annual: ParsedBalanceSheet[]; quarterly: ParsedBalanceSheet[] }): ParsedBalanceSheet | null {
  return sheets.quarterly[0] ?? sheets.annual[0] ?? null;
}

export function computeDerivedMetrics(
  data: FundamentalsResponse | null,
  currentPrice?: number | null,
): DerivedMetrics {
  if (!data) return EMPTY;

  const overview = data.overview;
  const income: { annual: ParsedIncomeStatement[]; quarterly: ParsedIncomeStatement[] } = data.incomeStatements;
  const cashFlows: { annual: ParsedCashFlow[]; quarterly: ParsedCashFlow[] } = data.cashFlows;
  const balance = latestBalance(data.balanceSheets);

  const price = currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const sharesOutstanding = overview?.sharesOutstanding ?? null;

  // Market cap from the LIVE price where possible. The cached
  // `overview.marketCap` is frozen at fetch time and can be up to a week old,
  // which would quote price-to-sales and FCF yield at a different share price
  // than the one shown beside them (and than price-to-book uses). Share counts
  // drift ~1%/yr; prices drift far more in a week.
  const liveMarketCap = price != null && sharesOutstanding != null && sharesOutstanding > 0
    ? price * sharesOutstanding
    : null;
  const marketCap = liveMarketCap ?? overview?.marketCap ?? null;

  // Revenue on each basis. Both are needed: the ratio against market cap can
  // use whichever twelve months exist, but a margin must not divide one basis
  // by the other (see below).
  const revenueTtm = sumTtm(income.quarterly, income.annual, r => r.totalRevenue);
  // Prefer OUR validated figure over the server's `revenueTTM`. The server sums
  // the four newest filings with no consecutiveness check, so in exactly the
  // case `sumTtm` refuses — a dropped quarter, or an amended filing duplicating
  // one — its number spans fifteen months or double-counts. Using it there
  // would inflate the denominator and understate price-to-sales, and would put
  // this tile on a different revenue base than the operating margin beside it.
  const revenueForSales = revenueTtm?.value ?? overview?.revenueTTM ?? null;
  const operatingIncomeTtm = sumTtm(income.quarterly, income.annual, r => r.operatingIncome);
  const ebitdaTtm = sumTtm(income.quarterly, income.annual, r => r.ebitda);
  const fcfTtm = sumTtm(cashFlows.quarterly, cashFlows.annual, r => r.freeCashFlow);

  const cash = balance?.cashAndEquivalents ?? null;
  const longTerm = balance?.longTermDebt ?? null;
  const current = balance?.currentDebt ?? null;
  // Treat a reported-absent debt component as zero only when the other is
  // present — a company with no current debt is common, a balance sheet with
  // neither field is just missing data.
  const totalDebt = longTerm == null && current == null ? null : (longTerm ?? 0) + (current ?? 0);

  const enterpriseValue = marketCap != null && totalDebt != null && cash != null
    ? marketCap + totalDebt - cash
    : null;

  const netCash = cash != null && totalDebt != null ? cash - totalDebt : null;

  // EV/EBITDA is suppressed unless BOTH sides are positive. A negative EBITDA
  // inverts the multiple (more negative reads as cheaper), and so does a
  // negative EV — a company holding more net cash than its market cap would
  // otherwise sort as the cheapest thing on the screen.
  //
  // Note the caller must still not display this: the API derives EBITDA as
  // operating income + (operating cash flow - net income) whenever Polygon
  // omits it, and that proxy sweeps in stock comp and working-capital swings,
  // biasing EBITDA high and the multiple low in one direction.
  const evToEbitda = ebitdaTtm != null && ebitdaTtm.value > 0 && enterpriseValue != null && enterpriseValue > 0
    ? safeRatio(enterpriseValue, ebitdaTtm.value)
    : null;

  // Operating margin divides two flows, so both must cover the SAME twelve
  // months. Mixing a TTM revenue with an annual-fallback operating income
  // produces a margin that matches no real period and is materially wrong for
  // any company that grew or shrank across the gap.
  let operatingMargin: number | null = null;
  if (operatingIncomeTtm != null && revenueTtm != null) {
    if (operatingIncomeTtm.basis === revenueTtm.basis) {
      operatingMargin = safeRatio(operatingIncomeTtm.value, revenueTtm.value);
    } else {
      // Bases disagree — but both figures exist on the same annual filing, so
      // retry there rather than dropping a margin we can state honestly.
      const annualRow = income.annual[0];
      operatingMargin = annualRow
        ? safeRatio(annualRow.operatingIncome, annualRow.totalRevenue)
        : null;
    }
  }

  const latestQuarter = income.quarterly[0] ?? null;
  const yearAgoQuarter = findYearAgo(income.quarterly);

  return {
    priceToSales: safeRatio(marketCap, revenueForSales),
    evToEbitda,
    // Polygon reports book value per share (equity / shares outstanding), so
    // this pairs directly with price.
    priceToBook: safeRatio(price, overview?.bookValue ?? null),
    fcfYield: safeRatio(fcfTtm?.value ?? null, marketCap),
    fcfPerShare: safeRatio(fcfTtm?.value ?? null, sharesOutstanding),
    operatingMargin,
    revenueGrowthYoY: yoyChange(latestQuarter?.totalRevenue ?? null, yearAgoQuarter?.totalRevenue ?? null),
    earningsGrowthYoY: yoyChange(latestQuarter?.netIncome ?? null, yearAgoQuarter?.netIncome ?? null),
    yoyLatestPeriod: yearAgoQuarter ? latestQuarter?.fiscalDateEnding ?? null : null,
    yoyComparisonPeriod: yearAgoQuarter?.fiscalDateEnding ?? null,
    enterpriseValue,
    marketCap,
    totalDebt,
    cash,
    netCash,
  };
}
