import { RiskForecast as RiskForecastType } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { Acronym } from './Acronym';

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
    const hasAnyMetric = metrics.annualReturn !== null || metrics.annualVolatility !== null || metrics.maxDrawdown !== null || metrics.sharpeRatio !== null;

    return (
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-transparent backdrop-blur-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">Risk Forecast <InfoTooltip text="Uses historical daily returns to compute CAGR, annualized volatility (std dev * sqrt(252)), Sharpe ratio (return/vol), and max drawdown. 1-year scenarios use Monte Carlo simulation with 10th/50th/90th percentile outcomes." /></h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-rh-light-muted/10 dark:bg-white/10 text-rh-light-text dark:text-white">
              {isCaching ? 'Loading' : 'Estimate'}
            </span>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} disabled={isRefreshing} className="text-sm text-rh-green hover:text-rh-green/80 disabled:opacity-50">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>

        {/* Show available metrics even without scenarios */}
        {hasAnyMetric && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {metrics.annualVolatility !== null && (
              <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
                <p className="text-xs text-rh-light-text dark:text-white">Volatility</p>
                <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{formatPercent(metrics.annualVolatility)}</p>
              </div>
            )}
            {metrics.maxDrawdown !== null && (
              <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
                <p className="text-xs text-rh-light-text dark:text-white">Max Drawdown</p>
                <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">-{(metrics.maxDrawdown * 100).toFixed(1)}%</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-rh-light-text dark:text-white">
          {isCaching
            ? 'Caching historical price data for Monte Carlo simulation...'
            : (basis.note || 'Full projections need 60+ days of history. Collecting daily data.')}
        </p>
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
    <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-transparent backdrop-blur-xl p-5">
      <div className="flex items-center justify-between mb-3">
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
      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${volColors[volLevel]}`}>
          {volLevel.charAt(0).toUpperCase() + volLevel.slice(1)} Volatility
        </span>
      </div>

      {/* Metrics Grid - 2x2 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
          <p className="text-xs text-rh-light-text dark:text-white/80 mb-1">Annual Return</p>
          <p className={`text-lg font-semibold tabular-nums ${returnColor}`}>
            {metrics.annualReturn !== null ? `${metrics.annualReturn >= 0 ? '+' : ''}${formatPercent(metrics.annualReturn)}` : '--'}
          </p>
          <p className="text-[11px] text-rh-light-text dark:text-white/80 mt-0.5">
            Historical CAGR
          </p>
        </div>

        <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
          <p className="text-xs text-rh-light-text dark:text-white mb-1">Annual Volatility</p>
          <p className="text-lg font-semibold tabular-nums text-rh-light-text dark:text-rh-text">
            {formatPercent(metrics.annualVolatility)}
          </p>
          <p className="text-[11px] text-rh-light-text dark:text-white mt-0.5">
            Price fluctuation
          </p>
        </div>

        <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
          <p className="text-xs text-rh-light-text dark:text-white mb-1">Max Drawdown</p>
          <p className={`text-lg font-semibold tabular-nums ${metrics.maxDrawdown !== null && metrics.maxDrawdown > 0.15 ? 'text-rh-red' : 'text-rh-light-text dark:text-rh-text'}`}>
            {metrics.maxDrawdown !== null ? `-${(metrics.maxDrawdown * 100).toFixed(1)}%` : '--'}
          </p>
          <p className="text-[11px] text-rh-light-text dark:text-white mt-0.5">
            Largest decline
          </p>
        </div>

        <div className="p-3 rounded-lg bg-gray-50/60 dark:bg-transparent border border-gray-200/40 dark:border-white/[0.06]">
          <p className="text-xs text-rh-light-text dark:text-white mb-1"><Acronym label="Sharpe Ratio" /></p>
          <p className={`text-lg font-semibold tabular-nums ${sharpeColor}`}>
            {formatSharpe(metrics.sharpeRatio)}
          </p>
          <p className="text-[11px] text-rh-light-text dark:text-white mt-0.5">
            Risk-adjusted return
          </p>
        </div>
      </div>

      {/* Monte Carlo Projection */}
      {scenarios && (
        <div className="pt-4 border-t border-gray-200/40 dark:border-white/[0.06]">
          <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-4">
            1-Year Projection (Monte Carlo)
          </h4>

          <div className="space-y-3">
            {/* Optimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-green"></div>
                <span className="text-sm text-rh-light-text dark:text-white">Optimistic</span>
              </div>
              <span className="font-medium text-rh-green tabular-nums">{formatCurrency(scenarios.optimistic)}</span>
            </div>

            {/* Base Case */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-rh-light-text dark:text-white">Base Case</span>
              </div>
              <span className="font-medium text-blue-400 tabular-nums">{formatCurrency(scenarios.baseCase)}</span>
            </div>

            {/* Pessimistic */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rh-red"></div>
                <span className="text-sm text-rh-light-text dark:text-white">Pessimistic</span>
              </div>
              <span className="font-medium text-rh-red tabular-nums">{formatCurrency(scenarios.pessimistic)}</span>
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
      <div className="mt-4 pt-3 border-t border-gray-200/40 dark:border-white/[0.06]">
        <p className="text-xs text-rh-light-text dark:text-white italic">
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
