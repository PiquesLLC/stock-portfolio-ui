import { useState, useEffect, useRef, useCallback } from 'react';
import { getPortfolioNews, PortfolioNewsResponse, MacroSummary } from '../api';

const SENTIMENT_STYLES: Record<string, { color: string; label: string }> = {
  bullish: { color: 'text-rh-green', label: 'Bullish' },
  bearish: { color: 'text-rh-red', label: 'Bearish' },
  neutral: { color: 'text-rh-light-muted dark:text-rh-muted', label: 'Neutral' },
  mixed: { color: 'text-amber-500', label: 'Mixed' },
};

function MacroSummaryCard({ summary, onRefresh, refreshing }: { summary: MacroSummary; onRefresh: () => void; refreshing: boolean }) {
  const sentimentStyle = SENTIMENT_STYLES[summary.sentiment] || SENTIMENT_STYLES.neutral;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Market Analysis</h2>
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">Powered by NALA AI</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold ${sentimentStyle.color}`}>
            {sentimentStyle.label}
          </span>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-rh-text transition-colors disabled:opacity-30"
            title="Refresh analysis"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    getPortfolioNews(40)
      .then(res => { if (mountedRef.current) setData(res); })
      .catch(err => { if (mountedRef.current) setError(err.message); })
      .finally(() => { if (mountedRef.current) { setLoading(false); setRefreshing(false); } });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !data) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <div className="h-3 bg-gray-200/50 dark:bg-white/[0.04] rounded w-28" />
        </div>
        <div className="h-4 bg-gray-200/40 dark:bg-white/[0.04] rounded w-full mb-2" />
        <div className="h-4 bg-gray-200/30 dark:bg-white/[0.03] rounded w-5/6 mb-3" />
        <div className="h-3 bg-gray-200/20 dark:bg-white/[0.02] rounded w-2/3 mb-3" />
        <div className="h-3 bg-gray-200/20 dark:bg-white/[0.02] rounded w-1/2 mb-4" />
        <div className="flex gap-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-5 bg-gray-200/20 dark:bg-white/[0.03] rounded-full w-20" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-rh-red mb-2">Failed to load market analysis</p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">{error}</p>
        <button onClick={fetchData} className="text-xs text-rh-green hover:text-rh-green/80 font-medium">Try again</button>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg className="w-12 h-12 mx-auto mb-3 text-rh-light-muted/20 dark:text-rh-muted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">No market data available</p>
        <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50 mt-1">Add holdings to see your personalized analysis</p>
      </div>
    );
  }

  return (
    <div>
      {data.summary ? (
        <MacroSummaryCard summary={data.summary} onRefresh={handleRefresh} refreshing={refreshing} />
      ) : (
        <div className="py-12 text-center">
          <div className="w-5 h-5 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">Generating your market analysis...</p>
        </div>
      )}
    </div>
  );
}
