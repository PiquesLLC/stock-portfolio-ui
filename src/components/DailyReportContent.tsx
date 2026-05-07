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
  getFastQuote,
  getMarketSentiment,
  getPortfolio,
  MarketSentiment,
} from '../api';
import { Portfolio } from '../types';

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

      {/* Top Movers */}
      {(movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-light-muted dark:text-white/40">Top Movers</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Gainers */}
            <div className="space-y-1.5">
              {movers.gainers.map(h => (
                <button
                  key={h.ticker}
                  onClick={() => onTickerClick?.(h.ticker)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-rh-green/[0.06] border border-rh-green/10 rounded-lg hover:bg-rh-green/10 transition-colors"
                >
                  <span className="text-sm font-medium text-rh-light-text dark:text-white">{h.ticker}</span>
                  <span className="text-sm font-mono text-rh-green">+{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                </button>
              ))}
              {movers.gainers.length === 0 && (
                <p className="text-[12px] text-rh-light-muted/60 dark:text-white/20 px-3 py-2">No gainers</p>
              )}
            </div>
            {/* Losers */}
            <div className="space-y-1.5">
              {movers.losers.map(h => (
                <button
                  key={h.ticker}
                  onClick={() => onTickerClick?.(h.ticker)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-rh-red/[0.06] border border-rh-red/10 rounded-lg hover:bg-rh-red/10 transition-colors"
                >
                  <span className="text-sm font-medium text-rh-light-text dark:text-white">{h.ticker}</span>
                  <span className="text-sm font-mono text-rh-red">{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                </button>
              ))}
              {movers.losers.length === 0 && (
                <p className="text-[12px] text-rh-light-muted/60 dark:text-white/20 px-3 py-2">No losers</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Market Sentiment Gauge */}
      {sentiment && <SentimentGauge sentiment={sentiment} />}

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
