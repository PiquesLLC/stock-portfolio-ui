import { useMemo } from 'react';
import { HeatmapSector, HeatmapSubSector, HeatmapStock } from '../types';

// --- Layout result types ---

export interface StockTile {
  x: number;
  y: number;
  w: number;
  h: number;
  stock: HeatmapStock;
  sectorName: string;
  subSectorName: string;
}

export interface SubSectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  subSector: HeatmapSubSector;
  sectorName: string;
  children: StockTile[];
}

export interface SectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  sector: HeatmapSector;
  subSectors: SubSectorRect[];
}

// These constants must match the ones in DiscoverPage.tsx
const SECTOR_LABEL_H = 18;
const SUB_SECTOR_LABEL_H = 12;

interface UseTreemapLayoutParams {
  sectors: HeatmapSector[];
  dims: { width: number; height: number };
  dampenExponent: number;
  minFloorRatio: number;
  sectorGap: number;
  isThemesDefault: boolean;
  isThemesDrilldown: boolean;
  drilldownTheme: { theme: string; subtheme: string } | null;
  squarifyLayout: <T>(
    items: { value: number; data: T }[],
    x: number,
    y: number,
    w: number,
    h: number,
  ) => { x: number; y: number; w: number; h: number; data: T }[];
  dampenCapWithFloor: (caps: number[], exponent: number, minRatio: number) => number[];
}

interface UseTreemapLayoutResult {
  sectorRects: SectorRect[];
  drilldownRects: SectorRect[] | null;
}

export function useTreemapLayout({
  sectors,
  dims,
  dampenExponent,
  minFloorRatio,
  sectorGap,
  isThemesDefault,
  isThemesDrilldown,
  drilldownTheme,
  squarifyLayout,
  dampenCapWithFloor,
}: UseTreemapLayoutParams): UseTreemapLayoutResult {

  // 3-level layout: Sector -> Sub-sector -> Stocks
  const sectorRects = useMemo((): SectorRect[] => {
    if (dims.width === 0) return [];

    // Layout sectors with floor-clamped dampening
    const filteredSectors = sectors.filter(s => s.totalMarketCapB > 0);
    const sectorCaps = filteredSectors.map(s => s.totalMarketCapB);
    const dampenedSectorCaps = dampenCapWithFloor(sectorCaps, dampenExponent, minFloorRatio);
    const sectorItems = filteredSectors
      .map((s, i) => ({ value: dampenedSectorCaps[i], data: s }));

    if (sectorItems.length === 0) return [];
    const sectorLayout = squarifyLayout(sectorItems, 0, 0, dims.width, dims.height);

    return sectorLayout.map((sl) => {
      const sector = sl.data;
      const pad = sectorGap;
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

      if (!showSubLabels || isThemesDefault) {
        // Flat layout — all stocks directly (for themes: subtheme tiles, no individual stocks)
        const filteredStocks = sector.stocks.filter(s => s.marketCapB > 0);
        const stockCaps = filteredStocks.map(s => s.marketCapB);
        const dampenedStockCaps = dampenCapWithFloor(stockCaps, dampenExponent, minFloorRatio);
        const stockItems = filteredStocks
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
      const subItems = filteredSubs
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
        const stockItems = filteredSubStocks
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
  }, [sectors, dims, dampenExponent, minFloorRatio, sectorGap, isThemesDefault, squarifyLayout, dampenCapWithFloor]);

  // Drilldown layout: when user clicks a subtheme, show its individual tickers
  const drilldownRects = useMemo((): SectorRect[] | null => {
    if (!isThemesDrilldown || dims.width === 0 || !drilldownTheme) return null;
    const theme = sectors.find(s => s.name === drilldownTheme.theme);
    const sub = theme?.subSectors.find(s => s.name === drilldownTheme.subtheme);
    if (!theme || !sub) return null;

    const pad = sectorGap;
    const innerX = pad;
    const innerY = SECTOR_LABEL_H + pad;
    const innerW = dims.width - pad * 2;
    const innerH = dims.height - SECTOR_LABEL_H - pad * 2;

    const filteredStocks = sub.stocks.filter(s => s.marketCapB > 0);
    const stockCaps = filteredStocks.map(s => s.marketCapB);
    const dampenedCaps = dampenCapWithFloor(stockCaps, dampenExponent, minFloorRatio);
    const items = filteredStocks
      .map((s, i) => ({ value: dampenedCaps[i], data: s }));

    const layout = squarifyLayout(items, innerX, innerY, innerW, innerH);

    const singleSub: SubSectorRect = {
      x: innerX, y: innerY, w: innerW, h: innerH,
      subSector: sub,
      sectorName: drilldownTheme.theme,
      children: layout.map(r => ({
        x: r.x, y: r.y, w: r.w, h: r.h,
        stock: r.data,
        sectorName: drilldownTheme.theme,
        subSectorName: drilldownTheme.subtheme,
      })),
    };

    return [{
      x: 0, y: 0, w: dims.width, h: dims.height,
      sector: {
        name: drilldownTheme.theme,
        stocks: sub.stocks,
        subSectors: [sub],
        totalMarketCapB: sub.totalMarketCapB,
        avgChangePercent: sub.avgChangePercent,
        gainers: sub.stocks.filter(s => s.changePercent > 0).length,
        losers: sub.stocks.filter(s => s.changePercent < 0).length,
      },
      subSectors: [singleSub],
    }];
  }, [sectors, dims, dampenExponent, minFloorRatio, sectorGap, isThemesDrilldown, drilldownTheme, squarifyLayout, dampenCapWithFloor]);

  return { sectorRects, drilldownRects };
}
