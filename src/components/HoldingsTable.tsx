import { useState, useMemo } from 'react';
import { Holding } from '../types';
import { deleteHolding } from '../api';

interface Props {
  holdings: Holding[];
  onUpdate: () => void;
}

type SortKey = 'ticker' | 'shares' | 'averageCost' | 'currentPrice' | 'currentValue' | 'dayChange' | 'profitLoss' | 'profitLossPercent';
type SortDir = 'asc' | 'desc';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatPL(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

// Check if a value is valid for sorting (not NaN, not unavailable)
function isValidValue(holding: Holding, key: SortKey): boolean {
  if (key === 'ticker') return true;
  if (key === 'shares' || key === 'averageCost') return !isNaN(holding[key]);
  // For price-dependent fields, check if price is available
  if (holding.priceUnavailable || holding.currentPrice <= 0) return false;
  return !isNaN(holding[key]);
}

// Get sortable value from holding
function getSortValue(holding: Holding, key: SortKey): string | number {
  if (key === 'ticker') return holding.ticker.toLowerCase();
  return holding[key];
}

export function HoldingsTable({ holdings, onUpdate }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleDelete = async (ticker: string) => {
    if (!confirm(`Delete ${ticker} from portfolio?`)) return;

    setDeleting(ticker);
    try {
      await deleteHolding(ticker);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  // Handle column header click - cycle: desc → asc → default (ticker asc)
  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      // New column: start with descending
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      // Same column, was desc: switch to asc
      setSortDir('asc');
    } else {
      // Same column, was asc: reset to default (ticker asc)
      setSortKey('ticker');
      setSortDir('asc');
    }
  };

  // Memoized sorted holdings
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const aValid = isValidValue(a, sortKey);
      const bValid = isValidValue(b, sortKey);

      // Push invalid values to bottom regardless of sort direction
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;

      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      return sortDir === 'desc' ? -comparison : comparison;
    });
  }, [holdings, sortKey, sortDir]);

  // Get sort indicator for a column
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-rh-green">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  // Get header class for a column
  const getHeaderClass = (key: SortKey, align: 'left' | 'right' = 'left') => {
    const base = 'px-6 py-3 font-medium cursor-pointer hover:text-white hover:bg-rh-dark/30 transition-colors select-none';
    const alignClass = align === 'right' ? 'text-right' : '';
    const activeClass = sortKey === key ? 'text-white' : '';
    return `${base} ${alignClass} ${activeClass}`;
  };

  if (holdings.length === 0) {
    return (
      <div className="bg-rh-card border border-rh-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Holdings</h2>
        <p className="text-rh-muted text-center py-8">No holdings yet. Add your first stock above.</p>
      </div>
    );
  }

  return (
    <div className="bg-rh-card border border-rh-border rounded-lg overflow-hidden">
      <div className="p-6 pb-4">
        <h2 className="text-lg font-semibold">Holdings</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-t border-b border-rh-border text-left text-sm text-rh-muted">
              <th className={getHeaderClass('ticker')} onClick={() => handleSort('ticker')}>
                Ticker{getSortIndicator('ticker')}
              </th>
              <th className={getHeaderClass('shares', 'right')} onClick={() => handleSort('shares')}>
                {getSortIndicator('shares')}Shares
              </th>
              <th className={getHeaderClass('averageCost', 'right')} onClick={() => handleSort('averageCost')}>
                {getSortIndicator('averageCost')}Avg Cost
              </th>
              <th className={getHeaderClass('currentPrice', 'right')} onClick={() => handleSort('currentPrice')}>
                {getSortIndicator('currentPrice')}Price
              </th>
              <th className={getHeaderClass('currentValue', 'right')} onClick={() => handleSort('currentValue')}>
                {getSortIndicator('currentValue')}Market Value
              </th>
              <th className={getHeaderClass('dayChange', 'right')} onClick={() => handleSort('dayChange')}>
                {getSortIndicator('dayChange')}Day P/L
              </th>
              <th className={getHeaderClass('profitLoss', 'right')} onClick={() => handleSort('profitLoss')}>
                {getSortIndicator('profitLoss')}Total P/L
              </th>
              <th className={getHeaderClass('profitLossPercent', 'right')} onClick={() => handleSort('profitLossPercent')}>
                {getSortIndicator('profitLossPercent')}Total %
              </th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding) => {
              const isUnavailable = holding.priceUnavailable;
              const isStale = holding.priceIsStale;
              const hasValidPrice = !isUnavailable && holding.currentPrice > 0;

              return (
                <tr
                  key={holding.id}
                  className={`border-b border-rh-border hover:bg-rh-dark/50 ${isUnavailable ? 'opacity-60' : ''}`}
                >
                  <td className="px-6 py-4 font-semibold">
                    <div className="flex items-center gap-2">
                      {holding.ticker}
                      {isStale && !isUnavailable && (
                        <span
                          className="relative flex h-2 w-2"
                          title="Repricing…"
                        >
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                        </span>
                      )}
                      {isUnavailable && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded" title="No price data available">
                          no data
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">{holding.shares.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(holding.averageCost)}</td>
                  <td className={`px-6 py-4 text-right ${isStale ? 'text-yellow-400' : ''}`}>
                    {hasValidPrice ? formatCurrency(holding.currentPrice) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {hasValidPrice ? formatCurrency(holding.currentValue) : '—'}
                  </td>
                  <td className={`px-6 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-muted' :
                    holding.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPL(holding.dayChange) : '—'}
                  </td>
                  <td className={`px-6 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-muted' :
                    holding.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPL(holding.profitLoss) : '—'}
                  </td>
                  <td className={`px-6 py-4 text-right ${
                    !hasValidPrice ? 'text-rh-muted' :
                    holding.profitLossPercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {hasValidPrice ? formatPercent(holding.profitLossPercent) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(holding.ticker)}
                      disabled={deleting === holding.ticker}
                      className="text-rh-red hover:text-red-400 disabled:text-gray-600 text-sm font-medium transition-colors"
                    >
                      {deleting === holding.ticker ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
