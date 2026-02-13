import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LeaderboardEntry, LeaderboardWindow, LeaderboardRegion, MarketSession } from '../types';
import { getLeaderboard } from '../api';
import { UserPortfolioView } from './UserPortfolioView';

const WINDOWS: { id: LeaderboardWindow; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1Y', label: '1Y' },
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
  if (value === null) return '--';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null) return '--';
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
}

export function LeaderboardPage({ session, currentUserId, onStockClick, selectedUserId: externalSelectedUserId, onSelectedUserChange }: LeaderboardPageProps) {
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

  // Polling with session-aware interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const isMarketActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isMarketActive ? 12000 : 60000;

    intervalRef.current = setInterval(fetchData, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
        const aNull = aVal === null || isNaN(aVal);
        const bNull = bVal === null || isNaN(bVal);

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
    const entry = entries.find((e) => e.userId === selectedUserId);
    return (
      <UserPortfolioView
        userId={selectedUserId}
        displayName={entry?.displayName ?? 'User'}
        returnPct={entry?.returnPct ?? null}
        window={window}
        trackingStartAt={entry?.trackingStartAt}
        session={session}
        currentUserId={currentUserId}
        onBack={() => setSelectedUserId(null)}
        onStockClick={onStockClick}
      />
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Leaderboard</h1>
        <div className="flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWindow(w.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                ${window === w.id
                  ? 'bg-gray-100/60 dark:bg-white/[0.06] text-rh-green shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRegion(r.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              ${region === r.id
                ? 'bg-gray-100/60 dark:bg-white/[0.06] text-rh-green shadow-sm'
                : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {lastUpdated && (
        <div className="text-xs text-rh-light-muted dark:text-rh-muted mb-1">
          Updated {formatRelativeTime(lastUpdated)}
        </div>
      )}

      <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 mb-4">
        Rankings based on time-weighted returns (TWR) since tracking began. TWR eliminates the effect of deposits/withdrawals for fair comparison.
      </p>

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
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200/50 dark:border-white/[0.06] text-left">
                <th className={`${getHeaderClass('rank')} w-8 sm:w-12 text-xs`} onClick={() => handleSort('rank')}>
                  #{getSortIndicator('rank')}
                </th>
                <th className={`${getHeaderClass('user')} text-xs`} onClick={() => handleSort('user')}>
                  User{getSortIndicator('user')}
                </th>
                <th className={`${getHeaderClass('twrPct', 'right')} text-xs`} onClick={() => handleSort('twrPct')}>
                  {getSortIndicator('twrPct')}Return %
                </th>
                <th className={`${getHeaderClass('returnDollar', 'right')} text-xs hidden sm:table-cell`} onClick={() => handleSort('returnDollar')}>
                  {getSortIndicator('returnDollar')}Return $
                </th>
                <th className={`${getHeaderClass('assets', 'right')} text-xs hidden sm:table-cell`} onClick={() => handleSort('assets')}>
                  {getSortIndicator('assets')}Assets
                </th>
                <th className="px-2 sm:px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right w-16 sm:w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, index) => {
                const twrColor = entry.twrPct === null
                  ? 'text-rh-light-muted dark:text-rh-muted'
                  : entry.twrPct >= 0 ? 'text-rh-green' : 'text-rh-red';
                return (
                  <tr
                    key={entry.userId}
                    onClick={() => setSelectedUserId(entry.userId)}
                    className={`border-b border-gray-200/50 dark:border-white/[0.06] last:border-b-0 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] cursor-pointer transition-colors ${
                      entry.flagged ? 'opacity-50' : ''
                    }`}
                    title={entry.flagged ? entry.flagReason ?? 'Flagged' : undefined}
                  >
                    <td className="px-2 sm:px-4 py-3 text-sm text-rh-light-muted dark:text-rh-muted font-medium">
                      {index + 1}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate max-w-[120px] sm:max-w-none">
                          {entry.displayName}
                        </span>
                        {entry.isNew && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shrink-0">
                            NEW
                          </span>
                        )}
                        {entry.flagged && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0" title={entry.flagReason ?? ''}>
                            FLAG
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-rh-light-muted dark:text-rh-muted truncate max-w-[120px] sm:max-w-none">
                        @{entry.username}
                        {entry.sinceStart && (
                          <span className="ml-2 opacity-60 hidden sm:inline">Since start</span>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 sm:px-4 py-3 text-xs sm:text-sm text-right font-bold ${twrColor}`}>
                      {formatPercent(entry.twrPct)}
                    </td>
                    <td className={`px-2 sm:px-4 py-3 text-sm text-right hidden sm:table-cell ${twrColor}`}>
                      {entry.returnDollar !== null ? (
                        <>
                          {entry.returnDollar >= 0 ? '+' : ''}
                          {formatCurrency(entry.returnDollar)}
                        </>
                      ) : '--'}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text hidden sm:table-cell">
                      {formatCurrency(entry.currentAssets)}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right">
                      {entry.verified && !entry.flagged && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/10 text-green-500">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-2.108-2.108 3 3 0 01-5.304 0 3 3 0 00-2.108 2.108 3 3 0 010 5.304 3 3 0 002.108 2.108 3 3 0 015.304 0 3 3 0 002.108-2.108zM9.293 10.707a1 1 0 011.414-1.414l1 1a1 1 0 01-1.414 1.414l-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="hidden sm:inline">Verified</span>
                        </span>
                      )}
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
