import { useState } from 'react';
import { Holding } from '../types';
import { deleteHolding } from '../api';

interface Props {
  holdings: Holding[];
  onUpdate: () => void;
}

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

export function HoldingsTable({ holdings, onUpdate }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);

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
              <th className="px-6 py-3 font-medium">Ticker</th>
              <th className="px-6 py-3 font-medium text-right">Shares</th>
              <th className="px-6 py-3 font-medium text-right">Avg Cost</th>
              <th className="px-6 py-3 font-medium text-right">Price</th>
              <th className="px-6 py-3 font-medium text-right">Market Value</th>
              <th className="px-6 py-3 font-medium text-right">Day P/L</th>
              <th className="px-6 py-3 font-medium text-right">Total P/L</th>
              <th className="px-6 py-3 font-medium text-right">Total %</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => {
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
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded" title="Using cached price">
                          stale
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
