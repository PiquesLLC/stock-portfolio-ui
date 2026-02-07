import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { Holding } from '../types';
import { getHourlyCandles, IntradayCandle } from '../api';

interface CorrelationHeatmapProps {
  holdings: Holding[];
}

// ── Color interpolation ────────────────────────────────────────────
// -1 → #ff5000 (red)   0 → #333333 (gray)   +1 → #00c805 (green)
function correlationColor(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r));
  if (clamped >= 0) {
    // gray → green
    const t = clamped;
    const red   = Math.round(0x33 + (0x00 - 0x33) * t);
    const green = Math.round(0x33 + (0xc8 - 0x33) * t);
    const blue  = Math.round(0x33 + (0x05 - 0x33) * t);
    return `rgb(${red},${green},${blue})`;
  } else {
    // gray → red
    const t = -clamped;
    const red   = Math.round(0x33 + (0xff - 0x33) * t);
    const green = Math.round(0x33 + (0x50 - 0x33) * t);
    const blue  = Math.round(0x33 + (0x00 - 0x33) * t);
    return `rgb(${red},${green},${blue})`;
  }
}

// ── Pearson correlation ────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += xs[i];
    sumY  += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }

  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── Compute % returns from candles ─────────────────────────────────
function candlesToReturns(candles: IntradayCandle[]): Map<string, number> {
  const returns = new Map<string, number>();
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev === 0) continue;
    returns.set(candles[i].time, (candles[i].close - prev) / prev);
  }
  return returns;
}

// ── Build correlation matrix ───────────────────────────────────────
function buildMatrix(
  tickers: string[],
  candleMap: Map<string, IntradayCandle[]>
): number[][] {
  const n = tickers.length;
  const returnsMap = new Map<string, Map<string, number>>();

  for (const t of tickers) {
    const candles = candleMap.get(t);
    returnsMap.set(t, candles ? candlesToReturns(candles) : new Map());
  }

  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1; // diagonal
    const ri = returnsMap.get(tickers[i])!;
    for (let j = i + 1; j < n; j++) {
      const rj = returnsMap.get(tickers[j])!;
      // Overlapping timestamps
      const commonKeys: string[] = [];
      for (const key of ri.keys()) {
        if (rj.has(key)) commonKeys.push(key);
      }
      const xs = commonKeys.map(k => ri.get(k)!);
      const ys = commonKeys.map(k => rj.get(k)!);
      const corr = pearson(xs, ys);
      const val = corr ?? 0;
      matrix[i][j] = val;
      matrix[j][i] = val;
    }
  }

  return matrix;
}

