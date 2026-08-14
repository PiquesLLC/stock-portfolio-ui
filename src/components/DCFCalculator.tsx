import { useState, useMemo } from 'react';
import { FundamentalsResponse } from '../types';

/* ─── Helpers ──────────────────────────────────────────────────────── */

function fmt(n: number | null): string {
  if (n == null) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/* ─── Valuation assumptions ────────────────────────────────────────── */

const TAX_RATE = 0.21;                 // US statutory, for unlevering FCF and the debt shield
const EQUITY_RISK_PREMIUM = 0.055;     // ~Damodaran implied ERP
const FALLBACK_RISK_FREE = 0.042;      // only when the API can't supply the live 10Y
const FALLBACK_COST_OF_DEBT = 0.05;    // only when interest expense isn't broken out
const BETA_FLOOR = 0.5;                // sanity bounds on the adjusted beta — these
const BETA_CAP = 2.5;                  // catch bad data, not genuine volatility
const WACC_MIN = 0.05;                 // must match the Discount Rate slider's range,
const WACC_MAX = 0.20;                 // or AUTO can point off the end of the track
// Minimum discount-to-terminal spread. Gordon Growth divides by that gap, so a thin
// one produces an enormous terminal multiple off a rounding error: at the old 0.5pp
// guard, a 4% WACC against 2.5% terminal growth valued the terminal year at ~68x.
const MIN_PERPETUITY_SPREAD = 0.02;

/* ─── DCF Math ─────────────────────────────────────────────────────── */

interface DCFInputs {
  revenueGrowth: number;   // decimal, e.g. 0.08 = 8%
  fcfMargin: number;       // decimal
  discountRate: number;    // decimal (WACC)
  terminalGrowth: number;  // decimal
  projectionYears: number; // 5-10
  ttmRevenue: number;
  cash: number;
  totalDebt: number;
  sharesOutstanding: number;
}

interface DCFResult {
  projectedFCFs: number[];
  projectedRevenues: number[];
  terminalValue: number;
  pvProjectedFCFs: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
}

export function runDCF(inputs: DCFInputs): DCFResult {
  const { revenueGrowth, fcfMargin, discountRate, terminalGrowth, projectionYears,
    ttmRevenue, cash, totalDebt, sharesOutstanding } = inputs;

  const projectedRevenues: number[] = [];
  const projectedFCFs: number[] = [];
  let rev = ttmRevenue;

  // Growth FADES linearly from the starting rate to the terminal rate across the
  // projection. Holding the opening rate flat and then dropping to terminal growth
  // in the very next year is the aggressive version: at 17% for ten years revenue
  // compounds ~5x and every one of those years is worth more than the terminal
  // value it precedes. Fading also removes the discontinuity at the handover — by
  // the final year the company is already growing at the perpetuity rate, which is
  // the assumption Gordon Growth makes about the cash flow it is handed.
  for (let y = 1; y <= projectionYears; y++) {
    const g = projectionYears > 1
      ? revenueGrowth + (terminalGrowth - revenueGrowth) * ((y - 1) / (projectionYears - 1))
      : revenueGrowth;
    rev = rev * (1 + g);
    projectedRevenues.push(rev);
    projectedFCFs.push(rev * fcfMargin);
  }

  // Terminal value (Gordon Growth)
  const finalFCF = projectedFCFs[projectedFCFs.length - 1];
  const tv = finalFCF * (1 + terminalGrowth) / (discountRate - terminalGrowth);

  // Discount to present on the MID-YEAR convention: a company earns its cash flow
  // across the year, not in a lump on 31 December. Discounting each year at its full
  // exponent assumes the latter and understates value by roughly (1+r)^0.5 — 5-9% at
  // these rates, every year, systematically. Banks use mid-year as standard for
  // exactly this reason. The terminal value is a value AS AT year N, so it keeps the
  // full exponent.
  let pvFCFs = 0;
  for (let y = 0; y < projectionYears; y++) {
    pvFCFs += projectedFCFs[y] / Math.pow(1 + discountRate, y + 0.5);
  }
  const pvTV = tv / Math.pow(1 + discountRate, projectionYears);

  const ev = pvFCFs + pvTV;
  const equity = ev + cash - totalDebt;
  const fairValue = sharesOutstanding > 0 ? equity / sharesOutstanding : 0;

  return {
    projectedFCFs,
    projectedRevenues,
    terminalValue: tv,
    pvProjectedFCFs: pvFCFs,
    pvTerminalValue: pvTV,
    enterpriseValue: ev,
    equityValue: equity,
    fairValuePerShare: fairValue,
  };
}

/* ─── Derive defaults from data ────────────────────────────────────── */

export function deriveDefaults(data: FundamentalsResponse, currentPrice: number) {
  const annualIS = data.incomeStatements.annual;
  const annualCF = data.cashFlows.annual;
  const annualBS = data.balanceSheets.annual;
  const overview = data.overview;

  // TTM revenue
  const ttmRevenue = overview?.revenueTTM ?? annualIS[0]?.totalRevenue ?? 0;

  // Revenue CAGR (oldest to newest annual)
  let revenueGrowth = 0.08; // fallback 8%
  // The realized CAGR BEFORE clamping. The clamp below exists to keep the AUTO
  // value on the slider's track, which is right for a default and wrong for a
  // statement about the past — a 65% grower must not be reported as having
  // "delivered 40%". Null when there isn't enough history to measure one.
  let historicalRevenueCagr: number | null = null;
  const sortedIS = [...annualIS].reverse(); // oldest first
  if (sortedIS.length >= 2) {
    const oldest = sortedIS[0]?.totalRevenue;
    const newest = sortedIS[sortedIS.length - 1]?.totalRevenue;
    if (oldest && newest && oldest > 0 && newest > 0) {
      const years = sortedIS.length - 1;
      revenueGrowth = Math.pow(newest / oldest, 1 / years) - 1;
      historicalRevenueCagr = revenueGrowth;
    }
  }
  // Clamp to reasonable range
  revenueGrowth = Math.max(-0.10, Math.min(0.40, revenueGrowth));

  // ── Capital structure (needed before cash flow, to sanity-check interest) ──
  const latestBS = annualBS[0];
  const totalDebt = (latestBS?.longTermDebt ?? 0) + (latestBS?.currentDebt ?? 0);
  const cash = latestBS?.cashAndEquivalents ?? 0;
  const debtOf = (bs?: { longTermDebt: number | null; currentDebt: number | null }) =>
    (bs?.longTermDebt ?? 0) + (bs?.currentDebt ?? 0);
  const avgDebt = annualBS.length >= 2
    ? (debtOf(annualBS[0]) + debtOf(annualBS[1])) / 2
    : debtOf(annualBS[0]);

  // Banks and insurers book interest as an OPERATING cost — it is the raw material
  // of the business, not financing — and it is precisely those filers who populate
  // the interest tag. Adding it back would inflate cash flow enormously, and their
  // funding (deposits) never appears in totalDebt to offset it in the bridge. An
  // FCFF DCF is the wrong model for them; don't dress one up by unlevering.
  const isFinancial = /financ|bank|insur/i.test(overview?.sector ?? '');

  /**
   * Interest expense we're willing to unlever with, or null. Guards three ways:
   * a negative value on the net tag means interest INCOME (adding it back would
   * inflate cash flow for exactly the cash-rich companies where it is most wrong);
   * a figure large against revenue or against the debt it supposedly services is a
   * mis-scaled or cumulative tag, and it would run straight into the FCF-margin
   * clamp — the single largest lever on fair value.
   */
  const usableInterest = (raw: number | null | undefined, revenue: number): number | null => {
    if (isFinancial || raw == null || !Number.isFinite(raw) || raw <= 0) return null;
    if (revenue > 0 && raw / revenue > 0.25) return null;
    if (avgDebt > 0 && raw / avgDebt > 0.15) return null;
    return raw;
  };

  // ── FCF margin ──────────────────────────────────────────────────────
  // The cash-flow statement's FCF is CFO - capex, which is LEVERED: operating cash
  // flow is already net of interest paid. Discounting that at WACC and then
  // subtracting debt in the equity bridge charges the company for its leverage
  // twice. Institutions discount unlevered FCF, so add the interest burden back
  // after tax — but only when EVERY year can be unlevered, so the average is one
  // consistent definition rather than a blend of two.
  let fcfMargin = 0.15; // fallback
  const leveredMargins: number[] = [];
  const unleveredMargins: number[] = [];
  for (const yr of annualIS) {
    const rev = yr.totalRevenue;
    const cf = annualCF.find(c => c.fiscalDateEnding === yr.fiscalDateEnding);
    if (!rev || rev <= 0 || cf?.freeCashFlow == null) continue;
    leveredMargins.push(cf.freeCashFlow / rev);
    const interest = usableInterest(yr.interestExpense, rev);
    if (interest != null) {
      unleveredMargins.push((cf.freeCashFlow + interest * (1 - TAX_RATE)) / rev);
    }
  }
  const unlevered = leveredMargins.length > 0 && unleveredMargins.length === leveredMargins.length;
  const chosenMargins = unlevered ? unleveredMargins : leveredMargins;
  if (chosenMargins.length > 0) {
    fcfMargin = chosenMargins.reduce((a, b) => a + b, 0) / chosenMargins.length;
  }
  // NOTE: this used to be floored at the median net margin, on the theory that a
  // capex-heavy company's long-run FCF should at least match net income. That is a
  // house view, not a valuation method, and it silently inflated fair value for
  // exactly the companies whose capex is the point. Removed 2026-08-11 — which is
  // why a negative margin now has to be caught at the render (see NOT_MEANINGFUL).
  fcfMargin = Math.max(-0.30, Math.min(0.50, fcfMargin));

  // ── WACC ────────────────────────────────────────────────────────────
  // Blume-adjusted beta: regression betas mean-revert toward 1, and desks quote the
  // adjusted figure (it is what Bloomberg's "adjusted beta" reports). Raw betas on
  // volatile names drove cost of equity near 20%, pinning the discount-rate slider
  // at its ceiling and marking almost everything overvalued.
  const rawBeta = overview?.beta ?? 1.0;
  const betaAssumed = overview?.beta == null;
  const beta = Math.min(BETA_CAP, Math.max(BETA_FLOOR, (2 / 3) * rawBeta + (1 / 3)));
  // Live 10Y from the API; the constant is only a fallback for when it's absent.
  const riskFree = data.riskFreeRate != null && data.riskFreeRate > 0 && data.riskFreeRate < 0.25
    ? data.riskFreeRate
    : FALLBACK_RISK_FREE;
  const costOfEquity = riskFree + beta * EQUITY_RISK_PREMIUM;

  const marketCap = overview?.marketCap ?? (currentPrice * (overview?.sharesOutstanding ?? 1));
  const totalCapital = marketCap + totalDebt;
  const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 0.8;
  const debtWeight = 1 - equityWeight;

  // Cost of debt from what the company actually pays — interest expense over
  // average gross debt — rather than a flat 5% assumption. Bounded, because a
  // near-zero debt balance against any interest at all produces nonsense.
  const latestInterest = usableInterest(annualIS[0]?.interestExpense, annualIS[0]?.totalRevenue ?? 0);
  const impliedCostOfDebt = avgDebt > 0 && latestInterest != null ? latestInterest / avgDebt : null;
  const preTaxCostOfDebt = impliedCostOfDebt != null
    ? Math.min(0.15, Math.max(0.01, impliedCostOfDebt))
    : FALLBACK_COST_OF_DEBT;
  const costOfDebt = preTaxCostOfDebt * (1 - TAX_RATE);

  const rawWacc = equityWeight * costOfEquity + debtWeight * costOfDebt;
  // Clamp into the discount-rate slider's own range so AUTO can never land off the
  // end of the track (which is what a 19.2% auto-WACC looked like).
  const wacc = Math.min(WACC_MAX, Math.max(WACC_MIN, rawWacc));
  const waccClamped = Math.abs(wacc - rawWacc) > 1e-9;

  // Derive shares: prefer explicit field, fall back to marketCap / price
  // Sanity check: if shares seem impossibly small vs marketCap, use marketCap/price instead
  const mcapShares = overview?.marketCap && currentPrice > 0 ? Math.round(overview.marketCap / currentPrice) : 0;
  let sharesOutstanding = overview?.sharesOutstanding ?? mcapShares;
  if (sharesOutstanding > 0 && mcapShares > 0) {
    // Shares are >100x smaller OR >100x larger than marketCap implies — likely bad data
    if (sharesOutstanding < mcapShares / 100 || sharesOutstanding > mcapShares * 100) {
      sharesOutstanding = mcapShares;
    }
  }

  return {
    revenueGrowth: Math.round(revenueGrowth * 1000) / 1000,
    fcfMargin: Math.round(fcfMargin * 1000) / 1000,
    discountRate: Math.round(wacc * 1000) / 1000,
    terminalGrowth: 0.025,
    // Ten years, not five. The fade has to have somewhere to happen: compressing a
    // 17% grower down to 2.5% within five years isn't conservatism, it's a different
    // company. A ten-year explicit window is the standard horizon for a growth name,
    // and it keeps growth elevated through the early years where most of the value is.
    projectionYears: 10,
    ttmRevenue,
    cash,
    totalDebt,
    sharesOutstanding,
    historicalRevenueCagr,
    // Surfaced under "Show details" so the discount rate isn't a black box —
    // it is the single input that moves fair value most.
    assumptions: {
      riskFree,
      beta,
      rawBeta,
      betaAssumed,
      preTaxCostOfDebt,
      // True only when the fallback was used — a debt-free company showing a
      // confident "5.0% cost of debt" is the sort of thing this block exists to
      // stop. Same for a clamped WACC presented as if it were computed.
      costOfDebtAssumed: impliedCostOfDebt == null,
      // No usable FCF history at all — the 15% below is invented, not measured, and
      // a valuation built on it should not be shown as if it meant something.
      fcfMarginAssumed: chosenMargins.length === 0,
      riskFreeAssumed: !(data.riskFreeRate != null && data.riskFreeRate > 0 && data.riskFreeRate < 0.25),
      debtWeight,
      waccClamped,
      rawWacc,
      isFinancial,
      // False when any year couldn't be unlevered, so the projection is levered
      // FCF and reads low. Worth saying out loud rather than hiding.
      unlevered,
    },
  };
}

/* ─── Slider ───────────────────────────────────────────────────────── */

function Slider({ label, value, onChange, min, max, step, format, autoValue }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  autoValue?: number;
}) {
  const isAuto = autoValue != null && Math.abs(value - autoValue) < step / 2;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[11px] text-rh-light-text/70 dark:text-white/80 w-[110px] shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none bg-gray-200/60 dark:bg-white/[0.06] accent-rh-green"
      />
      <span className="text-[11px] font-mono tabular-nums text-rh-light-text/80 dark:text-white w-[52px] text-right">
        {format(value)}
      </span>
      {autoValue != null && (
        <button
          onClick={() => onChange(autoValue)}
          className={`text-[8px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
            isAuto
              ? 'bg-rh-green/15 text-rh-green'
              : 'bg-gray-200/40 dark:bg-white/[0.04] text-rh-light-text dark:text-white/80 hover:text-rh-green'
          }`}
        >
          AUTO
        </button>
      )}
    </div>
  );
}

