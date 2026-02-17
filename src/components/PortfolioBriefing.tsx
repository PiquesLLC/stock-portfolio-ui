import { useState, useEffect, useRef, useCallback } from 'react';
import { getPortfolioBriefing, explainBriefingSection, PortfolioBriefingResponse, BriefingExplainResponse } from '../api';

function getSentimentEmoji(_verdict?: string, sections?: PortfolioBriefingResponse['sections']): string {
  if (!sections || sections.length === 0) return '📊';
  const pos = sections.filter(s => s.sentiment === 'positive').length;
  const neg = sections.filter(s => s.sentiment === 'negative').length;
  if (pos > neg + 1) return '🚀';
  if (pos > neg) return '📈';
  if (neg > pos + 1) return '⚠️';
  if (neg > pos) return '📉';
  return '⚖️';
}

function getSentimentPill(sentiment?: string) {
  if (sentiment === 'positive') return { label: 'Tailwind', cls: 'bg-rh-green/15 text-rh-green' };
  if (sentiment === 'negative') return { label: 'Headwind', cls: 'bg-rh-red/15 text-rh-red' };
  return { label: 'Neutral', cls: 'bg-white/[0.08] text-white/50' };
}

// Extract numbers/percentages from text for highlighting
function extractHighlights(text: string): string[] {
  const matches = text.match(/[-+]?\d+\.?\d*%|[-+]?\$[\d,]+\.?\d*|\$[\d,]+\.?\d*/g);
  return matches ? [...new Set(matches)].slice(0, 3) : [];
}

export default function PortfolioBriefing() {
  const [briefing, setBriefing] = useState<PortfolioBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, BriefingExplainResponse>>({});
  const [loadingIdxs, setLoadingIdxs] = useState<Set<number>>(new Set());
  const prefetchedRef = useRef(false);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);
    prefetchedRef.current = false;
    try {
      const data = await getPortfolioBriefing();
      setBriefing(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, []);

  const prefetchAll = useCallback((sections: PortfolioBriefingResponse['sections']) => {
    sections.forEach((section, idx) => {
      setLoadingIdxs((prev) => new Set(prev).add(idx));
      explainBriefingSection(section.title, section.body)
        .then((result) => {
          setExplanations((prev) => ({ ...prev, [idx]: result }));
        })
        .catch(() => {
          setExplanations((prev) => ({ ...prev, [idx]: { explanation: 'Unable to load detailed explanation at this time.', citations: [], cached: false } }));
        })
        .finally(() => {
          setLoadingIdxs((prev) => { const next = new Set(prev); next.delete(idx); return next; });
        });
    });
  }, []);

  useEffect(() => {
    if (briefing && briefing.sections.length > 0 && !prefetchedRef.current) {
      prefetchedRef.current = true;
      prefetchAll(briefing.sections);
    }
  }, [briefing, prefetchAll]);

  const handleSectionClick = (idx: number) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  if (loading && !briefing) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 animate-pulse">
          <div className="h-10 bg-gray-100/60 dark:bg-white/[0.06] rounded-lg w-16 mx-auto mb-4" />
          <div className="h-5 bg-gray-100/60 dark:bg-white/[0.06] rounded w-2/3 mx-auto mb-3" />
          <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/2 mx-auto" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-50/80 dark:bg-white/[0.04] rounded-xl p-5 animate-pulse">
            <div className="h-4 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/3 mb-3" />
            <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error && !briefing) {
    // Check if this is a plan-gating 403
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
        <button onClick={fetchBriefing} className="mt-2 text-xs text-rh-green hover:underline">Try again</button>
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
        <button onClick={fetchBriefing} className="mt-3 text-xs text-rh-green hover:underline">Retry</button>
      </div>
    );
  }

  const timeAgo = briefing.generatedAt ? getTimeAgo(new Date(briefing.generatedAt)) : '';

  return (
    <div className="space-y-4">
      {/* Hero Verdict Card */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-rh-green/[0.03] to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30">
              Weekly Briefing
            </span>
            <button
              onClick={fetchBriefing}
              disabled={loading}
              className="text-[10px] text-rh-green hover:underline disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="text-4xl mb-3">{getSentimentEmoji(briefing.verdict, briefing.sections)}</div>
          <h2 className="text-lg font-bold text-rh-light-text dark:text-white leading-snug mb-2">
            {briefing.headline}
          </h2>
          {briefing.verdict && (
            <p className="text-sm text-rh-light-muted dark:text-white/50 italic">
              {briefing.verdict}
            </p>
          )}
        </div>
      </div>

      {/* Section Cards */}
      {briefing.sections.map((section, i) => {
        const pill = getSentimentPill(section.sentiment);
        const isExpanded = expandedIdx === i;
        const highlights = extractHighlights(section.body);

        return (
          <div
            key={i}
            className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl overflow-hidden transition-all"
          >
            <div
              onClick={() => handleSectionClick(i)}
              className="p-5 cursor-pointer hover:bg-gray-100/80 dark:hover:bg-white/[0.06] transition-colors group"
            >
              {/* Title + sentiment pill */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>
                  {pill.label}
                </span>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-white/35">
                  {section.title}
                </h3>
                <svg
                  className={`w-3.5 h-3.5 ml-auto text-rh-light-muted/40 dark:text-white/20 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Bold takeaway as the main headline */}
              {section.takeaway && (
                <p className="text-sm font-semibold text-rh-light-text dark:text-white/90 mb-2 leading-snug">
                  {section.takeaway}
                </p>
              )}

              {/* Key number highlights */}
              {highlights.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {highlights.map((h, hi) => (
                    <span key={hi} className="text-lg font-mono font-bold text-rh-light-text dark:text-white/80">
                      {h}
                    </span>
                  ))}
                </div>
              )}

              {/* Body — collapsed by default, show 2 lines */}
              <p className={`text-sm text-rh-light-muted dark:text-white/40 leading-relaxed ${
                isExpanded ? '' : 'line-clamp-2'
              }`}>
                {section.body}
              </p>
            </div>

            {/* Deep-dive explanation */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-gray-200/20 dark:border-white/[0.04]">
                {loadingIdxs.has(i) ? (
                  <div className="pt-4">
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">
                      Researching — this may take 5–15 seconds...
                    </p>
                    <div className="space-y-3 animate-pulse">
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-5/6" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-4/6" />
                    </div>
                  </div>
                ) : explanations[i] ? (
                  <div className="pt-4">
                    <div className="text-sm text-rh-light-text dark:text-rh-text leading-relaxed whitespace-pre-line">
                      {explanations[i].explanation}
                    </div>
                    {explanations[i].citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200/20 dark:border-white/[0.04]">
                        <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/50 mb-1">Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {explanations[i].citations.map((url, ci) => (
                            <a
                              key={ci}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-rh-green/70 hover:text-rh-green truncate max-w-[200px]"
                            >
                              {new URL(url).hostname}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30">
          Context, not advice.
        </span>
        {timeAgo && (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30">
            {timeAgo}
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
