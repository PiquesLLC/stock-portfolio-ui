import { useState, useMemo, useCallback, useEffect } from 'react';
import { Holding, HistoricalCAGR } from '../types';
import { getHistoricalCAGR } from '../api';

// ── Types & Constants ──────────────────────────────────────

interface WhatIfSimulatorProps {
  holdings: Holding[];
  cashBalance: number;
  totalValue: number;
  marginDebt?: number;
  onTickerClick?: (ticker: string) => void;
}

type Mode = 'whatif' | 'growth';
type Horizon = '1y' | '5y' | '10y' | '20y';
type CAGRSource = 'best' | '20yr' | '10yr' | '5yr' | 'max' | 'custom';
type SortKey = 'alpha' | 'value' | 'change' | 'weight';
type SortDir = 'asc' | 'desc';

const HORIZON_YEARS: Record<Horizon, number> = { '1y': 1, '5y': 5, '10y': 10, '20y': 20 };
const HORIZON_LABELS: Record<Horizon, string> = { '1y': '1 Year', '5y': '5 Years', '10y': '10 Years', '20y': '20 Years' };

const PRESETS = [
  { label: '+5%', value: 5 },
  { label: '+10%', value: 10 },
  { label: '+25%', value: 25 },
  { label: '-10%', value: -10 },
  { label: '-25%', value: -25 },
  { label: '-50%', value: -50 },
];

// ── Stock Classification for Scenario Presets ──────────────

const TICKER_CAT: Record<string, string> = {
  VOO: 'broad', SPY: 'broad', VTI: 'broad', IWM: 'broad', DIA: 'broad', VT: 'broad',
  QQQ: 'tech', VXUS: 'intl', VEA: 'intl', VWO: 'intl', EFA: 'intl',
  AAPL: 'tech', MSFT: 'tech', NVDA: 'tech', GOOG: 'tech', GOOGL: 'tech', META: 'tech',
  AMZN: 'tech', TSLA: 'tech', AMD: 'tech', INTC: 'tech', CRM: 'tech', ORCL: 'tech',
  ADBE: 'tech', NFLX: 'tech', AVGO: 'tech', QCOM: 'tech', SHOP: 'tech',
  PLTR: 'tech', RDDT: 'tech', SOFI: 'tech', HOOD: 'tech',
  COIN: 'crypto', MSTR: 'crypto', IBIT: 'crypto', BITO: 'crypto', GBTC: 'crypto',
  TLT: 'bonds', BND: 'bonds', AGG: 'bonds', VCIT: 'bonds', LQD: 'bonds',
  VNQ: 'reits', O: 'reits', AMT: 'reits', PLD: 'reits',
  GLD: 'gold', IAU: 'gold',
  JPM: 'fin', BAC: 'fin', GS: 'fin', V: 'fin', MA: 'fin',
  UNH: 'health', JNJ: 'health', LLY: 'health', ABBV: 'health', PFE: 'health',
  XOM: 'energy', CVX: 'energy', COP: 'energy',
  WMT: 'consumer', KO: 'consumer', PEP: 'consumer', COST: 'consumer',
  BABA: 'china', JD: 'china', PDD: 'china', NIO: 'china',
};

interface Scenario {
  name: string;
  desc: string;
  changes: Record<string, number>;
  fallback: number;
}

const SCENARIOS: Scenario[] = [
  { name: 'Market Correction', desc: 'Broad -15%, tech -25%, bonds +5%',
    changes: { broad: -15, tech: -25, reits: -10, bonds: 5, crypto: -30, gold: 5, china: -20, fin: -12, health: -8, energy: -10, consumer: -8, intl: -12 },
    fallback: -15 },
  { name: 'Tech Rally', desc: 'Tech +20%, broad +5%, crypto +15%',
    changes: { tech: 20, broad: 5, crypto: 15, china: 25, fin: 3, health: 2, reits: 3, consumer: 2, intl: 3 },
    fallback: 5 },
  { name: 'Rate Cut', desc: 'Bonds +10%, REITs +15%, tech +10%',
    changes: { bonds: 10, reits: 15, tech: 10, broad: 5, fin: 8, gold: 5, health: 3, consumer: 3, intl: 5 },
    fallback: 5 },
  { name: 'Bear Market', desc: 'Broad -30%, tech -40%, bonds +8%',
    changes: { broad: -30, tech: -40, reits: -20, bonds: 8, crypto: -50, gold: 10, china: -35, fin: -25, health: -15, energy: -20, consumer: -15, intl: -25 },
    fallback: -25 },
];

function getCategoryChange(ticker: string, scenario: Scenario): number {
  const cat = TICKER_CAT[ticker];
  if (cat && scenario.changes[cat] !== undefined) return scenario.changes[cat];
  return scenario.fallback;
}

