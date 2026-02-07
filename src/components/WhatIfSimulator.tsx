import { useState, useEffect, useMemo, useCallback } from 'react';
import { Holding } from '../types';

interface WhatIfSimulatorProps {
  holdings: Holding[];
  cashBalance: number;
  totalValue: number;
  onClose: () => void;
}

interface SimulatedHolding {
  ticker: string;
  currentShares: number;
  simShares: number;
  currentPrice: number;
  averageCost: number;
  isNew: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function WhatIfSimulator({ holdings, cashBalance, totalValue, onClose }: WhatIfSimulatorProps) {
  // --- Escape key ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // --- Simulated holdings state ---
  const [simHoldings, setSimHoldings] = useState<SimulatedHolding[]>(() =>
    holdings.map((h) => ({
      ticker: h.ticker,
      currentShares: h.shares,
      simShares: h.shares,
      currentPrice: h.currentPrice,
      averageCost: h.averageCost,
      isNew: false,
    }))
  );

  // --- Add new ticker state ---
  const [newTicker, setNewTicker] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [addError, setAddError] = useState('');

  // --- Current totals ---
  const currentTotalValue = totalValue; // includes cash

  // --- Simulated totals ---
  const simTotals = useMemo(() => {
    const simHoldingsValue = simHoldings.reduce(
      (sum, h) => sum + h.simShares * h.currentPrice,
      0
    );
    const simTotalValue = simHoldingsValue + cashBalance;
    const deltaValue = simTotalValue - currentTotalValue;
    const positions = simHoldings.filter((h) => h.simShares > 0).length;
    const currentPositions = holdings.length;

    // Per-holding allocations
    const allocations = simHoldings.map((h) => {
      const simValue = h.simShares * h.currentPrice;
      const currentValue = h.currentShares * h.currentPrice;
      const simAlloc = simTotalValue > 0 ? (simValue / simTotalValue) * 100 : 0;
      const currentAlloc = currentTotalValue > 0 ? (currentValue / currentTotalValue) * 100 : 0;
      return {
        ticker: h.ticker,
        currentValue,
        simValue,
        currentAlloc,
        simAlloc,
        deltaShares: h.simShares - h.currentShares,
        isNew: h.isNew,
        simShares: h.simShares,
        currentShares: h.currentShares,
        currentPrice: h.currentPrice,
      };
    });

    // Top holding
    const sorted = [...allocations].sort((a, b) => b.simAlloc - a.simAlloc);
    const topHolding = sorted[0] || null;
    const currentSorted = [...allocations].sort((a, b) => b.currentAlloc - a.currentAlloc);
    const currentTopHolding = currentSorted[0] || null;

    return {
      simHoldingsValue,
      simTotalValue,
      deltaValue,
      positions,
      currentPositions,
      allocations,
      topHolding,
      currentTopHolding,
    };
  }, [simHoldings, cashBalance, currentTotalValue, holdings]);

  // --- Handlers ---
  const updateShares = useCallback((ticker: string, newShareCount: number) => {
    setSimHoldings((prev) =>
      prev.map((h) =>
        h.ticker === ticker
          ? { ...h, simShares: Math.max(0, newShareCount) }
          : h
      )
    );
  }, []);

  const handleShareInput = useCallback((ticker: string, rawValue: string) => {
    // Allow empty field for editing convenience
    if (rawValue === '') {
      updateShares(ticker, 0);
      return;
    }
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed)) {
      updateShares(ticker, parsed);
    }
  }, [updateShares]);

  const handleAddTicker = useCallback(() => {
    setAddError('');
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) {
      setAddError('Enter a ticker symbol');
      return;
    }
    if (simHoldings.some((h) => h.ticker.toUpperCase() === ticker)) {
      setAddError(`${ticker} is already in the list`);
      return;
    }
    const shares = parseFloat(newShares);
    if (!shares || shares <= 0) {
      setAddError('Enter a valid share count');
      return;
    }
    const price = parseFloat(newPrice);
    if (!price || price <= 0) {
      setAddError('Enter an estimated price');
      return;
    }

    setSimHoldings((prev) => [
      ...prev,
      {
        ticker,
        currentShares: 0,
        simShares: shares,
        currentPrice: price,
        averageCost: price,
        isNew: true,
      },
    ]);
    setNewTicker('');
    setNewShares('');
    setNewPrice('');
  }, [newTicker, newShares, newPrice, simHoldings]);

  const handleReset = useCallback(() => {
    setSimHoldings(
      holdings.map((h) => ({
        ticker: h.ticker,
        currentShares: h.shares,
        simShares: h.shares,
        currentPrice: h.currentPrice,
        averageCost: h.averageCost,
        isNew: false,
      }))
    );
  }, [holdings]);

  const removeNewTicker = useCallback((ticker: string) => {
    setSimHoldings((prev) => prev.filter((h) => h.ticker !== ticker));
  }, []);

  // Check if anything has changed from current state
  const hasChanges = useMemo(() => {
    if (simHoldings.length !== holdings.length) return true;
    return simHoldings.some((sh) => {
      const orig = holdings.find((h) => h.ticker === sh.ticker);
      if (!orig) return true; // new ticker
      return sh.simShares !== orig.shares;
    });
  }, [simHoldings, holdings]);

  // Find the max allocation for bar scaling
  const maxAlloc = useMemo(() => {
    let m = 0;
    for (const a of simTotals.allocations) {
      if (a.currentAlloc > m) m = a.currentAlloc;
      if (a.simAlloc > m) m = a.simAlloc;
    }
    return Math.max(m, 1);
  }, [simTotals.allocations]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative bg-white dark:bg-rh-card rounded-[18px] p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto
          [box-shadow:0_4px_24px_rgba(0,0,0,0.08),0_12px_48px_rgba(0,0,0,0.06)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rh-green/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
                What-If Simulator
              </h2>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                Adjust shares to see projected impact
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary Section */}
        <div className={`rounded-xl p-4 mb-5 border transition-colors duration-200 ${
          hasChanges
            ? 'bg-rh-green/[0.04] border-rh-green/20 dark:bg-rh-green/[0.04] dark:border-rh-green/20'
            : 'bg-gray-50 dark:bg-white/[0.02] border-gray-200/50 dark:border-white/[0.06]'
        }`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Portfolio Value */}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
                Portfolio Value
              </div>
              <div className="text-sm text-rh-light-text dark:text-rh-text">
                <span className="text-rh-light-muted dark:text-rh-muted">{formatCurrency(currentTotalValue)}</span>
                {hasChanges && (
                  <>
                    <span className="text-rh-light-muted dark:text-rh-muted mx-1.5">&rarr;</span>
                    <span className="font-bold">{formatCurrency(simTotals.simTotalValue)}</span>
                    <span className={`ml-1.5 text-xs font-medium ${
                      simTotals.deltaValue >= 0 ? 'text-rh-green' : 'text-rh-red'
                    }`}>
                      {simTotals.deltaValue >= 0 ? '+' : ''}{formatCurrency(simTotals.deltaValue)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Top Holding */}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
                Top Holding
              </div>
              <div className="text-sm text-rh-light-text dark:text-rh-text">
                {simTotals.currentTopHolding && (
                  <>
                    <span className="text-rh-light-muted dark:text-rh-muted">
                      {simTotals.currentTopHolding.ticker} ({formatPct(simTotals.currentTopHolding.currentAlloc)})
                    </span>
                    {hasChanges && simTotals.topHolding && (
                      <>
                        <span className="text-rh-light-muted dark:text-rh-muted mx-1.5">&rarr;</span>
                        <span className="font-bold">
                          {simTotals.topHolding.ticker} ({formatPct(simTotals.topHolding.simAlloc)})
                        </span>
                      </>
                    )}
                  </>
                )}
                {!simTotals.currentTopHolding && <span className="text-rh-light-muted dark:text-rh-muted">--</span>}
              </div>
            </div>

            {/* Positions */}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
                Positions
              </div>
              <div className="text-sm text-rh-light-text dark:text-rh-text">
                <span className="text-rh-light-muted dark:text-rh-muted">{simTotals.currentPositions}</span>
                {hasChanges && (
                  <>
                    <span className="text-rh-light-muted dark:text-rh-muted mx-1.5">&rarr;</span>
                    <span className="font-bold">{simTotals.positions}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Holdings List */}
        <div className="space-y-1.5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">
              Holdings ({simHoldings.length})
            </h3>
            {hasChanges && (
              <button
                onClick={handleReset}
                className="text-[11px] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            )}
          </div>

          {simHoldings.map((h) => {
            const alloc = simTotals.allocations.find((a) => a.ticker === h.ticker);
            const deltaShares = h.simShares - h.currentShares;
            const isIncreased = deltaShares > 0;
            const isDecreased = deltaShares < 0;
            const isNew = h.isNew;

            // Determine highlight color
            let rowBg = '';
            let leftBorder = '';
            if (isNew && h.simShares > 0) {
              rowBg = 'bg-amber-500/[0.04] dark:bg-amber-500/[0.04]';
              leftBorder = 'border-l-2 border-l-amber-400';
            } else if (isIncreased) {
              rowBg = 'bg-rh-green/[0.03] dark:bg-rh-green/[0.03]';
              leftBorder = 'border-l-2 border-l-rh-green';
            } else if (isDecreased) {
              rowBg = 'bg-rh-red/[0.03] dark:bg-rh-red/[0.03]';
              leftBorder = 'border-l-2 border-l-rh-red';
            }

            return (
              <div
                key={h.ticker}
                className={`rounded-lg px-3 py-2.5 transition-colors duration-200 ${rowBg} ${leftBorder}
                  ${!leftBorder ? 'border-l-2 border-l-transparent' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {/* Ticker + info */}
                  <div className="min-w-[80px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                        {h.ticker}
                      </span>
                      {isNew && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-500 dark:text-amber-400">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                      @ {formatCurrency(h.currentPrice)}
                    </div>
                  </div>

                  {/* Share stepper */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateShares(h.ticker, h.simShares - 1)}
                      disabled={h.simShares <= 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-medium
                        bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-rh-text
                        hover:bg-gray-200 dark:hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed
                        transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={h.simShares}
                      onChange={(e) => handleShareInput(h.ticker, e.target.value)}
                      className="w-16 text-center text-sm font-semibold bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg px-1 py-1
                        text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green/50
                        [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      min={0}
                      step={1}
                    />
                    <button
                      onClick={() => updateShares(h.ticker, h.simShares + 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-medium
                        bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-rh-text
                        hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Value + allocation */}
                  <div className="flex-1 text-right">
                    <div className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                      {formatCurrency(h.simShares * h.currentPrice)}
                    </div>
                    {alloc && (
                      <div className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                        {deltaShares !== 0 ? (
                          <>
                            <span>{formatPct(alloc.currentAlloc)}</span>
                            <span className="mx-1">&rarr;</span>
                            <span className={`font-medium ${
                              alloc.simAlloc > alloc.currentAlloc ? 'text-rh-green' :
                              alloc.simAlloc < alloc.currentAlloc ? 'text-rh-red' : ''
                            }`}>
                              {formatPct(alloc.simAlloc)}
                            </span>
                          </>
                        ) : (
                          <span>{formatPct(alloc.currentAlloc)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Remove button for new tickers */}
                  {isNew && (
                    <button
                      onClick={() => removeNewTicker(h.ticker)}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/[0.08] transition-colors"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Allocation bar (before/after) */}
                {alloc && (deltaShares !== 0 || isNew) && (
                  <div className="mt-2 space-y-1">
                    {/* Current bar */}
                    {!isNew && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] w-8 text-rh-light-muted dark:text-rh-muted text-right">Now</span>
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-300 dark:bg-white/20 rounded-full transition-all duration-300"
                            style={{ width: `${(alloc.currentAlloc / maxAlloc) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Simulated bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] w-8 text-rh-light-muted dark:text-rh-muted text-right">Sim</span>
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isNew ? 'bg-amber-400' :
                            isIncreased ? 'bg-rh-green' : 'bg-rh-red'
                          }`}
                          style={{ width: `${(alloc.simAlloc / maxAlloc) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add New Ticker */}
        <div className="border-t border-gray-200/50 dark:border-white/[0.06] pt-4 mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
            Add New Ticker
          </h3>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-1 block">
                Symbol
              </label>
              <input
                type="text"
                value={newTicker}
                onChange={(e) => { setNewTicker(e.target.value); setAddError(''); }}
                placeholder="AAPL"
                className="w-full bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm
                  text-rh-light-text dark:text-rh-text placeholder-gray-400 dark:placeholder-white/20
                  focus:outline-none focus:border-rh-green/50"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTicker(); }}
              />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-1 block">
                Shares
              </label>
              <input
                type="number"
                value={newShares}
                onChange={(e) => { setNewShares(e.target.value); setAddError(''); }}
                placeholder="10"
                min={0}
                step={1}
                className="w-full bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm
                  text-rh-light-text dark:text-rh-text placeholder-gray-400 dark:placeholder-white/20
                  focus:outline-none focus:border-rh-green/50
                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTicker(); }}
              />
            </div>
            <div className="w-24">
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-1 block">
                Est. Price
              </label>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => { setNewPrice(e.target.value); setAddError(''); }}
                placeholder="150.00"
                min={0}
                step={0.01}
                className="w-full bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm
                  text-rh-light-text dark:text-rh-text placeholder-gray-400 dark:placeholder-white/20
                  focus:outline-none focus:border-rh-green/50
                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTicker(); }}
              />
            </div>
            <button
              onClick={handleAddTicker}
              className="h-[38px] px-3 rounded-lg bg-rh-green text-black text-sm font-semibold hover:bg-green-600 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
          {addError && (
            <p className="text-xs text-rh-red mt-1.5">{addError}</p>
          )}
        </div>

        {/* Cash note */}
        <div className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/60 text-center">
          Cash balance ({formatCurrency(cashBalance)}) is held constant in this simulation.
          Prices use current market quotes.
        </div>
      </div>
    </div>
  );
}
