import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChartPeriod, StockCandles, ParsedQuarterlyEarning, DividendEvent, DividendCredit, ActivityEvent, AnalystEvent } from '../types';
import { AIEvent } from '../api';
import { IntradayCandle } from '../api';
import {
  snapToCleanBoundary,
  buildPoints,
  formatVolume,
  MA_PERIODS,
  type MAPeriod,
  MA_COLORS,
  calcSMA,
  detectAllBreaches,
  SIGNAL_MA_PERIODS,
  type BreachCluster,
  clusterBreaches,
  type CrossEvent,
  CROSS_COLORS,
  detectCrosses,
  clusterColor,
  clusterPillSize,
  clusterGlowOpacity,
  CHART_W,
  CHART_H,
  PAD_TOP,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PERIODS,
} from '../utils/stock-chart';

interface Props {
  ticker?: string;
  candles: StockCandles | null;
  intradayCandles?: IntradayCandle[];
  hourlyCandles?: IntradayCandle[];
  livePrices: { time: string; price: number }[];
  selectedPeriod: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  currentPrice: number;
  previousClose: number;
  regularClose?: number; // Regular market close price (used for non-1D periods during extended hours)
  onHoverPrice?: (price: number | null, label: string | null, refPrice?: number) => void;
  goldenCrossDate?: string | null; // ISO date string of golden cross within timeframe
  session?: string; // Market session: 'REG', 'PRE', 'POST', 'CLOSED'
  // Events layer data
  earnings?: ParsedQuarterlyEarning[];
  dividendEvents?: DividendEvent[];
  dividendCredits?: DividendCredit[];
  tradeEvents?: ActivityEvent[];
  analystEvents?: AnalystEvent[];
  aiEvents?: AIEvent[];
  onRequestResolution?: (level: 'daily' | 'hourly' | 'intraday', rangeStart: number, rangeEnd: number) => void;
  zoomData?: { time: number; label: string; price: number; volume?: number }[];
  // Comparison overlay — normalized % return lines from other tickers
  comparisons?: { ticker: string; color: string; points: { time: number; price: number }[] }[];
}

