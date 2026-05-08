// DailyReportContent — the canonical "Today's Brief" body, restored to the
// older live-dashboard layout that is currently shipping on TestFlight (frozen
// at ~commit 03380d4). No AI editorial prose, no greeting, no top-stories
// cards, no questions of the day, no editorial sections. Just live data:
//
//   - Title + day-of-week date + reading time
//   - Index strip: S&P 500 (SPY) / NASDAQ (QQQ) / DOW (DIA)
//   - Portfolio block: total + day change + total return
//   - Top Movers grid: 3 winners (left) / 3 losers (right) from holdings
//   - Fear & Greed gauge: half-circle SVG with 5 zones + needle
//   - Fear & Greed signal breakdown bars (Volatility / Momentum / Breadth /
//     Price Strength / Put-Call / Safe Haven / Junk Bond)
//   - S&P 500 Sectors: horizontal performance bars, click-through to ETF
//   - Earnings This Week: holdings reporting in next 7 days
//   - Ex-Dividend Today: holdings whose ex-date is today
//
// No modal chrome here: no fixed positioning, no backdrop, no portal, no
// close button. The wrapper provides all of that.
//
// Slots:
//   - `dismissSlot` — rendered at the bottom (e.g. modal's "Continue to
//     Portfolio" button). Inline usage omits this.
//
// Imperative handle exposes `refresh()` so external chrome (modal top bar)
// can trigger a re-fetch of all live data.

import { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  EarningsSummaryItem,
  getDailyReport,
  getEarningsSummary,
  getFastQuote,
  getMarketSentiment,
  getPortfolio,
  getSectorPerformance,
  getUpcomingDividends,
  MarketSentiment,
} from '../api';
import { DailyReportResponse, DividendEvent, Portfolio } from '../types';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

type IndexQuote = { price: number; changePct: number; change: number };
type SectorBarItem = { name: string; avgChangePercent: number };

function isEffectivelyZero(pct: number): boolean {
  return Math.abs(pct) < 0.005;
}

// Sector → ETF ticker mapping (matches old TestFlight version)
const SECTOR_ETF_MAP: Record<string, string> = {
  'Technology': 'XLK', 'Tech': 'XLK',
  'Financial': 'XLF', 'Finance': 'XLF', 'Financials': 'XLF',
  'Healthcare': 'XLV', 'Health Care': 'XLV',
  'Consumer': 'XLY', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP',
  'Industrial': 'XLI', 'Industrials': 'XLI',
  'Energy': 'XLE',
  'Communication': 'XLC', 'Communication Services': 'XLC',
  'Materials': 'XLB', 'Basic Materials': 'XLB',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
};

