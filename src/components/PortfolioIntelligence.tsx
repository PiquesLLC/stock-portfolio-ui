import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';
import { Acronym } from './Acronym';
import {
  MarketSession,
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
  session?: MarketSession;
}

/* ─── Portfolio Pulse (merged from Attribution) ─── */

interface WaterfallEntry {
  ticker: string;
  contributionDollar: number;
  contributionPct: number;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PulseSummary({ topContributors, topDetractors, winnersCount, losersCount, onTickerClick }: {
  topContributors: WaterfallEntry[];
  topDetractors: WaterfallEntry[];
  winnersCount: number;
  losersCount: number;
  onTickerClick?: (ticker: string) => void;
}) {
  const allEntries = [...topContributors, ...topDetractors];
  if (allEntries.length === 0) return null;

  const totalGains = topContributors.reduce((s, e) => s + e.contributionDollar, 0);
  const totalLosses = topDetractors.reduce((s, e) => s + Math.abs(e.contributionDollar), 0);
  const winCount = winnersCount;
  const lossCount = losersCount;
  const totalCount = winCount + lossCount;

  const biggestMover = allEntries.reduce((best, e) =>
    Math.abs(e.contributionDollar) > Math.abs(best.contributionDollar) ? e : best
  , allEntries[0]);

  const totalAbsMovement = allEntries.reduce((s, e) => s + Math.abs(e.contributionDollar), 0);
  const topConcentration = totalAbsMovement > 0
    ? (Math.abs(biggestMover.contributionDollar) / totalAbsMovement) * 100
    : 0;

  const gainsWidth = totalAbsMovement > 0 ? (totalGains / totalAbsMovement) * 100 : 50;

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-rh-green font-medium">Gains {formatCurrency(totalGains)}</span>
          <span className="text-rh-red font-medium">Losses {formatCurrency(-totalLosses)}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex bg-gray-100 dark:bg-white/[0.04]">
          <div className="h-full bg-rh-green/60 rounded-l-full transition-all duration-500" style={{ width: `${gainsWidth}%` }} />
          <div className="h-full bg-rh-red/50 rounded-r-full transition-all duration-500" style={{ width: `${100 - gainsWidth}%` }} />
        </div>
      </div>

      <h4 className="text-xs font-medium uppercase tracking-wider text-rh-light-muted dark:text-white/40 mb-3">
        Portfolio Pulse
      </h4>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">Win Rate</div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text tabular-nums">
            {totalCount > 0 ? Math.round((winCount / totalCount) * 100) : 0}%
          </div>
          <div className="text-[10px] text-rh-light-muted/50 dark:text-white/25 mt-0.5">{winCount} up / {lossCount} down</div>
        </div>
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">Biggest Mover</div>
          <button className={`text-lg font-bold hover:opacity-80 transition-opacity ${biggestMover.contributionDollar >= 0 ? 'text-rh-green' : 'text-rh-red'}`}
            onClick={() => onTickerClick?.(biggestMover.ticker)}>
            {biggestMover.ticker}
          </button>
          <div className={`text-[10px] mt-0.5 tabular-nums ${biggestMover.contributionDollar >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
            {formatCurrency(biggestMover.contributionDollar)}
          </div>
        </div>
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">Top Concentration</div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text tabular-nums">{topConcentration.toFixed(0)}%</div>
          <div className="text-[10px] text-rh-light-muted/50 dark:text-white/25 mt-0.5">of total movement</div>
        </div>
      </div>

    </div>
  );
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
      <div className="flex-1 h-5 bg-gray-50/40 dark:bg-white/[0.02] rounded overflow-hidden">
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

function SectorBar({ sectors, onTickerClick }: { sectors: SectorExposureEntry[]; onTickerClick?: (ticker: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (sector: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(sector) ? next.delete(sector) : next.add(sector);
    return next;
  });
  const colorConfig = [
    { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-400', chip: 'bg-blue-500/[0.08] border-blue-400/20' },
    { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-400', chip: 'bg-emerald-500/[0.08] border-emerald-400/20' },
    { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-400', chip: 'bg-amber-500/[0.08] border-amber-400/20' },
    { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-400', chip: 'bg-purple-500/[0.08] border-purple-400/20' },
    { bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-400', chip: 'bg-rose-500/[0.08] border-rose-400/20' },
    { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-400', chip: 'bg-cyan-500/[0.08] border-cyan-400/20' },
    { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-400', chip: 'bg-orange-500/[0.08] border-orange-400/20' },
    { bg: 'bg-gray-500', border: 'border-gray-500', text: 'text-gray-400', chip: 'bg-gray-500/[0.08] border-gray-400/20' },
  ];

  return (
    <div>
      {/* Segmented bar with gaps */}
      <div className="flex h-7 gap-1 mb-4">
        {sectors.map((s, i) => {
          const c = colorConfig[i % colorConfig.length];
          const isActive = expanded.has(s.sector);
          return (
            <div
              key={s.sector}
              className={`${c.bg} rounded-md cursor-pointer transition-all duration-200 ${
                isActive ? 'opacity-100 ring-2 ring-white/20 scale-y-110' : 'opacity-70 hover:opacity-90'
              }`}
              style={{ width: `${s.exposurePercent}%`, minWidth: s.exposurePercent > 0 ? '4px' : '0' }}
              title={`${s.sector}: ${s.exposurePercent}%`}
              onClick={() => toggle(s.sector)}
            />
          );
        })}
      </div>
      {/* Card-style legend */}
      <div className="grid grid-cols-2 gap-2">
        {sectors.map((s, i) => {
          const c = colorConfig[i % colorConfig.length];
          const isActive = expanded.has(s.sector);
          return (
            <div key={s.sector}>
              <button
                onClick={() => toggle(s.sector)}
                className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 transition-all duration-200 border-l-[3px] ${c.border} ${
                  isActive
                    ? 'bg-gray-100/80 dark:bg-white/[0.06]'
                    : 'bg-gray-50/40 dark:bg-white/[0.02] hover:bg-gray-100/60 dark:hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex-1 min-w-0 text-left">
                  <span className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate block">{s.sector}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${c.text}`}>{s.exposurePercent}%</span>
                <svg className={`w-3 h-3 text-rh-light-muted dark:text-rh-muted transition-transform duration-200 shrink-0 ${isActive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isActive && s.tickers && (
                <div className="flex flex-wrap gap-2 mt-2.5 mb-1 ml-3">
                  {s.tickers.map(t => (
                    <button
                      key={t.ticker}
                      onClick={() => onTickerClick?.(t.ticker)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.chip} hover:border-rh-green/40 hover:bg-rh-green/[0.06] transition-all group`}
                    >
                      <span className={`text-xs font-bold group-hover:text-rh-green transition-colors ${c.text}`}>{t.ticker}</span>
                      <span className="text-[11px] font-medium text-rh-light-text/70 dark:text-rh-text/70 tabular-nums">{t.valuePercent}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PortfolioIntelligence({ initialData, fetchFn, onTickerClick, session }: Props) {
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

  // Compute net P&L from contributors + detractors
  const netPnL = contributors.reduce((s, e) => s + e.contributionDollar, 0) +
    detractors.reduce((s, e) => s + e.contributionDollar, 0);

  // Split explanation into headline + detail (split on first period)
  const explanationParts = explanation ? explanation.split(/\.\s+/) : [];
  const headline = explanationParts[0] || '';
  const detail = explanationParts.slice(1).join('. ');

  function renderRichText(text: string) {
    // Capture sign+dollar together: (+$3,688) or (-$1,903)
    return text.split(/([+-]\$[\d,.]+|\b[A-Z]{2,5}\b)/g).map((part, i) => {
      if (/^[+-]\$[\d,.]+$/.test(part)) {
        const isNeg = part.startsWith('-');
        return <span key={i} className={isNeg ? 'text-rh-red' : 'text-rh-green'}>{part}</span>;
      }
      if (/^[A-Z]{2,5}$/.test(part)) {
        return <button key={i} className="font-bold hover:text-rh-green transition-colors" onClick={() => onTickerClick?.(part)}>{part}</button>;
      }
      return part;
    });
  }

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5 shadow-sm dark:shadow-none space-y-4">
      {/* Header + net P&L + window selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">Portfolio Intelligence <InfoTooltip text="A breakdown of what's driving your portfolio today — top winners, losers, and sector allocation." /></h3>
          {session && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              session === 'REG'
                ? 'bg-rh-green/10 text-rh-green border border-rh-green/20'
                : session === 'PRE' || session === 'POST'
                  ? 'bg-amber-400/10 text-amber-500 dark:text-amber-400 border border-amber-400/20'
                  : 'bg-gray-200/40 dark:bg-white/[0.06] text-rh-light-muted dark:text-rh-muted border border-gray-200/40 dark:border-white/[0.06]'
            }`}>
              {session === 'REG' && <span className="w-1.5 h-1.5 rounded-full bg-rh-green animate-pulse" />}
              {session === 'REG' ? 'Live' : session === 'PRE' ? 'Pre-Market' : session === 'POST' ? 'After Hours' : 'Closed'}
            </span>
          )}
          {allEntries.length > 0 && (
            <span className={`text-lg font-bold tabular-nums ${netPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              {formatDollar(netPnL)} <span className="text-xs font-normal text-rh-light-muted dark:text-rh-muted">{WINDOW_LABELS[selectedWindow].toLowerCase()}</span>
            </span>
          )}
        </div>
        <div className="flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1">
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

      {/* Headline insight — punchy first line + muted detail */}
      {headline && (
        <div>
          <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
            {renderRichText(headline)}{detail ? '.' : ''}
          </p>
          {detail && (
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
              {renderRichText(detail)}
            </p>
          )}
        </div>
      )}

      {/* Hero insight stats */}
      {data.heroStats && <HeroInsights data={data.heroStats} window={selectedWindow} onTickerClick={onTickerClick} />}

      {/* Portfolio Pulse (summary stats + gains/losses bar) */}
      {(contributors.length > 0 || detractors.length > 0) && (
        <PulseSummary
          topContributors={contributors.map(c => ({
            ticker: c.ticker,
            contributionDollar: c.contributionDollar,
            contributionPct: c.percentReturn ?? 0,
          }))}
          topDetractors={detractors.map(c => ({
            ticker: c.ticker,
            contributionDollar: c.contributionDollar,
            contributionPct: c.percentReturn ?? 0,
          }))}
          winnersCount={data.winnersCount ?? contributors.length}
          losersCount={data.losersCount ?? detractors.length}
          onTickerClick={onTickerClick}
        />
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
              <SectorBar sectors={sectorExposure} onTickerClick={onTickerClick} />
            </div>
          )}

          {/* Beta Card */}
          {beta && (
            <div className="bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3">
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
