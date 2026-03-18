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

  // Summary stats
  const stats = useMemo(() => {
    const buys = trades.filter(t => t.transactionType === 'Purchase').length;
    const sells = trades.length - buys;
    const senators = new Set(trades.filter(t => t.chamber === 'Senate').map(t => t.politician)).size;
    const reps = new Set(trades.filter(t => t.chamber === 'House').map(t => t.politician)).size;
    return { buys, sells, senators, reps, total: trades.length };
  }, [trades]);

  const filterBtn = (f: Filter, label: string) => (
    <button
      onClick={() => setFilter(f)}
      className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${
        filter === f
          ? 'bg-rh-green/15 text-rh-green font-semibold'
          : 'text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text'
      }`}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="px-3 sm:px-6 py-6">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-3">
          Congressional Trading
        </h3>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-rh-green border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error || trades.length === 0) {
    return (
      <div className="px-3 sm:px-6 py-6">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-3">
          Congressional Trading
        </h3>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted text-center py-8">
          {error ? 'Failed to load trades' : 'No congressional trades found for your holdings'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 py-4">
      {/* Header + filters */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50">
            Congressional Trading
          </h3>
          <span className="text-[10px] text-rh-light-muted/30 dark:text-rh-muted/30">
            {stats.total} trades
          </span>
        </div>
        <div className="flex gap-0.5">
          {filterBtn('all', 'All')}
          {filterBtn('buy', 'Buys')}
          {filterBtn('sell', 'Sells')}
          {filterBtn('senate', 'Senate')}
          {filterBtn('house', 'House')}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-3 text-[10px]">
        <span className="text-rh-green">{stats.buys} buys</span>
        <span className="text-rh-red">{stats.sells} sells</span>
        <span className="text-rh-light-muted/40 dark:text-rh-muted/40">·</span>
        <span className="text-blue-400">{stats.senators} senators</span>
        <span className="text-purple-400">{stats.reps} representatives</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_60px_auto_90px_70px] sm:grid-cols-[1fr_70px_auto_100px_80px] gap-x-2 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-rh-light-muted/40 dark:text-rh-muted/30 border-b border-gray-200/30 dark:border-white/[0.04]">
        <span>Politician</span>
        <span>Action</span>
        <span>Ticker</span>
        <span>Amount</span>
        <span className="text-right">Trade Date</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100/30 dark:divide-white/[0.03]">
        {filtered.map((trade) => {
          const isBuy = trade.transactionType === 'Purchase';
          return (
            <div
              key={trade.id}
              className="grid grid-cols-[1fr_60px_auto_90px_70px] sm:grid-cols-[1fr_70px_auto_100px_80px] gap-x-2 px-2 py-2 items-center hover:bg-gray-50/50 dark:hover:bg-white/[0.015] transition-colors"
            >
              {/* Politician + chamber */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-medium text-rh-light-text dark:text-rh-text truncate">
                  {trade.politician}
                </span>
                <span className={`text-[8px] font-semibold px-1 py-px rounded shrink-0 ${
                  trade.chamber === 'Senate'
                    ? 'bg-blue-500/10 text-blue-400'
                    : trade.chamber === 'House'
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-gray-500/10 text-gray-400'
                }`}>
                  {trade.chamber === 'Senate' ? 'SEN' : trade.chamber === 'House' ? 'REP' : '?'}
                </span>
              </div>

              {/* Action */}
              <span className={`text-[10px] font-semibold ${isBuy ? 'text-rh-green' : 'text-rh-red'}`}>
                {isBuy ? 'Buy' : 'Sell'}
              </span>

              {/* Ticker */}
              {!ticker ? (
                <button
                  onClick={() => onTickerClick?.(trade.ticker)}
                  className="text-[11px] font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors text-left"
                >
                  {trade.ticker}
                </button>
              ) : (
                <span className="text-[11px] font-bold text-rh-light-text dark:text-rh-text">{trade.ticker}</span>
              )}

              {/* Amount */}
              <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/50">
                {formatAmount(trade.amountFrom, trade.amountTo)}
              </span>

              {/* Date */}
              <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 text-right">
                {formatDate(trade.tradeDate)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200/20 dark:border-white/[0.03]">
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