// Horizontal sector bars (matches Discover page style)
function SectorBars({ sectors, onTickerClick }: { sectors: SectorBarItem[]; onTickerClick?: (ticker: string) => void }) {
  const sorted = [...sectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent);
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.avgChangePercent)), 1);
  return (
    <div className="space-y-1.5">
      {sorted.map(s => {
        const pct = s.avgChangePercent;
        const barWidth = (Math.abs(pct) / maxAbs) * 50;
        const isPositive = pct >= 0;
        const zero = isEffectivelyZero(pct);
        const etf = SECTOR_ETF_MAP[s.name];
        return (
          <div
            key={s.name}
            className={`flex items-center gap-3 ${etf ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors' : ''}`}
            onClick={() => etf && onTickerClick?.(etf)}
          >
            <span className="text-xs w-24 text-right shrink-0 font-medium text-rh-light-muted dark:text-white/40">{s.name}</span>
            <div className="flex-1 flex items-center h-5">
              <div className="relative w-full h-full flex items-center">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200/60 dark:bg-white/[0.08]" />
                <div
                  className="absolute h-4 rounded-sm transition-all duration-500"
                  style={{
                    left: isPositive ? '50%' : `${50 - barWidth}%`,
                    width: `${barWidth}%`,
                    background: zero ? '#888' : isPositive ? '#00C805' : '#E8544E',
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
            <span className={`text-xs font-semibold min-w-[50px] text-right font-mono ${zero ? 'text-rh-light-muted dark:text-white/40' : isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
              {isPositive ? '+' : ''}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Sentiment gauge — Fear & Greed speedometer
// Top semicircle: score 0 (fear/left) to 100 (greed/right).
// SVG negative angles: -180° (left) through -90° (top) to 0° (right).
function SentimentGauge({ sentiment }: { sentiment: MarketSentiment }) {
  const { score, label } = sentiment;

  const labelColor =
    score <= 25 ? '#ef4444' :
    score < 42 ? '#f97316' :
    score <= 58 ? '#a3a3a3' :
    score <= 75 ? '#84cc16' : '#22c55e';

  const cx = 150, cy = 140, r = 105;
  const arcWidth = 24;

  function scoreToRad(s: number): number {
    return ((-180 + (s / 100) * 180) * Math.PI) / 180;
  }

  function wedgePath(s0: number, s1: number): string {
    const rOuter = r + arcWidth / 2;
    const rInner = r - arcWidth / 2;
    const a0 = scoreToRad(s0);
    const a1 = scoreToRad(s1);
    const ox0 = cx + rOuter * Math.cos(a0);
    const oy0 = cy + rOuter * Math.sin(a0);
    const ox1 = cx + rOuter * Math.cos(a1);
    const oy1 = cy + rOuter * Math.sin(a1);
    const ix0 = cx + rInner * Math.cos(a1);
    const iy0 = cy + rInner * Math.sin(a1);
    const ix1 = cx + rInner * Math.cos(a0);
    const iy1 = cy + rInner * Math.sin(a0);
    return `M ${ox0} ${oy0} A ${rOuter} ${rOuter} 0 0 1 ${ox1} ${oy1} L ${ix0} ${iy0} A ${rInner} ${rInner} 0 0 0 ${ix1} ${iy1} Z`;
  }

  const segments = [
    { s0: 0, s1: 25, color: '#ef4444' },   // extreme fear
    { s0: 25, s1: 42, color: '#f97316' },   // fear
    { s0: 42, s1: 58, color: '#737373' },   // neutral
    { s0: 58, s1: 75, color: '#84cc16' },   // greed
    { s0: 75, s1: 100, color: '#22c55e' },  // extreme greed
  ];

  // Needle
  const needleRad = scoreToRad(score);
  const needleLen = r - arcWidth / 2 - 6;
  const tipX = cx + needleLen * Math.cos(needleRad);
  const tipY = cy + needleLen * Math.sin(needleRad);
  const baseW = 3.5;
  const perpRad = needleRad + Math.PI / 2;
  const b1x = cx + baseW * Math.cos(perpRad);
  const b1y = cy + baseW * Math.sin(perpRad);
  const b2x = cx - baseW * Math.cos(perpRad);
  const b2y = cy - baseW * Math.sin(perpRad);
  const tailLen = 12;
  const tailX = cx - tailLen * Math.cos(needleRad);
  const tailY = cy - tailLen * Math.sin(needleRad);

  // Zone labels inside the arc
  const zoneLabels = [
    { score: 12.5, text: 'EXTREME', text2: 'FEAR' },
    { score: 33.5, text: 'FEAR' },
    { score: 50, text: 'NEUTRAL' },
    { score: 66.5, text: 'GREED' },
    { score: 87.5, text: 'EXTREME', text2: 'GREED' },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Fear & Greed Index</h3>
      </div>

      {/* Score number above the gauge */}
      <div className="text-center">
        <span className="text-5xl font-extrabold tabular-nums" style={{ color: labelColor }}>{score}</span>
      </div>

      <div className="flex justify-center -mt-2">
        <svg viewBox="0 0 300 160" className="w-full max-w-[340px]">
          <defs>
            <filter id="needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={labelColor} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Arc segments */}
          {segments.map((seg, i) => (
            <path key={i} d={wedgePath(seg.s0, seg.s1)} fill={seg.color} opacity={0.9} />
          ))}

          {/* Zone labels inside the arc */}
          {zoneLabels.map((z, i) => {
            const a = scoreToRad(z.score);
            const labelR = r;
            const lx = cx + labelR * Math.cos(a);
            const ly = cy + labelR * Math.sin(a);
            const rotDeg = (z.score / 100) * 180 - 180 + 90;
            return (
              <g key={i} transform={`translate(${lx},${ly}) rotate(${rotDeg})`}>
                {z.text2 ? (
                  <>
                    <text textAnchor="middle" y={-3} fill="black" stroke="black" strokeWidth="1.4" fontSize="6.5" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text}</text>
                    <text textAnchor="middle" y={-3} fill="white" fontSize="6.5" fontWeight="800" letterSpacing="0.5">{z.text}</text>
                    <text textAnchor="middle" y={4.5} fill="black" stroke="black" strokeWidth="1.4" fontSize="6.5" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text2}</text>
                    <text textAnchor="middle" y={4.5} fill="white" fontSize="6.5" fontWeight="800" letterSpacing="0.5">{z.text2}</text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" y={1.5} fill="black" stroke="black" strokeWidth="1.4" fontSize="8" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text}</text>
                    <text textAnchor="middle" y={1.5} fill="white" fontSize="8" fontWeight="800" letterSpacing="0.5">{z.text}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* Needle */}
          <polygon
            points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
            fill={labelColor} filter="url(#needle-shadow)"
          />
          {/* Center hub */}
          <circle cx={cx} cy={cy} r={7} fill="#111" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={3.5} fill={labelColor} opacity={0.8} />
        </svg>
      </div>

      <div className="text-center -mt-3">
        <p className="text-sm font-bold tracking-wide" style={{ color: labelColor }}>{label}</p>
      </div>

      {/* Signal breakdown */}
      <div className="mt-5 space-y-2 px-2">
        {([
          { key: 'vix', label: 'Market Volatility' },
          { key: 'momentum', label: 'Market Momentum' },
          { key: 'breadth', label: 'Stock Price Breadth' },
          { key: 'priceStrength', label: 'Stock Price Strength' },
          { key: 'putCall', label: 'Put/Call Options' },
          { key: 'safeHaven', label: 'Safe Haven Demand' },
          { key: 'junkBond', label: 'Junk Bond Demand' },
        ] as const).map(({ key, label: sigLabel }) => {
          const sig = sentiment.signals?.[key];
          if (!sig || (sig.signal === 0 && sig.value === 0)) return null;
          const sigColor =
            sig.signal <= 25 ? '#ef4444' :
            sig.signal < 42 ? '#f97316' :
            sig.signal <= 58 ? '#a3a3a3' :
            sig.signal <= 75 ? '#84cc16' : '#22c55e';
          const sigText =
            sig.signal <= 25 ? 'Extreme Fear' :
            sig.signal < 42 ? 'Fear' :
            sig.signal <= 58 ? 'Neutral' :
            sig.signal <= 75 ? 'Greed' : 'Extreme Greed';
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[11px] text-rh-light-muted dark:text-white/50 w-36 shrink-0">{sigLabel}</span>
              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${sig.signal}%`, backgroundColor: sigColor }} />
              </div>
              <span className="text-[11px] font-medium w-20 text-right shrink-0" style={{ color: sigColor }}>{sigText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface DailyReportContentHandle {
  /** Manually refresh: re-fetch indices + portfolio + sentiment. */
  regenerate: () => Promise<void>;
  refresh: () => void;
  isRegenerating: () => boolean;
}

export interface DailyReportContentProps {
  /** Optional click handler for ticker pills. */
  onTickerClick?: (ticker: string) => void;
  /** Optional dismiss button at the bottom (modal use). When omitted, no dismiss CTA. */
  dismissSlot?: React.ReactNode;
  /** Pause network activity while parent overlay is hidden. */
  paused?: boolean;
  /** Outer container className override. Defaults to centered max-width column. */
  className?: string;
}

export const DailyReportContent = forwardRef<DailyReportContentHandle, DailyReportContentProps>(function DailyReportContent(
  { onTickerClick, dismissSlot, paused = false, className }: DailyReportContentProps,
  ref
) {
  const [indexQuotes, setIndexQuotes] = useState<Record<string, IndexQuote>>({});
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [livePortfolio, setLivePortfolio] = useState<Portfolio | null>(null);
  const [heatmapSectors, setHeatmapSectors] = useState<SectorBarItem[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummaryItem[]>([]);
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [aiReport, setAiReport] = useState<DailyReportResponse | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Compute "now" date once per mount; refreshes when refreshTick changes.
  const now = new Date();
  const readingTime = 2; // matches TestFlight static "2 min read"

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      // Indices
      await Promise.all(['SPY', 'QQQ', 'DIA'].map(async (ticker) => {
        try {
          const q = await getFastQuote(ticker);
          setIndexQuotes(prev => ({ ...prev, [ticker]: { price: q.currentPrice, changePct: q.changePercent, change: q.change } }));
        } catch { /* ignore individual failures */ }
      }));
      // Portfolio
      try { setLivePortfolio(await getPortfolio()); } catch { /* ignore */ }
      // Sentiment
      try { setSentiment(await getMarketSentiment()); } catch { /* ignore */ }
      // Sector performance (1D) → bar chart of S&P 500 sectors
      try {
        const r = await getSectorPerformance('1D');
        setHeatmapSectors(r.sectors.map(s => ({ name: s.name, avgChangePercent: s.changePercent })));
      } catch { /* ignore */ }
      // Earnings this week (next 7 days, holdings only)
      try {
        const r = await getEarningsSummary();
        setEarnings(r.results.filter(e => e.daysUntil >= 0 && e.daysUntil <= 7));
      } catch { /* ignore */ }
      // Upcoming dividends — only show if ex-date is today.
      // Compare on YYYY-MM-DD substrings to avoid `new Date("2026-05-07")`
      // parsing as UTC midnight and shifting to the prior day for users west of UTC.
      try {
        const divs = await getUpcomingDividends();
        const now = new Date();
        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        setDividends(divs.filter(d => (d.exDate ?? '').slice(0, 10) === todayLocal));
      } catch { /* ignore */ }
      // AI editorial sections — Market Overview (macro report) + Portfolio Analysis
      // (profile for the day). Hits /insights/daily-report which is server-cached;
      // takes ~10-20s on cache miss. Shown as appended prose sections so they don't
      // block the live-data dashboard above.
      try {
        const r = await getDailyReport();
        setAiReport(r);
      } catch { /* ignore — sections just won't render */ }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial + interval refresh, gated by `paused`.
  useEffect(() => {
    if (paused) return;
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [paused, fetchAll, refreshTick]);

  const handleRefresh = useCallback(async () => {
    setRefreshTick(t => t + 1);
    await fetchAll();
  }, [fetchAll]);

  useImperativeHandle(ref, () => ({
    regenerate: handleRefresh,
    refresh: handleRefresh,
    isRegenerating: () => refreshing,
  }), [handleRefresh, refreshing]);

  // Compute top movers from portfolio
  type HoldingArr = NonNullable<Portfolio['holdings']>;
  const movers = (() => {
    if (!livePortfolio?.holdings || livePortfolio.holdings.length === 0) {
      return { gainers: [] as HoldingArr, losers: [] as HoldingArr };
    }
    const sorted = [...livePortfolio.holdings]
      .filter(h => h.shares > 0 && h.dayChangePercent != null)
      .sort((a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0));
    return {
      gainers: sorted.filter(h => (h.dayChangePercent ?? 0) > 0).slice(0, 3),
      losers: sorted.filter(h => (h.dayChangePercent ?? 0) < 0).slice(-3).reverse().map(h => h),
    };
  })();
  movers.losers.sort((a, b) => (a.dayChangePercent ?? 0) - (b.dayChangePercent ?? 0));

  const containerClass = className ?? 'max-w-3xl mx-auto px-6 pt-10 pb-10';

  return (
    <div className={containerClass}>
      {/* Title + reading time */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-rh-light-text dark:text-white tracking-tight mb-1">Today's Brief</h1>
        <p className="text-sm text-rh-green mb-1">{formatDate(now)}</p>
        <p className="text-[11px] text-rh-light-muted dark:text-white/30">{readingTime} min read</p>
      </div>

      {/* Index strip — S&P 500 / NASDAQ / DOW */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'S&P 500', ticker: 'SPY' },
          { label: 'Nasdaq', ticker: 'QQQ' },
          { label: 'Dow', ticker: 'DIA' },
        ].map(({ label, ticker }) => {
          const q = indexQuotes[ticker];
          return (
            <div
              key={ticker}
              className="bg-gray-50 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              onClick={() => onTickerClick?.(ticker)}
            >
              <p className="text-[11px] text-rh-light-muted dark:text-white/40 mb-1">{label}</p>
              {q ? (
                <>
                  <p className="text-lg font-semibold text-rh-light-text dark:text-white font-mono">${q.price.toFixed(2)}</p>
                  <p className={`text-sm font-mono ${q.changePct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                  </p>
                </>
              ) : (
                <div className="h-10 bg-gray-100 dark:bg-white/[0.04] rounded animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* Portfolio Snapshot Card */}
      {livePortfolio && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Your Portfolio</h3>
          </div>
          <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] rounded-xl px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-rh-light-text dark:text-white font-mono">{formatCurrency(livePortfolio.netEquity ?? livePortfolio.totalValue)}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold font-mono ${livePortfolio.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {livePortfolio.dayChange >= 0 ? '+' : ''}{formatCurrency(livePortfolio.dayChange)}
                </p>
                <p className={`text-sm font-mono ${livePortfolio.dayChangePercent >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                  {formatPct(livePortfolio.dayChangePercent)}
                </p>
              </div>
            </div>
            {/* Total return line */}
            <div className="mt-2 pt-2 border-t border-gray-200/60 dark:border-white/[0.06] flex justify-between text-[12px]">
              <span className="text-rh-light-muted dark:text-white/30">Total Return</span>
              <span className={`font-mono ${livePortfolio.totalPLPercent >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                {formatPct(livePortfolio.totalPLPercent)} ({livePortfolio.totalPL >= 0 ? '+' : ''}{formatCurrency(livePortfolio.totalPL)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Top Movers — vertical list: winners, divider, losers (matches v2 sidebar style) */}
      {(movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Top Movers</h3>
          </div>
          <div className="space-y-1">
            {movers.gainers.map(h => (
              <button
                key={h.ticker}
                onClick={() => onTickerClick?.(h.ticker)}
                className="w-full flex items-center justify-between py-2 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm font-semibold text-rh-light-text dark:text-white">{h.ticker}</span>
                <span className="text-sm font-mono text-rh-green">+{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
              </button>
            ))}
            {movers.gainers.length > 0 && movers.losers.length > 0 && (
              <div className="border-t border-gray-200/60 dark:border-white/[0.06] my-2" />
            )}
            {movers.losers.map(h => (
              <button
                key={h.ticker}
                onClick={() => onTickerClick?.(h.ticker)}
                className="w-full flex items-center justify-between py-2 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm font-semibold text-rh-light-text dark:text-white">{h.ticker}</span>
                <span className="text-sm font-mono text-rh-red">{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Market Sentiment Gauge (with signal breakdown bars) */}
      {sentiment && <SentimentGauge sentiment={sentiment} />}

      {/* S&P 500 Sectors — horizontal performance bars */}
      {heatmapSectors.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">S&amp;P 500 Sectors</h3>
          </div>
          <SectorBars sectors={heatmapSectors} onTickerClick={onTickerClick} />
        </div>
      )}

      {/* Market Overview — macro report (AI prose). Hidden when blank. */}
      {aiReport?.marketOverview && aiReport.marketOverview.trim().length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-rh-green rounded-sm" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Market Overview</h3>
          </div>
          <p className="text-[14px] text-rh-light-text/80 dark:text-white/75 leading-[1.8]">
            {aiReport.marketOverview}
          </p>
        </section>
      )}

      {/* Portfolio Analysis — profile for the day (AI prose). Hidden when blank. */}
      {aiReport?.portfolioSummary && aiReport.portfolioSummary.trim().length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-rh-green rounded-sm" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Portfolio Analysis</h3>
          </div>
          <p className="text-[14px] text-rh-light-text/80 dark:text-white/75 leading-[1.8]">
            {aiReport.portfolioSummary}
          </p>
        </section>
      )}

      {/* Why Positions Moved — per-holding AI commentary on today's move. */}
      {aiReport?.positionMoves && aiReport.positionMoves.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-rh-green rounded-sm" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Why Positions Moved</h3>
          </div>
          <div className="space-y-5">
            {aiReport.positionMoves.map((move, i) => {
              const pct = move.changePercent ?? 0;
              const isUp = pct >= 0;
              const isLast = i === (aiReport.positionMoves?.length ?? 0) - 1;
              return (
                <div key={`${move.ticker}-${i}`}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <button
                      onClick={() => onTickerClick?.(move.ticker)}
                      className="text-[15px] font-bold text-rh-light-text dark:text-white hover:text-rh-green transition-colors"
                    >
                      {move.ticker}
                    </button>
                    <span className={`text-sm font-mono ${isUp ? 'text-rh-green' : 'text-rh-red'}`}>
                      {isUp ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  </div>
                  {move.reason && move.reason.trim().length > 0 && (
                    <p className="text-[14px] text-rh-light-text/80 dark:text-white/75 leading-[1.7]">
                      {move.reason}
                    </p>
                  )}
                  {!isLast && (
                    <div className="border-t border-gray-200/60 dark:border-white/[0.04] mt-5" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Earnings This Week — only renders if there are upcoming earnings in next 7 days */}
      {earnings.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Earnings This Week</h3>
          </div>
          <div className="space-y-2">
            {earnings.map(e => (
              <button
                key={e.ticker}
                onClick={() => onTickerClick?.(e.ticker)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/[0.06] rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-sm font-medium text-rh-light-text dark:text-white">{e.ticker}</span>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-rh-light-muted dark:text-white/50">
                    {e.daysUntil === 0 ? 'Today' : e.daysUntil === 1 ? 'Tomorrow' : `In ${e.daysUntil} days`}
                  </p>
                  {e.estimatedEPS != null && (
                    <p className="text-[11px] text-rh-light-muted/60 dark:text-white/30 font-mono">Est. EPS ${e.estimatedEPS.toFixed(2)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ex-Dividend Today — only renders if any holding's ex-date is today */}
      {dividends.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Ex-Dividend Today</h3>
          </div>
          <div className="space-y-2">
            {dividends.map(d => (
              <button
                key={d.id}
                onClick={() => onTickerClick?.(d.ticker)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/[0.06] rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rh-green" />
                  <span className="text-sm font-medium text-rh-light-text dark:text-white">{d.ticker}</span>
                </div>
                <p className="text-[11px] text-rh-light-muted/60 dark:text-white/30 font-mono">${d.amountPerShare.toFixed(4)}/share</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading shell when nothing has resolved yet */}
      {!livePortfolio && !sentiment && Object.keys(indexQuotes).length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-6 h-6 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
          <p className="text-sm text-rh-light-muted dark:text-white/40">Loading your brief...</p>
        </div>
      )}

      {dismissSlot && (
        <div className="text-center pt-4 pb-10">
          {dismissSlot}
        </div>
      )}
    </div>
  );
});