// ── Skeleton grid ──────────────────────────────────────────────────
function SkeletonGrid({ count }: { count: number }) {
  const rows = Math.min(count, 8);
  return (
    <div className="space-y-4">
      {/* Title skeleton */}
      <div className="h-5 w-48 rounded bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
      {/* Grid skeleton */}
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `60px repeat(${rows}, 48px)` }}>
          {/* Header row */}
          <div />
          {Array.from({ length: rows }).map((_, i) => (
            <div key={`h-${i}`} className="h-6 rounded bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
          ))}
          {/* Data rows */}
          {Array.from({ length: rows }).map((_, r) => (
            <Fragment key={`row-${r}`}>
              <div className="h-10 w-14 rounded bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
              {Array.from({ length: rows }).map((_, c) => (
                <div key={`c-${r}-${c}`} className="h-10 rounded bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Color legend bar ───────────────────────────────────────────────
function ColorLegend() {
  // Build CSS linear gradient from -1 to +1
  const stops: string[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const val = -1 + (2 * i) / steps;
    stops.push(correlationColor(val));
  }
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;

  return (
    <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-500 dark:text-rh-muted">
      <span className="font-medium">-1.0</span>
      <div className="flex-1 h-3 rounded-full" style={{ background: gradient }} />
      <span className="font-medium">+1.0</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function CorrelationHeatmap({ holdings }: CorrelationHeatmapProps) {
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<number[][] | null>(null);
  const [tickers, setTickers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    row: number;
    col: number;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const tickerList = useMemo(
    () => holdings.map(h => h.ticker).sort(),
    [holdings]
  );

  const fetchData = useCallback(async () => {
    if (tickerList.length < 2) {
      setTickers(tickerList);
      setMatrix(tickerList.length === 1 ? [[1]] : []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const candleMap = new Map<string, IntradayCandle[]>();

      // Fetch candles in parallel, batched to avoid overwhelming the API
      const batchSize = 6;
      for (let i = 0; i < tickerList.length; i += batchSize) {
        const batch = tickerList.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(t => getHourlyCandles(t, '1M'))
        );
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            candleMap.set(batch[idx], result.value);
          }
        });
      }

      // Filter tickers with actual data
      const validTickers = tickerList.filter(t => {
        const candles = candleMap.get(t);
        return candles && candles.length >= 3;
      });

      if (validTickers.length < 2) {
        setError('Not enough intraday data to compute correlations.');
        setTickers([]);
        setMatrix(null);
        setLoading(false);
        return;
      }

      const m = buildMatrix(validTickers, candleMap);
      setTickers(validTickers);
      setMatrix(m);
    } catch (e) {
      console.error('Correlation heatmap error:', e);
      setError('Failed to load correlation data.');
    } finally {
      setLoading(false);
    }
  }, [tickerList]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchData();
  }, [fetchData]);

  // Handle mouse move on grid cells
  const handleCellMouse = (
    row: number,
    col: number,
    e: React.MouseEvent
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      row,
      col,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleCellLeave = () => setTooltip(null);

  // Determine cell size based on ticker count
  const cellSize = tickers.length > 12 ? 40 : tickers.length > 8 ? 48 : 56;
  const labelWidth = 56;

  if (loading) {
    return (
      <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm p-6
                      dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06]">
        <SkeletonGrid count={tickerList.length || 5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm p-6
                      dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-rh-text mb-2">
          Correlation Heatmap
        </h3>
        <p className="text-xs text-gray-500 dark:text-rh-muted">{error}</p>
      </div>
    );
  }

  if (!matrix || tickers.length < 2) {
    return (
      <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm p-6
                      dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-rh-text mb-2">
          Correlation Heatmap
        </h3>
        <p className="text-xs text-gray-500 dark:text-rh-muted">
          Add at least 2 holdings to see correlations.
        </p>
      </div>
    );
  }

  const n = tickers.length;

  return (
    <div
      ref={containerRef}
      className="relative bg-white border border-gray-200/60 rounded-2xl shadow-sm p-6
                 dark:bg-white/[0.04] dark:backdrop-blur-sm dark:border-white/[0.06]"
    >
      <h3 className="text-sm font-semibold text-gray-900 dark:text-rh-text mb-1">
        Correlation Heatmap
      </h3>
      <p className="text-[11px] text-gray-400 dark:text-rh-muted mb-4">
        Pearson correlation of 1-month hourly price returns
      </p>

      {/* Scrollable grid area */}
      <div className="overflow-x-auto pb-2">
        <div
          className="inline-grid gap-[2px]"
          style={{
            gridTemplateColumns: `${labelWidth}px repeat(${n}, ${cellSize}px)`,
          }}
        >
          {/* Top-left empty corner */}
          <div />

          {/* Column headers */}
          {tickers.map(t => (
            <div
              key={`ch-${t}`}
              className="flex items-end justify-center pb-1"
              style={{ height: cellSize }}
            >
              <span className="text-[10px] font-medium text-gray-500 dark:text-rh-muted leading-none select-none"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {t}
              </span>
            </div>
          ))}

          {/* Rows */}
          {tickers.map((rowTicker, ri) => (
            <Fragment key={`row-${rowTicker}`}>
              {/* Row label */}
              <div
                className="flex items-center justify-end pr-2"
                style={{ height: cellSize }}
              >
                <span className="text-[10px] font-medium text-gray-500 dark:text-rh-muted truncate select-none">
                  {rowTicker}
                </span>
              </div>

              {/* Cells */}
              {tickers.map((_colTicker, ci) => {
                const val = matrix[ri][ci];
                const isDiag = ri === ci;
                return (
                  <div
                    key={`cell-${ri}-${ci}`}
                    className="relative flex items-center justify-center rounded-sm cursor-default transition-transform hover:scale-105 hover:z-10"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: correlationColor(val),
                      opacity: isDiag ? 0.35 : 1,
                    }}
                    onMouseEnter={e => handleCellMouse(ri, ci, e)}
                    onMouseMove={e => handleCellMouse(ri, ci, e)}
                    onMouseLeave={handleCellLeave}
                  >
                    <span
                      className="text-[10px] font-mono font-semibold select-none"
                      style={{
                        color: Math.abs(val) > 0.5 ? '#fff' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {val >= 0 ? '+' : ''}{val.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg whitespace-nowrap"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 36,
          }}
        >
          {tickers[tooltip.row]} vs {tickers[tooltip.col]}:{' '}
          <span className="font-bold">
            {matrix[tooltip.row][tooltip.col] >= 0 ? '+' : ''}
            {matrix[tooltip.row][tooltip.col].toFixed(2)}
          </span>
        </div>
      )}

      {/* Color legend */}
      <ColorLegend />
    </div>
  );
}
