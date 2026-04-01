import { useState, useEffect, useMemo, useCallback } from 'react';
import { getValueRadar, ValueRadarStock } from '../api';
import { StockLogo } from './StockLogo';
import { AddToWatchlistModal } from './AddToWatchlistModal';
import { useIsDark } from '../hooks/useIsDark';
import { StepLoader } from './StepLoader';

interface ValueRadarProps {
  onTickerClick: (ticker: string) => void;
  portfolioTickers?: Set<string>;
}

type SectorFilter = string;
type TierFilter = 'all' | 'deep_value' | 'attractive' | 'fair' | 'expensive';
type ValueRadarSortKey = 'currentPE' | 'avgPE' | 'discountPct' | 'price';

const TIER_LABELS: Record<string, { label: string; short: string; color: string }> = {
  deep_value: {
    label: 'Deep Value',
    short: 'Deep',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  attractive: {
    label: 'Attractive',
    short: 'Attr',
    color: 'text-green-600 dark:text-green-400',
  },
  fair: {
    label: 'Fair Value',
    short: 'Fair',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  expensive: {
    label: 'Expensive',
    short: 'Exp',
    color: 'text-red-600 dark:text-red-400',
  },
};

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_LABELS[tier] || TIER_LABELS.fair;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider ${t.color}`}>
      <span className="hidden sm:inline">{t.label}</span>
      <span className="sm:hidden">{t.short}</span>
    </span>
  );
}

/** Semicircular gauge showing current P/E position relative to average. */
function PEGauge({ currentPE, avgPE, size = 64 }: { currentPE: number; avgPE: number; size?: number }) {
  const ratio = Math.max(0, Math.min(2, currentPE / avgPE));
  // Map ratio 0..2 to angle 0..180 (left = cheap, right = expensive)
  const angle = ratio * 90; // 0 = 0deg, 1 = 90deg (fair), 2 = 180deg
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2 + 2;

  // Needle endpoint
  const rad = ((180 - angle) * Math.PI) / 180;
  const nx = cx + r * 0.75 * Math.cos(rad);
  const ny = cy - r * 0.75 * Math.sin(rad);

  return (
    <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} className="mx-auto">
      {/* Background arc segments: green -> yellow -> red */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}`}
        fill="none"
        stroke="rgba(0, 200, 5, 0.4)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r * 0.5} ${cy - r * 0.866}`}
        fill="none"
        stroke="rgba(234, 179, 8, 0.4)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + r * 0.5} ${cy - r * 0.866} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(239, 68, 68, 0.4)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={ratio < 0.8 ? '#00C805' : ratio < 1.2 ? '#EAB308' : '#EF4444'}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={3} fill="white" fillOpacity={0.5} />
    </svg>
  );
}

