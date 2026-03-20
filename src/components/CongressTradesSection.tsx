import { useState, useEffect, useCallback, useMemo } from 'react';
import { CongressTrade, getCongressTrades, getCongressTradesForPortfolio, getCongressTradesForTicker } from '../api';

function formatAmount(low: number, high: number): string {
  const fmt = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  if (low === high) return fmt(low);
  return `${fmt(low)} – ${fmt(high)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Filter = 'all' | 'buy' | 'sell' | 'senate' | 'house';

interface Props {
  ticker?: string;
  portfolio?: boolean;
  onTickerClick?: (ticker: string) => void;
  limit?: number;
}

export function CongressTradesSection({ ticker, portfolio, onTickerClick, limit = 50 }: Props) {
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (ticker) {
        const data = await getCongressTradesForTicker(ticker);
        setTrades((data.trades || []).slice(0, limit));
      } else if (portfolio) {
        const data = await getCongressTradesForPortfolio();
        setTrades((data.trades || []).slice(0, limit));
      } else {
        const data = await getCongressTrades({ limit });
        setTrades(data.trades || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ticker, portfolio, limit]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    if (filter === 'buy') return trades.filter(t => t.transactionType === 'Purchase');
    if (filter === 'sell') return trades.filter(t => t.transactionType !== 'Purchase');
    if (filter === 'senate') return trades.filter(t => t.chamber === 'Senate');
    if (filter === 'house') return trades.filter(t => t.chamber === 'House');
    return trades;
  }, [trades, filter]);

  const stats = useMemo(() => {
    const buys = trades.filter(t => t.transactionType === 'Purchase').length;
    const sells = trades.length - buys;
    const senators = new Set(trades.filter(t => t.chamber === 'Senate').map(t => t.politician)).size;
    const reps = new Set(trades.filter(t => t.chamber === 'House').map(t => t.politician)).size;
    return { buys, sells, senators, reps, total: trades.length };
  }, [trades]);

  if (loading) {
    return (
      <div className="p-3 sm:p-5 space-y-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Congressional Trading</h3>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-200/30 dark:bg-white/[0.04]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200/30 dark:bg-white/[0.04] rounded w-2/5" />
                <div className="h-2.5 bg-gray-200/20 dark:bg-white/[0.02] rounded w-1/4" />
              </div>
              <div className="h-3 bg-gray-200/20 dark:bg-white/[0.03] rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || trades.length === 0) {
    return (
      <div className="p-3 sm:p-5 space-y-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Congressional Trading</h3>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted py-8 text-center">
          {error ? 'Failed to load trades' : 'No congressional trades found for your holdings'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 space-y-3">
      {/* Title + total */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Congressional Trading</h3>
          <span className="text-xs text-rh-light-muted/50 dark:text-rh-muted/40">{stats.total} trades</span>
        </div>

        {/* Hero stat — buys vs sells */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-rh-green tabular-nums">{stats.buys}</span>
          <span className="text-sm text-rh-light-muted dark:text-rh-muted">buys</span>
          <span className="text-rh-light-muted/30 dark:text-rh-muted/20 mx-1">/</span>
          <span className="text-2xl font-bold text-rh-red tabular-nums">{stats.sells}</span>
          <span className="text-sm text-rh-light-muted dark:text-rh-muted">sells</span>
          <span className="text-rh-light-muted/30 dark:text-rh-muted/20 mx-1">·</span>
          <span className="text-xs text-blue-400">{stats.senators} senators</span>
          <span className="text-xs text-purple-400">{stats.reps} reps</span>
        </div>
      </div>

      {/* Filter tabs — underline style */}
      <div className="flex items-center gap-0 -ml-1 border-b border-gray-200/10 dark:border-white/[0.04]">
        {([
          ['all', 'All'],
          ['buy', 'Buys'],
          ['sell', 'Sells'],
          ['senate', 'Senate'],
          ['house', 'House'],
        ] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
              filter === f
                ? 'text-rh-green'
                : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
            }`}
          >
            {label}
            {filter === f && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
            )}
          </button>
        ))}
      </div>

      {/* Trade rows — flat list, no card wrapper */}
      <div>
        {filtered.map((trade) => {
          const isBuy = trade.transactionType === 'Purchase';
          return (
            <div
              key={trade.id}
              className="flex items-center gap-3 py-3 border-b border-gray-100/10 dark:border-white/[0.03] last:border-0"
            >
              {/* Buy/Sell indicator */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isBuy ? 'bg-rh-green/10' : 'bg-rh-red/10'
              }`}>
                <svg className={`w-4 h-4 ${isBuy ? 'text-rh-green' : 'text-rh-red'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isBuy
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  }
                </svg>
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">
                    {trade.politician}
                  </span>
                  <span className={`text-[8px] font-bold px-1.5 py-px rounded-full shrink-0 ${
                    trade.chamber === 'Senate'
                      ? 'bg-blue-500/10 text-blue-400'
                      : trade.chamber === 'House'
                        ? 'bg-purple-500/10 text-purple-400'
                        : 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {trade.chamber === 'Senate' ? 'SEN' : trade.chamber === 'House' ? 'REP' : '?'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {!ticker ? (
                    <button
                      onClick={() => onTickerClick?.(trade.ticker)}
                      className="text-[12px] font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
                    >
                      {trade.ticker}
                    </button>
                  ) : (
                    <span className="text-[12px] font-bold text-rh-light-text dark:text-rh-text">{trade.ticker}</span>
                  )}
                  <span className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/40">
                    {formatAmount(trade.amountFrom, trade.amountTo)}
                  </span>
                </div>
              </div>

              {/* Date */}
              <span className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/40 shrink-0">
                {formatDate(trade.tradeDate)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[9px] text-rh-light-muted/30 dark:text-rh-muted/20">
          Source: STOCK Act filings via FMP
        </span>
        {filtered.length < trades.length && (
          <span className="text-[9px] text-rh-light-muted/30 dark:text-rh-muted/20">
            Showing {filtered.length} of {trades.length}
          </span>
        )}
      </div>
    </div>
  );
}
