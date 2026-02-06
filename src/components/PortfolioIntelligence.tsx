import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';
import { Acronym } from './Acronym';
import {
  PortfolioIntelligenceResponse,
  IntelligenceWindow,
  ContributorEntry,
  SectorExposureEntry,
} from '../types';
import { getPortfolioIntelligence } from '../api';
import { HeroInsights } from './HeroInsights';

interface Props {
  initialData: PortfolioIntelligenceResponse;
  fetchFn?: (window: IntelligenceWindow) => Promise<PortfolioIntelligenceResponse>;
  onTickerClick?: (ticker: string) => void;
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

function ContributorBar({ entry, maxAbsDollar, isPositive, onTickerClick }: {
  entry: ContributorEntry;
  maxAbsDollar: number;
  isPositive: boolean;
  onTickerClick?: (ticker: string) => void;
}) {
  const barWidth = maxAbsDollar > 0 ? (Math.abs(entry.contributionDollar) / maxAbsDollar) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <button
        className="w-14 text-sm font-mono font-medium text-rh-light-text dark:text-rh-text shrink-0 text-left hover:text-rh-green transition-colors cursor-pointer"
        onClick={() => onTickerClick?.(entry.ticker)}
      >
        {entry.ticker}
      </button>
      <div className="flex-1 h-5 bg-white/[0.02] dark:bg-white/[0.02] rounded overflow-hidden">
        <div
          className={`h-full rounded ${isPositive ? 'bg-rh-green/70' : 'bg-red-500/70'}`}
          style={{ width: `${Math.max(barWidth, 2)}%` }}
        />
      </div>
      <span className={`w-20 text-right text-sm font-mono tabular-nums ${isPositive ? 'text-rh-green' : 'text-red-400'}`}>
        {formatDollar(entry.contributionDollar)}
      </span>
      <span className={`w-14 text-right text-xs tabular-nums ${
        entry.percentReturn === null ? 'text-rh-light-muted dark:text-rh-muted' :
        isPositive ? 'text-rh-green' : 'text-red-400'
      }`}>
        {entry.percentReturn !== null ? formatPct(entry.percentReturn) : '—'}
      </span>
    </div>
  );
}

function SectorBar({ sectors }: { sectors: SectorExposureEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
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
            className={`${colors[i % colors.length]} opacity-80 cursor-pointer hover:opacity-100 transition-opacity`}
            style={{ width: `${s.exposurePercent}%` }}
            title={`${s.sector}: ${s.exposurePercent}%`}
            onClick={() => setExpanded(expanded === s.sector ? null : s.sector)}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {sectors.map((s, i) => (
          <div key={s.sector}>
            <button
              onClick={() => setExpanded(expanded === s.sector ? null : s.sector)}
              className="flex items-center gap-2 text-sm w-full hover:bg-white/[0.04] dark:hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
            >
              <div className={`w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]} opacity-80 shrink-0`} />
              <span className="text-rh-light-text dark:text-rh-text truncate">{s.sector}</span>
              <span className="ml-auto text-rh-light-muted dark:text-rh-muted whitespace-nowrap tabular-nums">
                {s.exposurePercent}%
                <span className="ml-1 text-[10px] opacity-60">{expanded === s.sector ? '▲' : '▼'}</span>
              </span>
            </button>
            {expanded === s.sector && s.tickers && (
              <div className="ml-5 mt-1 mb-2 space-y-0.5">
                {s.tickers.map(t => (
                  <div key={t.ticker} className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
                    <span className="font-medium text-rh-light-text dark:text-rh-text">{t.ticker}</span>
                    <span className="ml-auto whitespace-nowrap">
                      ${t.valueDollar.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      <span className="ml-1.5 opacity-70">({t.valuePercent}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioIntelligence({ initialData, fetchFn, onTickerClick }: Props) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<IntelligenceWindow>(initialData.window);

  const handleWindowChange = async (window: IntelligenceWindow) => {
    if (window === selectedWindow) return;
    setLoading(true);
    setSelectedWindow(window);
    try {
      const fetcher = fetchFn || getPortfolioIntelligence;
      const newData = await fetcher(window);
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
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5 shadow-sm dark:shadow-none space-y-4">
      {/* Header + window selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">Portfolio Intelligence <InfoTooltip text="Shows top contributors/detractors by dollar P&L, sector exposure by market value, and portfolio beta vs SPY (covariance of daily returns divided by SPY variance)." /></h3>
        <div className="flex gap-1 bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-1">
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

      {/* Explanation banner — bold tickers and dollar values */}
      {explanation && (
        <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg px-4 py-3">
          <p className="text-sm text-rh-light-text dark:text-rh-text">
            {explanation.split(/(\$[\d,.]+|\b[A-Z]{2,5}\b)/g).map((part, i) => {
              if (/^\$[\d,.]+$/.test(part) || /^[A-Z]{2,5}$/.test(part)) {
                return <span key={i} className="font-semibold">{part}</span>;
              }
              return part;
            })}
          </p>
        </div>
      )}

      {/* Hero insight stats */}
      {data.heroStats && <HeroInsights data={data.heroStats} />}

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
                    <ContributorBar key={c.ticker} entry={c} maxAbsDollar={maxAbsDollar} isPositive={true} onTickerClick={onTickerClick} />
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
                    <ContributorBar key={c.ticker} entry={c} maxAbsDollar={maxAbsDollar} isPositive={false} onTickerClick={onTickerClick} />
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
            <div className="bg-white/[0.02] dark:bg-white/[0.02] rounded-lg px-4 py-3">
              <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2"><Acronym label="Beta" /> vs <Acronym label="SPY" /></h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">Portfolio <Acronym label="Beta" /></p>
                  <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                    {beta.portfolioBeta.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted"><Acronym label="Alpha (ann.)" /></p>
                  <p className={`text-lg font-semibold ${beta.alphaPercent >= 0 ? 'text-rh-green' : 'text-red-400'}`}>
                    {formatPct(beta.alphaPercent)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted"><Acronym label="SPY" /> Return</p>
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
