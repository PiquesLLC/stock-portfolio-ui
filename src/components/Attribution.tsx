import { useState } from 'react';
import { Attribution as AttributionType, AttributionWindow } from '../types';
import { getAttribution } from '../api';
import { InfoTooltip } from './InfoTooltip';

interface AttributionProps {
  initialData: AttributionType;
  onTickerClick?: (ticker: string) => void;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-rh-light-border dark:border-rh-border rounded-lg p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">What Moved My Portfolio? <InfoTooltip text="Attribution shows which holdings contributed most to your portfolio's gain or loss. Contribution = holding's dollar P&L over the selected window, ranked by absolute impact." /></h3>

        {/* Window Selector */}
        <div className="flex gap-1 bg-white/[0.02] dark:bg-white/[0.02] rounded-lg p-1">
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
      )}
    </div>
  );
}
