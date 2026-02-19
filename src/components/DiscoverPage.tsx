import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getMarketHeatmap, getIntradayCandles, HeatmapPeriod, MarketIndex } from '../api';
import { HeatmapResponse, HeatmapSector, HeatmapSubSector, HeatmapStock } from '../types';
import { formatCurrency } from '../utils/format';
import { getMarketStatus } from '../utils/portfolio-chart';
import { StockLogo } from './StockLogo';

interface DiscoverPageProps {
  onTickerClick: (ticker: string) => void;
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

  // Finviz-style palette: dark blue-gray base with rich (not neon) green/red
  const bR = 50, bG = 54, bB = 68;

  if (c > 0) {
    const t = Math.min(c / 3, 1);
    // Dark base → rich green (rgb(18,170,36))
    const r = Math.round(bR + (18 - bR) * t);
    const g = Math.round(bG + (170 - bG) * t);
    const b = Math.round(bB + (36 - bB) * t);
    return `rgb(${r},${g},${b})`;
  } else if (c < 0) {
    const t = Math.min(Math.abs(c) / 3, 1);
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
  if (c > 0) {
    const t = Math.min(c / 3.5, 1);
    return `rgb(${Math.round(200 - 80 * t)},${Math.round(225 - 20 * t)},${Math.round(200 - 80 * t)})`;
  } else if (c < 0) {
    const t = Math.min(Math.abs(c) / 3.5, 1);
    return `rgb(${Math.round(225 - 20 * t)},${Math.round(200 - 80 * t)},${Math.round(200 - 80 * t)})`;
  }
  return 'rgb(220,220,225)';
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

// --- Layout result types ---

interface StockTile {
  x: number;
  y: number;
  w: number;
  h: number;
  stock: HeatmapStock;
  sectorName: string;
  subSectorName: string;
}

interface SubSectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  subSector: HeatmapSubSector;
  sectorName: string;
  children: StockTile[];
}

interface SectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  sector: HeatmapSector;
  subSectors: SubSectorRect[];
}

// --- Treemap component ---

