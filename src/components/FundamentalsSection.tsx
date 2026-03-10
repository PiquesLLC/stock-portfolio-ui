import { useState, useEffect, useRef, useMemo } from 'react';
import { FundamentalsResponse, ParsedIncomeStatement, ParsedBalanceSheet, ParsedCashFlow } from '../types';
import { getFundamentals } from '../api';

type FundTab = 'revenue' | 'balance' | 'cashflow';
type PeriodToggle = 'annual' | 'quarterly';

const GREEN = '#00c805';
const RED = '#ff3b30';
const BLUE = '#3b82f6';

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

const CHART_W = 600;
const CHART_H = 180;
const PAD = { top: 8, right: 8, bottom: 28, left: 54 };

function BarChart({ labels, series, formatValue = formatLargeNumber }: BarChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
              stroke="rgba(150,150,150,0.1)" strokeWidth={0.5} />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end"
              className="fill-gray-400 dark:fill-white/25" fontSize="7" fontFamily="system-ui">
              {formatValue(v)}
            </text>
          </g>
        );
      })}

      {/* Zero line */}
      {yMin < 0 && (
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={zeroY} y2={zeroY}
          stroke="rgba(150,150,150,0.25)" strokeWidth={0.5} strokeDasharray="3,3" />
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
                <rect key={si} x={barX} y={barTop} width={barW} height={barH} rx={1.5}
                  fill={s.color} opacity={isHovered ? 1 : 0.7}
                  style={{ transition: 'opacity 0.15s' }} />
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
            className="fill-gray-400 dark:fill-white/25" fontSize="7" fontFamily="system-ui">
            {label}
          </text>
        );
      })}

      {/* Hover tooltip */}
      {hoverIdx != null && (() => {
        const gx = PAD.left + hoverIdx * groupW + groupW / 2;
        const tooltipX = gx > CHART_W * 0.75 ? gx - 80 : gx + 8;
        return (
          <g>
            <line x1={gx} x2={gx} y1={PAD.top} y2={PAD.top + plotH}
              stroke="rgba(150,150,150,0.2)" strokeWidth={0.5} />
            <rect x={tooltipX - 4} y={PAD.top + 2} width={76} height={8 + series.length * 11}
              rx={3} fill="rgba(0,0,0,0.8)" />
            <text x={tooltipX} y={PAD.top + 10} fontSize="6.5" fill="rgba(255,255,255,0.5)"
              fontFamily="system-ui">{labels[hoverIdx]}</text>
            {series.map((s, si) => {
              const v = s.values[hoverIdx];
              return (
                <g key={si}>
                  <rect x={tooltipX} y={PAD.top + 14 + si * 11} width={5} height={5} rx={1} fill={s.color} />
                  <text x={tooltipX + 8} y={PAD.top + 18.5 + si * 11} fontSize="6.5" fill="white"
                    fontFamily="system-ui">
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

/* ─── Legend ─────────────────────────────────────────────────────────── */

function ChartLegend({ series }: { series: BarSeries[] }) {
  return (
    <div className="flex gap-3 mb-1 justify-end">
      {series.map(s => (
        <div key={s.label} className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="text-[9px] text-gray-400 dark:text-white/30">{s.label}</span>
        </div>
      ))}
    </div>
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
      <ChartLegend series={series} />
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
      <ChartLegend series={series} />
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
      <ChartLegend series={series} />
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
            <th className="text-left py-2 pr-3 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Revenue</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Gross Profit</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Net Income</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white/85 font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.totalRevenue)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.grossProfit)}</td>
              <td className={`py-2 px-2 text-right ${row.netIncome != null && row.netIncome < 0 ? 'text-rh-red' : 'text-rh-light-text/90 dark:text-white/85'}`}>
                {formatLargeNumber(row.netIncome)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.ebitda)}</td>
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
            <th className="text-left py-2 pr-3 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Total Assets</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Liabilities</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Equity</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Cash</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white/85 font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.totalAssets)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.totalLiabilities)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.totalShareholderEquity)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.cashAndEquivalents)}</td>
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
            <th className="text-left py-2 pr-3 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Period</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Operating CF</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">CapEx</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Free CF</th>
            <th className="text-right py-2 px-2 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Net Income</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
              <td className="py-2 pr-3 text-rh-light-text/90 dark:text-white/85 font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.operatingCashflow)}</td>
              <td className="py-2 px-2 text-right text-rh-red">{formatLargeNumber(row.capitalExpenditures)}</td>
              <td className={`py-2 px-2 text-right ${row.freeCashFlow != null && row.freeCashFlow < 0 ? 'text-rh-red' : 'text-rh-green'}`}>
                {formatLargeNumber(row.freeCashFlow)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text/90 dark:text-white/85">{formatLargeNumber(row.netIncome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────── */

const fundCache = new Map<string, { data: FundamentalsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function FundamentalsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<FundamentalsResponse | null>(fundCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!fundCache.has(ticker));
  const [tab, setTab] = useState<FundTab>('revenue');
  const [period, setPeriod] = useState<PeriodToggle>('annual');
  const [collapsed, setCollapsed] = useState(false); // Start expanded to show charts
  const [showTable, setShowTable] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const cached = fundCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setLoading(!cached);
    getFundamentals(ticker)
      .then(resp => {
        if (mountedRef.current) {
          setData(resp);
          fundCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => { mountedRef.current = false; };
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-5 mb-6 animate-pulse">
        <div className="h-4 bg-gray-200/50 dark:bg-white/[0.06] rounded w-24 mb-4" />
        <div className="h-[160px] bg-gray-200/30 dark:bg-white/[0.03] rounded" />
      </div>
    );
  }

  const hasIncome = (data?.incomeStatements.annual.length ?? 0) > 0 || (data?.incomeStatements.quarterly.length ?? 0) > 0;
  const hasBalance = (data?.balanceSheets.annual.length ?? 0) > 0 || (data?.balanceSheets.quarterly.length ?? 0) > 0;
  const hasCash = (data?.cashFlows.annual.length ?? 0) > 0 || (data?.cashFlows.quarterly.length ?? 0) > 0;

  if (!hasIncome && !hasBalance && !hasCash) return null;

  const tabs: { id: FundTab; label: string; available: boolean }[] = [
    { id: 'revenue', label: 'Income', available: hasIncome },
    { id: 'balance', label: 'Balance Sheet', available: hasBalance },
    { id: 'cashflow', label: 'Cash Flow', available: hasCash },
  ];

  const incomeData = period === 'annual' ? data!.incomeStatements.annual : data!.incomeStatements.quarterly;
  const balanceData = period === 'annual' ? data!.balanceSheets.annual : data!.balanceSheets.quarterly;
  const cashData = period === 'annual' ? data!.cashFlows.annual : data!.cashFlows.quarterly;

  const latestIncome = incomeData[0];
  const summaryText = latestIncome
    ? `Revenue ${formatLargeNumber(latestIncome.totalRevenue)} · Net Income ${formatLargeNumber(latestIncome.netIncome)}`
    : `${tabs.filter(t => t.available).map(t => t.label).join(', ')} available`;

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200/40 dark:border-white/[0.06] rounded-xl p-5 mb-6">
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">Financials</h3>
          {collapsed && (
            <p className="text-xs text-rh-light-muted/60 dark:text-white/30 mt-1 truncate">{summaryText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.dataAge === 'stale' && (
            <span className="text-[10px] text-rh-light-muted/40 dark:text-white/20">stale data</span>
          )}
          <svg
            className={`w-4 h-4 text-rh-light-muted/40 dark:text-white/20 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3">
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
                      : 'text-rh-light-muted/50 dark:text-white/25 hover:text-rh-light-text dark:hover:text-rh-text'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Period toggle */}
            <div className="flex gap-0.5 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-0.5">
              {(['annual', 'quarterly'] as PeriodToggle[]).map(p => (
                <button
                  key={p}
                  onClick={(e) => { e.stopPropagation(); setPeriod(p); }}
                  className={`px-2.5 py-0.5 text-[10px] font-medium rounded-md transition-colors
                    ${period === p
                      ? 'bg-white dark:bg-white/[0.06] text-rh-green shadow-sm'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                    }`}
                >
                  {p === 'annual' ? 'Annual' : 'Quarterly'}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="mb-2">
            {tab === 'revenue' && <IncomeChart data={incomeData} period={period} />}
            {tab === 'balance' && <BalanceChart data={balanceData} period={period} />}
            {tab === 'cashflow' && <CashFlowChart data={cashData} period={period} />}
          </div>

          {/* Show/hide table toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowTable(t => !t); }}
            className="text-[10px] text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-text dark:hover:text-white/50 transition-colors mb-2"
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
        </div>
      )}
    </div>
  );
}
