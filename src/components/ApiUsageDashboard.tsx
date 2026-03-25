import { useState, useEffect, useCallback } from 'react';
import { getApiUsage, type ApiUsageResponse } from '../api';

const CARD = 'rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl';
type Period = 7 | 30 | 90;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

interface Props {
  onBack: () => void;
}

export function ApiUsageDashboard({ onBack }: Props) {
  const [data, setData] = useState<ApiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>(7);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError('');
    try {
      const res = await getApiUsage(p);
      setData(res);
    } catch {
      setError('Failed to load API usage data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period); }, [fetchData, period]);

  const features = data ? Object.entries(data.byFeature).sort((a, b) => b[1].calls - a[1].calls) : [];
  const days = data ? Object.entries(data.byDay).sort((a, b) => a[0].localeCompare(b[0])) : [];
  const maxDayCalls = days.length > 0 ? Math.max(...days.map(([, v]) => v.calls)) : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-rh-light-muted dark:text-white/40 hover:text-rh-light-text dark:hover:text-white transition-colors">&larr; Back</button>
          <h1 className="text-xl font-bold text-rh-light-text dark:text-white">API Usage</h1>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-white/[0.04] rounded-lg p-0.5">
          {([7, 30, 90] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-white dark:bg-white/10 text-rh-light-text dark:text-white shadow-sm' : 'text-rh-light-muted dark:text-white/40 hover:text-rh-light-text dark:hover:text-white/60'}`}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <div className="text-center py-12 text-rh-light-muted dark:text-white/30">Loading...</div>}
      {error && <div className="text-center py-12 text-rh-red">{error}</div>}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-white/30 mb-1">Total Calls</p>
              <p className="text-2xl font-bold text-rh-light-text dark:text-white tabular-nums">{formatNumber(data.totals.calls)}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-white/30 mb-1">Total Cost</p>
              <p className="text-2xl font-bold text-rh-green tabular-nums">{formatCost(data.totals.costUsd)}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-white/30 mb-1">Input Tokens</p>
              <p className="text-2xl font-bold text-rh-light-text dark:text-white tabular-nums">{formatNumber(data.totals.inputTokens)}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-white/30 mb-1">Output Tokens</p>
              <p className="text-2xl font-bold text-rh-light-text dark:text-white tabular-nums">{formatNumber(data.totals.outputTokens)}</p>
            </div>
          </div>

          {/* Daily Trend */}
          <div className={`${CARD} p-5`}>
            <h2 className="text-sm font-semibold text-rh-light-text dark:text-white mb-4">Daily Calls</h2>
            <div className="space-y-1.5">
              {days.map(([date, v]) => (
                <div key={date} className="flex items-center gap-3">
                  <span className="text-[11px] text-rh-light-muted dark:text-white/40 w-20 flex-shrink-0 tabular-nums">
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-5 bg-gray-100 dark:bg-white/[0.03] rounded overflow-hidden">
                    <div className="h-full bg-rh-green/60 rounded transition-all duration-300"
                      style={{ width: `${Math.max((v.calls / maxDayCalls) * 100, 2)}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-rh-light-text dark:text-white/60 w-10 text-right tabular-nums">{v.calls}</span>
                  <span className="text-[10px] text-rh-light-muted dark:text-white/30 w-14 text-right tabular-nums">{formatCost(v.cost)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Feature */}
          <div className={`${CARD} p-5`}>
            <h2 className="text-sm font-semibold text-rh-light-text dark:text-white mb-4">By Feature</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-white/30">
                    <th className="pb-2 font-medium">Feature</th>
                    <th className="pb-2 font-medium text-right">Calls</th>
                    <th className="pb-2 font-medium text-right">In Tokens</th>
                    <th className="pb-2 font-medium text-right">Out Tokens</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map(([name, v]) => (
                    <tr key={name} className="border-t border-gray-100 dark:border-white/[0.04]">
                      <td className="py-2 text-sm font-medium text-rh-light-text dark:text-white">{name}</td>
                      <td className="py-2 text-sm text-right text-rh-light-muted dark:text-white/50 tabular-nums">{v.calls}</td>
                      <td className="py-2 text-sm text-right text-rh-light-muted dark:text-white/50 tabular-nums">{formatNumber(v.inputTokens)}</td>
                      <td className="py-2 text-sm text-right text-rh-light-muted dark:text-white/50 tabular-nums">{formatNumber(v.outputTokens)}</td>
                      <td className="py-2 text-sm text-right font-medium text-rh-green tabular-nums">{formatCost(v.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