const GAP_DESKTOP = 1.5;
const GAP_MOBILE = 0.75;
const SECTOR_LABEL_H = 15;
const SUB_SECTOR_LABEL_H = 12;
const SECTOR_GAP_DESKTOP = 2;
const SECTOR_GAP_MOBILE = 1;

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
}: {
  sectors: HeatmapSector[];
  onTickerClick: (ticker: string) => void;
  highlightedSector?: string | null;
  stockCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hoveredStock, setHoveredStock] = useState<HeatmapStock | null>(null);
  const [hoveredSubSector, setHoveredSubSector] = useState<{ sector: string; subSector: string } | null>(null);
  const [hoveredSectorLabel, setHoveredSectorLabel] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tappedStock, setTappedStock] = useState<{ stock: HeatmapStock; sectorName: string } | null>(null);
  const isDark = document.documentElement.classList.contains('dark');

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

  // 3-level layout: Sector → Sub-sector → Stocks
  const sectorRects = useMemo((): SectorRect[] => {
    if (dims.width === 0) return [];

    // Layout sectors with floor-clamped dampening
    const filteredSectors = sectors.filter(s => s.totalMarketCapB > 0);
    const sectorCaps = filteredSectors.map(s => s.totalMarketCapB);
    const dampenedSectorCaps = dampenCapWithFloor(sectorCaps, dampenExponent, minFloorRatio);
    const sectorItems: LayoutItem<HeatmapSector>[] = filteredSectors
      .map((s, i) => ({ value: dampenedSectorCaps[i], data: s }));

    if (sectorItems.length === 0) return [];
    const sectorLayout = squarifyLayout(sectorItems, 0, 0, dims.width, dims.height);

    return sectorLayout.map((sl) => {
      const sector = sl.data;
      const pad = SECTOR_GAP;
      const innerX = sl.x + pad;
      const innerY = sl.y + SECTOR_LABEL_H + pad;
      const innerW = sl.w - pad * 2;
      const innerH = sl.h - SECTOR_LABEL_H - pad * 2;

      if (innerW < 4 || innerH < 4) {
        return { x: sl.x, y: sl.y, w: sl.w, h: sl.h, sector, subSectors: [] };
      }

      // Only show sub-sector nesting if sector is big enough and has >1 sub-sector
      const hasMultipleSubs = sector.subSectors.length > 1;
      const sectorAreaPx = innerW * innerH;
      const showSubLabels = hasMultipleSubs && sectorAreaPx > 2000;

      if (!showSubLabels) {
        // Flat layout — all stocks directly
        const filteredStocks = sector.stocks.filter(s => s.marketCapB > 0);
        const stockCaps = filteredStocks.map(s => s.marketCapB);
        const dampenedStockCaps = dampenCapWithFloor(stockCaps, dampenExponent, minFloorRatio);
        const stockItems: LayoutItem<HeatmapStock>[] = filteredStocks
          .map((s, i) => ({ value: dampenedStockCaps[i], data: s }));

        const stockLayout = squarifyLayout(stockItems, innerX, innerY, innerW, innerH);
        const singleSub: SubSectorRect = {
          x: innerX, y: innerY, w: innerW, h: innerH,
          subSector: sector.subSectors[0] || { name: sector.name, stocks: sector.stocks, totalMarketCapB: sector.totalMarketCapB, avgChangePercent: sector.avgChangePercent },
          sectorName: sector.name,
          children: stockLayout.map(r => ({
            x: r.x, y: r.y, w: r.w, h: r.h,
            stock: r.data,
            sectorName: sector.name,
            subSectorName: r.data.subSector,
          })),
        };
        return { x: sl.x, y: sl.y, w: sl.w, h: sl.h, sector, subSectors: [singleSub] };
      }

      // Layout sub-sectors within sector
      const filteredSubs = sector.subSectors.filter(s => s.totalMarketCapB > 0);
      const subCaps = filteredSubs.map(s => s.totalMarketCapB);
      const dampenedSubCaps = dampenCapWithFloor(subCaps, dampenExponent, minFloorRatio);
      const subItems: LayoutItem<HeatmapSubSector>[] = filteredSubs
        .map((s, i) => ({ value: dampenedSubCaps[i], data: s }));

      const subLayout = squarifyLayout(subItems, innerX, innerY, innerW, innerH);

      const subRects: SubSectorRect[] = subLayout.map((subL) => {
        const sub = subL.data;
        const subLabelH = subL.h > 16 && subL.w > 20 ? SUB_SECTOR_LABEL_H : 0;
        const stockX = subL.x + 1;
        const stockY = subL.y + subLabelH + 1;
        const stockW = subL.w - 2;
        const stockH = subL.h - subLabelH - 2;

        if (stockW < 2 || stockH < 2) {
          return { x: subL.x, y: subL.y, w: subL.w, h: subL.h, subSector: sub, sectorName: sector.name, children: [] };
        }

        const filteredSubStocks = sub.stocks.filter(s => s.marketCapB > 0);
        const subStockCaps = filteredSubStocks.map(s => s.marketCapB);
        const dampenedSubStockCaps = dampenCapWithFloor(subStockCaps, dampenExponent, minFloorRatio);
        const stockItems: LayoutItem<HeatmapStock>[] = filteredSubStocks
          .map((s, i) => ({ value: dampenedSubStockCaps[i], data: s }));

        const stockLayout = squarifyLayout(stockItems, stockX, stockY, stockW, stockH);

        return {
          x: subL.x, y: subL.y, w: subL.w, h: subL.h,
          subSector: sub,
          sectorName: sector.name,
          children: stockLayout.map(r => ({
            x: r.x, y: r.y, w: r.w, h: r.h,
            stock: r.data,
            sectorName: sector.name,
            subSectorName: sub.name,
          })),
        };
      });

      return { x: sl.x, y: sl.y, w: sl.w, h: sl.h, sector, subSectors: subRects };
    });
  }, [sectors, dims, dampenExponent, minFloorRatio, SECTOR_GAP]);

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
  const tileStroke = isDark ? '#1a1c28' : '#d0d0d0';

  // Get the sub-sector stocks for the popup
  const popupSubSector = hoveredSubSector
    ? subSectorMap.get(`${hoveredSubSector.sector}::${hoveredSubSector.subSector}`)
    : null;

  return (
    <div ref={containerRef} className="w-full relative" onMouseMove={handleMouseMove}
      onClick={() => { if (tappedStock) { setTappedStock(null); setHoveredStock(null); setHoveredSubSector(null); } }}
    >
      <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/40"
        style={{ background: isDark ? (dims.width < 640 ? '#0f0f12' : 'rgba(15,15,18,0.85)') : (dims.width < 640 ? '#f0f0f4' : 'rgba(240,240,244,0.9)'), backdropFilter: dims.width < 640 ? undefined : 'blur(20px)' }}
      >
      <svg
        width={dims.width}
        height={dims.height}
        className="block"
        style={{ background: 'transparent' }}
      >
        {sectorRects.map((sr) => (
          <g key={sr.sector.name}>
            {/* Sector background */}
            <rect
              x={sr.x + 1}
              y={sr.y + 1}
              width={Math.max(0, sr.w - 2)}
              height={Math.max(0, sr.h - 2)}
              fill={isDark ? '#1a1c28' : '#ddd'}
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
                      ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)')
                      : (isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.08)')}
                    rx={1}
                    style={{ transition: 'fill 0.15s' }}
                  />
                  <clipPath id={`slbl-${sr.sector.name.replace(/[^a-zA-Z]/g, '')}`}>
                    <rect x={sr.x + 2} y={sr.y} width={Math.max(0, sr.w - 4)} height={SECTOR_LABEL_H + 2} />
                  </clipPath>
                  <text
                    x={sr.x + SECTOR_GAP + 4}
                    y={sr.y + SECTOR_LABEL_H - 4}
                    fontSize={sr.w > 200 ? 9.5 : sr.w > 100 ? 8 : sr.w > 60 ? 6.5 : sr.w > 30 ? 5 : 4}
                    fontWeight={700}
                    fill={isLabelHovered
                      ? (isDark ? '#fff' : 'rgba(0,0,0,0.8)')
                      : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)')}
                    clipPath={`url(#slbl-${sr.sector.name.replace(/[^a-zA-Z]/g, '')})`}
                    style={{
                      pointerEvents: 'none',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      textTransform: 'uppercase',
                      letterSpacing: sr.w > 60 ? '0.06em' : '0.02em',
                      transition: 'fill 0.15s',
                    }}
                  >
                    {sr.w < 30 ? sr.sector.name.slice(0, 3) : sr.w < 60 ? sr.sector.name.slice(0, 7) : sr.sector.name}
                  </text>
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
                            ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)')
                            : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)')}
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
                  {/* Stock tiles */}
                  {subR.children.map((r) => {
                    const isHovered = hoveredStock?.ticker === r.stock.ticker;
                    // Dim stocks NOT in the hovered sub-sector
                    const isInHoveredSub = hoveredSubSector
                      ? r.sectorName === hoveredSubSector.sector && r.subSectorName === hoveredSubSector.subSector
                      : false;
                    const tileW = Math.max(0, r.w - GAP);
                    const tileH = Math.max(0, r.h - GAP);
                    const halfGap = GAP / 2;

                    const showTicker = tileW > 6 && tileH > 5;
                    const showPct = isMobile ? (tileW > 34 && tileH > 22) : (tileW > 24 && tileH > 20);
                    const fontSize = tileW > 110 && tileH > 65 ? 15
                      : tileW > 80 && tileH > 50 ? 13
                      : tileW > 55 && tileH > 35 ? 11
                      : tileW > 35 && tileH > 22 ? 9
                      : tileW > 20 && tileH > 14 ? 7.5
                      : tileW > 14 && tileH > 9 ? 5.5
                      : tileW > 9 && tileH > 6 ? 4.5
                      : 3.5;
                    const pctFontSize = Math.max(fontSize - 1.5, 6);
                    // Abbreviate ticker for tiny tiles
                    const tickerText = tileW > 26 && tileH > 14 ? r.stock.ticker
                      : tileW > 18 && tileH > 10 ? r.stock.ticker.slice(0, 3)
                      : tileW > 10 && tileH > 7 ? r.stock.ticker.slice(0, 2)
                      : r.stock.ticker.slice(0, 1);

                    let opacity = 1;
                    if (hoveredStock) {
                      if (isHovered) opacity = 1;
                      else if (isInHoveredSub) opacity = 0.85;
                      else opacity = 0.45;
                    } else if (highlightedSector) {
                      opacity = r.sectorName === highlightedSector ? 1 : 0.25;
                    }

                    const tileClipId = `tc-${r.stock.ticker}`;

                    return (
                      <g
                        key={r.stock.ticker}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tappedStock?.stock.ticker === r.stock.ticker) {
                            // Second tap — navigate
                            onTickerClick(r.stock.ticker);
                            setTappedStock(null);
                            setHoveredStock(null);
                            setHoveredSubSector(null);
                          } else {
                            // First tap — show tooltip
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
                          x={r.x + halfGap}
                          y={r.y + halfGap}
                          width={tileW}
                          height={tileH}
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
                                textAnchor="middle"
                                fontSize={fontSize}
                                fontWeight={700}
                                fill="#fff"
                                style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)', transition: 'opacity 0.15s' }}
                              >
                                {tickerText}
                              </text>
                              {showPct && (
                                <text
                                  x={r.x + halfGap + tileW / 2}
                                  y={r.y + halfGap + tileH / 2 + pctFontSize * 1.1}
                                  textAnchor="middle"
                                  fontSize={pctFontSize}
                                  fontWeight={500}
                                  fill="rgba(255,255,255,0.9)"
                                  style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.6)', transition: 'opacity 0.15s' }}
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
          className={`absolute z-50 rounded-xl shadow-2xl shadow-black/60 border text-xs
            bg-white/95 dark:bg-[#1a1a1e]/90 border-white/20 dark:border-white/10
            backdrop-blur-xl ${tappedStock ? 'pointer-events-auto' : 'pointer-events-none'}`}
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
          <div className="px-3 py-2 border-b border-white/10 dark:border-white/5">
            <div className="font-bold text-[10px] tracking-wide uppercase text-rh-light-muted dark:text-rh-muted">
              {popupSubSector.sector.name} — {popupSubSector.subSector.name}
            </div>
          </div>

          {/* Hovered stock highlight */}
          <div className="px-3 py-2 border-b border-white/10 dark:border-white/5 bg-white/50 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-rh-light-text dark:text-rh-text">{hoveredStock.ticker}</span>
              <span className={`text-sm font-bold ${hoveredStock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {hoveredStock.changePercent >= 0 ? '+' : ''}{hoveredStock.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-rh-light-muted dark:text-rh-muted truncate mr-2">{hoveredStock.name}</span>
              <span className="text-rh-light-text dark:text-rh-text font-medium">{formatCurrency(hoveredStock.price)}</span>
            </div>
          </div>

          {/* Top stocks in this sub-sector (no scroll) */}
          <div>
            {popupSubSector.subSector.stocks
              .sort((a, b) => b.marketCapB - a.marketCapB)
              .slice(0, 6)
              .map((s) => {
                const isActive = s.ticker === hoveredStock.ticker;
                return (
                  <div
                    key={s.ticker}
                    className={`flex items-center justify-between px-3 py-1 ${isActive ? 'bg-white/40 dark:bg-white/10' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-semibold text-[11px] w-[42px] shrink-0 ${isActive ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted dark:text-rh-muted'}`}>
                        {s.ticker}
                      </span>
                      <span className="text-[10px] text-rh-light-muted/70 dark:text-rh-muted/70 truncate">
                        {formatCurrency(s.price)}
                      </span>
                    </div>
                    <span className={`text-[11px] font-semibold shrink-0 ${s.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
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
          {tappedStock && (
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
  const isDark = document.documentElement.classList.contains('dark');
  return (
    <div className="flex items-center justify-end gap-px mt-2">
      {steps.map((pct) => (
        <div key={pct} className="flex flex-col items-center">
          <div
            className="w-8 h-3"
            style={{
              background: isDark ? getHeatColor(pct) : getHeatColorLight(pct),
              borderRadius: pct === -3 ? '3px 0 0 3px' : pct === 3 ? '0 3px 3px 0' : 0,
            }}
          />
          <span className="text-[8px] text-rh-light-muted dark:text-rh-muted mt-0.5">
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
  const gainers = useMemo(() =>
    [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8),
    [stocks],
  );
  const losers = useMemo(() =>
    [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8),
    [stocks],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4">
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

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4">
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

function SectorBars({ sectors, highlightedSector, onSectorClick }: { sectors: HeatmapSector[]; highlightedSector?: string | null; onSectorClick?: (name: string) => void }) {
  const sorted = useMemo(() =>
    [...sectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent),
    [sectors],
  );
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.avgChangePercent)), 1);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl shadow-lg shadow-black/20 p-4 mt-4">
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">Sector Performance</h3>
      <div className="space-y-2">
        {sorted.map((s) => {
          const pct = s.avgChangePercent;
          const barWidth = (Math.abs(pct) / maxAbs) * 50;
          const isPositive = pct >= 0;
          return (
            <div
              key={s.name}
              className={`flex items-center gap-3 cursor-pointer rounded-lg px-1 -mx-1 transition-all ${highlightedSector === s.name ? 'bg-white/10' : 'hover:bg-white/5'}`}
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
                      background: isPositive ? '#00C805' : '#E8544E',
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
              <span className={`text-xs font-semibold min-w-[50px] text-right ${isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
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


type DiscoverSubTab = 'heatmap' | 'top100';

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

const RANK_MEDALS: Record<number, { emoji: string; glow: string; bg: string; ring: string }> = {
  1: { emoji: '🥇', glow: 'shadow-[0_0_20px_rgba(255,215,0,0.35)]', bg: 'bg-gradient-to-r from-yellow-400/15 via-amber-300/8 dark:from-yellow-500/[0.08] dark:via-amber-400/[0.03] to-transparent', ring: 'ring-1 ring-yellow-400/30 dark:ring-yellow-400/20' },
  2: { emoji: '🥈', glow: 'shadow-[0_0_16px_rgba(192,192,192,0.25)]', bg: 'bg-gradient-to-r from-gray-300/15 via-slate-200/8 dark:from-gray-400/[0.06] dark:via-slate-300/[0.02] to-transparent', ring: 'ring-1 ring-gray-300/30 dark:ring-gray-400/20' },
  3: { emoji: '🥉', glow: 'shadow-[0_0_16px_rgba(205,127,50,0.25)]', bg: 'bg-gradient-to-r from-orange-400/15 via-amber-500/8 dark:from-orange-500/[0.06] dark:via-amber-500/[0.02] to-transparent', ring: 'ring-1 ring-orange-400/30 dark:ring-orange-400/20' },
};

type VolumeFilter = 'top100' | 'gainers' | 'losers' | 'unusual';
const VOLUME_FILTERS: { id: VolumeFilter; label: string; dot?: string }[] = [
  { id: 'top100', label: 'Top 100' },
  { id: 'gainers', label: 'Gainers', dot: '#16c784' },
  { id: 'losers', label: 'Losers', dot: '#ea3943' },
  { id: 'unusual', label: 'Unusual Vol', dot: '#f5a524' },
];

function Top100View({ stocks, onTickerClick }: { stocks: HeatmapStock[]; onTickerClick: (ticker: string) => void }) {
  const [filter, setFilter] = useState<VolumeFilter>('top100');
  const [heroTicker, setHeroTicker] = useState<string | null>(null);
  const [heroSparkline, setHeroSparkline] = useState<string>('');
  const [heroLoading, setHeroLoading] = useState(false);
  const sparklineCacheRef = useRef<Map<string, string>>(new Map());

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
    }).catch(() => {}).finally(() => { if (!cancelled) setHeroLoading(false); });
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
      default:
        return byVol.slice(0, 100);
    }
  }, [withVolume, filter]);

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
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.03] mx-auto mb-4 flex items-center justify-center text-2xl">
          📊
        </div>
        <p className="text-rh-light-text dark:text-rh-text font-medium mb-1">Volume data loading</p>
        <p className="text-rh-light-muted/70 dark:text-rh-muted/70 text-sm">Top 100 by volume will appear once market data is available.</p>
      </div>
    );
  }

  const heroStock = heroTicker ? filtered.find(s => s.ticker === heroTicker) ?? stocks.find(s => s.ticker === heroTicker) : null;

  return (
    <div className="space-y-3">
      {/* Hero header card + segmented control as one visual module */}
      <div className="space-y-0">
      {/* Hero header card */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.04) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-rh-green/[0.04] via-transparent to-transparent" />
        <div className="relative px-5 py-3 flex items-center justify-between gap-4">
          {/* Left: icon + title + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 50%, rgba(34,197,94,0.10) 100%)',
                border: '1px solid rgba(34,197,94,0.25)',
                backdropFilter: 'blur(20px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                boxShadow: '0 4px 20px rgba(0,200,5,0.12), 0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.1)',
              }}>
                <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
                <svg className="relative w-5 h-5 drop-shadow-sm" fill="none" stroke="#22c55e" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 0 4px rgba(34,197,94,0.4))' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight" style={{ color: '#f5f7fa' }}>
                  Top 100 <span style={{ color: '#00c805', fontSize: '0.85em', fontWeight: 700 }}>by Volume</span>
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.78)' }}>Most actively traded stocks right now</p>
              </div>
            </div>

            {/* Mini stats row */}
            <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.035)' }}>
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Total Vol</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: '#f5f7fa' }}>{formatVolume(totalVol)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.035)' }}>
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Avg Move</span>
                <span className={`text-xs font-bold tabular-nums ${avgChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                </span>
              </div>
              {highVolCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(0,200,5,0.04)' }}>
                  <span className="text-[10px]">🔥</span>
                  <span className="text-xs font-bold text-rh-green">{highVolCount} unusual</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: per-stock sparkline */}
          <div className="flex flex-col items-end gap-1 shrink-0 mr-1 sm:mr-3">
            {heroStock && heroSparkline ? (
              <>
                <div className="flex items-center gap-2">
                  {getMarketStatus().isOpen ? (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.40)' }}>
                      <span className="relative flex h-[6px] w-[6px]">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-60" />
                        <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-rh-green" />
                      </span>
                      live
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.40)' }}>
                      closed
                    </span>
                  )}
                  <span className="text-[11px] font-bold" style={{ color: '#f5f7fa' }}>{heroStock.ticker}</span>
                  <span className={`text-[11px] font-bold tabular-nums ${heroStock.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {heroStock.changePercent >= 0 ? '+' : ''}{heroStock.changePercent.toFixed(2)}%
                  </span>
                </div>
                <svg className="opacity-70 w-[100px] h-[28px] sm:w-[140px] sm:h-[32px]" viewBox="0 0 140 32" preserveAspectRatio="none">
                  <path d={heroSparkline} fill="none" stroke={heroStock.changePercent >= 0 ? '#00c805' : '#ea3943'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            ) : heroLoading ? (
              <div className="w-[100px] h-[28px] sm:w-[140px] sm:h-[32px] rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ) : (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.30)' }}>Click a stock to preview</span>
            )}
          </div>
        </div>
      </div>

      {/* Segmented control — docked tight to hero (-4px overlap) */}
      <div className="pt-1.5">
      {/* Segmented control — forced dark tokens */}
      <div
        className="flex items-center w-full flex-nowrap"
        style={{
          colorScheme: 'dark',
          height: 32,
          padding: 4,
          gap: 4,
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(16px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {VOLUME_FILTERS.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              data-active={isActive || undefined}
              onClick={() => setFilter(f.id)}
              className="flex items-center justify-center whitespace-nowrap"
              style={{
                flex: 1,
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
                color: isActive ? '#f5f7fa' : 'rgba(255,255,255,0.72)',
                background: isActive ? 'linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(255,255,255,0.03) 50%, rgba(34,197,94,0.08) 100%)' : 'transparent',
                border: isActive ? '1px solid rgba(34,197,94,0.22)' : '1px solid transparent',
                boxShadow: isActive ? '0 2px 12px rgba(0,200,5,0.08), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)' : 'none',
                backdropFilter: isActive ? 'blur(16px) saturate(1.3)' : 'none',
                WebkitBackdropFilter: isActive ? 'blur(16px) saturate(1.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.92)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.72)';
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
      </div>

      {/* Column header */}
      <div className="flex items-center gap-3 px-3 pt-1 pb-1 border-b border-gray-200/60 dark:border-white/[0.06]">
        <div className="w-8 shrink-0" />
        {/* Logo placeholder */}
        <div className="w-8 shrink-0" />
        <div className="flex-1 min-w-0 text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-[rgba(255,255,255,0.55)]">Symbol</div>
        <div className="text-right shrink-0 w-[72px] text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-[rgba(255,255,255,0.55)]">Price</div>
        <div className="text-right shrink-0 w-[68px] text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-[rgba(255,255,255,0.55)]">Chg%</div>
        <div className="text-right shrink-0 w-[88px] hidden sm:block text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-[rgba(255,255,255,0.55)]">Volume</div>
        <div className="text-right shrink-0 w-[64px] hidden lg:block text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/70 dark:text-[rgba(255,255,255,0.55)]">Mkt Cap</div>
      </div>

      {/* Cards list */}
      <div className="space-y-0.5">
        {filtered.map((stock, i) => {
          const rank = i + 1;
          const medal = RANK_MEDALS[rank];
          const volPct = ((stock.volume ?? 0) / maxVol) * 100;
          const volRatio = (stock.avgVolume ?? 0) > 0
            ? ((stock.volume ?? 0) / (stock.avgVolume ?? 1))
            : null;
          const isHighVol = volRatio != null && volRatio >= 1.5;
          const isUp = stock.changePercent >= 0;

          return (
            <div
              key={stock.ticker}
              onClick={() => {
                if (heroTicker === stock.ticker) { onTickerClick(stock.ticker); }
                else { setHeroTicker(stock.ticker); }
              }}
              className={`relative group rounded-xl px-3 py-[7px] cursor-pointer transition-all duration-200
                hover:scale-[1.005] active:scale-[0.998]
                border
                ${medal
                  ? `${medal.bg} ${medal.glow} ${medal.ring}`
                  : 'border-transparent hover:border-gray-200/50 dark:hover:border-white/[0.06] hover:bg-gray-50/80 dark:hover:bg-white/[0.025]'
                }
                hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20
              `}
            >
              {/* Volume heat bar (background) */}
              <div
                className="absolute inset-y-0 left-0 rounded-xl transition-all duration-500"
                style={{
                  width: `${Math.max(volPct, 2)}%`,
                  background: isUp
                    ? 'linear-gradient(90deg, rgba(0,200,5,0.06) 0%, rgba(0,200,5,0.02) 70%, transparent 100%)'
                    : 'linear-gradient(90deg, rgba(232,84,78,0.06) 0%, rgba(232,84,78,0.02) 70%, transparent 100%)',
                }}
              />

              {/* Content */}
              <div className="relative flex items-center gap-3">
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {medal ? (
                    <span className="text-xl leading-none drop-shadow-sm">{medal.emoji}</span>
                  ) : rank <= 10 ? (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/10 dark:to-white/5 flex items-center justify-center mx-auto">
                      <span className="text-[11px] font-extrabold tabular-nums text-rh-light-text dark:text-rh-text">{rank}</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold tabular-nums text-rh-light-muted/50 dark:text-rh-muted/40">{rank}</span>
                  )}
                </div>

                {/* Logo + Info */}
                <StockLogo ticker={stock.ticker} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-rh-light-text dark:text-rh-text tracking-tight">{stock.ticker}</span>
                    {isHighVol && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-rh-green/15 to-emerald-500/10 dark:from-rh-green/10 dark:to-emerald-500/5 text-rh-green border border-rh-green/20">
                        🔥 {volRatio!.toFixed(1)}x
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate block">{stock.name}</span>
                </div>

                {/* Price */}
                <div className="text-right shrink-0 w-[72px]">
                  <div className="text-sm font-bold text-rh-light-text dark:text-rh-text tabular-nums">
                    ${stock.price.toFixed(2)}
                  </div>
                </div>

                {/* Change pill */}
                <div className="shrink-0 w-[68px] flex justify-end">
                  <div className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                    isUp
                      ? 'bg-rh-green/10 dark:bg-rh-green/[0.08] text-rh-green'
                      : 'bg-rh-red/10 dark:bg-rh-red/[0.08] text-rh-red'
                  }`}>
                    {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </div>
                </div>

                {/* Volume with mini bar */}
                <div className="shrink-0 w-[88px] hidden sm:flex flex-col items-end gap-0.5">
                  <div className="text-sm font-bold text-rh-light-text dark:text-rh-text tabular-nums">
                    {formatVolume(stock.volume ?? 0)}
                  </div>
                  <div className="w-full h-1 rounded-full bg-gray-200/80 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isUp ? 'bg-rh-green/60' : 'bg-rh-red/60'}`}
                      style={{ width: `${volPct}%` }}
                    />
                  </div>
                </div>

                {/* Mkt Cap */}
                <div className="text-right shrink-0 w-[64px] hidden lg:block">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                    {formatMktCap(stock.marketCapB)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Heatmap View (original DiscoverPage content) ─── */

function HeatmapView({ onTickerClick }: { onTickerClick: (ticker: string) => void }) {
  const [period, setPeriod] = useState<HeatmapPeriod>('1D');
  const [index, setIndex] = useState<MarketIndex>('SP500');
  const [highlightedSector, setHighlightedSector] = useState<string | null>(null);
  const treemapRef = useRef<HTMLDivElement>(null);
  // Initialize from cache so first render is instant on re-mount
  const initialKey = cacheKey('1D', 'SP500');
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
    }

    const load = async () => {
      try {
        if (!cached) setLoading(true);
        const resp = await getMarketHeatmap(period, index);
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
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-40 bg-rh-light-border/30 dark:bg-rh-border/30 rounded-lg" />
        <div className="h-[500px] bg-rh-light-border/20 dark:bg-rh-border/20 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-rh-light-border/20 dark:bg-rh-border/20 rounded-xl" />
          <div className="h-48 bg-rh-light-border/20 dark:bg-rh-border/20 rounded-xl" />
        </div>
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
            {allStocks.length} stocks across {data.sectors.length} sectors — sized by market cap, colored by {PERIOD_LABELS[period]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border border-rh-green border-t-transparent" />
          )}
        </div>
      </div>

      {/* Index + Period selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        {/* Index selector */}
        <div className="flex items-center gap-1 bg-gray-100/60 dark:bg-white/[0.04] rounded-lg p-0.5">
          {INDEXES.map((idx) => (
            <button
              key={idx.id}
              onClick={() => { setIndex(idx.id); setHighlightedSector(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                ${index === idx.id
                  ? 'bg-white dark:bg-white/[0.12] text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {idx.label}
            </button>
          ))}
        </div>

        <div className="hidden sm:block w-px h-5 bg-rh-light-border/30 dark:bg-rh-border/30" />

        {/* Period selector */}
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
        <Treemap sectors={data.sectors} onTickerClick={onTickerClick} highlightedSector={highlightedSector} stockCount={allStocks.length} />
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
      />
      <TopMovers stocks={allStocks} onTickerClick={onTickerClick} />
    </div>
  );
}

/* ─── Discover Page (wrapper with sub-tabs) ─── */

export function DiscoverPage({ onTickerClick }: DiscoverPageProps) {
  const [subTab, setSubTab] = useState<DiscoverSubTab>('heatmap');

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
    }).catch(() => {});

    // Refresh every hour for Top 100
    const interval = setInterval(() => {
      getMarketHeatmap('1D', 'SP500').then(resp => {
        setAllStocks(resp.sectors.flatMap(s => s.stocks));
        heatmapCache.set(cacheKey('1D', 'SP500'), { data: resp, ts: Date.now() });
      }).catch(() => {});
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
        <button onClick={() => setSubTab('top100')} className={tabClass(subTab === 'top100')}>
          Top 100
        </button>
      </div>

      {subTab === 'heatmap' ? (
        <HeatmapView onTickerClick={onTickerClick} />
      ) : (
        <Top100View stocks={allStocks} onTickerClick={onTickerClick} />
      )}
    </div>
  );
}
