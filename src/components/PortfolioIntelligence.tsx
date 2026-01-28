import { useState } from 'react';
import {
  PortfolioIntelligenceResponse,
  IntelligenceWindow,
  ContributorEntry,
  SectorExposureEntry,
} from '../types';
import { getPortfolioIntelligence } from '../api';

interface Props {
  initialData: PortfolioIntelligenceResponse;
}

const WINDOW_LABELS: Record<IntelligenceWindow, string> = {
  '1d': 'Today',
  '5d': '5 Days',
  '1m': '1 Month',
};

function formatDollar(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function ContributorBar({ entry, maxAbsDollar, isPositive }: {
  entry: ContributorEntry;
  maxAbsDollar: number;
  isPositive: boolean;
}) {
  const barWidth = maxAbsDollar > 0 ? (Math.abs(entry.contributionDollar) / maxAbsDollar) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-14 text-sm font-mono font-medium text-rh-light-text dark:text-rh-text shrink-0">
        {entry.ticker}
      </span>
      <div className="flex-1 h-5 bg-rh-light-bg dark:bg-rh-dark rounded overflow-hidden">
        <div
          className={`h-full rounded ${isPositive ? 'bg-rh-green/70' : 'bg-red-500/70'}`}
          style={{ width: `${Math.max(barWidth, 2)}%` }}
        />
      </div>
      <span className={`w-20 text-right text-sm font-mono ${isPositive ? 'text-rh-green' : 'text-red-400'}`}>
        {formatDollar(entry.contributionDollar)}
      </span>
      <span className="w-14 text-right text-xs text-rh-light-muted dark:text-rh-muted">
        {formatPct(entry.contributionPercent)}
      </span>
    </div>
  );
}

function SectorBar({ sectors }: { sectors: SectorExposureEntry[] }) {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-gray-500',
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-6 rounded overflow-hidden mb-3">
        {sectors.map((s, i) => (
          <div
            key={s.sector}
            className={`${colors[i % colors.length]} opacity-80`}
            style={{ width: `${s.exposurePercent}%` }}
            title={`${s.sector}: ${s.exposurePercent}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {sectors.map((s, i) => (
          <div key={s.sector} className="flex items-center gap-2 text-sm">
            <div className={`w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]} opacity-80 shrink-0`} />
            <span className="text-rh-light-text dark:text-rh-text truncate">{s.sector}</span>
            <span className="ml-auto text-rh-light-muted dark:text-rh-muted">{s.exposurePercent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioIntelligence({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<IntelligenceWindow>(initialData.window);

  const handleWindowChange = async (window: IntelligenceWindow) => {
    if (window === selectedWindow) return;
    setLoading(true);
    setSelectedWindow(window);
    try {
      const newData = await getPortfolioIntelligence(window);
      setData(newData);
    } catch (err) {
      console.error('Failed to fetch intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  const { contributors, detractors, sectorExposure, beta, explanation } = data;

  const allEntries = [...contributors, ...detractors];
  const maxAbsDollar = allEntries.length > 0
    ? Math.max(...allEntries.map(e => Math.abs(e.contributionDollar)))
    : 0;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none space-y-5">
      {/* Header + window selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Portfolio Intelligence</h3>
        <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-1">
          {(Object.keys(WINDOW_LABELS) as IntelligenceWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowChange(w)}
              disabled={loading}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedWindow === w
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              } disabled:opacity-50`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {/* Explanation banner */}
      {explanation && (
        <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-4 py-3">
          <p className="text-sm text-rh-light-text dark:text-rh-text">{explanation}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
          <div className="w-3 h-3 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Contributors + Detractors side by side */}
          {(contributors.length > 0 || detractors.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contributors */}
              <div>
                <h4 className="text-sm font-medium text-rh-green mb-2">Top Contributors</h4>
                {contributors.length > 0 ? (
                  contributors.map(c => (
                    <ContributorBar key={c.ticker} entry={c} maxAbsDollar={maxAbsDollar} isPositive={true} />
                  ))
                ) : (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">No gainers this period</p>
                )}
              </div>
              {/* Detractors */}
              <div>
                <h4 className="text-sm font-medium text-red-400 mb-2">Top Detractors</h4>
                {detractors.length > 0 ? (
                  detractors.map(c => (
                    <ContributorBar key={c.ticker} entry={c} maxAbsDollar={maxAbsDollar} isPositive={false} />
                  ))
                ) : (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">No losers this period</p>
                )}
              </div>
            </div>
          )}

          {/* Sector Exposure */}
          {sectorExposure.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-3">Sector Exposure</h4>
              <SectorBar sectors={sectorExposure} />
            </div>
          )}

          {/* Beta Card */}
          {beta && (
            <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-4 py-3">
              <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">Beta vs SPY</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">Portfolio Beta</p>
                  <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                    {beta.portfolioBeta.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">Alpha (ann.)</p>
                  <p className={`text-lg font-semibold ${beta.alphaPercent >= 0 ? 'text-rh-green' : 'text-red-400'}`}>
                    {formatPct(beta.alphaPercent)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">SPY Return</p>
                  <p className={`text-lg font-semibold ${beta.spyReturnPercent >= 0 ? 'text-rh-green' : 'text-red-400'}`}>
                    {formatPct(beta.spyReturnPercent)}
                  </p>
                </div>
                {beta.betaContributionPercent !== null && (
                  <div>
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted">Market Contrib.</p>
                    <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                      {beta.betaContributionPercent.toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">{beta.dataNote}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
