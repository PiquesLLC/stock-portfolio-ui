import { useState, useEffect, useRef, useCallback } from 'react';
import { getFastQuote } from '../api';

interface IndexQuote {
  ticker: string;
  label: string;
  price: number;
  changePercent: number;
}

const INDICES = [
  { ticker: 'SPY', label: 'S&P 500' },
  { ticker: 'QQQ', label: 'Nasdaq' },
  { ticker: 'DIA', label: 'Dow' },
];

const REFRESH_MS = 30_000;

interface MarketStripProps {
  onTickerClick: (ticker: string) => void;
}

export function MarketStrip({ onTickerClick }: MarketStripProps) {
  const [quotes, setQuotes] = useState<IndexQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        INDICES.map(async ({ ticker, label }) => {
          const q = await getFastQuote(ticker);
          return {
            ticker,
            label,
            price: q.currentPrice,
            changePercent: q.changePercent,
          };
        })
      );

      const filled: IndexQuote[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') filled.push(r.value);
      }
      if (filled.length > 0) {
        setQuotes(filled);
        setLoading(false);
      }
    } catch {
      // Keep existing data on error
    }
  }, []);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="hidden sm:flex relative z-10 items-center justify-center gap-6 py-1.5 px-4
        border-b border-gray-200/60 dark:border-white/[0.04]
        bg-gray-50/80 dark:bg-white/[0.015]">
        {INDICES.map(({ label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[11px] text-rh-light-muted/50 dark:text-white/20 font-medium">{label}</span>
            <div className="w-10 h-3 rounded-sm bg-gray-200/60 dark:bg-white/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (quotes.length === 0) return null;

  return (
    <div className="hidden sm:flex relative z-10 items-center justify-center gap-6 py-1.5 px-4
      border-b border-gray-200/60 dark:border-white/[0.04]
      bg-gray-50/80 dark:bg-white/[0.015]">
      {quotes.map((q) => {
        const positive = q.changePercent >= 0;
        const color = positive ? 'text-rh-green' : 'text-rh-red';

        return (
          <button
            key={q.ticker}
            onClick={() => onTickerClick(q.ticker)}
            className="flex items-center gap-1.5 py-0.5 px-1.5 rounded-md
              hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors duration-150
              group cursor-pointer"
          >
            <span className="text-[11px] font-medium text-rh-light-muted dark:text-white/40
              group-hover:text-rh-light-text dark:group-hover:text-white/70 transition-colors">
              {q.label}
            </span>
            <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
              {q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-[10px] font-semibold tabular-nums ${color}`}>
              {positive ? '+' : ''}{q.changePercent.toFixed(2)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
