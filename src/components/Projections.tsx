import { useState, useEffect, useCallback } from 'react';
import {
  ProjectionResponse,
  SP500ProjectionResponse,
  RealizedProjectionResponse,
  ProjectionMode,
  LookbackPeriod,
} from '../types';
import { getProjections } from '../api';

interface Props {
  currentValue: number;
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

const lookbackLabels: Record<LookbackPeriod, string> = {
  '1d': '1 Day',
  '1w': '1 Week',
  '1m': '1 Month',
  '6m': '6 Months',
  '1y': '1 Year',
  'max': 'All Time',
};

function isSP500Response(resp: ProjectionResponse): resp is SP500ProjectionResponse {
  return resp.mode === 'sp500';
}

function isRealizedResponse(resp: ProjectionResponse): resp is RealizedProjectionResponse {
  return resp.mode === 'realized';
}

function MetricCard({
  label,
  value,
  format,
  colorPositive = false,
}: {
  label: string;
  value: number | null;
  format: 'percent' | 'number';
  colorPositive?: boolean;
}) {
  let displayValue = '—';
  let colorClass = '';

  if (value !== null) {
    if (format === 'percent') {
      displayValue = formatPercent(value);
      if (colorPositive) {
        colorClass = value >= 0 ? 'text-rh-green' : 'text-rh-red';
      }
    } else {
      displayValue = value.toFixed(2);
    }
  }

  return (
    <div>
      <p className="text-xs text-rh-muted">{label}</p>
      <p className={`text-sm font-mono ${colorClass}`}>{displayValue}</p>
    </div>
  );
}

export function Projections({ currentValue }: Props) {
  const [mode, setMode] = useState<ProjectionMode>('sp500');
  const [lookback, setLookback] = useState<LookbackPeriod>('1y');
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getProjections(mode, lookback);
      setData(response);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projections');
    } finally {
      setLoading(false);
    }
  }, [mode, lookback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="bg-rh-card border border-rh-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Projections</h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rh-card border border-rh-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Projections</h2>
        <p className="text-rh-red text-center py-8">{error}</p>
      </div>
    );
  }

  const sp500Data = data && isSP500Response(data) ? data : null;
  const realizedData = data && isRealizedResponse(data) ? data : null;

  return (
    <div className="bg-rh-card border border-rh-border rounded-lg p-6">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold">Portfolio Projections</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-rh-border">
            <button
              onClick={() => setMode('sp500')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'sp500'
                  ? 'bg-rh-green text-black'
                  : 'bg-rh-dark text-white hover:bg-rh-border'
              }`}
            >
              S&P 500 Long-run
            </button>
            <button
              onClick={() => setMode('realized')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'realized'
                  ? 'bg-rh-green text-black'
                  : 'bg-rh-dark text-white hover:bg-rh-border'
              }`}
            >
              My Portfolio
            </button>
          </div>

          {/* Lookback selector (only for realized mode) */}
          {mode === 'realized' && (
            <select
              value={lookback}
              onChange={(e) => setLookback(e.target.value as LookbackPeriod)}
              className="bg-rh-dark border border-rh-border rounded-lg px-3 py-1.5 text-sm"
            >
              {Object.entries(lookbackLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Assumptions / Info banner */}
      <div className="bg-rh-dark/50 rounded-lg p-3 mb-6 text-sm">
        {sp500Data && (
          <p className="text-rh-muted">
            Assuming S&P 500 historical total return of{' '}
            <span className="text-white font-medium">
              {formatPercent(sp500Data.assumptions.annualReturn)}
            </span>{' '}
            per year (dividends reinvested), compounded monthly.
          </p>
        )}
        {realizedData && (
          <div className="space-y-1">
            <p className="text-rh-muted">
              Based on your portfolio's realized return over{' '}
              <span className="text-white font-medium">
                {lookbackLabels[realizedData.lookbackUsed]}
              </span>
              {realizedData.lookbackUsed !== realizedData.lookback && (
                <span className="text-yellow-400 text-xs ml-1">
                  (requested {lookbackLabels[realizedData.lookback]})
                </span>
              )}
            </p>
            {realizedData.snapshotCount > 0 && (
              <p className="text-xs text-rh-muted">
                {realizedData.snapshotCount} snapshots from{' '}
                {realizedData.dataStartDate
                  ? new Date(realizedData.dataStartDate).toLocaleDateString()
                  : '—'}{' '}
                to{' '}
                {realizedData.dataEndDate
                  ? new Date(realizedData.dataEndDate).toLocaleDateString()
                  : '—'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notes / warnings */}
      {realizedData && realizedData.notes.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
          {realizedData.notes.map((note, i) => (
            <p key={i} className="text-yellow-400 text-sm">
              {note}
            </p>
          ))}
        </div>
      )}

      {/* Current value */}
      <div className="mb-6">
        <p className="text-rh-muted text-sm mb-1">Current Value</p>
        <p className="text-2xl font-bold">{formatCurrency(data?.currentValue ?? currentValue)}</p>
      </div>

      {/* Projection horizons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {data &&
          (['6m', '1y', '5y', '10y'] as const).map((horizon) => {
            const horizonData = data.horizons[horizon];
            const projected = horizonData?.base ?? 0;
            const gain = projected - (data.currentValue || 0);
            const gainPercent =
              data.currentValue > 0 ? (gain / data.currentValue) * 100 : 0;

            return (
              <div key={horizon} className="bg-rh-dark rounded-lg p-4">
                <p className="text-rh-muted text-sm mb-2">{horizonLabels[horizon]}</p>
                <p className="text-lg font-bold">{formatCurrency(projected)}</p>
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

      {/* Realized Metrics (only for realized mode) */}
      {realizedData && (
        <div className="border-t border-rh-border pt-4">
          <p className="text-sm text-rh-muted mb-3">Realized Metrics</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="CAGR (Annualized)"
              value={realizedData.realized.cagr}
              format="percent"
              colorPositive
            />
            <MetricCard
              label="Volatility (Annualized)"
              value={realizedData.realized.volatility}
              format="percent"
            />
            <MetricCard
              label="Max Drawdown"
              value={realizedData.realized.maxDrawdown}
              format="percent"
              colorPositive
            />
            <MetricCard
              label="Sharpe Ratio"
              value={realizedData.realized.sharpe}
              format="number"
            />
          </div>
        </div>
      )}

      {/* S&P 500 info (only for sp500 mode) */}
      {sp500Data && (
        <div className="border-t border-rh-border pt-4">
          <p className="text-xs text-rh-muted">
            S&P 500 historical average includes dividends reinvested. Past performance does
            not guarantee future results.
          </p>
        </div>
      )}
    </div>
  );
}
