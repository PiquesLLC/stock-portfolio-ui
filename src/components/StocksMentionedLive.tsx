import { useState, useEffect, useRef } from 'react';
import { getPrices, PriceData } from '../api';

interface StocksMentionedLiveProps {
  tickers: string[];
  onTickerClick: (ticker: string) => void;
}

const PRICE_REFRESH_MS = 30_000;

function DirectionArrow({ changePercent }: { changePercent: number }) {
  if (changePercent > 0.05) {
    return <span className="text-rh-green">↑</span>;
  }
  if (changePercent < -0.05) {
    return <span className="text-rh-red">↓</span>;
  }
  return <span className="text-rh-light-muted dark:text-rh-muted">→</span>;
}

export function StocksMentionedLive({ tickers, onTickerClick }: StocksMentionedLiveProps) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const tickersKey = tickers.join(',');

  useEffect(() => {
    mountedRef.current = true;
    if (tickers.length === 0) return;

    let intervalId: ReturnType<typeof setInterval>;

    async function fetchPriceData() {
      try {
        setLoading(true);
        const data = await getPrices(tickers);
        if (mountedRef.current) setPrices(data);
      } catch (e) {
        console.error('Mentioned prices error:', e);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchPriceData();
    intervalId = setInterval(fetchPriceData, PRICE_REFRESH_MS);

    return () => { mountedRef.current = false; clearInterval(intervalId); };
  }, [tickersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tickers.length === 0) return null;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
        Stocks mentioned live
      </h3>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {tickers.slice(0, 6).map((ticker) => {
          const price = prices[ticker];
          return (
            <button
              key={ticker}
              onClick={() => onTickerClick(ticker)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg
                bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border
                hover:border-rh-green/40 transition-colors duration-150 cursor-pointer"
            >
              <span className="text-sm font-mono font-semibold text-rh-light-text dark:text-rh-text">
                {ticker}
              </span>
              {price ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs tabular-nums text-rh-light-muted dark:text-rh-muted">
                    ${price.price.toFixed(2)}
                  </span>
                  <DirectionArrow changePercent={price.changePercent} />
                  <span className={`text-[11px] tabular-nums font-medium ${
                    price.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {price.changePercent >= 0 ? '+' : ''}{price.changePercent.toFixed(2)}%
                  </span>
                </div>
              ) : loading ? (
                <div className="w-12 h-3 bg-rh-light-bg dark:bg-rh-dark rounded animate-pulse" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
