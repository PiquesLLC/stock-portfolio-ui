import { useState, useMemo } from 'react';
import type { MappedTrade, ImportTelemetry } from '../api';

interface TransactionReviewProps {
  trades: MappedTrade[];
  telemetry: ImportTelemetry;
  excludedRows: Set<number>;
  onToggleRow: (rowIndex: number) => void;
  onToggleAll: (selected: boolean) => void;
}

const TYPE_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  buy: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'BUY' },
  sell: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'SELL' },
  split: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'SPLIT' },
  transfer: { bg: 'bg-teal-500/15', text: 'text-teal-400', label: 'TRANSFER' },
  merger: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'MERGER' },
  cancel: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'CANCEL' },
};

function formatPrice(price: number): string {
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatShares(shares: number): string {
  if (Number.isInteger(shares)) return shares.toString();
  return shares.toFixed(shares < 1 ? 6 : 4);
}

export function TransactionReview({ trades, telemetry, excludedRows, onToggleRow, onToggleAll }: TransactionReviewProps) {
  const [showSkipReasons, setShowSkipReasons] = useState(false);

  const selectedCount = useMemo(() => trades.filter(t => !excludedRows.has(t.rowIndex)).length, [trades, excludedRows]);
  const allSelected = selectedCount === trades.length;
  const noneSelected = selectedCount === 0;

  const skipEntries = Object.entries(telemetry.skipReasons).filter(([, count]) => count > 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-rh-light-text dark:text-rh-text font-medium">
            {selectedCount} of {trades.length} transactions selected
          </span>
          {telemetry.rowsSkipped > 0 && (
            <button
              onClick={() => setShowSkipReasons(!showSkipReasons)}
              className="text-amber-500 hover:text-amber-400 transition-colors"
            >
              {telemetry.rowsSkipped} skipped
              <svg className={`w-3 h-3 inline ml-0.5 transition-transform ${showSkipReasons ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => onToggleAll(noneSelected || !allSelected)}
          className="text-xs text-rh-green hover:text-green-400 transition-colors"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Skip reasons dropdown */}
      {showSkipReasons && skipEntries.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2 space-y-1">
          {skipEntries.map(([reason, count]) => (
            <div key={reason} className="flex justify-between text-xs">
              <span className="text-amber-500/80">{reason.replace(/_/g, ' ')}</span>
              <span className="text-amber-500 font-medium">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Transactions table */}
      <div className="border border-gray-200/40 dark:border-white/[0.08] rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-white/[0.04]">
            <tr className="text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider text-[10px]">
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(!allSelected)}
                  className="rounded border-gray-300 dark:border-white/20 text-rh-green focus:ring-rh-green/30"
                />
              </th>
              <th className="px-2 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Ticker</th>
              <th className="px-2 py-2 text-right">Shares</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const isExcluded = excludedRows.has(trade.rowIndex);
              const badge = TYPE_BADGES[trade.type] || { bg: 'bg-gray-500/15', text: 'text-gray-400', label: trade.type.toUpperCase() };
              const total = trade.shares * trade.price;

              return (
                <tr
                  key={trade.rowIndex}
                  className={`border-t border-gray-200/10 dark:border-white/[0.04] transition-opacity ${isExcluded ? 'opacity-40' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => onToggleRow(trade.rowIndex)}
                      className="rounded border-gray-300 dark:border-white/20 text-rh-green focus:ring-rh-green/30"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-rh-light-muted dark:text-rh-muted whitespace-nowrap">{trade.date}</td>
                  <td className="px-2 py-1.5">
                    <span className={`${badge.bg} ${badge.text} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-rh-light-text dark:text-rh-text">{trade.ticker}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rh-light-text dark:text-rh-text">{formatShares(trade.shares)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rh-light-text dark:text-rh-text">{formatPrice(trade.price)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rh-light-muted dark:text-rh-muted">{formatPrice(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Telemetry footer */}
      <div className="flex items-center gap-4 text-[10px] text-rh-light-muted/40 dark:text-rh-muted/30">
        <span>Parsed in {telemetry.parseDurationMs}ms</span>
        <span>{telemetry.rowsParsed} rows processed</span>
        {telemetry.brokerDetected && <span>Source: {telemetry.brokerDetected}</span>}
      </div>
    </div>
  );
}
