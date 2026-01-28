import { useState, useEffect, useCallback } from 'react';
import {
  ProjectionResponse,
  SP500ProjectionResponse,
  PaceProjection,
} from '../types';
import { getProjections } from '../api';

type ProjectionModeSimple = 'sp500' | 'pace';

interface Props {
  currentValue: number;
  paceProjection?: PaceProjection;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null, decimals: number = 2): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

const horizonLabels: Record<string, string> = {
  '6m': '6 Months',
  '1y': '1 Year',
  '5y': '5 Years',
  '10y': '10 Years',
};

function isSP500Response(resp: ProjectionResponse): resp is SP500ProjectionResponse {
  return resp.mode === 'sp500';
}

export function Projections({ currentValue, paceProjection }: Props) {
  const [mode, setMode] = useState<ProjectionModeSimple>('sp500');
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    // Pace mode uses data from props, not API
    if (mode === 'pace') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Only fetch SP500 projections now
      const response = await getProjections('sp500', '1y');
      setData(response);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projections');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Projections</h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Projections</h2>
        <p className="text-rh-red text-center py-8">{error}</p>
      </div>
    );
  }

  const sp500Data = data && isSP500Response(data) ? data : null;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Portfolio Projections</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-rh-light-border dark:border-rh-border">
            <button
              type="button"
              onClick={() => setMode('sp500')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'sp500'
                  ? 'bg-rh-green text-black'
                  : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-white hover:bg-gray-200 dark:hover:bg-rh-border'
              }`}
            >
              S&P 500
            </button>
            <button
              type="button"
              onClick={() => setMode('pace')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'pace'
                  ? 'bg-rh-green text-black'
                  : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-white hover:bg-gray-200 dark:hover:bg-rh-border'
              }`}
            >
              Current Pace
            </button>
          </div>
        </div>
      </div>

      {/* Assumptions / Info banner (not for pace mode - has its own) */}
      {mode !== 'pace' && (
      <div className="bg-gray-100 dark:bg-rh-dark/50 rounded-lg p-3 mb-6 text-sm">
        {sp500Data && (
          <p className="text-rh-light-muted dark:text-rh-muted">
            Assuming S&P 500 historical total return of{' '}
            <span className="text-rh-light-text dark:text-white font-medium">
              {formatPercent(sp500Data.assumptions.annualReturn)}
            </span>{' '}
            per year (dividends reinvested), compounded monthly.
          </p>
        )}
      </div>
      )}

      {/* Current value (not for pace mode) */}
      {mode !== 'pace' && (
        <div className="mb-6">
          <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-1">Current Value</p>
          <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">{formatCurrency(data?.currentValue ?? currentValue)}</p>
        </div>
      )}

      {/* Projection horizons (not for pace mode) */}
      {mode !== 'pace' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {data &&
            (['6m', '1y', '5y', '10y'] as const).map((horizon) => {
              const horizonData = data.horizons[horizon];
              const projected = horizonData?.base ?? 0;
              const gain = projected - (data.currentValue || 0);
              const gainPercent =
                data.currentValue > 0 ? (gain / data.currentValue) * 100 : 0;

              return (
                <div key={horizon} className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">{horizonLabels[horizon]}</p>
                  <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCurrency(projected)}</p>
                  <p
                    className={`text-sm ${
                      gainPercent >= 0 ? 'text-rh-green' : 'text-rh-red'
                    }`}
                  >
                    {gainPercent >= 0 ? '+' : ''}
                    {gainPercent.toFixed(1)}%
                  </p>
                </div>
              );
            })}
        </div>
      )}

      {/* S&P 500 info (only for sp500 mode) */}
      {sp500Data && (
        <div className="border-t border-rh-light-border dark:border-rh-border pt-4">
          <p className="text-xs text-rh-light-muted dark:text-rh-muted">
            S&P 500 historical average includes dividends reinvested. Past performance does
            not guarantee future results.
          </p>
        </div>
      )}

      {/* Pace Projection (only for pace mode) */}
      {mode === 'pace' && paceProjection && (
        <>
          {/* Assumptions / Info banner for pace */}
          <div className="bg-gray-100 dark:bg-rh-dark/50 rounded-lg p-3 mb-6 text-sm">
            <p className="text-rh-light-muted dark:text-rh-muted">
              Based on your <span className="text-rh-light-text dark:text-white font-medium">month-to-date</span> performance
              ({paceProjection.daysIntoMonth} days into the month), scaled linearly.
            </p>
          </div>

          {!paceProjection.hasData ? (
            <div className="text-center py-8">
              <p className="text-rh-light-muted dark:text-rh-muted">
                {paceProjection.note || 'Not enough data yet'}
              </p>
            </div>
          ) : (
            <>
              {/* MTD and Pace metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">MTD Return</p>
                  <p className={`text-lg font-bold ${
                    (paceProjection.mtdReturnPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {paceProjection.mtdReturnPct !== null
                      ? `${paceProjection.mtdReturnPct >= 0 ? '+' : ''}${paceProjection.mtdReturnPct.toFixed(2)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Monthly Pace</p>
                  <p className={`text-lg font-bold ${
                    (paceProjection.paceMonthlyPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {paceProjection.paceMonthlyPct !== null
                      ? `${paceProjection.paceMonthlyPct >= 0 ? '+' : ''}${paceProjection.paceMonthlyPct.toFixed(2)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Annual Pace</p>
                  <p className={`text-lg font-bold ${
                    (paceProjection.paceAnnualPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {paceProjection.paceAnnualPct !== null
                      ? `${paceProjection.paceAnnualPct >= 0 ? '+' : ''}${paceProjection.paceAnnualPct.toFixed(1)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Current Assets</p>
                  <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                    {formatCurrency(paceProjection.currentAssets)}
                  </p>
                </div>
              </div>

              {/* Horizon projections */}
              <div className="mb-6">
                <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-3">Projected Values (at current pace)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['1y', '2y', '5y', '10y'] as const).map((horizon) => {
                    const pct = paceProjection.horizonPct[horizon];
                    const value = paceProjection.horizonValue[horizon];

                    return (
                      <div key={horizon} className="bg-rh-light-bg dark:bg-rh-dark rounded-lg p-4">
                        <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">
                          {horizon === '1y' ? '1 Year' : horizon === '2y' ? '2 Years' : horizon === '5y' ? '5 Years' : '10 Years'}
                        </p>
                        <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                          {value !== null ? formatCurrency(value) : '—'}
                        </p>
                        <p className={`text-sm ${
                          (pct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                        }`}>
                          {pct !== null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Baseline info */}
              <div className="border-t border-rh-light-border dark:border-rh-border pt-4">
                <div className="flex justify-between text-sm text-rh-light-muted dark:text-rh-muted mb-2">
                  <span>Month baseline ({paceProjection.baselineMonthDate ? new Date(paceProjection.baselineMonthDate).toLocaleDateString() : '—'})</span>
                  <span>{paceProjection.baselineMonthAssets !== null ? formatCurrency(paceProjection.baselineMonthAssets) : '—'}</span>
                </div>
                <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                  Simple linear projection based on MTD performance. For informational purposes only.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* No data message for pace mode without data */}
      {mode === 'pace' && !paceProjection && (
        <div className="text-center py-8">
          <p className="text-rh-light-muted dark:text-rh-muted">Pace projections not available</p>
        </div>
      )}
    </div>
  );
}
