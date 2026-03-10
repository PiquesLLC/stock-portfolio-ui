import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { getMarketHeatmap, getIntradayCandles, HeatmapPeriod, MarketIndex, getMostFollowedStocks, getThemesHeatmap, getEtfHeatmap } from '../api';
import { SectorPerformanceChart } from './SectorPerformanceChart';
import { HeatmapResponse, HeatmapSector, HeatmapSubSector, HeatmapStock } from '../types';
import { formatCurrency } from '../utils/format';
import { StockLogo } from './StockLogo';
import { useIsDark } from '../hooks/useIsDark';
import { useTreemapLayout } from '../hooks/useTreemapLayout';
import {
  useScreenerFilters,
  CAP_RANGES, PE_RANGES, DIV_RANGES, WEEK_RANGES,
  getWeek52Pos,
  type ScreenerSortKey,
} from '../hooks/useScreenerFilters';

const CreatorDiscoverSection = lazy(() => import('./CreatorDiscoverSection').then(m => ({ default: m.CreatorDiscoverSection })));

/** Returns true when a percent change is effectively zero (rounds to +0.00% or -0.00%) */
function isEffectivelyZero(pct: number): boolean {
  return Math.abs(pct) < 0.005;
}

interface DiscoverPageProps {
  onTickerClick: (ticker: string) => void;
  onUserClick?: (userId: string) => void;
  subTab?: string | null;
  onSubTabChange?: (subtab: string) => void;
  portfolioTickers?: Set<string>;
}

/** Parse subtab string like "heatmap:THEMES" into { subTab, heatmapIndex } */
function parseSubTab(raw?: string | null): { subTab: DiscoverSubTab; heatmapIndex?: MarketIndex } {
  if (!raw) return { subTab: 'heatmap' };
  if (raw === 'sectors') return { subTab: 'sectors' };
  if (raw === 'top100') return { subTab: 'top100' };
  if (raw === 'screener') return { subTab: 'screener' };
  if (raw === 'creators') return { subTab: 'creators' };
  if (raw.startsWith('heatmap:')) {
    const idx = raw.slice(8) as MarketIndex;
    if (['SP500', 'DOW30', 'NASDAQ100', 'THEMES'].includes(idx)) {
      return { subTab: 'heatmap', heatmapIndex: idx };
    }
  }
  return { subTab: 'heatmap' };
}

// --- Squarified treemap layout algorithm ---

interface LayoutItem<T> {
  value: number;
  data: T;
}

function squarifyLayout<T>(
  items: LayoutItem<T>[],
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number; data: T }[] {
  if (items.length === 0) return [];
  if (w <= 0 || h <= 0) return [];

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects: { x: number; y: number; w: number; h: number; data: T }[] = [];
  doLayout(sorted, total, x, y, w, h, rects);
  return rects;
}

function doLayout<T>(
  items: LayoutItem<T>[],
  total: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rects: { x: number; y: number; w: number; h: number; data: T }[],
) {
  if (items.length === 0 || w <= 0 || h <= 0) return;
  if (items.length === 1) {
    rects.push({ x, y, w, h, data: items[0].data });
    return;
  }

  const isWide = w >= h;
  let stripSize = 0;
  let bestAspect = Infinity;
  let splitIndex = 1;

  for (let i = 1; i <= items.length; i++) {
    stripSize += items[i - 1].value;
    const frac = stripSize / total;
    const stripDim = isWide ? w * frac : h * frac;
    const otherDim = isWide ? h : w;

    let worstAspect = 0;
    for (let j = 0; j < i; j++) {
      const itemFrac = items[j].value / stripSize;
      const itemDim = otherDim * itemFrac;
      if (itemDim > 0 && stripDim > 0) {
        worstAspect = Math.max(worstAspect, Math.max(stripDim / itemDim, itemDim / stripDim));
      }
    }

    if (worstAspect <= bestAspect) {
      bestAspect = worstAspect;
      splitIndex = i;
    } else {
      break;
    }
  }

  const stripItems = items.slice(0, splitIndex);
  const remaining = items.slice(splitIndex);
  const stripTotal = stripItems.reduce((s, i) => s + i.value, 0);
  const stripFrac = stripTotal / total;

  let cx = x, cy = y;
  if (isWide) {
    const stripW = w * stripFrac;
    for (const item of stripItems) {
      const itemH = h * (item.value / stripTotal);
      rects.push({ x: cx, y: cy, w: stripW, h: itemH, data: item.data });
      cy += itemH;
    }
    if (remaining.length > 0) {
      doLayout(remaining, total - stripTotal, x + stripW, y, w - stripW, h, rects);
    }
  } else {
    const stripH = h * stripFrac;
    for (const item of stripItems) {
      const itemW = w * (item.value / stripTotal);
      rects.push({ x: cx, y: cy, w: itemW, h: stripH, data: item.data });
      cx += itemW;
    }
    if (remaining.length > 0) {
      doLayout(remaining, total - stripTotal, x, y + stripH, w, h - stripH, rects);
    }
  }
}

// --- Finviz-matched color palette ---
// Finviz uses a visible slate gray at 0% and bright saturated colors.
// Even small moves (±0.5%) have a clear tint — nothing looks near-black.

function getHeatColor(pct: number): string {
  const c = Math.max(-5, Math.min(5, pct));

  // Finviz-style palette: power curve so even ±0.3% shows visible color
  const bR = 62, bG = 66, bB = 78;

  if (c > 0) {
    const t = Math.pow(Math.min(c / 2.5, 1), 0.55);
    // Dark base → rich green (rgb(18,170,36))
    const r = Math.round(bR + (18 - bR) * t);
    const g = Math.round(bG + (170 - bG) * t);
    const b = Math.round(bB + (36 - bB) * t);
    return `rgb(${r},${g},${b})`;
  } else if (c < 0) {
    const t = Math.pow(Math.min(Math.abs(c) / 2.5, 1), 0.55);
    // Dark base → deep red (rgb(200,58,50))
    const r = Math.round(bR + (200 - bR) * t);
    const g = Math.round(bG + (58 - bG) * t);
    const b = Math.round(bB + (50 - bB) * t);
    return `rgb(${r},${g},${b})`;
  }
  return `rgb(${bR},${bG},${bB})`;
}

function getHeatColorLight(pct: number): string {
  const c = Math.max(-5, Math.min(5, pct));
  // Power curve so even ±0.2% shows clear color — less grey overall
  const bR = 200, bG = 202, bB = 206;

  if (c > 0) {
    const t = Math.pow(Math.min(c / 2.5, 1), 0.55);
    const r = Math.round(bR + (30 - bR) * t);
    const g = Math.round(bG + (175 - bG) * t);
    const b = Math.round(bB + (45 - bB) * t);
    return `rgb(${r},${g},${b})`;
  } else if (c < 0) {
    const t = Math.pow(Math.min(Math.abs(c) / 2.5, 1), 0.55);
    const r = Math.round(bR + (215 - bR) * t);
    const g = Math.round(bG + (55 - bG) * t);
    const b = Math.round(bB + (50 - bB) * t);
    return `rgb(${r},${g},${b})`;
  }
  return `rgb(${bR},${bG},${bB})`;
}

// Dampen market cap so mega-caps don't eat the whole map.
// Uses a floor ratio to guarantee every stock gets at least minRatio of the
// largest stock's area, preventing unreadable slivers.
function dampenCap(cap: number, exponent = 0.45): number {
  return Math.pow(Math.max(cap, 0.1), exponent);
}

function dampenCapWithFloor(
  caps: number[],
  exponent: number,
  minRatio: number,
): number[] {
  if (caps.length === 0) return [];
  const dampened = caps.map(c => dampenCap(c, exponent));
  const maxVal = Math.max(...dampened);
  const floor = maxVal * minRatio;
  return dampened.map(d => Math.max(d, floor));
}

// Layout result types are now in useTreemapLayout hook

// --- Treemap component ---

const GAP_DESKTOP = 1.5;
const GAP_MOBILE = 0.75;
const SECTOR_LABEL_H = 18;
const SUB_SECTOR_LABEL_H = 12;
const SECTOR_GAP_DESKTOP = 3;
const SECTOR_GAP_MOBILE = 1.5;

/** Abbreviate multi-word sub-sector names to initials, e.g. "Machinery & Equipment" → "M & E" */
function abbreviateSubSector(name: string): string {
  const words = name.split(/\s+/);
  if (words.length <= 1) return name;
  return words.map(w => w === '&' ? '&' : w[0]).join(' ');
}

/** Map sector names to their primary SPDR Select Sector ETF */
const SECTOR_ETF: Record<string, string> = {
  'Tech': 'XLK',
  'Finance': 'XLF',
  'Healthcare': 'XLV',
  'Energy': 'XLE',
  'Consumer': 'XLY',
  'Industrial': 'XLI',
  'Communication': 'XLC',
  'Materials': 'XLB',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
};

