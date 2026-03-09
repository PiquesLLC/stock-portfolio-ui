import { useState, useCallback, useMemo, useEffect } from 'react';
import { ChartPeriod, StockDetailsResponse } from '../types';
import { IntradayCandle } from '../api';

interface UseStockChartParams {
  ticker: string;
  data: StockDetailsResponse | null;
  chartPeriod: ChartPeriod;
  setChartPeriod: (period: ChartPeriod) => void;
  intradayCandles: IntradayCandle[];
  hourlyCandles: IntradayCandle[];
  setHourlyCandles: React.Dispatch<React.SetStateAction<IntradayCandle[]>>;
  hourlyCache: React.MutableRefObject<Record<string, IntradayCandle[]>>;
}

/**
 * Hook that manages chart period switching, zoom resolution, hover state,
 * and computed chart values (period change, golden cross detection).
 */
export function useStockChart({
  data,
  chartPeriod,
  setChartPeriod,
  intradayCandles,
  setHourlyCandles,
  hourlyCache,
}: UseStockChartParams) {
  const handlePeriodChange = useCallback((period: ChartPeriod) => {
    setChartPeriod(period);
    // Synchronously set hourly candles to avoid a blank-frame flash
    // when auto-zoom-switch changes to 1W/1M before the useEffect runs
    if (period === '1W' || period === '1M') {
      setHourlyCandles(hourlyCache.current[period] || []);
    } else {
      setHourlyCandles([]);
    }
  }, [setChartPeriod, setHourlyCandles, hourlyCache]);

  // Zoom data resolution state
  const [zoomData, setZoomData] = useState<{ time: number; label: string; price: number; volume?: number }[]>([]);

  const handleResolutionRequest = useCallback((level: 'daily' | 'hourly' | 'intraday', rangeStart: number, rangeEnd: number) => {
    if (level === 'daily') { setZoomData([]); return; }
    if (level === 'hourly') {
      const all = [...(hourlyCache.current['1W'] || []), ...(hourlyCache.current['1M'] || [])];
      const seen = new Set<number>();
      const filtered = all.filter(c => {
        const t = new Date(c.time).getTime();
        if (seen.has(t) || t < rangeStart || t > rangeEnd) return false;
        seen.add(t); return true;
      }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      if (filtered.length > 0) {
        setZoomData(filtered.map(c => {
          const d = new Date(c.time);
          return { time: d.getTime(), label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: c.close, volume: c.volume };
        }));
      }
      return;
    }
    if (level === 'intraday' && intradayCandles.length > 0) {
      const filtered = intradayCandles.filter(c => {
        const t = new Date(c.time).getTime();
        return t >= rangeStart && t <= rangeEnd;
      });
      if (filtered.length > 0) {
        setZoomData(filtered.map(c => {
          const d = new Date(c.time);
          return { time: d.getTime(), label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: c.close, volume: c.volume };
        }));
      }
    }
  }, [intradayCandles, hourlyCache]);

  // Hover state for chart crosshair
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [hoverRefPrice, setHoverRefPrice] = useState<number | null>(null);

  const handleHoverPrice = useCallback((price: number | null, label: string | null, refPrice?: number) => {
    setHoverPrice(price);
    setHoverLabel(label);
    setHoverRefPrice(refPrice ?? null);
  }, []);

  // Set hourly candles from prefetched cache — instant switch
  useEffect(() => {
    if (chartPeriod === '1W' || chartPeriod === '1M') {
      setHourlyCandles(hourlyCache.current[chartPeriod] || []);
    } else {
      setHourlyCandles([]);
    }
  }, [chartPeriod, setHourlyCandles, hourlyCache]);

  // Compute period-specific change
  const periodChange = useMemo(() => {
    if (!data) return { change: 0, changePct: 0, label: 'Today' };
    const quote = data.quote;
    if (chartPeriod === '1D') {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const candles = data.candles;
    if (!candles || candles.closes.length === 0) {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const now = new Date();
    let cutoff: Date;
    switch (chartPeriod) {
      case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break;
      case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
      case '6M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6); break;
      case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case 'MAX': cutoff = new Date(1970, 0, 1); break;
      default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startPrice = candles.closes[0];
    for (let i = 0; i < candles.dates.length; i++) {
      if (candles.dates[i] >= cutoffStr) {
        startPrice = candles.closes[i];
        break;
      }
    }
    // Use the most recent price (extended/after-hours if available) for period change
    const latestPrice = quote.extendedPrice ?? quote.currentPrice;
    const change = latestPrice - startPrice;
    const changePct = startPrice !== 0 ? (change / startPrice) * 100 : 0;
    const labels: Record<string, string> = { '1W': 'Past Week', '1M': 'Past Month', '3M': 'Past 3 Months', '6M': 'Past 6 Months', 'YTD': 'Year to Date', '1Y': 'Past Year', 'MAX': 'All Time' };
    return { change, changePct, label: labels[chartPeriod] || chartPeriod };
  }, [chartPeriod, data]);

  // Golden Cross detection: only show badge if a cross EVENT occurs within the visible timeframe
  const goldenCrossInfo = useMemo<{ active: false } | { active: true; date: string; dateFormatted: string; ma100: number; ma200: number }>(() => {
    const candles = data?.candles;
    if (!candles || candles.closes.length < 200) return { active: false };
    const closes = candles.closes;
    const dates = candles.dates;
    const n = closes.length;

    const now = new Date();
    let cutoff: Date;
    switch (chartPeriod) {
      case '1D': case '1W': return { active: false };
      case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
      case '6M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6); break;
      case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case 'MAX': cutoff = new Date(1970, 0, 1); break;
      default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let windowStart = 0;
    for (let i = 0; i < n; i++) {
      if (dates[i] >= cutoffStr) { windowStart = i; break; }
    }
    const scanStart = Math.max(windowStart, 200);

    let lastCrossDate: string | null = null;
    let lastMa100 = 0, lastMa200 = 0;
    for (let i = scanStart; i < n; i++) {
      let s100 = 0, s100prev = 0, s200 = 0, s200prev = 0;
      for (let j = i - 100; j < i; j++) s100 += closes[j];
      for (let j = i - 101; j < i - 1; j++) s100prev += closes[j];
      for (let j = i - 200; j < i; j++) s200 += closes[j];
      for (let j = i - 201; j < i - 1; j++) s200prev += closes[j];
      const ma100 = s100 / 100;
      const ma100prev = s100prev / 100;
      const ma200 = s200 / 200;
      const ma200prev = s200prev / 200;

      if ((ma100prev - ma200prev) <= 0 && (ma100 - ma200) > 0 && dates[i] >= cutoffStr) {
        lastCrossDate = dates[i];
        lastMa100 = ma100;
        lastMa200 = ma200;
      }
    }

    if (lastCrossDate) {
      const d = new Date(lastCrossDate + 'T00:00:00');
      const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { active: true, date: lastCrossDate, dateFormatted, ma100: lastMa100, ma200: lastMa200 };
    }
    return { active: false };
  }, [data?.candles, chartPeriod]);

  return {
    handlePeriodChange,
    zoomData,
    hoverPrice,
    hoverLabel,
    hoverRefPrice,
    handleHoverPrice,
    handleResolutionRequest,
    periodChange,
    goldenCrossInfo,
  };
}
