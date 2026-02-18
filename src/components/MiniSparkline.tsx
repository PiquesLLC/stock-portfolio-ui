import { useState, useEffect, useMemo } from 'react';
import { getIntradayCandles, getHourlyCandles, getDailyCandles, IntradayCandle } from '../api';
import { PortfolioChartPeriod } from '../types';

interface MiniSparklineProps {
  ticker: string;
  positive: boolean;
  period?: PortfolioChartPeriod;
}

// Module-level cache: key -> { data, timestamp }
const cache = new Map<string, { data: IntradayCandle[]; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds

// In-flight requests to avoid duplicate fetches for the same key
const inflight = new Map<string, Promise<IntradayCandle[]>>();

function getCacheKey(ticker: string, period: string): string {
  return `${ticker}:${period}`;
}

function getCachedData(ticker: string, period: string): IntradayCandle[] | null {
  const key = getCacheKey(ticker, period);
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

async function fetchCandles(ticker: string, period: PortfolioChartPeriod): Promise<IntradayCandle[]> {
  if (period === '1D') return getIntradayCandles(ticker);
  if (period === '1W' || period === '1M') return getHourlyCandles(ticker, period);
  return getDailyCandles(ticker, period as '3M' | 'YTD' | '1Y' | 'ALL');
}

async function fetchWithCache(ticker: string, period: PortfolioChartPeriod): Promise<IntradayCandle[]> {
  const cached = getCachedData(ticker, period);
  if (cached) return cached;

  const key = getCacheKey(ticker, period);

  // Deduplicate in-flight requests
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetchCandles(ticker, period).then((data) => {
    cache.set(key, { data, timestamp: Date.now() });
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

interface SparkPoint {
  close: number;
  time: number; // ms timestamp
}

// Downsample SparkPoint[] to target count using LTTB (Largest Triangle Three Buckets)
function downsamplePoints(data: SparkPoint[], target: number): SparkPoint[] {
  if (data.length <= target) return data;

  const result: SparkPoint[] = [data[0]]; // Always keep first
  const bucketSize = (data.length - 2) / (target - 2);

  let prevIndex = 0;
  for (let i = 1; i < target - 1; i++) {
    const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);

    // Next bucket average (for triangle area calc)
    const nextStart = Math.floor(i * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);
    let nextAvg = 0;
    for (let j = nextStart; j < nextEnd; j++) nextAvg += data[j].close;
    nextAvg /= (nextEnd - nextStart) || 1;

    // Find point with max triangle area in current bucket
    let maxArea = -1;
    let bestIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (j - prevIndex) * (nextAvg - data[prevIndex].close) -
        (data[j].close - data[prevIndex].close) * ((nextEnd + nextStart) / 2 - prevIndex)
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    result.push(data[bestIdx]);
    prevIndex = bestIdx;
  }

  result.push(data[data.length - 1]); // Always keep last
  return result;
}

// Build smooth cubic bezier path through points
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return '';
  if (coords.length === 2) {
    return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
  }

  let d = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    // Catmull-Rom to cubic bezier conversion (tension = 0.3 for gentle curves)
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}

// Convert candles to SparkPoint pairs (close + time).
// For 1D, use ALL candles (including pre-market) so the sparkline shape
// matches the stock chart. Time-based positioning handles partial days.
function toSparkPoints(candles: IntradayCandle[]): SparkPoint[] {
  return candles.map((c) => ({
    close: c.close,
    time: new Date(c.time).getTime(),
  }));
}

export function MiniSparkline({ ticker, positive, period = '1D' }: MiniSparklineProps) {
  const [rawData, setRawData] = useState<SparkPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Check cache synchronously first
    const cached = getCachedData(ticker, period);
    if (cached) {
      setRawData(toSparkPoints(cached));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetchWithCache(ticker, period)
      .then((data) => {
        if (!cancelled) {
          setRawData(toSparkPoints(data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, period]);

  const WIDTH = 56;
  const HEIGHT = 24;
  const PAD = 2;
  const DOT_R = 2;

  // Downsample + compute coordinates
  const { linePath, areaPath, coords, points } = useMemo(() => {
    if (!rawData || rawData.length < 2) return { linePath: '', areaPath: '', coords: [], points: [] as number[] };

    const sampled = downsamplePoints(rawData, 48);
    const closes = sampled.map(p => p.close);

    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    const innerW = WIDTH - PAD * 2 - DOT_R; // leave room for end dot
    const innerH = HEIGHT - PAD * 2;

    let crds: { x: number; y: number }[];

    if (period === '1D' && sampled.length > 0) {
      // Time-based x positioning for 1D.
      // Window: 4 AM ET to min(now, 8 PM ET). During the trading day, the window
      // extends to "now" so the data fills to the right edge. After hours, it
      // caps at 8 PM. This avoids the "full chart" illusion early in the day
      // and keeps the shape proportional to the stock chart.
      const firstDate = new Date(sampled[0].time);
      const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(firstDate);
      const noonUtc = new Date(`${etDateStr}T12:00:00Z`);
      const noonEtH = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
      }).format(noonUtc).split(':')[0]);
      const etOffsetMs = (noonEtH - 12) * 3600000;
      const dayStartMs = new Date(`${etDateStr}T04:00:00Z`).getTime() - etOffsetMs; // 4 AM ET
      const dayEndMs = new Date(`${etDateStr}T20:00:00Z`).getTime() - etOffsetMs;   // 8 PM ET
      const now = Date.now();
      const windowEnd = now <= dayEndMs ? Math.max(now, sampled[sampled.length - 1].time) : dayEndMs;
      const dayRange = Math.max(windowEnd - dayStartMs, 1);

      // Anchor at left edge (4 AM ET) with first candle's price, then position
      // real data by time. This fills the left side with a flat line, matching
      // how the stock chart anchors previousClose at 4 AM.
      const anchorY = PAD + (1 - (sampled[0].close - min) / range) * innerH;
      crds = [
        { x: PAD, y: anchorY },
        ...sampled.map((p) => ({
          x: PAD + Math.max(0, Math.min(1, (p.time - dayStartMs) / dayRange)) * innerW,
          y: PAD + (1 - (p.close - min) / range) * innerH,
        })),
      ];
    } else {
      // Index-based positioning for all other periods
      const stepX = innerW / (sampled.length - 1);
      crds = sampled.map((p, i) => ({
        x: PAD + i * stepX,
        y: PAD + (1 - (p.close - min) / range) * innerH,
      }));
    }

    const line = smoothPath(crds);

    // Area: line path + close along bottom
    const last = crds[crds.length - 1];
    const first = crds[0];
    const area = `${line} L${last.x.toFixed(1)},${HEIGHT} L${first.x.toFixed(1)},${HEIGHT} Z`;

    return { linePath: line, areaPath: area, coords: crds, points: closes };
  }, [rawData, period]);

  // Error state: render nothing
  if (error) return null;

  // Loading state: subtle pulse placeholder
  if (loading) {
    return (
      <div
        className="inline-block animate-pulse rounded-sm bg-black/[0.04] dark:bg-white/[0.06]"
        style={{ width: WIDTH, height: HEIGHT }}
      />
    );
  }

  // No data or insufficient data
  if (!points || points.length < 2) return null;

  // Use the parent's positive prop (based on dayChange vs previousClose) for color.
  // This is the authoritative source — sparkline visual direction may differ from
  // day change when stocks gap at open (e.g., gap down then recover intra-session).
  const dataPositive = positive;
  const strokeColor = dataPositive ? '#00c805' : '#ff5000';
  const gradientId = `sparkGrad-${ticker}-${period}`;
  const lastPt = coords[coords.length - 1];

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="inline-block flex-shrink-0"
      style={{ verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      {/* Smooth line */}
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      {/* Current price dot */}
      <circle cx={lastPt.x} cy={lastPt.y} r={DOT_R} fill={strokeColor} />
    </svg>
  );
}
