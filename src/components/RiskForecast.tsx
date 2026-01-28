import { RiskForecast as RiskForecastType } from '../types';

interface RiskForecastProps {
  data: RiskForecastType;
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

export function RiskForecast({ data }: RiskForecastProps) {
  const { expectedAnnualVol, maxDrawdown1y, monteCarloBands, partial } = data;

  // Check if we have enough data to show anything meaningful
  const hasVolatility = expectedAnnualVol !== null;
  const hasDrawdown = maxDrawdown1y !== null;
  const hasBands = monteCarloBands !== null;

  // Completely empty state
  if (!hasVolatility && !hasDrawdown && !hasBands) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Risk Forecast</h3>

        {/* Caching indicator */}
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0"></div>
          <div>
            <p className="text-sm text-blue-400 font-medium">Caching historical data...</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              Monte Carlo simulation requires at least 100 days of price history.
              Refresh to check progress.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine volatility level
  let volLevel: 'low' | 'moderate' | 'high' = 'low';
  if (expectedAnnualVol !== null) {
    if (expectedAnnualVol > 0.25) volLevel = 'high';
    else if (expectedAnnualVol > 0.15) volLevel = 'moderate';
  }

  const volColors = {
    low: 'text-rh-green bg-green-500/10 border-green-500/30',
    moderate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    high: 'text-rh-red bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Risk Forecast</h3>
        {partial && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
            Estimate (caching data)
          </span>
        )}
      </div>

      {/* Volatility Badge */}
      <div className="mb-6">
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${volColors[volLevel]}`}>
          {volLevel.charAt(0).toUpperCase() + volLevel.slice(1)} Volatility
          {partial && <span className="ml-1 text-xs opacity-75">*</span>}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Annual Volatility</p>
          <p className="text-xl font-semibold text-rh-light-text dark:text-rh-text">
            {formatPercent(expectedAnnualVol)}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            {partial ? 'Based on market average' : 'Expected price fluctuation'}
          </p>
        </div>

        <div className="p-4 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-1">Max Drawdown</p>
          <p className={`text-xl font-semibold ${maxDrawdown1y !== null && maxDrawdown1y > 0.15 ? 'text-rh-red' : 'text-rh-light-text dark:text-rh-text'}`}>
            {maxDrawdown1y !== null ? `-${(maxDrawdown1y * 100).toFixed(1)}%` : '--'}
          </p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            {maxDrawdown1y !== null ? 'Largest historical decline' : 'Needs more history'}
          </p>
        </div>
      </div>

      {/* Monte Carlo Bands */}
      {monteCarloBands && (
        <div className="pt-4 border-t border-rh-light-border dark:border-rh-border">
          <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-4">
            1-Year Projection {partial ? '(Scenario Analysis)' : '(Monte Carlo)'}
          </h4>

          <div className="space-y-3">
            {/* Optimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-green"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Optimistic (90th %ile)</span>
              </div>
              <span className="font-medium text-rh-green">{formatCurrency(monteCarloBands.p90)}</span>
            </div>

            {/* Base */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Base Case (50th %ile)</span>
              </div>
              <span className="font-medium text-blue-400">{formatCurrency(monteCarloBands.p50)}</span>
            </div>

            {/* Pessimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-red"></div>
                <span className="text-sm text-rh-light-muted dark:text-rh-muted">Pessimistic (10th %ile)</span>
              </div>
              <span className="font-medium text-rh-red">{formatCurrency(monteCarloBands.p10)}</span>
            </div>
          </div>

          {/* Visual Bar */}
          <div className="mt-4 relative h-8">
            <div className="absolute inset-0 bg-gradient-to-r from-rh-red via-blue-500 to-rh-green rounded-lg opacity-30"></div>
            <div className="absolute inset-y-0 left-0 flex items-center pl-2">
              <span className="text-xs text-rh-light-text dark:text-rh-text">{formatCurrency(monteCarloBands.p10)}</span>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <span className="text-xs text-rh-light-text dark:text-rh-text">{formatCurrency(monteCarloBands.p90)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-4 italic">
        {partial
          ? 'Estimates based on market averages. More accurate projections will be available once historical data is cached.'
          : 'Based on 500 Monte Carlo simulations using historical volatility. Past performance does not guarantee future results.'
        }
      </p>
    </div>
  );
}
