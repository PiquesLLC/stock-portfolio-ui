import { useState, useEffect, useCallback } from 'react';
import { getPrices, PriceData } from '../api';

const FUTURES = [
  { ticker: 'ES=F', label: 'S&P 500', short: 'ES' },
  { ticker: 'NQ=F', label: 'Nasdaq 100', short: 'NQ' },
  { ticker: 'YM=F', label: 'Dow Jones', short: 'YM' },
  { ticker: 'RTY=F', label: 'Russell 2000', short: 'RTY' },
  { ticker: 'CL=F', label: 'Crude Oil', short: 'CL' },
  { ticker: 'GC=F', label: 'Gold', short: 'GC' },
  { ticker: 'SI=F', label: 'Silver', short: 'SI' },
  { ticker: 'ZB=F', label: '30Y Bond', short: 'ZB' },
] as const;

function fmt(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function fmtPrice(val: number): string {
  return val >= 1000 ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : val.toFixed(2);
}

interface Props {
  session?: string;
  refreshTrigger?: number;
}

export function FuturesBanner({ session, refreshTrigger }: Props) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchFutures = useCallback(async () => {
    try {
      const tickers = FUTURES.map(f => f.ticker);
      const data = await getPrices(tickers);
      setPrices(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFutures();
    // Poll every 30s
    const interval = setInterval(fetchFutures, 30000);
    return () => clearInterval(interval);
  }, [fetchFutures, refreshTrigger]);

  const hasPrices = Object.keys(prices).length > 0;
  const isClosed = session === 'CLOSED';

  // Show top 4 in compact mode, all 8 when expanded
  const visibleFutures = expanded ? FUTURES : FUTURES.slice(0, 4);

  if (loading && !hasPrices) {
    return (
      <div className="px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-rh-light-muted/40 dark:text-rh-muted/40 font-medium">Futures</span>
          <div className="animate-spin rounded-full h-3 w-3 border border-rh-muted/30 border-t-rh-muted/60" />
        </div>
      </div>
    );
  }

  if (!hasPrices) return null;

  return (
    <div className="px-6 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-rh-light-muted/40 dark:text-rh-muted/40 font-medium">
            Futures
          </span>
          {isClosed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {/* Futures grid */}
      <div className="grid grid-cols-4 gap-x-4 gap-y-2">
        {visibleFutures.map(({ ticker, label, short }) => {
          const d = prices[ticker];
          if (!d) return null;
          const isUp = d.change >= 0;
          return (
            <div key={ticker} className="flex items-baseline justify-between gap-1 min-w-0">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text truncate block" title={label}>
                  {short}
                </span>
                <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPrice(d.price)}
                </span>
              </div>
              <span
                className={`text-[10px] font-semibold whitespace-nowrap ${isUp ? 'text-rh-green' : 'text-rh-red'}`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmt(d.changePercent)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
