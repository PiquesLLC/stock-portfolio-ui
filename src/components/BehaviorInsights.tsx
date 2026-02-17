import { useState, useEffect, useMemo } from 'react';
import { getBehaviorInsights, BehaviorInsightsResponse, BehaviorInsight } from '../api';

// ── Severity styles ──────────────────────────────────────────────
const SEVERITY_STYLES: Record<BehaviorInsight['severity'], { border: string; badge: string; badgeText: string; priorityBorder: string }> = {
  positive: {
    border: 'border-l-4 border-rh-green',
    badge: 'bg-rh-green/10 text-rh-green',
    badgeText: 'Good',
    priorityBorder: 'border-l-4 border-rh-green',
  },
  warning: {
    border: 'border-l-4 border-yellow-500',
    badge: 'bg-yellow-500/10 text-yellow-500',
    badgeText: 'Watch',
    priorityBorder: 'border-l-[6px] border-yellow-500',
  },
  info: {
    border: 'border-l-4 border-blue-500',
    badge: 'bg-blue-500/10 text-blue-500',
    badgeText: 'Tip',
    priorityBorder: 'border-l-4 border-blue-500',
  },
};

// ── Category icons (inline SVG paths) ────────────────────────────
const CATEGORY_ICONS: Record<BehaviorInsight['category'], { label: string; path: string }> = {
  concentration: {
    label: 'Concentration',
    path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', // target
  },
  timing: {
    label: 'Timing',
    path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', // clock
  },
  sizing: {
    label: 'Position Sizing',
    path: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3', // scale
  },
  diversification: {
    label: 'Diversification',
    path: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z', // pie chart
  },
  general: {
    label: 'General',
    path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', // lightbulb
  },
};

// ── Score helpers (matching HealthScore.tsx pattern) ──────────────
function getScoreColor(score: number): string {
  if (score >= 75) return 'text-rh-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-rh-red';
}

function getScoreStrokeColor(score: number): string {
  if (score >= 75) return 'text-rh-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-rh-red';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Needs Work';
  return 'At Risk';
}

