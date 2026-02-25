import { useState, useEffect, useCallback } from 'react';
import { getAccountHistory, AccountHistoryEntry } from '../api';

const PAGE_SIZE = 30;

const CATEGORY_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'trade', label: 'Trades' },
  { value: 'cash', label: 'Cash' },
  { value: 'adjustment', label: 'Adjustments' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount: number | null): string {
  if (amount == null) return '';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getEntryIcon(type: string): { icon: string; color: string } {
  const t = type.toLowerCase();
  if (t === 'buy' || t === 'bought') return { icon: '\u2197', color: 'text-rh-green' };
  if (t === 'sell' || t === 'sold') return { icon: '\u2199', color: 'text-rh-red' };
  if (t === 'deposit') return { icon: '\uD83D\uDCB0', color: 'text-rh-green' };
  if (t === 'withdrawal') return { icon: '\u21A9', color: 'text-rh-red' };
  if (t === 'cash_dividend') return { icon: '\uD83D\uDCC8', color: 'text-rh-green' };
  if (t === 'fee') return { icon: '\uD83D\uDCCB', color: 'text-yellow-500 dark:text-yellow-400' };
  if (t === 'interest') return { icon: '\uD83D\uDCB5', color: 'text-rh-green' };
  if (t === 'split') return { icon: '\u26A1', color: 'text-blue-500 dark:text-blue-400' };
  if (t === 'holding_added') return { icon: '\u2795', color: 'text-rh-green' };
  if (t === 'holding_removed') return { icon: '\u2796', color: 'text-rh-red' };
  if (t === 'holding_updated') return { icon: '\u270F\uFE0F', color: 'text-blue-500 dark:text-blue-400' };
  if (t === 'transfer') return { icon: '\uD83D\uDCE6', color: 'text-blue-500 dark:text-blue-400' };
  if (t === 'merger') return { icon: '\uD83D\uDD04', color: 'text-purple-500 dark:text-purple-400' };
  if (t === 'cancel') return { icon: '\u274C', color: 'text-rh-red' };
  if (t === 'div_reinvest') return { icon: '\uD83D\uDD01', color: 'text-rh-green' };
  return { icon: '\u2022', color: 'text-gray-500 dark:text-white/40' };
}

function groupByDate(entries: AccountHistoryEntry[]): Map<string, AccountHistoryEntry[]> {
  const groups = new Map<string, AccountHistoryEntry[]>();
  for (const entry of entries) {
    const key = formatDate(entry.date);
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return groups;
}

export default function AccountHistorySection() {
  const [entries, setEntries] = useState<AccountHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [ticker, setTicker] = useState('');
  const [debouncedTicker, setDebouncedTicker] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Debounce ticker search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTicker(ticker.trim().toUpperCase()), 300);
    return () => clearTimeout(timer);
  }, [ticker]);

  const loadHistory = useCallback(async (cursor?: string) => {
    try {
      const res = await getAccountHistory({
        limit: PAGE_SIZE,
        cursor,
        category,
        ticker: debouncedTicker || undefined,
      });
      if (cursor) {
        setEntries(prev => [...prev, ...res.entries]);
      } else {
        setEntries(res.entries);
      }
      setNextCursor(res.nextCursor);
      setError(false);
    } catch {
      if (!cursor) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, debouncedTicker]);

  // Reset and reload when filters change
  useEffect(() => {
    setLoading(true);
    setEntries([]);
    setNextCursor(null);
    loadHistory();
  }, [loadHistory]);

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    loadHistory(nextCursor);
  };

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    loadHistory();
  };

  const dateGroups = groupByDate(entries);

  return (
    <div className="px-3 sm:px-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Account History</h2>
      </div>

      {/* Filters + search */}
      <div className="space-y-2">
        {/* Category pills */}
        <div className="flex gap-1.5">
          {CATEGORY_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setCategory(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                category === f.value
                  ? 'bg-[#00c805] text-white'
                  : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/[0.1]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Ticker search — left-aligned below pills */}
        <div className="relative w-[160px]">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Search AAPL"
            className="pl-8 pr-3 py-1.5 w-full text-xs rounded-lg
              bg-gray-100 dark:bg-white/[0.06]
              text-gray-900 dark:text-white
              placeholder-gray-400 dark:placeholder-white/30
              border border-gray-200 dark:border-white/[0.08]
              focus:outline-none focus:ring-1 focus:ring-[#00c805]/40 focus:border-[#00c805]/40
              transition-colors"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 dark:text-white/40 mb-3">Couldn't load history</p>
          <button
            onClick={handleRetry}
            className="text-xs font-medium text-[#00c805] hover:text-[#00c805]/80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 dark:text-white/40">No account history yet</p>
        </div>
      )}

      {/* Date-grouped entries */}
      {!loading && !error && entries.length > 0 && (
        <div className="space-y-4">
          {Array.from(dateGroups.entries()).map(([dateLabel, groupEntries]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-2">
                {dateLabel}
              </p>

              {/* Entry rows */}
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.08]
                bg-white dark:bg-[#1a1a1e] overflow-hidden
                divide-y divide-gray-100 dark:divide-white/[0.06]">
                {groupEntries.map(entry => {
                  const { icon, color } = getEntryIcon(entry.type);
                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Icon */}
                      <span className={`text-base flex-shrink-0 ${color}`}>{icon}</span>

                      {/* Description */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-white truncate">
                          {entry.description}
                        </p>
                        {entry.amount != null && (
                          <p className={`text-xs mt-0.5 ${
                            entry.amount > 0 ? 'text-rh-green' : entry.amount < 0 ? 'text-rh-red' : 'text-gray-500 dark:text-white/40'
                          }`}>
                            {entry.amount > 0 ? '+' : ''}{formatAmount(entry.amount)}
                          </p>
                        )}
                      </div>

                      {/* Source broker badge */}
                      {entry.sourceBroker && (
                        <span className="flex-shrink-0 text-[10px] font-medium text-gray-400 dark:text-white/30 bg-gray-50 dark:bg-white/[0.04] px-2 py-0.5 rounded-full">
                          via {entry.sourceBroker}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {nextCursor && (
            <div className="text-center py-3">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-xs font-medium rounded-lg
                  bg-gray-100 dark:bg-white/[0.06]
                  text-gray-700 dark:text-white/70
                  hover:bg-gray-200 dark:hover:bg-white/[0.1]
                  disabled:opacity-50
                  transition-colors"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
