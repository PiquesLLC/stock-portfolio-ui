import { useState, useEffect, useCallback } from 'react';
import {
  ProjectionResponse,
  SP500ProjectionResponse,
  CurrentPaceResponse,
  PaceWindow,
  MarketSession,
} from '../types';
import { getProjections, getCurrentPace, getYtdSettings, setYtdSettings } from '../api';

type ProjectionModeSimple = 'sp500' | 'pace';

interface Props {
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
  onPaceData?: (data: CurrentPaceResponse) => void;
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

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

const horizonLabels: Record<string, string> = {
  '6m': '6 Months',
  '1y': '1 Year',
  '5y': '5 Years',
  '10y': '10 Years',
};

const paceHorizonLabels: Record<string, string> = {
  '1y': '1 Year',
  '2y': '2 Years',
  '5y': '5 Years',
  '10y': '10 Years',
};

const PACE_WINDOWS: { value: PaceWindow; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1M', label: '1M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'YTD', label: 'YTD' },
];

function isSP500Response(resp: ProjectionResponse): resp is SP500ProjectionResponse {
  return resp.mode === 'sp500';
}

export function Projections({ currentValue, refreshTrigger = 0, session, onPaceData }: Props) {
  const [mode, setMode] = useState<ProjectionModeSimple>('sp500');
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [paceData, setPaceData] = useState<CurrentPaceResponse | null>(null);
  const [paceWindow, setPaceWindow] = useState<PaceWindow>('1M');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // YTD settings form state
  const [showYtdForm, setShowYtdForm] = useState(false);
  const [ytdEquity, setYtdEquity] = useState('');
  const [ytdContributions, setYtdContributions] = useState('');
  const [ytdSaving, setYtdSaving] = useState(false);
  const [ytdFormError, setYtdFormError] = useState('');

  const hasData = data !== null || paceData !== null;

  const fetchData = useCallback(async () => {
    try {
      // Only show loading spinner on initial load, not background refreshes
      if (!hasData) setLoading(true);
      if (mode === 'pace') {
        const response = await getCurrentPace(paceWindow);
        setPaceData(response);
        onPaceData?.(response);
      } else {
        const response = await getProjections('sp500', '1y');
        setData(response);
      }
      setError('');
    } catch (err) {
      // On refresh errors, keep previous data instead of showing error
      if (!hasData) {
        setError(err instanceof Error ? err.message : 'Failed to fetch projections');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, paceWindow, refreshTrigger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePaceWindowChange = (w: PaceWindow) => {
    setPaceWindow(w);
  };

  const handleOpenYtdForm = async () => {
    setShowYtdForm(true);
    setYtdFormError('');
    try {
      const settings = await getYtdSettings();
      if (settings.ytdStartEquity !== null) setYtdEquity(String(settings.ytdStartEquity));
      if (settings.ytdNetContributions !== null) setYtdContributions(String(settings.ytdNetContributions));
    } catch { /* ignore - form starts empty */ }
  };

  const handleSaveYtd = async () => {
    const equity = parseFloat(ytdEquity);
    if (isNaN(equity) || equity <= 0) {
      setYtdFormError('Start equity must be a positive number.');
      return;
    }
    const contributions = ytdContributions.trim() ? parseFloat(ytdContributions) : undefined;
    if (contributions !== undefined && isNaN(contributions)) {
      setYtdFormError('Contributions must be a valid number.');
      return;
    }
    setYtdSaving(true);
    setYtdFormError('');
    try {
      await setYtdSettings({ ytdStartEquity: equity, netContributionsYTD: contributions });
      setShowYtdForm(false);
      // Refresh pace data to show updated True YTD
      if (paceWindow === 'YTD') {
        const response = await getCurrentPace('YTD');
        setPaceData(response);
        onPaceData?.(response);
      }
    } catch (err) {
      setYtdFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setYtdSaving(false);
    }
  };

  if (loading && !data && !paceData) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Projections</h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error && !data && !paceData) {
    return (
      <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Projections</h2>
        <p className="text-rh-red text-center py-8">{error}</p>
      </div>
    );
  }

  const sp500Data = data && isSP500Response(data) ? data : null;

  return (
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
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

      {/* S&P 500 Mode */}
      {mode === 'sp500' && (
        <>
          <div className="bg-white/[0.03] dark:bg-white/[0.03] rounded-lg p-3 mb-6 text-sm">
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

          <div className="mb-6">
            <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-1">Current Value</p>
            <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">{formatCurrency(data?.currentValue ?? currentValue)}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {data &&
              (['6m', '1y', '5y', '10y'] as const).map((horizon) => {
                const horizonData = data.horizons[horizon];
                const projected = horizonData?.base ?? 0;
                const gain = projected - (data.currentValue || 0);
                const gainPercent =
                  data.currentValue > 0 ? (gain / data.currentValue) * 100 : 0;

                return (
                  <div key={horizon} className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4">
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

          {sp500Data && (
            <div className="border-t border-rh-light-border dark:border-rh-border pt-4">
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                S&P 500 historical average includes dividends reinvested. Past performance does
                not guarantee future results.
              </p>
            </div>
          )}
        </>
      )}

      {/* Current Pace Mode */}
      {mode === 'pace' && (
        <>
          {/* Window selector */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-rh-light-muted dark:text-rh-muted">Window:</span>
            <div className="flex gap-1 bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-1">
              {PACE_WINDOWS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => handlePaceWindowChange(w.value)}
                  disabled={loading}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    paceWindow === w.value
                      ? 'bg-rh-light-card dark:bg-rh-card text-rh-light-text dark:text-rh-text shadow-sm'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                  } disabled:opacity-50`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            {/* YTD settings button */}
            {paceWindow === 'YTD' && (
              <button
                onClick={handleOpenYtdForm}
                className="text-xs text-rh-green hover:text-rh-green/80 ml-1"
              >
                {paceData?.trueYtdAvailable ? 'Edit YTD Settings' : 'Setup YTD'}
              </button>
            )}
          </div>

          {/* YTD Settings Form */}
          {showYtdForm && (
            <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4 mb-4 border border-rh-light-border dark:border-rh-border">
              <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-3">True YTD Settings</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-rh-light-muted dark:text-rh-muted mb-1">Net Equity on Jan 1 ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ytdEquity}
                    onChange={(e) => setYtdEquity(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-rh-light-border dark:border-rh-border bg-white/[0.04] dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-rh-light-muted dark:text-rh-muted mb-1">Net Contributions YTD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ytdContributions}
                    onChange={(e) => setYtdContributions(e.target.value)}
                    placeholder="deposits - withdrawals"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-rh-light-border dark:border-rh-border bg-white/[0.04] dark:bg-white/[0.04] text-rh-light-text dark:text-rh-text focus:outline-none focus:ring-2 focus:ring-rh-green/50"
                  />
                </div>
              </div>
              {ytdFormError && <p className="text-rh-red text-xs mb-2">{ytdFormError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveYtd}
                  disabled={ytdSaving}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rh-green text-black hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {ytdSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setShowYtdForm(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-dark transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">
                Enter your total assets minus margin debt as of Jan 1. Net contributions = deposits − withdrawals since Jan 1.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted mb-4">
              <div className="w-3 h-3 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {!loading && paceData && paceData.dataStatus !== 'ok' && (
            <div className="text-center py-8">
              <p className="text-rh-light-muted dark:text-rh-muted">
                {paceData.note || 'Not enough data for this window.'}
              </p>
              {paceData.snapshotCount > 0 && (
                <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">
                  {paceData.snapshotCount} snapshot{paceData.snapshotCount !== 1 ? 's' : ''} available
                </p>
              )}
              {paceWindow === 'YTD' && !paceData.trueYtdAvailable && (
                <button
                  onClick={handleOpenYtdForm}
                  className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-rh-green text-black hover:bg-green-600 transition-colors"
                >
                  Enter Jan 1 equity to enable True YTD
                </button>
              )}
            </div>
          )}

          {!loading && paceData && paceData.dataStatus === 'ok' && (
            <>
              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Window Return</p>
                  <p className={`text-lg font-bold ${
                    (paceData.windowReturnPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {formatPct(paceData.windowReturnPct)}
                    {paceData.estimated && (
                      <span className="text-xs font-normal text-amber-500 ml-1">Est.</span>
                    )}
                  </p>
                </div>
                <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Annualized Pace (Linear)</p>
                  <p className={`text-lg font-bold ${
                    (paceData.annualizedPacePct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
                  }`}>
                    {formatPct(paceData.annualizedPacePct)}
                    {paceData.capped && (
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted ml-1">Capped for realism</span>
                    )}
                    {paceData.estimated && !paceData.capped && (
                      <span className="text-xs font-normal text-amber-500 ml-1">Est.</span>
                    )}
                  </p>
                </div>
                <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4">
                  <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">Current Assets</p>
                  <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                    {formatCurrency(paceData.currentAssets)}
                  </p>
                </div>
              </div>

              {/* Horizon projections */}
              <div className="mb-6">
                <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-3">Projected Values (Current Pace)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['1y', '2y', '5y', '10y'] as const).map((horizon) => {
                    const proj = paceData.projections[horizon];

                    return (
                      <div key={horizon} className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-4">
                        <p className="text-rh-light-muted dark:text-rh-muted text-sm mb-2">
                          {paceHorizonLabels[horizon]}
                        </p>
                        <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">
                          {proj ? formatCurrency(proj.value) : '—'}
                        </p>
                        <p className={`text-sm ${
                          proj && proj.gainPct >= 0 ? 'text-rh-green' : 'text-rh-red'
                        }`}>
                          {proj ? `${proj.gainPct >= 0 ? '+' : ''}${proj.gainPct.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-rh-light-border dark:border-rh-border pt-4">
                <div className="flex justify-between text-sm text-rh-light-muted dark:text-rh-muted mb-2">
                  <span>
                    {paceData.snapshotCount > 0
                      ? `Using ${paceData.snapshotCount} snapshots spanning ${Math.round(paceData.daysCovered)} days.`
                      : `${Math.round(paceData.daysCovered)} days of data.`}
                  </span>
                  <span>Ref: {paceData.referenceAssets !== null ? formatCurrency(paceData.referenceAssets) : '—'}</span>
                </div>
                {paceData.note && (
                  <p className="text-xs text-amber-500 mb-1">{paceData.note}</p>
                )}
                {session === 'CLOSED' && (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-1">
                    Market closed — projections will update on next price refresh.
                  </p>
                )}
                <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                  Linear projection based on current performance pace. Not a forecast. Past performance does not guarantee future results.
                </p>
              </div>
            </>
          )}

          {!loading && !paceData && (
            <div className="text-center py-8">
              <p className="text-rh-light-muted dark:text-rh-muted">Pace projections not available</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