// ── Formatting Helpers ──────────────────────────────────────

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function getMilestone(current: number, projected: number): string | null {
  const thresholds = [100000, 250000, 500000, 750000, 1000000, 1500000, 2000000, 5000000, 10000000];
  for (const t of thresholds) {
    if (current < t && projected >= t) {
      return t >= 1000000 ? `$${(t / 1000000).toFixed(t % 1000000 === 0 ? 0 : 1)}M` : `$${(t / 1000).toFixed(0)}K`;
    }
  }
  return null;
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="ml-0.5 text-rh-green text-[9px]">{dir === 'desc' ? '\u25B2' : '\u25BC'}</span>;
}

// ──────────────────────────────────────
// What-If Mode
// ──────────────────────────────────────

function WhatIfMode({ holdings, cashBalance, totalValue, marginDebt = 0, onTickerClick }: WhatIfSimulatorProps) {
  const [changes, setChanges] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    holdings.forEach(h => { map[h.ticker] = 0; });
    return map;
  });
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(() => {
    // Auto-expand the highest-value holding (first after default value desc sort)
    if (holdings.length === 0) return new Set();
    const sorted = [...holdings].sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice));
    return new Set([sorted[0].ticker]);
  });
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showScenarios, setShowScenarios] = useState(false);

  // Equity = totalAssets - marginDebt (what the user actually "owns")
  const equity = totalValue - marginDebt;

  const stocksTotal = useMemo(() => holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0), [holdings]);

  const entries = useMemo(() => {
    const mapped = holdings.map(h => {
      const mv = h.shares * h.currentPrice;
      const pct = changes[h.ticker] ?? 0;
      const simValue = mv * (1 + pct / 100);
      return {
        ticker: h.ticker,
        shares: h.shares,
        price: h.currentPrice,
        marketValue: mv,
        weight: stocksTotal > 0 ? (mv / stocksTotal) * 100 : 0,
        changePct: pct,
        simValue,
        delta: simValue - mv,
      };
    });
    mapped.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'alpha': cmp = a.ticker.localeCompare(b.ticker); break;
        case 'value': cmp = a.marketValue - b.marketValue; break;
        case 'change': cmp = a.changePct - b.changePct; break;
        case 'weight': cmp = a.weight - b.weight; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return mapped;
  }, [holdings, changes, stocksTotal, sortKey, sortDir]);

  const simTotal = useMemo(
    () => entries.reduce((s, e) => s + e.simValue, 0) + cashBalance,
    [entries, cashBalance]
  );
  const simEquity = simTotal - marginDebt;
  const delta = simTotal - totalValue;
  const deltaPct = equity > 0 ? (delta / equity) * 100 : 0;
  const hasChanges = useMemo(() => Object.values(changes).some(v => v !== 0), [changes]);
  const changedCount = useMemo(() => Object.values(changes).filter(v => v !== 0).length, [changes]);

  const updateChange = useCallback((ticker: string, pct: number) => {
    const clamped = Math.max(-99, Math.min(200, pct));
    setChanges(prev => ({ ...prev, [ticker]: clamped }));
  }, []);

  const applyAll = useCallback((pct: number) => {
    setChanges(prev => {
      const next: Record<string, number> = {};
      Object.keys(prev).forEach(k => { next[k] = pct; });
      return next;
    });
  }, []);

  const applyScenario = useCallback((scenario: Scenario) => {
    setChanges(prev => {
      const next: Record<string, number> = {};
      Object.keys(prev).forEach(ticker => {
        next[ticker] = getCategoryChange(ticker, scenario);
      });
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setChanges(prev => {
      const next: Record<string, number> = {};
      Object.keys(prev).forEach(k => { next[k] = 0; });
      return next;
    });
    // Collapse all sliders for a clean slate
    setExpandedTickers(new Set());
  }, [holdings]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  return (
    <>
      {/* Sticky Summary */}
      <div className={`sticky top-0 z-10 rounded-xl p-4 mb-4 border backdrop-blur-xl shadow-lg transition-colors duration-200 ${
        hasChanges
          ? delta >= 0
            ? 'border-rh-green/20 dark:border-rh-green/15 bg-green-50/80 dark:bg-rh-green/[0.04]'
            : 'border-red-300/20 dark:border-red-500/15 bg-red-50/80 dark:bg-rh-red/[0.04]'
          : 'border-gray-200/40 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03]'
      }`}>
        {!hasChanges ? (
          /* Idle state */
          <div>
            <span className="text-xl font-bold text-rh-light-text dark:text-rh-text">
              {formatCurrencyFull(equity)}
            </span>
            <div className="mt-2 text-xs text-rh-light-muted dark:text-rh-muted">
              {holdings.length} positions &middot; Cash {formatCurrency(cashBalance)} held constant
            </div>
          </div>
        ) : (
          /* Active state — projected value is the hero */
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-0.5">
                  {formatCurrencyFull(equity)}
                  <svg className="w-3.5 h-3.5 inline mx-1.5 -mt-0.5 text-rh-light-muted/50 dark:text-rh-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
                <span className={`text-2xl font-bold tracking-tight ${delta >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {formatCurrencyFull(simEquity)}
                </span>
              </div>
              <button onClick={resetAll} className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className={`text-sm font-bold ${delta >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {delta >= 0 ? '+' : ''}{formatCurrencyFull(delta)}
              </span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                delta >= 0 ? 'bg-rh-green/10 text-rh-green' : 'bg-rh-red/10 text-rh-red'
              }`}>
                {formatPct(deltaPct)}
              </span>
              {(() => {
                const milestone = getMilestone(equity, simEquity);
                if (!milestone) return null;
                return (
                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    You&apos;d cross {milestone}!
                  </span>
                );
              })()}
            </div>
            <div className="mt-2 text-[10px] text-rh-light-muted/60 dark:text-rh-muted/40">
              {holdings.length} positions &middot; {changedCount} adjusted &middot; Cash {formatCurrency(cashBalance)} held constant
            </div>
          </div>
        )}
      </div>

      {/* Quick Presets + Scenarios toggle */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyAll(p.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              p.value > 0
                ? 'bg-rh-green/10 text-rh-green hover:bg-rh-green/20'
                : 'bg-rh-red/10 text-rh-red hover:bg-rh-red/20'
            }`}
          >
            All {p.label}
          </button>
        ))}
        <button onClick={() => setShowScenarios(v => !v)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            showScenarios
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-white/[0.04] text-rh-light-muted dark:text-rh-muted hover:bg-white/10'
          }`}
        >
          Scenarios {showScenarios ? '\u25B4' : '\u25BE'}
        </button>
      </div>

      {/* Scenario Presets (expandable) */}
      {showScenarios && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SCENARIOS.map(s => (
            <button key={s.name} onClick={() => applyScenario(s)}
              className="text-left px-3 py-2 rounded-lg border border-gray-200/20 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.02] hover:bg-gray-100/60 dark:hover:bg-white/[0.05] transition-colors"
            >
              <div className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text">{s.name}</div>
              <div className="text-[10px] text-rh-light-muted dark:text-rh-muted mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Holdings Table */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">
            Holdings ({entries.length})
          </h3>
          {changedCount > 0 && (
            <span className="text-[11px] text-rh-green font-medium">{changedCount} adjusted</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {changedCount > 0 && (
              <button
                onClick={resetAll}
                className="text-[10px] font-medium text-rh-red/70 hover:text-rh-red transition-colors"
              >
                Reset All
              </button>
            )}
            <button
              onClick={() => {
                const allTickers = entries.map(e => e.ticker);
                const allExpanded = allTickers.every(t => expandedTickers.has(t));
                setExpandedTickers(allExpanded ? new Set() : new Set(allTickers));
              }}
              className="text-[10px] font-medium text-rh-light-muted/60 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
            >
              {entries.every(e => expandedTickers.has(e.ticker)) ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>

        {/* Sortable Table header */}
        <div className="grid grid-cols-[1fr_70px_90px_80px] gap-x-1 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50 border-b border-gray-200/40 dark:border-white/[0.04]">
          <button className="text-left flex items-center hover:text-rh-light-text dark:hover:text-rh-text transition-colors" onClick={() => toggleSort('alpha')}>
            Stock<SortArrow active={sortKey === 'alpha'} dir={sortDir} />
          </button>
          <button className="text-right flex items-center justify-end hover:text-rh-light-text dark:hover:text-rh-text transition-colors" onClick={() => toggleSort('value')}>
            Value<SortArrow active={sortKey === 'value'} dir={sortDir} />
          </button>
          <span className="text-center">Change %</span>
          <span className="text-right">Result</span>
        </div>

        {/* Table rows */}
        <div className="divide-y divide-gray-100/60 dark:divide-white/[0.03]">
          {entries.map(entry => {
            const { ticker, shares, price, marketValue, weight, changePct, simValue, delta: rowDelta } = entry;
            const isChanged = changePct !== 0;
            const isUp = changePct > 0;
            const isDown = changePct < 0;
            const isExpanded = expandedTickers.has(ticker);

            return (
              <div key={ticker}>
                <div
                  className={`grid grid-cols-[1fr_70px_90px_80px] gap-x-1 items-center px-3 py-1.5 transition-colors cursor-pointer ${
                    isChanged
                      ? isUp ? 'bg-green-50/30 dark:bg-rh-green/[0.03]' : 'bg-red-50/30 dark:bg-rh-red/[0.03]'
                      : 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02]'
                  }`}
                  onClick={() => setExpandedTickers(prev => {
                    const next = new Set(prev);
                    if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
                    return next;
                  })}
                >
                  {/* Ticker + price + weight */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="text-xs font-semibold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors truncate"
                        onClick={(e) => { e.stopPropagation(); onTickerClick?.(ticker); }}
                      >
                        {ticker}
                      </button>
                      <span className="text-[9px] text-rh-light-muted/70 dark:text-rh-muted/60 tabular-nums">
                        {weight.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[9px] text-rh-light-muted/70 dark:text-rh-muted/60 tabular-nums">
                      {formatPrice(price)} &times; {shares % 1 === 0 ? shares : shares.toFixed(2)}
                    </div>
                  </div>

                  {/* Current value */}
                  <span className="text-[11px] text-rh-light-muted dark:text-rh-muted tabular-nums text-right whitespace-nowrap">
                    {formatCurrency(marketValue)}
                  </span>

                  {/* Change % input */}
                  <div className="flex items-center justify-center gap-0.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => updateChange(ticker, changePct - (e.shiftKey ? 5 : 1))}
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-rh-light-muted dark:text-rh-muted hover:bg-gray-200/60 dark:hover:bg-white/10 transition-colors"
                      title="-1% (Shift: -5%)"
                    >
                      &minus;
                    </button>
                    <input
                      type="number"
                      value={changePct}
                      onChange={e => updateChange(ticker, parseFloat(e.target.value) || 0)}
                      onDoubleClick={() => updateChange(ticker, 0)}
                      className={`w-12 h-5 text-center text-[11px] font-medium tabular-nums rounded border bg-transparent outline-none transition-colors
                        ${isUp ? 'text-rh-green border-rh-green/30' : isDown ? 'text-rh-red border-rh-red/30' : 'text-rh-light-muted dark:text-rh-muted border-gray-200/60 dark:border-white/10'}
                        focus:ring-1 focus:ring-rh-green/40`}
                      title="Double-click to reset"
                    />
                    <button
                      onClick={(e) => updateChange(ticker, changePct + (e.shiftKey ? 5 : 1))}
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-rh-light-muted dark:text-rh-muted hover:bg-gray-200/60 dark:hover:bg-white/10 transition-colors"
                      title="+1% (Shift: +5%)"
                    >
                      +
                    </button>
                  </div>

                  {/* Result + per-stock delta */}
                  <div className="text-right">
                    <span className={`text-[11px] font-medium tabular-nums whitespace-nowrap ${
                      isUp ? 'text-rh-green' : isDown ? 'text-rh-red' : 'text-rh-light-muted dark:text-rh-muted'
                    }`}>
                      {formatCurrency(simValue)}
                    </span>
                    {isChanged && (
                      <div className={`text-[9px] tabular-nums ${isUp ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                        {rowDelta >= 0 ? '+' : ''}{formatCurrency(rowDelta)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded slider */}
                {isExpanded && (() => {
                  const zeroPct = (99 / 299) * 100;
                  const thumbPct = ((changePct + 99) / 299) * 100;
                  const fillLeft = changePct >= 0 ? zeroPct : thumbPct;
                  const fillWidth = changePct >= 0 ? thumbPct - zeroPct : zeroPct - thumbPct;
                  const compact = expandedTickers.size > 3;
                  return (
                    <div className={`mx-2 mb-1 rounded-lg bg-gray-50/40 dark:bg-white/[0.015] border border-gray-200/20 dark:border-white/[0.04] ${compact ? 'px-3 pb-1.5 pt-2' : 'px-3 pb-2 pt-3'}`} onClick={e => e.stopPropagation()}>
                      <div className="relative h-1">
                        {/* Track background */}
                        <div className="absolute inset-0 rounded-full bg-gray-200 dark:bg-white/10" />
                        {/* Colored fill from 0% to thumb */}
                        {changePct !== 0 && (
                          <div
                            className={`absolute top-0 h-full rounded-full ${isUp ? 'bg-rh-green/50' : 'bg-rh-red/50'}`}
                            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
                          />
                        )}
                        {/* Range input (transparent track, styled thumb) */}
                        <input
                          type="range" min={-99} max={200} step={1} value={changePct}
                          onChange={e => {
                            const raw = parseFloat(e.target.value);
                            const snaps = [-75, -50, -25, 0, 25, 50, 75, 100, 125, 150, 175, 200];
                            const nearest = snaps.reduce((best, s) => Math.abs(raw - s) < Math.abs(raw - best) ? s : best, snaps[0]);
                            updateChange(ticker, Math.abs(raw - nearest) <= 3 ? nearest : raw);
                          }}
                          onDoubleClick={() => updateChange(ticker, 0)}
                          className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-300 dark:[&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-gray-300 dark:[&::-moz-range-thumb]:border-white/20 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent"
                        />
                        {/* Live value tooltip */}
                        {changePct !== 0 && (
                          <div
                            className={`absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-semibold tabular-nums whitespace-nowrap ${
                              isUp ? 'bg-rh-green/20 text-rh-green' : 'bg-rh-red/20 text-rh-red'
                            }`}
                            style={{ left: `${thumbPct}%` }}
                          >
                            {changePct > 0 ? '+' : ''}{changePct}%
                          </div>
                        )}
                        {/* Tick marks at every 25% */}
                        {[-75, -50, -25, 0, 25, 50, 75, 100, 125, 150, 175, 200].map(tick => (
                          <div key={tick} className={`absolute w-px pointer-events-none ${tick === 0 ? 'h-2.5 -top-[3px] bg-rh-light-muted/50 dark:bg-rh-muted/50' : 'h-1 top-0 bg-rh-light-muted/20 dark:bg-rh-muted/20'}`}
                            style={{ left: `${((tick + 99) / 299) * 100}%` }}
                          />
                        ))}
                      </div>
                      {/* Full labels only in non-compact mode */}
                      {!compact && (
                        <div className="relative text-[9px] text-rh-light-muted/50 dark:text-rh-muted/40 mt-1.5 h-3">
                          <span className="absolute left-0">-99%</span>
                          <span className="absolute -translate-x-1/2" style={{ left: `${((-50 + 99) / 299) * 100}%` }}>-50%</span>
                          <span className="absolute -translate-x-1/2 text-rh-light-muted/70 dark:text-rh-muted/60" style={{ left: `${zeroPct}%` }}>0%</span>
                          <span className="absolute -translate-x-1/2" style={{ left: `${((50 + 99) / 299) * 100}%` }}>+50%</span>
                          <span className="absolute -translate-x-1/2" style={{ left: `${((100 + 99) / 299) * 100}%` }}>+100%</span>
                          <span className="absolute right-0">+200%</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Sticky total row */}
        <div className="sticky bottom-0 z-10 grid grid-cols-[1fr_70px_90px_80px] gap-x-1 items-center px-3 py-2 bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl border-t border-gray-200/40 dark:border-white/[0.08] rounded-b-lg shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
          <span className="text-xs font-bold text-rh-light-text dark:text-rh-text">Portfolio Total</span>
          <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text tabular-nums text-right">
            {formatCurrency(equity)}
          </span>
          <span />
          <div className="text-right">
            <span className={`text-[11px] font-bold tabular-nums ${hasChanges && delta >= 0 ? 'text-rh-green' : hasChanges ? 'text-rh-red' : 'text-rh-light-text dark:text-rh-text'}`}>
              {formatCurrency(simEquity)}
            </span>
            {hasChanges && (
              <div className={`text-[9px] tabular-nums ${delta >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 text-center mt-2">
        Click any row for slider &middot; Double-click input to reset &middot; Shift+&plusmn; for 5% steps
      </div>
    </>
  );
}

// ──────────────────────────────────────
// Growth Projector Mode
// ──────────────────────────────────────

function GrowthProjector({ holdings, cashBalance, totalValue, marginDebt = 0, onTickerClick }: WhatIfSimulatorProps) {
  const [horizon, setHorizon] = useState<Horizon>('10y');
  const [source, setSource] = useState<CAGRSource>('best');
  const [cagrData, setCagrData] = useState<Record<string, HistoricalCAGR>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyContrib, setMonthlyContrib] = useState(0);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showContributors, setShowContributors] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tickers = holdings.map(h => h.ticker);
    getHistoricalCAGR(tickers)
      .then(resp => {
        if (cancelled) return;
        const map: Record<string, HistoricalCAGR> = {};
        resp.cagrs.forEach(c => { map[c.ticker] = c; });
        setCagrData(map);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to fetch CAGR data:', err);
        setError('Unable to load historical return data');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [holdings]);

  const years = HORIZON_YEARS[horizon];
  const stocksTotal = useMemo(() => holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0), [holdings]);

  const getRate = useCallback((ticker: string): number | null => {
    if (overrides[ticker] !== undefined) return overrides[ticker] / 100;
    const data = cagrData[ticker];
    if (!data) return null;
    if (source === '20yr') return data.cagr20yr;
    if (source === '10yr') return data.cagr10yr;
    if (source === '5yr') return data.cagr5yr;
    if (source === 'max') return data.cagrMax;
    // 'best': use longest available CAGR (20yr → 10yr → 5yr → max)
    return data.cagr20yr ?? data.cagr10yr ?? data.cagr5yr ?? data.cagrMax;
  }, [cagrData, overrides, source]);

  const entries = useMemo(() =>
    holdings.map(h => {
      const mv = h.shares * h.currentPrice;
      const weight = stocksTotal > 0 ? mv / stocksTotal : 0;
      const rate = getRate(h.ticker);
      const annualContrib = monthlyContrib * 12 * weight;

      // Iterative compound calculation (includes DCA)
      let projected = mv;
      const yearlyValues: number[] = [mv];
      if (rate !== null) {
        for (let y = 0; y < years; y++) {
          projected = projected * (1 + rate) + annualContrib;
          yearlyValues.push(projected);
        }
      }

      const totalContributed = annualContrib * years;
      const gain = rate !== null ? projected - mv - totalContributed : null;
      const data = cagrData[h.ticker];
      const displayRate = overrides[h.ticker] !== undefined
        ? overrides[h.ticker]
        : rate !== null ? rate * 100 : null;

      return {
        ticker: h.ticker,
        shares: h.shares,
        price: h.currentPrice,
        marketValue: mv,
        weight: weight * 100,
        rate,
        displayRate,
        projected: rate !== null ? projected : null,
        gain,
        totalContributed,
        annualContrib,
        yearlyValues,
        dataYears: data?.dataYears ?? 0,
        hasData: rate !== null,
      };
    }),
    [holdings, getRate, years, cagrData, overrides, stocksTotal, monthlyContrib]
  );

  const equity = totalValue - marginDebt;

  const projectedTotal = useMemo(() => {
    const stocksProj = entries.reduce((s, e) => s + (e.projected ?? e.marketValue), 0);
    return stocksProj + cashBalance;
  }, [entries, cashBalance]);
  const projectedEquity = projectedTotal - marginDebt;

  const totalContributions = monthlyContrib * 12 * years;
  const totalGain = projectedTotal - totalValue - totalContributions;
  const totalGainPct = equity > 0 ? (totalGain / equity) * 100 : 0;

  const blendedCAGR = useMemo(() => {
    let weightedSum = 0;
    let totalWeight = 0;
    entries.forEach(e => {
      if (e.rate !== null) {
        weightedSum += e.rate * e.marketValue;
        totalWeight += e.marketValue;
      }
    });
    return totalWeight > 0 ? (weightedSum / totalWeight) * 100 : null;
  }, [entries]);

  // Top contributors sorted by projected gain
  const topContributors = useMemo(() =>
    [...entries].filter(e => e.gain !== null).sort((a, b) => Math.abs(b.gain!) - Math.abs(a.gain!)).slice(0, 5),
    [entries]
  );

  const updateOverride = useCallback((ticker: string, pct: number) => {
    setOverrides(prev => ({ ...prev, [ticker]: pct }));
  }, []);

  const clearOverrides = useCallback(() => setOverrides({}), []);
  const hasOverrides = Object.keys(overrides).length > 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-6 h-6 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">Loading historical return data...</span>
      </div>
    );
  }

  return (
    <>
      {/* Summary Card */}
      <div className="rounded-xl p-4 mb-4 border border-gray-200/40 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl shadow-lg">
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
          <span className="text-xl font-bold text-rh-light-text dark:text-rh-text">
            {formatCurrencyFull(equity)}
          </span>
          <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <span className={`text-xl font-bold ${totalGain >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
            {formatCurrencyFull(projectedEquity)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
          <span className={`font-semibold ${totalGain >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
            {totalGain >= 0 ? '+' : ''}{formatCurrencyFull(totalGain)} growth ({formatPct(totalGainPct)})
          </span>
          {totalContributions > 0 && (
            <>
              <span className="text-rh-light-muted/50 dark:text-rh-muted/40">+</span>
              <span className="text-rh-light-muted dark:text-rh-muted">
                {formatCurrency(totalContributions)} contributed
              </span>
            </>
          )}
          <span className="text-rh-light-muted/50 dark:text-rh-muted/40">&middot;</span>
          <span className="text-rh-light-muted dark:text-rh-muted">
            in {HORIZON_LABELS[horizon]}
          </span>
          {blendedCAGR !== null && (
            <>
              <span className="text-rh-light-muted/50 dark:text-rh-muted/40">&middot;</span>
              <span className="text-rh-light-muted dark:text-rh-muted">
                Blended {blendedCAGR.toFixed(1)}%/yr
              </span>
            </>
          )}
        </div>
        {error && <div className="mt-2 text-xs text-amber-500">{error}</div>}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Data source */}
        <div className="flex items-center gap-1 bg-white/40 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/30 dark:border-white/[0.06] rounded-lg p-0.5 shadow-sm">
          {(['best', '20yr', '10yr', '5yr', 'max', 'custom'] as CAGRSource[]).map(s => (
            <button key={s} onClick={() => { setSource(s); if (s !== 'custom') clearOverrides(); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                source === s
                  ? 'bg-white/80 dark:bg-white/[0.1] backdrop-blur-sm text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {s === 'best' ? 'Best' : s === '20yr' ? '20yr' : s === '10yr' ? '10yr' : s === '5yr' ? '5yr' : s === 'max' ? 'All' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Horizon */}
        <div className="flex items-center gap-1 bg-white/40 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/30 dark:border-white/[0.06] rounded-lg p-0.5 shadow-sm">
          {(['1y', '5y', '10y', '20y'] as Horizon[]).map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                horizon === h
                  ? 'bg-white/80 dark:bg-white/[0.1] backdrop-blur-sm text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {HORIZON_LABELS[h]}
            </button>
          ))}
        </div>

        {hasOverrides && (
          <button onClick={clearOverrides}
            className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors">
            Reset overrides
          </button>
        )}
      </div>

      {/* Monthly DCA input */}
      <div className="flex items-center gap-2 mb-4 px-1 flex-wrap">
        <span className="text-[11px] text-rh-light-muted dark:text-rh-muted whitespace-nowrap">Monthly contribution:</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/40">$</span>
          <input
            type="number" min={0} step={100} value={monthlyContrib || ''}
            placeholder="0"
            onChange={e => setMonthlyContrib(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-24 h-6 text-[11px] font-medium tabular-nums rounded border border-gray-200/40 dark:border-white/[0.06] bg-transparent text-rh-light-text dark:text-rh-text outline-none px-2 focus:ring-1 focus:ring-rh-green/40"
          />
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">/mo</span>
        </div>
        {monthlyContrib > 0 && (
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">
            = {formatCurrency(monthlyContrib * 12)}/yr &middot; {formatCurrency(totalContributions)} over {HORIZON_LABELS[horizon].toLowerCase()}
          </span>
        )}
      </div>

      {/* Top Contributors (collapsible) */}
      {topContributors.length > 0 && (
        <div className="mb-4">
          <button onClick={() => setShowContributors(v => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showContributors ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Top Growth Drivers
          </button>
          {showContributors && (
            <div className="flex flex-wrap gap-2">
              {topContributors.map((e, i) => (
                <div key={e.ticker} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50/40 dark:bg-white/[0.03] border border-gray-200/20 dark:border-white/[0.04]">
                  <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">#{i + 1}</span>
                  <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text">{e.ticker}</span>
                  <span className={`text-[10px] font-medium tabular-nums ${e.gain! >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {e.gain! >= 0 ? '+' : ''}{formatCurrency(e.gain!)}
                  </span>
                  {e.displayRate !== null && (
                    <span className="text-[9px] text-rh-light-muted/50 dark:text-rh-muted/40">
                      ({e.displayRate.toFixed(1)}%/yr)
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1fr_70px_80px_auto] gap-x-1 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/50 border-b border-gray-200/40 dark:border-white/[0.04]">
        <span>Stock</span>
        <span className="text-right">Current</span>
        <span className="text-center">Avg Return</span>
        <span className="text-right">Projected</span>
      </div>

      {/* Table rows */}
      <div className="divide-y divide-gray-100/60 dark:divide-white/[0.03]">
        {entries.map(entry => {
          const { ticker, shares, price, marketValue, weight, displayRate, projected, gain, totalContributed: rowContrib, annualContrib, yearlyValues, dataYears, hasData } = entry;
          const isExpanded = expandedTicker === ticker;

          return (
            <div key={ticker}>
              <div
                className={`grid grid-cols-[1fr_70px_80px_auto] gap-x-1 items-center px-3 py-1.5 transition-colors cursor-pointer ${
                  hasData ? 'hover:bg-gray-50/40 dark:hover:bg-white/[0.02]' : 'opacity-60'
                }`}
                onClick={() => setExpandedTicker(isExpanded ? null : ticker)}
              >
                {/* Ticker + price + weight */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      className="text-xs font-semibold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors truncate"
                      onClick={(e) => { e.stopPropagation(); onTickerClick?.(ticker); }}
                    >
                      {ticker}
                    </button>
                    <span className="text-[9px] text-rh-light-muted/70 dark:text-rh-muted/60 tabular-nums">
                      {weight.toFixed(1)}%
                    </span>
                    {dataYears > 0 && source === 'best' && hasData && (
                      <span className="text-[9px] text-rh-light-muted/70 dark:text-rh-muted/60" title={`Using ${dataYears >= 16 ? '20yr' : dataYears >= 8 ? '10yr' : dataYears >= 4 ? '5yr' : 'all'} avg (${dataYears.toFixed(0)}yr data)`}>
                        {dataYears >= 16 ? '20y' : dataYears >= 8 ? '10y' : dataYears >= 4 ? '5y' : `${dataYears.toFixed(0)}y`}
                      </span>
                    )}
                    {dataYears > 0 && source !== 'best' && source !== 'custom' && !hasData && (
                      <span className="text-[9px] text-amber-500/70" title={`Only ${dataYears.toFixed(0)}yr of data available`}>
                        {dataYears.toFixed(0)}yr
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-rh-light-muted/70 dark:text-rh-muted/60 tabular-nums">
                    {formatPrice(price)} &times; {shares % 1 === 0 ? shares : shares.toFixed(2)}
                  </div>
                </div>

                {/* Current value */}
                <span className="text-[11px] text-rh-light-muted dark:text-rh-muted tabular-nums text-right whitespace-nowrap">
                  {formatCurrency(marketValue)}
                </span>

                {/* Avg return input */}
                <div className="flex items-center justify-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <input type="number" step={0.1}
                    value={displayRate !== null ? parseFloat(displayRate.toFixed(1)) : ''}
                    placeholder="--"
                    onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val)) updateOverride(ticker, val); }}
                    className={`w-14 h-5 text-center text-[11px] font-medium tabular-nums rounded border bg-transparent outline-none transition-colors
                      ${displayRate !== null && displayRate > 0 ? 'text-rh-green border-rh-green/20' : displayRate !== null && displayRate < 0 ? 'text-rh-red border-rh-red/20' : 'text-rh-light-muted dark:text-rh-muted border-gray-200/40 dark:border-white/[0.06]'}
                      focus:ring-1 focus:ring-rh-green/40`}
                  />
                  <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40">%</span>
                </div>

                {/* Projected value */}
                <div className="text-right">
                  {projected !== null ? (
                    <div>
                      <span className={`text-[11px] font-medium tabular-nums whitespace-nowrap ${
                        gain !== null && gain >= 0 ? 'text-rh-green' : 'text-rh-red'
                      }`}>
                        {formatCurrency(projected)}
                      </span>
                      {gain !== null && (
                        <div className={`text-[9px] tabular-nums ${gain >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                          {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-rh-light-muted/40 dark:text-rh-muted/30">&mdash;</span>
                  )}
                </div>
              </div>

              {/* Year-by-year breakdown (expanded) */}
              {isExpanded && hasData && yearlyValues.length > 1 && (
                <div className="px-4 pb-3 pt-1 bg-gray-50/20 dark:bg-white/[0.01]">
                  <div className="text-[10px] font-medium text-rh-light-muted dark:text-rh-muted mb-1.5 uppercase tracking-wider">
                    Year-by-Year Projection
                  </div>
                  <div className={`grid ${annualContrib > 0 ? 'grid-cols-[36px_1fr_1fr_1fr]' : 'grid-cols-[36px_1fr_1fr]'} gap-x-3 gap-y-0.5 text-[10px] tabular-nums`}>
                    <span className="text-rh-light-muted/50 dark:text-rh-muted/40 font-medium">Yr</span>
                    <span className="text-rh-light-muted/50 dark:text-rh-muted/40 font-medium text-right">Value</span>
                    <span className="text-rh-light-muted/50 dark:text-rh-muted/40 font-medium text-right">Growth</span>
                    {annualContrib > 0 && <span className="text-rh-light-muted/50 dark:text-rh-muted/40 font-medium text-right">Added</span>}
                    {yearlyValues.slice(1).map((val, i) => {
                      const prev = yearlyValues[i];
                      const growth = val - prev - annualContrib;
                      return (
                        <div key={i} className="contents">
                          <span className="text-rh-light-muted/60 dark:text-rh-muted/50">{i + 1}</span>
                          <span className="text-right text-rh-light-text dark:text-rh-text">{formatCurrency(val)}</span>
                          <span className={`text-right ${growth >= 0 ? 'text-rh-green/80' : 'text-rh-red/80'}`}>
                            {growth >= 0 ? '+' : ''}{formatCurrency(growth)}
                          </span>
                          {annualContrib > 0 && (
                            <span className="text-right text-blue-400/70">+{formatCurrency(annualContrib)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky total row */}
      <div className="sticky bottom-0 z-10 grid grid-cols-[1fr_70px_80px_auto] gap-x-1 items-center px-3 py-2 bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl border-t border-gray-200/40 dark:border-white/[0.08] rounded-b-lg shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
        <span className="text-xs font-bold text-rh-light-text dark:text-rh-text">Portfolio Total</span>
        <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text tabular-nums text-right">
          {formatCurrency(equity)}
        </span>
        <span className="text-center">
          {blendedCAGR !== null && (
            <span className={`text-[11px] font-medium tabular-nums ${blendedCAGR >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              {blendedCAGR.toFixed(1)}%
            </span>
          )}
        </span>
        <div className="text-right">
          <span className={`text-[11px] font-bold tabular-nums ${totalGain >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
            {formatCurrency(projectedEquity)}
          </span>
          <div className={`text-[9px] tabular-nums ${totalGain >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
            {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} growth
          </div>
        </div>
      </div>

      <div className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 text-center mt-3">
        Click row for year-by-year breakdown &middot; Returns compounded annually &middot; Past performance does not guarantee future results
      </div>
    </>
  );
}

// ──────────────────────────────────────
// Main Component with Mode Toggle
// ──────────────────────────────────────

export function WhatIfSimulator(props: WhatIfSimulatorProps) {
  const [mode, setMode] = useState<Mode>('whatif');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
          Scenario Explorer
        </h2>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
          {mode === 'whatif'
            ? 'Simulate price changes and see how they affect your portfolio'
            : 'Project your portfolio\'s growth using historical stock performance'}
        </p>
      </div>

      <div className="flex items-center gap-1 bg-white/40 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/30 dark:border-white/[0.06] rounded-lg p-0.5 w-fit shadow-sm">
        <button onClick={() => setMode('whatif')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'whatif'
              ? 'bg-white/80 dark:bg-white/[0.1] backdrop-blur-sm text-rh-light-text dark:text-rh-text shadow-sm'
              : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
          }`}
        >
          What If
        </button>
        <button onClick={() => setMode('growth')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'growth'
              ? 'bg-white/80 dark:bg-white/[0.1] backdrop-blur-sm text-rh-light-text dark:text-rh-text shadow-sm'
              : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
          }`}
        >
          Growth Projector
        </button>
      </div>

      {mode === 'whatif' ? <WhatIfMode {...props} /> : <GrowthProjector {...props} />}
    </div>
  );
}
