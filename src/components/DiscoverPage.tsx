import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getMarketHeatmap, HeatmapPeriod, MarketIndex } from '../api';
import { HeatmapResponse, HeatmapSector, HeatmapSubSector, HeatmapStock } from '../types';
import { formatCurrency } from '../utils/format';

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
      const showSubLabels = hasMultipleSubs && sectorAreaPx > 8000;

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
        const subLabelH = subL.h > 30 && subL.w > 50 ? SUB_SECTOR_LABEL_H : 0;
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
    <div ref={containerRef} className="w-full relative" onMouseMove={handleMouseMove}>
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
            {sr.w > 40 && (() => {
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
                  <text
                    x={sr.x + SECTOR_GAP + 4}
                    y={sr.y + SECTOR_LABEL_H - 4}
                    fontSize={sr.w > 200 ? 9.5 : sr.w > 100 ? 8 : 6.5}
                    fontWeight={700}
                    fill={isLabelHovered
                      ? (isDark ? '#fff' : 'rgba(0,0,0,0.8)')
                      : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)')}
                    style={{
                      pointerEvents: 'none',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      transition: 'fill 0.15s',
                    }}
                  >
                    {sr.sector.name}
                  </text>
                </g>
              );
            })()}
            {/* Sub-sector groups */}
            {sr.subSectors.map((subR) => {
              const subFontSize = subR.w > 120 ? 7.5 : 6;
              const charW = subFontSize * 0.58;
              const fullFits = subR.subSector.name.length * charW < subR.w - 8;
              const abbr = abbreviateSubSector(subR.subSector.name);
              const abbrFits = abbr.length * charW < subR.w - 8;
              const showSubLabel = sr.sector.subSectors.length > 1 && subR.h > 30 && (fullFits || abbrFits) && dims.width >= 640;
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
                    const labelText = expanded ? subR.subSector.name : abbr;
                    const clipId = `sc-${sr.sector.name}-${subR.subSector.name}`.replace(/[^a-zA-Z0-9]/g, '_');
                    return (
                      <>
                        <clipPath id={clipId}>
                          <rect x={subR.x} y={subR.y} width={subR.w} height={SUB_SECTOR_LABEL_H} />
                        </clipPath>
                        <text
                          x={subR.x + 3}
                          y={subR.y + SUB_SECTOR_LABEL_H - 3}
                          fontSize={subFontSize}
                          fontWeight={600}
                          fill={isSubHovered
                            ? (isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)')
                            : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)')}
                          clipPath={expanded ? undefined : `url(#${clipId})`}
                          style={{
                            pointerEvents: 'none',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
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

                    const showTicker = isMobile ? (tileW > 26 && tileH > 14) : (tileW > 16 && tileH > 10);
                    const showPct = isMobile ? (tileW > 34 && tileH > 22) : (tileW > 24 && tileH > 20);
                    const fontSize = tileW > 110 && tileH > 65 ? 15
                      : tileW > 80 && tileH > 50 ? 13
                      : tileW > 55 && tileH > 35 ? 11
                      : tileW > 35 && tileH > 22 ? 9
                      : tileW > 20 && tileH > 14 ? 7.5
                      : 6.5;
                    const pctFontSize = Math.max(fontSize - 1.5, 6);

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
                        onClick={() => onTickerClick(r.stock.ticker)}
                        onMouseEnter={() => handleStockHover(r.stock, r.sectorName)}
                        onMouseLeave={handleStockLeave}
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
                                {r.stock.ticker}
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
          className="absolute z-50 pointer-events-none rounded-xl shadow-2xl shadow-black/60 border text-xs
            bg-white/95 dark:bg-[#1a1a1e]/90 border-white/20 dark:border-white/10
            backdrop-blur-xl"
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
              className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-rh-light-bg dark:hover:bg-white/5 transition-colors"
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
              className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-rh-light-bg dark:hover:bg-white/5 transition-colors"
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
const preloaded = (window as any).__heatmapPreload as { data: HeatmapResponse; ts: number } | undefined;
if (preloaded && !heatmapCache.has(cacheKey('1D', 'SP500'))) {
  heatmapCache.set(cacheKey('1D', 'SP500'), preloaded);
  delete (window as any).__heatmapPreload;
}


export function DiscoverPage({ onTickerClick }: DiscoverPageProps) {
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
