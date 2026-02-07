import { useState, useEffect } from 'react';
import { getPortfolioBriefing, explainBriefingSection, PortfolioBriefingResponse, BriefingExplainResponse } from '../api';

export default function PortfolioBriefing() {
  const [briefing, setBriefing] = useState<PortfolioBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track expanded sections and their explanations
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<BriefingExplainResponse | null>(null);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);
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

  const handleSectionClick = async (idx: number) => {
    // Toggle off if already expanded
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      setExplanation(null);
      return;
    }

    setExpandedIdx(idx);
    setExplanation(null);
    setExplaining(true);

    try {
      const section = briefing!.sections[idx];
      const result = await explainBriefingSection(section.title, section.body);
      setExplanation(result);
    } catch {
      setExplanation({ explanation: 'Unable to load detailed explanation at this time.', citations: [], cached: false });
    } finally {
      setExplaining(false);
    }
  };

  if (loading && !briefing) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 animate-pulse">
          <div className="h-4 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/3 mb-4" />
          <div className="h-6 bg-gray-100/60 dark:bg-white/[0.06] rounded w-3/4 mb-3" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100/60 dark:bg-white/[0.06] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !briefing) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <p className="text-sm text-rh-red">{error}</p>
        <button
          onClick={fetchBriefing}
          className="mt-2 text-xs text-rh-green hover:underline"
        >
          Try again
        </button>
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

  const timeAgo = briefing.generatedAt
    ? getTimeAgo(new Date(briefing.generatedAt))
    : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rh-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
              Weekly Briefing
            </h2>
          </div>
          <button
            onClick={fetchBriefing}
            disabled={loading}
            className="text-xs text-rh-green hover:underline disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Headline */}
        <p className="text-sm font-medium text-rh-light-text dark:text-rh-text leading-relaxed">
          {briefing.headline}
        </p>
      </div>

      {/* Sections */}
      {briefing.sections.map((section, i) => {
        const borderClass = section.sentiment === 'positive'
          ? 'border-l-4 border-rh-green'
          : section.sentiment === 'negative'
            ? 'border-l-4 border-rh-red'
            : 'border-l-4 border-gray-200/30 dark:border-white/[0.04]';

        const isExpanded = expandedIdx === i;

        return (
          <div
            key={i}
            className={`bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl ${borderClass} transition-colors`}
          >
            {/* Clickable header area */}
            <div
              onClick={() => handleSectionClick(i)}
              className="p-5 cursor-pointer hover:bg-gray-100/80 dark:hover:bg-white/[0.06] transition-colors rounded-xl group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-2">
                    {section.title}
                  </h3>
                  <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed">
                    {section.body}
                  </p>
                </div>
                <span className={`text-[10px] shrink-0 mt-0.5 transition-colors ${
                  isExpanded
                    ? 'text-rh-green'
                    : 'text-rh-light-muted/0 group-hover:text-rh-green dark:text-rh-muted/0 dark:group-hover:text-rh-green'
                }`}>
                  {isExpanded ? 'Collapse ↑' : 'Deep dive →'}
                </span>
              </div>
            </div>

            {/* Expanded explanation */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-gray-200/30 dark:border-white/[0.04]">
                {explaining ? (
                  <div className="pt-4">
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">
                      Researching — this may take 5–15 seconds...
                    </p>
                    <div className="space-y-3 animate-pulse">
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-5/6" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-4/6" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
                      <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-3/4" />
                    </div>
                  </div>
                ) : explanation ? (
                  <div className="pt-4">
                    <div className="text-sm text-rh-light-text dark:text-rh-text leading-relaxed whitespace-pre-line">
                      {explanation.explanation}
                    </div>
                    {explanation.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200/20 dark:border-white/[0.04]">
                        <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/50 mb-1">Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {explanation.citations.map((url, ci) => (
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
        <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
          Powered by AI {briefing.cached ? '(cached)' : ''}
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
