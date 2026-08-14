import { useState, useEffect, useRef, useMemo } from 'react';
import { FundamentalsResponse, ParsedIncomeStatement, ParsedBalanceSheet, ParsedCashFlow } from '../types';
import { getFundamentals } from '../api';
import { computeDerivedMetrics } from '../utils/derived-metrics';
import { DCFCalculator } from './DCFCalculator';
import { MetricGrid, Metric } from './MetricGrid';
import { ChartLegend } from './ChartLegend';
import {
  CHART_W, CHART_H, CHART_PAD as PAD,
  SERIES_BLUE as BLUE, SERIES_GREEN as GREEN, SERIES_RED as RED,
  GRID_STROKE, ZERO_STROKE, CROSSHAIR_STROKE, TOOLTIP_FILL,
  AXIS_FONT_SIZE, TOOLTIP_FONT_SIZE, AXIS_FONT_FAMILY, AXIS_TEXT_CLASS,
  BAR_REST_OPACITY, BAR_BACKING_CLASS,
} from './chart-style';

type FundTab = 'revenue' | 'balance' | 'cashflow' | 'dcf';
type PeriodToggle = 'annual' | 'quarterly';

function formatLargeNumber(n: number | null): string {
  if (n == null) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth();
  const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
  return `${q} '${String(d.getFullYear()).slice(2)}`;
}

function formatYear(dateStr: string): string {
  return dateStr.substring(0, 4);
}

/* ─── Bar Chart ─────────────────────────────────────────────────────── */

interface BarSeries {
  label: string;
  color: string;
  values: (number | null)[];
}

interface BarChartProps {
  labels: string[];
  series: BarSeries[];
  formatValue?: (n: number) => string;
}

