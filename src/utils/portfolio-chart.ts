import { BenchmarkCandle } from '../api';

// ── Market session type ──────────────────────────────────────────
export type MarketSessionProp = 'PRE' | 'REG' | 'POST' | 'CLOSED';

// ── Market status (US equities, America/New_York) ────────────────
export function getMarketStatus(): { isOpen: boolean } {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return { isOpen: false };
  const mins = et.getHours() * 60 + et.getMinutes();
  // 9:30 AM = 570, 4:00 PM = 960
  return { isOpen: mins >= 570 && mins < 960 };
}

// ── Chart constants ──────────────────────────────────────────────
export const CHART_W = 800;
export const CHART_H = 260;
export const PAD_TOP = 24;
export const PAD_BOTTOM = 12;
export const PAD_LEFT = 0;
export const PAD_RIGHT = 0;

// ── Formatting helpers ─────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatShortDate(ms: number, is1D: boolean): string {
  const d = new Date(ms);
  if (is1D) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Measurement math (pure, deterministic) ─────────────────────────

export interface MeasurementResult {
  startValue: number;
  endValue: number;
  startTime: number;
  endTime: number;
  dollarChange: number;
  percentChange: number;
  daysBetween: number;
}

export function computeMeasurement(
  startValue: number, endValue: number,
  startTime: number, endTime: number,
): MeasurementResult | null {
  if (startValue === 0) return null;
  return {
    startValue,
    endValue,
    startTime,
    endTime,
    dollarChange: endValue - startValue,
    percentChange: ((endValue - startValue) / startValue) * 100,
    daysBetween: Math.round(Math.abs(endTime - startTime) / 86400000),
  };
}

// ── Benchmark lookup ───────────────────────────────────────────────

/** Find the index of the nearest candle to a given timestamp */
export function findBenchmarkIndex(candles: BenchmarkCandle[], targetMs: number): number | null {
  if (candles.length === 0) return null;
  let best = 0;
  let bestDist = Math.abs(candles[0].time - targetMs);
  for (let i = 1; i < candles.length; i++) {
    const dist = Math.abs(candles[i].time - targetMs);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  // Only match if within 3 days
  if (bestDist > 3 * 86400000) return null;
  return best;
}

/**
 * Compute benchmark (SPY) return between two timestamps.
 * Uses the previous trading day's close as the baseline for the start date,
 * matching how brokerages calculate daily returns. This avoids the bug where
 * same-day or adjacent-day measurements both snap to the same daily candle
 * and produce 0% return.
 */
export function computeBenchmarkReturn(
  candles: BenchmarkCandle[],
  startMs: number,
  endMs: number,
): { spyReturn: number } | null {
  const startIdx = findBenchmarkIndex(candles, startMs);
  const endIdx = findBenchmarkIndex(candles, endMs);
  if (startIdx === null || endIdx === null) return null;

  // Use the close BEFORE the start date as baseline (previous trading day)
  const baseIdx = startIdx > 0 ? startIdx - 1 : startIdx;
  const baseClose = candles[baseIdx].close;
  const endClose = candles[endIdx].close;
  if (baseClose === 0) return null;

  // If start and end resolve to the same candle, use prev close → that close
  // This gives the actual daily return for that trading day
  return { spyReturn: ((endClose - baseClose) / baseClose) * 100 };
}

// ── Snap-to-nearest helper ─────────────────────────────────────────

export function snapToNearest(
  mouseX: number,
  points: { time: number; value: number }[],
  toXFn: (i: number) => number,
): number {
  let best = 0;
  let bestDist = Math.abs(toXFn(0) - mouseX);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(toXFn(i) - mouseX);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  return best;
}
