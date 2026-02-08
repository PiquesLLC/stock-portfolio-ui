import { useState, useMemo, useCallback } from 'react';
import { Holding } from '../types';

interface WhatIfSimulatorProps {
  holdings: Holding[];
  cashBalance: number;
  totalValue: number;
}

// Per-holding: track the simulated price change %
interface SimEntry {
  ticker: string;
  shares: number;
  currentPrice: number;
  marketValue: number; // shares * currentPrice
  changePct: number;   // -50 to +100 etc, starts at 0
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function WhatIfSimulator({ holdings, cashBalance, totalValue }: WhatIfSimulatorProps) {
  const [showHelp, setShowHelp] = useState(false);

  // Price change % per holding — keyed by ticker
  const [changes, setChanges] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    holdings.forEach((h) => { map[h.ticker] = 0; });
    return map;
  });

  // Build sim entries from holdings + changes
  const simEntries: SimEntry[] = useMemo(() =>
    holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      currentPrice: h.currentPrice,
      marketValue: h.shares * h.currentPrice,
      changePct: changes[h.ticker] ?? 0,
    })),
    [holdings, changes]
  );

  // Totals
  const simTotalHoldingsValue = useMemo(
    () => simEntries.reduce((s, e) => s + e.marketValue * (1 + e.changePct / 100), 0),
    [simEntries]
  );

  const simTotalValue = simTotalHoldingsValue + cashBalance;
  const deltaValue = simTotalValue - totalValue;
  const deltaPct = totalValue > 0 ? (deltaValue / totalValue) * 100 : 0;

  const hasChanges = useMemo(
    () => Object.values(changes).some((v) => v !== 0),
    [changes]
  );

  const changedCount = useMemo(
    () => Object.values(changes).filter((v) => v !== 0).length,
    [changes]
  );

  // Update a single ticker's price change %
  const updateChange = useCallback((ticker: string, pct: number) => {
    setChanges((prev) => ({ ...prev, [ticker]: pct }));
  }, []);

  // Reset all to 0
  const handleReset = useCallback(() => {
    setChanges((prev) => {
      const next: Record<string, number> = {};
      Object.keys(prev).forEach((k) => { next[k] = 0; });
      return next;
    });
  }, []);

  // Render one holding row
  const renderRow = (entry: SimEntry) => {
    const { ticker, shares, currentPrice, marketValue, changePct } = entry;
    const isChanged = changePct !== 0;
    const isUp = changePct > 0;
    const isDown = changePct < 0;

    const simPrice = currentPrice * (1 + changePct / 100);
    const simValue = shares * simPrice;

    const accentClass = isDown
      ? 'accent-red-500'
      : isUp
        ? 'accent-rh-green'
        : 'accent-gray-400';

    return (
      <div
        key={ticker}
        className={`rounded-xl px-4 py-3 transition-colors duration-200 ${
          isChanged
            ? 'bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06]'
            : 'bg-gray-50/30 dark:bg-white/[0.01] border border-transparent'
        }`}
      >
        {/* Top row: ticker + shares | value display */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
              {ticker}
            </span>
            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
              {shares % 1 === 0 ? shares : shares.toFixed(2)} shares
            </span>
          </div>
          {isChanged ? (
            <div className="flex items-center gap-1.5 tabular-nums">
              {isUp ? (
                <>
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted line-through">
                    {formatCurrency(marketValue)}
                  </span>
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">→</span>
                  <span className="text-xs font-semibold text-rh-green">
                    {formatCurrency(simValue)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-rh-red">
                    {formatCurrency(simValue)}
                  </span>
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">←</span>
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted line-through">
                    {formatCurrency(marketValue)}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-rh-light-muted dark:text-rh-muted tabular-nums">
              {formatCurrency(marketValue)}
            </span>
          )}
        </div>

        {/* Price change slider: -50% to +100%, centered at 0% */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted w-10 text-right shrink-0 tabular-nums">
            −50%
          </span>
          <div className="flex-1 relative">
            <input
              type="range"
              min={-50}
              max={100}
              step={1}
              value={changePct}
              onChange={(e) => updateChange(ticker, parseFloat(e.target.value))}
              onDoubleClick={() => updateChange(ticker, 0)}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-white/10 ${accentClass}`}
            />
            {/* Floating % label that follows the thumb */}
            {isChanged && (
              <div
                className="absolute -bottom-4 pointer-events-none"
                style={{
                  // Map changePct from [-50, 100] to [0%, 100%] of track width
                  left: `${((changePct - (-50)) / (100 - (-50))) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${isUp ? 'text-rh-green' : 'text-rh-red'}`}>
                  {changePct > 0 ? '+' : ''}{changePct}%
                </span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-rh-light-muted dark:text-rh-muted w-10 shrink-0 tabular-nums">
            +100%
          </span>
        </div>

        {/* Spacer for floating label */}
        {isChanged && <div className="h-3" />}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
            Scenario Explorer
          </h2>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
              showHelp
                ? 'bg-rh-green text-black'
                : 'bg-gray-200 dark:bg-white/10 text-rh-light-muted dark:text-rh-muted hover:bg-gray-300 dark:hover:bg-white/20'
            }`}
          >
            ?
          </button>
        </div>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
          Simulate stock price changes and see how they affect your portfolio
        </p>

        {/* Help panel */}
        {showHelp && (
          <div className="mt-3 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.02] p-4 text-xs text-rh-light-muted dark:text-rh-muted space-y-2">
            <p className="font-medium text-rh-light-text dark:text-rh-text">How it works</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>Each slider simulates a <strong>price change</strong> for that stock (−50% to +100%).</li>
              <li>All sliders start at <strong>0% (center)</strong> — meaning no change from the current price.</li>
              <li>Slide left to simulate the stock dropping, right to simulate it rising.</li>
              <li>The impact summary at the top shows how all changes combined affect your total portfolio value.</li>
              <li>Your share counts stay the same — only prices are simulated.</li>
              <li>Nothing is saved — this is a sandbox for exploring scenarios.</li>
            </ul>
          </div>
        )}
      </div>

      <div>
        {/* Impact Summary — sticky */}
        <div className={`sticky top-0 z-10 rounded-xl p-4 mb-5 border transition-colors duration-200 backdrop-blur-sm ${
          hasChanges
            ? deltaValue >= 0
              ? 'border-rh-green/30 dark:border-rh-green/20 bg-green-50/95 dark:bg-[#0a1a0a]/95'
              : 'border-red-300/30 dark:border-red-500/20 bg-red-50/95 dark:bg-[#1a0a0a]/95'
            : 'border-gray-200/60 dark:border-white/[0.06] bg-gray-50/95 dark:bg-[#1a1a1a]/95'
        }`}>
          {/* Portfolio value before -> after */}
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
            <span className="text-xl font-bold text-rh-light-text dark:text-rh-text">
              {formatCurrency(totalValue)}
            </span>
            {hasChanges && (
              <>
                <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span className="text-xl font-bold text-rh-light-text dark:text-rh-text">
                  {formatCurrency(simTotalValue)}
                </span>
                <span className={`text-sm font-semibold ${
                  deltaValue >= 0 ? 'text-rh-green' : 'text-rh-red'
                }`}>
                  {deltaValue >= 0 ? '+' : ''}{formatCurrency(deltaValue)}
                  {' '}({deltaValue >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                </span>
              </>
            )}
          </div>

          {/* Position count + reset */}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-rh-light-muted dark:text-rh-muted">
              {holdings.length} positions &middot; Cash {formatCurrency(cashBalance)} held constant
            </div>
            {hasChanges && (
              <button
                onClick={handleReset}
                className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Holdings list */}
        <div className="mb-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
            Holdings ({simEntries.length})
            {changedCount > 0 && (
              <span className="text-rh-green ml-2">{changedCount} adjusted</span>
            )}
          </h3>
          <div className="space-y-2">
            {simEntries.map((entry) => renderRow(entry))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/60 text-center pt-2">
        Share counts held constant &middot; Only stock prices are simulated
      </div>
    </div>
  );
}
