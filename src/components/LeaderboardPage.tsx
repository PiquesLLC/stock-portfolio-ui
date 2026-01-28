import { useState, useEffect, useCallback, useMemo } from 'react';
import { LeaderboardEntry, LeaderboardWindow } from '../types';
import { getLeaderboard } from '../api';
import { UserPortfolioView } from './UserPortfolioView';

const WINDOWS: { id: LeaderboardWindow; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1Y', label: '1Y' },
];

type SortKey = 'rank' | 'user' | 'returnPct' | 'returnDollar' | 'assets';
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
    case 'returnPct': return entry.returnPct;
    case 'returnDollar': return entry.returnDollar;
    case 'assets': return entry.currentAssets;
    default: return null;
  }
}

export function LeaderboardPage() {
  const [window, setWindow] = useState<LeaderboardWindow>('1M');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const data = await getLeaderboard(window);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Handle column header click - toggle between desc and asc (matches HoldingsTable)
  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    }
  };

  // Memoized sorted entries
  const sortedEntries = useMemo(() => {
    if (sortKey === 'rank') {
      // Default rank order is the API order (returnPct desc). Asc = 1..N, desc = N..1.
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

        // Push nulls to bottom regardless of direction
        if (aNull && bNull) comparison = 0;
        else if (aNull) return 1;
        else if (bNull) return -1;
        else comparison = aVal - bVal;
      }

      // Tie-breakers: assets desc, user asc, id asc
      if (comparison === 0 && sortKey !== 'assets') {
        const aAssets = a.currentAssets ?? 0;
        const bAssets = b.currentAssets ?? 0;
        comparison = bAssets - aAssets; // desc
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

  // Sort indicator (matches HoldingsTable)
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  // Header class (matches HoldingsTable)
  const getHeaderClass = (key: SortKey, align: 'left' | 'right' = 'left') => {
    const base = 'px-4 py-3 font-medium cursor-pointer hover:text-rh-light-text dark:hover:text-white hover:bg-gray-100 dark:hover:bg-rh-dark/30 transition-colors select-none whitespace-nowrap';
    const alignClass = align === 'right' ? 'text-right' : '';
    const activeClass = sortKey === key ? 'text-rh-light-text dark:text-white' : '';
    return `${base} ${alignClass} ${activeClass}`;
  };

  // If a user is selected, show their portfolio
  if (selectedUserId) {
    const entry = entries.find((e) => e.userId === selectedUserId);
    return (
      <UserPortfolioView
        userId={selectedUserId}
        displayName={entry?.displayName ?? 'User'}
        returnPct={entry?.returnPct ?? null}
        window={window}
        onBack={() => setSelectedUserId(null)}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Leaderboard</h1>
        <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWindow(w.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                ${window === w.id
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-rh-red text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-rh-light-muted dark:text-rh-muted text-sm">Loading leaderboard...</div>
      ) : entries.length === 0 ? (
        <div className="text-rh-light-muted dark:text-rh-muted text-sm">
          No users found. Run the seed script to add demo users.
        </div>
      ) : (
        <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-rh-light-border dark:border-rh-border text-left">
                <th className={`${getHeaderClass('rank')} w-12 text-xs`} onClick={() => handleSort('rank')}>
                  #{getSortIndicator('rank')}
                </th>
                <th className={`${getHeaderClass('user')} text-xs`} onClick={() => handleSort('user')}>
                  User{getSortIndicator('user')}
                </th>
                <th className={`${getHeaderClass('returnPct', 'right')} text-xs`} onClick={() => handleSort('returnPct')}>
                  {getSortIndicator('returnPct')}Return %
                </th>
                <th className={`${getHeaderClass('returnDollar', 'right')} text-xs`} onClick={() => handleSort('returnDollar')}>
                  {getSortIndicator('returnDollar')}Return $
                </th>
                <th className={`${getHeaderClass('assets', 'right')} text-xs`} onClick={() => handleSort('assets')}>
                  {getSortIndicator('assets')}Assets
                </th>
                <th className="px-4 py-3 text-xs font-medium text-rh-light-muted dark:text-rh-muted text-right w-20">Basis</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, index) => {
                const isPositive = entry.returnPct !== null && entry.returnPct >= 0;
                const returnColor = entry.returnPct === null
                  ? 'text-rh-light-muted dark:text-rh-muted'
                  : isPositive
                    ? 'text-rh-green'
                    : 'text-rh-red';

                return (
                  <tr
                    key={entry.userId}
                    onClick={() => setSelectedUserId(entry.userId)}
                    className="border-b border-rh-light-border dark:border-rh-border last:border-b-0 hover:bg-rh-light-bg dark:hover:bg-rh-dark/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-rh-light-muted dark:text-rh-muted font-medium">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                        {entry.displayName}
                      </div>
                      <div className="text-xs text-rh-light-muted dark:text-rh-muted">
                        @{entry.username}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${returnColor}`}>
                      {formatPercent(entry.returnPct)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right ${returnColor}`}>
                      {entry.returnDollar !== null ? (
                        <>
                          {entry.returnDollar >= 0 ? '+' : ''}
                          {formatCurrency(entry.returnDollar)}
                        </>
                      ) : '--'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-rh-light-text dark:text-rh-text">
                      {formatCurrency(entry.currentAssets)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.isEstimated && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-500">
                          EST
                        </span>
                      )}
                      {entry.basis === 'none' && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-rh-light-muted/10 dark:bg-rh-muted/10 text-rh-light-muted dark:text-rh-muted">
                          N/A
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
