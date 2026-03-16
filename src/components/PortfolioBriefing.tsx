import { useState, useEffect, useRef, useMemo } from 'react';
import { getPortfolioBriefing, PortfolioBriefingResponse } from '../api';
import { Holding } from '../types';
import { timeAgo } from '../utils/format';
import { navigateToPricing } from '../utils/navigate-to-pricing';

type BriefingPeriod = 'daily' | 'weekly' | 'monthly' | 'ytd' | '1y';
const PERIODS: { id: BriefingPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
];

function getSentimentPill(sentiment?: string, title?: string) {
  // Use contextual labels based on section title
  const lower = (title || '').toLowerCase();
  if (lower.includes('concentration')) {
    if (sentiment === 'negative') return { label: 'High', cls: 'bg-amber-500/15 text-amber-500' };
    return { label: 'OK', cls: 'bg-rh-green/15 text-rh-green' };
  }
  if (sentiment === 'positive') return { label: 'Tailwind', cls: 'bg-rh-green/15 text-rh-green' };
  if (sentiment === 'negative') return { label: 'Headwind', cls: 'bg-rh-red/15 text-rh-red' };
  return { label: 'Neutral', cls: 'bg-gray-200/80 dark:bg-white/[0.08] text-rh-light-muted dark:text-white/50' };
}

