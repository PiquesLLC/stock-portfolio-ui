import { useState, useEffect, useCallback } from 'react';
import { getWaitlistEntries, approveWaitlistEntry, rejectWaitlistEntry, WaitlistEntry, WaitlistResponse } from '../api';

const CARD = 'rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    approved: 'bg-green-500/15 text-green-600 dark:text-green-400',
    rejected: 'bg-red-500/15 text-red-600 dark:text-red-400',
    converted: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${styles[status] || 'bg-gray-500/15 text-gray-500'}`}>
      {status}
    </span>
  );
}

interface WaitlistAdminPageProps {
  onBack: () => void;
}

export function WaitlistAdminPage({ onBack }: WaitlistAdminPageProps) {
  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await getWaitlistEntries();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await approveWaitlistEntry(id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await rejectWaitlistEntry(id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const entries = data?.entries ?? [];
  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter);

  const counts = {
    total: entries.length,
    pending: entries.filter(e => e.status === 'pending').length,
    approved: entries.filter(e => e.status === 'approved').length,
    rejected: entries.filter(e => e.status === 'rejected').length,
    converted: entries.filter(e => e.status === 'converted').length,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors flex-shrink-0">
          <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Waitlist</h1>
      </div>

      {/* Stat boxes */}
      <div className={`${CARD} p-0 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200/40 dark:divide-white/[0.06]`}>
        {[
          { value: counts.total, label: 'Total' },
          { value: counts.pending, label: 'Pending', accent: true },
          { value: counts.approved, label: 'Approved' },
          { value: counts.converted, label: 'Converted' },
        ].map(stat => (
          <div key={stat.label} className="py-3.5 px-3 text-center">
            <p className={`text-xl font-bold ${stat.accent ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text'}`}>
              {loading ? '-' : stat.value}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-rh-green/15 text-rh-green'
                : 'text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {!loading && f !== 'all' && ` (${f === 'pending' ? counts.pending : f === 'approved' ? counts.approved : counts.rejected})`}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <div className={`${CARD} p-8 text-center text-rh-light-muted dark:text-rh-muted text-sm`}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-rh-light-muted dark:text-rh-muted text-sm`}>
          No {filter === 'all' ? '' : filter + ' '}entries
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-gray-200/40 dark:divide-white/[0.06]`}>
          {filtered.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              loading={actionLoading === entry.id}
              onApprove={() => handleApprove(entry.id)}
              onReject={() => handleReject(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, loading, onApprove, onReject }: {
  entry: WaitlistEntry;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">{entry.email}</p>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={entry.status} />
          <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
            {timeAgo(entry.createdAt)}
          </span>
          {entry.approvedAt && (
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              · approved {timeAgo(entry.approvedAt)}
            </span>
          )}
          {entry.rejectedAt && (
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
              · rejected {timeAgo(entry.rejectedAt)}
            </span>
          )}
        </div>
      </div>
      {entry.status === 'pending' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onApprove}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
