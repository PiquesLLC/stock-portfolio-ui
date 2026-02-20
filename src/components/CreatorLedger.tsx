import { useState, useEffect, useCallback } from 'react';
import { getCreatorLedger } from '../api';
import {
  CreatorLedgerEntry,
  CreatorLedgerEntryType,
  CreatorLedgerSummary,
} from '../types';

const PAGE_SIZE = 25;

const TYPE_FILTERS: { value: CreatorLedgerEntryType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'earning', label: 'Earnings' },
  { value: 'refund', label: 'Refunds' },
  { value: 'payout', label: 'Payouts' },
  { value: 'platform_fee', label: 'Fees' },
];

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function typeColor(type: CreatorLedgerEntryType): string {
  switch (type) {
    case 'earning': return 'text-rh-green';
    case 'refund': return 'text-red-500 dark:text-red-400';
    case 'payout': return 'text-blue-500 dark:text-blue-400';
    case 'platform_fee': return 'text-rh-light-muted dark:text-rh-muted';
  }
}

function typeLabel(type: CreatorLedgerEntryType): string {
  switch (type) {
    case 'earning': return 'Earning';
    case 'refund': return 'Refund';
    case 'payout': return 'Payout';
    case 'platform_fee': return 'Fee';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface CreatorLedgerProps {
  onBack: () => void;
}

export function CreatorLedger({ onBack }: CreatorLedgerProps) {
  const [entries, setEntries] = useState<CreatorLedgerEntry[]>([]);
  const [summary, setSummary] = useState<CreatorLedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CreatorLedgerEntryType | 'all'>('all');
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  const loadLedger = useCallback(async (cursor?: string) => {
    try {
      const res = await getCreatorLedger({
        limit: PAGE_SIZE,
        cursor,
        type: typeFilter === 'all' ? undefined : typeFilter,
      });
      if (cursor) {
        setEntries(prev => [...prev, ...res.items]);
      } else {
        setEntries(res.items);
      }
      setSummary(res.summary);
      setNextCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    setLoading(true);
    setEntries([]);
    setNextCursor(undefined);
    loadLedger();
  }, [loadLedger]);

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    loadLedger(nextCursor);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-40 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-white/10 rounded-xl" />
            ))}
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-white/10 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">{error}</p>
        <button onClick={onBack} className="mt-3 text-sm text-rh-green hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors">
          <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Transaction History</h1>
      </div>

      {/* Summary boxes */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
            bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
            <p className="text-lg font-bold text-rh-green">{formatCents(summary.availableCents)}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">Available</p>
          </div>
          <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
            bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
            <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(summary.reservedCents)}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">Reserved</p>
          </div>
          <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
            bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
            <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(summary.pendingPayoutCents)}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">Pending Payout</p>
          </div>
        </div>
      )}

      {/* Type filter */}
      <div className="flex gap-1.5">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              typeFilter === f.value
                ? 'border-rh-green bg-rh-green/10 text-rh-green'
                : 'border-gray-200 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:border-gray-300 dark:hover:border-white/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">No transactions yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl divide-y divide-gray-100 dark:divide-white/[0.06]">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${typeColor(entry.type)}`}>
                    {typeLabel(entry.type)}
                  </span>
                  <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                    {formatDate(entry.createdAt)}
                  </span>
                </div>
                {entry.description && (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">
                    {entry.description}
                  </p>
                )}
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${
                entry.amountCents >= 0 ? 'text-rh-green' : 'text-red-500 dark:text-red-400'
              }`}>
                {entry.amountCents >= 0 ? '+' : ''}{formatCents(entry.amountCents)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="text-center py-2">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-xs font-medium text-rh-green hover:text-rh-green/80 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