function Treemap({
  sectors,
  onTickerClick,
  highlightedSector,
  stockCount,
  isThemes,
}: {
  sectors: HeatmapSector[];
  onTickerClick: (ticker: string) => void;
  highlightedSector?: string | null;
  stockCount?: number;
  isThemes?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hoveredStock, setHoveredStock] = useState<HeatmapStock | null>(null);
  const [hoveredSubSector, setHoveredSubSector] = useState<{ sector: string; subSector: string } | null>(null);
  const [hoveredSectorLabel, setHoveredSectorLabel] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tappedStock, setTappedStock] = useState<{ stock: HeatmapStock; sectorName: string } | null>(null);
  const isDark = useIsDark();

  // Themes drilldown: click subtheme → show individual tickers
  const [drilldownTheme, setDrilldownTheme] = useState<{ theme: string; subtheme: string } | null>(null);
  const isThemesDefault = !!(isThemes && !drilldownTheme);
  const isThemesDrilldown = !!(isThemes && drilldownTheme);

  // Reset drilldown when switching tabs
  useEffect(() => { setDrilldownTheme(null); }, [isThemes]);

  // Build sub-sector lookup for the popup
  const subSectorMap = useMemo(() => {
    const map = new Map<string, { sector: HeatmapSector; subSector: HeatmapSubSector }>();
    for (const sector of sectors) {
      for (const sub of sector.subSectors) {
        map.set(`${sector.name}::${sub.name}`, { sector, subSector: sub });
      }
    }
    return map;
  }, [sectors]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const computeHeight = (width: number) => {
      const isMobile = width < 640;
      // Match Finviz proportions: ~2:1 aspect ratio (width × 0.52)
      const maxViewportH = Math.max(400, window.innerHeight - 180);
      const naturalH = isMobile
        ? Math.max(320, Math.round(width * 0.85))
        : Math.max(500, Math.round(width * 0.52));
      return Math.min(naturalH, maxViewportH);
    };
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ width, height: computeHeight(width) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pick dampening parameters based on stock count:
  // Fewer stocks (DOW 30) need more aggressive dampening + higher floor
  const isMobile = dims.width > 0 && dims.width < 640;
  const dampenExponent = (stockCount ?? 500) <= 35 ? 0.35 : (stockCount ?? 500) <= 105 ? 0.40 : 0.45;
  const baseFloor = (stockCount ?? 500) <= 35 ? 0.12 : (stockCount ?? 500) <= 105 ? 0.06 : 0.03;
  const minFloorRatio = isMobile ? Math.max(baseFloor, 0.05) : baseFloor;

  const SECTOR_GAP = isMobile ? SECTOR_GAP_MOBILE : SECTOR_GAP_DESKTOP;

  // Treemap layout computation (extracted to hook)
  const { sectorRects, drilldownRects } = useTreemapLayout({
    sectors,
    dims,
    dampenExponent,
    minFloorRatio,
    sectorGap: SECTOR_GAP,
    isThemesDefault,
    isThemesDrilldown,
    drilldownTheme,
    squarifyLayout,
    dampenCapWithFloor,
  });

  // Use drilldown rects when drilling into a subtheme, otherwise normal layout
  const displayRects = drilldownRects || sectorRects;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  const handleStockHover = useCallback((stock: HeatmapStock, sectorName: string) => {
    setHoveredStock(stock);
    setHoveredSubSector({ sector: sectorName, subSector: stock.subSector });
  }, []);

  const handleStockLeave = useCallback(() => {
    setHoveredStock(null);
    setHoveredSubSector(null);
  }, []);

  if (dims.width === 0) {
    return <div ref={containerRef} className="w-full min-h-[500px]" />;
  }

  const GAP = dims.width < 640 ? GAP_MOBILE : GAP_DESKTOP;
  const tileStroke = isDark ? '#2a2d3a' : '#999';

  // Get the sub-sector stocks for the popup
  const popupSubSector = hoveredSubSector
    ? subSectorMap.get(`${hoveredSubSector.sector}::${hoveredSubSector.subSector}`)
    : null;

  return (
    <div ref={containerRef} className="w-full relative isolate" onMouseMove={handleMouseMove}
      onClick={() => { if (tappedStock) { setTappedStock(null); setHoveredStock(null); setHoveredSubSector(null); } }}
    >
      {/* Back button for themes drilldown */}
      {isThemesDrilldown && drilldownTheme && (
        <button
          onClick={(e) => { e.stopPropagation(); setDrilldownTheme(null); setHoveredStock(null); setHoveredSubSector(null); setTappedStock(null); }}
          className="absolute top-1 left-2 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-lg
            bg-black/60 dark:bg-black/70 backdrop-blur-sm
            text-white/90 text-[10px] font-semibold uppercase tracking-wide
            hover:bg-black/80 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          {drilldownTheme.theme}
        </button>
      )}
      <div className="rounded-2xl overflow-hidden border border-gray-200/60 dark:border-white/[0.08] shadow-2xl shadow-black/40 relative z-0"
        style={{ background: isDark ? '#0f0f12' : (dims.width < 640 ? '#f0f0f4' : 'rgba(240,240,244,0.95)'), backdropFilter: dims.width < 640 ? undefined : 'blur(20px)' }}
      >
      <svg
        width={dims.width}
        height={dims.height}
        className="block"
        style={{ background: 'transparent' }}
      >
        {displayRects.map((sr) => (
          <g key={sr.sector.name}>
            {/* Sector background */}
            <rect
              x={sr.x + 1}
              y={sr.y + 1}
              width={Math.max(0, sr.w - 2)}
              height={Math.max(0, sr.h - 2)}
              fill={isDark ? '#1e2030' : '#c8c8c8'}
              rx={1}
            />
            {/* Sector label bar — clicks through to sector ETF */}
            {sr.w > 10 && (() => {
              const etf = SECTOR_ETF[sr.sector.name];
              const isLabelHovered = hoveredSectorLabel === sr.sector.name;
              return (
                <g
                  onClick={etf ? () => onTickerClick(etf) : undefined}
                  onMouseEnter={etf ? () => setHoveredSectorLabel(sr.sector.name) : undefined}
                  onMouseLeave={etf ? () => setHoveredSectorLabel(null) : undefined}
                  style={etf ? { cursor: 'pointer' } : undefined}
                >
                  <rect
                    x={sr.x + 2}
                    y={sr.y + 2}
                    width={Math.max(0, sr.w - 4)}
                    height={SECTOR_LABEL_H - 1}
                    fill={isLabelHovered
                      ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)')
                      : (isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.20)')}
                    rx={1}
                    style={{ transition: 'fill 0.15s' }}
                  />
                  <clipPath id={`slbl-${sr.sector.name.replace(/[^a-zA-Z]/g, '')}`}>
                    <rect x={sr.x + 2} y={sr.y} width={Math.max(0, sr.w - 4)} height={SECTOR_LABEL_H + 2} />
                  </clipPath>
                  {(() => {
                    const rawLabel = isThemesDrilldown && drilldownTheme
                      ? drilldownTheme.subtheme
                      : sr.sector.name;
                    const labelPad = SECTOR_GAP + 7 + 4; // left padding + right margin
                    const availW = sr.w - labelPad;

                    // Fit full label: compute font size from available width.
                    // 0.75 accounts for uppercase bold + letter-spacing. Max 8px to
                    // keep labels compact (matches the 70 % zoom aesthetic).
                    const CHAR_W_RATIO = 0.75;
                    const idealSize = availW / (rawLabel.length * CHAR_W_RATIO);
                    const labelFontSize = Math.min(8, Math.max(3.5, idealSize));

                    // Last-resort truncation when even min font overflows
                    const maxCharsAtSize = Math.max(3, Math.floor(availW / (labelFontSize * CHAR_W_RATIO)));
                    const labelText = rawLabel.length > maxCharsAtSize
                      ? rawLabel.slice(0, maxCharsAtSize).trimEnd()
                      : rawLabel;

                    return (
                      <text
                        x={sr.x + SECTOR_GAP + 7}
                        y={sr.y + SECTOR_LABEL_H - 4}
                        fontSize={labelFontSize}
                        fontWeight={800}
                        fill={isLabelHovered
                          ? (isDark ? '#fff' : 'rgba(0,0,0,0.95)')
                          : (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)')}
                        clipPath={`url(#slbl-${sr.sector.name.replace(/[^a-zA-Z]/g, '')})`}
                        style={{
                          pointerEvents: 'none',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          textTransform: 'uppercase',
                          letterSpacing: labelFontSize > 5.5 ? '0.04em' : '0.01em',
                          transition: 'fill 0.15s',
                        }}
                      >
                        {labelText}
                      </text>
                    );
                  })()}
                </g>
              );
            })()}
            {/* Sub-sector groups */}
            {sr.subSectors.map((subR) => {
              const subFontSize = subR.w > 120 ? 7.5 : subR.w > 60 ? 6 : 4.5;
              const charW = subFontSize * 0.58;
              const fullFits = subR.subSector.name.length * charW < subR.w - 6;
              const abbr = abbreviateSubSector(subR.subSector.name);
              const abbrFits = abbr.length * charW < subR.w - 6;
              const maxChars = Math.max(3, Math.floor((subR.w - 6) / charW));
              const truncName = subR.subSector.name.slice(0, maxChars);
              const showSubLabel = sr.sector.subSectors.length > 1 && subR.h > 16 && subR.w > 20;
              const isSubHovered = hoveredSubSector?.sector === sr.sector.name
                && hoveredSubSector?.subSector === subR.subSector.name;
              return (
                <g key={subR.subSector.name}>
                  {/* Sub-sector border (thin separator) */}
                  {sr.sector.subSectors.length > 1 && (
                    <rect
                      x={subR.x}
                      y={subR.y}
                      width={subR.w}
                      height={subR.h}
                      fill="none"
                      stroke={isDark ? '#2a2c38' : '#bbb'}
                      strokeWidth={0.5}
                    />
                  )}
                  {/* Sub-sector label — abbreviated when tight, expands on hover */}
                  {showSubLabel && (() => {
                    const expanded = isSubHovered || fullFits;
                    const labelText = expanded ? subR.subSector.name : (abbrFits ? abbr : truncName);
                    const clipId = `sc-${sr.sector.name}-${subR.subSector.name}`.replace(/[^a-zA-Z0-9]/g, '_');
                    return (
                      <>
                        <clipPath id={clipId}>
                          <rect x={subR.x} y={subR.y} width={subR.w} height={SUB_SECTOR_LABEL_H} />
                        </clipPath>
                        <rect
                          x={subR.x + 1}
                          y={subR.y + 1}
                          width={Math.max(0, subR.w - 2)}
                          height={SUB_SECTOR_LABEL_H - 1}
                          fill={isSubHovered
                            ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)')
                            : (isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)')}
                          rx={0.5}
                          style={{ transition: 'fill 0.15s', pointerEvents: 'none' }}
                        />
                        <text
                          x={subR.x + 3}
                          y={subR.y + SUB_SECTOR_LABEL_H - 3}
                          fontSize={subFontSize}
                          fontWeight={600}
                          fill={isSubHovered
                            ? (isDark ? 'rgba(255,255,255,0.90)' : 'rgba(0,0,0,0.85)')
                            : (isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)')}
                          clipPath={`url(#${clipId})`}
                          style={{
                            pointerEvents: 'none',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            textTransform: 'uppercase',
                            letterSpacing: subR.w > 60 ? '0.04em' : '0.02em',
                            transition: 'fill 0.15s',
                          }}
                        >
                          {labelText}
                        </text>
                      </>
                    );
                  })()}
                  {/* Stock / subtheme tiles */}
                  {subR.children.map((r) => {
                    const isHovered = hoveredStock?.ticker === r.stock.ticker;
                    const isInHoveredSub = hoveredSubSector
                      ? r.sectorName === hoveredSubSector.sector && r.subSectorName === hoveredSubSector.subSector
                      : false;
                    const tileW = Math.max(0, r.w - GAP);
                    const tileH = Math.max(0, r.h - GAP);
                    const halfGap = GAP / 2;

                    let opacity = 1;
                    if (hoveredStock) {
                      if (isHovered) opacity = 1;
                      else if (isInHoveredSub) opacity = 0.9;
                      else opacity = 0.55;
                    } else if (highlightedSector) {
                      opacity = r.sectorName === highlightedSector ? 1 : 0.25;
                    }

                    const tileClipId = `tc-${r.sectorName}-${r.stock.ticker}`.replace(/[^a-zA-Z0-9_-]/g, '_');

                    // --- Themes mode: area-based left-aligned text for long subtheme names ---
                    if (isThemesDefault) {
                      const area = tileW * tileH;
                      const showLabel = isMobile ? (area >= 300 && tileW > 12 && tileH > 10) : area >= 900;
                      const showPct = isMobile ? area >= 1200 : area >= 2400;
                      const fontSize = area >= 4200 ? 11 : area >= 1800 ? 10 : isMobile && area < 900 ? 7 : 9;
                      const pctFontSize = Math.max(fontSize - 1, 6);
                      const pad = area >= 4200 ? 6 : area >= 1800 ? 4 : isMobile && area < 900 ? 2 : 3;
                      const charW = fontSize * 0.58;
                      const maxChars = Math.max(1, Math.floor((tileW - pad * 2) / charW));
                      const fullLabel = r.stock.ticker;
                      const labelText = fullLabel.length > maxChars
                        ? fullLabel.slice(0, Math.max(1, maxChars - 1)) + '\u2026'
                        : fullLabel;
                      const labelY = r.y + halfGap + pad + fontSize;
                      const pctY = showPct ? labelY + fontSize + 1 : 0;

                      return (
                        <g
                          key={`${r.sectorName}::${r.stock.ticker}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrilldownTheme({ theme: r.sectorName, subtheme: r.stock.ticker });
                            setHoveredStock(null);
                            setHoveredSubSector(null);
                            setTappedStock(null);
                          }}
                          onMouseEnter={() => { if (!tappedStock) handleStockHover(r.stock, r.sectorName); }}
                          onMouseLeave={() => { if (!tappedStock) handleStockLeave(); }}
                          style={{ cursor: 'pointer' }}
                        >
                          <rect
                            x={r.x + halfGap} y={r.y + halfGap} width={tileW} height={tileH}
                            fill={isDark ? getHeatColor(r.stock.changePercent) : getHeatColorLight(r.stock.changePercent)}
                            stroke={isHovered ? '#fff' : tileStroke}
                            strokeWidth={isHovered ? 1.5 : 0.5}
                            opacity={opacity}
                            style={{ transition: 'opacity 0.15s' }}
                          />
                          {showLabel && (
                            <>
                              <clipPath id={tileClipId}>
                                <rect x={r.x + halfGap} y={r.y + halfGap} width={tileW} height={tileH} />
                              </clipPath>
                              <g clipPath={`url(#${tileClipId})`} opacity={opacity}>
                                <text
                                  x={r.x + halfGap + pad} y={labelY}
                                  textAnchor="start" fontSize={fontSize} fontWeight={700} fill="#fff"
                                  style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)' }}
                                >
                                  {labelText}
                                </text>
                                {showPct && (
                                  <text
                                    x={r.x + halfGap + pad} y={pctY}
                                    textAnchor="start" fontSize={pctFontSize} fontWeight={600} fill="rgba(255,255,255,0.92)"
                                    style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)' }}
                                  >
                                    {r.stock.changePercent >= 0 ? '+' : ''}{r.stock.changePercent.toFixed(2)}%
                                  </text>
                                )}
                              </g>
                            </>
                          )}
                        </g>
                      );
                    }

                    // --- Stock heatmap mode (S&P 500, DOW, NASDAQ): centered text, dimension-scaled fonts ---
                    const showTicker = tileW > 6 && tileH > 5;
                    const showPct = isMobile ? (tileW > 38 && tileH > 24) : (tileW > 28 && tileH > 22);
                    const fontSize = tileW > 110 && tileH > 65 ? 15
                      : tileW > 80 && tileH > 50 ? 13
                      : tileW > 55 && tileH > 35 ? 11
                      : tileW > 35 && tileH > 22 ? 9
                      : tileW > 20 && tileH > 14 ? 7.5
                      : tileW > 14 && tileH > 9 ? 5.5
                      : tileW > 9 && tileH > 6 ? 4.5
                      : 3.5;
                    const pctFontSize = fontSize > 10 ? fontSize - 2 : fontSize * 0.8;

                    return (
                      <g
                        key={`${r.sectorName}::${r.stock.ticker}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tappedStock?.stock.ticker === r.stock.ticker) {
                            onTickerClick(r.stock.ticker);
                            setTappedStock(null);
                            setHoveredStock(null);
                            setHoveredSubSector(null);
                          } else {
                            setTappedStock({ stock: r.stock, sectorName: r.sectorName });
                            setHoveredStock(r.stock);
                            setHoveredSubSector({ sector: r.sectorName, subSector: r.stock.subSector });
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                          }
                        }}
                        onMouseEnter={() => { if (!tappedStock) handleStockHover(r.stock, r.sectorName); }}
                        onMouseLeave={() => { if (!tappedStock) handleStockLeave(); }}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={r.x + halfGap} y={r.y + halfGap} width={tileW} height={tileH}
                          fill={isDark ? getHeatColor(r.stock.changePercent) : getHeatColorLight(r.stock.changePercent)}
                          stroke={isHovered ? '#fff' : tileStroke}
                          strokeWidth={isHovered ? 1.5 : 0.5}
                          opacity={opacity}
                          style={{ transition: 'opacity 0.15s' }}
                        />
                        {showTicker && (
                          <>
                            <clipPath id={tileClipId}>
                              <rect x={r.x + halfGap} y={r.y + halfGap} width={tileW} height={tileH} />
                            </clipPath>
                            <g clipPath={`url(#${tileClipId})`} opacity={opacity}>
                              <text
                                x={r.x + halfGap + tileW / 2}
                                y={r.y + halfGap + tileH / 2 + (showPct ? -pctFontSize * 0.35 : fontSize * 0.35)}
                                textAnchor="middle" fontSize={fontSize} fontWeight={700} fill="#fff"
                                style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)' }}
                              >
                                {r.stock.ticker}
                              </text>
                              {showPct && (
                                <text
                                  x={r.x + halfGap + tileW / 2}
                                  y={r.y + halfGap + tileH / 2 + pctFontSize * 0.9}
                                  textAnchor="middle" fontSize={pctFontSize} fontWeight={600} fill="rgba(255,255,255,0.92)"
                                  style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)' }}
                                >
                                  {r.stock.changePercent >= 0 ? '+' : ''}{r.stock.changePercent.toFixed(2)}%
                                </text>
                              )}
                            </g>
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      </div>

      {/* Finviz-style sub-sector popup */}
      {hoveredStock && popupSubSector && (
        <div
          className={`absolute z-50 rounded-xl shadow-lg shadow-black/25 dark:shadow-2xl dark:shadow-black/60 border text-xs
            bg-white dark:bg-[#1a1a1e] border-gray-200/60 dark:border-white/10
            ${tappedStock ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{
            left: Math.min(
              tooltipPos.x + 16,
              dims.width - 280,
            ),
            top: Math.max(tooltipPos.y - 40, 4),
            width: 260,
            maxHeight: dims.height - 8,
          }}
        >
          {/* Header: SECTOR - SUBSECTOR */}
          <div className="px-3 py-2 border-b border-gray-200/60 dark:border-white/5">
            <div className="font-bold text-[10px] tracking-wide uppercase text-rh-light-muted dark:text-rh-muted">
              {popupSubSector.sector.name === popupSubSector.subSector.name
                ? popupSubSector.sector.name
                : `${popupSubSector.sector.name} — ${popupSubSector.subSector.name}`}
            </div>
          </div>

          {/* Hovered stock highlight — shown for normal stocks and drilldown tickers */}
          {!isThemesDefault && (
            <div className="px-3 py-2 border-b border-white/10 dark:border-white/5 bg-white/50 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-rh-light-text dark:text-rh-text">{hoveredStock.ticker}</span>
                <span className={`text-sm font-bold ${hoveredStock.noTradeData ? 'text-rh-light-muted/50 dark:text-rh-muted/50' : isEffectivelyZero(hoveredStock.changePercent) ? 'text-rh-light-muted dark:text-rh-muted' : hoveredStock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {hoveredStock.noTradeData ? '--' : `${hoveredStock.changePercent >= 0 ? '+' : ''}${hoveredStock.changePercent.toFixed(2)}%`}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-rh-light-muted dark:text-rh-muted truncate mr-2">{hoveredStock.name}</span>
                <span className="text-rh-light-text dark:text-rh-text font-medium">{formatCurrency(hoveredStock.price)}</span>
              </div>
            </div>
          )}

          {/* Themes default: show avg change for subtheme */}
          {isThemesDefault && (
            <div className="px-3 py-2 border-b border-white/10 dark:border-white/5 bg-white/50 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">Avg change</span>
                <span className={`text-sm font-bold ${isEffectivelyZero(hoveredStock.changePercent) ? 'text-rh-light-muted dark:text-rh-muted' : hoveredStock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {hoveredStock.changePercent >= 0 ? '+' : ''}{hoveredStock.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mt-0.5">
                {popupSubSector.subSector.stocks.length} stocks in this subtheme
              </div>
            </div>
          )}

          {/* Top stocks in this sub-sector (no scroll) */}
          <div>
            {[...popupSubSector.subSector.stocks]
              .sort((a, b) => b.marketCapB - a.marketCapB)
              .slice(0, 6)
              .map((s) => {
                const isActive = !isThemesDefault && s.ticker === hoveredStock.ticker;
                return (
                  <div
                    key={s.ticker}
                    className={`flex items-center justify-between px-3 py-1 ${isActive ? 'bg-white/40 dark:bg-white/10' : ''}`}
                    onClick={isThemesDefault ? (e) => { e.stopPropagation(); onTickerClick(s.ticker); setTappedStock(null); setHoveredStock(null); } : undefined}
                    style={isThemesDefault ? { cursor: 'pointer' } : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-semibold text-[11px] w-[42px] shrink-0 ${isActive ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted dark:text-rh-muted'}`}>
                        {s.ticker}
                      </span>
                      <span className="text-[10px] text-rh-light-muted/70 dark:text-rh-muted/70 truncate">
                        {formatCurrency(s.price)}
                      </span>
                    </div>
                    <span className={`text-[11px] font-semibold shrink-0 ${s.noTradeData ? 'text-rh-light-muted/50 dark:text-rh-muted/50' : isEffectivelyZero(s.changePercent) ? 'text-rh-light-muted dark:text-rh-muted' : s.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {s.noTradeData ? '--' : `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`}
                    </span>
                  </div>
                );
              })}
            {popupSubSector.subSector.stocks.length > 6 && (
              <div className="px-3 py-1.5 text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 text-center">
                +{popupSubSector.subSector.stocks.length - 6} more
              </div>
            )}
          </div>
          {/* Tap-again hint for mobile */}
          {tappedStock && !isThemesDefault && (
            <button
              className="w-full px-3 py-2 border-t border-white/10 dark:border-white/5 text-center text-[10px] font-medium text-rh-green hover:bg-rh-green/10 transition-colors rounded-b-xl"
              onClick={(e) => { e.stopPropagation(); onTickerClick(tappedStock.stock.ticker); setTappedStock(null); setHoveredStock(null); }}
            >
              Tap to view {tappedStock.stock.ticker} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Color legend ---

function ColorLegend() {
  const steps = [-3, -2, -1, 0, 1, 2, 3];
  const isDark = useIsDark();
  return (
    <div className="flex items-center justify-end gap-px mt-2">
      {steps.map((pct) => (
        <div key={pct} className="flex flex-col items-center">
          <div
            className="w-10 h-3.5"
            style={{
              background: isDark ? getHeatColor(pct) : getHeatColorLight(pct),
              borderRadius: pct === -3 ? '3px 0 0 3px' : pct === 3 ? '0 3px 3px 0' : 0,
            }}
          />
          <span className="text-[9px] font-medium text-gray-500 dark:text-rh-muted mt-0.5">
            {pct > 0 ? '+' : ''}{pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Top movers ---

function TopMovers({
  stocks,
  onTickerClick,
}: {
  stocks: HeatmapStock[];
  onTickerClick: (ticker: string) => void;
}) {
  // Deduplicate stocks by ticker (a stock can appear in multiple themes/sectors)
  const uniqueStocks = useMemo(() => {
    const seen = new Map<string, HeatmapStock>();
    for (const s of stocks) {
      if (!seen.has(s.ticker)) seen.set(s.ticker, s);
    }
    return [...seen.values()];
  }, [stocks]);

  const gainers = useMemo(() =>
    [...uniqueStocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8),
    [uniqueStocks],
  );
  const losers = useMemo(() =>
    [...uniqueStocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8),
    [uniqueStocks],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4">
        <h3 className="text-sm font-semibold text-rh-green mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
          Top Gainers
        </h3>
        <div className="space-y-1.5">
          {gainers.map((s) => (
            <button
              key={s.ticker}
              onClick={() => onTickerClick(s.ticker)}
              className="w-full flex items-center justify-between py-1.5 px-2 min-h-[44px] rounded-lg hover:bg-rh-light-bg dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-rh-light-text dark:text-rh-text">{s.ticker}</span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted truncate max-w-[100px] hidden sm:inline">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">{formatCurrency(s.price)}</span>
                <span className="text-xs font-semibold text-rh-green min-w-[52px] text-right">+{s.changePercent.toFixed(2)}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4">
        <h3 className="text-sm font-semibold text-rh-red mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
          Top Losers
        </h3>
        <div className="space-y-1.5">
          {losers.map((s) => (
            <button
              key={s.ticker}
              onClick={() => onTickerClick(s.ticker)}
              className="w-full flex items-center justify-between py-1.5 px-2 min-h-[44px] rounded-lg hover:bg-rh-light-bg dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-rh-light-text dark:text-rh-text">{s.ticker}</span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted truncate max-w-[100px] hidden sm:inline">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">{formatCurrency(s.price)}</span>
                <span className="text-xs font-semibold text-rh-red min-w-[52px] text-right">{s.changePercent.toFixed(2)}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Sector performance bars ---

function SectorBars({ sectors, highlightedSector, onSectorClick, isThemes }: { sectors: HeatmapSector[]; highlightedSector?: string | null; onSectorClick?: (name: string) => void; isThemes?: boolean }) {
  const sorted = useMemo(() =>
    [...sectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent),
    [sectors],
  );
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.avgChangePercent)), 1);

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4 mt-4">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">{isThemes ? 'Theme Performance' : 'Sector Performance'}</h3>
      <div className="space-y-2">
        {sorted.map((s) => {
          const pct = s.avgChangePercent;
          const barWidth = (Math.abs(pct) / maxAbs) * 50;
          const isPositive = pct >= 0;
          const isZero = isEffectivelyZero(pct);
          return (
            <div
              key={s.name}
              className={`flex items-center gap-3 cursor-pointer rounded-lg px-1 -mx-1 transition-all ${highlightedSector === s.name ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
              onClick={() => onSectorClick?.(s.name)}
            >
              <span className={`text-xs w-20 sm:w-28 text-right shrink-0 font-medium transition-colors ${highlightedSector === s.name ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted dark:text-rh-muted'}`}>{s.name}</span>
              <div className="flex-1 flex items-center h-5">
                <div className="relative w-full h-full flex items-center">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-rh-light-border/40 dark:bg-rh-border/40" />
                  <div
                    className="absolute h-4 rounded-sm transition-all duration-500"
                    style={{
                      left: isPositive ? '50%' : `${50 - barWidth}%`,
                      width: `${barWidth}%`,
                      background: isZero ? '#888' : isPositive ? '#00C805' : '#E8544E',
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
              <span className={`text-xs font-semibold min-w-[50px] text-right ${isZero ? 'text-rh-light-muted dark:text-rh-muted' : isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
                {isPositive ? '+' : ''}{pct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main page ---

const PERIODS: { id: HeatmapPeriod; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
];

const PERIOD_LABELS: Record<HeatmapPeriod, string> = {
  '1D': 'daily change',
  '1W': 'weekly change',
  '1M': 'monthly change',
  '3M': '3-month change',
  '6M': '6-month change',
  '1Y': 'yearly change',
};

const INDEXES: { id: MarketIndex; label: string; fullName: string }[] = [
  { id: 'SP500', label: 'S&P 500', fullName: 'S&P 500' },
  { id: 'DOW30', label: 'DOW', fullName: 'Dow Jones Industrial Average' },
  { id: 'NASDAQ100', label: 'NASDAQ', fullName: 'NASDAQ-100' },
  { id: 'THEMES', label: 'Themes', fullName: 'Market Themes' },
  { id: 'ETF', label: 'ETFs', fullName: 'Exchange-Traded Funds' },
];

// In-memory cache keyed by "period-index" so switching is instant
const heatmapCache = new Map<string, { data: HeatmapResponse; ts: number }>();

function cacheKey(period: HeatmapPeriod, index: MarketIndex): string {
  return `${period}-${index}`;
}

// Pick up preloaded data from App.tsx boot (stored on window)
const preloaded = window.__heatmapPreload;
if (preloaded && !heatmapCache.has(cacheKey('1D', 'SP500'))) {
  heatmapCache.set(cacheKey('1D', 'SP500'), preloaded);
  delete window.__heatmapPreload;
}


type DiscoverSubTab = 'sectors' | 'heatmap' | 'top100' | 'screener' | 'creators';

/* ─── Top 100 by Volume ─── */

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toLocaleString();
}

function formatMktCap(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(1)}T`;
  if (b >= 1) return `$${b.toFixed(0)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

const RANK_COLORS: Record<number, string> = {
  1: '#FFF176',
  2: '#F5F5F5',
  3: '#FFB74D',
};

type VolumeFilter = 'top100' | 'gainers' | 'losers' | 'unusual' | 'mostFollowed';
const VOLUME_FILTERS: { id: VolumeFilter; label: string; dot?: string }[] = [
  { id: 'top100', label: 'Top 100' },
  { id: 'gainers', label: 'Gainers', dot: '#16c784' },
  { id: 'losers', label: 'Losers', dot: '#ea3943' },
  { id: 'unusual', label: 'Unusual Vol', dot: '#f5a524' },
  { id: 'mostFollowed', label: 'Most Followed', dot: '#a855f7' },
];

function Top100View({ stocks, onTickerClick, portfolioTickers }: { stocks: HeatmapStock[]; onTickerClick: (ticker: string) => void; portfolioTickers?: Set<string> }) {
  const [filter, setFilter] = useState<VolumeFilter>('top100');
  const [visibleCount, setVisibleCount] = useState(10);
  const [heroTicker, setHeroTicker] = useState<string | null>(null);
  const [heroSparkline, setHeroSparkline] = useState<string>('');
  const [heroLoading, setHeroLoading] = useState(false);
  const sparklineCacheRef = useRef<Map<string, string>>(new Map());
  const isDark = useIsDark();

  // Most Followed data
  const [mostFollowedMap, setMostFollowedMap] = useState<Map<string, number>>(new Map());
  const [mostFollowedLoading, setMostFollowedLoading] = useState(false);
  const mostFollowedFetched = useRef(false);

  useEffect(() => {
    if (filter !== 'mostFollowed' || mostFollowedFetched.current) return;
    setMostFollowedLoading(true);
    getMostFollowedStocks()
      .then(data => {
        const map = new Map<string, number>();
        for (const d of data) map.set(d.symbol, d.followerCount);
        setMostFollowedMap(map);
        mostFollowedFetched.current = true;
      })
      .catch(e => console.error('Most followed fetch failed:', e))
      .finally(() => setMostFollowedLoading(false));
  }, [filter]);

  // Fetch sparkline for hero when ticker changes
  useEffect(() => {
    if (!heroTicker) { setHeroSparkline(''); return; }
    const cached = sparklineCacheRef.current.get(heroTicker);
    if (cached) { setHeroSparkline(cached); return; }
    let cancelled = false;
    setHeroLoading(true);
    getIntradayCandles(heroTicker).then(candles => {
      if (cancelled || candles.length < 2) return;
      const prices = candles.map(c => c.close);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range = max - min || 1;
      const w = 140, h = 32;
      const path = prices.map((v, i) => {
        const x = (i / (prices.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      sparklineCacheRef.current.set(heroTicker, path);
      if (!cancelled) setHeroSparkline(path);
    }).catch(e => console.error('Sparkline fetch failed:', e)).finally(() => { if (!cancelled) setHeroLoading(false); });
    return () => { cancelled = true; };
  }, [heroTicker]);

  const withVolume = useMemo(() => {
    return stocks.filter(s => (s.volume ?? 0) > 0);
  }, [stocks]);

  const filtered = useMemo(() => {
    const byVol = [...withVolume].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    switch (filter) {
      case 'gainers':
        return byVol.filter(s => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 100);
      case 'losers':
        return byVol.filter(s => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 100);
      case 'unusual':
        return byVol.filter(s => {
          if ((s.avgVolume ?? 0) <= 0) return false;
          return ((s.volume ?? 0) / (s.avgVolume ?? 1)) >= 1.5;
        }).slice(0, 100);
      case 'mostFollowed':
        return [...withVolume]
          .filter(s => mostFollowedMap.has(s.ticker))
          .sort((a, b) => (mostFollowedMap.get(b.ticker) ?? 0) - (mostFollowedMap.get(a.ticker) ?? 0))
          .slice(0, 100);
      default:
        return byVol.slice(0, 100);
    }
  }, [withVolume, filter, mostFollowedMap]);

  const maxVol = filtered.length > 0 ? Math.max(...filtered.map(s => s.volume ?? 0)) : 1;

  // Stats for the hero banner
  const top100ForStats = useMemo(() => {
    return [...withVolume].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 100);
  }, [withVolume]);
  const totalVol = useMemo(() => top100ForStats.reduce((s, st) => s + (st.volume ?? 0), 0), [top100ForStats]);
  const avgChange = useMemo(() => {
    if (top100ForStats.length === 0) return 0;
    return top100ForStats.reduce((s, st) => s + st.changePercent, 0) / top100ForStats.length;
  }, [top100ForStats]);
  const highVolCount = useMemo(() => withVolume.filter(s => {
    if ((s.avgVolume ?? 0) <= 0) return false;
    return ((s.volume ?? 0) / (s.avgVolume ?? 1)) >= 1.5;
  }).length, [withVolume]);

  if (withVolume.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-10 w-10 animate-spin" />
        </div>
        <p className="text-rh-light-text dark:text-rh-text font-medium mb-1">Volume data loading</p>
        <p className="text-rh-light-muted/70 dark:text-rh-muted/70 text-sm">Top 100 by volume will appear once market data is available.</p>
      </div>
    );
  }

  const heroStock = heroTicker ? filtered.find(s => s.ticker === heroTicker) ?? stocks.find(s => s.ticker === heroTicker) : null;

  return (
    <div className="space-y-3">
      {/* Header + segmented control — sticky below nav */}
      <div className="space-y-0 sticky top-[90px] sm:top-[52px] z-20 pb-3 bg-rh-light-bg dark:bg-[#050505]">
      {/* Header row */}
      <div className="px-1 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
            Top 100 <span className={`text-sm font-medium ${filter === 'losers' ? 'text-rh-red' : filter === 'mostFollowed' ? 'text-purple-400' : 'text-rh-light-muted dark:text-rh-muted'}`}>
              {filter === 'mostFollowed' ? 'by Following' : filter === 'gainers' || filter === 'losers' ? 'by Percentage' : 'by Volume'}
            </span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-rh-light-muted dark:text-rh-muted">
              Vol <span className="text-rh-light-text dark:text-rh-text font-bold">{formatVolume(totalVol)}</span>
            </span>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${avgChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              Avg {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
            </span>
            {highVolCount > 0 && (
              <span className="text-[10px] font-bold text-rh-green">
                🔥 {highVolCount} unusual
              </span>
            )}
          </div>
        </div>

        {/* Right: per-stock sparkline */}
        <div className="flex items-center gap-2 shrink-0">
          {heroStock && heroSparkline ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-rh-light-text dark:text-rh-text">{heroStock.ticker}</span>
                <span className={`text-[11px] font-bold tabular-nums ${isEffectivelyZero(heroStock.changePercent) ? 'text-rh-light-muted dark:text-rh-muted' : heroStock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {heroStock.changePercent >= 0 ? '+' : ''}{heroStock.changePercent.toFixed(2)}%
                </span>
              </div>
              <svg className="opacity-70 w-[80px] h-[24px]" viewBox="0 0 140 32" preserveAspectRatio="none">
                <path d={heroSparkline} fill="none" stroke={isEffectivelyZero(heroStock.changePercent) ? '#888' : heroStock.changePercent >= 0 ? '#00c805' : '#ea3943'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          ) : heroLoading ? (
            <div className="w-[80px] h-[24px] rounded animate-pulse bg-gray-200/60 dark:bg-white/[0.04]" />
          ) : (
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">Click a stock to preview</span>
          )}
        </div>
      </div>

      {/* Segmented control — docked tight to hero (-4px overlap) */}
      <div className="pt-1.5">
      {/* Segmented control */}
      <div
        className="flex items-center w-full overflow-x-auto no-scrollbar"
        style={{
          height: 32,
          padding: 4,
          gap: 4,
          borderRadius: 10,
          background: isDark
            ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)'
            : 'linear-gradient(135deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 50%, rgba(0,0,0,0.03) 100%)',
          border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)',
          backdropFilter: 'blur(16px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
          boxShadow: isDark
            ? '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        {VOLUME_FILTERS.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              data-active={isActive || undefined}
              onClick={() => { setFilter(f.id); setVisibleCount(10); }}
              className="flex items-center justify-center whitespace-nowrap flex-shrink-0"
              style={{
                flex: '1 0 auto',
                gap: 6,
                padding: '0 12px',
                height: 24,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                transition: 'color 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
                outline: 'none',
                color: isActive
                  ? (isDark ? '#f5f7fa' : '#111')
                  : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.40)'),
                background: isActive
                  ? (isDark
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.08) 100%)'
                    : 'rgba(255,255,255,0.85)')
                  : 'transparent',
                border: isActive
                  ? (isDark ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(0,0,0,0.12)')
                  : '1px solid transparent',
                boxShadow: isActive
                  ? (isDark
                    ? '0 2px 10px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
                    : '0 1px 6px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)')
                  : 'none',
                backdropFilter: isActive ? 'blur(16px) saturate(1.3)' : 'none',
                WebkitBackdropFilter: isActive ? 'blur(16px) saturate(1.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
                  e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.70)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.40)';
                }
              }}
              onFocus={(e) => { e.currentTarget.style.outline = '2px solid rgba(34,197,94,0.45)'; e.currentTarget.style.outlineOffset = '1px'; }}
              onBlur={(e) => { e.currentTarget.style.outline = 'none'; }}
            >
              {f.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.dot, flexShrink: 0 }} />}
              {f.label}
            </button>
          );
        })}
      </div>
      </div>

      {/* Column header */}
      <div className="flex items-center gap-3 px-3 pt-1 pb-1 border-b border-gray-200/60 dark:border-white/[0.06] bg-rh-light-bg dark:bg-[#050505]">
        <div className="w-7 shrink-0" />
        <div className="w-8 shrink-0" />
        <div className="flex-1 min-w-0 text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>Symbol</div>
        <div className="text-right shrink-0 w-[72px] text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>Price</div>
        <div className="text-center shrink-0 w-[68px] text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>Day</div>
        <div className="text-center shrink-0 w-[68px] hidden sm:block text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>7D</div>
        <div className="text-right shrink-0 w-[88px] hidden md:block text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>{filter === 'mostFollowed' ? 'Followers' : 'Volume'}</div>
        <div className="text-right shrink-0 w-[64px] hidden lg:block text-[10px] font-bold uppercase text-gray-500 dark:text-[rgba(255,255,255,0.55)]" style={{ letterSpacing: '0.08em' }}>Mkt Cap</div>
      </div>
      </div>

      {/* Cards list */}
      {filter === 'mostFollowed' && mostFollowedLoading && (
        <div className="text-center py-8">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-rh-light-muted dark:text-white/40">Loading most followed stocks...</p>
        </div>
      )}
      {filter === 'mostFollowed' && !mostFollowedLoading && filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-rh-light-muted dark:text-white/40">No followed stocks yet. Follow stocks to see them here.</p>
        </div>
      )}
      <div className="space-y-0.5">
        {filtered.slice(0, visibleCount).map((stock, i) => {
          const rank = i + 1;
          const rankColor = RANK_COLORS[rank];
          const volPct = ((stock.volume ?? 0) / maxVol) * 100;
          const volRatio = (stock.avgVolume ?? 0) > 0
            ? ((stock.volume ?? 0) / (stock.avgVolume ?? 1))
            : null;
          const isHighVol = volRatio != null && volRatio >= 1.5;
          const isUp = stock.changePercent >= 0;
          const isZeroChange = isEffectivelyZero(stock.changePercent);

          return (
            <div
              key={stock.ticker}
              onClick={() => {
                if (heroTicker === stock.ticker) { onTickerClick(stock.ticker); }
                else { setHeroTicker(stock.ticker); }
              }}
              className="relative group rounded-xl px-3 py-[7px] cursor-pointer transition-all duration-200
                hover:scale-[1.005] active:scale-[0.998]
                border border-transparent hover:border-gray-200/50 dark:hover:border-white/[0.06] hover:bg-gray-50/80 dark:hover:bg-white/[0.025]
                hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20
              "
            >
              {/* Left accent strip */}
              <div
                className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full transition-opacity duration-200"
                style={{
                  background: rankColor ?? (isZeroChange ? '#888' : isUp ? '#00c805' : '#ea3943'),
                  opacity: rankColor ? (isDark ? 0.85 : 0.9) : (isDark ? 0.35 : 0.5),
                }}
              />
              {/* Volume heat bar (background) — neutral tint, chips carry sentiment */}
              <div
                className="absolute inset-y-0 left-0 rounded-xl transition-all duration-500 group-hover:opacity-100"
                style={{
                  width: `${Math.max(volPct, 2)}%`,
                  background: isDark
                    ? 'linear-gradient(90deg, rgba(255,255,255,0.015) 0%, rgba(255,255,255,0.005) 70%, transparent 100%)'
                    : 'linear-gradient(90deg, rgba(0,0,0,0.015) 0%, rgba(0,0,0,0.005) 70%, transparent 100%)',
                }}
              />

              {/* Content */}
              <div className="relative flex items-center gap-3">
                {/* Rank */}
                <div className="w-7 text-center shrink-0">
                  {rankColor ? (
                    <span className="text-sm font-extrabold tabular-nums" style={{ color: rankColor }}>{rank}</span>
                  ) : rank <= 10 ? (
                    <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto">
                      <span className="text-[10px] font-bold tabular-nums text-rh-light-text dark:text-rh-text">{rank}</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold tabular-nums text-gray-500 dark:text-rh-muted/60">{rank}</span>
                  )}
                </div>

                {/* Logo + Info */}
                <StockLogo ticker={stock.ticker} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold tracking-tight" style={rankColor ? { color: rankColor } : undefined}>
                      {!rankColor && <span className="text-rh-light-text dark:text-rh-text">{stock.ticker}</span>}
                      {rankColor && stock.ticker}
                    </span>
                    {portfolioTickers?.has(stock.ticker) && (
                      <span className="text-rh-green text-xs leading-none">✓</span>
                    )}
                    {isHighVol && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rh-green/10 dark:bg-rh-green/[0.06] text-rh-green">
                        🔥 {volRatio!.toFixed(1)}x
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate block">{stock.name}</span>
                </div>

                {/* Price */}
                <div className="text-right shrink-0 w-[72px]">
                  <div className="text-sm font-bold text-rh-light-text dark:text-rh-text tabular-nums">
                    ${stock.price.toFixed(2)}
                  </div>
                </div>

                {/* Change pill */}
                <div className="shrink-0 w-[68px] flex justify-center">
                  <div className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                    isZeroChange
                      ? 'bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-rh-muted'
                      : isUp
                      ? 'bg-rh-green/10 dark:bg-rh-green/[0.08] text-rh-green'
                      : 'bg-rh-red/10 dark:bg-rh-red/[0.08] text-rh-red'
                  }`}>
                    {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </div>
                </div>

                {/* 7D Change */}
                <div className="shrink-0 w-[68px] hidden sm:flex justify-center">
                  {(() => {
                    const wk = stock.weekChangePercent ?? 0;
                    const wkZero = isEffectivelyZero(wk);
                    const wkUp = wk >= 0;
                    return (
                      <div className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                        wkZero
                          ? 'bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-rh-muted'
                          : wkUp
                          ? 'bg-rh-green/10 dark:bg-rh-green/[0.08] text-rh-green'
                          : 'bg-rh-red/10 dark:bg-rh-red/[0.08] text-rh-red'
                      }`}>
                        {wkUp ? '+' : ''}{wk.toFixed(2)}%
                      </div>
                    );
                  })()}
                </div>

                {/* Volume / Followers cell */}
                <div className="shrink-0 w-[88px] hidden md:flex flex-col items-end gap-0.5">
                  {filter === 'mostFollowed' ? (
                    <>
                      <div className="text-sm font-bold text-purple-500 dark:text-purple-400 tabular-nums">
                        {(mostFollowedMap.get(stock.ticker) ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-rh-light-muted/50 dark:text-white/30">followers</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-rh-light-text dark:text-rh-text tabular-nums">
                        {formatVolume(stock.volume ?? 0)}
                      </div>
                      <div className="w-full h-1 rounded-full bg-gray-200/80 dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 bg-rh-green/40 group-hover:bg-rh-green/60"
                          style={{ width: `${volPct}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Mkt Cap */}
                <div className="text-right shrink-0 w-[64px] hidden lg:block">
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                    {formatMktCap(stock.marketCapB)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {visibleCount < filtered.length && (
        <button
          onClick={() => setVisibleCount(prev => Math.min(prev + 10, filtered.length))}
          className="w-full py-2 mt-1 text-sm font-semibold text-rh-green hover:text-rh-green/80 transition-colors"
        >
          More
        </button>
      )}
    </div>
  );
}

/* ─── Stock Screener ─── */
// Types, constants, and filter logic are now in useScreenerFilters hook

function ScreenerView({ stocks, onTickerClick }: { stocks: HeatmapStock[]; onTickerClick: (ticker: string) => void }) {
  const {
    sectorFilter, setSectorFilter,
    capFilter, setCapFilter,
    peFilter, setPeFilter,
    divFilter, setDivFilter,
    weekFilter, setWeekFilter,
    sortKey, sortDir, handleSort,
    sectors, filtered,
  } = useScreenerFilters(stocks);

  const sortIcon = (key: ScreenerSortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-0.5 text-[9px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  const pillClass = (active: boolean) =>
    `px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-rh-green/15 text-rh-green ring-1 ring-rh-green/30'
        : 'bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
    }`;

  const thClass = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/30 cursor-pointer hover:text-gray-600 dark:hover:text-white/50 select-none whitespace-nowrap';

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {/* Sector dropdown */}
        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          className="px-2.5 py-1 pr-6 text-[11px] font-medium rounded-md appearance-none bg-gray-100 dark:bg-[#1a1a1e] text-gray-600 dark:text-white/80 border border-gray-200 dark:border-white/[0.08] outline-none cursor-pointer bg-[length:10px] bg-[right_6px_center] bg-no-repeat"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239ca3af'/%3E%3C/svg%3E")` }}
        >
          <option value="all" className="bg-white dark:bg-[#1a1a1e] text-gray-900 dark:text-white">All Sectors</option>
          {sectors.map(s => <option key={s} value={s} className="bg-white dark:bg-[#1a1a1e] text-gray-900 dark:text-white">{s}</option>)}
        </select>

        {/* Cap range pills */}
        {CAP_RANGES.map(c => (
          <button key={c.id} onClick={() => setCapFilter(capFilter === c.id ? 'all' : c.id)} className={pillClass(capFilter === c.id && c.id !== 'all')}>
            {c.label}
          </button>
        ))}

        <div className="w-px bg-gray-200 dark:bg-white/10 mx-1 self-stretch" />

        {/* PE pills */}
        {PE_RANGES.map(p => (
          <button key={p.id} onClick={() => setPeFilter(peFilter === p.id ? 'all' : p.id)} className={pillClass(peFilter === p.id && p.id !== 'all')}>
            {p.label}
          </button>
        ))}

        <div className="w-px bg-gray-200 dark:bg-white/10 mx-1 self-stretch" />

        {/* Dividend pills */}
        {DIV_RANGES.map(d => (
          <button key={d.id} onClick={() => setDivFilter(divFilter === d.id ? 'all' : d.id)} className={pillClass(divFilter === d.id && d.id !== 'all')}>
            {d.label}
          </button>
        ))}

        <div className="w-px bg-gray-200 dark:bg-white/10 mx-1 self-stretch" />

        {/* 52-week pills */}
        {WEEK_RANGES.map(w => (
          <button key={w.id} onClick={() => setWeekFilter(weekFilter === w.id ? 'all' : w.id)} className={pillClass(weekFilter === w.id && w.id !== 'all')}>
            {w.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-[11px] text-gray-400 dark:text-white/25 font-medium">
        {filtered.length} stocks
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white dark:bg-[#0f0f12]">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-gray-50 dark:bg-white/[0.03] z-10">
            <tr>
              <th className={`${thClass} pl-3 text-left`} onClick={() => handleSort('ticker')}>Ticker{sortIcon('ticker')}</th>
              <th className={`${thClass} text-left hidden md:table-cell`} onClick={() => handleSort('name')}>Name{sortIcon('name')}</th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('price')}>Price{sortIcon('price')}</th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('changePercent')}>Chg%{sortIcon('changePercent')}</th>
              <th className={`${thClass} text-right hidden sm:table-cell`} onClick={() => handleSort('marketCapB')}>Mkt Cap{sortIcon('marketCapB')}</th>
              <th className={`${thClass} text-right hidden lg:table-cell`} onClick={() => handleSort('pe')}>P/E{sortIcon('pe')}</th>
              <th className={`${thClass} text-right hidden lg:table-cell`} onClick={() => handleSort('dividendYield')}>Div%{sortIcon('dividendYield')}</th>
              <th className={`${thClass} text-right hidden xl:table-cell`} onClick={() => handleSort('beta')}>Beta{sortIcon('beta')}</th>
              <th className={`${thClass} text-right hidden xl:table-cell`} onClick={() => handleSort('week52Pos')}>52W Range{sortIcon('week52Pos')}</th>
              <th className={`${thClass} text-right hidden 2xl:table-cell`} onClick={() => handleSort('sector')}>Sector{sortIcon('sector')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((stock) => {
              const w52pos = getWeek52Pos(stock);
              return (
                <tr
                  key={stock.ticker}
                  onClick={() => onTickerClick(stock.ticker)}
                  className="border-t border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="px-2 py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <StockLogo ticker={stock.ticker} size="sm" />
                      <span className="text-xs font-bold text-gray-800 dark:text-white">{stock.ticker}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 hidden md:table-cell">
                    <span className="text-[11px] text-gray-500 dark:text-white/40 truncate max-w-[180px] block">{stock.name}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="text-xs font-semibold text-gray-700 dark:text-white/80 tabular-nums">${stock.price.toFixed(2)}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className={`text-xs font-bold tabular-nums ${isEffectivelyZero(stock.changePercent) ? 'text-rh-light-muted dark:text-rh-muted' : stock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right hidden sm:table-cell">
                    <span className="text-[11px] text-gray-500 dark:text-white/40 tabular-nums">{formatMktCap(stock.marketCapB)}</span>
                  </td>
                  <td className="px-2 py-2 text-right hidden lg:table-cell">
                    <span className="text-[11px] text-gray-500 dark:text-white/40 tabular-nums">
                      {stock.pe != null && stock.pe > 0 ? stock.pe.toFixed(1) : '--'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right hidden lg:table-cell">
                    <span className="text-[11px] text-gray-500 dark:text-white/40 tabular-nums">
                      {stock.dividendYield != null ? `${(stock.dividendYield * 100).toFixed(2)}%` : '--'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right hidden xl:table-cell">
                    <span className="text-[11px] text-gray-500 dark:text-white/40 tabular-nums">
                      {stock.beta != null ? stock.beta.toFixed(2) : '--'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right hidden xl:table-cell">
                    {w52pos != null ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-16 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rh-green"
                            style={{ width: `${Math.round(w52pos * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-white/30 tabular-nums w-[28px] text-right">
                          {Math.round(w52pos * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400 dark:text-white/30">--</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right hidden 2xl:table-cell">
                    <span className="text-[10px] text-gray-400 dark:text-white/30 truncate max-w-[100px] block text-right">{stock.sector ?? '--'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400 dark:text-white/25">
            No stocks match your filters
          </div>
        )}
        {filtered.length > 200 && (
          <div className="py-3 text-center text-[11px] text-gray-400 dark:text-white/25">
            Showing 200 of {filtered.length} results
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Heatmap View (original DiscoverPage content) ─── */

function HeatmapView({ onTickerClick, initialIndex, onIndexChange }: {
  onTickerClick: (ticker: string) => void;
  initialIndex?: MarketIndex;
  onIndexChange?: (index: MarketIndex) => void;
}) {
  const [period, setPeriodInternal] = useState<HeatmapPeriod>('1D');
  const [index, setIndexInternal] = useState<MarketIndex>(initialIndex ?? 'SP500');
  // Clear stale data synchronously on switch to avoid one-frame flash of old chart
  const setIndex = (idx: MarketIndex) => {
    const cached = heatmapCache.get(cacheKey(period, idx));
    if (cached) { setData(cached.data); } else { setData(null); setLoading(true); }
    setIndexInternal(idx);
    onIndexChange?.(idx);
  };
  const setPeriod = (p: HeatmapPeriod) => {
    const cached = heatmapCache.get(cacheKey(p, index));
    if (cached) { setData(cached.data); } else { setData(null); setLoading(true); }
    setPeriodInternal(p);
  };
  const [highlightedSector, setHighlightedSector] = useState<string | null>(null);
  const treemapRef = useRef<HTMLDivElement>(null);
  // Initialize from cache so first render is instant on re-mount
  const initialKey = cacheKey('1D', index);
  const initialCache = heatmapCache.get(initialKey);
  const [data, setData] = useState<HeatmapResponse | null>(initialCache?.data ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const key = cacheKey(period, index);

    // Show cached data instantly (stale-while-revalidate)
    const cached = heatmapCache.get(key);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      // Clear old data immediately so we don't flash the previous index's heatmap
      setData(null);
      setLoading(true);
    }

    const load = async () => {
      try {
        const resp = index === 'THEMES'
          ? await getThemesHeatmap(period)
          : index === 'ETF'
          ? await getEtfHeatmap(period)
          : await getMarketHeatmap(period, index);
        if (!cancelled) {
          setData(resp);
          heatmapCache.set(key, { data: resp, ts: Date.now() });
          setError('');
        }
      } catch (err: any) {
        if (!cancelled && !cached) setError(err.message || 'Failed to load heatmap data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const refreshInterval = period === '1D' ? 60_000 : 300_000;
    const interval = setInterval(load, refreshInterval);
    return () => { cancelled = true; clearInterval(interval); };
  }, [period, index]);

  const allStocks = useMemo(() => {
    if (!data) return [];
    return data.sectors.flatMap(s => s.stocks);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <img src="/north-signal-logo-transparent.png" alt="" className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-20">
        <p className="text-rh-light-muted dark:text-rh-muted mb-2">Failed to load market data</p>
        <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); getMarketHeatmap(period, index).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }}
          className="mt-4 px-4 py-2 rounded-lg bg-rh-green text-black text-sm font-medium hover:brightness-110 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-rh-light-text dark:text-rh-text">
            {INDEXES.find(i => i.id === index)?.fullName ?? 'Market'} Heatmap
          </h2>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted">
            {index === 'THEMES'
              ? `${allStocks.length} subthemes across ${data.sectors.length} themes — colored by ${PERIOD_LABELS[period]}`
              : `${allStocks.length} stocks across ${data.sectors.length} sectors — sized by market cap, colored by ${PERIOD_LABELS[period]}`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border border-rh-green border-t-transparent" />
          )}
        </div>
      </div>

      {/* Index + Period selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {/* Index selector */}
        <div className="flex items-center gap-1 bg-gray-100/60 dark:bg-white/[0.04] rounded-lg p-0.5 overflow-x-auto no-scrollbar">
          {INDEXES.map((idx) => (
            <button
              key={idx.id}
              onClick={() => { setIndex(idx.id); setHighlightedSector(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex-shrink-0
                ${index === idx.id
                  ? 'bg-white dark:bg-white/[0.12] text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {idx.label}
            </button>
          ))}
        </div>

        {/* Period selector — below on mobile, right on desktop */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all
                ${period === p.id
                  ? 'bg-rh-green text-black'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-white/5'
                }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={treemapRef}>
        <Treemap sectors={data.sectors} onTickerClick={onTickerClick} highlightedSector={highlightedSector} stockCount={allStocks.length} isThemes={index === 'THEMES'} />
      </div>
      <ColorLegend />
      <SectorBars
        sectors={data.sectors}
        highlightedSector={highlightedSector}
        onSectorClick={(name) => {
          const next = highlightedSector === name ? null : name;
          setHighlightedSector(next);
          if (next && treemapRef.current) {
            treemapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
        isThemes={index === 'THEMES'}
      />
      {index !== 'THEMES' && <TopMovers stocks={allStocks} onTickerClick={onTickerClick} />}
    </div>
  );
}

/* ─── Discover Page (wrapper with sub-tabs) ─── */

export function DiscoverPage({ onTickerClick, onUserClick, subTab: externalSubTab, onSubTabChange, portfolioTickers }: DiscoverPageProps) {
  const parsed = useMemo(() => parseSubTab(externalSubTab), [externalSubTab]);
  const [subTab, setSubTabInternal] = useState<DiscoverSubTab>(parsed.subTab);
  const [heatmapIndex, setHeatmapIndex] = useState<MarketIndex>(parsed.heatmapIndex ?? 'SP500');

  const setSubTab = (tab: DiscoverSubTab) => {
    setSubTabInternal(tab);
    onSubTabChange?.(tab === 'heatmap' ? `heatmap:${heatmapIndex}` : tab);
  };

  const handleIndexChange = (idx: MarketIndex) => {
    setHeatmapIndex(idx);
    onSubTabChange?.(`heatmap:${idx}`);
  };

  // For Top 100, we need all stocks from the heatmap — load from cache or fetch
  const [allStocks, setAllStocks] = useState<HeatmapStock[]>([]);

  useEffect(() => {
    // Try cache first
    const cached = heatmapCache.get(cacheKey('1D', 'SP500'));
    if (cached) {
      setAllStocks(cached.data.sectors.flatMap(s => s.stocks));
    }
    // Also fetch fresh data for Top 100
    getMarketHeatmap('1D', 'SP500').then(resp => {
      setAllStocks(resp.sectors.flatMap(s => s.stocks));
      heatmapCache.set(cacheKey('1D', 'SP500'), { data: resp, ts: Date.now() });
    }).catch(e => console.error('Top 100 heatmap fetch failed:', e));

    // Refresh every hour for Top 100
    const interval = setInterval(() => {
      getMarketHeatmap('1D', 'SP500').then(resp => {
        setAllStocks(resp.sectors.flatMap(s => s.stocks));
        heatmapCache.set(cacheKey('1D', 'SP500'), { data: resp, ts: Date.now() });
      }).catch(e => console.error('Top 100 heatmap refresh failed:', e));
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const tabClass = (active: boolean) =>
    `px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
      active
        ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
    }`;

  return (
    <div className="space-y-3">
      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1 w-fit">
        <button onClick={() => setSubTab('heatmap')} className={tabClass(subTab === 'heatmap')}>
          Heatmap
        </button>
        <button onClick={() => setSubTab('sectors')} className={tabClass(subTab === 'sectors')}>
          Sectors
        </button>
        <button onClick={() => setSubTab('top100')} className={tabClass(subTab === 'top100')}>
          Top 100
        </button>
        <button onClick={() => setSubTab('screener')} className={tabClass(subTab === 'screener')}>
          Screener
        </button>
        <button onClick={() => setSubTab('creators')} className={tabClass(subTab === 'creators')}>
          Creators
        </button>
      </div>

      {subTab === 'sectors' ? (
        <SectorPerformanceChart onTickerClick={onTickerClick} />
      ) : subTab === 'heatmap' ? (
        <HeatmapView onTickerClick={onTickerClick} initialIndex={heatmapIndex} onIndexChange={handleIndexChange} />
      ) : subTab === 'top100' ? (
        <Top100View stocks={allStocks} onTickerClick={onTickerClick} portfolioTickers={portfolioTickers} />
      ) : subTab === 'screener' ? (
        <ScreenerView stocks={allStocks} onTickerClick={onTickerClick} />
      ) : (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" /></div>}>
          <CreatorDiscoverSection onUserClick={onUserClick} />
        </Suspense>
      )}
    </div>
  );
}
