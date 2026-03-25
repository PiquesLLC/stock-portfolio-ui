import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LeaderboardEntry, LeaderboardWindow, LeaderboardRegion, MarketSession } from '../types';
import { getLeaderboard } from '../api';
import { UserProfileView } from './UserProfileView';


const WINDOWS: { id: LeaderboardWindow; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: 'YTD', label: 'YTD' },
];

const REGIONS: { id: LeaderboardRegion; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'na', label: 'North America' },
  { id: 'europe', label: 'Europe' },
  { id: 'apac', label: 'Asia-Pacific' },
];

type SortKey = 'rank' | 'user' | 'twrPct' | 'returnDollar' | 'assets';
type SortDir = 'asc' | 'desc';

function formatCurrency(value: number | null): string {
  if (value == null) return '--';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value == null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function getNumericValue(entry: LeaderboardEntry, key: SortKey): number | null {
  switch (key) {
    case 'twrPct': return entry.twrPct;
    case 'returnDollar': return entry.returnDollar;
    case 'assets': return entry.currentAssets;
    default: return null;
  }
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface LeaderboardPageProps {
  session?: MarketSession;
  currentUserId?: string;
  onStockClick?: (ticker: string) => void;
  selectedUserId?: string | null;
  onSelectedUserChange?: (userId: string | null) => void;
  onCompare?: (userId: string, displayName: string) => void;
}

export function LeaderboardPage({ session, currentUserId, onStockClick, selectedUserId: externalSelectedUserId, onSelectedUserChange, onCompare }: LeaderboardPageProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [region, setRegion] = useState<LeaderboardRegion>('world');
  const [window, setWindow] = useState<LeaderboardWindow>('1M');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalSelectedUserId, setInternalSelectedUserId] = useState<string | null>(null);
  const selectedUserId = externalSelectedUserId ?? internalSelectedUserId;
  const setSelectedUserId = onSelectedUserChange ?? setInternalSelectedUserId;
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    // Skip polling if tab not focused
    if (!document.hasFocus()) return;

    try {
      setError(null);
      const data = await getLeaderboard(window, region);
      setEntries(data.entries);
      setLastUpdated(data.lastUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [window, region]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Polling with session-aware interval + refetch on tab refocus
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const isMarketActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isMarketActive ? 12000 : 60000;

    intervalRef.current = setInterval(fetchData, pollMs);

    const onVisible = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchData, session]);

  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    }
  };

  const sortedEntries = useMemo(() => {
    if (sortKey === 'rank') {
      return sortDir === 'asc' ? entries : [...entries].reverse();
    }

    return [...entries].sort((a, b) => {
      let comparison = 0;

      if (sortKey === 'user') {
        comparison = a.displayName.localeCompare(b.displayName);
      } else {
        const aVal = getNumericValue(a, sortKey);
        const bVal = getNumericValue(b, sortKey);
        const aNull = aVal == null || isNaN(aVal);
        const bNull = bVal == null || isNaN(bVal);

        if (aNull && bNull) comparison = 0;
        else if (aNull) return 1;
        else if (bNull) return -1;
        else comparison = aVal - bVal;
      }

      if (comparison === 0 && sortKey !== 'assets') {
        const aAssets = a.currentAssets ?? 0;
        const bAssets = b.currentAssets ?? 0;
        comparison = bAssets - aAssets;
      }
      if (comparison === 0 && sortKey !== 'user') {
        comparison = a.displayName.localeCompare(b.displayName);
      }
      if (comparison === 0) {
        comparison = a.userId.localeCompare(b.userId);
      }

      return sortDir === 'desc' ? -comparison : comparison;
    });
  }, [entries, sortKey, sortDir]);

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  const getHeaderClass = (key: SortKey, align: 'left' | 'right' = 'left') => {
    const base = 'px-2 sm:px-4 py-3 font-medium cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-colors select-none whitespace-nowrap';
    const alignClass = align === 'right' ? 'text-right' : '';
    const activeClass = sortKey === key ? 'text-rh-light-text dark:text-white' : '';
    return `${base} ${alignClass} ${activeClass}`;
  };

  if (selectedUserId) {
    return (
      <UserProfileView
        userId={selectedUserId}
        currentUserId={currentUserId ?? ''}
        session={session}
        onBack={() => setSelectedUserId(null)}
        onStockClick={onStockClick}
        onUserClick={(uid) => setSelectedUserId(uid)}
      />
    );
  }

  return (
    <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-3 sm:px-6 pt-2 pb-6">
      {/* Header — title + info + toggle */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Leaderboard</h1>
          <div className="relative">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.5} d="M12 16v-4m0-4h.01" />
              </svg>
            </button>
            {showInfo && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
                <div className="absolute left-0 top-7 z-50 w-64 bg-white dark:bg-[#1a1a1e]/95 border border-gray-200/60 dark:border-white/[0.1] rounded-lg shadow-lg p-3">
                  {lastUpdated && (
                    <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mb-1.5">Updated {formatRelativeTime(lastUpdated)}</p>
                  )}
                  <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 leading-relaxed">
                    Rankings based on time-weighted returns (TWR) since tracking began. TWR eliminates the effect of deposits/withdrawals for fair comparison.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

          {/* Region selector */}
          <div className="flex items-center gap-0 -ml-1 mb-2">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                className={`relative px-2.5 py-2 text-[12px] font-medium transition-all duration-150 ${
                  region === r.id
                    ? 'text-rh-light-text dark:text-white'
                    : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
                }`}
              >
                {r.label}
                {region === r.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-white/30" />
                )}
              </button>
            ))}
          </div>

          {/* Period selector — underline style, matches portfolio chart */}
          <div className="flex items-center gap-0 -ml-1 mb-3">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWindow(w.id)}
                className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                  window === w.id
                    ? 'text-rh-green'
                    : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
                }`}
              >
                {w.label}
                {window === w.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
                )}
              </button>
            ))}
          </div>


          {error && (
            <div className="text-rh-red text-sm mb-4">{error}</div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4 animate-pulse flex items-center gap-4">
                  <div className="w-6 h-4 bg-gray-200 dark:bg-rh-border rounded" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-1/4 mb-2" />
                    <div className="h-3 bg-gray-200 dark:bg-rh-border rounded w-1/6" />
                  </div>
                  <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-16" />
                  <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-16" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-rh-light-muted dark:text-rh-muted text-sm">
              No verified users found. Run the seed script to add demo users.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full sm:min-w-[480px]">
                <thead>
                  <tr className="border-b border-gray-200/10 dark:border-white/[0.04] text-left">
                    <th className={`${getHeaderClass('rank')} w-8 sm:w-12 text-[11px]`} onClick={() => handleSort('rank')}>
                      #{getSortIndicator('rank')}
                    </th>
                    <th className={`${getHeaderClass('user')} text-[11px]`} onClick={() => handleSort('user')}>
                      User{getSortIndicator('user')}
                    </th>
                    <th className={`${getHeaderClass('twrPct', 'right')} text-[11px]`} onClick={() => handleSort('twrPct')}>
                      {getSortIndicator('twrPct')}Return %
                    </th>
                    <th className={`${getHeaderClass('returnDollar', 'right')} text-[11px] hidden sm:table-cell`} onClick={() => handleSort('returnDollar')}>
                      {getSortIndicator('returnDollar')}Return $
                    </th>
                    <th className={`${getHeaderClass('assets', 'right')} text-[11px] hidden sm:table-cell`} onClick={() => handleSort('assets')}>
                      {getSortIndicator('assets')}Assets
                    </th>
                    <th className="px-2 sm:px-4 py-3 w-10 sm:w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry, index) => {
                    const twrColor = entry.twrPct == null
                      ? 'text-rh-light-muted dark:text-rh-muted'
                      : entry.twrPct >= 0 ? 'text-rh-green' : 'text-rh-red';
                    return (
                      <tr
                        key={entry.userId}
                        onClick={() => setSelectedUserId(entry.userId)}
                        className="border-b border-gray-200/10 dark:border-white/[0.04] last:border-b-0 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        <td className="px-2 sm:px-4 py-3.5 text-sm text-rh-light-muted/40 dark:text-rh-muted/40 font-medium tabular-nums">
                          {index + 1}
                        </td>
                        <td className="px-2 sm:px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate max-w-[120px] sm:max-w-none">
                              {entry.displayName}
                            </span>
                            {entry.isNew && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shrink-0">
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/50 truncate max-w-[120px] sm:max-w-none">
                            @{entry.username}
                            {entry.sinceStart && (
                              <span className="ml-2 opacity-60 hidden sm:inline">Since start</span>
                            )}
                          </div>
                        </td>
                        <td className={`px-2 sm:px-4 py-3.5 text-xs sm:text-sm text-right font-bold tabular-nums ${twrColor}`}>
                          {formatPercent(entry.twrPct)}
                        </td>
                        <td className={`px-2 sm:px-4 py-3.5 text-sm text-right hidden sm:table-cell tabular-nums ${twrColor}`}>
                          {entry.returnDollar != null ? (
                            <>
                              {entry.returnDollar >= 0 ? '+' : ''}
                              {formatCurrency(entry.returnDollar)}
                            </>
                          ) : '--'}
                        </td>
                        <td className="px-2 sm:px-4 py-3.5 text-sm text-right text-rh-light-text dark:text-rh-text hidden sm:table-cell tabular-nums">
                          {formatCurrency(entry.currentAssets)}
                        </td>
                        <td className="px-2 sm:px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {entry.verified && (
                              <svg className="w-4 h-4 text-rh-green" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            )}
                            {onCompare && currentUserId && currentUserId !== entry.userId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCompare(entry.userId, entry.displayName);
                                }}
                                className="p-1 rounded hover:bg-white/[0.04] text-rh-light-muted/30 dark:text-rh-muted/30 hover:text-rh-green transition-colors"
                                title="Compare portfolios"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}
// force-hmr 1773904713
