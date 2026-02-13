import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getMarketHeatmap, HeatmapPeriod } from '../api';
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

  // Neutral base: visible slate gray (not near-black)
  const bR = 68, bG = 70, bB = 84;

  if (c > 0) {
    const t = Math.min(c / 3, 1);
    // Slate gray → rh-green (#00C805 = rgb(0,200,5))
    const r = Math.round(bR + (0 - bR) * t);
    const g = Math.round(bG + (200 - bG) * t);
    const b = Math.round(bB + (5 - bB) * t);
    return `rgb(${r},${g},${b})`;
  } else if (c < 0) {
    const t = Math.min(Math.abs(c) / 3, 1);
    // Slate gray → rh-red (#E8544E = rgb(232,84,78))
    const r = Math.round(bR + (232 - bR) * t);
    const g = Math.round(bG + (84 - bG) * t);
    const b = Math.round(bB + (78 - bB) * t);
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

// Dampen market cap so mega-caps don't eat the whole map
function dampenCap(cap: number): number {
  return Math.pow(Math.max(cap, 0.1), 0.45);
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

const GAP = 1.5;
const SECTOR_LABEL_H = 15;
const SUB_SECTOR_LABEL_H = 12;
const SECTOR_GAP = 2;

function Treemap({
  sectors,
  onTickerClick,
  highlightedSector,
}: {
  sectors: HeatmapSector[];
  onTickerClick: (ticker: string) => void;
  highlightedSector?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hoveredStock, setHoveredStock] = useState<HeatmapStock | null>(null);
  const [hoveredSubSector, setHoveredSubSector] = useState<{ sector: string; subSector: string } | null>(null);
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
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      const isMobile = width < 640;
      setDims({ width, height: isMobile ? Math.max(300, Math.round(width * 0.8)) : Math.max(500, Math.round(width * 0.62)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 3-level layout: Sector → Sub-sector → Stocks
  const sectorRects = useMemo((): SectorRect[] => {
    if (dims.width === 0) return [];

    // Layout sectors
    const sectorItems: LayoutItem<HeatmapSector>[] = sectors
      .filter(s => s.totalMarketCapB > 0)
      .map(s => ({ value: dampenCap(s.totalMarketCapB), data: s }));

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
        const stockItems: LayoutItem<HeatmapStock>[] = sector.stocks
          .filter(s => s.marketCapB > 0)
          .map(s => ({ value: dampenCap(s.marketCapB), data: s }));

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
      const subItems: LayoutItem<HeatmapSubSector>[] = sector.subSectors
        .filter(s => s.totalMarketCapB > 0)
        .map(s => ({ value: dampenCap(s.totalMarketCapB), data: s }));

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

        const stockItems: LayoutItem<HeatmapStock>[] = sub.stocks
          .filter(s => s.marketCapB > 0)
          .map(s => ({ value: dampenCap(s.marketCapB), data: s }));

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
  }, [sectors, dims]);

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

  const tileStroke = isDark ? '#111' : '#d0d0d0';

  // Get the sub-sector stocks for the popup
  const popupSubSector = hoveredSubSector
    ? subSectorMap.get(`${hoveredSubSector.sector}::${hoveredSubSector.subSector}`)
    : null;

  return (
    <div ref={containerRef} className="w-full relative" onMouseMove={handleMouseMove}>
      <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/40"
        style={{ background: isDark ? 'rgba(15,15,18,0.85)' : 'rgba(240,240,244,0.9)', backdropFilter: 'blur(20px)' }}
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
              fill={isDark ? '#141414' : '#ddd'}
              rx={1}
            />
            {/* Sector label bar */}
            {sr.w > 40 && (
              <>
                <rect
                  x={sr.x + 2}
                  y={sr.y + 2}
                  width={Math.max(0, sr.w - 4)}
                  height={SECTOR_LABEL_H - 1}
                  fill={isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.08)'}
                  rx={1}
                />
                <text
                  x={sr.x + SECTOR_GAP + 4}
                  y={sr.y + SECTOR_LABEL_H - 4}
                  fontSize={sr.w > 200 ? 9.5 : sr.w > 100 ? 8 : 6.5}
                  fontWeight={700}
                  fill={isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'}
                  style={{
                    pointerEvents: 'none',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {sr.sector.name}
                </text>
              </>
            )}
            {/* Sub-sector groups */}
            {sr.subSectors.map((subR) => {
              const showSubLabel = sr.sector.subSectors.length > 1 && subR.h > 30 && subR.w > 50;
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
                      stroke={isDark ? '#222' : '#bbb'}
                      strokeWidth={0.5}
                    />
                  )}
                  {/* Sub-sector label */}
                  {showSubLabel && (
                    <text
                      x={subR.x + 3}
                      y={subR.y + SUB_SECTOR_LABEL_H - 3}
                      fontSize={subR.w > 120 ? 7.5 : 6}
                      fontWeight={600}
                      fill={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'}
                      style={{
                        pointerEvents: 'none',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {subR.subSector.name}
                    </text>
                  )}
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

                    const showTicker = tileW > 16 && tileH > 10;
                    const showPct = tileW > 24 && tileH > 20;
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
                          <text
                            x={r.x + halfGap + tileW / 2}
                            y={r.y + halfGap + tileH / 2 + (showPct ? -pctFontSize * 0.35 : fontSize * 0.35)}
                            textAnchor="middle"
                            fontSize={fontSize}
                            fontWeight={700}
                            fill="#fff"
                            opacity={opacity}
                            style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 1px 2px rgba(0,0,0,0.5)', transition: 'opacity 0.15s' }}
                          >
                            {r.stock.ticker}
                          </text>
                        )}
                        {showPct && (
                          <text
                            x={r.x + halfGap + tileW / 2}
                            y={r.y + halfGap + tileH / 2 + pctFontSize * 1.1}
                            textAnchor="middle"
                            fontSize={pctFontSize}
                            fontWeight={500}
                            fill="rgba(255,255,255,0.85)"
                            opacity={opacity}
                            style={{ pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, sans-serif', textShadow: '0 1px 2px rgba(0,0,0,0.5)', transition: 'opacity 0.15s' }}
                          >
                            {r.stock.changePercent >= 0 ? '+' : ''}{r.stock.changePercent.toFixed(2)}%
                          </text>
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

// In-memory cache so switching periods / re-mounting is instant
const heatmapCache = new Map<HeatmapPeriod, { data: HeatmapResponse; ts: number }>();

// Pick up preloaded data from App.tsx boot (stored on window)
const preloaded = (window as any).__heatmapPreload as { data: HeatmapResponse; ts: number } | undefined;
if (preloaded && !heatmapCache.has('1D')) {
  heatmapCache.set('1D', preloaded);
  delete (window as any).__heatmapPreload;
}


export function DiscoverPage({ onTickerClick }: DiscoverPageProps) {
  const [period, setPeriod] = useState<HeatmapPeriod>('1D');
  const [highlightedSector, setHighlightedSector] = useState<string | null>(null);
  const treemapRef = useRef<HTMLDivElement>(null);
  // Initialize from cache so first render is instant on re-mount
  const initialCache = heatmapCache.get('1D');
  const [data, setData] = useState<HeatmapResponse | null>(initialCache?.data ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Show cached data instantly (stale-while-revalidate)
    const cached = heatmapCache.get(period);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    }

    const load = async () => {
      try {
        if (!cached) setLoading(true);
        const resp = await getMarketHeatmap(period);
        if (!cancelled) {
          setData(resp);
          heatmapCache.set(period, { data: resp, ts: Date.now() });
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
  }, [period]);

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
          onClick={() => { setError(''); setLoading(true); getMarketHeatmap(period).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }}
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
          <h2 className="text-lg font-bold text-rh-light-text dark:text-rh-text">Market Heatmap</h2>
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

      <div ref={treemapRef}>
        <Treemap sectors={data.sectors} onTickerClick={onTickerClick} highlightedSector={highlightedSector} />
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
