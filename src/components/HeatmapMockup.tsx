// Visual mockup for the proposed mobile-first Discover Heatmap redesign.
// Self-contained: mock data, no API calls, no real navigation. Toggled via
// ?mockup=1 URL param so it can ship to prod for review without disturbing
// the live Heatmap. Delete or wire to real data when the design is approved.

import { useState } from 'react';

interface SectorMock {
  name: string;
  pct: number;
  topMover: { ticker: string; pct: number };
  // Mini-spark as 8 normalized 0-1 values
  spark: number[];
  subgroups: { name: string; tiles: { ticker: string; pct: number; size: number }[] }[];
}

const SECTORS: SectorMock[] = [
  {
    name: 'Tech', pct: 1.2, topMover: { ticker: 'AAPL', pct: 3.21 },
    spark: [0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 0.75, 0.85],
    subgroups: [
      { name: 'Mega-Cap Tech', tiles: [
        { ticker: 'NVDA', pct: -0.73, size: 5 },
        { ticker: 'GOOGL', pct: 0.14, size: 4 },
        { ticker: 'AAPL', pct: 3.21, size: 5 },
        { ticker: 'AMZN', pct: 0.94, size: 4 },
        { ticker: 'MSFT', pct: 1.34, size: 5 },
        { ticker: 'META', pct: -0.51, size: 3 },
      ] },
      { name: 'Semiconductors', tiles: [
        { ticker: 'AVGO', pct: 0.5, size: 3 }, { ticker: 'MU', pct: -1.2, size: 2 },
        { ticker: 'AMAT', pct: 1.1, size: 2 }, { ticker: 'KLAC', pct: 0.3, size: 2 },
        { ticker: 'ADI', pct: -0.4, size: 2 }, { ticker: 'AMD', pct: 2.08, size: 3 },
        { ticker: 'INTC', pct: 6.66, size: 2 }, { ticker: 'TSM', pct: 0.40, size: 3 },
      ] },
      { name: 'Software & Cloud', tiles: [
        { ticker: 'ORCL', pct: 1.5, size: 3 }, { ticker: 'CRM', pct: -0.2, size: 2 },
        { ticker: 'NFLX', pct: 0.8, size: 2 }, { ticker: 'NOW', pct: 1.0, size: 2 },
        { ticker: 'PANW', pct: 2.1, size: 2 }, { ticker: 'SNOW', pct: -1.5, size: 2 },
      ] },
    ],
  },
  {
    name: 'Finance', pct: -0.4, topMover: { ticker: 'BLK', pct: -1.8 },
    spark: [0.7, 0.6, 0.5, 0.4, 0.5, 0.4, 0.3, 0.4],
    subgroups: [
      { name: 'Banks', tiles: [
        { ticker: 'JPM', pct: -0.54, size: 5 }, { ticker: 'BAC', pct: -0.3, size: 3 },
        { ticker: 'WFC', pct: -0.7, size: 3 }, { ticker: 'C', pct: 0.2, size: 2 },
      ] },
      { name: 'Capital Markets', tiles: [
        { ticker: 'BRK.B', pct: 0.4, size: 5 }, { ticker: 'BLK', pct: -1.8, size: 3 },
        { ticker: 'GS', pct: 0.6, size: 3 }, { ticker: 'MS', pct: -0.2, size: 3 },
      ] },
      { name: 'Payments & Fintech', tiles: [
        { ticker: 'V', pct: -0.76, size: 4 }, { ticker: 'MA', pct: -1.45, size: 4 },
        { ticker: 'AXP', pct: -0.79, size: 3 }, { ticker: 'PYPL', pct: 1.2, size: 2 },
      ] },
    ],
  },
  {
    name: 'Energy', pct: 0.8, topMover: { ticker: 'XOM', pct: 1.4 },
    spark: [0.4, 0.5, 0.7, 0.6, 0.5, 0.6, 0.7, 0.7],
    subgroups: [
      { name: 'Oil & Gas', tiles: [
        { ticker: 'XOM', pct: 1.4, size: 5 }, { ticker: 'CVX', pct: 0.9, size: 4 },
        { ticker: 'COP', pct: 0.6, size: 3 }, { ticker: 'EOG', pct: -0.2, size: 2 },
      ] },
    ],
  },
  {
    name: 'Healthcare', pct: 0.1, topMover: { ticker: 'LLY', pct: 2.91 },
    spark: [0.5, 0.5, 0.6, 0.5, 0.4, 0.5, 0.5, 0.55],
    subgroups: [
      { name: 'Pharmaceuticals', tiles: [
        { ticker: 'LLY', pct: 2.91, size: 5 }, { ticker: 'ABBV', pct: 0.4, size: 4 },
        { ticker: 'MRK', pct: -0.6, size: 3 }, { ticker: 'PFE', pct: -0.3, size: 3 },
      ] },
      { name: 'Health Insurance', tiles: [
        { ticker: 'UNH', pct: -0.8, size: 5 }, { ticker: 'CVS', pct: 0.3, size: 3 },
        { ticker: 'CI', pct: -0.1, size: 2 }, { ticker: 'ELV', pct: 0.2, size: 2 },
      ] },
    ],
  },
  {
    name: 'Consumer', pct: -0.3, topMover: { ticker: 'TSLA', pct: 2.54 },
    spark: [0.6, 0.5, 0.4, 0.3, 0.4, 0.4, 0.3, 0.35],
    subgroups: [
      { name: 'Retail', tiles: [
        { ticker: 'WMT', pct: -0.43, size: 5 }, { ticker: 'HD', pct: 0.3, size: 4 },
        { ticker: 'COST', pct: 0.6, size: 4 }, { ticker: 'TGT', pct: -0.8, size: 2 },
      ] },
      { name: 'Auto & EV', tiles: [
        { ticker: 'TSLA', pct: 2.54, size: 5 }, { ticker: 'GM', pct: 0.4, size: 2 },
        { ticker: 'F', pct: -0.5, size: 2 },
      ] },
    ],
  },
  {
    name: 'Industrial', pct: 0.5, topMover: { ticker: 'CAT', pct: 0.4 },
    spark: [0.3, 0.4, 0.5, 0.6, 0.5, 0.6, 0.65, 0.6],
    subgroups: [
      { name: 'Machinery & Equipment', tiles: [
        { ticker: 'CAT', pct: 0.4, size: 4 }, { ticker: 'DE', pct: 0.3, size: 4 },
        { ticker: 'EMR', pct: 0.2, size: 3 }, { ticker: 'MMM', pct: -0.1, size: 3 },
      ] },
    ],
  },
  {
    name: 'Communication', pct: 2.1, topMover: { ticker: 'GOOGL', pct: 0.14 },
    spark: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9],
    subgroups: [
      { name: 'Telecom & Media', tiles: [
        { ticker: 'TMUS', pct: 1.5, size: 4 }, { ticker: 'VZ', pct: -0.2, size: 3 },
        { ticker: 'T', pct: 0.8, size: 3 }, { ticker: 'DIS', pct: 1.2, size: 4 },
      ] },
    ],
  },
  {
    name: 'Real Estate', pct: -1.0, topMover: { ticker: 'PLD', pct: -1.5 },
    spark: [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.25, 0.2],
    subgroups: [
      { name: 'REITs', tiles: [
        { ticker: 'WELL', pct: -0.2, size: 4 }, { ticker: 'EQIX', pct: -0.6, size: 4 },
        { ticker: 'DLR', pct: -1.2, size: 3 }, { ticker: 'PLD', pct: -1.5, size: 3 },
      ] },
    ],
  },
];