/* ─── Sensitivity Table ────────────────────────────────────────────── */

// Module-scope so the sensitivity memo below keys only on baseInputs
// (per-render array literals would invalidate it every render).
const GROWTH_STEPS = [-0.02, -0.01, 0, 0.01, 0.02];
const WACC_STEPS = [-0.02, -0.01, 0, 0.01, 0.02];

/**
 * Fair value across the growth x WACC grid. Shared by the sensitivity table and the
 * headline range, so the number in the header is always one the user can find in
 * the table rather than a separately-derived figure that happens to look similar.
 */
export function sensitivityGrid(baseInputs: DCFInputs): (number | null)[][] {
  return GROWTH_STEPS.map(gOff => {
    const growth = baseInputs.revenueGrowth + gOff;
    return WACC_STEPS.map(wOff => {
      const wacc = baseInputs.discountRate + wOff;
      if (wacc - baseInputs.terminalGrowth < MIN_PERPETUITY_SPREAD - 1e-9) return null; // invalid
      const r = runDCF({ ...baseInputs, revenueGrowth: growth, discountRate: wacc });
      return r.fairValuePerShare;
    });
  });
}

/**
 * Low/high fair value across that grid, ignoring cells the model refuses. Null when
 * nothing valid survives, or when the band collapses to a point.
 */
