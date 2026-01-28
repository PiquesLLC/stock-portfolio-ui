import { RiskForecast as RiskForecastType } from '../types';

interface RiskForecastProps {
  data: RiskForecastType;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function formatSharpe(value: number | null): string {
  if (value === null) return '--';
  return value.toFixed(2);
}

export function RiskForecast({ data, onRefresh, isRefreshing }: RiskForecastProps) {
  const { status, basis, metrics, scenarios } = data;

  // Completely empty / insufficient state (no scenarios available)
  if (!scenarios) {
    const isCaching = status === 'caching';

    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Risk Forecast</h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-sm text-rh-green hover:text-rh-green/80 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          {isCaching ? (
            <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0"></div>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center text-blue-400 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          <div>
            <p className="text-sm text-blue-400 font-medium">
              {isCaching ? 'Caching historical data...' : 'Insufficient data'}
            </p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              {basis.note || 'Monte Carlo simulation requires at least 60 days of price history.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine volatility level for badge
  let volLevel: 'low' | 'moderate' | 'high' = 'low';
  if (metrics.annualVolatility !== null) {
    if (metrics.annualVolatility > 0.25) volLevel = 'high';
    else if (metrics.annualVolatility > 0.15) volLevel = 'moderate';
  }

  const volColors = {
    low: 'text-rh-green bg-green-500/10 border-green-500/30',
    moderate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    high: 'text-rh-red bg-red-500/10 border-red-500/30',
  };

  // Check if return is positive or negative for coloring
  const returnColor = metrics.annualReturn !== null
    ? metrics.annualReturn >= 0 ? 'text-rh-green' : 'text-rh-red'
    : 'text-rh-light-text dark:text-rh-text';

  const sharpeColor = metrics.sharpeRatio !== null
    ? metrics.sharpeRatio >= 1 ? 'text-rh-green' : metrics.sharpeRatio >= 0 ? 'text-yellow-400' : 'text-rh-red'
    : 'text-rh-light-text dark:text-rh-text';

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Risk Forecast</h3>
        <div className="flex items-center gap-3">
          {status === 'caching' && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
              Caching data...
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-sm text-rh-green hover:text-rh-green/80 disabled:opacity-50 flex items-center gap-1"
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? '' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Volatility Badge */}
      <div className="mb-6">
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${volColors[volLevel]}`}>
          {volLevel.charAt(0).toUpperCase() + volLevel.slice(1)} Volatility
        </span>
      </div>

      {/* Metrics Grid - 2x2 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Annual Return</p>
          <p className={`text-xl font-semibold ${returnColor}`}>
            {metrics.annualReturn !== null ? `${metrics.annualReturn >= 0 ? '+' : ''}${formatPercent(metrics.annualReturn)}` : '--'}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            Historical CAGR
          </p>
        </div>

        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Annual Volatility</p>
          <p className="text-xl font-semibold text-rh-light-text dark:text-rh-text">
            {formatPercent(metrics.annualVolatility)}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            Price fluctuation
          </p>
        </div>

        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Max Drawdown</p>
          <p className={`text-xl font-semibold ${metrics.maxDrawdown !== null && metrics.maxDrawdown > 0.15 ? 'text-rh-red' : 'text-rh-light-text dark:text-rh-text'}`}>
            {metrics.maxDrawdown !== null ? `-${(metrics.maxDrawdown * 100).toFixed(1)}%` : '--'}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            Largest decline
          </p>
        </div>

        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Sharpe Ratio</p>
          <p className={`text-xl font-semibold ${sharpeColor}`}>
            {formatSharpe(metrics.sharpeRatio)}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            Risk-adjusted return
          </p>
        </div>
      </div>

      {/* Monte Carlo Projection */}
      {scenarios && (
        <div className="pt-4 border-t border-rh-light-border dark:border-rh-border">
          <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-4">
            1-Year Projection (Monte Carlo)
          </h4>

          <div className="space-y-3">
            {/* Optimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-green"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Optimistic</span>
              </div>
              <span className="font-medium text-rh-green">{formatCurrency(scenarios.optimistic)}</span>
            </div>

            {/* Base Case */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Base Case</span>
              </div>
              <span className="font-medium text-blue-400">{formatCurrency(scenarios.baseCase)}</span>
            </div>

            {/* Pessimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-red"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Pessimistic</span>
              </div>
              <span className="font-medium text-rh-red">{formatCurrency(scenarios.pessimistic)}</span>
            </div>
          </div>

          {/* Visual Bar */}
          <div className="mt-4 relative h-8">
            <div className="absolute inset-0 bg-gradient-to-r from-rh-red via-blue-500 to-rh-green rounded-lg opacity-30"></div>
            <div className="absolute inset-y-0 left-0 flex items-center pl-2">
              <span className="text-xs text-rh-light-text dark:text-rh-text">{formatCurrency(scenarios.pessimistic)}</span>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <span className="text-xs text-rh-light-text dark:text-rh-text">{formatCurrency(scenarios.optimistic)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Footnote */}
      <div className="mt-4 pt-3 border-t border-rh-light-border/50 dark:border-rh-border/50">
        <p className="text-xs text-rh-light-muted dark:text-rh-muted italic">
          {basis.note && <span>{basis.note}. </span>}
          {scenarios && (
            <span>
              Based on 5,000 Monte Carlo simulations using portfolio-weighted historical returns.
              Does not include dividends.
            </span>
          )}
          {!scenarios && (
            <span>Past performance does not guarantee future results.</span>
          )}
        </p>
      </div>
    </div>
  );
}
