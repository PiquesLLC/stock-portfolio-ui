import { useEffect, useState, useMemo, useId } from 'react';
import {
  getPortfolioChart,
  getIntradayCandlesWithPrevClose,
  getHourlyCandles,
  getBenchmarkCloses,
  IntradayCandle,
} from '../api';
import { PortfolioChartData, PortfolioChartPeriod, IntelligenceWindow } from '../types';
import { useIsDark } from '../hooks/useIsDark';

/**
 * Compact "You vs SPY" line chart for the Intelligence-tab hero.
 * Both series are plotted as cumulative % change from the period's start so
 * the divergence is visible regardless of dollar scale. Pure SVG, no chart
 * library, no chrome.
 *
 * Supports 1D / 5D / 1M periods. For 1D we use intraday data with timestamps
 * clamped to today's 4AM-8PM ET window. For 5D/1M we use hourly candles and
 * INDEX-BASED x positioning — that way overnight gaps, weekends, and holidays
 * don't render as flat horizontal segments interpolating across closed hours.
 */

interface Props {
  portfolioId?: string;
  height?: number; // px, default 200
  period?: IntelligenceWindow; // '1d' | '5d' | '1m'
}

const PERIOD_MAP: Record<IntelligenceWindow, PortfolioChartPeriod> = {
  '1d': '1D',
  '5d': '1W',
  '1m': '1M',
};

const PERIOD_LABEL: Record<IntelligenceWindow, string> = {
  '1d': 'TODAY',
  '5d': '5 DAYS',
  '1m': '1 MONTH',
};

// ET formatters reused across all checks.
const ET_DAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const ET_HOUR_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });

/** True if the timestamp falls inside weekday 4 AM – 8 PM ET. */
function isWeekdayTradingHours(t: number): boolean {
  const d = new Date(t);
  const wd = ET_DAY_FMT.format(d);
  if (wd === 'Sat' || wd === 'Sun') return false;
  const h = parseInt(ET_HOUR_FMT.format(d).split(':')[0], 10);
  return h >= 4 && h < 20;
}

/**
 * Compute the [start, end] ms window for the most recent ET trading day,
 * walking back from `latestPointTime` if the latest point falls on a
 * weekend or outside trading hours. Used by 1D mode to clip the chart to
 * a single day's 4 AM – 8 PM ET window — without this clip, points from
 * yesterday's after-hours and overnight create a long linear plateau in
 * the middle of the chart.
 *
 * Walks back in 6-hour steps (up to 80 attempts ≈ 20 days) so we can recover
 * across multi-day weekends or holiday closures without burning all attempts
 * inside Sunday's 24 hours.
 */
function todayTradingWindowET(latestPointTime: number): { start: number; end: number } {
  let refDate = new Date(latestPointTime);
  const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  for (let attempts = 0; attempts < 80; attempts++) {
    const wd = ET_DAY_FMT.format(refDate);
    const h = parseInt(ET_HOUR_FMT.format(refDate).split(':')[0], 10);
    if (wd !== 'Sat' && wd !== 'Sun' && h >= 4 && h < 20) break;
    refDate = new Date(refDate.getTime() - 6 * 60 * 60 * 1000); // step back 6 hours
  }
  const etDateStr = ET_DATE_FMT.format(refDate);
  // Build the 4 AM ET and 8 PM ET instants for that ET date. Convention
  // matches PortfolioValueChart's `getEtOffset`: etOffsetMs is NEGATIVE
  // when ET is behind UTC (EST = -5h, EDT = -4h), and we SUBTRACT it from
  // the literal UTC parse to land on the actual UTC instant.
  const probe = new Date(`${etDateStr}T12:00:00Z`);
  const etHour = parseInt(ET_HOUR_FMT.format(probe).split(':')[0], 10);
  const etOffsetMs = (etHour - 12) * 60 * 60 * 1000; // negative for ET behind UTC
  const start = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
  const end = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
  return { start, end };
}