/** Mini sparkline of historical P/E */
function PESparkline({ history, avgPE }: { history: { year: number; pe: number }[]; avgPE: number }) {
  const isDark = useIsDark();
  if (history.length < 2) return null;
  const w = 80;
  const h = 28;
  const pad = 2;

  const pes = history.map(h => h.pe);
  const min = Math.min(...pes, avgPE) * 0.9;
  const max = Math.max(...pes, avgPE) * 1.1;
  const range = max - min || 1;

  const points = history.map((entry, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (entry.pe - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const avgY = pad + (1 - (avgPE - min) / range) * (h - pad * 2);

  return (
    <svg width={w} height={h} className="opacity-60">
      {/* Average line */}
      <line x1={pad} y1={avgY} x2={w - pad} y2={avgY} stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} strokeWidth={1} strokeDasharray="2,2" />
      {/* P/E line */}
      <polyline points={points} fill="none" stroke="#00C805" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Discount bar: shows how far below (green) or above (red) the average */
function DiscountBar({ discountPct }: { discountPct: number }) {
  // Clamp to -80..+80 for display
  const clamped = Math.max(-80, Math.min(80, discountPct));
  const isUndervalued = clamped < 0;
  const width = Math.abs(clamped);

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden relative">
        {/* Center mark (the average) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-400/30 dark:bg-white/20" />
        {isUndervalued ? (
          <div
            className="absolute top-0 bottom-0 rounded-full bg-gradient-to-l from-rh-green/80 to-emerald-500/60"
            style={{ right: '50%', width: `${(width / 80) * 50}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-red-500/60 to-red-400/80"
            style={{ left: '50%', width: `${(width / 80) * 50}%` }}
          />
        )}
      </div>
      <span className={`text-[11px] font-semibold tabular-nums w-12 text-right ${isUndervalued ? 'text-rh-green' : 'text-rh-red'}`}>
        {discountPct > 0 ? '+' : ''}{discountPct.toFixed(0)}%
      </span>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ValueRadar({ onTickerClick, portfolioTickers }: ValueRadarProps) {
  const [stocks, setStocks] = useState<ValueRadarStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortKey, setSortKey] = useState<ValueRadarSortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [watchlistTicker, setWatchlistTicker] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const resp = await getValueRadar();
      setStocks(resp.stocks);
      setGeneratedAt(resp.generatedAt);
    } catch (err) {
      console.error('[Value Radar] fetch failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sectors = useMemo(() => {
    const set = new Set(stocks.map(s => s.sector));
    return ['all', ...Array.from(set).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    let list = stocks;
    if (sectorFilter !== 'all') list = list.filter(s => s.sector === sectorFilter);
    if (tierFilter !== 'all') list = list.filter(s => s.tier === tierFilter);
    return list;
  }, [stocks, sectorFilter, tierFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'currentPE': return (a.currentPE - b.currentPE) * dir;
        case 'avgPE': return (a.avgPE - b.avgPE) * dir;
        case 'discountPct': return (a.discountPct - b.discountPct) * dir;
        case 'price': return (a.price - b.price) * dir;
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  // Top 8 most undervalued for hero section
  const heroStocks = useMemo(() =>
    stocks.filter(s => s.tier === 'deep_value' || s.tier === 'attractive').slice(0, 8),
    [stocks],
  );

  const handleSort = (key: ValueRadarSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIndicator = (key: ValueRadarSortKey) => {
    if (sortKey !== key) return null;
    return <span className="text-[8px] ml-0.5">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  // A5: Loading skeleton
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-full max-w-sm">
          <StepLoader title="Scanning Value Opportunities" steps={['Fetching valuations', 'Calculating metrics', 'Identifying opportunities', 'Building radar']} interval={3000} />
        </div>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <span className="text-sm text-rh-light-muted dark:text-rh-muted">Value Radar data is being computed.</span>
        <span className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50">Check back in a few minutes.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Hero Section: Top Undervalued Gauge Cards ─── */}
      {heroStocks.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-muted/50 dark:text-rh-muted/50 mb-3">
            <span className="w-0.5 h-3.5 bg-rh-green rounded-full" />
            Most Undervalued
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {heroStocks.map(stock => (
              <button
                key={stock.ticker}
                onClick={() => onTickerClick(stock.ticker)}
                className="group relative bg-white/80 dark:bg-transparent rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-3 text-left transition-all hover:bg-gray-50 dark:hover:bg-white/[0.03] hover:border-gray-300/60 dark:hover:border-white/[0.10]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <StockLogo ticker={stock.ticker} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-rh-light-text dark:text-rh-text truncate flex items-center gap-1">
                      {stock.ticker}
                      {portfolioTickers?.has(stock.ticker) && (
                        <span className="text-rh-green text-xs leading-none">&#10003;</span>
                      )}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-rh-light-muted dark:text-rh-muted truncate">{stock.name}</div>
                  </div>
                </div>

                <PEGauge currentPE={stock.currentPE} avgPE={stock.avgPE} size={56} />

                <div className="text-center mt-1 space-y-0.5">
                  <div className="text-[11px] font-medium text-rh-light-text dark:text-rh-text tabular-nums">
                    P/E {stock.currentPE.toFixed(1)}
                    <span className={`ml-1 text-[9px] font-normal ${stock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-rh-light-muted dark:text-rh-muted tabular-nums">
                    10Y Avg {stock.avgPE.toFixed(1)}
                  </div>
                  <div className={`text-[11px] font-bold tabular-nums ${stock.discountPct < 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {stock.discountPct > 0 ? '+' : ''}{stock.discountPct.toFixed(0)}% vs avg
                  </div>
                  {stock.dividendYield != null && stock.dividendYield > 0.05 && (
                    <div className="text-[9px] sm:text-[10px] text-rh-light-muted dark:text-rh-muted">
                      Div {stock.dividendYield.toFixed(1)}%
                    </div>
                  )}
                  {stock.upsideToTarget != null && stock.upsideToTarget > 0 && (
                    <span className="inline-block text-[8px] bg-emerald-500/[0.08] dark:bg-emerald-500/[0.10] border border-emerald-400/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded mt-1">
                      +{stock.upsideToTarget.toFixed(0)}% target
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Freshness + Refresh ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-rh-light-muted/60 dark:text-rh-muted/40">
          {generatedAt && (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rh-green animate-pulse" />
              <span>Updated {timeAgo(generatedAt)}</span>
            </>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-rh-light-muted dark:text-rh-muted hover:text-rh-green hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white dark:bg-transparent border border-gray-200/40 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text appearance-none cursor-pointer"
        >
          {sectors.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Sectors' : s}</option>
          ))}
        </select>

        <div className="flex gap-0.5">
          {(['all', 'deep_value', 'attractive', 'fair', 'expensive'] as TierFilter[]).map(tier => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`relative px-3 py-1.5 text-[11px] font-medium transition-all whitespace-nowrap ${
                tierFilter === tier
                  ? 'text-rh-light-text dark:text-white'
                  : 'text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {tier === 'all' ? 'All' : TIER_LABELS[tier]?.label || tier}
              {tierFilter === tier && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
              )}
            </button>
          ))}
        </div>

      </div>

      {/* ─── Detailed List ─── */}
      <div className="bg-white/60 dark:bg-transparent rounded-xl border border-gray-200/40 dark:border-white/[0.06] overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-gray-200/30 dark:border-white/[0.05] text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/40">
          <span className="w-[90px] sm:w-auto sm:flex-1 sm:min-w-0">Stock</span>
          <button onClick={() => handleSort('discountPct')} className={`flex-1 min-w-[60px] text-left cursor-pointer transition-colors ${sortKey === 'discountPct' ? 'text-rh-green' : 'hover:text-gray-600 dark:hover:text-white/50'}`}>
            Discount{sortIndicator('discountPct')}
          </button>
          <button onClick={() => handleSort('currentPE')} className={`w-12 text-right cursor-pointer transition-colors ${sortKey === 'currentPE' ? 'text-rh-green' : 'hover:text-gray-600 dark:hover:text-white/50'}`}>
            P/E{sortIndicator('currentPE')}
          </button>
          <button onClick={() => handleSort('avgPE')} className={`hidden md:flex w-16 text-right cursor-pointer transition-colors ${sortKey === 'avgPE' ? 'text-rh-green' : 'hover:text-gray-600 dark:hover:text-white/50'}`}>
            10Y Avg{sortIndicator('avgPE')}
          </button>
          <span className="hidden lg:flex w-20 justify-center">Trend</span>
          <button onClick={() => handleSort('price')} className={`hidden sm:flex w-16 text-right cursor-pointer transition-colors ${sortKey === 'price' ? 'text-rh-green' : 'hover:text-gray-600 dark:hover:text-white/50'}`}>
            Price{sortIndicator('price')}
          </button>
          <span className="hidden sm:flex w-14 text-right">Today</span>
          <span className="hidden lg:flex w-12 text-right">Yield</span>
          <span className="hidden lg:flex w-20 justify-center">52W Range</span>
          <span className="hidden xl:flex w-10 text-right">Beta</span>
          <span className="w-[56px] sm:w-[80px] text-right">Signal</span>
          <span className="w-7" />
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200/10 dark:divide-white/[0.04]">
          {sorted.slice(0, 50).map(stock => (
            <div
              key={stock.ticker}
              className="group flex items-center gap-2 sm:gap-3 px-3 py-2.5 w-full text-left hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
              onClick={() => onTickerClick(stock.ticker)}
            >
              {/* Stock info */}
              <div className="w-[90px] sm:w-auto sm:flex-1 sm:min-w-0 flex items-center gap-2">
                <StockLogo ticker={stock.ticker} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-rh-light-text dark:text-rh-text truncate flex items-center gap-1">
                    {stock.ticker}
                    {portfolioTickers?.has(stock.ticker) && (
                      <span className="text-rh-green text-xs leading-none">&#10003;</span>
                    )}
                  </div>
                  <div className="text-[10px] text-rh-light-muted dark:text-rh-muted truncate">{stock.name}</div>
                </div>
              </div>

              {/* Discount bar */}
              <div className="flex-1 min-w-[60px]">
                <DiscountBar discountPct={stock.discountPct} />
              </div>

              {/* Current P/E */}
              <div className="w-12 text-right text-xs font-medium text-rh-light-text dark:text-rh-text tabular-nums">
                {stock.currentPE.toFixed(1)}
              </div>

              {/* 10Y Avg — hidden on small */}
              <div className="hidden md:flex w-16 text-right text-xs text-rh-light-muted dark:text-rh-muted tabular-nums justify-end">
                {stock.avgPE.toFixed(1)}
              </div>

              {/* P/E sparkline — hidden on small/medium */}
              <div className="hidden lg:flex w-20 justify-center">
                <PESparkline history={stock.peHistory} avgPE={stock.avgPE} />
              </div>

              {/* Price — visible from sm */}
              <div className="hidden sm:flex w-16 text-right text-xs text-rh-light-muted dark:text-rh-muted tabular-nums justify-end">
                ${stock.price.toFixed(2)}
              </div>

              {/* Daily Change — visible from sm */}
              <div className={`hidden sm:flex w-14 text-right text-[11px] font-medium tabular-nums justify-end ${stock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </div>

              {/* Dividend Yield — hidden on small/medium */}
              <div className="hidden lg:flex w-12 text-right text-xs text-rh-light-muted dark:text-rh-muted tabular-nums justify-end">
                {stock.dividendYield != null ? `${stock.dividendYield.toFixed(1)}%` : '--'}
              </div>

              {/* 52-Week Range — hidden on small/medium */}
              <div className="hidden lg:flex w-20 items-center">
                {stock.week52High != null && stock.week52Low != null && stock.week52Pos != null ? (
                  <div className="w-full">
                    <div className="h-1 bg-gray-200 dark:bg-white/[0.08] rounded-full relative">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-[1.5px] border-rh-green bg-white dark:bg-rh-dark"
                        style={{ left: `${Math.max(0, Math.min(100, stock.week52Pos * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] text-rh-light-muted/40 dark:text-rh-muted/40 mt-0.5 tabular-nums">
                      <span>${stock.week52Low.toFixed(0)}</span>
                      <span>${stock.week52High.toFixed(0)}</span>
                    </div>
                  </div>
                ) : <span className="text-xs text-rh-light-muted/30 dark:text-rh-muted/30">--</span>}
              </div>

              {/* Beta — hidden until xl */}
              <div className="hidden xl:flex w-10 text-right text-[11px] text-rh-light-muted dark:text-rh-muted tabular-nums justify-end">
                {stock.beta != null ? stock.beta.toFixed(2) : '--'}
              </div>

              {/* Tier badge */}
              <div className="w-[56px] sm:w-[80px] flex justify-end">
                <TierBadge tier={stock.tier} />
              </div>

              {/* Watchlist action */}
              <div className="w-7 flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); setWatchlistTicker(stock.ticker); }}
                  className="opacity-0 group-hover:opacity-100 sm:opacity-40 sm:hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] text-rh-light-muted dark:text-rh-muted hover:text-rh-green"
                  title="Add to watchlist"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length > 50 && (
          <div className="px-3 py-2 text-center text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 border-t border-gray-200/10 dark:border-white/[0.04]">
            Showing 50 of {filtered.length} stocks
          </div>
        )}
      </div>

      {watchlistTicker && (
        <AddToWatchlistModal
          ticker={watchlistTicker}
          currentPrice={stocks.find(s => s.ticker === watchlistTicker)?.price ?? 0}
          onClose={() => setWatchlistTicker(null)}
          onCreateNew={() => setWatchlistTicker(null)}
        />
      )}
    </div>
  );
}
