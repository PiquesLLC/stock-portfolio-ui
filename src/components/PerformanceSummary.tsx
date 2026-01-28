import { useState, useEffect, useCallback } from 'react';
import { PerformanceSummary as PerformanceSummaryType } from '../types';
import { getPerformanceSummary } from '../api';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  refreshTrigger?: number;
}

export function PerformanceSummary({ refreshTrigger }: Props) {
  const [data, setData] = useState<PerformanceSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const summary = await getPerformanceSummary();
      setData(summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 animate-pulse shadow-sm dark:shadow-none">
            <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-1/3 mb-4"></div>
            <div className="h-8 bg-gray-200 dark:bg-rh-border rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <p className="text-rh-red text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { sinceTracking, holdingsPL, brokerLifetime } = data;

  return (
    <div className="space-y-4">
      {/* Main two-box layout: Holdings P/L (left), Since Tracking Start (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Box 1: Current Holdings P/L (LEFT) */}
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-medium text-rh-light-muted dark:text-rh-muted mb-4">Current Holdings P/L</h3>

          <div className="mb-3">
            <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">{formatCurrency(holdingsPL.unrealizedPL)}</p>
            <p
              className={`text-lg font-semibold ${
                holdingsPL.unrealizedPLPercent >= 0 ? 'text-rh-green' : 'text-rh-red'
              }`}
            >
              {formatPercent(holdingsPL.unrealizedPLPercent)}
            </p>
          </div>

          <div className="flex justify-between text-sm text-rh-light-muted dark:text-rh-muted border-t border-rh-light-border dark:border-rh-border pt-3 mt-3">
            <div>
              <p className="text-xs">Total Cost</p>
              <p className="text-rh-light-text dark:text-white">{formatCurrency(holdingsPL.totalCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs">Market Value</p>
              <p className="text-rh-light-text dark:text-white">{formatCurrency(holdingsPL.currentValue)}</p>
            </div>
          </div>

          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">Unrealized gains/losses only</p>
        </div>

        {/* Box 2: Since Tracking Start (RIGHT) */}
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-rh-light-muted dark:text-rh-muted">Since Tracking Start</h3>
            {sinceTracking.startDate && (
              <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                {formatDate(sinceTracking.startDate)}
              </span>
            )}
          </div>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-4">Asset performance only — excludes margin</p>

          {sinceTracking.hasBaseline ? (
            <>
              <div className="mb-3">
                <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">
                  {sinceTracking.absoluteReturn !== null
                    ? formatCurrency(sinceTracking.absoluteReturn)
                    : '—'}
                </p>
                <p
                  className={`text-lg font-semibold ${
                    (sinceTracking.percentReturn ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}
                >
                  {sinceTracking.percentReturn !== null
                    ? formatPercent(sinceTracking.percentReturn)
                    : '—'}
                </p>
              </div>

              <div className="flex justify-between text-sm text-rh-light-muted dark:text-rh-muted border-t border-rh-light-border dark:border-rh-border pt-3 mt-3">
                <div>
                  <p className="text-xs">Starting Assets</p>
                  <p className="text-rh-light-text dark:text-white">
                    {sinceTracking.startingValue !== null
                      ? formatCurrency(sinceTracking.startingValue)
                      : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs">Current Assets</p>
                  <p className="text-rh-light-text dark:text-white">{formatCurrency(sinceTracking.currentValue)}</p>
                </div>
              </div>

              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">
                Tracking asset value independent of leverage
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-rh-light-muted dark:text-rh-muted">No baseline set</p>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                Add holdings and set a baseline to track performance
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Optional Box 3: Broker Lifetime (if data exists) */}
      {brokerLifetime && brokerLifetime.hasData && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-rh-light-muted dark:text-rh-muted">Broker Lifetime Performance</h3>
            {brokerLifetime.asOf && (
              <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                as of {formatDate(brokerLifetime.asOf)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Net Contributions</p>
              <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                {brokerLifetime.netContributions !== null
                  ? formatCurrency(brokerLifetime.netContributions)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Current Value</p>
              <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                {brokerLifetime.currentValue !== null
                  ? formatCurrency(brokerLifetime.currentValue)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Total Return</p>
              <p
                className={`text-lg font-semibold ${
                  (brokerLifetime.absoluteReturn ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                }`}
              >
                {brokerLifetime.absoluteReturn !== null
                  ? formatCurrency(brokerLifetime.absoluteReturn)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Return %</p>
              <p
                className={`text-lg font-semibold ${
                  (brokerLifetime.percentReturn ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                }`}
              >
                {brokerLifetime.percentReturn !== null
                  ? formatPercent(brokerLifetime.percentReturn)
                  : '—'}
              </p>
            </div>
          </div>

          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-3">
            User-provided data from broker account
          </p>
        </div>
      )}
    </div>
  );
}