function colorForPct(pct: number): string {
  // Maps -3% to +3% across red→neutral→green
  const clamped = Math.max(-3, Math.min(3, pct));
  if (clamped >= 0) {
    const t = clamped / 3;
    const g = Math.round(40 + 140 * t);
    return `rgb(20, ${g}, 30)`;
  }
  const t = -clamped / 3;
  const r = Math.round(40 + 140 * t);
  return `rgb(${r}, 20, 30)`;
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 60, h = 18;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="opacity-90">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  onTickerClick?: (ticker: string) => void;
}

export function HeatmapMockup({ onTickerClick }: Props) {
  const [selectedSector, setSelectedSector] = useState<SectorMock | null>(null);

  if (selectedSector) {
    return (
      <div className="px-3 py-2">
        {/* Sector detail header */}
        <button
          type="button"
          onClick={() => setSelectedSector(null)}
          className="flex items-center gap-1.5 text-[12px] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to sectors
        </button>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/40 dark:border-white/[0.06]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/70 dark:text-rh-muted/70">Sector</div>
            <div className="text-xl font-bold text-rh-light-text dark:text-white">{selectedSector.name}</div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${selectedSector.pct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              {selectedSector.pct >= 0 ? '+' : ''}{selectedSector.pct.toFixed(2)}%
            </div>
            <Spark data={selectedSector.spark} color={selectedSector.pct >= 0 ? '#00c805' : '#ff5000'} />
          </div>
        </div>

        {/* Subgroups */}
        <div className="space-y-5">
          {selectedSector.subgroups.map(sub => (
            <div key={sub.name}>
              <div className="text-[10px] uppercase tracking-wider font-bold text-rh-light-muted/80 dark:text-rh-muted/80 mb-2">{sub.name}</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                {sub.tiles.map(t => (
                  <button
                    key={t.ticker}
                    type="button"
                    onClick={() => onTickerClick?.(t.ticker)}
                    style={{ backgroundColor: colorForPct(t.pct), gridColumn: t.size >= 5 ? 'span 2' : 'span 1' }}
                    className="flex flex-col items-center justify-center text-white py-3 rounded-md cursor-pointer hover:brightness-110 active:brightness-95 transition-[filter] outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                  >
                    <span className="text-[12px] font-bold" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>{t.ticker}</span>
                    <span className="text-[10px] opacity-90" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>
                      {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sector overview grid
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/70 dark:text-rh-muted/70 mb-2">Tap a sector to drill in</div>
      <div className="grid grid-cols-2 gap-2">
        {SECTORS.map(s => (
          <button
            key={s.name}
            type="button"
            onClick={() => setSelectedSector(s)}
            style={{ backgroundColor: colorForPct(s.pct) }}
            className="flex flex-col items-start justify-between p-3 rounded-lg cursor-pointer hover:brightness-110 active:brightness-95 transition-[filter] outline-none focus-visible:ring-1 focus-visible:ring-white/60 min-h-[110px]"
          >
            <div className="w-full">
              <div className="text-[14px] font-bold text-white" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>{s.name}</div>
              <div className="text-[18px] font-extrabold text-white leading-tight" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>
                {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(2)}%
              </div>
            </div>
            <div className="w-full flex items-end justify-between mt-2">
              <Spark data={s.spark} color="rgba(255,255,255,0.9)" />
              <div className="text-[9px] text-white/80 text-right" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>
                <div className="font-semibold">{s.topMover.ticker}</div>
                <div>{s.topMover.pct >= 0 ? '+' : ''}{s.topMover.pct.toFixed(2)}%</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 text-center italic">
        Mockup using static data — gated by <code>?mockup=1</code> URL param
      </div>
    </div>
  );
}
