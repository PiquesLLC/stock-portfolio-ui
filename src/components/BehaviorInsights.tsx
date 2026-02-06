import { useState, useEffect } from 'react';
import { getBehaviorInsights, BehaviorInsightsResponse, BehaviorInsight } from '../api';

const SEVERITY_STYLES: Record<BehaviorInsight['severity'], { border: string; badge: string; badgeText: string }> = {
  positive: {
    border: 'border-l-4 border-rh-green',
    badge: 'bg-rh-green/10 text-rh-green',
    badgeText: 'Good',
  },
  warning: {
    border: 'border-l-4 border-yellow-500',
    badge: 'bg-yellow-500/10 text-yellow-500',
    badgeText: 'Watch',
  },
  info: {
    border: 'border-l-4 border-blue-500',
    badge: 'bg-blue-500/10 text-blue-500',
    badgeText: 'Tip',
  },
};

const CATEGORY_LABELS: Record<BehaviorInsight['category'], string> = {
  concentration: 'Concentration',
  timing: 'Timing',
  sizing: 'Position Sizing',
  diversification: 'Diversification',
  general: 'General',
};

export default function BehaviorInsights() {
  const [data, setData] = useState<BehaviorInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 animate-pulse">
          <div className="h-4 bg-white/[0.06] dark:bg-white/[0.06] rounded w-1/3 mb-4" />
          <div className="h-16 bg-white/[0.06] dark:bg-white/[0.06] rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-white/[0.06] dark:bg-white/[0.06] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <p className="text-sm text-rh-red">{error}</p>
        <button onClick={fetchData} className="mt-2 text-xs text-rh-green hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.holdingCount === 0) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Add holdings to your portfolio to receive behavior insights.
        </p>
      </div>
    );
  }

  const timeAgo = data.generatedAt
    ? getTimeAgo(new Date(data.generatedAt))
    : '';

  return (
    <div className="space-y-4">
      {/* Header + Summary */}
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rh-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
              Behavior Coach
            </h2>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-xs text-rh-green hover:underline disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed">
          {data.summary}
        </p>
      </div>

      {/* Insight Cards */}
      {data.insights.map((insight, i) => {
        const style = SEVERITY_STYLES[insight.severity];
        return (
          <div
            key={i}
            className={`bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-5 ${style.border}`}
          >
            {/* Title row with badges */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${style.badge}`}>
                {style.badgeText}
              </span>
              <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-white/[0.02] dark:bg-white/[0.02] text-rh-light-muted dark:text-rh-muted">
                {CATEGORY_LABELS[insight.category]}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-1.5">
              {insight.title}
            </h3>

            <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-2">
              {insight.observation}
            </p>

            {/* Suggestion box */}
            <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg px-3 py-2">
              <p className="text-xs text-rh-light-text dark:text-rh-text">
                <span className="font-medium">Suggestion: </span>
                {insight.suggestion}
              </p>
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
          Powered by AI {data.cached ? '(cached)' : ''} &middot; {data.holdingCount} holdings, {data.activityCount} activities analyzed
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
