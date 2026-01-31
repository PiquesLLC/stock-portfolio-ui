import { useState, useEffect, useRef, useCallback } from 'react';
import { getMarketNews, MarketNewsItem } from '../api';
import { TickerChips } from './TickerChips';

interface WatchHeadlinesProps {
  onTickerClick: (ticker: string) => void;
  onTickersExtracted?: (tickers: string[]) => void;
}

const TICKER_RE = /^[A-Z]{1,5}$/;
const REFRESH_MS = 150_000; // 2.5 min

// Common words that look like tickers but aren't
const TICKER_BLACKLIST = new Set([
  'A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT',
  'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'OUR', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ANY', 'ARE', 'BIG', 'BUT', 'CAN', 'CEO', 'CFO', 'COO', 'CTO',
  'DAY', 'DID', 'EPS', 'ETF', 'FAQ', 'FOR', 'GDP', 'GET', 'GOT', 'HAS', 'HER', 'HIM',
  'HIS', 'HOW', 'IPO', 'IRS', 'ITS', 'LET', 'MAY', 'MOM', 'NBA', 'NEW', 'NFL', 'NOT',
  'NOW', 'NYC', 'OLD', 'ONE', 'OUT', 'OWN', 'PAY', 'PUT', 'RAN', 'RUN', 'SAY', 'SEC',
  'SET', 'SHE', 'TAX', 'THE', 'TOP', 'TRY', 'TWO', 'USA', 'USE', 'WAS', 'WAY', 'WHO',
  'WHY', 'WIN', 'WON', 'YES', 'YET', 'YOU',
  'ALSO', 'BACK', 'BEEN', 'BEST', 'BOTH', 'COME', 'DOWN', 'EACH', 'EVEN', 'FIND',
  'FIRST', 'FROM', 'GAVE', 'GOOD', 'HALF', 'HAVE', 'HERE', 'HIGH', 'HOME', 'INTO',
  'JUST', 'KEEP', 'LAST', 'LIKE', 'LONG', 'LOOK', 'MADE', 'MAKE', 'MANY', 'MEME',
  'MORE', 'MOST', 'MUCH', 'MUST', 'NEXT', 'ONLY', 'OPEN', 'OVER', 'PART', 'PLAN',
  'POST', 'RATE', 'REAL', 'SAID', 'SAME', 'SALE', 'SAYS', 'SELL', 'SHOW', 'SIDE',
  'SOME', 'STAR', 'STOP', 'SUCH', 'TAKE', 'TALK', 'TELL', 'THAN', 'THAT', 'THEM',
  'THEN', 'THEY', 'THIS', 'TIME', 'TOLD', 'VERY', 'WANT', 'WEEK', 'WELL', 'WERE',
  'WHAT', 'WHEN', 'WILL', 'WITH', 'WORK', 'YEAR', 'YOUR',
  'ABOUT', 'AFTER', 'COULD', 'FIRST', 'GREAT', 'LARGE', 'MONEY', 'NEVER',
  'OTHER', 'BEING', 'EVERY', 'STOCK', 'SHARE', 'PRICE', 'TRADE', 'INDEX',
]);

// Well-known tickers to extract from headlines
const KNOWN_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK',
  'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC',
  'XOM', 'KO', 'PFE', 'PEP', 'CSCO', 'NFLX', 'INTC', 'AMD', 'CRM',
  'ADBE', 'PYPL', 'QCOM', 'TXN', 'AVGO', 'COST', 'MRK', 'ABT', 'TMO',
  'ORCL', 'CVX', 'LLY', 'MCD', 'NKE', 'SBUX', 'BABA', 'SQ', 'SHOP',
  'UBER', 'LYFT', 'SNAP', 'PINS', 'ROKU', 'ZM', 'DOCU', 'SNOW', 'PLTR',
  'COIN', 'RIVN', 'LCID', 'SOFI', 'HOOD', 'ARM', 'SMCI', 'MSTR',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO',
]);

function parseTickers(related: string, headline: string): string[] {
  const tickers = new Set<string>();

  // From Finnhub related field
  if (related) {
    for (const t of related.split(',')) {
      const clean = t.trim().toUpperCase();
      if (TICKER_RE.test(clean) && !TICKER_BLACKLIST.has(clean)) {
        tickers.add(clean);
      }
    }
  }

  // From headline text — only match known tickers to avoid false positives
  const words = headline.split(/[\s,.:;!?'"()\-/]+/);
  for (const w of words) {
    const upper = w.toUpperCase();
    if (KNOWN_TICKERS.has(upper) && TICKER_RE.test(upper)) {
      tickers.add(upper);
    }
  }

  return [...tickers];
}

function timeAgo(unix: number): string {
  const secs = Math.floor((Date.now() / 1000) - unix);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function WatchHeadlines({ onTickerClick, onTickersExtracted }: WatchHeadlinesProps) {
  const [headlines, setHeadlines] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(true);

  const fetchNews = useCallback(async () => {
    try {
      const data = await getMarketNews(15);
      if (!mountedRef.current) return;
      setHeadlines(data);
      setLoading(false);

      // Aggregate tickers by frequency
      const freq: Record<string, number> = {};
      for (const item of data) {
        for (const t of parseTickers(item.related, item.headline)) {
          freq[t] = (freq[t] || 0) + 1;
        }
      }
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([t]) => t);
      onTickersExtracted?.(sorted);
    } catch (e) {
      console.error('Headlines fetch error:', e);
      if (mountedRef.current) setLoading(false);
    }
  }, [onTickersExtracted]);

  useEffect(() => {
    mountedRef.current = true;
    fetchNews();
    const id = setInterval(fetchNews, REFRESH_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetchNews]);

  if (loading) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-rh-light-bg dark:bg-rh-dark rounded w-1/3" />
          <div className="h-3 bg-rh-light-bg dark:bg-rh-dark rounded w-full" />
          <div className="h-3 bg-rh-light-bg dark:bg-rh-dark rounded w-5/6" />
          <div className="h-3 bg-rh-light-bg dark:bg-rh-dark rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (headlines.length === 0) return null;

  const visible = expanded ? headlines : headlines.slice(0, 4);
  const hasMore = headlines.length > 4;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">Headlines</h3>
      <div className="space-y-3">
        {visible.map((item) => {
          const tickers = parseTickers(item.related, item.headline);
          return (
            <div key={item.id} className="group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors leading-snug line-clamp-2"
                  >
                    {item.headline}
                  </a>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted">
                      {item.source}
                    </span>
                    <span className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/50">·</span>
                    <span className="text-[11px] tabular-nums text-rh-light-muted/60 dark:text-rh-muted/60">
                      {timeAgo(item.datetime)}
                    </span>
                  </div>
                </div>
              </div>
              {tickers.length > 0 && (
                <div className="mt-1.5">
                  <TickerChips tickers={tickers} onTickerClick={onTickerClick} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
        >
          {expanded ? 'Show less' : `+${headlines.length - 4} more`}
        </button>
      )}
    </div>
  );
}
