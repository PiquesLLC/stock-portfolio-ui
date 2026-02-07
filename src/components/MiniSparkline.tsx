import { useState, useEffect } from 'react';
import { getIntradayCandles, IntradayCandle } from '../api';

interface MiniSparklineProps {
  ticker: string;
  positive: boolean;
}

// Module-level cache: ticker -> { data, timestamp }
const cache = new Map<string, { data: IntradayCandle[]; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds

// In-flight requests to avoid duplicate fetches for the same ticker
const inflight = new Map<string, Promise<IntradayCandle[]>>();

function getCachedData(ticker: string): IntradayCandle[] | null {
  const entry = cache.get(ticker);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

async function fetchWithCache(ticker: string): Promise<IntradayCandle[]> {
  const cached = getCachedData(ticker);
  if (cached) return cached;

  // Deduplicate in-flight requests
  const existing = inflight.get(ticker);
  if (existing) return existing;

  const promise = getIntradayCandles(ticker).then((data) => {
    cache.set(ticker, { data, timestamp: Date.now() });
    inflight.delete(ticker);
    return data;
  }).catch((err) => {
    inflight.delete(ticker);
    throw err;
  });

  inflight.set(ticker, promise);
  return promise;
}

export function MiniSparkline({ ticker, positive }: MiniSparklineProps) {
  const [points, setPoints] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Check cache synchronously first
    const cached = getCachedData(ticker);
    if (cached) {
      setPoints(cached.map((c) => c.close));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetchWithCache(ticker)
      .then((data) => {
        if (!cancelled) {
          setPoints(data.map((c) => c.close));
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
  }, [ticker]);

  // Error state: render nothing
  if (error) return null;

  // Loading state: subtle pulse placeholder
  if (loading) {
    return (
      <div
        className="inline-block animate-pulse rounded-sm bg-white/[0.06]"
        style={{ width: 48, height: 20 }}
      />
    );
  }

  // No data or insufficient data
  if (!points || points.length < 2) return null;

  const width = 48;
  const height = 20;
  const padding = 1;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1; // avoid division by zero for flat lines

  // Scale points to SVG coordinates
  const stepX = (width - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: padding + (1 - (p - min) / range) * (height - padding * 2),
  }));

  // Build the polyline path
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  // Build the area path (line + close along bottom)
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;

  const strokeColor = positive ? '#00c805' : '#ff5000';
  const gradientId = `sparkGrad-${ticker}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block flex-shrink-0"
      style={{ verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
