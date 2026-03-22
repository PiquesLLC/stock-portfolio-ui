import { useState, useEffect, useRef } from 'react';
import { getPortfolioNews, PortfolioNewsItem, PortfolioNewsResponse } from '../api';

function timeAgo(unix: number): string {
  const diff = Math.floor((Date.now() / 1000) - unix);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PortfolioNewsProps {
  onTickerClick?: (ticker: string) => void;
}

export function PortfolioNews({ onTickerClick }: PortfolioNewsProps) {
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
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Portfolio News</h2>
        </div>
        {[1, 2, 3, 4, 5].map(i => (
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-rh-green" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Portfolio News</h2>
        </div>
        <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
          {data.holdingCount} holdings · {data.tickersFetched.length} tracked
        </span>
      </div>

      <div>
        {data.items.map((item) => (
          <NewsRow key={item.id} item={item} onTickerClick={onTickerClick} />
        ))}
      </div>
    </div>
  );
}

function NewsRow({ item, onTickerClick }: { item: PortfolioNewsItem; onTickerClick?: (ticker: string) => void }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block py-3.5 border-b border-gray-200/10 dark:border-white/[0.04] last:border-b-0 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors -mx-2 px-2 rounded-sm"
    >
      <div className="flex gap-3">
        {/* Text content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text leading-snug line-clamp-2 mb-1">
            {item.headline}
          </h3>
          {item.summary && (
            <p className="text-xs text-rh-light-muted dark:text-rh-muted line-clamp-2 mb-1.5">
              {item.summary}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
              {item.source} · {timeAgo(item.datetime)}
            </span>
            {item.matchedTickers.length > 0 && (
              <div className="flex items-center gap-1">
                {item.matchedTickers.slice(0, 4).map(ticker => (
                  <button
                    key={ticker}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTickerClick?.(ticker); }}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-rh-green/[0.08] text-rh-green hover:bg-rh-green/15 transition-colors"
                  >
                    {ticker}
                  </button>
                ))}
                {item.matchedTickers.length > 4 && (
                  <span className="text-[9px] text-rh-light-muted/40 dark:text-rh-muted/40">
                    +{item.matchedTickers.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Thumbnail */}
        {item.image && (
          <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/[0.04]">
            <img
              src={item.image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>
    </a>
  );
}
