import { useState, useEffect } from 'react';
import { getPortfolioBriefing, PortfolioBriefingResponse } from '../api';

function SentimentBorder({ sentiment }: { sentiment?: string }) {
  if (sentiment === 'positive') return 'border-l-4 border-rh-green';
  if (sentiment === 'negative') return 'border-l-4 border-rh-red';
  return 'border-l-4 border-rh-light-border dark:border-rh-border';
}

export default function PortfolioBriefing() {
  const [briefing, setBriefing] = useState<PortfolioBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading && !briefing) {
    return (
      <div className="space-y-4">
        <div className="bg-rh-light-card dark:bg-rh-card rounded-xl p-6 animate-pulse">
          <div className="h-4 bg-rh-light-bg dark:bg-rh-dark rounded w-1/3 mb-4" />
          <div className="h-6 bg-rh-light-bg dark:bg-rh-dark rounded w-3/4 mb-3" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-rh-light-bg dark:bg-rh-dark rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !briefing) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card rounded-xl p-6">
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
      <div className="bg-rh-light-card dark:bg-rh-card rounded-xl p-6 text-center">
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
      <div className="bg-rh-light-card dark:bg-rh-card rounded-xl p-6">
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
            : 'border-l-4 border-rh-light-border dark:border-rh-border';

        return (
          <div
            key={i}
            className={`bg-rh-light-card dark:bg-rh-card rounded-xl p-5 ${borderClass}`}
          >
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-2">
              {section.title}
            </h3>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed">
              {section.body}
            </p>
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
