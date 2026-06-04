import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSectorPerformance, SectorPerformanceResponse } from '../api';
import { hapticLight } from '../utils/haptics';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CHART_W = 700;
const CHART_H = 300;
const PAD = { top: 12, right: 6, bottom: 24, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type Period = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

const DAY_START_MIN = 4 * 60;
const DAY_END_MIN = 20 * 60;
const DAY_RANGE_MIN = DAY_END_MIN - DAY_START_MIN;
const MARKET_OPEN_MIN = 9 * 60 + 30;

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function toMinutesET(iso: string): number {
  const d = new Date(iso);
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.getHours() * 60 + et.getMinutes();
}

function formatTimestampET(iso: string, showDate: boolean): string {
  const d = new Date(iso);
  if (showDate) {
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  });
}

/* ─── Color helpers ──────────────────────────────────────────────────────── */

const GREEN = '#00c805';
const RED = '#ff3b30';

function lineColor(pct: number): string {
  return pct >= 0 ? GREEN : RED;
}

function lineShade(pct: number, rank: number, total: number): string {
  // Brighter for extreme performers, slightly muted for middle
  if (pct >= 0) {
    const t = total > 1 ? rank / (total - 1) : 0;
    // rank 0 = best positive → brightest green, higher rank → dimmer
    const alpha = 1 - t * 0.4;
    return `rgba(0,200,5,${alpha.toFixed(2)})`;
  }
  // Negative: rank closer to total-1 = worst → brightest red
  const t = total > 1 ? (total - 1 - rank) / (total - 1) : 0;
  const alpha = 1 - t * 0.4;
  return `rgba(255,59,48,${alpha.toFixed(2)})`;
}


/* ─── SVG path builders ──────────────────────────────────────────────────── */

function buildTimePathFromMinutes(sparkline: number[], minutes: number[], yMin: number, yRange: number): string {
  if (sparkline.length === 0 || minutes.length === 0) return '';
  const parts: string[] = [];
  let started = false;
  for (let i = 0; i < sparkline.length; i++) {
    const min = minutes[i];
    const xFrac = (min - DAY_START_MIN) / DAY_RANGE_MIN;
    if (xFrac < 0 || xFrac > 1) continue;
    const x = PAD.left + xFrac * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    started = true;
  }
  return parts.join('');
}

function buildIndexPath(sparkline: number[], yMin: number, yRange: number): string {
  if (sparkline.length === 0) return '';
  const parts: string[] = [];
  const count = sparkline.length;
  for (let i = 0; i < count; i++) {
    const xFrac = count > 1 ? i / (count - 1) : 0.5;
    const x = PAD.left + xFrac * PLOT_W;
    const y = PAD.top + PLOT_H - ((sparkline[i] - yMin) / (yRange || 1)) * PLOT_H;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join('');
}

/* ─── Hover helpers ──────────────────────────────────────────────────────── */

interface HoverInfo {
  ticker: string;
  value: number;
  timestamp: string;
  color: string;
  y: number;
}

/* ─── Annotation pins ────────────────────────────────────────────────────── */

interface SectorPin {
  ticker: string;
  idx: number;
  ts: string;
  value: number;
}

const PINS_STORAGE_PREFIX = 'sector-perf-pins-'; // kept ONLY so the cleanup effect can flush legacy persisted entries
const MAX_PINS = 20;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 8;
const PIN_HIT_RADIUS = 12;

function formatPinDate(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '1D') {
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric', minute: '2-digit',
    });
  }
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
  });
}

function getHoverIndex1D(minutes: number[], svgX: number): number {
  const targetMin = DAY_START_MIN + ((svgX - PAD.left) / PLOT_W) * DAY_RANGE_MIN;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < minutes.length; i++) {
    const dist = Math.abs(minutes[i] - targetMin);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function getHoverIndexByPosition(count: number, svgX: number): number {
  const frac = (svgX - PAD.left) / PLOT_W;
  return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))));
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface Props {
  onTickerClick?: (ticker: string) => void;
}