function computeBehaviorScore(insights: BehaviorInsight[]): number {
  let score = 50;
  for (const insight of insights) {
    if (insight.severity === 'positive') score += 15;
    else if (insight.severity === 'info') score += 10;
    else if (insight.severity === 'warning') score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

// ── Ticker extraction from text ──────────────────────────────────
const COMMON_WORDS = new Set([
  'AI', 'US', 'UK', 'EU', 'ETF', 'CEO', 'CFO', 'IPO', 'GDP', 'CPI',
  'FED', 'SEC', 'PE', 'PL', 'YTD', 'ATH', 'EPS', 'ROI', 'ROE',
  'NYSE', 'OTC', 'USD', 'ESP', 'LLC', 'INC', 'OR', 'AND', 'FOR',
  'THE', 'NOT', 'BUT', 'ALL', 'HAS', 'HAD', 'ARE', 'WAS', 'CAN',
  'MAY', 'NEW', 'OLD', 'BIG', 'LOW', 'TOP', 'ADD', 'SET', 'RUN',
  'CUT', 'LET', 'AIM', 'USE', 'BUY', 'OWN', 'NET', 'TWO', 'DAY',
  'KEY', 'MIX', 'VIA', 'PRE', 'PER',
]);

function extractTickers(text: string, portfolioTickers: string[]): string[] {
  if (!portfolioTickers.length) return [];
  const tickerSet = new Set(portfolioTickers);
  const matches = text.match(/\b[A-Z]{1,5}\b/g) || [];
  const found = new Set<string>();
  for (const m of matches) {
    if (tickerSet.has(m) && !COMMON_WORDS.has(m)) {
      found.add(m);
    }
  }
  return [...found];
}

// ── Props ────────────────────────────────────────────────────────
interface BehaviorInsightsProps {
  onTickerClick?: (ticker: string) => void;
  portfolioTickers?: string[];
}

export default function BehaviorInsights({ onTickerClick, portfolioTickers = [] }: BehaviorInsightsProps) {
  const [data, setData] = useState<BehaviorInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBehaviorInsights();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load behavior insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Sort insights: warnings first, then info, then positive
  // Track the first warning index for "top priority" treatment
  const sortedInsights = useMemo(() => {
    if (!data) return [];
    const order: Record<string, number> = { warning: 0, info: 1, positive: 2 };
    return [...data.insights].sort((a, b) => (order[a.severity] ?? 1) - (order[b.severity] ?? 1));
  }, [data]);

  const firstWarningIdx = useMemo(() => {
    return sortedInsights.findIndex(i => i.severity === 'warning');
  }, [sortedInsights]);

  // Auto-expand the top priority card on data load
  useEffect(() => {
    if (firstWarningIdx >= 0) {
      setExpandedCards(new Set([firstWarningIdx]));
    } else {
      setExpandedCards(new Set());
    }
  }, [firstWarningIdx]);

  const toggleCard = (idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Loading state ──────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 animate-pulse">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gray-100/60 dark:bg-white/[0.06]" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/4" />
            </div>
          </div>
          <div className="h-12 bg-gray-100/60 dark:bg-white/[0.06] rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-gray-100/60 dark:bg-white/[0.06] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error && !data) {
    const isPlanError = error.includes('upgrade_required') || error.includes('limit_reached');
    if (isPlanError) {
      return (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-rh-light-text dark:text-white mb-1">AI Behavior Coach</h3>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">Upgrade to Premium to unlock AI-powered behavior analysis.</p>
          <a
            href="#pricing"
            onClick={(e) => { e.preventDefault(); window.location.hash = '#pricing'; window.dispatchEvent(new HashChangeEvent('hashchange')); }}
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
        <button onClick={fetchData} className="mt-2 text-xs text-rh-green hover:underline">
          Try again
        </button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────
  if (!data || data.holdingCount === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add holdings to your portfolio to receive behavior insights.
        </p>
      </div>
    );
  }

  const timeAgo = data.generatedAt ? getTimeAgo(new Date(data.generatedAt)) : '';
  const score = computeBehaviorScore(sortedInsights);
  const circumference = 2 * Math.PI * 26; // r=26, matching HealthScore

  // Severity counts
  const counts = { positive: 0, warning: 0, info: 0 };
  for (const insight of sortedInsights) counts[insight.severity]++;

  return (
    <div className="space-y-3">
      {/* ── Score + Summary Header ─────────────────────────────── */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Circular score */}
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none"
                  className="text-gray-200/60 dark:text-white/[0.06]" />
                <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (circumference * score) / 100}
                  strokeLinecap="round"
                  className={`${getScoreStrokeColor(score)} transition-all duration-700`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${getScoreColor(score)}`}>{score}</span>
              </div>
            </div>
            <div>
              <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
                Behavior Score
              </h2>
              <p className={`text-sm font-medium ${getScoreColor(score)}`}>
                {getScoreLabel(score)}
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-xs text-rh-green hover:underline disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Summary text */}
        <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed mb-3">
          {data.summary}
        </p>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-50/40 dark:bg-white/[0.02] border border-gray-200/30 dark:border-white/[0.04]">
          <svg className="w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 leading-relaxed">
            For educational purposes only. Not financial advice. Always do your own research and consult a qualified financial advisor before making investment decisions.
          </p>
        </div>

        {/* ── Severity Summary Bar ──────────────────────────────── */}
        <div className="flex items-center gap-3 text-xs">
          {counts.positive > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rh-green/10 text-rh-green font-medium">
              <span className="w-2 h-2 rounded-full bg-rh-green" />
              {counts.positive} Good
            </span>
          )}
          {counts.warning > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              {counts.warning} Watch
            </span>
          )}
          {counts.info > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {counts.info} {counts.info === 1 ? 'Tip' : 'Tips'}
            </span>
          )}
        </div>
      </div>

      {/* ── Insight Cards ──────────────────────────────────────── */}
      {sortedInsights.map((insight, i) => {
        const style = SEVERITY_STYLES[insight.severity];
        const isExpanded = expandedCards.has(i);
        const isTopPriority = i === firstWarningIdx && insight.severity === 'warning';
        const cat = CATEGORY_ICONS[insight.category];
        const tickers = extractTickers(`${insight.title} ${insight.observation}`, portfolioTickers);

        return (
          <div
            key={i}
            className={`bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl transition-all duration-200 ${
              isTopPriority ? style.priorityBorder : style.border
            } ${isTopPriority ? 'ring-1 ring-yellow-500/20' : ''}`}
          >
            {/* Clickable header */}
            <button
              onClick={() => toggleCard(i)}
              className="w-full text-left px-5 py-4 flex items-center gap-3 group"
            >
              {/* Priority label */}
              {isTopPriority && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 shrink-0">
                  Priority
                </span>
              )}

              {/* Severity badge */}
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${style.badge}`}>
                {style.badgeText}
              </span>

              {/* Category icon + label */}
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-gray-50/40 dark:bg-white/[0.02] text-rh-light-muted dark:text-rh-muted shrink-0">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.path} />
                </svg>
                {cat.label}
              </span>

              {/* Title */}
              <span className="flex-1 text-sm font-semibold text-rh-light-text dark:text-rh-text truncate">
                {insight.title}
              </span>

              {/* Chevron */}
              <svg
                className={`w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expandable content */}
            {isExpanded && (
              <div className="px-5 pb-4 space-y-3">
                <p className="text-sm text-rh-light-muted dark:text-rh-muted">
                  {insight.observation}
                </p>

                {/* Ticker links */}
                {tickers.length > 0 && onTickerClick && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">Related:</span>
                    {tickers.map(t => (
                      <button
                        key={t}
                        onClick={(e) => { e.stopPropagation(); onTickerClick(t); }}
                        className="text-xs font-medium text-rh-green hover:text-rh-green/80 hover:underline transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Suggestion box */}
                <div className="bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-3 py-2">
                  <p className="text-xs text-rh-light-text dark:text-rh-text">
                    <span className="font-medium">Suggestion: </span>
                    {insight.suggestion}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
          Powered by AI {data.cached ? '(cached)' : ''} &middot; {data.holdingCount} holdings, {data.activityCount} activities analyzed &middot; Not financial advice
        </span>
        {timeAgo && (
          <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
            Generated {timeAgo}
          </span>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
