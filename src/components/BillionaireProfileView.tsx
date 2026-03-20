import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BillionaireProfile, BillionaireChartData } from '../types';
import { getBillionaireProfile, getBillionaireChart, getStockQuote } from '../api';

// ── Constants ────────────────────────────────────────────────
const CHART_H = 380;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;

const PERIODS = ['1D', '1W', '1M', '3M', 'YTD', '1Y'] as const;
type ChartPeriod = (typeof PERIODS)[number];

interface HoldingRow {
  ticker: string;
  shares: number;
  note?: string;
  price: number | null;
  value: number | null;
}

// ── Props ────────────────────────────────────────────────────
interface BillionaireProfileViewProps {
  slug: string;
  onBack: () => void;
  onStockClick?: (ticker: string) => void;
}

// ── Formatting helpers ───────────────────────────────────────
function fmtBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function fmtChangeBillions(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

function fmtPct(value: number | null): string {
  if (value == null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtChartDate(ms: number, is1D: boolean): string {
  const d = new Date(ms);
  if (is1D) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Component ────────────────────────────────────────────────
export function BillionaireProfileView({ slug, onBack, onStockClick }: BillionaireProfileViewProps) {
  const [profile, setProfile] = useState<BillionaireProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const [chartData, setChartData] = useState<BillionaireChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');

  const [holdingRows, setHoldingRows] = useState<HoldingRow[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);

  const [activeChangePeriod, setActiveChangePeriod] = useState<'day' | 'week' | 'month' | 'ytd'>('day');

  // ── Fetch profile ──────────────────────────────────────────
  useEffect(() => {
    setProfileLoading(true);
    setProfileError(false);
    getBillionaireProfile(slug)
      .then(setProfile)
      .catch(() => setProfileError(true))
      .finally(() => setProfileLoading(false));
  }, [slug]);

  // ── Fetch chart ────────────────────────────────────────────
  useEffect(() => {
    setChartLoading(true);
    getBillionaireChart(slug, chartPeriod)
      .then(setChartData)
      .catch(() => setChartData(null))
      .finally(() => setChartLoading(false));
  }, [slug, chartPeriod]);

  // ── Fetch stock prices for holdings ────────────────────────
  useEffect(() => {
    if (!profile) return;
    const holdings = profile.holdingsParsed;
    if (!holdings || holdings.length === 0) {
      setHoldingRows([]);
      setHoldingsLoading(false);
      return;
    }

    setHoldingsLoading(true);
    const promises = holdings.map(async (h) => {
      try {
        const quote = await getStockQuote(h.ticker);
        const price = quote?.currentPrice ?? null;
        return {
          ticker: h.ticker,
          shares: h.shares,
          note: h.note,
          price,
          value: price != null ? price * h.shares : null,
        };
      } catch {
        return { ticker: h.ticker, shares: h.shares, note: h.note, price: null, value: null };
      }
    });

    Promise.all(promises).then((rows) => {
      // Sort by value descending
      rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      setHoldingRows(rows);
      setHoldingsLoading(false);
    });
  }, [profile]);

  // ── Measure chart container ────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Chart geometry ─────────────────────────────────────────
  const chartGeo = useMemo(() => {
    if (!chartData || chartData.points.length < 2) return null;
    const pts = chartData.points;
    const minVal = Math.min(...pts.map((p) => p.value));
    const maxVal = Math.max(...pts.map((p) => p.value));
    const range = maxVal - minVal || 1;
    const w = chartWidth;
    const h = CHART_H;
    const drawH = h - PAD_TOP - PAD_BOTTOM;

    const coords = pts.map((p, i) => ({
      x: pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w,
      y: PAD_TOP + drawH - ((p.value - minVal) / range) * drawH,
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');

    const lastValue = pts[pts.length - 1].value;
    const isUp = lastValue >= chartData.periodStartValue;

    return { coords, pathD, isUp, minVal, maxVal };
  }, [chartData, chartWidth]);

  // ── Hover handlers ─────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!chartGeo || !chartData || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // Find nearest point
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < chartGeo.coords.length; i++) {
        const dist = Math.abs(chartGeo.coords[i].x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoverIndex(closest);
    },
    [chartGeo, chartData],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (!chartGeo || !chartData || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const touchX = e.touches[0].clientX - rect.left;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < chartGeo.coords.length; i++) {
        const dist = Math.abs(chartGeo.coords[i].x - touchX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoverIndex(closest);
    },
    [chartGeo, chartData],
  );

  // ── Derived values ─────────────────────────────────────────
  const baseNetWorth = profile?.baseNetWorthUsd ?? 0;
  const netWorth = profile?.computedNetWorth;

  const activeChange = useMemo(() => {
    if (!profile) return { dollar: null, pct: null };
    switch (activeChangePeriod) {
      case 'day':
        return { dollar: profile.dayChange, pct: profile.dayChangePct };
      case 'week':
        return { dollar: profile.weekChange, pct: profile.weekChange != null && netWorth != null ? (profile.weekChange / (netWorth - profile.weekChange)) * 100 : null };
      case 'month':
        return { dollar: profile.monthChange, pct: profile.monthChange != null && netWorth != null ? (profile.monthChange / (netWorth - profile.monthChange)) * 100 : null };
      case 'ytd':
        return { dollar: profile.ytdChange, pct: profile.ytdChange != null && netWorth != null ? (profile.ytdChange / (netWorth - profile.ytdChange)) * 100 : null };
      default:
        return { dollar: null, pct: null };
    }
  }, [profile, activeChangePeriod, netWorth]);

  const lineColor = chartGeo?.isUp ? '#00C805' : '#E8544E';

  // ── Hover display values ───────────────────────────────────
  const hoverValue = hoverIndex != null && chartData ? chartData.points[hoverIndex]?.value : null;
  const hoverTime = hoverIndex != null && chartData ? chartData.points[hoverIndex]?.time : null;
  const hoverChange = hoverValue != null && chartData ? hoverValue - chartData.periodStartValue : null;
  const hoverChangePct = hoverChange != null && chartData && chartData.periodStartValue !== 0 ? (hoverChange / chartData.periodStartValue) * 100 : null;

  // ── Loading state ──────────────────────────────────────────
  if (profileLoading) {
    return (
      <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-3 sm:px-6 pt-2 pb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leaderboard
        </button>
        {/* Skeleton */}
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-gray-200 dark:bg-white/[0.06] rounded" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-white/[0.06] rounded" />
            </div>
          </div>
          <div className="h-12 w-56 bg-gray-200 dark:bg-white/[0.06] rounded" />
          <div className="h-[380px] w-full bg-gray-200 dark:bg-white/[0.06] rounded" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-gray-200 dark:bg-white/[0.06] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (profileError || !profile) {
    return (
      <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-3 sm:px-6 pt-2 pb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leaderboard
        </button>
        <p className="text-rh-light-muted dark:text-rh-muted text-sm">Failed to load billionaire data</p>
      </div>
    );
  }

  // ── Change period data ─────────────────────────────────────
  const changePeriods: { id: 'day' | 'week' | 'month' | 'ytd'; label: string; dollar: number | null; pct: number | null }[] = [
    { id: 'day', label: 'Day', dollar: profile.dayChange, pct: profile.dayChangePct },
    {
      id: 'week',
      label: 'Week',
      dollar: profile.weekChange,
      pct: profile.weekChange != null && netWorth != null && netWorth !== profile.weekChange
        ? (profile.weekChange / (netWorth - profile.weekChange)) * 100
        : null,
    },
    {
      id: 'month',
      label: 'Month',
      dollar: profile.monthChange,
      pct: profile.monthChange != null && netWorth != null && netWorth !== profile.monthChange
        ? (profile.monthChange / (netWorth - profile.monthChange)) * 100
        : null,
    },
    {
      id: 'ytd',
      label: 'YTD',
      dollar: profile.ytdChange,
      pct: profile.ytdChange != null && netWorth != null && netWorth !== profile.ytdChange
        ? (profile.ytdChange / (netWorth - profile.ytdChange)) * 100
        : null,
    },
  ];

  const isActiveUp = (activeChange.dollar ?? 0) >= 0;
  const changeColor = activeChange.dollar == null ? 'text-rh-light-muted dark:text-rh-muted' : isActiveUp ? 'text-rh-green' : 'text-rh-red';

  return (
    <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-3 sm:px-6 pt-2 pb-6">
      {/* ── Back button ─────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Leaderboard
      </button>

      {/* ── Hero section ────────────────────────────────────── */}
      <div className="flex items-start gap-4 mb-6">
        {/* Photo / initial */}
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={profile.name}
            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-rh-green/10 flex items-center justify-center text-xl font-bold text-rh-green flex-shrink-0">
            {profile.name.charAt(0)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-rh-light-text dark:text-rh-text">{profile.name}</h1>
            {profile.rank != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-rh-green bg-rh-green/10 rounded-full">
                #{profile.rank}
              </span>
            )}
          </div>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mt-0.5">
            {profile.company}
            {profile.title && <span className="text-rh-light-muted/50 dark:text-rh-muted/50"> &middot; {profile.title}</span>}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {profile.country && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-rh-light-muted/60 dark:text-rh-muted/60 border border-gray-200/20 dark:border-white/[0.06] rounded-full">
                {profile.country}
              </span>
            )}
            {profile.industry && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-rh-light-muted/60 dark:text-rh-muted/60 border border-gray-200/20 dark:border-white/[0.06] rounded-full">
                {profile.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Net Worth Hero ──────────────────────────────────── */}
      <div className="mb-2">
        <div className="text-[36px] sm:text-[48px] font-bold tabular-nums text-rh-light-text dark:text-rh-text leading-tight">
          {hoverValue != null ? fmtBillions(hoverValue) : netWorth != null ? fmtBillions(netWorth) : '--'}
        </div>
        <div className={`text-sm font-medium tabular-nums mt-0.5 ${hoverIndex != null ? (hoverChange != null && hoverChange >= 0 ? 'text-rh-green' : 'text-rh-red') : changeColor}`}>
          {hoverIndex != null ? (
            <>
              {hoverChange != null ? fmtChangeBillions(hoverChange) : '--'}
              {hoverChangePct != null && <span className="ml-1">({fmtPct(hoverChangePct)})</span>}
              {hoverTime != null && (
                <span className="ml-2 text-rh-light-muted/50 dark:text-rh-muted/50 text-xs">
                  {fmtChartDate(hoverTime, chartPeriod === '1D')}
                </span>
              )}
            </>
          ) : (
            <>
              {activeChange.dollar != null ? fmtChangeBillions(activeChange.dollar) : '--'}
              {activeChange.pct != null && <span className="ml-1">({fmtPct(activeChange.pct)})</span>}
            </>
          )}
        </div>
      </div>

      {/* ── Change period pills ─────────────────────────────── */}
      <div className="flex items-center gap-0 -ml-1 mb-4">
        {changePeriods.map((cp) => {
          const isActive = activeChangePeriod === cp.id;
          const cpIsUp = (cp.dollar ?? 0) >= 0;
          const cpColor = cp.dollar == null ? 'text-rh-light-muted/40 dark:text-rh-muted/40' : cpIsUp ? 'text-rh-green' : 'text-rh-red';
          return (
            <button
              key={cp.id}
              onClick={() => setActiveChangePeriod(cp.id)}
              className={`relative px-2.5 py-2 text-[12px] font-medium transition-all duration-150 ${
                isActive ? cpColor : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
              }`}
            >
              {cp.label}
              {cp.dollar != null && (
                <span className={`ml-1 text-[11px] ${isActive ? '' : 'opacity-60'}`}>
                  {fmtPct(cp.pct)}
                </span>
              )}
              {isActive && (
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full ${cp.dollar == null ? 'bg-white/30' : cpIsUp ? 'bg-rh-green' : 'bg-rh-red'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Chart ───────────────────────────────────────────── */}
      <div ref={containerRef} className="mb-6" style={{ maxHeight: 'min(50vh, 480px)' }}>
        {/* Period selector */}
        <div className="flex items-center gap-0 -ml-1 mb-3">
          {PERIODS.map((p) => {
            const isActive = chartPeriod === p;
            const periodColor = chartGeo?.isUp ? 'text-rh-green' : chartGeo ? 'text-rh-red' : 'text-rh-green';
            return (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                  isActive ? periodColor : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
                }`}
              >
                {p}
                {isActive && (
                  <span
                    className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full ${
                      chartGeo?.isUp ? 'bg-rh-green' : chartGeo ? 'bg-rh-red' : 'bg-rh-green'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {chartLoading ? (
          <div className="animate-pulse w-full rounded" style={{ height: CHART_H }}>
            <div className="w-full h-full bg-gray-200 dark:bg-white/[0.06] rounded" />
          </div>
        ) : chartGeo && chartData && chartData.points.length >= 2 ? (
          <svg
            ref={svgRef}
            width={chartWidth}
            height={CHART_H}
            viewBox={`0 0 ${chartWidth} ${CHART_H}`}
            className="cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseLeave}
          >
            {/* Chart line */}
            <path
              d={chartGeo.pathD}
              fill="none"
              stroke={lineColor}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Hover crosshair + dot */}
            {hoverIndex != null && chartGeo.coords[hoverIndex] && (
              <>
                {/* Vertical crosshair line */}
                <line
                  x1={chartGeo.coords[hoverIndex].x}
                  y1={PAD_TOP}
                  x2={chartGeo.coords[hoverIndex].x}
                  y2={CHART_H - PAD_BOTTOM}
                  stroke={lineColor}
                  strokeWidth={0.5}
                  opacity={0.4}
                />
                {/* Dot on line */}
                <circle
                  cx={chartGeo.coords[hoverIndex].x}
                  cy={chartGeo.coords[hoverIndex].y}
                  r={4}
                  fill={lineColor}
                  stroke="white"
                  strokeWidth={1.5}
                />
              </>
            )}
          </svg>
        ) : (
          <div
            className="flex items-center justify-center text-rh-light-muted/40 dark:text-rh-muted/40 text-sm"
            style={{ height: CHART_H }}
          >
            No chart data available
          </div>
        )}
      </div>

      {/* ── Holdings Breakdown ──────────────────────────────── */}
      <div className="mb-8">
        {/* Section header with green left bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-[3px] h-4 bg-rh-green rounded-full" />
          <h2 className="text-[11px] font-bold tracking-wider uppercase text-rh-light-muted/50 dark:text-rh-muted/50">
            Public Holdings
          </h2>
        </div>

        {holdingsLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-gray-200 dark:bg-white/[0.06] rounded" />
            ))}
          </div>
        ) : holdingRows.length === 0 ? (
          <p className="text-sm text-rh-light-muted/40 dark:text-rh-muted/40">No public holdings data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200/10 dark:border-white/[0.04]">
                  <th className="text-left px-2 sm:px-3 py-2 text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50">Ticker</th>
                  <th className="text-right px-2 sm:px-3 py-2 text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50">Shares</th>
                  <th className="text-right px-2 sm:px-3 py-2 text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:table-cell">Current Price</th>
                  <th className="text-right px-2 sm:px-3 py-2 text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50">Value</th>
                  <th className="text-right px-2 sm:px-3 py-2 text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50 hidden sm:table-cell">Weight</th>
                </tr>
              </thead>
              <tbody>
                {holdingRows.map((row) => {
                  const weight = row.value != null && netWorth != null && netWorth > 0
                    ? ((row.value / netWorth) * 100).toFixed(1)
                    : '--';
                  return (
                    <tr
                      key={row.ticker}
                      className="border-b border-gray-200/10 dark:border-white/[0.04] last:border-b-0 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-2 sm:px-3 py-3.5">
                        <button
                          onClick={() => onStockClick?.(row.ticker)}
                          className="text-sm font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
                        >
                          {row.ticker}
                        </button>
                        {row.note && (
                          <span className="ml-1.5 text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">{row.note}</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-3.5 text-sm text-right text-rh-light-text dark:text-rh-text tabular-nums">
                        {row.shares.toLocaleString()}
                      </td>
                      <td className="px-2 sm:px-3 py-3.5 text-sm text-right text-rh-light-text dark:text-rh-text tabular-nums hidden sm:table-cell">
                        {row.price != null ? fmtCurrency(row.price) : '--'}
                      </td>
                      <td className="px-2 sm:px-3 py-3.5 text-sm text-right font-medium text-rh-light-text dark:text-rh-text tabular-nums">
                        {row.value != null ? fmtBillions(row.value) : '--'}
                      </td>
                      <td className="px-2 sm:px-3 py-3.5 text-sm text-right text-rh-light-muted dark:text-rh-muted tabular-nums hidden sm:table-cell">
                        {weight !== '--' ? `${weight}%` : '--'}
                      </td>
                    </tr>
                  );
                })}

                {/* Base Net Worth row — non-public wealth */}
                {baseNetWorth > 0 && (
                  <tr className="border-t border-gray-200/10 dark:border-white/[0.04]">
                    <td className="px-2 sm:px-3 py-3.5 text-sm text-rh-light-muted/60 dark:text-rh-muted/60 italic" colSpan={3}>
                      Base Net Worth (non-public assets)
                    </td>
                    <td className="px-2 sm:px-3 py-3.5 text-sm text-right font-medium text-rh-light-muted/60 dark:text-rh-muted/60 tabular-nums">
                      {fmtBillions(baseNetWorth)}
                    </td>
                    <td className="px-2 sm:px-3 py-3.5 text-sm text-right text-rh-light-muted/40 dark:text-rh-muted/40 tabular-nums hidden sm:table-cell">
                      {netWorth != null && netWorth > 0 ? `${((baseNetWorth / netWorth) * 100).toFixed(1)}%` : '--'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Data source note ────────────────────────────────── */}
      <p className="text-[11px] text-rh-light-muted/40 dark:text-rh-muted/40 leading-relaxed">
        Net worth estimates based on public SEC filings and market data. Private assets estimated.
        {profile.source && <span> Source: {profile.source}</span>}
      </p>
    </div>
  );
}
