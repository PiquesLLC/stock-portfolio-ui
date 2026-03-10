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

function runDCF(inputs: DCFInputs): DCFResult {
  const { revenueGrowth, fcfMargin, discountRate, terminalGrowth, projectionYears,
    ttmRevenue, cash, totalDebt, sharesOutstanding } = inputs;

  const projectedRevenues: number[] = [];
  const projectedFCFs: number[] = [];
  let rev = ttmRevenue;

  for (let y = 1; y <= projectionYears; y++) {
    rev = rev * (1 + revenueGrowth);
    projectedRevenues.push(rev);
    projectedFCFs.push(rev * fcfMargin);
  }

  // Terminal value (Gordon Growth)
  const finalFCF = projectedFCFs[projectedFCFs.length - 1];
  const tv = finalFCF * (1 + terminalGrowth) / (discountRate - terminalGrowth);

  // Discount to present
  let pvFCFs = 0;
  for (let y = 0; y < projectionYears; y++) {
    pvFCFs += projectedFCFs[y] / Math.pow(1 + discountRate, y + 1);
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

function deriveDefaults(data: FundamentalsResponse, currentPrice: number) {
  const annualIS = data.incomeStatements.annual;
  const annualCF = data.cashFlows.annual;
  const annualBS = data.balanceSheets.annual;
  const overview = data.overview;

  // TTM revenue
  const ttmRevenue = overview?.revenueTTM ?? annualIS[0]?.totalRevenue ?? 0;

  // Revenue CAGR (oldest to newest annual)
  let revenueGrowth = 0.08; // fallback 8%
  const sortedIS = [...annualIS].reverse(); // oldest first
  if (sortedIS.length >= 2) {
    const oldest = sortedIS[0]?.totalRevenue;
    const newest = sortedIS[sortedIS.length - 1]?.totalRevenue;
    if (oldest && newest && oldest > 0 && newest > 0) {
      const years = sortedIS.length - 1;
      revenueGrowth = Math.pow(newest / oldest, 1 / years) - 1;
    }
  }
  // Clamp to reasonable range
  revenueGrowth = Math.max(-0.10, Math.min(0.40, revenueGrowth));

  // FCF margin (average over available years)
  let fcfMargin = 0.15; // fallback
  const margins: number[] = [];
  for (const yr of annualIS) {
    const rev = yr.totalRevenue;
    const cf = annualCF.find(c => c.fiscalDateEnding === yr.fiscalDateEnding);
    if (rev && rev > 0 && cf?.freeCashFlow != null) {
      margins.push(cf.freeCashFlow / rev);
    }
  }
  if (margins.length > 0) {
    fcfMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
  }
  // Floor at net income margin: for growth companies spending heavily on capex
  // (e.g. AMZN 2% FCF margin vs 11% net margin), long-term FCF should at least
  // match net income as D&A covers maintenance capex and growth capex normalizes.
  const netMargins: number[] = [];
  for (const yr of annualIS) {
    if (yr.netIncome != null && yr.totalRevenue != null && yr.totalRevenue > 0) {
      netMargins.push(yr.netIncome / yr.totalRevenue);
    }
  }
  if (netMargins.length > 0) {
    // Use median to reduce impact of one-off gains/losses
    const sorted = [...netMargins].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianNetMargin = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    fcfMargin = Math.max(fcfMargin, medianNetMargin);
  }
  fcfMargin = Math.max(-0.30, Math.min(0.50, fcfMargin));

  // WACC estimate
  const beta = overview?.beta ?? 1.0;
  const riskFree = 0.042;
  const erp = 0.055;
  const costOfEquity = riskFree + beta * erp;
  // Simple WACC: weighted avg (assume 80/20 equity/debt split if no data)
  const latestBS = annualBS[0];
  const totalDebt = (latestBS?.longTermDebt ?? 0) + (latestBS?.currentDebt ?? 0);
  const cash = latestBS?.cashAndEquivalents ?? 0;
  const marketCap = overview?.marketCap ?? (currentPrice * (overview?.sharesOutstanding ?? 1));
  const totalCapital = marketCap + totalDebt;
  const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 0.8;
  const debtWeight = 1 - equityWeight;
  const costOfDebt = 0.05 * (1 - 0.21); // assume 5% rate, 21% tax
  const wacc = equityWeight * costOfEquity + debtWeight * costOfDebt;

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
    projectionYears: 5,
    ttmRevenue,
    cash,
    totalDebt,
    sharesOutstanding,
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
      <span className="text-[11px] text-rh-light-text/70 dark:text-white/50 w-[110px] shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none bg-gray-200/60 dark:bg-white/[0.06] accent-rh-green"
      />
      <span className="text-[11px] font-mono tabular-nums text-rh-light-text/80 dark:text-white/60 w-[52px] text-right">
        {format(value)}
      </span>
      {autoValue != null && (
        <button
          onClick={() => onChange(autoValue)}
          className={`text-[8px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
            isAuto
              ? 'bg-rh-green/15 text-rh-green'
              : 'bg-gray-200/40 dark:bg-white/[0.04] text-rh-light-muted/40 dark:text-white/20 hover:text-rh-green'
          }`}
        >
          AUTO
        </button>
      )}
    </div>
  );
}

/* ─── Sensitivity Table ────────────────────────────────────────────── */

function SensitivityTable({ baseInputs, currentPrice }: { baseInputs: DCFInputs; currentPrice: number }) {
  const growthSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];

  const rows = useMemo(() => {
    return growthSteps.map(gOff => {
      const growth = baseInputs.revenueGrowth + gOff;
      return waccSteps.map(wOff => {
        const wacc = baseInputs.discountRate + wOff;
        if (wacc <= baseInputs.terminalGrowth + 0.005) return null; // invalid
        const r = runDCF({ ...baseInputs, revenueGrowth: growth, discountRate: wacc });
        return r.fairValuePerShare;
      });
    });
  }, [baseInputs]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono tabular-nums">
        <thead>
          <tr>
            <th className="py-1.5 px-1 text-left text-rh-light-muted/40 dark:text-white/20 font-medium">
              <span className="text-[8px]">Growth↓ WACC→</span>
            </th>
            {waccSteps.map(wOff => (
              <th key={wOff} className={`py-1.5 px-1 text-center font-medium ${
                wOff === 0 ? 'text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20'
              }`}>
                {pct(baseInputs.discountRate + wOff)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {growthSteps.map((gOff, ri) => (
            <tr key={ri} className="border-t border-gray-200/15 dark:border-white/[0.03]">
              <td className={`py-1.5 px-1 font-medium ${
                gOff === 0 ? 'text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20'
              }`}>
                {pct(baseInputs.revenueGrowth + gOff)}
              </td>
              {rows[ri].map((val, ci) => {
                if (val == null) return <td key={ci} className="py-1.5 px-1 text-center text-rh-light-muted/20 dark:text-white/10">-</td>;
                const isCenter = gOff === 0 && waccSteps[ci] === 0;
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
            i >= histLen ? 'text-rh-green/40' : 'text-rh-light-muted/30 dark:text-white/15'
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
  const [discountRate, setDiscountRate] = useState(defaults.discountRate);
  const [terminalGrowth, setTerminalGrowth] = useState(defaults.terminalGrowth);
  const [projectionYears, setProjectionYears] = useState(defaults.projectionYears);

  const inputs: DCFInputs = {
    revenueGrowth,
    fcfMargin,
    discountRate,
    terminalGrowth,
    projectionYears,
    ttmRevenue: defaults.ttmRevenue,
    cash: defaults.cash,
    totalDebt: defaults.totalDebt,
    sharesOutstanding: defaults.sharesOutstanding,
  };

  const result = useMemo(() => {
    if (discountRate <= terminalGrowth + 0.005) return null;
    if (defaults.ttmRevenue <= 0) return null;
    if (defaults.sharesOutstanding <= 0) return null;
    return runDCF(inputs);
  }, [revenueGrowth, fcfMargin, discountRate, terminalGrowth, projectionYears, defaults]);

  if (!result) {
    return (
      <div className="text-xs text-rh-light-muted/40 dark:text-white/20 py-4 text-center">
        Insufficient data for DCF valuation
      </div>
    );
  }

  const fairValue = result.fairValuePerShare;
  const upside = currentPrice > 0 ? (fairValue - currentPrice) / currentPrice : 0;
  const isUndervalued = fairValue > currentPrice;

  // Projected chart data
  const annualCF = [...data.cashFlows.annual].reverse().slice(-5);
  const historicalFCFs = annualCF.map(c => c.freeCashFlow);
  const histLabels = annualCF.map(c => c.fiscalDateEnding.substring(0, 4));
  const currentYear = new Date().getFullYear();
  const projLabels = Array.from({ length: projectionYears }, (_, i) => `${currentYear + i + 1}E`);

  return (
    <div>
      {/* Fair value header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-rh-light-text dark:text-white tabular-nums font-mono">
              ${fairValue.toFixed(2)}
            </span>
            <span className="text-[10px] text-rh-light-muted/40 dark:text-white/20">Fair Value</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-rh-light-muted/50 dark:text-white/30 font-mono tabular-nums">
              ${currentPrice.toFixed(2)} current
            </span>
            <span className={`text-xs font-semibold font-mono tabular-nums ${isUndervalued ? 'text-rh-green' : 'text-rh-red'}`}>
              {upside > 0 ? '+' : ''}{(upside * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        {/* Visual gauge */}
        <div className={`px-2.5 py-1 rounded-md text-[10px] font-semibold ${
          isUndervalued ? 'bg-rh-green/10 text-rh-green' : 'bg-rh-red/10 text-rh-red'
        }`}>
          {isUndervalued ? 'Undervalued' : 'Overvalued'}
        </div>
      </div>

      {/* Sliders */}
      <div className="mb-4">
        <Slider label="Revenue Growth" value={revenueGrowth} onChange={setRevenueGrowth}
          min={-0.10} max={0.40} step={0.005} format={pct} autoValue={defaults.revenueGrowth} />
        <Slider label="FCF Margin" value={fcfMargin} onChange={setFcfMargin}
          min={-0.30} max={0.50} step={0.005} format={pct} autoValue={defaults.fcfMargin} />
        <Slider label="Discount Rate" value={discountRate} onChange={setDiscountRate}
          min={0.04} max={0.20} step={0.005} format={pct} autoValue={defaults.discountRate} />
        <Slider label="Terminal Growth" value={terminalGrowth} onChange={setTerminalGrowth}
          min={0.00} max={0.05} step={0.005} format={pct} />
        <Slider label="Projection Years" value={projectionYears} onChange={v => setProjectionYears(Math.round(v))}
          min={3} max={10} step={1} format={v => `${v} yrs`} />
      </div>

      {/* Sensitivity table */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold text-rh-light-muted/40 dark:text-white/20 uppercase tracking-wider mb-2">Sensitivity</h4>
        <SensitivityTable baseInputs={inputs} currentPrice={currentPrice} />
      </div>

      {/* Projected FCF chart */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="text-[10px] font-semibold text-rh-light-muted/40 dark:text-white/20 uppercase tracking-wider">Free Cash Flow</h4>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-rh-green/70" />
              <span className="text-[8px] text-rh-light-muted/30 dark:text-white/15">Historical</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-rh-green/40 border border-dashed border-rh-green/30" />
              <span className="text-[8px] text-rh-light-muted/30 dark:text-white/15">Projected</span>
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
        <h4 className="text-[10px] font-semibold text-rh-light-muted/40 dark:text-white/20 uppercase tracking-wider mb-2">Valuation Breakdown</h4>
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
                  : 'text-rh-light-text/60 dark:text-white/40'
              }`}>
                <span>{label}</span>
                <span>{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