export function PortfolioVsSpyMini({ portfolioId, height = 200, period = '1d' }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioChartData | null>(null);
  // For 1D we get intraday candles + prev close; for non-1D we synthesize
  // the same shape from hourly candles + the most recent daily close.
  const [spy, setSpy] = useState<{ candles: IntradayCandle[]; previousClose: number | null } | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isDark = useIsDark();
  const gradId = useId().replace(/[:.]/g, '');
  const redFillId = `pvs-red-${gradId}`;
  const greenFillId = `pvs-green-${gradId}`;

  const chartPeriod = PERIOD_MAP[period];

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setLoaded(false);
    setPortfolio(null);
    setSpy(null);

    const portfolioP = getPortfolioChart(chartPeriod, undefined, portfolioId)
      .catch(e => { console.warn('[PortfolioVsSpyMini] portfolio fetch failed:', e); return null; });

    const spyP: Promise<{ candles: IntradayCandle[]; previousClose: number | null } | null> =
      period === '1d'
        ? getIntradayCandlesWithPrevClose('SPY').catch(e => { console.warn('[PortfolioVsSpyMini] SPY intraday fetch failed:', e); return null; })
        : Promise.all([
            // chartPeriod is '1W' or '1M' here (1d is handled in the other branch)
            getHourlyCandles('SPY', chartPeriod as '1W' | '1M' | 'YTD').catch(() => null),
            getBenchmarkCloses('SPY').catch(() => null),
          ]).then(([candles, closes]) => {
            if (!candles || !Array.isArray(candles) || candles.length === 0) return null;
            // For non-1D, "previousClose" is the close of the LAST trading day
            // before the chart's first hourly candle. Fall back to first candle's
            // open if the daily-closes endpoint isn't available. BenchmarkCandle
            // uses `time: number` (ms), IntradayCandle uses `time: string`, so
            // we normalize when comparing.
            const firstTs = new Date(candles[0].time).getTime();
            const closeBeforeChart = (closes && Array.isArray(closes))
              ? closes.filter(c => c.time < firstTs).pop()
              : null;
            const previousClose = closeBeforeChart?.close ?? candles[0].open ?? null;
            return { candles: candles as IntradayCandle[], previousClose };
          });

    Promise.all([portfolioP, spyP]).then(([p, s]) => {
      if (cancelled) return;
      if (!p) { setError(true); setLoaded(true); return; }
      setPortfolio(p);
      setSpy(s); // s may be null — chart still renders You only
      setLoaded(true);
    });

    return () => { cancelled = true; };
  }, [portfolioId, chartPeriod, period]);

  /* ── Compute series ──
   * Both series MUST be sorted by time AND filtered to weekday trading hours,
   * otherwise the polyline interpolates linearly across overnight/weekend
   * gaps — the "flat horizontal stretch" artifact the user reported.
   * For 1D we keep timestamps (so the curve respects intraday tempo).
   * For 5D/1M we use INDEX-based x positioning so weekend/holiday gaps
   * aren't visible at all (each surviving point gets equal x-spacing). */

  const filterToTradingHours = period !== '1d';

  // For 1D, clip both series to TODAY's 4 AM–8 PM ET window using the most
  // recent point's date as the anchor. Without this clip, points from
  // yesterday's after-hours session linger and the polyline interpolates
  // linearly across the overnight gap — that's the flat-plateau-in-the-
  // middle-of-the-chart artifact the user reported.
  const todayWindow = useMemo(() => {
    if (period !== '1d' || !portfolio || portfolio.points.length === 0) return null;
    const latest = portfolio.points[portfolio.points.length - 1].time;
    return todayTradingWindowET(latest);
  }, [period, portfolio]);

  const youSeries = useMemo(() => {
    if (!portfolio || portfolio.points.length < 2 || !portfolio.periodStartValue) return null;
    const start = portfolio.periodStartValue;
    const filtered = portfolio.points
      .map(p => ({ t: p.time, pct: ((p.value - start) / start) * 100 }))
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.pct))
      .filter(p => {
        if (todayWindow) return p.t >= todayWindow.start && p.t <= todayWindow.end;
        if (filterToTradingHours) return isWeekdayTradingHours(p.t);
        return true;
      })
      .sort((a, b) => a.t - b.t);
    return filtered.length >= 2 ? filtered : null;
  }, [portfolio, filterToTradingHours, todayWindow]);

  const spySeries = useMemo(() => {
    if (!spy || spy.candles.length < 2 || spy.previousClose == null) return null;
    const base = spy.previousClose;
    const filtered = spy.candles
      .map(c => ({ t: new Date(c.time).getTime(), pct: ((c.close - base) / base) * 100 }))
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.pct))
      .filter(p => {
        if (todayWindow) return p.t >= todayWindow.start && p.t <= todayWindow.end;
        if (filterToTradingHours) return isWeekdayTradingHours(p.t);
        return true;
      })
      .sort((a, b) => a.t - b.t);
    return filtered.length >= 2 ? filtered : null;
  }, [spy, filterToTradingHours, todayWindow]);

  /* ── Map series to a shared x-domain (time range) and y-domain (% range) ── */

  const layout = useMemo(() => {
    if (!youSeries) return null;
    // For non-1D we drop time-based x positioning entirely and use index 0..N
    // so non-trading hours don't get rendered as flat plateaus. The two series
    // share an index space sized to the LARGER of the two so neither is squished.
    const useIndex = filterToTradingHours;
    const youLen = youSeries.length;
    const spyLen = spySeries?.length ?? 0;
    const xMin = useIndex ? 0 : Math.min(...youSeries.map(p => p.t), ...(spySeries?.map(p => p.t) ?? []));
    const xMax = useIndex ? Math.max(youLen, spyLen) - 1 : Math.max(...youSeries.map(p => p.t), ...(spySeries?.map(p => p.t) ?? []));
    const allPcts = [...youSeries.map(p => p.pct), ...(spySeries?.map(p => p.pct) ?? []), 0];
    let yMin = Math.min(...allPcts);
    let yMax = Math.max(...allPcts);
    const range = Math.max(0.2, yMax - yMin);
    yMin -= range * 0.15;
    yMax += range * 0.15;
    return { xMin, xMax, yMin, yMax, useIndex };
  }, [youSeries, spySeries, filterToTradingHours]);

  const W = 400;
  const H = height;

  function pathFor(series: { t: number; pct: number }[]): string {
    if (!layout || series.length === 0) return '';
    const { xMin, xMax, yMin, yMax, useIndex } = layout;
    const xRange = (xMax - xMin) || 1;
    const yRange = (yMax - yMin) || 1;
    return series
      .map((p, i) => {
        const xVal = useIndex ? i : p.t;
        const x = ((xVal - xMin) / xRange) * W;
        const y = H - ((p.pct - yMin) / yRange) * H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  // Y-coordinate for the zero baseline (so we can dash a flat line at 0%).
  const zeroY = useMemo(() => {
    if (!layout) return null;
    const { yMin, yMax } = layout;
    return H - ((0 - yMin) / (yMax - yMin)) * H;
  }, [layout, H]);

  /* ── Final headline %s for the legend ── */

  const youFinalPct = youSeries && youSeries.length > 0 ? youSeries[youSeries.length - 1].pct : null;
  const spyFinalPct = spySeries && spySeries.length > 0 ? spySeries[spySeries.length - 1].pct : null;

  const youColor = (youFinalPct ?? 0) < 0 ? '#ff3b30' : '#00c805';
  const youGlow = (youFinalPct ?? 0) < 0 ? 'rgba(255,59,48,0.4)' : 'rgba(0,200,5,0.4)';
  const youFillId = (youFinalPct ?? 0) < 0 ? redFillId : greenFillId;
  // Theme-aware muted strokes — without these, the SPY underlay and zero
  // baseline are invisible on light mode (white-on-white). Bumped SPY opacity
  // from 0.32 → 0.55 so the benchmark line is actually readable against the
  // background instead of fading into the noise.
  const spyStroke = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const baselineStroke = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const dotBorder = isDark ? '#000' : '#fff';
  const spyLegendSwatch = isDark ? 'bg-white/55' : 'bg-black/45';

  /* ── Render ── */

  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-[12px] text-rh-light-muted dark:text-rh-muted">
        Chart unavailable
      </div>
    );
  }

  if (!youSeries || !layout) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="text-[11px] text-rh-light-muted dark:text-rh-muted">
          {loaded ? 'No portfolio activity yet — add holdings to see your path' : <span className="animate-pulse">Loading chart…</span>}
        </div>
      </div>
    );
  }

  const youPath = pathFor(youSeries);
  // Compute the rightmost x of the You line so the area-fill closes precisely
  // at the line's terminus instead of always running to W (which left a stray
  // diagonal when youSeries.length < spySeries.length).
  const lastYouX = (() => {
    const i = youSeries.length - 1;
    if (!layout) return W;
    const xVal = layout.useIndex ? i : youSeries[i].t;
    return ((xVal - layout.xMin) / ((layout.xMax - layout.xMin) || 1)) * W;
  })();
  const youArea = `${youPath} L${lastYouX.toFixed(1)} ${H} L0 ${H} Z`;
  const spyPath = spySeries ? pathFor(spySeries) : '';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-rh-light-text dark:text-rh-text">
          <span className="block w-[3px] h-3 rounded-full bg-rh-green shadow-[0_0_10px_rgba(0,200,5,0.45)]" />
          Path vs SPY
          <span className="text-rh-light-muted dark:text-rh-muted font-bold tracking-[0.18em]">· {PERIOD_LABEL[period]}</span>
        </span>
        <div className="text-right text-[11px] tabular-nums">
          <div className="flex items-center gap-2 justify-end">
            <span className="block w-3 h-[2px] rounded-full" style={{ background: youColor }} />
            <span className="text-rh-light-muted dark:text-rh-muted">You</span>
            <span style={{ color: youColor }} className="font-bold">
              {youFinalPct != null ? `${youFinalPct >= 0 ? '+' : ''}${youFinalPct.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 justify-end mt-1">
            <span className={`block w-3 h-[2px] rounded-full ${spyLegendSwatch}`} />
            <span className="text-rh-light-muted dark:text-rh-muted">SPY</span>
            <span className="font-bold text-rh-light-muted dark:text-white/60">
              {spyFinalPct != null ? `${spyFinalPct >= 0 ? '+' : ''}${spyFinalPct.toFixed(2)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
        role="img"
        aria-label={`Portfolio versus SPY ${PERIOD_LABEL[period].toLowerCase()} — you ${youFinalPct != null ? youFinalPct.toFixed(2) : '0'}%, SPY ${spyFinalPct != null ? spyFinalPct.toFixed(2) : '0'}%`}
      >
        <defs>
          <linearGradient id={redFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff3b30" stopOpacity={0.22} />
            <stop offset="1" stopColor="#ff3b30" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={greenFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00c805" stopOpacity={0.22} />
            <stop offset="1" stopColor="#00c805" stopOpacity={0} />
          </linearGradient>
        </defs>

        {zeroY != null && zeroY > 0 && zeroY < H && (
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={baselineStroke} strokeDasharray="3 4" />
        )}

        {/* SPY underlay */}
        <path d={spyPath} fill="none" stroke={spyStroke} strokeWidth={1.5} />

        {/* You — area + line */}
        <path d={youArea} fill={`url(#${youFillId})`} />
        <path
          d={youPath}
          fill="none"
          stroke={youColor}
          strokeWidth={2}
          style={{ filter: `drop-shadow(0 0 4px ${youGlow})` }}
        />

        {/* End-point dot for "You" — must use the same useIndex branch as
            pathFor, otherwise on 5D/1M the dot is positioned with raw ms
            timestamps against an index-based xMax and ends up off-canvas. */}
        {(() => {
          const i = youSeries.length - 1;
          const last = youSeries[i];
          const { xMin, xMax, yMin, yMax, useIndex } = layout;
          const xVal = useIndex ? i : last.t;
          const x = ((xVal - xMin) / ((xMax - xMin) || 1)) * W;
          const y = H - ((last.pct - yMin) / ((yMax - yMin) || 1)) * H;
          return <circle cx={x} cy={y} r={3.5} fill={youColor} stroke={dotBorder} strokeWidth={2} />;
        })()}
      </svg>
    </div>
  );
}
