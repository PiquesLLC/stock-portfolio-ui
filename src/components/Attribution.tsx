import { useState } from 'react';
import { Attribution as AttributionType, AttributionWindow } from '../types';
import { getAttribution } from '../api';

interface AttributionProps {
  initialData: AttributionType;
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

export function Attribution({ initialData }: AttributionProps) {
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

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">What Moved My Portfolio?</h3>

        {/* Window Selector */}
        <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-1">
          {(Object.keys(WINDOW_LABELS) as AttributionWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowChange(w)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                selectedWindow === w
                  ? 'bg-rh-green text-black'
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
        <p className="text-rh-light-muted dark:text-rh-muted text-center py-8">
          Add holdings to see attribution
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Contributors */}
          <div>
            <h4 className="text-sm font-medium text-rh-green mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Top Contributors
            </h4>
            {topContributors.length === 0 ? (
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">No gains this period</p>
            ) : (
              <div className="space-y-2">
                {topContributors.map((h) => (
                  <div key={h.ticker} className="flex items-center justify-between">
                    <span className="font-medium text-rh-light-text dark:text-rh-text">{h.ticker}</span>
                    <div className="text-right">
                      <span className="text-rh-green text-sm font-medium">
                        {formatCurrency(h.contributionDollar)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Detractors */}
          <div>
            <h4 className="text-sm font-medium text-rh-red mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
              Top Detractors
            </h4>
            {topDetractors.length === 0 ? (
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">No losses this period</p>
            ) : (
              <div className="space-y-2">
                {topDetractors.map((h) => (
                  <div key={h.ticker} className="flex items-center justify-between">
                    <span className="font-medium text-rh-light-text dark:text-rh-text">{h.ticker}</span>
                    <div className="text-right">
                      <span className="text-rh-red text-sm font-medium">
                        {formatCurrency(h.contributionDollar)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