export function StockPriceChart({ ticker, candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, onPeriodChange, currentPrice, previousClose, regularClose: _regularClose, onHoverPrice, goldenCrossDate: _goldenCrossDate, session, earnings, dividendEvents, dividendCredits, tradeEvents, analystEvents, aiEvents, onRequestResolution, zoomData, comparisons }: Props) {
  const points = useMemo(
    () => buildPoints(candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, currentPrice, previousClose),
    [candles, intradayCandles, hourlyCandles, livePrices, selectedPeriod, currentPrice, previousClose],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [enabledMAs, setEnabledMAs] = useState<Set<MAPeriod>>(() => {
    try {
      const saved = localStorage.getItem('stockChartMAs');
      if (saved) return new Set(JSON.parse(saved) as MAPeriod[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const [signalsEnabled, setSignalsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stockChartSignals');
      if (saved !== null) return JSON.parse(saved);
    } catch { /* ignore */ }
    return true;
  });
  const toggleSignals = useCallback(() => {
    setSignalsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('stockChartSignals', JSON.stringify(next));
      return next;
    });
  }, []);
  const [eventsEnabled, setEventsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stockChartEvents');
      if (saved !== null) return JSON.parse(saved);
    } catch { /* ignore */ }
    return true;
  });
  const toggleEvents = useCallback(() => {
    setEventsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('stockChartEvents', JSON.stringify(next));
      return next;
    });
  }, []);
  const [volumeEnabled, setVolumeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stockChartVolume');
      if (saved !== null) return JSON.parse(saved);
    } catch { /* ignore */ }
    return false;
  });
  const toggleVolume = useCallback(() => {
    setVolumeEnabled(prev => {
      const next = !prev;
      localStorage.setItem('stockChartVolume', JSON.stringify(next));
      return next;
    });
  }, []);
  const [hoveredEventIdx, setHoveredEventIdx] = useState<number | null>(null);
  const [pinnedEventIdx, setPinnedEventIdx] = useState<number | null>(null);
  const [hoveredBreachIndex, setHoveredBreachIndex] = useState<number | null>(null);
  const [hoveredCrossIndex, setHoveredCrossIndex] = useState<number | null>(null);
  // Load persisted measurements from localStorage
  const loadMeasurements = useCallback(() => {
    if (!ticker) return { a: null, b: null, c: null };
    try {
      const raw = localStorage.getItem(`chart-measure-${ticker}`);
      if (raw) return JSON.parse(raw) as { a: { time: number; price: number } | null; b: { time: number; price: number } | null; c: { time: number; price: number } | null };
    } catch {}
    return { a: null, b: null, c: null };
  }, [ticker]);
  const initMeasure = useRef(loadMeasurements());
  const [measureA, setMeasureA] = useState<{ time: number; price: number } | null>(initMeasure.current.a);
  const [measureB, setMeasureB] = useState<{ time: number; price: number } | null>(initMeasure.current.b);
  const [measureC, setMeasureC] = useState<{ time: number; price: number } | null>(initMeasure.current.c);
  // Persist measurements to localStorage
  useEffect(() => {
    if (!ticker) return;
    if (!measureA && !measureB && !measureC) {
      localStorage.removeItem(`chart-measure-${ticker}`);
    } else {
      localStorage.setItem(`chart-measure-${ticker}`, JSON.stringify({ a: measureA, b: measureB, c: measureC }));
    }
  }, [ticker, measureA, measureB, measureC]);

  // Reload measurements when ticker changes
  useEffect(() => {
    if (!ticker) return;
    const saved = loadMeasurements();
    setMeasureA(saved.a);
    setMeasureB(saved.b);
    setMeasureC(saved.c);
  }, [ticker, loadMeasurements]);

  const [showMeasureHint, setShowMeasureHint] = useState(true);
  const [cardDragPos, setCardDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [signalDragPos, setSignalDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSignal, setIsDraggingSignal] = useState(false);
  const isMeasuring = measureA !== null;
  const hasMeasurement = measureA !== null && measureB !== null;
  const hasFullMeasurement = hasMeasurement && measureC !== null;
  const svgRef = useRef<SVGSVGElement>(null);
  const yRangeRef = useRef<{ min: number; max: number; period: string } | null>(null);
  const measureCardPos = useRef<{ bottomPct: number; leftPct: number } | null>(null);
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Zoom state ────────────────────────────────────────────────────
  const [zoomRange, setZoomRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const zoomRangeRef = useRef(zoomRange);
  useEffect(() => { zoomRangeRef.current = zoomRange; }, [zoomRange]);
  const pointsRef = useRef(points);
  useEffect(() => { pointsRef.current = points; }, [points]);
  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; rangeStart: number; rangeEnd: number } | null>(null);
  // Zoom history for back navigation
  const zoomHistoryRef = useRef<({ startMs: number; endMs: number } | null)[]>([]);
  const zoomHistoryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Touch pinch/pan state
  const touchStartRef = useRef<{ distance: number; startMs: number; endMs: number; centerRatio: number } | null>(null);
  const singleTouchRef = useRef<{ x: number; startMs: number; endMs: number } | null>(null);
  // Touch hover state (Robinhood-style press-and-drag crosshair)
  const isTouchHoveringRef = useRef(false);
  const wasTouchRef = useRef(false); // suppress click-to-measure after touch
  const isTwoFingerRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  // Zoom bar drag state
  const [isBarDragging, setIsBarDragging] = useState(false);
  const barDragRef = useRef<{ startX: number; startLeft: number; barWidth: number; containerWidth: number } | null>(null);
  const zoomBarRef = useRef<HTMLDivElement>(null);
  // Animated zoom transition refs
  const zoomAnimRef = useRef<{
    fromStart: number; fromEnd: number; toStart: number; toEnd: number;
    startTime: number; duration: number; toNull: boolean;
  } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Derive visible index range from zoom
  const { visStartIdx, visEndIdx, visiblePoints } = useMemo(() => {
    if (!zoomRange || points.length < 2) {
      return { visStartIdx: 0, visEndIdx: points.length - 1, visiblePoints: points };
    }
    // Binary search for first point >= zoomRange.startMs
    let lo = 0, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].time < zoomRange.startMs) lo = mid + 1;
      else hi = mid;
    }
    const startIdx = Math.max(0, lo - 1); // include one before for line continuity
    // Binary search for last point <= zoomRange.endMs
    lo = startIdx; hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (points[mid].time > zoomRange.endMs) hi = mid - 1;
      else lo = mid;
    }
    const endIdx = Math.min(points.length - 1, hi + 1); // include one after
    return {
      visStartIdx: startIdx,
      visEndIdx: endIdx,
      visiblePoints: points.slice(startIdx, endIdx + 1),
    };
  }, [zoomRange, points]);

  // Request higher-resolution data when zoomed into small time range
  useEffect(() => {
    if (!zoomRange || !onRequestResolution || selectedPeriod === '1D' || selectedPeriod === '1W' || selectedPeriod === '1M') return;
    const duration = zoomRange.endMs - zoomRange.startMs;
    const thirtyFiveDays = 35 * 86400000; // covers 1M zoom window
    const twoDays = 2 * 86400000;
    if (duration <= twoDays) onRequestResolution('intraday', zoomRange.startMs, zoomRange.endMs);
    else if (duration <= thirtyFiveDays) onRequestResolution('hourly', zoomRange.startMs, zoomRange.endMs);
    else onRequestResolution('daily', zoomRange.startMs, zoomRange.endMs);
  }, [zoomRange, onRequestResolution, selectedPeriod]);

  // Use high-res data for rendering when available (keeps main points for hover/events)
  const zoomDataPoints = useMemo(() => {
    if (!zoomData || zoomData.length === 0 || !zoomRange) return null;
    return zoomData.filter(p => p.time >= zoomRange.startMs && p.time <= zoomRange.endMs);
  }, [zoomData, zoomRange]);

  const toggleMA = useCallback((period: MAPeriod) => {
    setEnabledMAs(prev => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      localStorage.setItem('stockChartMAs', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Clear state when period or data changes — set zoom window for the selected period
  useEffect(() => {
    setHoveredBreachIndex(null); setHoveredCrossIndex(null); setHoveredEventIdx(null);
    setPinnedEventIdx(null); setExpandedClusterIdx(null); setHoverIndex(null);
    zoomHistoryRef.current = [];

    // For non-1D: period buttons set the visible zoom window on the full dataset
    // MAX = full view (null), others = zoom to that period's time range
    if (selectedPeriod === 'MAX' || selectedPeriod === '1D' || selectedPeriod === '1W' || selectedPeriod === '1M' || points.length < 2) {
      animateZoomTo(null);
    } else {
      const now = Date.now();
      let startMs: number;
      switch (selectedPeriod) {
        case '3M': startMs = now - 90 * 86400000; break;
        case 'YTD': startMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
        case '1Y': startMs = now - 365 * 86400000; break;
        default: startMs = now - 365 * 86400000; break;
      }
      const dataStart = points[0].time;
      const dataEnd = points[points.length - 1].time;
      animateZoomTo({ startMs: Math.max(dataStart, startMs), endMs: dataEnd });
    }
  }, [selectedPeriod, points.length]);

  // ESC clears measurement and pinned events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPinnedEventIdx(null); setMeasureA(null); setMeasureB(null); setMeasureC(null); setCardDragPos(null); setIsDraggingCard(false); setZoomRange(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);


  // Click outside chart clears measurement and pinned events
  const chartContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMeasuring && pinnedEventIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (chartContainerRef.current && !chartContainerRef.current.contains(e.target as Node)) {
        setPinnedEventIdx(null);
        setMeasureA(null);
        setMeasureB(null);
        setMeasureC(null);
        setCardDragPos(null);
        setIsDraggingCard(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [isMeasuring, pinnedEventIdx]);

  // Track mouse for card dragging (hold-and-drag)
  useEffect(() => {
    const active = isDraggingCard || isDraggingSignal;
    if (!active || !chartContainerRef.current) return;
    const container = chartContainerRef.current;
    const moveHandler = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (isDraggingCard) setCardDragPos(pos);
      if (isDraggingSignal) setSignalDragPos(pos);
    };
    const upHandler = () => {
      if (isDraggingCard) setIsDraggingCard(false);
      if (isDraggingSignal) setIsDraggingSignal(false);
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
  }, [isDraggingCard, isDraggingSignal]);

  // Double-click resets zoom
  const handleDoubleClick = useCallback(() => { if (zoomRange) setZoomRange(null); }, [zoomRange]);

  // ── Drag-to-pan when zoomed ──────────────────────────────────────────
  const handlePanStart = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!zoomRange || e.button !== 0) return; // only left button, only when zoomed
    panStartRef.current = { x: e.clientX, rangeStart: zoomRange.startMs, rangeEnd: zoomRange.endMs };
  }, [zoomRange]);

  useEffect(() => {
    const moveHandler = (e: MouseEvent) => {
      const start = panStartRef.current;
      if (!start || !svgRef.current) return;
      const dx = e.clientX - start.x;
      if (Math.abs(dx) < 5 && !isPanning) return; // 5px threshold
      setIsPanning(true);

      const rect = svgRef.current.getBoundingClientRect();
      const pxToMs = (start.rangeEnd - start.rangeStart) / rect.width;
      const deltaMs = -dx * pxToMs;

      const pts = pointsRef.current;
      if (pts.length < 2) return;
      const fullStartMs = pts[0].time;
      const fullEndMs = pts[pts.length - 1].time;
      const rangeMs = start.rangeEnd - start.rangeStart;

      let newStart = start.rangeStart + deltaMs;
      let newEnd = start.rangeEnd + deltaMs;
      if (newStart < fullStartMs) { newStart = fullStartMs; newEnd = fullStartMs + rangeMs; }
      if (newEnd > fullEndMs) { newEnd = fullEndMs; newStart = fullEndMs - rangeMs; }

      setZoomRange({ startMs: newStart, endMs: newEnd });
    };
    const upHandler = () => {
      panStartRef.current = null;
      setTimeout(() => setIsPanning(false), 0);
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
  }, [isPanning]);

  // ── Zoom bar drag handler ────────────────────────────────────────
  useEffect(() => {
    if (!isBarDragging) return;
    const moveHandler = (e: MouseEvent) => {
      const drag = barDragRef.current;
      if (!drag) return;
      const pts = pointsRef.current;
      if (pts.length < 2) return;
      const fullStart = pts[0].time;
      const fullEnd = pts[pts.length - 1].time;
      const fullRange = fullEnd - fullStart;
      const dx = e.clientX - drag.startX;
      const deltaPct = (dx / drag.containerWidth) * 100;
      const newLeftPct = Math.max(0, Math.min(100 - drag.barWidth, drag.startLeft + deltaPct));
      const cur = zoomRangeRef.current;
      if (!cur) return;
      const zoomDuration = cur.endMs - cur.startMs;
      const newStartMs = fullStart + (newLeftPct / 100) * fullRange;
      setZoomRange({ startMs: Math.max(fullStart, newStartMs), endMs: Math.min(fullEnd, newStartMs + zoomDuration) });
    };
    const upHandler = () => { setIsBarDragging(false); barDragRef.current = null; };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    return () => { window.removeEventListener('mousemove', moveHandler); window.removeEventListener('mouseup', upHandler); };
  }, [isBarDragging]);

  // ── Animated zoom transition ──────────────────────────────────────
  const animateZoomTo = useCallback((target: { startMs: number; endMs: number } | null, duration = 250) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const pts = pointsRef.current;
    if (pts.length < 2) { setZoomRange(target); return; }
    const fullStart = pts[0].time;
    const fullEnd = pts[pts.length - 1].time;
    const current = zoomRangeRef.current;
    const fromStart = current?.startMs ?? fullStart;
    const fromEnd = current?.endMs ?? fullEnd;
    const toStart = target?.startMs ?? fullStart;
    const toEnd = target?.endMs ?? fullEnd;
    if (Math.abs(fromStart - toStart) < 1 && Math.abs(fromEnd - toEnd) < 1) { setZoomRange(target); return; }
    zoomAnimRef.current = { fromStart, fromEnd, toStart, toEnd, startTime: performance.now(), duration, toNull: target === null };
    const tick = (now: number) => {
      const anim = zoomAnimRef.current;
      if (!anim) return;
      const t = Math.min(1, (now - anim.startTime) / anim.duration);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      if (t >= 1) {
        setZoomRange(anim.toNull ? null : { startMs: anim.toStart, endMs: anim.toEnd });
        zoomAnimRef.current = null; animFrameRef.current = null;
      } else {
        setZoomRange({ startMs: anim.fromStart + (anim.toStart - anim.fromStart) * ease, endMs: anim.fromEnd + (anim.toEnd - anim.fromEnd) * ease });
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // Clean up animation on unmount
  useEffect(() => () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }, []);

  // Track zoom changes into history (debounced to avoid flooding during scroll)
  useEffect(() => {
    if (zoomHistoryDebounce.current) clearTimeout(zoomHistoryDebounce.current);
    zoomHistoryDebounce.current = setTimeout(() => {
      const h = zoomHistoryRef.current;
      const last = h.length > 0 ? h[h.length - 1] : undefined;
      if (last === zoomRange) return;
      if (last && zoomRange && last.startMs === zoomRange.startMs && last.endMs === zoomRange.endMs) return;
      h.push(zoomRange);
      if (h.length > 20) h.shift();
    }, 300);
  }, [zoomRange]);

  const goBackZoom = useCallback(() => {
    const h = zoomHistoryRef.current;
    if (h.length < 2) return;
    h.pop(); // remove current
    const prev = h[h.length - 1];
    animateZoomTo(prev ?? null, 200);
  }, [animateZoomTo]);

  // ── Keyboard zoom/pan controls ──────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const pts = pointsRef.current;
    if (pts.length < 20) return;
    const fullStartMs = pts[0].time;
    const fullEndMs = pts[pts.length - 1].time;
    const fullRange = fullEndMs - fullStartMs;
    if (fullRange <= 0) return;
    const cur = zoomRangeRef.current;
    const curStart = cur?.startMs ?? fullStartMs;
    const curEnd = cur?.endMs ?? fullEndMs;
    const curRange = curEnd - curStart;
    const minRange = (fullRange / (pts.length - 1)) * 20;

    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const newRange = Math.max(minRange, curRange * 0.8);
      if (newRange >= fullRange * 0.99) { animateZoomTo(null, 150); return; }
      const mid = (curStart + curEnd) / 2;
      let s = mid - newRange / 2, en = mid + newRange / 2;
      if (s < fullStartMs) { s = fullStartMs; en = s + newRange; }
      if (en > fullEndMs) { en = fullEndMs; s = en - newRange; }
      animateZoomTo({ startMs: s, endMs: en }, 150);
    } else if (e.key === '-') {
      e.preventDefault();
      const newRange = curRange * 1.25;
      if (newRange >= fullRange * 0.99) { animateZoomTo(null, 150); return; }
      const mid = (curStart + curEnd) / 2;
      let s = mid - newRange / 2, en = mid + newRange / 2;
      if (s < fullStartMs) { s = fullStartMs; en = s + newRange; }
      if (en > fullEndMs) { en = fullEndMs; s = en - newRange; }
      animateZoomTo({ startMs: s, endMs: en }, 150);
    } else if (e.key === 'ArrowLeft' && cur) {
      e.preventDefault();
      const shift = curRange * 0.1;
      let s = curStart - shift, en = curEnd - shift;
      if (s < fullStartMs) { s = fullStartMs; en = s + curRange; }
      setZoomRange({ startMs: s, endMs: en });
    } else if (e.key === 'ArrowRight' && cur) {
      e.preventDefault();
      const shift = curRange * 0.1;
      let s = curStart + shift, en = curEnd + shift;
      if (en > fullEndMs) { en = fullEndMs; s = en - curRange; }
      setZoomRange({ startMs: s, endMs: en });
    } else if (e.key === 'Home') {
      e.preventDefault();
      animateZoomTo(null, 200);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      goBackZoom();
    }
  }, [animateZoomTo, goBackZoom]);

  // ── Touch: pinch-to-zoom, pan, and Robinhood-style press-drag hover ──

  // Convert a touch clientX to hoverIndex + fire onHoverPrice
  const updateHoverFromClientX = useCallback((clientX: number) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * CHART_W;
    const idx = findNearestIndexRef.current(svgX);
    setHoverIndex(idx);
    onHoverPrice?.(points[idx].price, points[idx].label, referencePriceRef.current);
  }, [points, onHoverPrice]);


  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    wasTouchRef.current = true; // default: suppress click handler (overridden on tap in touchEnd)

    if (e.touches.length === 2 && svgRef.current) {
      const pts = pointsRef.current;
      if (pts.length >= 2) {
        e.preventDefault();
        isTwoFingerRef.current = true;
        // Clear single-finger hover
        isTouchHoveringRef.current = false;
        singleTouchRef.current = null;
        setHoverIndex(null);
        onHoverPrice?.(null, null);
        // Map both touches to data indices → measurement points
        const rect = svgRef.current.getBoundingClientRect();
        const svgX0 = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
        const svgX1 = ((e.touches[1].clientX - rect.left) / rect.width) * CHART_W;
        const idxA = findNearestIndexRef.current(svgX0);
        const idxB = findNearestIndexRef.current(svgX1);
        setMeasureA({ time: pts[idxA].time, price: pts[idxA].price });
        setMeasureB({ time: pts[idxB].time, price: pts[idxB].price });
        setMeasureC(null);
        setShowMeasureHint(false);
      }
      return;
    }

    if (e.touches.length === 1 && !isTwoFingerRef.current) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const pts = pointsRef.current;
      const zoom = zoomRangeRef.current;
      if (zoom && pts.length >= 20) {
        // Pan when zoomed
        isTouchHoveringRef.current = false;
        singleTouchRef.current = { x: e.touches[0].clientX, startMs: zoom.startMs, endMs: zoom.endMs };
        touchStartRef.current = null;
      } else if (pts.length >= 2) {
        // Press-and-drag hover crosshair (Robinhood style)
        isTouchHoveringRef.current = true;
        touchStartRef.current = null;
        singleTouchRef.current = null;
        updateHoverFromClientX(e.touches[0].clientX);
      }
    }
  }, [updateHoverFromClientX, onHoverPrice]);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    // Two-finger measurement: update both points in real-time
    if (e.touches.length === 2 && isTwoFingerRef.current && svgRef.current) {
      e.preventDefault();
      const pts = pointsRef.current;
      if (pts.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX0 = ((e.touches[0].clientX - rect.left) / rect.width) * CHART_W;
      const svgX1 = ((e.touches[1].clientX - rect.left) / rect.width) * CHART_W;
      const idxA = findNearestIndexRef.current(svgX0);
      const idxB = findNearestIndexRef.current(svgX1);
      setMeasureA({ time: pts[idxA].time, price: pts[idxA].price });
      setMeasureB({ time: pts[idxB].time, price: pts[idxB].price });
      return;
    }

    if (e.touches.length >= 2) return;
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const fullStart = pts[0].time;
    const fullEnd = pts[pts.length - 1].time;

    if (e.touches.length === 1 && singleTouchRef.current) {
      // Pan when zoomed
      e.preventDefault();
      const dx = e.touches[0].clientX - singleTouchRef.current.x;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const origRange = singleTouchRef.current.endMs - singleTouchRef.current.startMs;
      const deltaMs = -dx * (origRange / rect.width);
      let s = singleTouchRef.current.startMs + deltaMs, en = singleTouchRef.current.endMs + deltaMs;
      if (s < fullStart) { s = fullStart; en = s + origRange; }
      if (en > fullEnd) { en = fullEnd; s = en - origRange; }
      setZoomRange({ startMs: s, endMs: en });
    } else if (e.touches.length === 1 && isTouchHoveringRef.current) {
      // Drag crosshair — prevent scroll so finger stays on chart
      e.preventDefault();
      updateHoverFromClientX(e.touches[0].clientX);
    }
  }, [updateHoverFromClientX]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    // Two-finger measurement: clear when fingers lift (Robinhood-style)
    if (isTwoFingerRef.current) {
      e.preventDefault();
      if (e.touches.length === 0) {
        // Both fingers lifted — clear measurement and exit two-finger mode
        isTwoFingerRef.current = false;
        setMeasureA(null);
        setMeasureB(null);
        setMeasureC(null);
      }
      // One finger still down — keep measurement visible until both lift
      return;
    }

    if (e.touches.length === 0) {
      // Detect tap vs drag: if finger barely moved, treat as a tap
      // so the synthesized click event fires the measurement system
      if (touchStartPosRef.current && e.changedTouches.length > 0) {
        const endTouch = e.changedTouches[0];
        const dx = Math.abs(endTouch.clientX - touchStartPosRef.current.x);
        const dy = Math.abs(endTouch.clientY - touchStartPosRef.current.y);
        if (dx < 10 && dy < 10) {
          wasTouchRef.current = false; // allow click handler to fire → places measurement
        }
      }
      touchStartPosRef.current = null;
      touchStartRef.current = null;
      singleTouchRef.current = null;
      if (isTouchHoveringRef.current) {
        isTouchHoveringRef.current = false;
        setHoverIndex(null);
        onHoverPrice?.(null, null);
      }
    }
  }, [onHoverPrice]);


  // ── Scroll-to-zoom handler (native for passive:false) ────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      // Don't zoom if user is focused on an input or modal
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

      const pts = pointsRef.current;
      if (pts.length < 20) return; // too few points to zoom

      const rect = svg.getBoundingClientRect();
      const mouseXRatio = Math.max(0, Math.min(1,
        ((e.clientX - rect.left) / rect.width * CHART_W - PAD_LEFT) / (CHART_W - PAD_LEFT - PAD_RIGHT)
      ));

      const fullStartMs = pts[0].time;
      const fullEndMs = pts[pts.length - 1].time;
      const fullRange = fullEndMs - fullStartMs;
      if (fullRange <= 0) return;

      const currentZoom = zoomRangeRef.current;
      const currentStart = currentZoom?.startMs ?? fullStartMs;
      const currentEnd = currentZoom?.endMs ?? fullEndMs;
      const currentRange = currentEnd - currentStart;

      // Zoom factor: scroll up = zoom in (smaller range), scroll down = zoom out
      const delta = -e.deltaY;
      const zoomSpeed = 0.08;
      const factor = 1 + Math.sign(delta) * zoomSpeed * Math.min(Math.abs(delta) / 100, 3);
      const newRange = currentRange / factor;

      // Limits with elastic resistance at bounds
      const MIN_VISIBLE_POINTS = 20;
      const avgSpacing = fullRange / (pts.length - 1);
      const minRange = avgSpacing * MIN_VISIBLE_POINTS;

      let clampedRange: number;
      if (newRange < minRange) {
        // Elastic resistance at min zoom — progressively harder to zoom in
        const overZoom = minRange / newRange; // >1 means past limit
        const elasticFactor = 1 / (1 + (overZoom - 1) * 3); // diminishing returns
        clampedRange = minRange * elasticFactor + minRange * (1 - elasticFactor);
        clampedRange = Math.max(avgSpacing * 8, clampedRange); // absolute floor
      } else if (newRange > fullRange) {
        // Elastic resistance at max zoom — progressively harder to zoom out
        clampedRange = fullRange;
      } else {
        clampedRange = newRange;
      }

      if (clampedRange >= fullRange * 0.99) {
        setZoomRange(null);
        return;
      }

      // Anchor zoom at cursor position
      const cursorTimeMs = currentStart + mouseXRatio * currentRange;
      let newStart = cursorTimeMs - mouseXRatio * clampedRange;
      let newEnd = cursorTimeMs + (1 - mouseXRatio) * clampedRange;

      // Clamp to data boundaries
      if (newStart < fullStartMs) { newStart = fullStartMs; newEnd = fullStartMs + clampedRange; }
      if (newEnd > fullEndMs) { newEnd = fullEndMs; newStart = fullEndMs - clampedRange; }

      // Snap to clean date boundaries if close
      newStart = snapToCleanBoundary(newStart, clampedRange);
      newEnd = snapToCleanBoundary(newEnd, clampedRange);
      newStart = Math.max(fullStartMs, newStart);
      newEnd = Math.min(fullEndMs, newEnd);

      setZoomRange({ startMs: newStart, endMs: newEnd });
    };

    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []); // Uses refs for all changing values — stable handler

  // Reference price: first visible point when zoomed, first point when full view, previousClose for 1D
  const referencePrice = selectedPeriod === '1D'
    ? previousClose
    : (zoomRange && visiblePoints.length > 0
      ? visiblePoints[0].price
      : (points.length > 0 ? points[0].price : currentPrice));
  const referencePriceRef = useRef(referencePrice);
  useEffect(() => { referencePriceRef.current = referencePrice; }, [referencePrice]);
  // Line color based on OVERALL visible trend (last visible vs first visible), NOT hover position
  // This keeps the chart color stable — no flipping green/red as the user hovers or places measurement points
  const trendEndPrice = zoomRange && visiblePoints.length > 1
    ? visiblePoints[visiblePoints.length - 1].price
    : (points.length > 0 ? points[points.length - 1].price : currentPrice);
  const isGain = trendEndPrice >= referencePrice;
  // Chart line colors — muted (same as portfolio chart so fill intensity matches)
  const lineColor = isGain ? '#0A9E10' : '#B87872';

  // Pre-compute visible MA values — computed on the ACTUAL displayed candles per timeframe
  const visibleMaData = useMemo(() => {
    const result: { period: MAPeriod; values: (number | null)[] }[] = [];

    if (selectedPeriod === '1D') {
      // Short MAs (5, 10): compute on intraday candles for a flowing line
      // Long MAs (50, 100, 200): use daily history → flat horizontal line (like Robinhood)
      const hasIntraday = intradayCandles && intradayCandles.length > 0;
      const hasDaily = candles && candles.closes.length > 0;

      for (const ma of MA_PERIODS) {
        if (ma <= 10 && hasIntraday) {
          const prices = intradayCandles!.map(c => c.close);
          const sma = calcSMA(prices, ma);
          result.push({ period: ma, values: [null, ...sma] });
        } else if (hasDaily) {
          // Flat line from latest daily SMA value
          const sma = calcSMA(candles!.closes, ma);
          let latest: number | null = null;
          for (let i = sma.length - 1; i >= 0; i--) {
            if (sma[i] !== null) { latest = sma[i]; break; }
          }
          result.push({ period: ma, values: points.map(() => latest) });
        } else {
          result.push({ period: ma, values: points.map(() => null) });
        }
      }
      return result;
    }

    // For all non-1D timeframes: compute MA on full daily candle history,
    // then map each visible point to its daily MA value by date.
    // This ensures MA50/100/200 start from the left edge (years of history behind them).
    if (!candles || candles.closes.length === 0) return [];
    const dateToFullIdx = new Map<string, number>();
    for (let i = 0; i < candles.dates.length; i++) {
      dateToFullIdx.set(candles.dates[i], i);
    }
    const pointFullIndices = points.map(p => {
      const d = new Date(p.time);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateToFullIdx.get(dateStr);
    });
    for (const ma of MA_PERIODS) {
      const sma = calcSMA(candles.closes, ma);
      const values: (number | null)[] = pointFullIndices.map(fullIdx =>
        fullIdx !== undefined ? sma[fullIdx] : null
      );
      result.push({ period: ma, values });
    }
    return result;
  }, [candles, intradayCandles, hourlyCandles, points, selectedPeriod]);

  // Compute stable Y-axis range (includes enabled MA values)
  const { paddedMin, paddedMax } = useMemo(() => {
    // When zoomed, rescale Y to visible points only for better detail
    const targetPts = zoomRange ? visiblePoints : points;
    if (targetPts.length === 0) return { paddedMin: referencePrice - 1, paddedMax: referencePrice + 1 };
    const prices = targetPts.map(p => p.price);
    let minP = zoomRange ? Math.min(...prices) : Math.min(...prices, referencePrice);
    let maxP = zoomRange ? Math.max(...prices) : Math.max(...prices, referencePrice);

    // Never include MAs in Y range — scale chart to price action only.
    // MAs that are far from price will clip at the plot boundary (Robinhood-style).

    if (maxP === minP) { maxP += 1; minP -= 1; }

    if (selectedPeriod === '1D' && !zoomRange) {
      // Scope y-axis to regular session (9:30 AM - 4 PM ET) + after-hours only.
      // Pre-market outliers from thin liquidity stretch the y-axis and compress
      // the regular session visually. Outlier data clips at plot boundary (Robinhood-style).
      if (targetPts.length > 1) {
        const refDate = new Date(targetPts[0].time);
        const etDateStr2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(refDate);
        const noonUtc2 = new Date(`${etDateStr2}T12:00:00Z`);
        const noonEtH2 = parseInt(new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
        }).format(noonUtc2).split(':')[0]);
        const etOff2 = (noonEtH2 - 12) * 3600000;
        const regOpenMs = new Date(`${etDateStr2}T09:30:00Z`).getTime() - etOff2;
        const regPrices = targetPts.filter(p => p.time >= regOpenMs).map(p => p.price);
        if (regPrices.length > 0) {
          minP = Math.min(...regPrices, referencePrice);
          maxP = Math.max(...regPrices, referencePrice);
        }
      }
      // Minimum 0.5% range to prevent flat-line appearance, but tight enough for dramatic moves
      const minRange = referencePrice * 0.005;
      if (maxP - minP < minRange) {
        const mid = (maxP + minP) / 2;
        minP = mid - minRange / 2;
        maxP = mid + minRange / 2;
      }
      yRangeRef.current = { min: minP, max: maxP, period: '1D' };
    } else {
      yRangeRef.current = { min: minP, max: maxP, period: selectedPeriod };
    }
    const range = maxP - minP;
    return { paddedMin: minP - range * 0.08, paddedMax: maxP + range * 0.08 };
  }, [points, referencePrice, selectedPeriod, visibleMaData, enabledMAs, zoomRange, visiblePoints]);

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  // For 1D, use time-based x positioning from pre-market open (4 AM ET) to AH close (8 PM ET)
  const is1D = selectedPeriod === '1D' && points.length > 1;
  let dayStartMs = 0;
  let dayEndMs = 0;
  if (is1D) {
    // Get the date in ET timezone (YYYY-MM-DD) — use last point so we get
    // the current trading day even if early data crosses the UTC midnight boundary
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
      .format(new Date(points[points.length - 1].time));
    // Create dates at the ET times we want, using America/New_York
    // Pre-market opens at 4:00 AM ET = 09:00 UTC (EST) or 08:00 UTC (EDT)
    // AH closes at 8:00 PM ET = 01:00+1 UTC (EST) or 00:00+1 UTC (EDT)
    // We can compute this by creating a UTC noon date and measuring the ET offset
    const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
    const noonEtStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(noonUtc);
    const noonEtH = parseInt(noonEtStr.split(':')[0]);
    // ET offset from UTC in ms: if noonEtH=7, offset is -5h (EST); if 8, offset is -4h (EDT)
    const etOffsetMs = (noonEtH - 12) * 3600000;
    // 4 AM ET in UTC: etDateStr 04:00 ET = etDateStr 04:00 - etOffsetMs (etOffset is negative, so subtracting adds)
    dayStartMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs;
    dayEndMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;
  }
  const dayRangeMs = dayEndMs - dayStartMs;
  const toX = (i: number) => {
    if (i < 0 || i >= points.length) return PAD_LEFT;
    if (zoomRange) {
      if (is1D) {
        // 1D intraday: time-based positioning within day window
        const t = points[i].time;
        const ratio = (t - zoomRange.startMs) / (zoomRange.endMs - zoomRange.startMs);
        return PAD_LEFT + ratio * plotW;
      }
      // Multi-day: index-based within visible range — eliminates weekend/holiday gaps
      const count = visEndIdx - visStartIdx;
      if (count <= 0) return PAD_LEFT + plotW / 2;
      return PAD_LEFT + ((i - visStartIdx) / count) * plotW;
    }
    if (is1D && dayRangeMs > 0) {
      return PAD_LEFT + ((points[i].time - dayStartMs) / dayRangeMs) * plotW;
    }
    return PAD_LEFT + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  };
  const toY = (price: number) => PAD_TOP + plotH - ((price - paddedMin) / (paddedMax - paddedMin)) * plotH;

  // Volume bar scaling
  const VOL_MAX_H = plotH * 0.22; // max bar height = 22% of plot
  const volMax = useMemo(() => {
    if (!volumeEnabled) return 0;
    const start = zoomRange ? visStartIdx : 0;
    const end = zoomRange ? visEndIdx : points.length - 1;
    let mx = 0;
    for (let i = start; i <= end; i++) {
      if (points[i]?.volume && points[i].volume! > mx) mx = points[i].volume!;
    }
    return mx;
  }, [volumeEnabled, points, zoomRange, visStartIdx, visEndIdx]);

  // Build SVG path — scope to visible range when zoomed, with decimation for performance
  const pathStart = zoomRange ? visStartIdx : 0;
  const pathEnd = zoomRange ? visEndIdx : points.length - 1;
  const decimatedIndices = useMemo(() => {
    const count = pathEnd - pathStart + 1;
    const MAX_RENDER = 800;
    if (count <= MAX_RENDER) return null;
    const step = count / MAX_RENDER;
    const indices: number[] = [pathStart];
    for (let i = 1; i < MAX_RENDER - 1; i++) {
      const idx = pathStart + Math.round(i * step);
      if (idx !== indices[indices.length - 1]) indices.push(idx);
    }
    indices.push(pathEnd);
    return indices;
  }, [pathStart, pathEnd]);

  // When high-res zoom data is available, render it instead of daily candles for the zoomed path
  const zoomDataToX = (idx: number, t: number) => {
    if (!zoomRange || !zoomDataPoints || zoomDataPoints.length < 2) return PAD_LEFT;
    if (is1D) {
      // 1D: time-based
      return PAD_LEFT + ((t - zoomRange.startMs) / (zoomRange.endMs - zoomRange.startMs)) * plotW;
    }
    // Multi-day: index-based to skip gaps
    return PAD_LEFT + (idx / (zoomDataPoints.length - 1)) * plotW;
  };

  const pathD = zoomDataPoints && zoomDataPoints.length > 1
    ? zoomDataPoints.map((p, j) =>
        `${j === 0 ? 'M' : 'L'}${zoomDataToX(j, p.time).toFixed(1)},${toY(p.price).toFixed(1)}`
      ).join(' ')
    : decimatedIndices
      ? decimatedIndices.map((i, j) =>
          `${j === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(points[i].price).toFixed(1)}`
        ).join(' ')
      : points.slice(pathStart, pathEnd + 1).map((p, j) => {
          const i = pathStart + j;
          return `${j === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.price).toFixed(1)}`;
        }).join(' ');

  // Session split indices for 1D: market open (9:30 AM ET) and close (4:00 PM ET)
  const { stockOpenIdx, stockCloseIdx } = useMemo(() => {
    if (!is1D || points.length < 2) return { stockOpenIdx: null, stockCloseIdx: null };
    const refDate = new Date(points[0].time);
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(refDate);
    const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
    const noonEtH = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    }).format(noonUtc).split(':')[0]);
    const etOffsetMs = (noonEtH - 12) * 3600000;
    const openMs = new Date(`${etDateStr}T09:30:00Z`).getTime() - etOffsetMs;
    const closeMs = new Date(`${etDateStr}T16:00:00Z`).getTime() - etOffsetMs;
    const oIdx = points.findIndex(p => p.time >= openMs);
    const cIdx = points.findIndex(p => p.time >= closeMs);
    return {
      stockOpenIdx: (oIdx > 0 && oIdx < points.length) ? oIdx : null,
      stockCloseIdx: (cIdx > 0 && cIdx < points.length) ? cIdx : null,
    };
  }, [is1D, points]);

  // Gradient fill path (area under line to bottom) — use visible range when zoomed
  const areaD = pathD
    + ` L${toX(pathEnd).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)}`
    + ` L${toX(pathStart).toFixed(1)},${(CHART_H - PAD_BOTTOM).toFixed(1)} Z`;

  // Monotone cubic interpolation (Fritsch–Carlson) — handles non-uniform x-spacing,
  // never overshoots, never pulls back at endpoints, always passes through every point.
  const monotonePath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;

    const n = pts.length;
    // Step 1: compute secants (deltas)
    const dx: number[] = [];
    const dy: number[] = [];
    const m: number[] = []; // slopes of secant lines
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1].x - pts[i].x);
      dy.push(pts[i + 1].y - pts[i].y);
      m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
    }

    // Step 2: compute tangent slopes using Fritsch–Carlson
    const tangent: number[] = new Array(n);
    tangent[0] = m[0];
    tangent[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        tangent[i] = 0; // sign change → flat tangent (monotone constraint)
      } else {
        tangent[i] = (m[i - 1] + m[i]) / 2;
      }
    }

    // Step 3: enforce monotonicity (Fritsch–Carlson §4)
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        tangent[i] = 0;
        tangent[i + 1] = 0;
      } else {
        const alpha = tangent[i] / m[i];
        const beta = tangent[i + 1] / m[i];
        // Restrict to circle of radius 3 to prevent overshoot
        const s = alpha * alpha + beta * beta;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          tangent[i] = tau * alpha * m[i];
          tangent[i + 1] = tau * beta * m[i];
        }
      }
    }

    // Step 4: build cubic bezier path
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const seg = dx[i] / 3;
      const cp1x = pts[i].x + seg;
      const cp1y = pts[i].y + tangent[i] * seg;
      const cp2x = pts[i + 1].x - seg;
      const cp2y = pts[i + 1].y - tangent[i + 1] * seg;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return d;
  };

  // For hourly views, build interpolated MA values so the line transitions smoothly between days
  const useHourly = (selectedPeriod === '1W' || selectedPeriod === '1M') && hourlyCandles && hourlyCandles.length > 0;

  const interpolatedMaData = useMemo(() => {
    if (!useHourly || visibleMaData.length === 0) return null;
    // Build day boundaries: for each day, find first/last point index and the daily MA value
    const dayInfos: { key: string; first: number; last: number; maVal: (number | null) }[][] = [];
    for (const ma of visibleMaData) {
      const days: { key: string; first: number; last: number; maVal: number | null }[] = [];
      const dayMap = new Map<string, { first: number; last: number; val: number | null }>();
      for (let i = 0; i < ma.values.length; i++) {
        const d = new Date(points[i].time);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const existing = dayMap.get(key);
        if (!existing) {
          dayMap.set(key, { first: i, last: i, val: ma.values[i] });
        } else {
          existing.last = i;
        }
      }
      for (const [key, info] of dayMap) {
        days.push({ key, first: info.first, last: info.last, maVal: info.val });
      }
      dayInfos.push(days);
    }

    // For each MA, interpolate values across hourly points
    return visibleMaData.map((ma, maIdx) => {
      const days = dayInfos[maIdx];
      const interp = new Array<number | null>(ma.values.length).fill(null);
      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        if (day.maVal === null) continue;
        const prevVal = di > 0 && days[di - 1].maVal !== null ? days[di - 1].maVal! : day.maVal;
        const nextVal = di < days.length - 1 && days[di + 1].maVal !== null ? days[di + 1].maVal! : day.maVal;
        // Interpolate from prevVal→thisVal over first half, thisVal→nextVal over second half
        for (let i = day.first; i <= day.last; i++) {
          const t = day.last > day.first ? (i - day.first) / (day.last - day.first) : 0.5;
          // Smooth blend: first half transitions from previous day's value, second half toward next
          if (t <= 0.5) {
            const blend = t * 2; // 0→1 over first half
            interp[i] = prevVal + (day.maVal - prevVal) * (0.5 + blend * 0.5);
          } else {
            const blend = (t - 0.5) * 2; // 0→1 over second half
            interp[i] = day.maVal + (nextVal - day.maVal) * blend * 0.5;
          }
        }
      }
      return { period: ma.period, values: interp };
    });
  }, [useHourly, visibleMaData, points]);

  // MA SVG paths — monotone cubic interpolation for all timeframes
  const maPaths = useMemo(() => {
    const result: { period: MAPeriod; d: string; lastPt?: { x: number; y: number } }[] = [];
    const maSource = useHourly && interpolatedMaData ? interpolatedMaData : visibleMaData;
    // When zoomed, only iterate visible range (±1 buffer for smooth edges)
    const rangeStart = zoomRange ? Math.max(0, visStartIdx - 1) : 0;
    const rangeEnd = zoomRange ? Math.min(points.length - 1, visEndIdx + 1) : points.length - 1;
    for (const ma of maSource) {
      if (!enabledMAs.has(ma.period)) continue;
      const pts: { x: number; y: number }[] = [];
      for (let i = rangeStart; i <= rangeEnd; i++) {
        const val = ma.values[i];
        if (val == null) continue;
        pts.push({ x: toX(i), y: toY(val) });
      }
      const d = monotonePath(pts);
      const lastPt = pts.length > 0 ? pts[pts.length - 1] : undefined;
      if (d) result.push({ period: ma.period, d, lastPt });
    }
    return result;
  }, [visibleMaData, interpolatedMaData, enabledMAs, points, selectedPeriod, useHourly, zoomRange, visStartIdx, visEndIdx]);

  // ── Breach signal events ──────────────────────────────────────────
  const breachClusters = useMemo<BreachCluster[]>(() => {
    if (!signalsEnabled || points.length === 0) return [];

    const maSource = useHourly && interpolatedMaData ? interpolatedMaData : visibleMaData;
    const prices = points.map(p => p.price);

    const pad = (arr: (number | null)[]) => {
      if (arr.length >= prices.length) return arr;
      return [...arr, ...new Array(prices.length - arr.length).fill(null)];
    };

    // Detect for all signal-capable MAs regardless of which MA lines are visible
    const signalMaData = maSource
      .filter(m => SIGNAL_MA_PERIODS.includes(m.period))
      .map(m => ({ period: m.period, values: pad(m.values) }));

    if (signalMaData.length === 0) return [];
    const events = detectAllBreaches(prices, signalMaData);
    // Cluster events within 5 candles of each other
    return clusterBreaches(events, 5);
  }, [signalsEnabled, points, visibleMaData, interpolatedMaData, useHourly]);

  // Golden / Death Cross detection — independent of which MA lines are visible
  const crossEvents = useMemo<CrossEvent[]>(() => {
    if (!signalsEnabled || points.length === 0) return [];
    const ma100 = visibleMaData.find(m => m.period === 100);
    const ma200 = visibleMaData.find(m => m.period === 200);
    if (!ma100 || !ma200) return [];
    const prices = points.map(p => p.price);
    return detectCrosses(prices, ma100.values, ma200.values);
  }, [signalsEnabled, points, visibleMaData]);

  // ── Chart Event markers (earnings, dividends, trades) ──────────────
  interface ChartEvent {
    type: 'earnings' | 'dividend' | 'dividend_credit' | 'buy' | 'sell' | 'update' | 'analyst_target' | 'analyst_rating' | 'ai_earnings' | 'ai_analyst' | 'ai_dividend';
    index: number; // index into points[]
    color: string; // marker color
    glyph: string; // single char label
    shape: 'circle' | 'chevron-up' | 'chevron-down' | 'diamond'; // marker shape
    data: Record<string, unknown>;
  }

  const chartEvents = useMemo<ChartEvent[]>(() => {
    if (!eventsEnabled || points.length === 0) return [];

    // Build date→index map from chart points (YYYY-MM-DD → closest index)
    const dateToIdx = new Map<string, number>();
    for (let i = 0; i < points.length; i++) {
      const d = new Date(points[i].time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Keep last index for each day (end-of-day is more representative)
      dateToIdx.set(key, i);
    }

    // Helper: find exact date or nearest trading day (±3 days) for weekends/holidays
    const findIdx = (dateKey: string): number | undefined => {
      const exact = dateToIdx.get(dateKey);
      if (exact !== undefined) return exact;
      // Try ±1, ±2, ±3 days
      const base = new Date(dateKey + 'T12:00:00');
      for (let offset = 1; offset <= 3; offset++) {
        for (const dir of [1, -1]) {
          const d = new Date(base.getTime() + dir * offset * 86400000);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const idx = dateToIdx.get(k);
          if (idx !== undefined) return idx;
        }
      }
      return undefined;
    };

    const firstDate = points[0].time;
    const lastDate = points[points.length - 1].time;
    const events: ChartEvent[] = [];

    // Earnings events
    if (earnings) {
      for (const e of earnings) {
        if (!e.reportedDate) continue;
        const idx = findIdx(e.reportedDate);
        if (idx === undefined) continue;
        events.push({
          type: 'earnings',
          index: idx,
          color: e.beat === true ? '#00C805' : e.beat === false ? '#E8544E' : '#6B7280',
          glyph: 'E',
          shape: 'circle',
          data: {
            reportedDate: e.reportedDate,
            beat: e.beat,
            reportedEPS: e.reportedEPS,
            estimatedEPS: e.estimatedEPS,
            surprise: e.surprise,
            surprisePercentage: e.surprisePercentage,
            fiscalDateEnding: e.fiscalDateEnding,
          },
        });
      }
    }

    // Dividend ex-date events
    if (dividendEvents) {
      for (const d of dividendEvents) {
        if (!d.exDate) continue;
        const exD = new Date(d.exDate);
        const exKey = `${exD.getFullYear()}-${String(exD.getMonth() + 1).padStart(2, '0')}-${String(exD.getDate()).padStart(2, '0')}`;
        const idx = findIdx(exKey);
        if (idx === undefined) continue;
        events.push({
          type: 'dividend',
          index: idx,
          color: '#6B7280',
          glyph: '$',
          shape: 'circle',
          data: {
            exDate: d.exDate,
            payDate: d.payDate,
            amountPerShare: d.amountPerShare,
          },
        });
      }
    }

    // Dividend credits (received)
    if (dividendCredits) {
      for (const c of dividendCredits) {
        if (!c.creditedAt) continue;
        const cDate = new Date(c.creditedAt);
        const key = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}-${String(cDate.getDate()).padStart(2, '0')}`;
        const idx = findIdx(key);
        if (idx === undefined) continue;
        events.push({
          type: 'dividend_credit',
          index: idx,
          color: '#3B82F6', // blue for personal
          glyph: 'D',
          shape: 'circle',
          data: {
            creditedAt: c.creditedAt,
            amountGross: c.amountGross,
            sharesEligible: c.sharesEligible,
            ticker: c.ticker,
          },
        });
      }
    }

    // Trade events (buy/sell/update)
    if (tradeEvents) {
      for (const t of tradeEvents) {
        const tDate = new Date(t.createdAt);
        if (tDate.getTime() < firstDate || tDate.getTime() > lastDate) continue;
        const key = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}-${String(tDate.getDate()).padStart(2, '0')}`;
        const idx = findIdx(key);
        if (idx === undefined) continue;
        const isBuy = t.type === 'holding_added';
        const isSell = t.type === 'holding_removed';
        events.push({
          type: isBuy ? 'buy' : isSell ? 'sell' : 'update',
          index: idx,
          color: '#3B82F6', // blue for personal
          glyph: isBuy ? '▲' : isSell ? '▼' : '◆',
          shape: isBuy ? 'chevron-up' : isSell ? 'chevron-down' : 'diamond',
          data: {
            type: t.type,
            shares: t.payload.shares,
            previousShares: t.payload.previousShares,
            averageCost: t.payload.averageCost,
            createdAt: t.createdAt,
          },
        });
      }
    }

    // Analyst events (target changes, rating changes)
    if (analystEvents) {
      for (const a of analystEvents) {
        const aDate = new Date(a.createdAt);
        if (aDate.getTime() < firstDate || aDate.getTime() > lastDate) continue;
        const key = `${aDate.getFullYear()}-${String(aDate.getMonth() + 1).padStart(2, '0')}-${String(aDate.getDate()).padStart(2, '0')}`;
        const idx = findIdx(key);
        if (idx === undefined) continue;
        const isTarget = a.eventType === 'target_change';
        const isPositive = a.changePct != null && a.changePct > 0;
        events.push({
          type: isTarget ? 'analyst_target' : 'analyst_rating',
          index: idx,
          color: isTarget ? (isPositive ? '#00C805' : '#E8544E') : '#A855F7',
          glyph: isTarget ? 'T' : 'R',
          shape: 'circle',
          data: {
            eventType: a.eventType,
            message: a.message,
            oldValue: a.oldValue,
            newValue: a.newValue,
            changePct: a.changePct,
            createdAt: a.createdAt,
          },
        });
      }
    }

    // AI-powered events (Perplexity) — earnings, analyst, dividends only (no news)
    if (aiEvents) {
      for (const ai of aiEvents) {
        if (!ai.date) continue;
        if (ai.type === 'NEWS') continue; // skip news — too noisy for chart
        const idx = findIdx(ai.date);
        if (idx === undefined) continue;
        const typeMap: Record<string, ChartEvent['type']> = {
          EARNINGS: 'ai_earnings',
          ANALYST: 'ai_analyst',
          DIVIDEND: 'ai_dividend',
        };
        const evtType = typeMap[ai.type];
        if (!evtType) continue;
        const sentimentColor = ai.type === 'DIVIDEND' ? '#3B82F6'
          : ai.sentiment > 0.3 ? '#00C805' : ai.sentiment < -0.3 ? '#E8544E' : '#F59E0B';
        const glyphMap: Record<string, string> = { EARNINGS: 'E', ANALYST: 'A', DIVIDEND: '$' };
        events.push({
          type: evtType,
          index: idx,
          color: sentimentColor,
          glyph: glyphMap[ai.type] || 'AI',
          shape: 'diamond',
          data: {
            label: ai.label,
            insight: ai.insight,
            sentiment: ai.sentiment,
            source_url: ai.source_url,
            aiType: ai.type,
          },
        });
      }
    }

    // Sort by index
    events.sort((a, b) => a.index - b.index);
    return events;
  }, [eventsEnabled, points, earnings, dividendEvents, dividendCredits, tradeEvents, analystEvents, aiEvents]);

  // Cluster events by pixel proximity (not just same index)
  interface EventCluster {
    index: number;
    events: ChartEvent[];
  }
  const eventClusters = useMemo<EventCluster[]>(() => {
    if (chartEvents.length === 0 || points.length < 2) return [];
    const MIN_PX_GAP = 16; // minimum pixels between separate markers
    const pxPerIdx = (CHART_W - PAD_LEFT - PAD_RIGHT) / (points.length - 1);
    const minIdxGap = Math.max(1, Math.ceil(MIN_PX_GAP / pxPerIdx));

    const clusters: EventCluster[] = [];
    for (const evt of chartEvents) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(evt.index - last.index) < minIdxGap) {
        last.events.push(evt);
      } else {
        clusters.push({ index: evt.index, events: [evt] });
      }
    }
    return clusters;
  }, [chartEvents, points.length]);

  const [, setExpandedClusterIdx] = useState<number | null>(null);

  // Animated entry for events toggle
  const [eventsVisible, setEventsVisible] = useState(eventsEnabled);
  useEffect(() => {
    if (eventsEnabled) {
      const t = setTimeout(() => setEventsVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setEventsVisible(false);
    }
  }, [eventsEnabled]);

  // Reference line (previous close for 1D, first price for others)
  const refY = toY(referencePrice);

  // Time labels
  const timeLabels: { label: string; x: number }[] = [];
  if (points.length > 1) {
    if (zoomRange) {
      // Zoomed: generate labels from visible points only
      const maxTimeLabels = 5;
      const visCount = visEndIdx - visStartIdx + 1;
      const step = Math.max(1, Math.floor(visCount / maxTimeLabels));
      for (let j = 0; j < visCount; j += step) {
        const i = visStartIdx + j;
        if (i < points.length) {
          timeLabels.push({ label: points[i].label, x: toX(i) });
        }
      }
      // Include last visible point
      if (visEndIdx > visStartIdx) {
        const lastX = toX(visEndIdx);
        const prevX = timeLabels.length > 0 ? timeLabels[timeLabels.length - 1].x : 0;
        if (lastX - prevX > 70) {
          timeLabels.push({ label: points[visEndIdx].label, x: lastX });
        } else if (timeLabels.length > 0) {
          timeLabels[timeLabels.length - 1] = { label: points[visEndIdx].label, x: lastX };
        }
      }
    } else if (selectedPeriod === '1D') {
      // Session boundaries in ET, positioned using dayStartMs/dayEndMs
      const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
        .format(new Date(points[0].time));
      const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
      const noonEtStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      }).format(noonUtc);
      const noonEtH = parseInt(noonEtStr.split(':')[0]);
      const etOffsetMs = (noonEtH - 12) * 3600000;

      const etSessions = [
        { etH: 4, etM: 0 },   // Pre-market opens
        { etH: 9, etM: 30 },  // Market opens
        { etH: 16, etM: 0 },  // Market closes
        { etH: 20, etM: 0 },  // After-hours closes
      ];
      for (const s of etSessions) {
        const ms = new Date(`${etDateStr}T${String(s.etH).padStart(2, '0')}:${String(s.etM).padStart(2, '0')}:00Z`).getTime() - etOffsetMs;
        const ratio = (ms - dayStartMs) / dayRangeMs;
        const x = PAD_LEFT + ratio * plotW;
        const label = new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        timeLabels.push({ label, x });
      }
    } else {
      const maxTimeLabels = 5;
      const step = Math.max(1, Math.floor(points.length / maxTimeLabels));
      for (let i = 0; i < points.length; i += step) {
        timeLabels.push({ label: points[i].label, x: toX(i) });
      }
      // Always include the last data point so today's date shows at the right edge
      const lastIdx = points.length - 1;
      if (lastIdx > 0 && (lastIdx % step !== 0)) {
        const lastX = toX(lastIdx);
        const prevX = timeLabels.length > 0 ? timeLabels[timeLabels.length - 1].x : 0;
        // Only add last label if it won't overlap with previous (need ~70px minimum gap)
        if (lastX - prevX > 70) {
          timeLabels.push({ label: points[lastIdx].label, x: lastX });
        } else {
          // Replace the previous label with the last one (prefer showing current date)
          timeLabels[timeLabels.length - 1] = { label: points[lastIdx].label, x: lastX };
        }
      }
    }
  }

  // Current price dot
  const lastX = points.length > 0 ? toX(points.length - 1) : CHART_W / 2;
  const lastY = points.length > 0 ? toY(points[points.length - 1].price) : toY(currentPrice);

  const hasData = points.length >= 2;

  // Hover handler — find nearest data point to mouse X position
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) return; // suppress hover during pan drag
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    if (zoomRange) {
      if (is1D) {
        // 1D zoomed: time-based lookup
        const ratio = (mouseX - PAD_LEFT) / plotW;
        const mouseTime = zoomRange.startMs + ratio * (zoomRange.endMs - zoomRange.startMs);
        let best = visStartIdx;
        let bestDist = Math.abs(points[visStartIdx].time - mouseTime);
        for (let i = visStartIdx + 1; i <= visEndIdx; i++) {
          const dist = Math.abs(points[i].time - mouseTime);
          if (dist < bestDist) { best = i; bestDist = dist; }
        }
        setHoverIndex(best);
        onHoverPrice?.(points[best].price, points[best].label, referencePriceRef.current);
      } else {
        // Multi-day zoomed: index-based lookup (matches toX)
        const ratio = (mouseX - PAD_LEFT) / plotW;
        const count = visEndIdx - visStartIdx;
        const idx = count > 0 ? Math.round(visStartIdx + ratio * count) : visStartIdx;
        const clamped = Math.max(visStartIdx, Math.min(visEndIdx, idx));
        setHoverIndex(clamped);
        onHoverPrice?.(points[clamped].price, points[clamped].label, referencePriceRef.current);
      }
    } else if (is1D && dayRangeMs > 0) {
      // Time-based: convert mouseX to timestamp, find nearest point
      const ratio = (mouseX - PAD_LEFT) / plotW;
      const mouseTime = dayStartMs + ratio * dayRangeMs;
      let best = 0;
      let bestDist = Math.abs(points[0].time - mouseTime);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].time - mouseTime);
        if (dist < bestDist) { best = i; bestDist = dist; }
      }
      setHoverIndex(best);
      onHoverPrice?.(points[best].price, points[best].label, referencePriceRef.current);
    } else {
      const ratio = (mouseX - PAD_LEFT) / plotW;
      const idx = Math.round(ratio * (points.length - 1));
      const clamped = Math.max(0, Math.min(points.length - 1, idx));
      setHoverIndex(clamped);
      onHoverPrice?.(points[clamped].price, points[clamped].label, referencePriceRef.current);
    }
  }, [points, plotW, onHoverPrice, is1D, dayStartMs, dayRangeMs, zoomRange, visStartIdx, visEndIdx, isPanning]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    onHoverPrice?.(null, null);
  }, [onHoverPrice]);

  // Find nearest index from SVG x coordinate
  const findNearestIndex = useCallback((svgX: number): number => {
    if (zoomRange) {
      if (is1D) {
        // 1D zoomed: time-based lookup
        const ratio = (svgX - PAD_LEFT) / plotW;
        const mouseTime = zoomRange.startMs + ratio * (zoomRange.endMs - zoomRange.startMs);
        let best = visStartIdx;
        let bestDist = Math.abs(points[visStartIdx].time - mouseTime);
        for (let i = visStartIdx + 1; i <= visEndIdx; i++) {
          const dist = Math.abs(points[i].time - mouseTime);
          if (dist < bestDist) { best = i; bestDist = dist; }
        }
        return best;
      }
      // Multi-day zoomed: index-based
      const ratio = (svgX - PAD_LEFT) / plotW;
      const count = visEndIdx - visStartIdx;
      const idx = count > 0 ? Math.round(visStartIdx + ratio * count) : visStartIdx;
      return Math.max(visStartIdx, Math.min(visEndIdx, idx));
    }
    if (is1D && dayRangeMs > 0) {
      const ratio = (svgX - PAD_LEFT) / plotW;
      const mouseTime = dayStartMs + ratio * dayRangeMs;
      let best = 0;
      let bestDist = Math.abs(points[0].time - mouseTime);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].time - mouseTime);
        if (dist < bestDist) { best = i; bestDist = dist; }
      }
      return best;
    }
    const ratio = (svgX - PAD_LEFT) / plotW;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }, [points, plotW, is1D, dayStartMs, dayRangeMs, zoomRange, visStartIdx, visEndIdx]);
  const findNearestIndexRef = useRef(findNearestIndex);
  findNearestIndexRef.current = findNearestIndex;

  // Resolve timestamp-based measurement point to nearest index in current points array
  const resolveIndex = useCallback((timestamp: number): number | null => {
    if (points.length === 0) return null;
    let lo = 0, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].time < timestamp) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(points[lo - 1].time - timestamp) < Math.abs(points[lo].time - timestamp)) return lo - 1;
    return lo;
  }, [points]);

  // Derived indices from timestamp-based measurement state
  const measureAIdx = measureA ? resolveIndex(measureA.time) : null;
  const measureBIdx = measureB ? resolveIndex(measureB.time) : null;
  const measureCIdx = measureC ? resolveIndex(measureC.time) : null;

  // Click handler for measurement — on container div so clicks above/below chart register
  const handleChartClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) return; // suppress measurement during pan drag
    if (wasTouchRef.current) { wasTouchRef.current = false; return; } // suppress on touch
    if (!chartContainerRef.current || points.length < 2) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relXRatio = relX / rect.width;

    // Ignore clicks to the left or right of the plot area
    const leftRatio = PAD_LEFT / CHART_W;
    const rightRatio = (CHART_W - PAD_RIGHT) / CHART_W;
    if (relXRatio < leftRatio - 0.02 || relXRatio > rightRatio + 0.02) return;

    const svgX = relXRatio * CHART_W;
    const idx = findNearestIndex(svgX);

    setShowMeasureHint(false);

    if (hasFullMeasurement) {
      setMeasureA(null);
      setMeasureB(null);
      setMeasureC(null);
      setCardDragPos(null);
      setIsDraggingCard(false);
      return;
    } else if (measureA === null) {
      setMeasureA({ time: points[idx].time, price: points[idx].price });
    } else if (measureB === null) {
      setMeasureB({ time: points[idx].time, price: points[idx].price });
    } else {
      setMeasureC({ time: points[idx].time, price: points[idx].price });
    }
  }, [points, findNearestIndex, measureA, measureB, hasFullMeasurement, isPanning]);

  // Measurement computation — always chronological (earlier → later)
  const measurement = useMemo(() => {
    if (measureAIdx === null || measureBIdx === null) return null;
    if (!points[measureAIdx] || !points[measureBIdx]) return null;
    const [idxA, idxB] = measureAIdx <= measureBIdx ? [measureAIdx, measureBIdx] : [measureBIdx, measureAIdx];
    const pA = points[idxA];
    const pB = points[idxB];
    if (pA.price === 0) return null;
    const ab = {
      startPrice: pA.price, endPrice: pB.price,
      startLabel: pA.label, endLabel: pB.label,
      dollarChange: pB.price - pA.price,
      percentChange: ((pB.price - pA.price) / pA.price) * 100,
      daysBetween: Math.round(Math.abs(pB.time - pA.time) / 86400000),
    };
    let bc: typeof ab | null = null;
    let ac: typeof ab | null = null;
    if (measureCIdx !== null && points[measureCIdx]) {
      const pC = points[measureCIdx];
      bc = {
        startPrice: pB.price, endPrice: pC.price,
        startLabel: pB.label, endLabel: pC.label,
        dollarChange: pC.price - pB.price,
        percentChange: pB.price !== 0 ? ((pC.price - pB.price) / pB.price) * 100 : 0,
        daysBetween: Math.round(Math.abs(pC.time - pB.time) / 86400000),
      };
      ac = {
        startPrice: pA.price, endPrice: pC.price,
        startLabel: pA.label, endLabel: pC.label,
        dollarChange: pC.price - pA.price,
        percentChange: ((pC.price - pA.price) / pA.price) * 100,
        daysBetween: Math.round(Math.abs(pC.time - pA.time) / 86400000),
      };
    }
    return { ab, bc, ac };
  }, [measureAIdx, measureBIdx, measureCIdx, points]);

  const measureIsGain = measurement ? measurement.ab.dollarChange >= 0 : true;
  const measureColor = measureIsGain ? '#00C805' : '#E8544E';


  // SVG coordinates for measurement markers (using resolved indices)
  const mAx = measureAIdx !== null && measureAIdx < points.length ? toX(measureAIdx) : null;
  const mAy = measureAIdx !== null && points[measureAIdx] ? toY(points[measureAIdx].price) : null;
  const mBx = measureBIdx !== null && measureBIdx < points.length ? toX(measureBIdx) : null;
  const mBy = measureBIdx !== null && points[measureBIdx] ? toY(points[measureBIdx].price) : null;
  const mCx = measureCIdx !== null && measureCIdx < points.length ? toX(measureCIdx) : null;
  const mCy = measureCIdx !== null && points[measureCIdx] ? toY(points[measureCIdx].price) : null;


  // Snap-to-event: when chart crosshair is near an event, highlight it
  const snappedEventIdx = useMemo(() => {
    if (hoverIndex === null || !eventsEnabled || eventClusters.length === 0) return null;
    for (let i = 0; i < eventClusters.length; i++) {
      if (Math.abs(eventClusters[i].index - hoverIndex) <= 2) return i;
    }
    return null;
  }, [hoverIndex, eventsEnabled, eventClusters]);

  // Effective hovered event: pinned takes priority, then explicit hover, then snap
  const activeEventCluster = pinnedEventIdx ?? hoveredEventIdx ?? snappedEventIdx;

  // Hover crosshair data — guard against stale hoverIndex after period switch
  const safeHoverIndex = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length ? hoverIndex : null;
  const hoverX = safeHoverIndex !== null ? toX(safeHoverIndex) : null;
  const hoverY = safeHoverIndex !== null ? toY(points[safeHoverIndex].price) : null;
  const hoverLabel = safeHoverIndex !== null ? points[safeHoverIndex].label : null;

  // MA values at hovered point
  const hoverMaValues = useMemo(() => {
    if (hoverIndex === null || enabledMAs.size === 0) return [];
    const result: { period: MAPeriod; value: number; color: string }[] = [];
    for (const ma of visibleMaData) {
      if (!enabledMAs.has(ma.period)) continue;
      const val = ma.values[hoverIndex];
      if (val != null) {
        result.push({ period: ma.period, value: val, color: MA_COLORS[ma.period] });
      }
    }
    return result;
  }, [hoverIndex, enabledMAs, visibleMaData]);

  // HUD data for hovered breach
  // Also trigger HUD when the chart crosshair hovers near a signal's index
  const effectiveBreachIndex = hoveredBreachIndex
    ?? (hoverIndex !== null && hoveredCrossIndex === null ? breachClusters.find(c => Math.abs(c.index - hoverIndex) <= 1)?.index ?? null : null);
  const effectiveCrossIndex = hoveredCrossIndex
    ?? (hoverIndex !== null && hoveredBreachIndex === null && effectiveBreachIndex === null ? crossEvents.find(c => Math.abs(c.index - hoverIndex) <= 1)?.index ?? null : null);

  const hoveredCluster = effectiveBreachIndex !== null
    ? breachClusters.find(c => c.index === effectiveBreachIndex) ?? null
    : null;

  const hudData = hoveredCluster ? (() => {
    const color = clusterColor(hoveredCluster);
    const allPeriods = [...new Set(hoveredCluster.events.flatMap(e => e.maPeriods))].sort((a, b) => a - b);
    const firstEvt = hoveredCluster.events[0];
    const lastEvt = hoveredCluster.events[hoveredCluster.events.length - 1];
    if (!points[firstEvt.index] || !points[lastEvt.index]) return null;
    const dateLabel = hoveredCluster.events.length === 1
      ? points[firstEvt.index]?.label
      : `${points[firstEvt.index]?.label} – ${points[lastEvt.index]?.label}`;
    // Distance % from each breached MA
    const distances = allPeriods.map(mp => {
      const maVal = firstEvt.maValues[mp];
      const dist = maVal ? ((firstEvt.price - maVal) / maVal) * 100 : null;
      return { period: mp, dist };
    });
    return { color, allPeriods, firstEvt, dateLabel, distances };
  })() : null;

  return (
    <div className="relative" style={{ overflowX: 'clip', overflowY: 'visible' }}>
      {/* Signal HUD — absolutely positioned top-right, extends up into parent header area */}
      {hudData && hoveredCluster && (
        <div
          className="absolute right-0 z-30 rounded-xl border border-white/[0.08] px-3.5 py-2.5 min-w-[180px] max-w-[220px]"
          style={{
            top: -120,
            background: 'rgba(15, 15, 20, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
          onMouseEnter={() => { if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; } }}
          onMouseLeave={() => { hoverClearTimer.current = setTimeout(() => { setHoveredBreachIndex(null); hoverClearTimer.current = null; }, 500); }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md text-[8px] font-bold text-white"
              style={{ backgroundColor: hudData.color }}>B</span>
            <span className="text-[11px] font-semibold text-white/90 tracking-wide">MA Breach Signal</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-white/40 uppercase tracking-widest">Date</span>
              <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{hudData.dateLabel}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-white/40 uppercase tracking-widest">Price</span>
              <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${hudData.firstEvt.price.toFixed(2)}</span>
            </div>
            {hudData.distances.map(({ period: mp, dist }) => {
              const maVal = hudData.firstEvt.maValues[mp];
              return maVal != null ? (
                <div key={mp} className="flex justify-between items-baseline">
                  <span className="text-[9px] uppercase tracking-widest" style={{ color: MA_COLORS[mp] }}>MA{mp}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${maVal.toFixed(2)}</span>
                    {dist !== null && (
                      <span className={`text-[9px] font-semibold ${dist < 0 ? 'text-rh-red' : 'text-rh-green'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {dist > 0 ? '+' : ''}{dist.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              ) : null;
            })}
          </div>
          <div className="mt-2 pt-1.5 border-t border-white/[0.06]">
            <span className="text-[8px] text-white/25 italic">Signal only — not financial advice.</span>
          </div>
        </div>
      )}

      {/* Cross HUD — Golden/Death Cross tooltip */}
      {effectiveCrossIndex !== null && (() => {
        const cross = crossEvents.find(c => c.index === effectiveCrossIndex);
        if (!cross) return null;
        const isGolden = cross.type === 'golden';
        const color = CROSS_COLORS[cross.type];
        const dateLabel = points[cross.index]?.label ?? '';
        return (
          <div
            className="absolute right-0 z-30 rounded-xl border border-white/[0.08] px-3.5 py-2.5 min-w-[180px] max-w-[220px]"
            style={{ top: -120, background: 'rgba(15, 15, 20, 0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', pointerEvents: 'auto', userSelect: 'none' }}
            onMouseEnter={() => { if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; } }}
            onMouseLeave={() => { hoverClearTimer.current = setTimeout(() => { setHoveredCrossIndex(null); hoverClearTimer.current = null; }, 500); }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                {isGolden ? '✦' : '✕'}
              </span>
              <span className="text-[11px] font-semibold text-white/90 tracking-wide">{isGolden ? 'Golden Cross' : 'Death Cross'}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[9px] text-white/40 uppercase tracking-widest">Date</span>
                <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[9px] text-white/40 uppercase tracking-widest">Price</span>
                <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${cross.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[9px] uppercase tracking-widest" style={{ color: MA_COLORS[100] }}>MA100</span>
                <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${cross.ma100.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[9px] uppercase tracking-widest" style={{ color: MA_COLORS[200] }}>MA200</span>
                <span className="text-[11px] text-white/80 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>${cross.ma200.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-2 pt-1.5 border-t border-white/[0.06]">
              <span className="text-[8px] text-white/25 italic">Signal only — not financial advice.</span>
            </div>
          </div>
        );
      })()}

      {/* MA values bar — fixed height so chart never shifts */}
      <div className="h-[20px] min-h-[20px] mb-1 flex items-center">
        {safeHoverIndex !== null && (hoverMaValues.length > 0 || volumeEnabled) && !hasMeasurement && (
          <div className="flex items-center gap-4 h-full">
            <span className="text-[11px] font-semibold text-rh-light-text dark:text-rh-text" style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${points[safeHoverIndex].price.toFixed(2)}
            </span>
            {hoverMaValues.filter(ma => ma.value != null).map(ma => (
              <span key={ma.period} className="flex items-center gap-1 text-[11px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ma.color }} />
                <span className="text-rh-light-muted dark:text-rh-muted">MA{ma.period}</span>
                <span className="font-medium text-rh-light-text dark:text-rh-text" style={{ fontVariantNumeric: 'tabular-nums' }}>${ma.value.toFixed(2)}</span>
              </span>
            ))}
            {volumeEnabled && points[safeHoverIndex].volume != null && points[safeHoverIndex].volume! > 0 && (
              <span className="flex items-center gap-1 text-[11px]">
                <span className="text-rh-light-muted dark:text-rh-muted">Vol</span>
                <span className="font-medium text-rh-light-text dark:text-rh-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVolume(points[safeHoverIndex].volume!)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="relative w-full focus-visible:ring-1 focus-visible:ring-rh-green/30 rounded" tabIndex={0} style={{ aspectRatio: `${CHART_W}/${CHART_H}`, outline: 'none', touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }} onClick={handleChartClick} onKeyDown={handleKeyDown}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
          onMouseDown={handlePanStart}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: isPanning ? 'grabbing' : zoomRange ? 'grab' : undefined, touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          onClick={(e) => {
            if (isPanning) return;
            e.stopPropagation();
            // Dismiss pinned event card on background click
            if (pinnedEventIdx !== null) { setPinnedEventIdx(null); return; }
            // Skip measurement on touch — touch uses press-drag hover instead
            if (wasTouchRef.current) { wasTouchRef.current = false; return; }
            if (!svgRef.current || points.length < 2) return;
            const rect = svgRef.current.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
            const idx = findNearestIndex(svgX);
            setShowMeasureHint(false);
            if (hasFullMeasurement) { setMeasureA(null); setMeasureB(null); setMeasureC(null); setCardDragPos(null); setIsDraggingCard(false); }
            else if (measureA === null) { setMeasureA({ time: points[idx].time, price: points[idx].price }); }
            else if (measureB === null) { setMeasureB({ time: points[idx].time, price: points[idx].price }); }
            else { setMeasureC({ time: points[idx].time, price: points[idx].price }); }
          }}
        >
          <defs>
            <linearGradient id={`grad-${selectedPeriod}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <clipPath id="plot-clip">
              <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W - PAD_LEFT - PAD_RIGHT} height={CHART_H - PAD_TOP - PAD_BOTTOM} />
            </clipPath>
          </defs>
          <style>{`
            .breach-pill { cursor: default; }
            .breach-pill:hover .breach-pill-glow { opacity: 0.4; }
          `}</style>

          {/* Reference line */}
          {hasData && (
            <line x1={PAD_LEFT} y1={refY} x2={CHART_W - PAD_RIGHT} y2={refY}
              stroke="#6B7280" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.5" />
          )}

          {/* Session veils at market open/close for 1D */}
          {hasData && is1D && [stockOpenIdx, stockCloseIdx].map((idx, i) => idx !== null && (() => {
            const veilX = toX(idx);
            const veilW = 3;
            const priceY = toY(points[idx].price);
            const frac = (priceY - PAD_TOP) / plotH;
            const id = `stock-veil-${i}`;
            return (
              <g key={id}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
                    <stop offset={`${Math.max(5, frac * 100 - 12)}%`} stopColor={lineColor} stopOpacity="0.04" />
                    <stop offset={`${frac * 100}%`} stopColor={lineColor} stopOpacity="0.14" />
                    <stop offset={`${Math.min(95, frac * 100 + 12)}%`} stopColor={lineColor} stopOpacity="0.04" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect x={veilX - veilW / 2} y={PAD_TOP} width={veilW} height={plotH} fill={`url(#${id})`} />
              </g>
            );
          })())}

          {/* Area fill — segmented for 1D to highlight market hours (matches portfolio chart) */}
          {hasData && stockOpenIdx !== null ? (() => {
            const closeIdx = stockCloseIdx ?? points.length - 1;
            const hasAH = stockCloseIdx !== null && stockCloseIdx < points.length - 1;
            const bottomY = CHART_H - PAD_BOTTOM;

            // Build area path for a segment
            const buildAreaSeg = (from: number, to: number) => {
              const pts = points.slice(from, to + 1).map((p, j) => {
                const idx = from + j;
                return `${j === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(p.price).toFixed(1)}`;
              }).join(' ');
              return pts + ` L${toX(to).toFixed(1)},${bottomY.toFixed(1)} L${toX(from).toFixed(1)},${bottomY.toFixed(1)} Z`;
            };

            return (
              <g clipPath="url(#plot-clip)">
                {/* Pre-open — muted */}
                <path d={buildAreaSeg(0, stockOpenIdx)} fill={lineColor} opacity="0.04" />
                {/* Market hours — stronger */}
                <path d={buildAreaSeg(stockOpenIdx, closeIdx)} fill={lineColor} opacity="0.11" />
                {/* After hours — muted */}
                {hasAH && (
                  <path d={buildAreaSeg(closeIdx, points.length - 1)} fill={lineColor} opacity="0.04" />
                )}
              </g>
            );
          })() : hasData && (
            <g clipPath="url(#plot-clip)">
              <path d={areaD} fill={`url(#grad-${selectedPeriod})`} style={{ transition: 'opacity 0.2s ease-out' }} />
            </g>
          )}

          {/* Volume bars */}
          {volumeEnabled && hasData && volMax > 0 && (
            <g clipPath="url(#plot-clip)" opacity="0.35">
              {points.map((p, i) => {
                if (!p.volume || p.volume <= 0) return null;
                // Skip non-visible bars when zoomed for performance
                if (zoomRange && (i < visStartIdx || i > visEndIdx)) return null;
                const barH = (p.volume / volMax) * VOL_MAX_H;
                const bottomY = CHART_H - PAD_BOTTOM;
                const x = toX(i);
                const visibleCount = zoomRange ? (visEndIdx - visStartIdx + 1) : points.length;
                const barW = Math.max(1, plotW / visibleCount * 0.7);
                const isUp = i === 0 ? p.price >= (previousClose || p.price) : p.price >= points[i - 1].price;
                const barColor = isUp ? '#00C805' : '#E8544E';
                return (
                  <rect
                    key={i}
                    x={x - barW / 2}
                    y={bottomY - barH}
                    width={barW}
                    height={barH}
                    fill={barColor}
                    opacity={hoverIndex === i ? 1 : 0.6}
                  />
                );
              })}
            </g>
          )}

          {/* Price line — segmented with hover highlighting on 1D (matches portfolio) */}
          {hasData && stockOpenIdx !== null ? (() => {
            const closeIdx = stockCloseIdx ?? points.length - 1;
            const hasAH = stockCloseIdx !== null && stockCloseIdx < points.length - 1;

            let hoveredSession: 'pre' | 'market' | 'after' | null = null;
            if (hoverIndex !== null) {
              if (hoverIndex < stockOpenIdx) hoveredSession = 'pre';
              else if (hoverIndex < closeIdx) hoveredSession = 'market';
              else hoveredSession = 'after';
            }

            const buildSeg = (from: number, to: number) =>
              points.slice(from, to + 1).map((p, j) => {
                const idx = from + j;
                return `${j === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(p.price).toFixed(1)}`;
              }).join(' ');

            const dimOpacity = hoveredSession !== null ? 0.25 : 0.45;
            const activeOpacity = 1;
            const dimWidth = 1.1;
            const activeWidth = 1.6;

            return (
              <g clipPath="url(#plot-clip)">
                <path d={buildSeg(0, stockOpenIdx)} fill="none" stroke={lineColor}
                  strokeWidth={hoveredSession === 'pre' ? activeWidth : dimWidth}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={hoveredSession === 'pre' ? activeOpacity : dimOpacity}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                <path d={buildSeg(stockOpenIdx, closeIdx)} fill="none" stroke={lineColor}
                  strokeWidth={hoveredSession === 'market' ? activeWidth : dimWidth}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={hoveredSession === 'market' ? activeOpacity : (hoveredSession === null ? 0.7 : dimOpacity)}
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                {hasAH && (
                  <path d={buildSeg(closeIdx, points.length - 1)} fill="none" stroke={lineColor}
                    strokeWidth={hoveredSession === 'after' ? activeWidth : dimWidth}
                    strokeLinecap="round" strokeLinejoin="round"
                    opacity={hoveredSession === 'after' ? activeOpacity : dimOpacity}
                    style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                )}
              </g>
            );
          })() : hasData && (
            <g clipPath="url(#plot-clip)">
              <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'opacity 0.2s ease-out' }} />
            </g>
          )}

          {/* Moving average lines — clipped to plot area */}
          <g clipPath="url(#plot-clip)">
            {maPaths.map(({ period, d }) => (
              <path key={`ma-${period}`} d={d} fill="none" stroke={MA_COLORS[period]}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
            ))}
          </g>

          {/* Comparison overlay lines — normalized % return from other tickers */}
          {comparisons && comparisons.length > 0 && hasData && (
            <g clipPath="url(#plot-clip)">
              {comparisons.map(comp => {
                if (comp.points.length < 2) return null;
                // Helper: find x position for a comparison point's timestamp
                const compToX = (t: number): number => {
                  if (zoomRange && !is1D) {
                    // Multi-day zoomed: find nearest main point by time, use its index position
                    let lo = visStartIdx, hi = visEndIdx;
                    while (lo < hi) {
                      const mid = (lo + hi) >> 1;
                      if (points[mid].time < t) lo = mid + 1; else hi = mid;
                    }
                    // lo is first index >= t; pick closer of lo vs lo-1
                    if (lo > visStartIdx && Math.abs(points[lo - 1].time - t) < Math.abs(points[lo].time - t)) lo--;
                    return toX(Math.max(visStartIdx, Math.min(visEndIdx, lo)));
                  }
                  if (zoomRange && is1D) {
                    return PAD_LEFT + ((t - zoomRange.startMs) / (zoomRange.endMs - zoomRange.startMs)) * plotW;
                  }
                  if (is1D && dayRangeMs > 0) {
                    return PAD_LEFT + ((t - dayStartMs) / dayRangeMs) * plotW;
                  }
                  if (points.length > 1) {
                    const startT = points[0].time;
                    const endT = points[points.length - 1].time;
                    const ratio = endT > startT ? (t - startT) / (endT - startT) : 0;
                    return PAD_LEFT + ratio * plotW;
                  }
                  return PAD_LEFT;
                };
                const compPath = comp.points.map((cp, j) => {
                  const x = compToX(cp.time);
                  const y = toY(cp.price);
                  return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
                return (
                  <g key={comp.ticker}>
                    <path d={compPath} fill="none" stroke={comp.color} strokeWidth="1.3"
                      strokeLinecap="round" strokeLinejoin="round" opacity="0.7"
                      strokeDasharray="4,2" />
                    {/* Label at end of line */}
                    {(() => {
                      const last = comp.points[comp.points.length - 1];
                      const lx = compToX(last.time);
                      const ly = toY(last.price);
                      return (
                        <text x={Math.min(lx + 4, CHART_W - PAD_RIGHT - 30)} y={ly + 3}
                          fill={comp.color} fontSize="9" fontWeight="600" opacity="0.85">
                          {comp.ticker}
                        </text>
                      );
                    })()}
                  </g>
                );
              })}
            </g>
          )}

          {/* MA Breach signals — dynamically positioned above local chart contour */}
          {(() => {
            // Compute local max Y (highest visible line) at each signal's index
            const pillPositions = breachClusters.map((cluster) => {
              // Skip signals outside visible range when zoomed
              if (zoomRange && (cluster.index < visStartIdx || cluster.index > visEndIdx)) return null;
              const cx = toX(cluster.index);
              const idx = cluster.index;
              // Sample all visible values at this index
              let localMinY = toY(points[idx]?.price ?? 0); // SVG y (smaller = higher)
              for (const ma of visibleMaData) {
                if (!enabledMAs.has(ma.period)) continue;
                const v = ma.values[idx];
                if (v !== null) {
                  const y = toY(v);
                  if (y < localMinY) localMinY = y;
                }
              }
              const allPeriods = [...new Set(cluster.events.flatMap(e => e.maPeriods))].sort((a, b) => b - a);
              const isPrimary = allPeriods.includes(200 as MAPeriod);
              return { cluster, cx, cy: toY(cluster.price), localMinY, allPeriods, isPrimary };
            }).filter((p): p is NonNullable<typeof p> => p !== null);

            // Density stagger: offset Y when pills are close in X
            const staggerOffset: number[] = new Array(pillPositions.length).fill(0);
            for (let i = 1; i < pillPositions.length; i++) {
              if (Math.abs(pillPositions[i].cx - pillPositions[i - 1].cx) < 28) {
                staggerOffset[i] = staggerOffset[i - 1] === 0 ? -8 : 0;
              }
            }

            // Trend-aware fade
            const runFade: number[] = new Array(pillPositions.length).fill(1);
            for (let i = 1; i < pillPositions.length; i++) {
              if (Math.abs(pillPositions[i].cx - pillPositions[i - 1].cx) < 60) {
                runFade[i] = Math.max(0.45, runFade[i - 1] - 0.15);
              }
            }

            return pillPositions.map(({ cluster, cx, cy, allPeriods, isPrimary }, idx) => {
              const isActive = effectiveBreachIndex === cluster.index;
              const fillColor = clusterColor(cluster);
              const baseSize = clusterPillSize(cluster);
              const scale = isPrimary ? 1 : 0.85;
              const size = baseSize * scale;
              const baseGlow = clusterGlowOpacity(cluster);
              const r = size / 2;
              // Place pill just above the price point, following the price contour
              const pillY = Math.max(PAD_TOP + r + 2, cy - r - 10 + staggerOffset[idx]);
              const fontSize = (size >= 16 ? 10 : size >= 13 ? 9 : 8);

              const hierarchyOpacity = isPrimary ? 1 : 0.75;
              const finalOpacity = isActive ? 1 : hierarchyOpacity * runFade[idx];

              const displayPeriods = allPeriods.length <= 4
                ? allPeriods
                : [...allPeriods.slice(0, 3), allPeriods[3]];

              const ringR = r + 2;
              const circumference = 2 * Math.PI * ringR;
              const gapDeg = 6;
              const gapLen = (gapDeg / 360) * circumference;

              return (
                <g
                  key={`breach-${cluster.index}`}
                  opacity={finalOpacity}
                  onMouseEnter={() => { if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; } setHoveredBreachIndex(cluster.index); setHoveredCrossIndex(null); setSignalDragPos(null); setIsDraggingSignal(false); }}
                  onMouseLeave={() => { if (!isDraggingSignal && !signalDragPos) { hoverClearTimer.current = setTimeout(() => { setHoveredBreachIndex(null); hoverClearTimer.current = null; }, 300); } }}
                >
                  {/* Tether line from pill to price point */}
                  <line x1={cx} y1={pillY + r} x2={cx} y2={cy}
                    stroke={fillColor} strokeWidth="0.75" opacity={isActive ? 0.45 : 0.15}
                    strokeDasharray="3 3"
                    style={{ transition: 'opacity 180ms ease' }} />
                  {/* Dot at price point */}
                  <circle cx={cx} cy={cy} r="2.5" fill={fillColor} opacity={isActive ? 0.6 : 0.2}
                    style={{ transition: 'opacity 180ms ease' }} />

                  {/* Halo cutout */}
                  <circle cx={cx} cy={pillY} r={r + 5} fill="#0f0f14" />
                  {/* Glow */}
                  <circle cx={cx} cy={pillY} r={r + 3}
                    fill={fillColor} opacity={isActive ? baseGlow + 0.2 : baseGlow}
                    style={{ transition: 'opacity 180ms ease' }} />
                  {/* Fill */}
                  <circle cx={cx} cy={pillY} r={r} fill={fillColor} />

                  {/* Segmented outline ring */}
                  {displayPeriods.length <= 1 ? (
                    <circle cx={cx} cy={pillY} r={ringR}
                      fill="none" stroke={fillColor} strokeWidth="2" opacity="0.4" />
                  ) : (
                    displayPeriods.map((period, si) => {
                      const totalSegs = displayPeriods.length;
                      const totalGap = gapLen * totalSegs;
                      const segLen = (circumference - totalGap) / totalSegs;
                      const startOffset = circumference * 0.25;
                      const offset = startOffset - si * (segLen + gapLen);
                      return (
                        <circle
                          key={`ring-${period}-${si}`}
                          cx={cx} cy={pillY} r={ringR}
                          fill="none"
                          stroke={MA_COLORS[period]}
                          strokeWidth="2"
                          strokeDasharray={`${segLen} ${circumference - segLen}`}
                          strokeDashoffset={offset}
                          strokeLinecap="round"
                        />
                      );
                    })
                  )}

                  {/* Label */}
                  <text
                    x={cx} y={pillY + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize} fontWeight="700" fill="#fff"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >B</text>
                  {/* Hit area — extra wide for preserveAspectRatio="none" */}
                  <rect
                    x={cx - 30} y={pillY - 20}
                    width="60" height="40"
                    fill="transparent" style={{ cursor: 'pointer' }}
                  />
                </g>
              );
            });
          })()}

          {/* Golden / Death Cross markers */}
          {crossEvents.map((cross) => {
            if (zoomRange && (cross.index < visStartIdx || cross.index > visEndIdx)) return null;
            const cx = toX(cross.index);
            const cy = toY(cross.price);
            const isActive = effectiveCrossIndex === cross.index;
            const color = CROSS_COLORS[cross.type];
            const r = 7;
            const pillY = Math.max(PAD_TOP + r + 2, cy - r - 10);

            return (
              <g
                key={`cross-${cross.index}`}
                opacity={isActive ? 1 : 0.85}
                onMouseEnter={() => {
                  if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; }
                  setHoveredCrossIndex(cross.index);
                  setHoveredBreachIndex(null);
                }}
                onMouseLeave={() => {
                  hoverClearTimer.current = setTimeout(() => { setHoveredCrossIndex(null); hoverClearTimer.current = null; }, 300);
                }}
              >
                {/* Tether line */}
                <line x1={cx} y1={pillY + r} x2={cx} y2={cy}
                  stroke={color} strokeWidth="0.75" opacity={isActive ? 0.45 : 0.15}
                  strokeDasharray="3 3" style={{ transition: 'opacity 180ms ease' }} />
                {/* Dot at price */}
                <circle cx={cx} cy={cy} r="2.5" fill={color} opacity={isActive ? 0.6 : 0.2}
                  style={{ transition: 'opacity 180ms ease' }} />
                {/* Halo cutout */}
                <circle cx={cx} cy={pillY} r={r + 4} fill="#0f0f14" />
                {/* Glow */}
                <circle cx={cx} cy={pillY} r={r + 2} fill={color}
                  opacity={isActive ? 0.35 : 0.12} style={{ transition: 'opacity 180ms ease' }} />
                {/* Main circle */}
                <circle cx={cx} cy={pillY} r={r} fill={color} />
                {/* Glyph */}
                <text x={cx} y={pillY + 3.5} textAnchor="middle" fontSize="9" fontWeight="700"
                  fill={cross.type === 'golden' ? '#000' : '#fff'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {cross.type === 'golden' ? '✦' : '✕'}
                </text>
                {/* Hit area — extra wide to compensate for preserveAspectRatio="none" stretching */}
                <rect x={cx - 30} y={pillY - 20} width="60" height="40" fill="transparent" style={{ cursor: 'pointer' }} />
              </g>
            );
          })}

          {/* ── Event markers (on price line, with dashed drop lines) ─── */}
          <g
            opacity={eventsVisible ? 1 : 0}
            style={{ transition: 'opacity 300ms ease' }}
          >
          {eventClusters.map((cluster, ci) => {
            // Skip events outside visible range when zoomed
            if (zoomRange && (cluster.index < visStartIdx || cluster.index > visEndIdx)) return null;
            const ex = toX(cluster.index);
            const priceY = toY(points[cluster.index]?.price ?? 0);
            const bottomY = CHART_H - PAD_BOTTOM;
            const isActive = activeEventCluster === ci;
            const isPinned = pinnedEventIdx === ci;
            const isMulti = cluster.events.length > 1;
            const r = 4.5;
            const primaryEvt = cluster.events[0];

            return (
              <g
                key={`cluster-${ci}`}
                onMouseEnter={() => { if (pinnedEventIdx === null) setHoveredEventIdx(ci); }}
                onMouseLeave={() => { if (pinnedEventIdx === null) setHoveredEventIdx(null); }}
                onClick={(e) => { e.stopPropagation(); setPinnedEventIdx(isPinned ? null : ci); setHoveredEventIdx(null); }}
                style={{ cursor: 'pointer' }}
              >
                {/* Marker on the price line */}
                {isMulti ? (
                  <>
                    {/* Cluster count badge */}
                    <circle cx={ex} cy={priceY} r={r + 2}
                      fill={isActive ? primaryEvt.color : '#3B82F6'}
                      opacity={isActive ? 1 : 0.7}
                      style={{ transition: 'opacity 200ms ease' }} />
                    <text
                      x={ex} y={priceY + 3.5}
                      textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{cluster.events.length}</text>
                  </>
                ) : (
                  <>
                    {/* Glow ring on active */}
                    {isActive && (
                      <circle cx={ex} cy={priceY} r={r + 3}
                        fill="none" stroke={primaryEvt.color} strokeWidth="1.5" opacity="0.4" />
                    )}
                    {/* Main dot */}
                    <circle cx={ex} cy={priceY} r={r}
                      fill={primaryEvt.color}
                      opacity={isActive ? 1 : 0.7}
                      style={{ transition: 'opacity 200ms ease' }} />
                  </>
                )}

                {/* Hit area */}
                <rect x={ex - 16} y={Math.min(priceY - r - 8, priceY - 12)} width="32" height={bottomY - priceY + r + 16}
                  fill="transparent" />
              </g>
            );
          })}
          </g>

          {/* ── Measurement overlays (clipped to plot area) ── */}
          <g clipPath="url(#plot-clip)">

          {/* Vertical dashed line A */}
          {mAx !== null && (
            <line x1={mAx} y1={PAD_TOP} x2={mAx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5">
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Vertical dashed line B */}
          {mBx !== null && (
            <line x1={mBx} y1={PAD_TOP} x2={mBx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5">
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Dot marker A */}
          {mAx !== null && mAy !== null && (
            <>
              <circle cx={mAx} cy={mAy} r="5" fill={measureColor} opacity="0.25">
                {!hasFullMeasurement && !hasMeasurement && (
                  <animate attributeName="r" values="4;7;4" dur="1.5s" repeatCount="indefinite" />
                )}
              </circle>
              <circle cx={mAx} cy={mAy} r="3.5" fill={measureColor} stroke="white" strokeWidth="1.5" />
            </>
          )}

          {/* Dot marker B */}
          {mBx !== null && mBy !== null && (
            <>
              <circle cx={mBx} cy={mBy} r="5" fill={measureColor} opacity="0.25" />
              <circle cx={mBx} cy={mBy} r="3.5" fill={measureColor} stroke="white" strokeWidth="1.5" />
            </>
          )}

          {/* Vertical dashed line C */}
          {mCx !== null && (
            <line x1={mCx} y1={PAD_TOP} x2={mCx} y2={CHART_H - PAD_BOTTOM}
              stroke="white" strokeWidth="1" strokeDasharray="4,3" opacity="0.5">
              <animate attributeName="opacity" from="0" to="0.5" dur="0.2s" fill="freeze" />
            </line>
          )}

          {/* Dot marker C */}
          {mCx !== null && mCy !== null && (
            <>
              <circle cx={mCx} cy={mCy} r="5" fill={measureColor} opacity="0.25" />
              <circle cx={mCx} cy={mCy} r="3.5" fill={measureColor} stroke="white" strokeWidth="1.5" />
            </>
          )}

          {/* Connecting line A→B */}
          {hasMeasurement && mAx !== null && mAy !== null && mBx !== null && mBy !== null && (
            <line x1={mAx} y1={mAy} x2={mBx} y2={mBy}
              stroke={measureColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.6">
              <animate attributeName="opacity" from="0" to="0.6" dur="0.3s" fill="freeze" />
            </line>
          )}

          {/* Connecting line B→C */}
          {hasFullMeasurement && mBx !== null && mBy !== null && mCx !== null && mCy !== null && (
            <line x1={mBx} y1={mBy} x2={mCx} y2={mCy}
              stroke={measureColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.6">
              <animate attributeName="opacity" from="0" to="0.6" dur="0.3s" fill="freeze" />
            </line>
          )}

          {/* ── End measurement overlays ───────────────────── */}
          </g>

          {/* Current price dot with pulse */}
          {hasData && selectedPeriod === '1D' && hoverIndex === null && !isMeasuring && (
            <>
              <circle cx={lastX} cy={lastY} r="6" fill={lineColor} opacity="0.2">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
            </>
          )}

          {/* Hover crosshair (suppress when measurement complete) */}
          {hasData && hoverX !== null && hoverY !== null && !hasFullMeasurement && (
            <>
              <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={CHART_H - PAD_BOTTOM}
                stroke="#9CA3AF" strokeWidth="0.8" opacity="0.6" />
              <circle cx={hoverX} cy={hoverY} r="4" fill={lineColor} stroke="#fff" strokeWidth="1.5" />
              <text x={hoverX} y={PAD_TOP - 6} textAnchor="middle" className="fill-gray-400" fontSize="11" fontWeight="600">
                {hoverLabel}
              </text>
            </>
          )}


          {/* Time labels */}
          {timeLabels.map((tl, i) => {
            // Clamp x to prevent labels from being cut off at edges
            const clampedX = Math.max(3, Math.min(CHART_W - 3, tl.x));
            const anchor = clampedX <= 5 ? 'start' : clampedX >= CHART_W - 5 ? 'end' : i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle';
            return (
              <text key={i} x={clampedX} y={CHART_H - 8} className="fill-gray-500" fontSize="10" textAnchor={anchor}>
                {tl.label}
              </text>
            );
          })}
        </svg>

        {/* Event popup card — rich card like reference design */}
        {activeEventCluster !== null && eventClusters[activeEventCluster] && (() => {
          const cluster = eventClusters[activeEventCluster];
          const ex = toX(cluster.index);
          const priceY = toY(points[cluster.index]?.price ?? 0);
          const leftPct = (ex / CHART_W) * 100;
          // Position card to the right of marker, flip to left if near right edge
          const flipLeft = leftPct > 65;
          const isPinned = pinnedEventIdx !== null;

          // Format date from chart point
          const pointDate = new Date(points[cluster.index]?.time);
          const dateStr = pointDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          const formatEvent = (evt: ChartEvent) => {
            let title = '';
            let detail = '';
            let typeBadge = '';
            let sentimentBadge = '';
            let sentimentColor = '';
            let sourceUrl: string | undefined;

            if (evt.type === 'earnings') {
              const fd = evt.data.fiscalDateEnding as string | undefined;
              const quarter = fd ? (() => {
                const m = new Date(fd + 'T12:00:00').getMonth();
                return `Q${Math.floor(m / 3) + 1} ${fd.slice(0, 4)}`;
              })() : '';
              title = `${quarter} Earnings`;
              typeBadge = 'earnings';
              const beat = evt.data.beat as boolean | null;
              const surprise = evt.data.surprise as number | null;
              const surprisePct = evt.data.surprisePercentage as number | null;
              if (beat === true) {
                sentimentBadge = 'Positive';
                sentimentColor = 'bg-rh-green';
                detail = `Beat by $${Math.abs(surprise!).toFixed(2)}${surprisePct != null ? ` (+${surprisePct.toFixed(1)}%)` : ''}`;
              } else if (beat === false) {
                sentimentBadge = 'Negative';
                sentimentColor = 'bg-rh-red';
                detail = `Missed by $${Math.abs(surprise!).toFixed(2)}${surprisePct != null ? ` (${surprisePct.toFixed(1)}%)` : ''}`;
              } else {
                detail = `EPS: $${(evt.data.reportedEPS as number | null)?.toFixed(2) ?? 'N/A'}`;
              }
            } else if (evt.type === 'dividend') {
              title = 'Ex-Dividend';
              typeBadge = 'dividend';
              detail = `$${(evt.data.amountPerShare as number).toFixed(2)}/share`;
              const payDate = evt.data.payDate as string;
              if (payDate) {
                const pd = new Date(payDate + 'T12:00:00');
                detail += ` \u2022 Pay ${pd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
              }
            } else if (evt.type === 'dividend_credit') {
              title = 'Dividend Received';
              typeBadge = 'dividend';
              sentimentBadge = 'Positive';
              sentimentColor = 'bg-rh-green';
              detail = `$${(evt.data.amountGross as number).toFixed(2)} on ${evt.data.sharesEligible} shares`;
            } else if (evt.type === 'buy') {
              title = 'Bought';
              typeBadge = 'trade';
              sentimentBadge = 'Buy';
              sentimentColor = 'bg-rh-green';
              const shares = evt.data.shares as number | undefined;
              const cost = evt.data.averageCost as number | undefined;
              detail = shares ? `${shares} shares${cost ? ` @ $${cost.toFixed(2)}` : ''}` : '';
            } else if (evt.type === 'sell') {
              title = 'Sold';
              typeBadge = 'trade';
              sentimentBadge = 'Sell';
              sentimentColor = 'bg-rh-red';
              detail = '';
            } else if (evt.type === 'analyst_target') {
              title = 'Price Target Change';
              typeBadge = 'analyst';
              const pct = evt.data.changePct as number | null;
              if (pct != null && pct > 0) { sentimentBadge = 'Positive'; sentimentColor = 'bg-rh-green'; }
              else if (pct != null && pct < 0) { sentimentBadge = 'Negative'; sentimentColor = 'bg-rh-red'; }
              detail = (evt.data.message as string) || '';
            } else if (evt.type === 'analyst_rating') {
              title = 'Rating Change';
              typeBadge = 'analyst';
              sentimentBadge = '';
              sentimentColor = 'bg-purple-500';
              detail = (evt.data.message as string) || '';
            } else if (evt.type === 'ai_earnings' || evt.type === 'ai_analyst' || evt.type === 'ai_dividend') {
              title = (evt.data.label as string) || evt.type.replace('ai_', '');
              const aiTypeLabel = (evt.data.aiType as string || '').toLowerCase();
              typeBadge = aiTypeLabel === 'dividend' ? 'dividend' : aiTypeLabel === 'earnings' ? 'earnings' : 'analyst';
              const s = evt.data.sentiment as number;
              if (s > 0.3) { sentimentBadge = 'Positive'; sentimentColor = 'bg-rh-green'; }
              else if (s < -0.3) { sentimentBadge = 'Negative'; sentimentColor = 'bg-rh-red'; }
              else { sentimentBadge = 'Neutral'; sentimentColor = 'bg-yellow-500'; }
              detail = (evt.data.insight as string) || '';
              sourceUrl = evt.data.source_url as string | undefined;
            } else {
              title = 'Position Update';
              typeBadge = 'trade';
              const shares = evt.data.shares as number | undefined;
              detail = shares ? `${shares} shares` : '';
            }
            return { title, detail, typeBadge, sentimentBadge, sentimentColor, sourceUrl, evt };
          };

          const items = cluster.events.map(formatEvent);

          // Card vertical position: above the marker if room, below if near top
          const cardTopPct = ((priceY - 10) / CHART_H) * 100;
          const showAbove = cardTopPct > 30;

          return (
            <div
              className="absolute z-40 pointer-events-auto"
              onMouseEnter={() => { if (pinnedEventIdx === null) setHoveredEventIdx(activeEventCluster); }}
              onMouseLeave={() => { if (pinnedEventIdx === null) setHoveredEventIdx(null); }}
              style={{
                top: showAbove ? `${((priceY - 14) / CHART_H) * 100}%` : `${((priceY + 14) / CHART_H) * 100}%`,
                left: `${leftPct}%`,
                transform: `translate(${flipLeft ? 'calc(-100% - 12px)' : '12px'}, ${showAbove ? '-100%' : '0'})`,
              }}
            >
              <div
                className="rounded-lg text-left shadow-2xl bg-gray-50/95 dark:bg-[rgba(20,20,26,0.92)] backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08]"
                style={{
                  width: '240px',
                  maxHeight: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header: date + close button */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                  <span className="text-[10px] font-medium text-rh-light-muted/50 dark:text-white/35 tracking-wide uppercase">{dateStr}</span>
                  {isPinned && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPinnedEventIdx(null); }}
                      className="text-rh-light-muted/40 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/70 transition-colors -mr-0.5"
                      style={{ fontSize: '13px', lineHeight: 1 }}
                    >&times;</button>
                  )}
                </div>

                {/* Scrollable event list */}
                <div className="overflow-y-auto px-3 pb-2.5 no-scrollbar" style={{ maxHeight: '240px' }}>
                {items.map((item, ii) => (
                  <div key={ii} className={ii > 0 ? 'mt-2 pt-2 border-t border-gray-200/15 dark:border-white/[0.05]' : ''}>
                    {/* Title + type inline */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[12px] font-semibold text-rh-light-text dark:text-white/90 leading-tight truncate">{item.title}</span>
                      {item.sentimentBadge && (
                        <span className={`text-[9px] px-1.5 py-px rounded-full text-white font-semibold shrink-0 ${item.sentimentColor}`}>
                          {item.sentimentBadge === 'Positive' ? '+' : item.sentimentBadge === 'Negative' ? '−' : '~'}
                        </span>
                      )}
                    </div>

                    {/* Detail text */}
                    {item.detail && (
                      <p className="text-[10.5px] text-rh-light-text/60 dark:text-white/50 leading-snug line-clamp-2">{item.detail}</p>
                    )}

                    {/* Source link */}
                    {item.sourceUrl && (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-1 text-[9px] text-rh-green/50 hover:text-rh-green transition-colors"
                        onClick={(e) => e.stopPropagation()}>
                        source &rarr;
                      </a>
                    )}
                  </div>
                ))}
                </div>
              </div>
            </div>
          );
        })()}


        {/* Measurement HUD — positioned in empty space above price action */}
        {hasMeasurement && measurement && mAx !== null && mBx !== null && mAy !== null && mBy !== null && (() => {
          // Center horizontally between all measure points
          const allXs = [mAx, mBx, ...(mCx !== null ? [mCx] : [])];
          const midXPct = ((Math.min(...allXs) + Math.max(...allXs)) / 2 / CHART_W) * 100;
          // Find the highest price point in the selected range to place card above it
          const indices = [measureAIdx!, measureBIdx!, ...(measureCIdx !== null ? [measureCIdx] : [])];
          const lo = Math.min(...indices);
          const hi = Math.max(...indices);
          let minYInRange = CHART_H;
          for (let i = lo; i <= hi; i++) {
            const y = toY(points[i].price);
            if (y < minYInRange) minYInRange = y;
          }
          // Also check enabled MA values in the range for the true visual top
          for (const ma of visibleMaData) {
            if (!enabledMAs.has(ma.period)) continue;
            for (let i = lo; i <= hi; i++) {
              const v = ma.values[i];
              if (v !== null) {
                const y = toY(v);
                if (y < minYInRange) minYInRange = y;
              }
            }
          }
          // Position card so its BOTTOM edge is above the highest visible point
          const highestPointFromBottomPct = 100 - (minYInRange / CHART_H) * 100;
          const bottomPct = highestPointFromBottomPct + 8;
          // Measurement card sits right of center — signal card will go to its left
          const leftPct = Math.max(30, Math.min(60, midXPct - 12));
          // Store position for signal card alignment
          measureCardPos.current = { bottomPct, leftPct };
          const posStyle = cardDragPos
            ? { top: cardDragPos.y, left: cardDragPos.x, transform: 'translate(-50%, -50%)' }
            : { bottom: `${bottomPct}%`, left: `${leftPct}%` };
          return (
            <div
              className={`absolute z-10 rounded-xl border border-white/[0.08] px-3.5 py-2.5 ${isDraggingCard ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                ...posStyle,
                background: 'rgba(15, 15, 20, 0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = chartContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  setCardDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
                setIsDraggingCard(true);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inline-flex flex-col gap-0.5">
                {/* Segment A → B */}
                {(() => {
                  const s = measurement.ab;
                  const gain = s.dollarChange >= 0;
                  return (
                    <div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span>{s.startLabel}</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        <span>{s.endLabel}</span>
                        {s.daysBetween > 0 && <span className="text-white/30">· {s.daysBetween}d</span>}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.startPrice.toFixed(2)}</span>
                        <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        <span className="text-lg font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.endPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold ${gain ? 'text-rh-green' : 'text-rh-red'}`}>
                          {s.percentChange >= 0 ? '+' : ''}{s.percentChange.toFixed(2)}%
                        </span>
                        <span className={`text-sm font-medium ${gain ? 'text-rh-green' : 'text-rh-red'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.dollarChange >= 0 ? '+' : ''}${s.dollarChange.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Segment B → C */}
                {measurement.bc && (() => {
                  const s = measurement.bc!;
                  const gain = s.dollarChange >= 0;
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span>{s.startLabel}</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        <span>{s.endLabel}</span>
                        {s.daysBetween > 0 && <span className="text-white/30">· {s.daysBetween}d</span>}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.startPrice.toFixed(2)}</span>
                        <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        <span className="text-base font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.endPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold ${gain ? 'text-rh-green' : 'text-rh-red'}`}>
                          {s.percentChange >= 0 ? '+' : ''}{s.percentChange.toFixed(2)}%
                        </span>
                        <span className={`text-sm font-medium ${gain ? 'text-rh-green' : 'text-rh-red'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.dollarChange >= 0 ? '+' : ''}${s.dollarChange.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Total A → C */}
                {measurement.ac && (() => {
                  const s = measurement.ac!;
                  const gain = s.dollarChange >= 0;
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-white/[0.12]">
                      <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-wider font-semibold">Total</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.startPrice.toFixed(2)}</span>
                        <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        <span className="text-base font-bold text-white/90" style={{ fontVariantNumeric: 'tabular-nums' }}>${s.endPrice.toFixed(2)}</span>
                        {s.daysBetween > 0 && <span className="text-xs text-white/30 ml-1">· {s.daysBetween}d</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-bold ${gain ? 'text-rh-green' : 'text-rh-red'}`}>
                          {s.percentChange >= 0 ? '+' : ''}{s.percentChange.toFixed(2)}%
                        </span>
                        <span className={`text-sm font-medium ${gain ? 'text-rh-green' : 'text-rh-red'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.dollarChange >= 0 ? '+' : ''}${s.dollarChange.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="text-[9px] text-white/25 mt-0.5">
                  {'ontouchstart' in window
                    ? (hasFullMeasurement ? 'Tap to remeasure · Tap outside to clear' : 'Tap a 3rd point for total · Tap outside to clear')
                    : (hasFullMeasurement ? 'Click chart to remeasure · ESC to clear' : 'Click a 3rd point for total · ESC to clear')}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Single-point indicator — above the selected point */}
        {isMeasuring && !hasFullMeasurement && !(hasMeasurement) && measureAIdx !== null && points[measureAIdx] && mAx !== null && mAy !== null && (() => {
          const leftPct = Math.max(2, Math.min(70, (mAx / CHART_W) * 100 - 5));
          const topPct = Math.max(0, (mAy / CHART_H) * 100 - 14);
          return (
            <div
              className="absolute pointer-events-none z-10 rounded-lg border border-white/[0.08] px-3 py-1.5"
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                background: 'rgba(15, 15, 20, 0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                <span className="text-xs text-white/70">
                  {points[measureAIdx!].label} · ${points[measureAIdx!].price.toFixed(2)}
                </span>
                <span className="text-[10px] text-white/30">
                  — click another point
                </span>
              </div>
            </div>
          );
        })()}

        {/* Signal HUD moved to outer wrapper */}

        {/* Zoom navigation buttons */}
        {zoomRange && (
          <div className="absolute top-1 left-1 z-20 flex gap-1">
            {zoomHistoryRef.current.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goBackZoom(); }}
                className="px-2 py-0.5 rounded text-[10px] font-medium
                           text-rh-light-muted dark:text-white/50
                           bg-gray-100/80 dark:bg-white/[0.06]
                           hover:bg-gray-200/80 dark:hover:bg-white/[0.1]
                           border border-gray-200/40 dark:border-white/[0.08]
                           backdrop-blur transition-all"
              >
                &larr; Back
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setZoomRange(null); zoomHistoryRef.current = []; }}
              className="px-2 py-0.5 rounded text-[10px] font-medium
                         text-rh-light-muted dark:text-white/50
                         bg-gray-100/80 dark:bg-white/[0.06]
                         hover:bg-gray-200/80 dark:hover:bg-white/[0.1]
                         border border-gray-200/40 dark:border-white/[0.08]
                         backdrop-blur transition-all"
            >
              Reset Zoom
            </button>
          </div>
        )}

        {/* No data overlay */}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-rh-light-muted dark:text-rh-muted text-sm">
                {selectedPeriod === '1D' ? 'Collecting live data...' : 'Chart data loading...'}
              </div>
              {selectedPeriod === '1D' && (
                <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-1 opacity-60">
                  Price updates every 10s during market hours
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live badge - only show when market is actively trading */}
        {selectedPeriod === '1D' && hasData && session && session !== 'CLOSED' && (
          <div className="absolute right-0 top-0">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rh-green" />
              </span>
              Live
            </span>
          </div>
        )}
      </div>

      {/* Zoom indicator bar — shows visible window position within full range */}
      {zoomRange && points.length > 1 && (() => {
        const fullStart = points[0].time;
        const fullEnd = points[points.length - 1].time;
        const fullRange = fullEnd - fullStart;
        if (fullRange <= 0) return null;
        const leftPct = ((zoomRange.startMs - fullStart) / fullRange) * 100;
        const widthPct = ((zoomRange.endMs - zoomRange.startMs) / fullRange) * 100;
        return (
          <div
            ref={zoomBarRef}
            className="relative h-2 bg-gray-200/30 dark:bg-white/[0.06] rounded-full mt-1.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPct = ((e.clientX - rect.left) / rect.width) * 100;
              const zoomDuration = zoomRange.endMs - zoomRange.startMs;
              const newCenterMs = fullStart + (clickPct / 100) * fullRange;
              let s = newCenterMs - zoomDuration / 2, en = newCenterMs + zoomDuration / 2;
              if (s < fullStart) { s = fullStart; en = s + zoomDuration; }
              if (en > fullEnd) { en = fullEnd; s = en - zoomDuration; }
              animateZoomTo({ startMs: s, endMs: en }, 150);
            }}
          >
            <div
              className="absolute top-0 h-full bg-rh-green/50 rounded-full cursor-grab active:cursor-grabbing hover:bg-rh-green/60 transition-colors"
              style={{ left: `${Math.max(0, leftPct)}%`, width: `${Math.min(100, widthPct)}%` }}
              onMouseDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                const rect = zoomBarRef.current?.getBoundingClientRect();
                if (!rect) return;
                barDragRef.current = { startX: e.clientX, startLeft: leftPct, barWidth: widthPct, containerWidth: rect.width };
                setIsBarDragging(true);
              }}
            />
          </div>
        );
      })()}

      {/* Period selector + MA toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="flex gap-1">
          {PERIODS.map(period => {
            const disabled = period !== '1D' && (!candles || candles.closes.length === 0);
            return (
              <button
                key={period}
                onClick={() => !disabled && onPeriodChange(period)}
                disabled={disabled}
                className={`px-2 sm:px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  selectedPeriod === period
                    ? `${isGain ? 'bg-rh-green/15 text-rh-green' : 'bg-rh-red/15 text-rh-red'}`
                    : disabled
                      ? 'text-rh-light-muted/30 dark:text-rh-muted/30 cursor-not-allowed'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                {period}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 sm:gap-1.5">
          {MA_PERIODS.map(ma => {
            const active = enabledMAs.has(ma);
            return (
              <button
                key={ma}
                onClick={() => toggleMA(ma)}
                className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-semibold tracking-wide transition-all border ${
                  active
                    ? 'text-white border-transparent'
                    : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
                style={active ? { backgroundColor: MA_COLORS[ma], borderColor: MA_COLORS[ma] } : undefined}
              >
                MA{ma}
              </button>
            );
          })}
          <span className="w-px bg-rh-light-border dark:bg-rh-border mx-0.5" />
          <button
            onClick={toggleVolume}
            className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-semibold tracking-wide transition-all border ${
              volumeEnabled
                ? 'text-white border-transparent'
                : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            style={volumeEnabled ? { backgroundColor: '#6B7280', borderColor: '#6B7280' } : undefined}
          >
            Vol
          </button>
          <button
            onClick={toggleSignals}
            className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-semibold tracking-wide transition-all border ${
              signalsEnabled
                ? 'text-white border-transparent'
                : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            style={signalsEnabled ? { backgroundColor: '#F59E0B', borderColor: '#F59E0B' } : undefined}
          >
            Signals
          </button>
          <button
            onClick={toggleEvents}
            className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-semibold tracking-wide transition-all border ${
              eventsEnabled
                ? 'text-white border-transparent'
                : 'text-rh-light-muted dark:text-rh-muted border-rh-light-border dark:border-rh-border hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            style={eventsEnabled ? { backgroundColor: '#3B82F6', borderColor: '#3B82F6' } : undefined}
          >
            Events
          </button>
        </div>
      </div>

      {/* Micro legend + measure hint */}
      <div className="flex items-center justify-between mt-1.5">
        {signalsEnabled && enabledMAs.size > 0 && breachClusters.length > 0 ? (
          <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
            B = MA breach signal
          </span>
        ) : <span />}
        <div className="flex items-center gap-3">
          {zoomRange && (
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
              Drag to pan · Double-click to reset
            </span>
          )}
          {!zoomRange && showMeasureHint && hasData && !isMeasuring && (
            <span className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
              Scroll to zoom · Tap to measure
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
