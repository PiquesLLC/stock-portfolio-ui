import { useState } from 'react';
import { Attribution as AttributionType, AttributionWindow } from '../types';
import { getAttribution } from '../api';
import { InfoTooltip } from './InfoTooltip';

interface AttributionProps {
  initialData: AttributionType;
  onTickerClick?: (ticker: string) => void;
}

interface WaterfallEntry {
  ticker: string;
  contributionDollar: number;
  contributionPct: number;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Portfolio Pulse Summary ----

interface PulseSummaryProps {
  topContributors: WaterfallEntry[];
  topDetractors: WaterfallEntry[];
  winnersCount: number;
  losersCount: number;
  onTickerClick?: (ticker: string) => void;
}

function PulseSummary({ topContributors, topDetractors, winnersCount, losersCount, onTickerClick }: PulseSummaryProps) {
  const allEntries = [...topContributors, ...topDetractors];
  if (allEntries.length === 0) return null;

  const totalGains = topContributors.reduce((s, e) => s + e.contributionDollar, 0);
  const totalLosses = topDetractors.reduce((s, e) => s + Math.abs(e.contributionDollar), 0);
  const netPnL = totalGains - totalLosses;
  const winCount = winnersCount;
  const lossCount = losersCount;
  const totalCount = winCount + lossCount;

  // Biggest single mover (by absolute value)
  const biggestMover = allEntries.reduce((best, e) =>
    Math.abs(e.contributionDollar) > Math.abs(best.contributionDollar) ? e : best
  , allEntries[0]);

  // Concentration: what % of total absolute movement came from top holding
  const totalAbsMovement = allEntries.reduce((s, e) => s + Math.abs(e.contributionDollar), 0);
  const topConcentration = totalAbsMovement > 0
    ? (Math.abs(biggestMover.contributionDollar) / totalAbsMovement) * 100
    : 0;

  // Gains vs losses bar width
  const gainsWidth = totalAbsMovement > 0 ? (totalGains / totalAbsMovement) * 100 : 50;

  return (
    <div className="mb-5 pb-4 border-b border-gray-200/60 dark:border-white/[0.06]">
      <h4 className="text-xs font-medium uppercase tracking-wider text-rh-light-muted dark:text-white/40 mb-3">
        Portfolio Pulse
      </h4>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Net P&L */}
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">
            Net P&L
          </div>
          <div className={`text-lg font-bold tabular-nums ${netPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
            {formatCurrency(netPnL)}
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">
            Win Rate
          </div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text tabular-nums">
            {totalCount > 0 ? Math.round((winCount / totalCount) * 100) : 0}%
          </div>
          <div className="text-[10px] text-rh-light-muted/50 dark:text-white/25 mt-0.5">
            {winCount} up / {lossCount} down
          </div>
        </div>

        {/* Biggest Mover */}
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">
            Biggest Mover
          </div>
          <button
            className={`text-lg font-bold hover:opacity-80 transition-opacity ${
              biggestMover.contributionDollar >= 0 ? 'text-rh-green' : 'text-rh-red'
            }`}
            onClick={() => onTickerClick?.(biggestMover.ticker)}
          >
            {biggestMover.ticker}
          </button>
          <div className={`text-[10px] mt-0.5 tabular-nums ${
            biggestMover.contributionDollar >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'
          }`}>
            {formatCurrency(biggestMover.contributionDollar)}
          </div>
        </div>

        {/* Concentration */}
        <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-lg p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-white/30 mb-1">
            Top Concentration
          </div>
          <div className="text-lg font-bold text-rh-light-text dark:text-rh-text tabular-nums">
            {topConcentration.toFixed(0)}%
          </div>
          <div className="text-[10px] text-rh-light-muted/50 dark:text-white/25 mt-0.5">
            of total movement
          </div>
        </div>
      </div>

      {/* Gains vs Losses bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-rh-green font-medium">Gains {formatCurrency(totalGains)}</span>
          <span className="text-rh-red font-medium">Losses {formatCurrency(-totalLosses)}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex bg-gray-100 dark:bg-white/[0.04]">
          <div
            className="h-full bg-rh-green/60 rounded-l-full transition-all duration-500"
            style={{ width: `${gainsWidth}%` }}
          />
          <div
            className="h-full bg-rh-red/50 rounded-r-full transition-all duration-500"
            style={{ width: `${100 - gainsWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const WINDOW_LABELS: Record<AttributionWindow, string> = {
  '1d': 'Today',
  '5d': '5 Days',
  '1m': '1 Month',
};

export function Attribution({ initialData, onTickerClick }: AttributionProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<AttributionWindow>(initialData.window);

  const handleWindowChange = async (window: AttributionWindow) => {
    if (window === selectedWindow) return;

    setLoading(true);
    setSelectedWindow(window);

    try {
      const newData = await getAttribution(window);
      setData(newData);
    } catch (err) {
      console.error('Failed to fetch attribution:', err);
    } finally {
      setLoading(false);
    }
  };

  const { topContributors, topDetractors, partial } = data;

  const allEntries = [...topContributors, ...topDetractors];
  const maxAbsDollar = allEntries.length > 0
    ? Math.max(...allEntries.map(e => Math.abs(e.contributionDollar)))
    : 0;

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">What Moved My Portfolio? <InfoTooltip text="Attribution shows which holdings contributed most to your portfolio's gain or loss. Contribution = holding's dollar P&L over the selected window, ranked by absolute impact." /></h3>

        {/* Window Selector */}
        <div className="flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1">
          {(Object.keys(WINDOW_LABELS) as AttributionWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowChange(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedWindow === w
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
            <div className="w-3 h-3 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin"></div>
            <span>Loading...</span>
          </div>
        </div>
      )}
      {partial && topContributors.length === 0 && topDetractors.length === 0 ? (
        <p className="text-sm text-rh-light-muted/60 dark:text-rh-muted/60 italic">
          Add holdings to see what's driving your returns.
        </p>
      ) : (
        <>
          {/* Portfolio Pulse Summary */}
          <PulseSummary
            topContributors={topContributors}
            topDetractors={topDetractors}
            winnersCount={data.winnersCount ?? topContributors.length}
            losersCount={data.losersCount ?? topDetractors.length}
            onTickerClick={onTickerClick}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Contributors */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-rh-green/80 mb-2">Contributors</h4>
              {topContributors.length === 0 ? (
                <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 italic">No gains this period</p>
              ) : (
                <div className="space-y-1.5">
                  {topContributors.map((h) => {
                    const barWidth = maxAbsDollar > 0 ? (Math.abs(h.contributionDollar) / maxAbsDollar) * 100 : 0;
                    return (
                      <div key={h.ticker} className="flex items-center gap-2">
                        <button className="w-12 text-sm font-medium text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors cursor-pointer text-left shrink-0" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</button>
                        <div className="flex-1 h-3 bg-rh-light-bg dark:bg-rh-dark rounded-sm overflow-hidden">
                          <div className="h-full bg-rh-green/50 rounded-sm" style={{ width: `${Math.max(barWidth, 3)}%` }} />
                        </div>
                        <span className="text-rh-green text-xs font-medium w-16 text-right shrink-0 tabular-nums">{formatCurrency(h.contributionDollar)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Detractors */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-rh-red/80 mb-2">Detractors</h4>
              {topDetractors.length === 0 ? (
                <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 italic">No losses this period</p>
              ) : (
                <div className="space-y-1.5">
                  {topDetractors.map((h) => {
                    const barWidth = maxAbsDollar > 0 ? (Math.abs(h.contributionDollar) / maxAbsDollar) * 100 : 0;
                    return (
                      <div key={h.ticker} className="flex items-center gap-2">
                        <button className="w-12 text-sm font-medium text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors cursor-pointer text-left shrink-0" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</button>
                        <div className="flex-1 h-3 bg-rh-light-bg dark:bg-rh-dark rounded-sm overflow-hidden">
                          <div className="h-full bg-rh-red/40 rounded-sm" style={{ width: `${Math.max(barWidth, 3)}%` }} />
                        </div>
                        <span className="text-rh-red text-xs font-medium w-16 text-right shrink-0 tabular-nums">{formatCurrency(h.contributionDollar)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
