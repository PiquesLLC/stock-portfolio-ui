import { useState, useMemo, useCallback } from 'react';
import { HeatmapStock } from '../types';

// --- Filter types ---

export type ScreenerSortKey = 'ticker' | 'name' | 'price' | 'changePercent' | 'marketCapB' | 'pe' | 'dividendYield' | 'beta' | 'week52Pos' | 'sector';
export type CapRange = 'all' | 'small' | 'mid' | 'large' | 'mega';
export type PeRange = 'all' | 'low' | 'mid' | 'high' | 'very_high';
export type DivRange = 'all' | 'gt1' | 'gt2' | 'gt4';
export type WeekRange = 'all' | 'near_low' | 'mid' | 'near_high';

// --- Range option constants ---

export const CAP_RANGES: { id: CapRange; label: string }[] = [
  { id: 'all', label: 'All Caps' },
  { id: 'small', label: '< $2B' },
  { id: 'mid', label: '$2-10B' },
  { id: 'large', label: '$10-200B' },
  { id: 'mega', label: '> $200B' },
];

export const PE_RANGES: { id: PeRange; label: string }[] = [
  { id: 'all', label: 'Any P/E' },
  { id: 'low', label: '< 15' },
  { id: 'mid', label: '15-25' },
  { id: 'high', label: '25-50' },
  { id: 'very_high', label: '50+' },
];

export const DIV_RANGES: { id: DivRange; label: string }[] = [
  { id: 'all', label: 'Any Div' },
  { id: 'gt1', label: '> 1%' },
  { id: 'gt2', label: '> 2%' },
  { id: 'gt4', label: '> 4%' },
];

export const WEEK_RANGES: { id: WeekRange; label: string }[] = [
  { id: 'all', label: 'Any 52W' },
  { id: 'near_low', label: 'Near Low' },
  { id: 'mid', label: 'Mid Range' },
  { id: 'near_high', label: 'Near High' },
];

// --- Utility ---

export function getWeek52Pos(stock: HeatmapStock): number | null {
  if (stock.week52High == null || stock.week52Low == null || stock.week52High <= stock.week52Low) return null;
  return (stock.price - stock.week52Low) / (stock.week52High - stock.week52Low);
}

// --- Hook ---

export interface UseScreenerFiltersResult {
  // Filter state
  sectorFilter: string;
  setSectorFilter: (v: string) => void;
  capFilter: CapRange;
  setCapFilter: (v: CapRange) => void;
  peFilter: PeRange;
  setPeFilter: (v: PeRange) => void;
  divFilter: DivRange;
  setDivFilter: (v: DivRange) => void;
  weekFilter: WeekRange;
  setWeekFilter: (v: WeekRange) => void;

  // Sort state
  sortKey: ScreenerSortKey;
  sortDir: 'asc' | 'desc';
  handleSort: (key: ScreenerSortKey) => void;

  // Derived data
  sectors: string[];
  filtered: HeatmapStock[];
}

export function useScreenerFilters(stocks: HeatmapStock[]): UseScreenerFiltersResult {
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [capFilter, setCapFilter] = useState<CapRange>('all');
  const [peFilter, setPeFilter] = useState<PeRange>('all');
  const [divFilter, setDivFilter] = useState<DivRange>('all');
  const [weekFilter, setWeekFilter] = useState<WeekRange>('all');
  const [sortKey, setSortKey] = useState<ScreenerSortKey>('marketCapB');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) if (s.sector) set.add(s.sector);
    return Array.from(set).sort();
  }, [stocks]);

  const filtered = useMemo(() => {
    let result = stocks.filter(s => s.price > 0);

    if (sectorFilter !== 'all') result = result.filter(s => s.sector === sectorFilter);

    if (capFilter !== 'all') {
      result = result.filter(s => {
        const cap = s.marketCapB;
        // Exclude tickers with no known market cap (server emits 0 when both
        // Polygon and Yahoo lack the value) — they don't belong in any cap bucket.
        if (cap == null || cap <= 0) return false;
        switch (capFilter) {
          case 'small': return cap < 2;
          case 'mid': return cap >= 2 && cap < 10;
          case 'large': return cap >= 10 && cap < 200;
          case 'mega': return cap >= 200;
          default: return true;
        }
      });
    }

    if (peFilter !== 'all') {
      result = result.filter(s => {
        const pe = s.pe;
        if (pe == null || pe <= 0) return false;
        switch (peFilter) {
          case 'low': return pe < 15;
          case 'mid': return pe >= 15 && pe < 25;
          case 'high': return pe >= 25 && pe < 50;
          case 'very_high': return pe >= 50;
          default: return true;
        }
      });
    }

    if (divFilter !== 'all') {
      result = result.filter(s => {
        const dy = s.dividendYield;
        if (dy == null) return false;
        const pct = dy * 100;
        switch (divFilter) {
          case 'gt1': return pct > 1;
          case 'gt2': return pct > 2;
          case 'gt4': return pct > 4;
          default: return true;
        }
      });
    }

    if (weekFilter !== 'all') {
      result = result.filter(s => {
        const pos = getWeek52Pos(s);
        if (pos == null) return false;
        switch (weekFilter) {
          case 'near_low': return pos < 0.2;
          case 'mid': return pos >= 0.2 && pos <= 0.8;
          case 'near_high': return pos > 0.8;
          default: return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortKey) {
        case 'ticker': return sortDir === 'asc' ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
        case 'name': return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case 'price': aVal = a.price; bVal = b.price; break;
        case 'changePercent': aVal = a.changePercent; bVal = b.changePercent; break;
        case 'marketCapB': {
          // Treat 0 (server's "unknown" sentinel) and nullish identically — both
          // sort as -1 so unknown-cap rows always sit below the smallest real cap.
          const av = a.marketCapB ?? 0;
          const bv = b.marketCapB ?? 0;
          aVal = av > 0 ? av : -1;
          bVal = bv > 0 ? bv : -1;
          break;
        }
        case 'pe': aVal = a.pe ?? -1; bVal = b.pe ?? -1; break;
        case 'dividendYield': aVal = a.dividendYield ?? -1; bVal = b.dividendYield ?? -1; break;
        case 'beta': aVal = a.beta ?? -1; bVal = b.beta ?? -1; break;
        case 'week52Pos': aVal = getWeek52Pos(a) ?? -1; bVal = getWeek52Pos(b) ?? -1; break;
        case 'sector': return sortDir === 'asc' ? (a.sector ?? '').localeCompare(b.sector ?? '') : (b.sector ?? '').localeCompare(a.sector ?? '');
        default: aVal = 0; bVal = 0;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [stocks, sectorFilter, capFilter, peFilter, divFilter, weekFilter, sortKey, sortDir]);

  const handleSort = useCallback((key: ScreenerSortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' || key === 'name' || key === 'sector' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  return {
    sectorFilter,
    setSectorFilter,
    capFilter,
    setCapFilter,
    peFilter,
    setPeFilter,
    divFilter,
    setDivFilter,
    weekFilter,
    setWeekFilter,
    sortKey,
    sortDir,
    handleSort,
    sectors,
    filtered,
  };
}
