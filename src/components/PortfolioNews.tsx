import { useState, useEffect, useRef } from 'react';
import { getPortfolioNews, PortfolioNewsResponse, MacroSummary } from '../api';

const SENTIMENT_STYLES: Record<string, { color: string; label: string }> = {
  bullish: { color: 'text-rh-green', label: 'Bullish' },
  bearish: { color: 'text-rh-red', label: 'Bearish' },
  neutral: { color: 'text-rh-light-muted dark:text-rh-muted', label: 'Neutral' },
  mixed: { color: 'text-amber-500', label: 'Mixed' },
};

function MacroSummaryCard({ summary }: { summary: MacroSummary }) {
  const sentimentStyle = SENTIMENT_STYLES[summary.sentiment] || SENTIMENT_STYLES.neutral;

  return (
    <div className="mb-6 pb-5 border-b border-gray-200/10 dark:border-white/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Market Analysis</h2>
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">Powered by NALA AI</span>
        </div>
        <span className={`text-[11px] font-semibold ${sentimentStyle.color}`}>
          {sentimentStyle.label}
        </span>
      </div>

      {/* Overview */}
      <p className="text-sm text-rh-light-text dark:text-rh-text leading-relaxed mb-3">
        {summary.overview}
      </p>

      {/* Portfolio Impact */}
      <p className="text-xs text-rh-light-muted dark:text-rh-muted leading-relaxed mb-3">
        {summary.portfolioImpact}
      </p>

      {/* Outlook */}
      <p className="text-xs text-rh-light-muted/80 dark:text-rh-muted/70 leading-relaxed mb-4 italic">
        {summary.outlook}
      </p>

      {/* Theme pills */}
      {summary.keyThemes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {summary.keyThemes.map((theme, i) => (
            <span
              key={i}
              className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted"
            >
              {theme}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface PortfolioNewsProps {
  onTickerClick?: (ticker: string) => void;
}

export function PortfolioNews({ onTickerClick: _onTickerClick }: PortfolioNewsProps) {
  const [data, setData] = useState<PortfolioNewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    getPortfolioNews(40)
      .then(res => { if (mountedRef.current) setData(res); })
      .catch(err => { if (mountedRef.current) setError(err.message); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {/* Summary skeleton */}
        <div className="mb-6 pb-5 border-b border-gray-200/10 dark:border-white/[0.04] animate-pulse">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-rh-green" />
            <div className="h-3 bg-gray-200/50 dark:bg-white/[0.04] rounded w-28" />
          </div>
          <div className="h-4 bg-gray-200/40 dark:bg-white/[0.04] rounded w-full mb-2" />
          <div className="h-4 bg-gray-200/30 dark:bg-white/[0.03] rounded w-5/6 mb-3" />
          <div className="h-3 bg-gray-200/20 dark:bg-white/[0.02] rounded w-2/3 mb-3" />
          <div className="flex gap-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-5 bg-gray-200/20 dark:bg-white/[0.03] rounded-full w-20" />
            ))}
          </div>
        </div>
        {/* News skeletons */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <div className="h-3 bg-gray-200/50 dark:bg-white/[0.04] rounded w-24" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="py-4 border-b border-gray-200/10 dark:border-white/[0.04] animate-pulse">
            <div className="h-4 bg-gray-200/50 dark:bg-white/[0.04] rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200/30 dark:bg-white/[0.03] rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-200/20 dark:bg-white/[0.02] rounded w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-rh-red mb-2">Failed to load news</p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">{error}</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg className="w-12 h-12 mx-auto mb-3 text-rh-light-muted/20 dark:text-rh-muted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">No news for your holdings</p>
        <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50 mt-1">Add holdings to see personalized news</p>
      </div>
    );
  }

  return (
    <div>
      {data.summary ? (
        <MacroSummaryCard summary={data.summary} />
      ) : (
        <div className="py-12 text-center">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">Generating your market analysis...</p>
          <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50 mt-1">This may take a few seconds</p>
        </div>
      )}
    </div>
  );
}