// Make ticker symbols in text clickable
function renderBodyWithTickers(body: string, onTickerClick?: (ticker: string) => void): React.ReactNode {
  if (!onTickerClick) return body;
  // Match uppercase ticker-like words (2-5 chars, not common words)
  const COMMON = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'YOUR', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HER', 'WAS', 'TWO', 'HOW', 'ITS', 'MAY', 'HAD']);
  const parts = body.split(/\b([A-Z]{2,5})\b/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && !COMMON.has(part) && /^[A-Z]{2,5}$/.test(part)) {
      return (
        <span
          key={i}
          className="text-rh-green cursor-pointer hover:underline"
          onClick={(e) => { e.stopPropagation(); onTickerClick(part); }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

interface Props {
  portfolioId?: string;
  onTickerClick?: (ticker: string) => void;
  holdings?: Holding[];
  currentValue?: number;
}

export default function PortfolioBriefing({ portfolioId, onTickerClick, holdings = [] }: Props) {
  const [briefing, setBriefing] = useState<PortfolioBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<BriefingPeriod>('daily');
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;
  const periodRef = useRef(period);
  periodRef.current = period;

  const fetchBriefing = async () => {
    const fetchPortfolioId = portfolioId;
    const fetchPeriod = periodRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getPortfolioBriefing(fetchPortfolioId, fetchPeriod);
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return;
      if (fetchPeriod !== periodRef.current) return; // period changed during fetch
      setBriefing(data);
    } catch (err: any) {
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return;
      setError(err.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, [portfolioId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter out "portfolio overview" section since hero covers it
  const sections = useMemo(() => {
    if (!briefing) return [];
    return briefing.sections.filter(s =>
      !s.title.toLowerCase().includes('portfolio overview')
    );
  }, [briefing]);

  if (loading && !briefing) {
    return (
      <div className="space-y-3">
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 animate-pulse">
          <div className="h-5 bg-gray-100/60 dark:bg-white/[0.06] rounded w-2/3 mb-3" />
          <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-gray-50/80 dark:bg-white/[0.04] rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !briefing) {
    const isPlanError = error.includes('upgrade_required') || error.includes('limit_reached');
    if (isPlanError) {
      return (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-rh-light-text dark:text-white mb-1">AI Portfolio Briefing</h3>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">Upgrade to Premium to unlock AI-powered portfolio briefings.</p>
          <a
            href="#tab=pricing"
            onClick={(e) => { e.preventDefault(); navigateToPricing(); }}
            className="inline-block px-5 py-2 rounded-xl text-sm font-semibold bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
          >
            Upgrade to Premium
          </a>
        </div>
      );
    }
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <p className="text-sm text-rh-red">{error}</p>
        <button onClick={() => fetchBriefing()} className="mt-2 text-xs text-rh-green hover:underline">Try again</button>
      </div>
    );
  }

  if (!briefing || briefing.holdingCount === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add holdings to your portfolio to receive an AI-powered briefing.
        </p>
      </div>
    );
  }

  if (briefing.sections.length === 0 && !briefing.headline) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Briefing temporarily unavailable. Try again later.
        </p>
        <button onClick={() => fetchBriefing()} className="mt-3 text-xs text-rh-green hover:underline">Retry</button>
      </div>
    );
  }

  const generatedAgo = briefing.generatedAt ? timeAgo(new Date(briefing.generatedAt)) : '';
  const periodLabel = PERIODS.find(p => p.id === period)?.label || 'Daily';

  return (
    <div className="space-y-2.5">
      {/* Hero Card */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-5 relative overflow-hidden border border-gray-200/30 dark:border-white/[0.04] shadow-[0_0_25px_rgba(0,200,5,0.09)] hover:shadow-[0_0_30px_rgba(0,200,5,0.13)] transition-shadow">
        <div className="absolute inset-0 bg-gradient-to-b from-rh-green/[0.03] to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30">
              {periodLabel} Briefing
            </span>
            <button
              onClick={() => fetchBriefing()}
              disabled={loading}
              className="text-[10px] text-rh-green hover:underline disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <h2 className="text-lg font-bold text-rh-light-text dark:text-white leading-snug">
            {briefing.sections.length > 0
              ? briefing.sections[0].takeaway || briefing.headline
              : briefing.headline}
          </h2>
          <p className="text-[11px] text-rh-light-muted/50 dark:text-white/25 mt-1">
            {holdings.length} positions · {generatedAgo || 'just now'}
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1 text-[12px] font-medium rounded-full transition-all ${
              period === p.id
                ? 'bg-rh-green text-black'
                : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white/70'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Visual data cards */}
      {holdings.length > 0 && (() => {
        const totalValue = holdings.reduce((s, h) => s + (h.currentValue ?? 0), 0) || 1;
        const sorted = [...holdings].sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));

        // Use period-specific returns from API when available, fallback to profitLossPercent
        const returns = briefing?.holdingReturns ?? {};
        const getReturn = (h: Holding) => returns[h.ticker] ?? h.profitLossPercent ?? 0;

        const byReturn = [...holdings].sort((a, b) => getReturn(b) - getReturn(a));
        const topGainers = byReturn.filter(h => getReturn(h) > 0).slice(0, 5);
        const topLosers = byReturn.filter(h => getReturn(h) < 0).reverse().slice(0, 5);
        const maxAbsReturn = Math.max(...holdings.map(h => Math.abs(getReturn(h))), 1);

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Portfolio composition heatmap — proper grid */}
            <div className="md:col-span-2 bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl border border-gray-200/30 dark:border-white/[0.04] shadow-[0_0_25px_rgba(0,200,5,0.09)] p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35 mb-3">Portfolio Composition</h3>
              <div className="flex flex-wrap gap-1">
                {sorted.slice(0, 20).map(h => {
                  const weight = ((h.currentValue ?? 0) / totalValue);
                  const pct = getReturn(h);
                  const intensity = Math.min(Math.abs(pct) / 30, 1);
                  const bg = pct >= 0
                    ? `rgba(0,200,5,${0.15 + intensity * 0.45})`
                    : `rgba(255,59,48,${0.15 + intensity * 0.45})`;
                  // Scale size by weight: min 36px, max 90px
                  const size = Math.max(36, Math.min(90, weight * 500));
                  return (
                    <div
                      key={h.ticker}
                      className="rounded-lg flex flex-col items-center justify-center cursor-pointer hover:ring-1 hover:ring-white/30 transition-all"
                      style={{ backgroundColor: bg, width: `${size}px`, height: `${size}px` }}
                      onClick={() => onTickerClick?.(h.ticker)}
                    >
                      <span className={`font-bold text-white leading-none ${size > 50 ? 'text-[11px]' : 'text-[9px]'}`}>{h.ticker}</span>
                      <span className={`font-medium text-white/70 leading-none mt-0.5 ${size > 50 ? 'text-[9px]' : 'text-[7px]'}`}>{(weight * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Best performers */}
            <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl border border-gray-200/30 dark:border-white/[0.04] shadow-[0_0_25px_rgba(0,200,5,0.09)] p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-green/60 mb-3">Best Performers</h3>
              <div className="space-y-2">
                {topGainers.map(h => {
                  const ret = getReturn(h);
                  const barW = (ret / maxAbsReturn) * 100;
                  return (
                    <div key={h.ticker} className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-rh-light-text dark:text-white/70 w-12 shrink-0 cursor-pointer hover:text-rh-green transition-colors" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</span>
                      <div className="flex-1 h-5 bg-gray-100/20 dark:bg-white/[0.03] rounded overflow-hidden">
                        <div className="h-full bg-rh-green/40 rounded" style={{ width: `${Math.max(barW, 4)}%` }} />
                      </div>
                      <span className="text-[11px] font-medium text-rh-green tabular-nums shrink-0 w-16 text-right">+{ret.toFixed(1)}%</span>
                    </div>
                  );
                })}
                {topGainers.length === 0 && <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">No gainers</p>}
              </div>
            </div>

            {/* Worst performers */}
            <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl border border-gray-200/30 dark:border-white/[0.04] shadow-[0_0_25px_rgba(0,200,5,0.09)] p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-red/60 mb-3">Worst Performers</h3>
              <div className="space-y-2">
                {topLosers.map(h => {
                  const ret = getReturn(h);
                  const barW = (Math.abs(ret) / maxAbsReturn) * 100;
                  return (
                    <div key={h.ticker} className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-rh-light-text dark:text-white/70 w-12 shrink-0 cursor-pointer hover:text-rh-red transition-colors" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</span>
                      <div className="flex-1 h-5 bg-gray-100/20 dark:bg-white/[0.03] rounded overflow-hidden">
                        <div className="h-full bg-rh-red/40 rounded" style={{ width: `${Math.max(barW, 4)}%` }} />
                      </div>
                      <span className="text-[11px] font-medium text-rh-red tabular-nums shrink-0 w-16 text-right">{ret.toFixed(1)}%</span>
                    </div>
                  );
                })}
                {topLosers.length === 0 && <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">No losers</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Section Cards — 2x2 grid on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {sections.map((section, i) => {
          const pill = getSentimentPill(section.sentiment, section.title);

          return (
            <div
              key={i}
              className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl overflow-hidden border border-gray-200/30 dark:border-white/[0.04] shadow-[0_0_25px_rgba(0,200,5,0.09)] hover:shadow-[0_0_30px_rgba(0,200,5,0.13)] transition-all p-4"
            >
              {/* Title + sentiment pill */}
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">
                  {section.title}
                </h3>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${pill.cls}`}>
                  {pill.label}
                </span>
              </div>

              {/* Bold takeaway */}
              {section.takeaway && (
                <p className="text-[13px] font-semibold text-rh-light-text dark:text-white/90 mb-1.5 leading-snug">
                  {section.takeaway}
                </p>
              )}

              {/* Body with clickable tickers */}
              <p className="text-[12px] text-rh-light-muted dark:text-white/40 leading-relaxed">
                {renderBodyWithTickers(section.body, onTickerClick)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-[9px] text-rh-light-muted/30 dark:text-rh-muted/20 text-center">
        Context only. Not financial advice.
      </p>
    </div>
  );
}
