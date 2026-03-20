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

  const filterBtn = (f: Filter, label: string, count?: number) => (
    <button
      onClick={() => setFilter(f)}
      className={`relative px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 ${
        filter === f
          ? 'text-rh-green'
          : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
      }`}
    >
      {label}{count != null ? ` (${count})` : ''}
      {filter === f && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
      )}
    </button>
  );

  const glassCard = "bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl";

  if (loading) {
    return (
      <div className={`${glassCard} p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Congressional Trading</h3>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200/50 dark:bg-white/[0.06]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200/50 dark:bg-white/[0.06] rounded w-1/3" />
                <div className="h-2.5 bg-gray-200/30 dark:bg-white/[0.03] rounded w-1/5" />
              </div>
              <div className="h-3 bg-gray-200/50 dark:bg-white/[0.06] rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || trades.length === 0) {
    return (
      <div className={`${glassCard} p-6`}>
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">Congressional Trading</h3>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted text-center py-8">
          {error ? 'Failed to load trades' : 'No congressional trades found for your holdings'}
        </p>
      </div>
    );
  }

  return (
    <div className={`${glassCard} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Congressional Trading</h3>
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30">{stats.total} trades</span>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rh-green/10 text-rh-green font-medium">{stats.buys} buys</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rh-red/10 text-rh-red font-medium">{stats.sells} sells</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">{stats.senators} senators</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">{stats.reps} reps</span>
        </div>

        {/* Filter tabs — underline style */}
        <div className="flex items-center gap-0 -ml-1 border-b border-gray-200/20 dark:border-white/[0.04]">
          {filterBtn('all', 'All')}
          {filterBtn('buy', 'Buys')}
          {filterBtn('sell', 'Sells')}
          {filterBtn('senate', 'Senate')}
          {filterBtn('house', 'House')}
        </div>
      </div>

      {/* Trade cards */}
      <div className="px-5 py-2 max-h-[520px] overflow-y-auto scrollbar-minimal">
        {filtered.map((trade) => {
          const isBuy = trade.transactionType === 'Purchase';
          return (
            <div
              key={trade.id}
              className="flex items-center gap-3 py-3 border-b border-gray-100/20 dark:border-white/[0.03] last:border-0 hover:bg-gray-50/40 dark:hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors"
            >
              {/* Buy/Sell indicator */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isBuy ? 'bg-rh-green/10' : 'bg-rh-red/10'
              }`}>
                <svg className={`w-3.5 h-3.5 ${isBuy ? 'text-rh-green' : 'text-rh-red'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isBuy
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  }
                </svg>
              </div>

              {/* Politician + chamber + ticker */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-rh-light-text dark:text-rh-text truncate">
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
                      className="text-[11px] font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
                    >
                      {trade.ticker}
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-rh-light-text dark:text-rh-text">{trade.ticker}</span>
                  )}
                  <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">
                    {formatAmount(trade.amountFrom, trade.amountTo)}
                  </span>
                </div>
              </div>

              {/* Date */}
              <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 shrink-0">
                {formatDate(trade.tradeDate)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-gray-200/20 dark:border-white/[0.04] flex items-center justify-between">
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
