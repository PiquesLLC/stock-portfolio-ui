import { useState, useEffect, useRef } from 'react';
import { getEarningsPreviews, EarningsPreviewItem } from '../api';
import { SkeletonCard } from './SkeletonCard';
import { PremiumOverlay } from './PremiumOverlay';
import { useAuth, PlanTier } from '../context/AuthContext';
import { earningsPreviewCache, EARNINGS_CACHE_TTL_MS } from '../utils/earnings-cache';

interface EarningsPreviewProps {
  onTickerClick?: (ticker: string) => void;
  portfolioId?: string;
}

function StreakDots({ type, count }: { type: string; count: number }) {
  const color = type === 'beat' ? 'bg-rh-green' : type === 'miss' ? 'bg-red-400' : 'bg-gray-400 dark:bg-gray-600';
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${color}`} />
      ))}
    </div>
  );
}

function formatCountdown(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

function PreviewCard({ item, onTickerClick }: { item: EarningsPreviewItem; onTickerClick?: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const preview = item.preview;

  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.05] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-start gap-4">
        {/* Countdown badge */}
        <div className="shrink-0 w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-400/20 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-amber-500 dark:text-amber-400 leading-none tabular-nums">
            {item.daysUntil}
          </span>
          <span className="text-[9px] text-amber-500/60 dark:text-amber-400/50">
            {item.daysUntil === 1 ? 'day' : 'days'}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTickerClick?.(item.ticker)}
              className="text-base font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
            >
              {item.ticker}
            </button>
            {item.daysUntil === 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">Live</span>
            )}
          </div>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
            Reports {formatCountdown(item.daysUntil)} · {new Date(item.reportDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {item.estimatedEPS !== null && (
              <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                Est. <span className="font-medium text-rh-light-text dark:text-rh-text">${item.estimatedEPS.toFixed(2)}</span>
              </span>
            )}
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              Beat rate <span className="font-medium text-rh-light-text dark:text-rh-text">{item.beatRate}%</span>
            </span>
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              Avg surprise <span className={`font-medium ${item.avgSurprisePct >= 0 ? 'text-rh-green' : 'text-red-400'}`}>{item.avgSurprisePct >= 0 ? '+' : ''}{item.avgSurprisePct.toFixed(1)}%</span>
            </span>
            {item.currentStreak.count > 0 && (
              <div className="flex items-center gap-1.5">
                <StreakDots type={item.currentStreak.type} count={item.currentStreak.count} />
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                  {item.currentStreak.count}x {item.currentStreak.type}
                </span>
              </div>
            )}
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              Consistency <span className="font-medium text-rh-light-text dark:text-rh-text">{item.consistencyScore}/100</span>
            </span>
          </div>
        </div>
      </div>

      {/* AI Preview */}
      {preview && (
        <div className="border-t border-gray-200/30 dark:border-white/[0.04]">
          {/* What to Watch - always visible */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50 mb-1.5">What to Watch</p>
            <p className="text-xs text-rh-light-text dark:text-rh-text leading-relaxed">{preview.whatToWatch}</p>
          </div>

          {/* Expandable sections */}
          {expanded && (
            <div className="px-4 pb-3 space-y-3">
              {/* Analyst Sentiment */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50 mb-1">Analyst Sentiment</p>
                <p className="text-xs text-rh-light-muted dark:text-rh-muted">{preview.analystSentiment}</p>
              </div>

              {/* Catalysts + Risks in 2-col */}
              <div className="grid grid-cols-2 gap-3">
                {preview.catalysts.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-green/60 mb-1.5">Catalysts</p>
                    <ul className="space-y-1">
                      {preview.catalysts.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-rh-light-text dark:text-rh-text">
                          <span className="text-rh-green mt-0.5 shrink-0">+</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.riskFactors.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400/60 mb-1.5">Risks</p>
                    <ul className="space-y-1">
                      {preview.riskFactors.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-rh-light-text dark:text-rh-text">
                          <span className="text-red-400 mt-0.5 shrink-0">-</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Citations */}
              {item.citations.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30">
                    Sources: {item.citations.map((url, i) => {
                      const isSafeUrl = /^https?:\/\//i.test(url);
                      return isSafeUrl ? (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="hover:text-rh-green transition-colors">
                          [{i + 1}]
                        </a>
                      ) : (
                        <span key={i}>[{i + 1}]</span>
                      );
                    }).reduce((a: React.ReactNode[], b, i) => i === 0 ? [b] : [...a, ' ', b], [])}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 text-[11px] font-medium text-rh-light-muted dark:text-rh-muted hover:text-rh-green transition-colors border-t border-gray-200/20 dark:border-white/[0.03]"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}

      {/* No AI preview fallback */}
      {!preview && (
        <div className="px-4 py-2 border-t border-gray-200/20 dark:border-white/[0.03]">
          <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30 italic">AI preview unavailable</p>
        </div>
      )}
    </div>
  );
}

function EarningsPreviewContent({ onTickerClick, portfolioId }: EarningsPreviewProps) {
  const cached = earningsPreviewCache.get(portfolioId);
  const [items, setItems] = useState<EarningsPreviewItem[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;

  useEffect(() => {
    mountedRef.current = true;

    async function fetchPreviews() {
      const fetchPortfolioId = portfolioId; // capture at call time
      const cachedEntry = earningsPreviewCache.get(portfolioId);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < EARNINGS_CACHE_TTL_MS) {
        setItems(cachedEntry.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const resp = await getEarningsPreviews(portfolioId);
        if (!mountedRef.current || fetchPortfolioId !== currentPortfolioIdRef.current) return;
        earningsPreviewCache.set(portfolioId, { data: resp.results, partial: resp.partial, timestamp: Date.now() });
        setItems(resp.results);
      } catch (e: unknown) {
        if (!mountedRef.current || fetchPortfolioId !== currentPortfolioIdRef.current) return;
        const msg = e instanceof Error ? e.message : 'Failed to load previews';
        if (msg.includes('upgrade_required')) {
          // Plan gate handled by PremiumOverlay wrapper, shouldn't reach here
          setError('Elite plan required');
        } else {
          setError(msg);
        }
      }
      if (mountedRef.current) setLoading(false);
    }

    // Reset state when portfolioId changes to avoid showing stale data
    const prevCached = earningsPreviewCache.get(portfolioId);
    setItems(prevCached?.data ?? []);
    setLoading(!prevCached);
    setError(null);

    fetchPreviews();
    return () => { mountedRef.current = false; };
  }, [portfolioId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={3} height="140px" />
        <SkeletonCard lines={3} height="140px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-50/40 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.05] rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-gray-50/40 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/[0.05] rounded-2xl p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">No earnings previews in the next 14 days</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50">
          AI Earnings Previews
        </h3>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/15">
          Elite
        </span>
      </div>
      {items.map((item) => (
        <PreviewCard key={item.ticker} item={item} onTickerClick={onTickerClick} />
      ))}
    </div>
  );
}

const PLAN_RANK: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2, elite: 3 };

export function EarningsPreview({ onTickerClick, portfolioId }: EarningsPreviewProps) {
  const { user } = useAuth();
  const hasAccess = PLAN_RANK[user?.plan || 'free'] >= PLAN_RANK['elite'];

  return (
    <PremiumOverlay
      featureName="AI Earnings Previews"
      description="Get AI-powered previews for upcoming earnings with analyst sentiment, catalysts, and risk factors for your holdings."
      requiredPlan="elite"
    >
      {hasAccess ? <EarningsPreviewContent onTickerClick={onTickerClick} portfolioId={portfolioId} /> : undefined}
    </PremiumOverlay>
  );
}