export function SectorPerformanceChart({ onTickerClick }: Props) {
  const [data, setData] = useState<SectorPerformanceResponse | null>(null);
  const [period, setPeriod] = useState<Period>('1D');
  const [loading, setLoading] = useState(true);
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverInfos, setHoverInfos] = useState<HoverInfo[]>([]);
  const [hoverTime, setHoverTime] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);
  const isTouchingRef = useRef(false);
  // Track locked sector + accumulated vertical movement for cycling
  const lockedTickerRef = useRef<string | null>(null);
  // Mobile tap-to-drop: handleTouchEnd → clearHover nulls lockedTickerRef BEFORE the synthetic click fires.
  // Stash the value in touchEnd so handleClick can restore it for the tap path.
  const lastLockedTickerRef = useRef<string | null>(null);
  const lastXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const vertAccumRef = useRef<number>(0);
  // Touch-to-navigate: first tap highlights, second tap on same ticker navigates
  const touchTriggeredRef = useRef(false);
  const hoveredAtTouchStartRef = useRef<string | null>(null);
  // Annotation pins — session-only (no persistence). Refresh clears them.
  const [pins, setPins] = useState<SectorPin[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Set true when a long-press completed — suppresses the synthetic click that follows touchend
  const longPressFiredRef = useRef(false);
  // Outer chart container ref — used to detect click-outside for "clear all pins"
  const containerRef = useRef<HTMLDivElement>(null);

  // Data fetching with two behaviors:
  //   - Initial mount + period change: blank stale data so the pulse loader shows for the FIRST fetch.
  //   - Periodic polling (60s on 1D, 5min otherwise): chart stays visible, new data swaps in atomically.
  // Cancellation guard prevents a late response from a previous period from overwriting current data
  // (e.g., user clicks 1D → 3M while the 1D fetch is still in flight).
  useEffect(() => {
    let cancelled = false;
    const safeFetch = async () => {
      setLoading(true);
      try {
        const resp = await getSectorPerformance(period);
        if (cancelled) return;
        setData(resp);
      } catch (e) {
        if (cancelled) return;
        console.error('Sector performance fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setData(null);
    safeFetch();
    const interval = setInterval(safeFetch, period === '1D' ? 60_000 : 300_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [period]);

  // Clear pins when period changes (pins are tied to a specific time scale; cross-period rendering would misplace them)
  useEffect(() => {
    setPins([]);
  }, [period]);

  // One-time cleanup: flush any legacy persisted pins from the prior localStorage-backed implementation
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith(PINS_STORAGE_PREFIX)) localStorage.removeItem(k);
      }
    } catch {
      // ignore storage access errors
    }
  }, []);

  // Clean sparklines and build sorted items list
  const allItems = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.sectors.map(s => ({
        ticker: s.ticker,
        name: s.name,
        changePercent: s.changePercent,
        sparkline: s.sparkline,
        timestamps: s.timestamps,
      })),
      {
        ticker: 'SPY',
        name: 'S&P 500',
        changePercent: data.benchmark.changePercent,
        sparkline: data.benchmark.sparkline,
        timestamps: data.benchmark.timestamps,
      },
    ];
    return items.sort((a, b) => b.changePercent - a.changePercent);
  }, [data]);

  // Pre-compute ET minutes for 1D (avoids expensive toLocaleString on hover AND render)
  const minutesMap = useMemo(() => {
    if (period !== '1D') return null;
    const map = new Map<string, number[]>();
    for (const item of allItems) {
      map.set(item.ticker, item.timestamps.map(toMinutesET));
    }
    return map;
  }, [allItems, period]);

  // Y-axis range
  const { yMin, yRange } = useMemo((): { yMin: number; yRange: number } => {
    if (allItems.length === 0) return { yMin: -3, yRange: 6 };
    const allValues = [...allItems.flatMap(s => s.sparkline), 0];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max((max - min) * 0.15, 0.3);
    return { yMin: min - padding, yRange: max - min + padding * 2 };
  }, [allItems]);

  // Y-axis labels — nice-number step targeting ~6 ticks so wide ranges (parabolic moves) stay readable
  const { yLabels, yDecimals } = useMemo(() => {
    const targetTicks = 6;
    const rawStep = (yRange || 1) / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    const niceFactor = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
    const step = niceFactor * magnitude;
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const labels: { value: number; y: number }[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMin + yRange; v += step) {
      const rounded = Math.round(v * 100) / 100;
      const y = PAD.top + PLOT_H - ((rounded - yMin) / (yRange || 1)) * PLOT_H;
      labels.push({ value: rounded, y });
    }
    return { yLabels: labels, yDecimals: decimals };
  }, [yMin, yRange]);

  // Pre-compute SVG paths (only depend on data, not hover state)
  const pathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of allItems) {
      if (period === '1D' && minutesMap) {
        const mins = minutesMap.get(item.ticker) || [];
        map.set(item.ticker, buildTimePathFromMinutes(item.sparkline, mins, yMin, yRange));
      } else {
        map.set(item.ticker, buildIndexPath(item.sparkline, yMin, yRange));
      }
    }
    return map;
  }, [allItems, period, yMin, yRange, minutesMap]);

  // Set of sector tickers that have at least one pin for the current period.
  // Selected sectors render in the foreground at high opacity; non-pinned sectors fade behind.
  const pinnedTickers = useMemo(() => new Set(pins.map(p => p.ticker)), [pins]);

  // Render order: non-pinned first (background), pinned last (drawn on top for z-order).
  // Original index `i` is preserved so `lineShade` shading stays stable across pins changes.
  const orderedLines = useMemo(() => {
    const annotated = allItems.map((item, i) => ({ item, i }));
    annotated.sort((a, b) => {
      const aPinned = pinnedTickers.has(a.item.ticker) ? 1 : 0;
      const bPinned = pinnedTickers.has(b.item.ticker) ? 1 : 0;
      return aPinned - bPinned;
    });
    return annotated;
  }, [allItems, pinnedTickers]);

  // Hover handler — sticky sector lock with up/down cycling:
  // Left/right scrubs time on the locked sector.
  // Accumulated vertical movement cycles to the next line above/below.
  const CYCLE_THRESHOLD = 18; // SVG units of vertical movement to trigger a cycle

  // Shared hover computation used by both mouse and touch
  const updateHover = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current || allItems.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * CHART_W;
      const svgY = ((clientY - rect.top) / rect.height) * CHART_H;
      if (svgX < PAD.left || svgX > CHART_W - PAD.right) {
        setHoverX(null);
        setHoverInfos([]);
        setHoverTime('');
        setHoveredTicker(null);
        lockedTickerRef.current = null;
        vertAccumRef.current = 0;
        return;
      }
      setHoverX(svgX);

      // Compute Y position for each sector at this X
      const infos: HoverInfo[] = [];
      let timeStr = '';
      for (const item of allItems) {
        if (item.sparkline.length === 0) continue;
        const idx = period === '1D' && minutesMap
          ? getHoverIndex1D(minutesMap.get(item.ticker) || [], svgX)
          : getHoverIndexByPosition(item.sparkline.length, svgX);
        const val = item.sparkline[idx];
        const ts = item.timestamps[idx];
        if (!timeStr && ts) {
          timeStr = formatTimestampET(ts, period !== '1D');
        }
        const y = PAD.top + PLOT_H - ((val - yMin) / (yRange || 1)) * PLOT_H;
        infos.push({
          ticker: item.ticker,
          value: val,
          timestamp: ts || '',
          color: lineColor(item.changePercent),
          y,
        });
      }
      setHoverInfos(infos);
      setHoverTime(timeStr);

      // Sort by Y position at this X (top of chart = lowest Y = highest %)
      const sorted = [...infos].sort((a, b) => a.y - b.y);

      if (!lockedTickerRef.current) {
        // First hover — lock to nearest line by cursor Y
        let nearest = sorted[0];
        let nearestDist = Infinity;
        for (const info of sorted) {
          const d = Math.abs(info.y - svgY);
          if (d < nearestDist) { nearestDist = d; nearest = info; }
        }
        lockedTickerRef.current = nearest.ticker;
        setHoveredTicker(nearest.ticker);
        lastXRef.current = svgX;
        lastYRef.current = svgY;
        vertAccumRef.current = 0;
      } else {
        const dx = Math.abs(svgX - lastXRef.current);
        const dy = svgY - lastYRef.current;
        const absDy = Math.abs(dy);
        lastXRef.current = svgX;
        lastYRef.current = svgY;

        // Only accumulate vertical movement when it's the dominant direction.
        // If horizontal movement is 2x+ the vertical, ignore the vertical wobble.
        if (absDy > 0.5 && (dx < absDy * 2)) {
          vertAccumRef.current += dy;
        } else {
          // Mostly horizontal — decay the accumulator toward zero
          vertAccumRef.current *= 0.7;
        }

        if (Math.abs(vertAccumRef.current) > CYCLE_THRESHOLD) {
          const direction = vertAccumRef.current > 0 ? 1 : -1;
          const currentIdx = sorted.findIndex(s => s.ticker === lockedTickerRef.current);
          if (currentIdx !== -1) {
            const nextIdx = Math.max(0, Math.min(sorted.length - 1, currentIdx + direction));
            lockedTickerRef.current = sorted[nextIdx].ticker;
            setHoveredTicker(sorted[nextIdx].ticker);
          }
          vertAccumRef.current = 0;
        } else {
          setHoveredTicker(lockedTickerRef.current);
        }
      }
    },
    [allItems, period, yMin, yRange, minutesMap],
  );

  const clearHover = useCallback(() => {
    setHoverX(null);
    setHoveredTicker(null);
    setHoverInfos([]);
    setHoverTime('');
    lockedTickerRef.current = null;
    vertAccumRef.current = 0;
  }, []);

  // Compute SVG-space position of a pin in the current scale; returns null if unrenderable
  const computePinPos = useCallback(
    (pin: SectorPin): { x: number; y: number; color: string } | null => {
      const sector = allItems.find(s => s.ticker === pin.ticker);
      if (!sector || sector.sparkline.length === 0) return null;
      const safeIdx = Math.min(pin.idx, sector.sparkline.length - 1);
      let x: number;
      if (period === '1D' && minutesMap) {
        const minutes = minutesMap.get(pin.ticker) || [];
        const min = minutes[safeIdx];
        if (min === undefined) return null;
        const xFrac = (min - DAY_START_MIN) / DAY_RANGE_MIN;
        if (xFrac < 0 || xFrac > 1) return null;
        x = PAD.left + xFrac * PLOT_W;
      } else {
        const count = sector.sparkline.length;
        const xFrac = count > 1 ? safeIdx / (count - 1) : 0.5;
        x = PAD.left + xFrac * PLOT_W;
      }
      const currentValue = sector.sparkline[safeIdx];
      if (currentValue === undefined) return null;
      const y = PAD.top + PLOT_H - ((currentValue - yMin) / (yRange || 1)) * PLOT_H;
      return { x, y, color: lineColor(sector.changePercent) };
    },
    [allItems, period, minutesMap, yMin, yRange],
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  const removePin = useCallback((idx: number) => {
    setPins(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const dropPin = useCallback((pin: SectorPin) => {
    setPins(prev => [...prev, pin].slice(-MAX_PINS));
  }, []);

  // Clear all pins (used by ESC / click-outside / explicit user action)
  const clearAllPins = useCallback(() => {
    setPins([]);
  }, []);

  // Drop a pin at the given SVG X on the currently locked sector
  const dropPinAtX = useCallback((svgX: number) => {
    if (svgX < PAD.left || svgX > CHART_W - PAD.right) return;
    const ticker = lockedTickerRef.current;
    if (!ticker) return;
    const sector = allItems.find(s => s.ticker === ticker);
    if (!sector || sector.sparkline.length === 0) return;
    const idx = period === '1D' && minutesMap
      ? getHoverIndex1D(minutesMap.get(ticker) || [], svgX)
      : getHoverIndexByPosition(sector.sparkline.length, svgX);
    const value = sector.sparkline[idx];
    const ts = sector.timestamps[idx];
    if (value === undefined || ts === undefined) return;
    dropPin({ ticker, idx, ts, value });
  }, [allItems, period, minutesMap, dropPin]);

  // Long-press handler: if origin is on an existing pin, remove it; else drop new pin
  const handleLongPress = useCallback((originX: number, originY: number) => {
    for (let i = 0; i < pins.length; i++) {
      const pos = computePinPos(pins[i]);
      if (!pos) continue;
      if (Math.hypot(pos.x - originX, pos.y - originY) <= PIN_HIT_RADIUS) {
        removePin(i);
        hapticLight();
        return;
      }
    }
    dropPinAtX(lastXRef.current);
    hapticLight();
  }, [pins, computePinPos, removePin, dropPinAtX]);

  // Plain click on chart → either remove the clicked pin OR drop a new one.
  // This is the single source of truth for chart clicks; the pin <g>s do NOT have their own
  // onClick (relying on stopPropagation proved fragile — synthetic-event ordering caused
  // duplicate remove+drop combinations that visually left the pin in place).
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * CHART_H;

    // If the click landed within an existing pin's hit radius, remove that pin (toggle).
    for (let i = 0; i < pins.length; i++) {
      const pos = computePinPos(pins[i]);
      if (!pos) continue;
      if (Math.hypot(pos.x - svgX, pos.y - svgY) <= PIN_HIT_RADIUS) {
        removePin(i);
        return;
      }
    }

    // Else: drop a new pin at the click position on the locked sector.
    // Mobile tap path: touchend nuked lockedTickerRef before this click fired. Restore from stash.
    if (!lockedTickerRef.current && lastLockedTickerRef.current) {
      lockedTickerRef.current = lastLockedTickerRef.current;
      lastLockedTickerRef.current = null;
    }
    dropPinAtX(svgX);
  }, [pins, computePinPos, removePin, dropPinAtX]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => updateHover(e.clientX, e.clientY),
    [updateHover],
  );

  const handleMouseLeave = useCallback(() => clearHover(), [clearHover]);

  // Touch handlers — press and drag to scrub, just like mouse hover.
  // Long-press (no movement for LONG_PRESS_MS) drops or removes an annotation pin.
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length !== 1) return;
      isTouchingRef.current = true;
      // Invalidate any stash from a prior tap so a PAD-region tap can't restore stale lock state.
      lastLockedTickerRef.current = null;
      const t = e.touches[0];
      updateHover(t.clientX, t.clientY);
      cancelLongPress();
      longPressFiredRef.current = false;
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const sx = ((t.clientX - rect.left) / rect.width) * CHART_W;
      const sy = ((t.clientY - rect.top) / rect.height) * CHART_H;
      longPressOriginRef.current = { x: sx, y: sy };
      longPressTimerRef.current = setTimeout(() => {
        if (!isTouchingRef.current) return;
        const origin = longPressOriginRef.current;
        if (!origin) return;
        handleLongPress(origin.x, origin.y);
        longPressFiredRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_MS);
    },
    [updateHover, cancelLongPress, handleLongPress],
  );

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    cancelLongPress();
    // Stash the locked ticker BEFORE clearHover nukes it. The synthetic click that
    // browsers fire after touchend (for plain taps) needs this to know which sector to pin.
    if (lockedTickerRef.current) lastLockedTickerRef.current = lockedTickerRef.current;
    clearHover();
  }, [clearHover, cancelLongPress]);

  // Native touchmove listener with { passive: false } so preventDefault() works.
  // Cancels the long-press timer if the finger moves beyond LONG_PRESS_MOVE_TOLERANCE.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!isTouchingRef.current || e.touches.length !== 1) return;
      e.preventDefault(); // Block scroll while scrubbing
      const t = e.touches[0];
      updateHover(t.clientX, t.clientY);
      const origin = longPressOriginRef.current;
      if (origin && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const sx = ((t.clientX - rect.left) / rect.width) * CHART_W;
        const sy = ((t.clientY - rect.top) / rect.height) * CHART_H;
        if (Math.hypot(sx - origin.x, sy - origin.y) > LONG_PRESS_MOVE_TOLERANCE) {
          cancelLongPress();
        }
      }
    };
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => svg.removeEventListener('touchmove', onTouchMove);
  }, [updateHover, cancelLongPress]);

  // Clean up timer on unmount
  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  // Clear all pins on ESC or on click/tap outside the chart container.
  // Only active when at least one pin exists — avoids attaching global listeners needlessly.
  useEffect(() => {
    if (pins.length === 0) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // ignore right-click / middle-click (context menu, paste, etc.)
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      clearAllPins();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearAllPins();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pins.length, clearAllPins]);

  if (loading && !data) {
    return (
      <div className="p-4 animate-pulse h-[360px]" />
    );
  }

  if (!data || allItems.length === 0) return null;

  const zeroY = PAD.top + PLOT_H - ((0 - yMin) / (yRange || 1)) * PLOT_H;

  const timeLabels1D = [
    { min: 4 * 60, label: '4 AM' },
    { min: 7 * 60, label: '7 AM' },
    { min: 9 * 60 + 30, label: '9:30' },
    { min: 12 * 60, label: '12 PM' },
    { min: 14 * 60 + 30, label: '2:30' },
    { min: 17 * 60, label: '5 PM' },
    { min: 20 * 60, label: '8 PM' },
  ];

  // Hovered item for tooltip
  const hoveredInfo = hoveredTicker ? hoverInfos.find(h => h.ticker === hoveredTicker) : null;

  return (
    <div ref={containerRef} className="overflow-hidden select-none">
      {/* Period selector — underline style */}
      <div className="flex items-center gap-0 -ml-1 mb-1">
        {(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`relative px-2.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
              period === p
                ? 'text-rh-green'
                : 'text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-white/60'
            }`}
          >
            {p}
            {period === p && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-rh-green" />
            )}
          </button>
        ))}
      </div>

      <div className="relative" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            data-no-tab-swipe
            style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            {/* Y-axis grid lines — faint dashed horizontal guides at each non-zero tick.
                Same dash pattern + color as the 0% baseline below so they read as one family of guides;
                hierarchy comes purely from alpha (0% baseline = 0.2, grid = 0.1). */}
            {yLabels.map(({ value, y }) => (
              Math.abs(value) < 0.001 ? null : (
                <line
                  key={`grid-${value}`}
                  x1={PAD.left} x2={CHART_W - PAD.right}
                  y1={y} y2={y}
                  stroke="rgba(150,150,150,0.1)"
                  strokeWidth={0.5}
                  strokeDasharray="4,4"
                />
              )
            ))}

            {/* 0% baseline */}
            {zeroY >= PAD.top && zeroY <= PAD.top + PLOT_H && (
              <line
                x1={PAD.left} x2={CHART_W - PAD.right}
                y1={zeroY} y2={zeroY}
                stroke="rgba(150,150,150,0.2)"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            )}

            {/* Y-axis labels */}
            {yLabels.map(({ value, y }) => (
              <text
                key={value}
                x={PAD.left - 4} y={y + 3}
                textAnchor="end"
                className="fill-gray-400 dark:fill-white/25"
                fontSize="8"
                fontFamily="system-ui"
              >
                {value > 0 ? '+' : ''}{value.toFixed(yDecimals)}%
              </text>
            ))}

            {/* 1D: Market open line at 9:30 AM */}
            {period === '1D' && (() => {
              const x = PAD.left + ((MARKET_OPEN_MIN - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
              return (
                <line
                  x1={x} x2={x}
                  y1={PAD.top} y2={PAD.top + PLOT_H}
                  stroke="rgba(0,200,5,0.1)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })()}

            {/* Sector lines — pinned sectors drawn on top of unpinned for z-order.
                Opacity / stroke logic:
                  - Hovered (scrub-locked): full bright, thick
                  - Pinned but not hovered (only when any pins exist): bright, slightly thick
                  - Not pinned, not hovered (only when any pins exist): heavily faded
                  - Hovered context only (no pins): existing behavior (1 / 0.08)
                  - Default (no pins, nothing hovered): 0.8 */}
            {orderedLines.map(({ item, i }) => {
              const isHovered = hoveredTicker === item.ticker;
              const anyHovered = hoveredTicker !== null;
              const isPinned = pinnedTickers.has(item.ticker);
              const hasPinned = pinnedTickers.size > 0;
              const baseColor = lineShade(item.changePercent, i, allItems.length);
              const focusedColor = lineColor(item.changePercent);

              let opacity: number;
              let strokeWidth: number;
              let stroke: string;
              if (isHovered) {
                opacity = 1; strokeWidth = 2.5; stroke = focusedColor;
              } else if (hasPinned) {
                if (isPinned) { opacity = 0.85; strokeWidth = 1.8; stroke = focusedColor; }
                else { opacity = 0.1; strokeWidth = 1.3; stroke = baseColor; }
              } else if (anyHovered) {
                opacity = 0.08; strokeWidth = 1.3; stroke = baseColor;
              } else {
                opacity = 0.8; strokeWidth = 1.3; stroke = baseColor;
              }

              return (
                <path
                  key={item.ticker}
                  d={pathMap.get(item.ticker) || ''}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  strokeLinejoin="round"
                  style={{ transition: 'opacity 0.15s, stroke-width 0.15s, stroke 0.15s' }}
                />
              );
            })}

            {/* Annotation pins (above lines, below crosshair) */}
            {pins.map((pin, i) => {
              const pos = computePinPos(pin);
              if (!pos) return null;
              return (
                <g
                  key={`pin-${pin.ticker}-${pin.idx}-${i}`}
                  style={{ cursor: 'pointer', pointerEvents: 'none' }}
                >
                  <circle cx={pos.x} cy={pos.y} r={PIN_HIT_RADIUS} fill="transparent" />
                  <circle cx={pos.x} cy={pos.y} r={5} fill="white" stroke="rgba(0,0,0,0.55)" strokeWidth={0.9} />
                  <circle cx={pos.x} cy={pos.y} r={3.2} fill={pos.color} />
                </g>
              );
            })}

            {/* Hover crosshair */}
            {hoverX !== null && (
              <line
                x1={hoverX} x2={hoverX}
                y1={PAD.top} y2={PAD.top + PLOT_H}
                stroke="rgba(150,150,150,0.3)"
                strokeWidth={0.5}
              />
            )}

            {/* Hover dots on each line */}
            {hoverX !== null && hoveredTicker && hoveredInfo && (
              <circle
                cx={hoverX}
                cy={hoveredInfo.y}
                r={3.5}
                fill={hoveredInfo.color}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.5}
              />
            )}

            {/* Time labels */}
            {period === '1D' ? (
              timeLabels1D.map(({ min, label }, i) => {
                const x = PAD.left + ((min - DAY_START_MIN) / DAY_RANGE_MIN) * PLOT_W;
                const anchor = i === 0 ? 'start' : i === timeLabels1D.length - 1 ? 'end' : 'middle';
                return (
                  <text
                    key={label}
                    x={x} y={PAD.top + PLOT_H + 16}
                    textAnchor={anchor}
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="7"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              })
            ) : (() => {
              const longestTs = allItems.reduce((a, b) =>
                a.timestamps.length >= b.timestamps.length ? a : b
              ).timestamps;
              if (longestTs.length === 0) return null;
              const count = longestTs.length;
              const indices = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor(count * 3 / 4), count - 1];
              return indices.map((idx, i) => {
                const xFrac = count > 1 ? idx / (count - 1) : 0.5;
                const x = PAD.left + xFrac * PLOT_W;
                const d = new Date(longestTs[idx]);
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const anchor = i === 0 ? 'start' : i === indices.length - 1 ? 'end' : 'middle';
                return (
                  <text
                    key={idx}
                    x={x} y={PAD.top + PLOT_H + 16}
                    textAnchor={anchor}
                    className="fill-gray-400 dark:fill-white/20"
                    fontSize="7"
                    fontFamily="system-ui"
                  >
                    {label}
                  </text>
                );
              });
            })()}
          </svg>

          {/* Hover tooltip */}
          {hoverX !== null && hoveredTicker && hoveredInfo && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: `${(hoverX / CHART_W) * 100}%`,
                top: '8px',
                transform: hoverX > CHART_W * 0.7 ? 'translateX(-110%)' : 'translateX(8px)',
              }}
            >
              <div className="bg-gray-900/90 dark:bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-white/10">
                <div className="text-[10px] text-white/50 mb-1">{hoverTime}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{hoveredInfo.ticker}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: hoveredInfo.color }}>
                    {hoveredInfo.value > 0 ? '+' : ''}{hoveredInfo.value.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Pin-feature discoverability hint — adapts based on whether pins exist for this period */}
          <div className="absolute bottom-1 right-2 text-[9px] text-rh-light-muted/40 dark:text-white/25 pointer-events-none select-none whitespace-nowrap">
            {pins.length === 0 ? 'Click to mark a moment' : 'Click outside or press ESC to clear'}
          </div>

          {/* Pin labels — fixed CSS size (legible at any chart width), tap-to-remove */}
          {pins.map((pin, i) => {
            const pos = computePinPos(pin);
            if (!pos) return null;
            // Threshold accounts for two-line label (~24 CSS px) + gap, with extra room for mobile (where SVG units compress to smaller CSS px).
            const labelBelow = pos.y < 70;
            const xPct = (pos.x / CHART_W) * 100;
            const yPct = (pos.y / CHART_H) * 100;
            const xAnchor = xPct < 8 ? '0%' : xPct > 92 ? '-100%' : '-50%';
            return (
              <div
                key={`pin-label-${pin.ticker}-${pin.idx}-${i}`}
                className="absolute z-10 cursor-pointer"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: labelBelow
                    ? `translate(${xAnchor}, calc(0% + 12px))`
                    : `translate(${xAnchor}, calc(-100% - 12px))`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                  removePin(i);
                }}
              >
                <div className="bg-gray-900/95 dark:bg-black/85 backdrop-blur-sm rounded px-1.5 py-1 text-[10px] leading-tight tabular-nums whitespace-nowrap shadow border border-white/10">
                  <div className="text-white/65">{formatPinDate(pin.ts, period)}</div>
                  <div style={{ color: lineColor(pin.value) }}>
                    {pin.value > 0 ? '+' : ''}{pin.value.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Horizontal bar chart */}
      <div className="pb-4 pt-3 border-t border-gray-200/10 dark:border-white/[0.04]">
        <div className="space-y-0">
          {allItems.map((item, i) => {
            const pct = item.changePercent;
            const maxAbsPct = Math.max(...allItems.map(it => Math.abs(it.changePercent)), 0.01);
            const barWidth = (Math.abs(pct) / maxAbsPct) * 45;
            const isPositive = pct >= 0;
            const isZero = Math.abs(pct) < 0.005;
            const isHovered = hoveredTicker === item.ticker;
            // Match the chart-line color exactly so the bar-list row identifies which line on the chart is which sector.
            const swatchColor = lineShade(pct, i, allItems.length);
            return (
              <div
                key={item.ticker}
                className={`flex items-center gap-2 cursor-pointer py-2.5 border-b border-gray-200/10 dark:border-white/[0.04] last:border-b-0 transition-colors ${isHovered ? 'bg-gray-100/40 dark:bg-white/[0.02]' : 'hover:bg-gray-100/40 dark:hover:bg-white/[0.02]'}`}
                onMouseEnter={() => setHoveredTicker(item.ticker)}
                onMouseLeave={() => setHoveredTicker(null)}
                onTouchStart={() => {
                  touchTriggeredRef.current = true;
                  hoveredAtTouchStartRef.current = hoveredTicker;
                  setHoveredTicker(item.ticker);
                }}
                onClick={() => {
                  if (touchTriggeredRef.current) {
                    touchTriggeredRef.current = false;
                    if (hoveredAtTouchStartRef.current === item.ticker) {
                      onTickerClick?.(item.ticker);
                    }
                    return;
                  }
                  onTickerClick?.(item.ticker);
                }}
              >
                <span
                  className="shrink-0 inline-block w-3 h-[2px] rounded-full"
                  style={{ background: swatchColor }}
                  aria-hidden="true"
                />
                <span className={`text-[11px] w-16 sm:w-24 text-right shrink-0 font-medium tabular-nums transition-colors ${isHovered ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted/60 dark:text-rh-muted/60'}`}>
                  {item.name}
                </span>
                <div className="flex-1 flex items-center h-3">
                  <div className="relative w-full h-full flex items-center">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200/20 dark:bg-white/[0.08]" />
                    {!isZero && (
                      <div
                        className="absolute h-full rounded-[2px] transition-all duration-500"
                        style={{
                          left: isPositive ? '50%' : `${50 - barWidth}%`,
                          width: `${Math.max(barWidth, 0.5)}%`,
                          background: isPositive ? '#00C805' : '#E8544E',
                        }}
                      />
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-bold min-w-[48px] text-right tabular-nums ${isZero ? 'text-rh-light-muted dark:text-rh-muted' : isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
                  {isPositive ? '+' : ''}{pct.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
