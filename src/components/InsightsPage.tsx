import { useState, useEffect, useCallback, useRef } from 'react';
import { HealthScore as HealthScoreType, Attribution as AttributionType, LeakDetectorResult, RiskForecast as RiskForecastType } from '../types';
import { getHealthScore, getAttribution, getLeakDetector, getRiskForecast } from '../api';
import { HealthScore } from './HealthScore';
import { Attribution } from './Attribution';
import { LeakDetector } from './LeakDetector';
import { RiskForecast } from './RiskForecast';

// Timeout for loading state (8 seconds)
const LOADING_TIMEOUT_MS = 8000;

export function InsightsPage() {
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(null);
  const [attribution, setAttribution] = useState<AttributionType | null>(null);
  const [leakDetector, setLeakDetector] = useState<LeakDetectorResult | null>(null);
  const [riskForecast, setRiskForecast] = useState<RiskForecastType | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Date | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef = useRef(false);

  const fetchInsights = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);
      setTimedOut(false);
      setError(null);
      setLastAttempt(new Date());

      // Set a timeout to show partial results if loading takes too long
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
        setLoading(false);
      }, LOADING_TIMEOUT_MS);

      // Fetch each insight independently to show what's available
      const fetchPromises = [
        getHealthScore().then(data => setHealthScore(data)).catch(e => console.error('Health score error:', e)),
        getAttribution('1d').then(data => setAttribution(data)).catch(e => console.error('Attribution error:', e)),
        getLeakDetector().then(data => setLeakDetector(data)).catch(e => console.error('Leak detector error:', e)),
        getRiskForecast().then(data => setRiskForecast(data)).catch(e => console.error('Risk forecast error:', e)),
      ];

      await Promise.allSettled(fetchPromises);

      // Clear timeout since we got responses
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load insights';
      setError(message);
    } finally {
      setLoading(false);
      setTimedOut(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchInsights();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [fetchInsights]);

  const handleRetry = () => {
    fetchInsights();
  };

  // Show loading only if we have no data at all
  const hasAnyData = healthScore || attribution || leakDetector || riskForecast;

  if (loading && !hasAnyData && !timedOut) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-rh-green border-t-transparent mx-auto mb-3"></div>
          <p className="text-rh-light-muted dark:text-rh-muted">Analyzing your portfolio...</p>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">This may take a moment</p>
        </div>
      </div>
    );
  }

  // Check if any insights returned partial data
  const somePartial =
    (healthScore?.partial) ||
    (attribution?.partial) ||
    (leakDetector?.partial) ||
    (riskForecast?.partial);

  // Format last attempt time
  const formatLastAttempt = () => {
    if (!lastAttempt) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastAttempt.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    return lastAttempt.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Error State */}
      {error && !hasAnyData && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
          <p className="text-rh-red font-medium mb-2">Error loading insights</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-rh-green text-black font-semibold rounded-lg hover:bg-green-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Partial Data / Still Caching Banner */}
      {somePartial && hasAnyData && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-blue-400 font-medium">
                Still caching historical data
              </p>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                Some analytics require price history. Data fills in gradually to respect API limits.
                {lastAttempt && ` Last updated: ${formatLastAttempt()}`}
              </p>
            </div>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="flex-shrink-0 px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      )}

      {/* Timed Out Warning */}
      {timedOut && !hasAnyData && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-yellow-400 font-medium mb-2">Taking longer than expected</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-4">
            The server is still processing. This usually happens when caching historical data for the first time.
          </p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-rh-green text-black font-semibold rounded-lg hover:bg-green-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading indicator when refreshing but have data */}
      {loading && hasAnyData && (
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center gap-2 text-sm text-rh-light-muted dark:text-rh-muted">
            <div className="w-4 h-4 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin"></div>
            <span>Refreshing analytics...</span>
          </div>
        </div>
      )}

      {/* Health Score - Full Width */}
      {healthScore && <HealthScore data={healthScore} />}

      {/* Attribution and Leak Detector - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {attribution && <Attribution initialData={attribution} />}
        {leakDetector && <LeakDetector data={leakDetector} />}
      </div>

      {/* Risk Forecast - Full Width */}
      {riskForecast && <RiskForecast data={riskForecast} />}

      {/* Empty State */}
      {!hasAnyData && !loading && !error && !timedOut && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-rh-light-text dark:text-rh-text font-medium mb-2">No insights available</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            Add some holdings to your portfolio to see analytics.
          </p>
        </div>
      )}
    </div>
  );
}
