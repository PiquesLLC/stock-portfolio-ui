import { useState, useEffect, useMemo } from 'react';
import { getValueRadar, ValueRadarStock } from '../api';
import { StockLogo } from './StockLogo';

interface ValueRadarProps {
  onTickerClick: (ticker: string) => void;
}

type SectorFilter = string;
type TierFilter = 'all' | 'deep_value' | 'attractive' | 'fair' | 'expensive';

const TIER_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  deep_value: {
    label: 'Deep Value',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/[0.12]',
    border: 'border-emerald-400/25',
  },
  attractive: {
    label: 'Attractive',
    color: 'text-green-400',
    bg: 'bg-green-500/[0.10]',
    border: 'border-green-400/20',
  },
  fair: {
    label: 'Fair Value',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/[0.10]',
    border: 'border-yellow-400/20',
  },
  expensive: {
    label: 'Expensive',
    color: 'text-red-400',
    bg: 'bg-red-500/[0.10]',
    border: 'border-red-400/20',
  },
};

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_LABELS[tier] || TIER_LABELS.fair;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${t.bg} ${t.border} ${t.color}`}>
      {t.label}
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
      {/* Background arc segments: green → yellow → red */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}`}
        fill="none"
        stroke="rgba(0, 200, 5, 0.3)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r * 0.5} ${cy - r * 0.866}`}
        fill="none"
        stroke="rgba(234, 179, 8, 0.3)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + r * 0.5} ${cy - r * 0.866} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(239, 68, 68, 0.3)"
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
      <line x1={pad} y1={avgY} x2={w - pad} y2={avgY} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="2,2" />
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
      <div className="flex-1 h-1.5 rounded-full bg-gray-200/10 dark:bg-white/[0.06] overflow-hidden relative">
        {/* Center mark (the average) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
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

export function ValueRadar({ onTickerClick }: ValueRadarProps) {
  const [stocks, setStocks] = useState<ValueRadarStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  useEffect(() => {
    getValueRadar()
      .then(resp => setStocks(resp.stocks))
      .catch(err => console.error('[Value Radar] fetch failed:', err))
      .finally(() => setLoading(false));
  }, []);

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

  // Top 8 most undervalued for hero section
  const heroStocks = useMemo(() =>
    stocks.filter(s => s.tier === 'deep_value' || s.tier === 'attractive').slice(0, 8),
    [stocks],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Loading Value Radar...</span>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {heroStocks.map(stock => (
              <button
                key={stock.ticker}
                onClick={() => onTickerClick(stock.ticker)}
                className="group relative bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-3 text-left transition-all hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:border-gray-300/60 dark:hover:border-white/[0.10] hover:shadow-lg dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <StockLogo ticker={stock.ticker} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-rh-light-text dark:text-rh-text truncate">{stock.ticker}</div>
                    <div className="text-[10px] text-rh-light-muted dark:text-rh-muted truncate">{stock.name}</div>
                  </div>
                </div>

                <PEGauge currentPE={stock.currentPE} avgPE={stock.avgPE} size={56} />

                <div className="text-center mt-1 space-y-0.5">
                  <div className="text-[11px] font-medium text-rh-light-text dark:text-rh-text tabular-nums">
                    P/E {stock.currentPE.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-rh-light-muted dark:text-rh-muted tabular-nums">
                    10Y Avg {stock.avgPE.toFixed(1)}
                  </div>
                  <div className={`text-[11px] font-bold tabular-nums ${stock.discountPct < 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {stock.discountPct > 0 ? '+' : ''}{stock.discountPct.toFixed(0)}% vs avg
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200/40 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text appearance-none cursor-pointer"
        >
          {sectors.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Sectors' : s}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {(['all', 'deep_value', 'attractive', 'fair', 'expensive'] as TierFilter[]).map(tier => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                tierFilter === tier
                  ? 'bg-white dark:bg-white/[0.1] text-rh-green shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {tier === 'all' ? 'All' : TIER_LABELS[tier]?.label || tier}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 ml-auto">
          {filtered.length} stocks
        </span>
      </div>

      {/* ─── Detailed List ─── */}
      <div className="bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl rounded-xl border border-gray-200/40 dark:border-white/[0.06] overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_80px_80px_80px_1fr_80px_60px] gap-2 px-3 py-2 border-b border-gray-200/30 dark:border-white/[0.05] text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/40">
          <span>Stock</span>
          <span className="text-right">Current P/E</span>
          <span className="text-right">10Y Avg</span>
          <span className="text-center">Trend</span>
          <span>Discount</span>
          <span className="text-right">Price</span>
          <span className="text-right">Signal</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200/10 dark:divide-white/[0.04]">
          {filtered.slice(0, 50).map(stock => (
            <button
              key={stock.ticker}
              onClick={() => onTickerClick(stock.ticker)}
              className="grid grid-cols-[1fr_80px_80px_80px_1fr_80px_60px] gap-2 items-center px-3 py-2.5 w-full text-left hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              {/* Stock info */}
              <div className="flex items-center gap-2 min-w-0">
                <StockLogo ticker={stock.ticker} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-rh-light-text dark:text-rh-text truncate">{stock.ticker}</div>
                  <div className="text-[10px] text-rh-light-muted dark:text-rh-muted truncate">{stock.name}</div>
                </div>
              </div>

              {/* Current P/E */}
              <div className="text-right text-xs font-medium text-rh-light-text dark:text-rh-text tabular-nums">
                {stock.currentPE.toFixed(1)}
              </div>

              {/* 10Y Avg */}
              <div className="text-right text-xs text-rh-light-muted dark:text-rh-muted tabular-nums">
                {stock.avgPE.toFixed(1)}
              </div>

              {/* P/E sparkline */}
              <div className="flex justify-center">
                <PESparkline history={stock.peHistory} avgPE={stock.avgPE} />
              </div>

              {/* Discount bar */}
              <DiscountBar discountPct={stock.discountPct} />

              {/* Price */}
              <div className="text-right text-xs text-rh-light-muted dark:text-rh-muted tabular-nums">
                ${stock.price.toFixed(2)}
              </div>

              {/* Tier badge */}
              <div className="flex justify-end">
                <TierBadge tier={stock.tier} />
              </div>
            </button>
          ))}
        </div>

        {filtered.length > 50 && (
          <div className="px-3 py-2 text-center text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 border-t border-gray-200/10 dark:border-white/[0.04]">
            Showing 50 of {filtered.length} stocks
          </div>
        )}
      </div>
    </div>
  );
}
