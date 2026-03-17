import { useState, useEffect, useCallback, useRef } from 'react';
import { getYtdDividendBreakdown, dismissDividendEvent, restoreDividendEvent, YtdDividendBreakdown as BreakdownData, YtdDividendEntry } from '../api';

interface Props {
  refreshTrigger?: number;
  onTickerClick?: (ticker: string) => void;
  portfolioId?: string;
  onDismissChange?: () => void;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function YtdDividendBreakdown({ refreshTrigger, onTickerClick, portfolioId, onDismissChange }: Props) {
  const [data, setData] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const onDismissChangeRef = useRef(onDismissChange);
  onDismissChangeRef.current = onDismissChange;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getYtdDividendBreakdown(portfolioId);
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch YTD breakdown:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData, refreshTrigger]);

  const applyEntryUpdate = useCallback((eventId: string, dismissed: boolean) => {
    setData(prev => {
      if (!prev) return prev;
      const updated = prev.entries.map(e =>
        e.dividendEventId === eventId ? { ...e, dismissed } : e
      );
      const grossTotal = Math.round(updated.reduce((s, e) => s + e.income, 0) * 100) / 100;
      const totalDismissed = Math.round(updated.filter(e => e.dismissed).reduce((s, e) => s + e.income, 0) * 100) / 100;
      return { ...prev, entries: updated, netIncome: Math.round((grossTotal - totalDismissed) * 100) / 100, totalDismissed, totalIncome: grossTotal };
    });
  }, []);

  const handleDismiss = useCallback(async (entry: YtdDividendEntry) => {
    setPendingAction(entry.dividendEventId);
    try {
      await dismissDividendEvent(entry.dividendEventId);
      applyEntryUpdate(entry.dividendEventId, true);
      onDismissChangeRef.current?.();
    } catch (err) {
      console.error('Failed to dismiss dividend:', err);
    } finally {
      setPendingAction(null);
    }
  }, [applyEntryUpdate]);

  const handleRestore = useCallback(async (entry: YtdDividendEntry) => {
    setPendingAction(entry.dividendEventId);
    try {
      await restoreDividendEvent(entry.dividendEventId);
      applyEntryUpdate(entry.dividendEventId, false);
      onDismissChangeRef.current?.();
    } catch (err) {
      console.error('Failed to restore dividend:', err);
    } finally {
      setPendingAction(null);
    }
  }, [applyEntryUpdate]);

  if (loading && !data) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
        <div className="animate-pulse h-40 bg-gray-100/60 dark:bg-white/[0.06] rounded" />
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
          YTD Dividends Received
        </h3>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-4">
          No dividends received year-to-date.
        </p>
      </div>
    );
  }

  const activeEntries = data.entries.filter(e => !e.dismissed);
  const dismissedEntries = data.entries.filter(e => e.dismissed);

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5">
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">
          YTD Dividends Received
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-rh-green">{formatCurrency(data.netIncome)}</span>
          {data.totalDismissed > 0 && (
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              ({formatCurrency(data.totalDismissed)} dismissed)
            </span>
          )}
        </div>
      </div>

      <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mb-3">
        Dividends are estimated from pay dates and current share count. Remove any you didn't hold at the time.
      </p>

      <div className="max-h-72 overflow-y-auto scrollbar-minimal">
        {/* Active entries */}
        <div className="space-y-1.5">
          {activeEntries.map((entry) => (
            <DividendRow
              key={entry.dividendEventId}
              entry={entry}
              onAction={handleDismiss}
              actionType="dismiss"
              pending={pendingAction === entry.dividendEventId}
              onTickerClick={onTickerClick}
            />
          ))}
        </div>

        {/* Dismissed entries */}
        {dismissedEntries.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200/30 dark:border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
              Dismissed
            </p>
            <div className="space-y-1.5">
              {dismissedEntries.map((entry) => (
                <DividendRow
                  key={entry.dividendEventId}
                  entry={entry}
                  onAction={handleRestore}
                  actionType="restore"
                  pending={pendingAction === entry.dividendEventId}
                  onTickerClick={onTickerClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DividendRow({
  entry,
  onAction,
  actionType,
  pending,
  onTickerClick,
}: {
  entry: YtdDividendEntry;
  onAction: (entry: YtdDividendEntry) => void;
  actionType: 'dismiss' | 'restore';
  pending: boolean;
  onTickerClick?: (ticker: string) => void;
}) {
  const isDismissed = actionType === 'restore';

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg group transition-colors
      ${isDismissed ? 'opacity-50' : 'hover:bg-gray-100/50 dark:hover:bg-white/[0.03]'}`}
    >
      <button
        onClick={() => onTickerClick?.(entry.ticker)}
        className="w-12 text-xs font-mono font-semibold text-rh-green hover:underline text-left shrink-0"
      >
        {entry.ticker}
      </button>

      <span className="text-[11px] text-rh-light-muted dark:text-rh-muted w-16 shrink-0">
        {formatDate(entry.payDate)}
      </span>

      <span className="text-[11px] text-rh-light-muted dark:text-rh-muted w-16 text-right shrink-0">
        ${entry.amountPerShare.toFixed(4)}
      </span>

      <span className="text-[10px] text-rh-light-muted dark:text-rh-muted shrink-0">
        x{entry.shares.toFixed(entry.shares % 1 === 0 ? 0 : 2)}
      </span>

      <span className={`text-xs font-semibold ml-auto shrink-0 ${isDismissed ? 'text-rh-light-muted dark:text-rh-muted line-through' : 'text-rh-green'}`}>
        {formatCurrency(entry.income)}
      </span>

      <button
        onClick={() => onAction(entry)}
        disabled={pending}
        className={`w-6 h-6 flex items-center justify-center rounded shrink-0 transition-all
          ${pending ? 'opacity-30' : ''}
          ${isDismissed
            ? 'text-rh-green/60 hover:text-rh-green hover:bg-rh-green/10'
            : 'text-rh-light-muted/30 dark:text-rh-muted/30 hover:text-rh-red hover:bg-rh-red/10 md:opacity-0 md:group-hover:opacity-100'
          }`}
        title={isDismissed ? 'Restore this dividend' : "Didn't receive — remove"}
        aria-label={isDismissed ? `Restore ${entry.ticker} dividend` : `Remove ${entry.ticker} dividend`}
      >
        {isDismissed ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </div>
  );
}