function BarChart({ labels, series, formatValue = formatLargeNumber }: BarChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Tab/period switches swap the dataset under a live hover. A carried-over index
  // past the new end would paint a ghost tooltip — blank label, "-" for every
  // series — parked off to the right. Reachable on touch, where the tooltip has
  // no pointer to follow it out.
  useEffect(() => { setHoverIdx(null); }, [labels.length, series.length]);

  const { yMin, yMax, plotW, plotH } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const s of series) {
      for (const v of s.values) {
        if (v != null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    const padding = Math.max((max - min) * 0.1, 1);
    return {
      yMin: min < 0 ? min - padding : 0,
      yMax: max + padding,
      plotW: CHART_W - PAD.left - PAD.right,
      plotH: CHART_H - PAD.top - PAD.bottom,
    };
  }, [series]);

  const yRange = yMax - yMin || 1;
  const groupCount = labels.length;
  const seriesCount = series.length;
  const groupW = plotW / groupCount;
  const barW = Math.min(groupW * 0.7 / seriesCount, 28);
  const zeroY = PAD.top + plotH - ((0 - yMin) / yRange) * plotH;

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (yMax - yMin) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(yMin + step * i);
    }
    return ticks;
  }, [yMin, yMax]);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Y gridlines + labels */}
      {yTicks.map((v, i) => {
        const y = PAD.top + plotH - ((v - yMin) / yRange) * plotH;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y}
              stroke={GRID_STROKE} strokeWidth={0.5} />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end"
              className={AXIS_TEXT_CLASS} fontSize={AXIS_FONT_SIZE} fontFamily={AXIS_FONT_FAMILY}>
              {formatValue(v)}
            </text>
          </g>
        );
      })}

      {/* Zero line */}
      {yMin < 0 && (
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={zeroY} y2={zeroY}
          stroke={ZERO_STROKE} strokeWidth={0.5} strokeDasharray="3,3" />
      )}

      {/* Bars */}
      {labels.map((_, gi) => {
        const groupX = PAD.left + gi * groupW + groupW / 2;
        const totalBarWidth = seriesCount * barW + (seriesCount - 1) * 1;
        const startX = groupX - totalBarWidth / 2;
        const isHovered = hoverIdx === gi;

        return (
          <g key={gi}>
            {/* Hover zone */}
            <rect x={PAD.left + gi * groupW} y={PAD.top} width={groupW} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(gi)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: 'default' }}
            />
            {series.map((s, si) => {
              const v = s.values[gi];
              if (v == null) return null;
              const barX = startX + si * (barW + 1);
              const barTop = PAD.top + plotH - ((Math.max(v, 0) - yMin) / yRange) * plotH;
              const barBottom = PAD.top + plotH - ((Math.min(v, 0) - yMin) / yRange) * plotH;
              const barH = Math.max(barBottom - barTop, 1);
              return (
                <g key={si} style={{ pointerEvents: 'none' }}>
                  {/* Opaque backing — keeps the gridlines from reading through */}
                  <rect x={barX} y={barTop} width={barW} height={barH} rx={1.5} className={BAR_BACKING_CLASS} />
                  <rect x={barX} y={barTop} width={barW} height={barH} rx={1.5}
                    fill={s.color} opacity={isHovered ? 1 : BAR_REST_OPACITY}
                    style={{ transition: 'opacity 0.15s' }} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* X labels */}
      {labels.map((label, i) => {
        const x = PAD.left + i * groupW + groupW / 2;
        return (
          <text key={i} x={x} y={CHART_H - 5} textAnchor="middle"
            className={AXIS_TEXT_CLASS} fontSize={AXIS_FONT_SIZE} fontFamily={AXIS_FONT_FAMILY}>
            {label}
          </text>
        );
      })}

      {/* Hover tooltip */}
      {hoverIdx != null && (() => {
        const gx = PAD.left + hoverIdx * groupW + groupW / 2;
        const tooltipX = gx > CHART_W * 0.75 ? gx - 80 : gx + 8;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={gx} x2={gx} y1={PAD.top} y2={PAD.top + plotH}
              stroke={CROSSHAIR_STROKE} strokeWidth={0.5} />
            <rect x={tooltipX - 4} y={PAD.top + 2} width={76} height={8 + series.length * 11}
              rx={3} fill={TOOLTIP_FILL} />
            <text x={tooltipX} y={PAD.top + 10} fontSize={TOOLTIP_FONT_SIZE} fill="rgba(255,255,255,0.5)"
              fontFamily={AXIS_FONT_FAMILY}>{labels[hoverIdx]}</text>
            {series.map((s, si) => {
              const v = s.values[hoverIdx];
              return (
                <g key={si}>
                  <rect x={tooltipX} y={PAD.top + 14 + si * 11} width={5} height={5} rx={1} fill={s.color} />
                  <text x={tooltipX + 8} y={PAD.top + 18.5 + si * 11} fontSize={TOOLTIP_FONT_SIZE} fill="white"
                    fontFamily={AXIS_FONT_FAMILY}>
                    {s.label}: {v != null ? formatValue(v) : '-'}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

/* ─── Tab Chart Builders ────────────────────────────────────────────── */

function IncomeChart({ data, period }: { data: ParsedIncomeStatement[]; period: PeriodToggle }) {
  const sorted = useMemo(() => [...data].reverse().slice(-10), [data]);
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  const labels = sorted.map(d => fmt(d.fiscalDateEnding));
  const series: BarSeries[] = [
    { label: 'Revenue', color: BLUE, values: sorted.map(d => d.totalRevenue) },
    { label: 'Net Income', color: GREEN, values: sorted.map(d => d.netIncome) },
  ];
  return (
    <>
      <ChartLegend items={series} />
      <BarChart labels={labels} series={series} />
    </>
  );
}

function CashFlowChart({ data, period }: { data: ParsedCashFlow[]; period: PeriodToggle }) {
  const sorted = useMemo(() => [...data].reverse().slice(-10), [data]);
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  const labels = sorted.map(d => fmt(d.fiscalDateEnding));
  const series: BarSeries[] = [
    { label: 'Operating CF', color: BLUE, values: sorted.map(d => d.operatingCashflow) },
    { label: 'Free CF', color: GREEN, values: sorted.map(d => d.freeCashFlow) },
  ];
  return (
    <>
      <ChartLegend items={series} />
      <BarChart labels={labels} series={series} />
    </>
  );
}

function BalanceChart({ data, period }: { data: ParsedBalanceSheet[]; period: PeriodToggle }) {
  const sorted = useMemo(() => [...data].reverse().slice(-10), [data]);
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  const labels = sorted.map(d => fmt(d.fiscalDateEnding));
  const series: BarSeries[] = [
    { label: 'Assets', color: BLUE, values: sorted.map(d => d.totalAssets) },
    { label: 'Liabilities', color: RED, values: sorted.map(d => d.totalLiabilities) },
    { label: 'Equity', color: GREEN, values: sorted.map(d => d.totalShareholderEquity) },
  ];
  return (
    <>
      <ChartLegend items={series} />
      <BarChart labels={labels} series={series} />
    </>
  );
}

/* ─── Tables (kept for detail below charts) ─────────────────────────── */

function RevenueTable({ data, period }: { data: ParsedIncomeStatement[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
            <th className="text-left py-2 pr-3 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Revenue</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Gross Profit</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Net Income</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.totalRevenue)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.grossProfit)}</td>
              <td className={`py-2 px-2 text-right ${row.netIncome != null && row.netIncome < 0 ? 'text-rh-red' : 'text-rh-light-text/90 dark:text-white'}`}>
                {formatLargeNumber(row.netIncome)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.ebitda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceTable({ data, period }: { data: ParsedBalanceSheet[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
            <th className="text-left py-2 pr-3 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Total Assets</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Liabilities</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Equity</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Cash</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.totalAssets)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.totalLiabilities)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.totalShareholderEquity)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.cashAndEquivalents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashFlowTable({ data, period }: { data: ParsedCashFlow[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
            <th className="text-left py-2 pr-3 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Operating CF</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">CapEx</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Free CF</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider">Net Income</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.operatingCashflow)}</td>
              <td className="py-2 px-2 text-right text-rh-red">{formatLargeNumber(row.capitalExpenditures)}</td>
              <td className={`py-2 px-2 text-right ${row.freeCashFlow != null && row.freeCashFlow < 0 ? 'text-rh-red' : 'text-rh-green'}`}>
                {formatLargeNumber(row.freeCashFlow)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white">{formatLargeNumber(row.netIncome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Key Metrics ───────────────────────────────────────────────────── */

function formatRatio(n: number | null): string {
  if (n == null) return '—';
  // A deep-value name can price at 0.003x sales. Rounding that to "0.00" reads
  // as broken in a grid where unavailable metrics are dropped entirely.
  if (n > 0 && n < 0.01) return '<0.01';
  return n.toFixed(2);
}

function formatPercent(n: number | null, withSign = false): string {
  if (n == null) return '—';
  const pct = n * 100;
  const sign = withSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/** Money with the sign outside the currency symbol: -$83.9M, never $-83.9M. */
function formatMoney(n: number | null): string {
  if (n == null) return '—';
  return `${n < 0 ? '-' : ''}$${formatLargeNumber(Math.abs(n))}`;
}

function formatQuarterLabel(dateStr: string | null): string | null {
  return dateStr ? formatQuarter(dateStr) : null;
}

/* ─── Main Component ────────────────────────────────────────────────── */

const fundCache = new Map<string, { data: FundamentalsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function FundamentalsSection({ ticker, currentPrice }: { ticker: string; currentPrice?: number }) {
  const [data, setData] = useState<FundamentalsResponse | null>(fundCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!fundCache.has(ticker));
  const [tab, setTab] = useState<FundTab>('revenue');
  const [period, setPeriod] = useState<PeriodToggle>('annual');
  const [collapsed, setCollapsed] = useState(false); // Start expanded to show charts
  const [showTable, setShowTable] = useState(false);
  const requestIdRef = useRef(0);

  // Reset tab on ticker change to avoid blank panel
  useEffect(() => { setTab('revenue'); }, [ticker]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cached = fundCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(!cached);
    getFundamentals(ticker)
      .then(resp => {
        if (requestIdRef.current === requestId) {
          setData(resp);
          fundCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [ticker]);

  if (loading) {
    return (
      <div className="pt-4 pb-5 mb-6 border-b border-gray-200/10 dark:border-white/[0.04] animate-pulse">
        <div className="h-4 bg-gray-200/50 dark:bg-white/[0.06] rounded w-24 mb-4" />
        <div className="h-[160px] bg-gray-200/30 dark:bg-white/[0.03] rounded" />
      </div>
    );
  }

  const hasIncome = (data?.incomeStatements.annual.length ?? 0) > 0 || (data?.incomeStatements.quarterly.length ?? 0) > 0;
  const hasBalance = (data?.balanceSheets.annual.length ?? 0) > 0 || (data?.balanceSheets.quarterly.length ?? 0) > 0;
  const hasCash = (data?.cashFlows.annual.length ?? 0) > 0 || (data?.cashFlows.quarterly.length ?? 0) > 0;

  if (!hasIncome && !hasBalance && !hasCash) return null;

  const hasDCF = hasCash && hasIncome && currentPrice != null && currentPrice > 0;
  const tabs: { id: FundTab; label: string; available: boolean }[] = [
    { id: 'revenue', label: 'Income', available: hasIncome },
    { id: 'balance', label: 'Balance Sheet', available: hasBalance },
    { id: 'cashflow', label: 'Cash Flow', available: hasCash },
    { id: 'dcf', label: 'DCF', available: hasDCF },
  ];

  const incomeData = period === 'annual' ? data!.incomeStatements.annual : data!.incomeStatements.quarterly;
  const balanceData = period === 'annual' ? data!.balanceSheets.annual : data!.balanceSheets.quarterly;
  const cashData = period === 'annual' ? data!.cashFlows.annual : data!.cashFlows.quarterly;

  const derived = computeDerivedMetrics(data, currentPrice);
  // Which two quarters the YoY figures actually compare — single-quarter YoY is
  // seasonal, and the Annual/Quarterly toggle sits right below, so an
  // unqualified "Revenue (YoY)" reads as though it follows that selection.
  const yoyDetail = derived.yoyLatestPeriod && derived.yoyComparisonPeriod
    ? `${formatQuarterLabel(derived.yoyLatestPeriod)} vs ${formatQuarterLabel(derived.yoyComparisonPeriod)}`
    : undefined;

  // EV / EBITDA is deliberately absent. The API derives EBITDA as operating
  // income + (operating cash flow - net income) whenever the provider omits it,
  // which folds in stock comp and working-capital movement — biasing EBITDA
  // high and the multiple low, always in the same direction. A multiple that
  // makes every company look cheaper than it is has no place next to real ones.
  const metrics: Metric[] = [
    { label: 'Price / Sales', value: formatRatio(derived.priceToSales) },
    { label: 'Price / Book', value: formatRatio(derived.priceToBook) },
    {
      label: 'FCF Yield',
      value: formatPercent(derived.fcfYield),
      detail: derived.fcfPerShare != null && currentPrice != null
        ? `$${derived.fcfPerShare.toFixed(2)} / $${currentPrice.toFixed(2)}`
        : undefined,
      signed: derived.fcfYield,
    },
    // No sign colour on operating margin: every profitable company would paint
    // green, including one earning a dreadful 0.4%. The colour would imply a
    // verdict the sign can't support.
    { label: 'Operating Margin', value: formatPercent(derived.operatingMargin) },
    { label: 'Revenue (YoY)', value: formatPercent(derived.revenueGrowthYoY, true), detail: yoyDetail, signed: derived.revenueGrowthYoY },
    { label: 'Earnings (YoY)', value: formatPercent(derived.earningsGrowthYoY, true), detail: yoyDetail, signed: derived.earningsGrowthYoY },
    {
      // Most large caps run net debt by design, so this is a fact, not a fault
      // — named for what it is, and left uncoloured.
      label: derived.netCash != null && derived.netCash < 0 ? 'Net Debt' : 'Net Cash',
      value: derived.netCash == null ? '—' : formatMoney(Math.abs(derived.netCash)),
      // Named with its period: the providers leave cash and debt null on most
      // recent filings, so this often comes from an older sheet, and an
      // unlabelled figure would read as current.
      detail: derived.cash != null && derived.totalDebt != null
        ? `${formatMoney(derived.cash)} cash · ${formatMoney(derived.totalDebt)} debt${
          derived.balanceAsOf ? ` · ${formatQuarterLabel(derived.balanceAsOf)}` : ''}`
        : undefined,
    },
  ].filter(m => m.value !== '—');

  const latestIncome = incomeData[0];
  const summaryText = latestIncome
    ? `Revenue ${formatLargeNumber(latestIncome.totalRevenue)} · Net Income ${formatLargeNumber(latestIncome.netIncome)}`
    : `${tabs.filter(t => t.available).map(t => t.label).join(', ')} available`;

  return (
    <div className="pt-4 pb-5 mb-6 border-b border-gray-200/10 dark:border-white/[0.04]">
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex-1 min-w-0">
          {/* Section-header recipe, matching Key Statistics and Earnings */}
          <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-text dark:text-white">
            <span className="w-0.5 h-3.5 bg-rh-green rounded-full" />
            Financials
          </h2>
          {collapsed && (
            // Indented past the green bar so it aligns with the label text.
            <p className="pl-2.5 text-[11px] text-rh-light-text dark:text-white/80 mt-1 truncate">{summaryText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.dataAge === 'stale' && (
            <span className="text-[10px] text-rh-light-text dark:text-white/80">stale data</span>
          )}
          <svg
            className={`w-4 h-4 text-rh-light-text dark:text-white/80 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3">
          {/* Key metrics — all derived from data already in this response, so
              they cost no extra request. Anything that can't be computed
              honestly renders as an em dash rather than a zero. */}
          {metrics.length > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-200/40 dark:border-white/[0.06]">
              <MetricGrid metrics={metrics} />
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between mb-2">
            {/* Tab bar */}
            <div className="flex gap-1">
              {tabs.filter(t => t.available).map(t => (
                <button
                  key={t.id}
                  onClick={(e) => { e.stopPropagation(); setTab(t.id); }}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors
                    ${tab === t.id
                      ? 'bg-white dark:bg-white/[0.08] text-rh-green shadow-sm'
                      : 'text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-rh-text'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Period toggle (hidden for DCF) */}
            {tab !== 'dcf' && (
              <div className="flex gap-0.5 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-0.5">
                {(['annual', 'quarterly'] as PeriodToggle[]).map(p => (
                  <button
                    key={p}
                    onClick={(e) => { e.stopPropagation(); setPeriod(p); }}
                    className={`px-2.5 py-0.5 text-[10px] font-medium rounded-md transition-colors
                      ${period === p
                        ? 'bg-white dark:bg-white/[0.06] text-rh-green shadow-sm'
                        : 'text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text'
                      }`}
                  >
                    {p === 'annual' ? 'Annual' : 'Quarterly'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="mb-2">
            {tab === 'revenue' && <IncomeChart data={incomeData} period={period} />}
            {tab === 'balance' && <BalanceChart data={balanceData} period={period} />}
            {tab === 'cashflow' && <CashFlowChart data={cashData} period={period} />}
            {tab === 'dcf' && data && currentPrice != null && (
              <DCFCalculator key={ticker} data={data} currentPrice={currentPrice} />
            )}
          </div>

          {/* Show/hide table toggle (not for DCF) */}
          {tab !== 'dcf' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowTable(t => !t); }}
                className="text-[10px] text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-white/80 transition-colors mb-2"
              >
                {showTable ? 'Hide details' : 'Show details'}
              </button>

              {/* Table detail (collapsible) */}
              {showTable && (
                <div className="border-t border-gray-200/20 dark:border-white/[0.04] pt-3">
                  {tab === 'revenue' && <RevenueTable data={incomeData} period={period} />}
                  {tab === 'balance' && <BalanceTable data={balanceData} period={period} />}
                  {tab === 'cashflow' && <CashFlowTable data={cashData} period={period} />}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
