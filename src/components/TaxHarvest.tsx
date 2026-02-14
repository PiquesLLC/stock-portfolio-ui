import { useState, useEffect } from 'react';
import { TaxHarvestResponse } from '../types';
import { getTaxHarvestSuggestions } from '../api';

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(v: number): string {
  return `${v >= 0 ? '' : ''}${v.toFixed(1)}%`;
}

interface Props {
  onTickerClick?: (ticker: string) => void;
}

export function TaxHarvest({ onTickerClick }: Props) {
  const [data, setData] = useState<TaxHarvestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getTaxHarvestSuggestions()
      .then((res) => {
        if (mounted) {
          if (res) setData(res);
          else setError('No data available');
        }
      })
      .catch((e) => { if (mounted) setError(e.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 dark:bg-white/[0.04] rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-100 dark:bg-white/[0.04] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] rounded-xl p-6 text-center text-sm text-rh-light-muted dark:text-rh-muted">
        {error || 'Unable to load tax harvest data'}
      </div>
    );
  }

  const { harvestCandidates, washSaleWarnings, aiAnalysis, aiCitations } = data;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Unrealized Gains"
          value={formatCurrency(data.totalUnrealizedGain)}
          color="text-rh-green"
        />
        <SummaryCard
          label="Unrealized Losses"
          value={formatCurrency(data.totalUnrealizedLoss)}
          color="text-rh-red"
        />
        <SummaryCard
          label="Net Position"
          value={formatCurrency(data.netPosition)}
          color={data.netPosition >= 0 ? 'text-rh-green' : 'text-rh-red'}
        />
        <SummaryCard
          label="Potential Savings"
          value={formatCurrency(data.potentialTotalSavings)}
          color="text-rh-green"
        />
      </div>

      {/* Wash Sale Warnings */}
      {washSaleWarnings.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Wash Sale Risk</span>
          </div>
          {washSaleWarnings.map((w, i) => (
            <p key={i} className="text-xs text-orange-600 dark:text-orange-300">{w}</p>
          ))}
        </div>
      )}

      {/* Harvest Candidates Table */}
      {harvestCandidates.length > 0 ? (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200/40 dark:border-white/[0.06]">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
              Harvest Candidates ({harvestCandidates.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-rh-light-muted dark:text-rh-muted border-b border-gray-200/40 dark:border-white/[0.06]">
                  <th className="px-4 py-2 text-left font-medium">Ticker</th>
                  <th className="px-4 py-2 text-right font-medium">Cost Basis</th>
                  <th className="px-4 py-2 text-right font-medium">Current</th>
                  <th className="px-4 py-2 text-right font-medium">Loss</th>
                  <th className="px-4 py-2 text-right font-medium">Loss %</th>
                  <th className="px-4 py-2 text-center font-medium hidden sm:table-cell">Period</th>
                  <th className="px-4 py-2 text-right font-medium">Tax Savings</th>
                </tr>
              </thead>
              <tbody>
                {harvestCandidates.map((c) => (
                  <tr key={c.ticker} className="border-b border-gray-100/40 dark:border-white/[0.04] hover:bg-gray-100/50 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onTickerClick?.(c.ticker)}
                        className="font-mono font-semibold text-rh-green hover:underline"
                      >
                        {c.ticker}
                      </button>
                      <span className="ml-1.5 text-[10px] text-rh-light-muted dark:text-rh-muted">{c.sector}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-rh-light-text dark:text-rh-text">{formatCurrency(c.costBasis)}</td>
                    <td className="px-4 py-2.5 text-right text-rh-light-text dark:text-rh-text">{formatCurrency(c.currentValue)}</td>
                    <td className="px-4 py-2.5 text-right text-rh-red font-medium">{formatCurrency(c.unrealizedLoss)}</td>
                    <td className="px-4 py-2.5 text-right text-rh-red">{formatPct(c.unrealizedLossPct)}</td>
                    <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        c.holdingPeriod === 'short-term'
                          ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400'
                          : c.holdingPeriod === 'mixed'
                          ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-white/[0.08] text-rh-light-muted dark:text-rh-muted'
                      }`}>
                        {c.holdingPeriod}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-rh-green font-semibold">{formatCurrency(c.potentialTaxSavings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] rounded-xl p-6 text-center">
          <p className="text-sm text-rh-green font-medium">No unrealized losses in your portfolio</p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">All your positions are at a gain. Nothing to harvest.</p>
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis && (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">AI Analysis</h3>
          </div>
          <div className="text-xs leading-relaxed text-rh-light-text dark:text-rh-text whitespace-pre-wrap">
            {aiAnalysis}
          </div>
          {aiCitations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200/40 dark:border-white/[0.06]">
              <p className="text-[10px] text-rh-light-muted dark:text-rh-muted mb-1">Sources</p>
              <div className="flex flex-wrap gap-1">
                {aiCitations.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:underline truncate max-w-[200px]"
                  >
                    [{i + 1}]
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-rh-light-muted dark:text-rh-muted text-center italic">
        Not tax advice. Consult a qualified tax professional before making any tax-related decisions. Tax rates shown are estimates.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-4">
      <div className="text-[10px] text-rh-light-muted dark:text-rh-muted mb-1">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}
