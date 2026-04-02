import { useState, useEffect, useMemo, useRef } from 'react';
import { getBehaviorInsights, BehaviorInsightsResponse, BehaviorInsight } from '../api';
import { timeAgo } from '../utils/format';
import { navigateToPricing } from '../utils/navigate-to-pricing';
import { StepLoader } from './StepLoader';

const BEHAVIOR_STEPS = [
  'Reviewing your trade history',
  'Detecting behavioral patterns',
  'Evaluating risk habits',
  'Writing coaching insights',
];

// ── Severity styles ──────────────────────────────────────────────
const SEVERITY_STYLES: Record<BehaviorInsight['severity'], { border: string; badge: string; badgeText: string; priorityBorder: string }> = {
  positive: {
    border: 'border-l-4 border-rh-green',
    badge: 'text-rh-green',
    badgeText: 'Good',
    priorityBorder: 'border-l-4 border-rh-green',
  },
  warning: {
    border: 'border-l-4 border-yellow-500',
    badge: 'text-yellow-500',
    badgeText: 'Watch',
    priorityBorder: 'border-l-[6px] border-yellow-500',
  },
  info: {
    border: 'border-l-4 border-blue-500',
    badge: 'text-blue-400',
    badgeText: 'Tip',
    priorityBorder: 'border-l-4 border-blue-500',
  },
};

// ── Category icons (inline SVG paths) ────────────────────────────
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
  portfolioId?: string;
}

export default function BehaviorInsights({ onTickerClick, portfolioTickers = [], portfolioId }: BehaviorInsightsProps) {
  const [data, setData] = useState<BehaviorInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;

  const fetchData = async () => {
    const fetchPortfolioId = portfolioId; // capture at call time
    setLoading(true);
    setError(null);
    try {
      const result = await getBehaviorInsights(portfolioId);
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      setData(result);
    } catch (err: any) {
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      setError(err.message || 'Failed to load behavior insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [portfolioId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // All cards start collapsed
  useEffect(() => {
    setExpandedCards(new Set());
  }, [sortedInsights]);

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
    return <StepLoader title="Analyzing Behavior" steps={BEHAVIOR_STEPS} interval={3000} />;
  }

  // ── Error state ────────────────────────────────────────────────
  if (error && !data) {
    const isPlanError = error.includes('upgrade_required') || error.includes('limit_reached');
    if (isPlanError) {
      return (
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-rh-light-text dark:text-white mb-1">AI Behavior Coach</h3>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">Upgrade to Premium to unlock AI-powered behavior analysis.</p>
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
      <div className="p-6">
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
      <div className="p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add holdings to your portfolio to receive behavior insights.
        </p>
      </div>
    );
  }

  const generatedAgo = data.generatedAt ? timeAgo(new Date(data.generatedAt)) : '';
  const score = computeBehaviorScore(sortedInsights);

  // Severity counts
  const counts = { positive: 0, warning: 0, info: 0 };
  for (const insight of sortedInsights) counts[insight.severity]++;

  return (
    <div className="space-y-3">
      {/* ── Score + Summary Header ─────────────────────────────── */}
      <div className="pb-4 border-b border-gray-200/10 dark:border-white/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Circular score */}
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none"
                  className="text-gray-200/60 dark:text-white/[0.06]" />
                <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="none"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 - (2 * Math.PI * 26 * score) / 100}
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
        <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 leading-relaxed mb-5">
          For educational purposes only. Not financial advice. Always do your own research and consult a qualified financial advisor before making investment decisions.
        </p>

        {/* ── Severity Summary Bar ──────────────────────────────── */}
        <div className="flex items-center gap-3 text-xs">
          {counts.positive > 0 && (
            <span className="flex items-center gap-1.5 text-rh-green">
              <span className="w-1.5 h-1.5 rounded-full bg-rh-green" />
              {counts.positive} Good
            </span>
          )}
          {counts.warning > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-500">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              {counts.warning} Watch
            </span>
          )}
          {counts.info > 0 && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
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
        const tickers = extractTickers(`${insight.title} ${insight.observation}`, portfolioTickers);

        return (
          <div
            key={i}
            className={`transition-all duration-200 ${
              isTopPriority ? style.priorityBorder : style.border
            }`}
          >
            {/* Clickable header */}
            <button
              onClick={() => toggleCard(i)}
              className="w-full text-left px-5 py-4 flex items-center gap-3 group"
            >
              {/* Priority label */}
              {isTopPriority && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 shrink-0">
                  Priority
                </span>
              )}

              {/* Severity badge */}
              <span className={`text-[10px] font-semibold uppercase shrink-0 ${style.badge}`}>
                {style.badgeText}
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

                {/* Suggestion */}
                <div className="border-l-2 border-rh-green/40 pl-3 py-1">
                  <p className="text-xs text-rh-light-muted dark:text-white/50">
                    <span className="font-medium text-rh-light-text dark:text-white/70">Suggestion: </span>
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
        {generatedAgo && (
          <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
            Generated {generatedAgo}
          </span>
        )}
      </div>
    </div>
  );
}