export function fairValueRange(baseInputs: DCFInputs): { low: number; high: number } | null {
  const values = sensitivityGrid(baseInputs).flat().filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

/* ─── Reverse DCF ──────────────────────────────────────────────────── */

// Bracket for the search. Wide enough to cover a hyper-growth name and a
// business in decline; anything outside it is reported as out-of-range rather
// than pinned to the edge, because a pinned number reads as a real answer.
const IMPLIED_GROWTH_MIN = -0.5;
const IMPLIED_GROWTH_MAX = 1.0;
const IMPLIED_GROWTH_ITERATIONS = 60;

export interface ImpliedGrowth {
  /** The solved YEAR-ONE rate — the input `runDCF` fades down from. */
  growth: number | null;
  /**
   * The compound annual rate that year-one rate actually works out to across
   * the projection, which is the only form comparable to a realized CAGR.
   *
   * These differ a lot: growth fades linearly to terminal, so a solved 30%
   * over ten years to a 2.5% terminal is a 15.9% CAGR. Reporting the year-one
   * figure beside a historical CAGR roughly doubles the apparent expectation
   * and inverts the comparison the reverse DCF exists to make.
   */
  impliedCagr: number | null;
  /** Set when today's price sits outside what the bracket can explain. */
  outOfRange: 'above' | 'below' | null;
}

/** The compound annual revenue growth a given year-one rate works out to. */
function cagrForGrowth(baseInputs: DCFInputs, growth: number): number | null {
  const { ttmRevenue, projectionYears } = baseInputs;
  if (!(ttmRevenue > 0) || projectionYears < 1) return null;
  const revenues = runDCF({ ...baseInputs, revenueGrowth: growth }).projectedRevenues;
  const final = revenues[revenues.length - 1];
  if (!(final > 0)) return null;
  return Math.pow(final / ttmRevenue, 1 / projectionYears) - 1;
}

/**
 * The revenue growth rate that makes this model produce exactly today's price —
 * a reverse DCF.
 *
 * This is the most decision-useful thing a DCF can say. A forward DCF answers
 * "what do I think it's worth", which is only as good as the growth number the
 * user guessed. The reverse asks "what is the market already assuming?", which
 * the user can then judge against what the company has actually delivered —
 * a comparison they're far better equipped to make than picking a growth rate
 * out of the air.
 *
 * Solved by bisection. Fair value is monotonic in growth, but the DIRECTION
 * depends on sign: for a cash-generative business more growth means more value,
 * while for one burning cash on every sale, growth destroys value. We detect
 * the direction from the bracket ends rather than assuming it.
 */
export function impliedGrowth(baseInputs: DCFInputs, currentPrice: number): ImpliedGrowth {
  const none: ImpliedGrowth = { growth: null, impliedCagr: null, outOfRange: null };
  if (!(currentPrice > 0)) return none;
  if (baseInputs.discountRate - baseInputs.terminalGrowth < MIN_PERPETUITY_SPREAD - 1e-9) return none;
  // Degenerate inputs make fair value constant in growth, so the bracket ends
  // agree and we'd otherwise report a confident out-of-range answer for a
  // company whose model simply has nothing to solve.
  if (!(baseInputs.ttmRevenue > 0) || !(baseInputs.sharesOutstanding > 0)) return none;
  if (baseInputs.fcfMargin === 0) return none;

  const valueAt = (growth: number): number =>
    runDCF({ ...baseInputs, revenueGrowth: growth }).fairValuePerShare - currentPrice;

  let lo = IMPLIED_GROWTH_MIN;
  let hi = IMPLIED_GROWTH_MAX;
  const fLo = valueAt(lo);
  const fHi = valueAt(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return none;

  const increasing = fHi > fLo;

  // Same sign at both ends means no root inside the bracket. Which SIDE of the
  // GROWTH axis the answer lies on depends on the direction of the
  // relationship, so both facts are needed:
  //   value rises with growth  · price under every value → grow less → below
  //                            · price over every value  → grow more → above
  //   value falls with growth  · price under every value → grow more → above
  //                            · price over every value  → grow less → below
  // Classifying on value alone reports the opposite side for a business where
  // growth destroys value.
  if (fLo > 0 === fHi > 0) {
    const priceUnderEveryValue = fLo > 0;
    const outOfRange = priceUnderEveryValue
      ? (increasing ? 'below' : 'above')
      : (increasing ? 'above' : 'below');
    return { ...none, outOfRange };
  }

  let solved = (lo + hi) / 2;
  for (let i = 0; i < IMPLIED_GROWTH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    solved = mid;
    const f = valueAt(mid);
    if (Math.abs(f) < 1e-6) break;
    if (increasing ? f > 0 : f < 0) hi = mid;
    else lo = mid;
  }
  return { growth: solved, impliedCagr: cagrForGrowth(baseInputs, solved), outOfRange: null };
}

function SensitivityTable({ baseInputs, currentPrice }: { baseInputs: DCFInputs; currentPrice: number }) {
  const rows = useMemo(() => sensitivityGrid(baseInputs), [baseInputs]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono tabular-nums">
        <thead>
          <tr>
            <th className="py-1.5 px-1 text-left text-rh-light-text dark:text-white/80 font-medium">
              <span className="text-[8px]">Growth↓ WACC→</span>
            </th>
            {WACC_STEPS.map(wOff => (
              <th key={wOff} className={`py-1.5 px-1 text-center font-medium ${
                wOff === 0 ? 'text-rh-green' : 'text-rh-light-text dark:text-white/80'
              }`}>
                {pct(baseInputs.discountRate + wOff)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROWTH_STEPS.map((gOff, ri) => (
            <tr key={ri} className="border-t border-gray-200/15 dark:border-white/[0.03]">
              <td className={`py-1.5 px-1 font-medium ${
                gOff === 0 ? 'text-rh-green' : 'text-rh-light-text dark:text-white/80'
              }`}>
                {pct(baseInputs.revenueGrowth + gOff)}
              </td>
              {rows[ri].map((val, ci) => {
                if (val == null) return <td key={ci} className="py-1.5 px-1 text-center text-rh-light-text dark:text-white/80">-</td>;
                const isCenter = gOff === 0 && WACC_STEPS[ci] === 0;
                const upside = val > currentPrice;
                return (
                  <td key={ci} className={`py-1.5 px-1 text-center ${
                    isCenter
                      ? 'font-bold text-rh-light-text dark:text-white bg-gray-100/40 dark:bg-white/[0.03] rounded'
                      : upside
                      ? 'text-rh-green/80'
                      : 'text-rh-red/80'
                  }`}>
                    ${val.toFixed(0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Projected FCF Chart ──────────────────────────────────────────── */

function ProjectedChart({ historicalFCFs, projectedFCFs, labels }: {
  historicalFCFs: (number | null)[];
  projectedFCFs: number[];
  labels: string[];
}) {
  const all = [...historicalFCFs.filter((v): v is number => v != null), ...projectedFCFs];
  if (all.length === 0) return null;
  const maxVal = Math.max(...all, 0);
  const minVal = Math.min(...all, 0);
  const range = Math.max(maxVal - minVal, 1);
  const barMaxH = 60;
  const zeroFromBottom = minVal < 0 ? (Math.abs(minVal) / range) * barMaxH : 0;
  const totalH = barMaxH + 8;
  const histLen = historicalFCFs.length;

  return (
    <div className="mt-3">
      <div className="relative px-1" style={{ height: `${totalH}px` }}>
        {/* Zero line if needed */}
        {minVal < 0 && (
          <div className="absolute left-1 right-1 h-px bg-gray-300/30 dark:bg-white/[0.06]"
            style={{ bottom: `${zeroFromBottom}px` }} />
        )}
        <div className="flex items-end gap-1 h-full">
          {labels.map((_, i) => {
            const isProjected = i >= histLen;
            const val = isProjected ? projectedFCFs[i - histLen] : (historicalFCFs[i] ?? 0);
            const isPositive = val >= 0;
            const h = Math.max((Math.abs(val) / range) * barMaxH, 2);

            return (
              <div key={i} className="flex-1 min-w-0 flex justify-center" style={{ height: `${totalH}px`, position: 'relative' }}>
                <div
                  className={`w-full max-w-[20px] rounded-sm ${
                    isProjected
                      ? isPositive ? 'bg-rh-green/40' : 'bg-rh-red/40'
                      : isPositive ? 'bg-rh-green/70' : 'bg-rh-red/70'
                  } ${isProjected ? 'border border-dashed border-rh-green/30' : ''}`}
                  style={isPositive
                    ? { position: 'absolute', bottom: `${zeroFromBottom}px`, height: `${h}px` }
                    : { position: 'absolute', bottom: `${zeroFromBottom - h}px`, height: `${h}px` }
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1 px-1 mt-1">
        {labels.map((l, i) => (
          <span key={i} className={`text-[7px] font-mono flex-1 text-center tabular-nums ${
            i >= histLen ? 'text-rh-green/40' : 'text-rh-light-text dark:text-white/80'
          }`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────── */

export function DCFCalculator({ data, currentPrice }: {
  data: FundamentalsResponse;
  currentPrice: number;
}) {
  const defaults = useMemo(() => deriveDefaults(data, currentPrice), [data, currentPrice]);

  const [revenueGrowth, setRevenueGrowth] = useState(defaults.revenueGrowth);
  const [fcfMargin, setFcfMargin] = useState(defaults.fcfMargin);
  const [showDetails, setShowDetails] = useState(false);
  const [discountRate, setDiscountRate] = useState(defaults.discountRate);
  const [terminalGrowth, setTerminalGrowth] = useState(defaults.terminalGrowth);
  const [projectionYears, setProjectionYears] = useState(defaults.projectionYears);

  const inputs: DCFInputs = useMemo(() => ({
    revenueGrowth,
    fcfMargin,
    discountRate,
    terminalGrowth,
    projectionYears,
    ttmRevenue: defaults.ttmRevenue,
    cash: defaults.cash,
    totalDebt: defaults.totalDebt,
    sharesOutstanding: defaults.sharesOutstanding,
  }), [revenueGrowth, fcfMargin, discountRate, terminalGrowth, projectionYears, defaults]);

  const result = useMemo(() => {
    // A perpetuity needs real air between the discount and terminal rates. At a
    // 0.5pp spread the terminal multiple is ~200x final-year cash flow, which
    // swamps everything else in the model and reads as a confident number.
    // Epsilon because both operands are slider steps: 0.055 - 0.035 evaluates to
    // 0.019999999999999997, one ULP under the threshold, and the guard would fire on
    // a spread the UI renders as exactly 2.0pp.
    if (discountRate - terminalGrowth < MIN_PERPETUITY_SPREAD - 1e-9) return null;
    if (defaults.ttmRevenue <= 0) return null;
    if (defaults.sharesOutstanding <= 0) return null;
    return runDCF(inputs);
  }, [inputs, discountRate, terminalGrowth, defaults]);

  // The only genuine dead end: no slider can conjure a revenue line or a share count.
  if (defaults.ttmRevenue <= 0 || defaults.sharesOutstanding <= 0) {
    return (
      <div className="text-xs text-rh-light-text dark:text-white/80 py-4 text-center">
        Insufficient data for DCF valuation
      </div>
    );
  }

  // Everything below keeps the SLIDERS on screen. Telling someone to raise the FCF
  // margin while unmounting the FCF margin slider is a dead end — the only way out
  // was to leave the tab and lose every other input they had set. Each message names
  // the condition that actually fired, because "negative free cash flow" is a false
  // statement about a company whose equity is merely underwater at these assumptions.
  const blocked = defaults.assumptions.fcfMarginAssumed
    ? {
      title: 'DCF not available — no usable cash flow history',
      body: 'None of the filings report capital expenditure separately, so free cash flow can’t be computed for any year. Rather than assume a margin, the model stops here.',
    }
    : !result
    ? {
      title: 'Discount rate too close to terminal growth',
      body: `A perpetuity divides by the gap between the two, so it needs at least ${(MIN_PERPETUITY_SPREAD * 100).toFixed(0)}pp of air. Raise the discount rate, or lower terminal growth.`,
    }
    : fcfMargin <= 0
      ? {
        title: 'DCF not meaningful — negative free cash flow',
        body: 'A discounted cash flow model can’t value a company that isn’t generating cash. Raise the FCF margin to explore a profitable scenario.',
      }
      : result.fairValuePerShare <= 0
        ? {
          title: 'DCF not meaningful — debt exceeds the value of the cash flows',
          body: 'This company does generate cash, but at these assumptions its debt is worth more than the cash flows are, leaving nothing for equity.',
        }
        : null;

  const fairValue = result?.fairValuePerShare ?? 0;
  const range = !blocked && result ? fairValueRange(inputs) : null;

  // Deliberately not memoised: this sits below an early return, so a hook here
  // would break React's hook ordering the moment the component flips between
  // its blocked and unblocked states. The cost is ~60 bisection steps over a
  // handful of arithmetic each — cheaper than the comparison would be.
  const reverse = ((): { implied: string; historical: string | null } | null => {
    if (blocked || !result || !(currentPrice > 0)) return null;
    const { impliedCagr, outOfRange } = impliedGrowth(inputs, currentPrice);
    // Report the COMPOUND rate, never the year-one rate the solver works in —
    // it's the only form comparable to the realized CAGR sitting beside it.
    const implied = impliedCagr != null
      ? `${(impliedCagr * 100).toFixed(1)}%`
      : outOfRange === 'above'
        ? 'more growth than this model can project'
        : outOfRange === 'below'
          ? 'steep decline'
          : null;
    if (implied == null) return null;
    // The company's own realized CAGR, unclamped — `defaults.revenueGrowth` is
    // squeezed onto the slider's track and would misstate a fast grower.
    const historical = defaults.historicalRevenueCagr != null
      ? `${(defaults.historicalRevenueCagr * 100).toFixed(1)}%`
      : null;
    return { implied, historical };
  })();

  // Where the price sits against the BAND, not against a single number. A price
  // inside the band is the honest "the model can't call this" answer, which a point
  // estimate can never give — it always lands on one side or the other.
  const verdict = !range || currentPrice <= 0
    ? { label: '—', tone: 'text-rh-light-text dark:text-white', dot: 'bg-gray-400/40 dark:bg-white/20' }
    : currentPrice > range.high
      ? { label: 'Above range', tone: 'text-rh-red', dot: 'bg-rh-red' }
      : currentPrice < range.low
        ? { label: 'Below range', tone: 'text-rh-green', dot: 'bg-rh-green' }
        : { label: 'In range', tone: 'text-amber-600 dark:text-yellow-400', dot: 'bg-amber-600 dark:bg-yellow-400' };

  // Projected chart data. The historical bars have to be put on the SAME cash-flow
  // basis as the projected ones — plotting levered history against unlevered
  // projections draws a step at the boundary that looks like growth and isn't.
  const annualCF = [...data.cashFlows.annual].reverse().slice(-5);
  const historicalFCFs = annualCF.map(c => {
    if (c.freeCashFlow == null || !defaults.assumptions.unlevered) return c.freeCashFlow;
    const is = data.incomeStatements.annual.find(y => y.fiscalDateEnding === c.fiscalDateEnding);
    const interest = is?.interestExpense;
    if (interest == null || interest <= 0) return c.freeCashFlow;
    return c.freeCashFlow + interest * (1 - TAX_RATE);
  });
  const histLabels = annualCF.map(c => c.fiscalDateEnding.substring(0, 4));
  const currentYear = new Date().getFullYear();
  const projLabels = Array.from({ length: projectionYears }, (_, i) => `${currentYear + i + 1}E`);

  return (
    <div>
      {/* Fair value header.
          A range, not a point. Every input here is an estimate, so "$25.39" claimed a
          precision the method cannot support; the band is the same growth x WACC grid
          shown under Sensitivity, so the header is always a number you can find in
          the table. Verdict reads as dot + colored text per the design rulebook —
          never a background wash. */}
      {blocked ? (
        <div className="py-4 mb-2 text-center">
          <div className="text-xs text-rh-light-text dark:text-white">{blocked.title}</div>
          <p className="mt-1.5 text-[10px] leading-snug text-rh-light-text dark:text-white/80 max-w-[42ch] mx-auto">
            {blocked.body}
          </p>
        </div>
      ) : (
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-rh-light-text dark:text-white tabular-nums font-mono">
              {range ? <>${range.low.toFixed(2)}<span className="text-rh-light-text dark:text-white/80 mx-1">–</span>${range.high.toFixed(2)}</> : `$${fairValue.toFixed(2)}`}
            </span>
            <span className="text-[10px] text-rh-light-text dark:text-white/80">
              {range ? 'Fair Value Range' : 'Fair Value'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-rh-light-text dark:text-white font-mono tabular-nums">
              ${currentPrice.toFixed(2)} current
            </span>
            <span className="text-xs text-rh-light-text dark:text-white/80 font-mono tabular-nums">
              base ${fairValue.toFixed(2)}
            </span>
          </div>
          {/* Reverse DCF. The forward number depends on a growth rate the user
              guessed; this one states what the market has already assumed, next
              to what the company actually delivered — a comparison they can
              actually judge. */}
          {reverse && (
            <div className="mt-1.5 text-[10px] leading-snug text-rh-light-text dark:text-white">
              At these assumptions, price implies{' '}
              <span className="font-semibold text-rh-light-text dark:text-white/80 tabular-nums">
                {reverse.implied}
              </span>{' '}
              revenue CAGR over {inputs.projectionYears}y
              {reverse.historical && (
                <> · delivered <span className="font-semibold tabular-nums">{reverse.historical}</span> historically</>
              )}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${verdict.tone}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${verdict.dot}`} />
          {verdict.label}
        </div>
      </div>
      )}

      {/* Sliders */}
      <div className="mb-4">
        <Slider label="Revenue Growth" value={revenueGrowth} onChange={setRevenueGrowth}
          min={-0.10} max={0.40} step={0.005} format={pct} autoValue={defaults.revenueGrowth} />
        <Slider label="FCF Margin" value={fcfMargin} onChange={setFcfMargin}
          min={-0.30} max={0.50} step={0.005} format={pct} autoValue={defaults.fcfMargin} />
        <Slider label="Discount Rate" value={discountRate} onChange={setDiscountRate}
          min={WACC_MIN} max={WACC_MAX} step={0.005} format={pct} autoValue={defaults.discountRate} />
        <Slider label="Terminal Growth" value={terminalGrowth} onChange={setTerminalGrowth}
          min={0.00} max={0.05} step={0.005} format={pct} />
        <Slider label="Projection Years" value={projectionYears} onChange={v => setProjectionYears(Math.round(v))}
          min={3} max={10} step={1} format={v => `${v} yrs`} />
      </div>

      {/* Everything below is detail. Collapsed by default so the panel opens on the
          answer and the assumptions you'd actually tune, not on a wall of tables. */}
      {!blocked && result && (<>
      <button
        type="button"
        onClick={() => setShowDetails(v => !v)}
        aria-expanded={showDetails}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg
                   text-[10px] font-medium uppercase tracking-wider
                   text-rh-light-text dark:text-white
                   hover:text-rh-light-text dark:hover:text-rh-text
                   hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors"
      >
        {showDetails ? 'Hide details' : 'Show details'}
        <svg className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDetails && (<>
      {/* How the discount rate was built — the input that moves fair value most */}
      <div className="mt-3 mb-4">
        <h4 className="text-[10px] font-semibold text-rh-light-text/70 dark:text-white/80 uppercase tracking-wider mb-2">Assumptions</h4>
        <div className="space-y-1 text-[11px] font-mono tabular-nums text-rh-light-text/60 dark:text-white">
          <div className="flex justify-between">
            <span>Risk-free rate (10Y)</span>
            <span>{pct(defaults.assumptions.riskFree)}{defaults.assumptions.riskFreeAssumed &&
              <span className="text-rh-light-text dark:text-white/80"> assumed</span>}</span>
          </div>
          <div className="flex justify-between">
            <span>Beta (adjusted)</span>
            <span>{defaults.assumptions.beta.toFixed(2)} <span className="text-rh-light-text dark:text-white/80">
              {defaults.assumptions.betaAssumed ? 'assumed' : `from ${defaults.assumptions.rawBeta.toFixed(2)}`}
            </span></span>
          </div>
          <div className="flex justify-between">
            <span>Cost of debt (pre-tax)</span>
            <span>
              {defaults.assumptions.debtWeight < 0.005
                ? <span className="text-rh-light-text dark:text-white/80">n/a &middot; no debt</span>
                : <>{pct(defaults.assumptions.preTaxCostOfDebt)}{defaults.assumptions.costOfDebtAssumed &&
                    <span className="text-rh-light-text dark:text-white/80"> assumed</span>}</>}
            </span>
          </div>
          {defaults.assumptions.waccClamped && (
            <div className="flex justify-between">
              <span>Computed WACC</span>
              <span>{pct(defaults.assumptions.rawWacc)} <span className="text-rh-light-text dark:text-white/80">clamped</span></span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Cash flow basis</span>
            <span>{defaults.assumptions.unlevered ? 'Unlevered FCF' : 'Levered FCF'}</span>
          </div>
        </div>
        {defaults.assumptions.isFinancial && (
          <p className="mt-1.5 text-[10px] leading-snug text-rh-light-text dark:text-white/80">
            For banks and insurers interest is an operating cost, not financing, so
            cash flow is left levered. A cash-flow DCF is a poor fit for this sector —
            read this as one scenario, not a valuation.
          </p>
        )}
        {!defaults.assumptions.unlevered && !defaults.assumptions.isFinancial && (
          <p className="mt-1.5 text-[10px] leading-snug text-rh-light-text dark:text-white/80">
            Interest expense isn&apos;t broken out for every year, so cash flow couldn&apos;t be
            unlevered — fair value reads low for a company carrying debt.
          </p>
        )}
      </div>

      {/* Sensitivity table */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold text-rh-light-text/70 dark:text-white/80 uppercase tracking-wider mb-2">Sensitivity</h4>
        <SensitivityTable baseInputs={inputs} currentPrice={currentPrice} />
      </div>

      {/* Projected FCF chart */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="text-[10px] font-semibold text-rh-light-text/70 dark:text-white/80 uppercase tracking-wider">Free Cash Flow</h4>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-rh-green/70" />
              <span className="text-[8px] text-rh-light-text dark:text-white/80">Historical</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-rh-green/40 border border-dashed border-rh-green/30" />
              <span className="text-[8px] text-rh-light-text dark:text-white/80">Projected</span>
            </div>
          </div>
        </div>
        <ProjectedChart
          historicalFCFs={historicalFCFs}
          projectedFCFs={result.projectedFCFs}
          labels={[...histLabels, ...projLabels]}
        />
      </div>

      {/* Breakdown */}
      <div>
        <h4 className="text-[10px] font-semibold text-rh-light-text/70 dark:text-white/80 uppercase tracking-wider mb-2">Valuation Breakdown</h4>
        <div className="space-y-1 text-[11px] font-mono tabular-nums">
          {[
            ['PV of Projected FCFs', fmt(result.pvProjectedFCFs)],
            ['PV of Terminal Value', fmt(result.pvTerminalValue)],
            ['= Enterprise Value', fmt(result.enterpriseValue)],
            ['+ Cash', fmt(defaults.cash)],
            ['- Debt', fmt(defaults.totalDebt)],
            ['= Equity Value', fmt(result.equityValue)],
            ['÷ Shares Outstanding', `${(defaults.sharesOutstanding / 1e9).toFixed(2)}B`],
            ['= Fair Value / Share', `$${fairValue.toFixed(2)}`],
          ].map(([label, val], i) => {
            const isBold = label.startsWith('=');
            return (
              <div key={i} className={`flex justify-between ${
                isBold
                  ? 'text-rh-light-text/90 dark:text-white/80 font-semibold pt-1 border-t border-gray-200/20 dark:border-white/[0.04]'
                  : 'text-rh-light-text/60 dark:text-white'
              }`}>
                <span>{label}</span>
                <span>{val}</span>
              </div>
            );
          })}
        </div>
      </div>
      </>)}
      </>)}
    </div>
  );
}
