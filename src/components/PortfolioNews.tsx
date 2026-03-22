import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getPortfolioNews, PortfolioNewsResponse, MacroSummary } from '../api';

const SENTIMENT_STYLES: Record<string, { color: string; label: string }> = {
  bullish: { color: 'text-rh-green', label: 'Bullish' },
  bearish: { color: 'text-rh-red', label: 'Bearish' },
  neutral: { color: 'text-rh-light-muted dark:text-rh-muted', label: 'Neutral' },
  mixed: { color: 'text-amber-500', label: 'Mixed' },
};

// Common words that look like tickers but aren't
const TICKER_BLACKLIST = new Set([
  'AI', 'US', 'UK', 'EU', 'ETF', 'CEO', 'CFO', 'IPO', 'GDP', 'CPI',
  'FED', 'SEC', 'PE', 'YTD', 'ATH', 'EPS', 'ROI', 'ROE', 'AND', 'THE',
  'FOR', 'NOT', 'BUT', 'ALL', 'HAS', 'HAD', 'ARE', 'WAS', 'CAN', 'MAY',
  'NEW', 'OLD', 'BIG', 'LOW', 'TOP', 'ADD', 'SET', 'RUN', 'CUT', 'OWN',
  'NET', 'TWO', 'DAY', 'KEY', 'MIX', 'VIA', 'PRE', 'PER', 'ITS', 'NOW',
]);

/**
 * Parse text and make ticker symbols clickable.
 * Uses the tickersFetched list from the API response as the source of valid tickers,
 * so it works for ANY user regardless of what they hold.
 */
function RichText({ text, tickers, onTickerClick }: {
  text: string;
  tickers: Set<string>;
  onTickerClick?: (ticker: string) => void;
}) {
  // Skip ticker parsing for very long text to prevent ReDoS
  if (text.length > 5000) return <>{text}</>;
  const parts = text.split(/\b([A-Z]{2,5})\b/g);
  return (
    <>
      {parts.map((part, i) => {
        if (tickers.has(part) && !TICKER_BLACKLIST.has(part)) {
          return (
            <button
              key={i}
              onClick={() => onTickerClick?.(part)}
              className="font-semibold text-rh-green hover:text-rh-green/80 transition-colors"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MacroSummaryCard({ summary, tickers, onTickerClick, onRefresh, refreshing }: {
  summary: MacroSummary;
  tickers: Set<string>;
  onTickerClick?: (ticker: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
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
        <RichText text={summary.overview} tickers={tickers} onTickerClick={onTickerClick} />
      </p>

      {/* Portfolio Impact */}
      <p className="text-xs text-rh-light-muted dark:text-rh-muted leading-relaxed mb-3">
        <RichText text={summary.portfolioImpact} tickers={tickers} onTickerClick={onTickerClick} />
      </p>

      {/* Outlook */}
      <p className="text-xs text-rh-light-muted/80 dark:text-rh-muted/70 leading-relaxed mb-4 italic">
        <RichText text={summary.outlook} tickers={tickers} onTickerClick={onTickerClick} />
      </p>

    </div>
  );
}

interface PortfolioNewsProps {
  onTickerClick?: (ticker: string) => void;
}

export function PortfolioNews({ onTickerClick }: PortfolioNewsProps) {
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

  // Build ticker set from ALL matched tickers across news items + fetched tickers.
  // This is the algorithm that makes it work for every user:
  // 1. API fetches the user's holdings (whatever they are)
  // 2. API fetches news for their top 10 holdings by value
  // 3. API tags each article with which holdings it mentions
  // 4. tickersFetched = the tickers we queried news for
  // 5. matchedTickers on each item = which holdings appear in that article
  // 6. We union all of these into a Set so RichText can highlight any of them
  const tickerSet = useMemo(() => {
    if (!data) return new Set<string>();
    const set = new Set<string>(data.tickersFetched);
    for (const item of data.items) {
      for (const t of item.matchedTickers) set.add(t);
    }
    return set;
  }, [data]);

  // Count how many articles mention each ticker
  const mentionCounts = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const item of data.items) {
      for (const t of item.matchedTickers) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([ticker, count]) => ({ ticker, count }));
  }, [data]);

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
        <MacroSummaryCard
          summary={data.summary}
          tickers={tickerSet}
          onTickerClick={onTickerClick}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      ) : (
        <div className="py-12 text-center">
          <div className="w-5 h-5 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">Generating your market analysis...</p>
        </div>
      )}

      {/* In The News Tracker */}
      {mentionCounts.length > 0 && (() => {
        const maxCount = mentionCounts[0]?.count ?? 1;
        return (
          <div className="mt-6 pt-5 border-t border-gray-200/10 dark:border-white/[0.04]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-rh-green" />
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">In The News</h3>
            </div>
            <div className="space-y-2">
              {mentionCounts.map(({ ticker, count }) => (
                <button
                  key={ticker}
                  onClick={() => onTickerClick?.(ticker)}
                  className="w-full flex items-center gap-3 group"
                >
                  <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text group-hover:text-rh-green transition-colors w-14 text-left tabular-nums">{ticker}</span>
                  <div className="flex-1 h-4 bg-gray-100/50 dark:bg-white/[0.03] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rh-green/40 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max((count / maxCount) * 100, 4)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums text-rh-light-muted dark:text-rh-muted w-6 text-right">{count}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
