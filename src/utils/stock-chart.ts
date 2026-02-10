import { ChartPeriod, StockCandles } from '../types';
import { IntradayCandle } from '../api';

// ── Chart Constants ──────────────────────────────────────────────
export const CHART_W = 800;
export const CHART_H = 280;
export const PAD_TOP = 20;
export const PAD_BOTTOM = 30;
export const PAD_LEFT = 0;
export const PAD_RIGHT = 0;

export const PERIODS: ChartPeriod[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'MAX'];

// ── Data Types ───────────────────────────────────────────────────
export interface DataPoint {
  time: number; // ms timestamp
  label: string;
  price: number;
  volume?: number;
}

// ── Utility Functions ────────────────────────────────────────────

// Snap a timestamp to the nearest clean date boundary if within threshold
export function snapToCleanBoundary(ms: number, visibleRange: number): number {
  const threshold = visibleRange * 0.03;
  const d = new Date(ms);
  const targets: number[] = [];
  // Year boundaries
  targets.push(new Date(d.getFullYear(), 0, 1, 12).getTime());
  targets.push(new Date(d.getFullYear() + 1, 0, 1, 12).getTime());
  // Quarter boundaries
  const q = Math.floor(d.getMonth() / 3) * 3;
  targets.push(new Date(d.getFullYear(), q, 1, 12).getTime());
  targets.push(new Date(d.getFullYear(), q + 3, 1, 12).getTime());
  // Month boundaries
  targets.push(new Date(d.getFullYear(), d.getMonth(), 1, 12).getTime());
  targets.push(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).getTime());
  // Week boundary (Monday)
  const dow = d.getDay();
  const toMon = dow === 0 ? 6 : dow - 1;
  targets.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() - toMon, 12).getTime());
  let best = ms, bestDist = threshold;
  for (const t of targets) {
    const dist = Math.abs(t - ms);
    if (dist < bestDist) { bestDist = dist; best = t; }
  }
  return best;
}

export function buildPoints(
  candles: StockCandles | null,
  intradayCandles: IntradayCandle[] | undefined,
  hourlyCandles: IntradayCandle[] | undefined,
  livePrices: { time: string; price: number }[],
  period: ChartPeriod,
  currentPrice: number,
  previousClose: number,
): DataPoint[] {
  if (period === '1D') {
    if (intradayCandles && intradayCandles.length > 0) {
      const pts = intradayCandles.map(c => {
        const d = new Date(c.time);
        return {
          time: d.getTime(),
          label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: c.close,
          volume: c.volume,
        };
      });
      // Prepend a point at previous close just before the first candle
      // so the chart starts with a flat line from the open
      if (pts.length > 0) {
        pts.unshift({
          time: pts[0].time - 1000,
          label: pts[0].label,
          price: previousClose,
          volume: 0,
        });
      }
      // Bridge the gap between delayed candles and live/current data.
      // Polygon candles are ~15 min behind; we interpolate so the chart
      // looks continuous and every point in the gap is hoverable.
      {
        const lastCandleTime = pts[pts.length - 1].time;
        const lastCandlePrice = pts[pts.length - 1].price;

        // Collect live prices newer than the last candle
        const newerLive = livePrices
          .map(lp => ({ time: new Date(lp.time).getTime(), price: lp.price }))
          .filter(lp => lp.time > lastCandleTime);

        // The target we're bridging toward: first live price, or current price
        const now = Date.now();
        const bridgeTarget = newerLive.length > 0
          ? newerLive[0]
          : { time: now, price: currentPrice };
        const gapMs = bridgeTarget.time - lastCandleTime;

        // Fill gaps larger than 90s with interpolated points every 30s
        if (gapMs > 90000) {
          const stepMs = 30000;
          for (let t = lastCandleTime + stepMs; t < bridgeTarget.time; t += stepMs) {
            const ratio = (t - lastCandleTime) / gapMs;
            const price = lastCandlePrice + (bridgeTarget.price - lastCandlePrice) * ratio;
            pts.push({
              time: t,
              label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              price: Math.round(price * 100) / 100,
            });
          }
        }

        // Append actual live price points
        for (const lp of newerLive) {
          pts.push({
            time: lp.time,
            label: new Date(lp.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            price: lp.price,
          });
        }

        // Always extend to current time so the chart reaches "now"
        if (now - pts[pts.length - 1].time > 5000) {
          pts.push({
            time: now,
            label: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            price: currentPrice,
          });
        }
      }
      return pts;
    }
    const pts: DataPoint[] = livePrices.map(p => ({
      time: new Date(p.time).getTime(),
      label: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: p.price,
    }));
    if (pts.length <= 1) {
      const now = Date.now();
      const start = now - 5 * 60000;
      return [
        { time: start, label: '', price: previousClose },
        { time: now, label: 'Now', price: currentPrice },
      ];
    }
    return pts;
  }

  // Use hourly candles for 1W/1M — index-based x-axis eliminates overnight gaps
  // giving smooth, dynamic charts like Robinhood's
  if ((period === '1W' || period === '1M') && hourlyCandles && hourlyCandles.length > 0) {
    const now = new Date();

    // Aggregate hourly volumes into daily averages to eliminate volume bar gaps.
    // Extended-hours candles often have 0 volume; spreading the daily total across
    // all candles ensures every bar renders and relative daily volume stays accurate.
    const dailyVolumes = new Map<string, number>();
    const dailyCounts = new Map<string, number>();
    for (const c of hourlyCandles) {
      const dateKey = new Date(c.time).toISOString().slice(0, 10);
      dailyVolumes.set(dateKey, (dailyVolumes.get(dateKey) || 0) + c.volume);
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
    }

    return hourlyCandles.map(c => {
      const d = new Date(c.time);
      const dateKey = d.toISOString().slice(0, 10);
      const avgVolume = Math.round((dailyVolumes.get(dateKey) || 0) / (dailyCounts.get(dateKey) || 1));
      return {
        time: d.getTime(),
        label: d.getFullYear() !== now.getFullYear()
          ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        price: c.close,
        volume: avgVolume,
      };
    });
  }

  const now = new Date();

  // For all other non-1D periods, always return the FULL daily candle dataset.
  // Period selection controls the initial zoom window, not the data range.
  // This enables seamless zoom across the entire stock history.
  if (!candles || candles.closes.length === 0) return [];

  const pts: DataPoint[] = [];
  for (let i = 0; i < candles.dates.length; i++) {
    // Parse as local noon to avoid UTC date-shift in western timezones
    const d = new Date(candles.dates[i] + 'T12:00:00');
    pts.push({
      time: d.getTime(),
      label: d.getFullYear() !== now.getFullYear()
        ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      price: candles.closes[i],
      volume: candles.volumes[i],
    });
  }
  return pts;
}

export function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

// ── SMA calculation ──────────────────────────────────────────────
export const MA_PERIODS = [5, 10, 50, 100, 200] as const;
export type MAPeriod = typeof MA_PERIODS[number];

export const MA_COLORS: Record<MAPeriod, string> = {
  5: '#F59E0B',   // amber
  10: '#8B5CF6',  // violet
  50: '#3B82F6',  // blue
  100: '#EC4899', // pink
  200: '#10B981', // emerald
};

export function calcSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    result.push(i >= period - 1 ? sum / period : null);
  }
  return result;
}

// ── MA Breach Signal Detection ────────────────────────────────────

export interface BreachEvent {
  index: number;
  maPeriods: MAPeriod[];       // which MAs were breached on this candle
  price: number;
  maValues: Partial<Record<MAPeriod, number>>; // MA values at breach point
}

export function detectAllBreaches(
  prices: number[],
  maData: { period: MAPeriod; values: (number | null)[] }[],
): BreachEvent[] {
  const wasAbove = new Map<MAPeriod, boolean>();
  for (const ma of maData) wasAbove.set(ma.period, true);

  const events: BreachEvent[] = [];
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const breached: MAPeriod[] = [];
    const vals: Partial<Record<MAPeriod, number>> = {};

    for (const ma of maData) {
      const v = ma.values[i] ?? null;
      if (v === null) continue;
      vals[ma.period] = v;
      const isAbove = p >= v;
      if (!isAbove && wasAbove.get(ma.period)) breached.push(ma.period);
      wasAbove.set(ma.period, isAbove);
    }

    if (breached.length > 0) {
      events.push({ index: i, maPeriods: breached, price: p, maValues: vals });
    }
  }
  return events;
}

// Only these MAs generate signals (short MAs are too noisy)
export const SIGNAL_MA_PERIODS: MAPeriod[] = [5, 10, 50, 100, 200];

export interface BreachCluster {
  index: number;          // representative index (first event in cluster)
  events: BreachEvent[];  // all events in this cluster
  price: number;
}

export function clusterBreaches(events: BreachEvent[], minGap: number): BreachCluster[] {
  if (events.length === 0) return [];
  const clusters: BreachCluster[] = [];
  let current: BreachCluster = { index: events[0].index, events: [events[0]], price: events[0].price };
  for (let i = 1; i < events.length; i++) {
    if (events[i].index - current.events[current.events.length - 1].index <= minGap) {
      current.events.push(events[i]);
    } else {
      clusters.push(current);
      current = { index: events[i].index, events: [events[i]], price: events[i].price };
    }
  }
  clusters.push(current);
  return clusters;
}

// ── Golden / Death Cross Detection ───────────────────────────────

export interface CrossEvent {
  index: number;
  type: 'golden' | 'death';
  ma100: number;
  ma200: number;
  price: number;
}

export const CROSS_EPSILON = 0.0001;

export const CROSS_COLORS = {
  golden: '#FFD700',  // gold
  death: '#9CA3AF',   // gray
} as const;

export function detectCrosses(
  prices: number[],
  ma100Values: (number | null)[],
  ma200Values: (number | null)[],
): CrossEvent[] {
  const events: CrossEvent[] = [];
  let prevDiff: number | null = null;

  for (let i = 0; i < prices.length; i++) {
    const ma100 = ma100Values[i];
    const ma200 = ma200Values[i];
    if (ma100 === null || ma200 === null) { prevDiff = null; continue; }

    const currDiff = ma100 - ma200;

    // Only mark actual crossover transitions — not inherited state from before the visible range
    if (prevDiff !== null) {
      if (prevDiff <= CROSS_EPSILON && currDiff > CROSS_EPSILON) {
        events.push({ index: i, type: 'golden', ma100, ma200, price: prices[i] });
      } else if (prevDiff >= -CROSS_EPSILON && currDiff < -CROSS_EPSILON) {
        events.push({ index: i, type: 'death', ma100, ma200, price: prices[i] });
      }
    }
    prevDiff = currDiff;
  }
  return events;
}

export function clusterColor(cluster: BreachCluster): string {
  // Use highest-priority MA color (200 > 100 > 50)
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return MA_COLORS[200];
  if (allPeriods.has(100)) return MA_COLORS[100];
  if (allPeriods.has(50)) return MA_COLORS[50];
  const first = allPeriods.values().next().value;
  return first ? MA_COLORS[first] : '#F59E0B';
}

// Signal hierarchy: MA200 > MA100 > MA50
export function clusterPillSize(cluster: BreachCluster): number {
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return 18;
  if (allPeriods.has(100)) return 15;
  return 13;
}

export function clusterGlowOpacity(cluster: BreachCluster): number {
  const allPeriods = new Set(cluster.events.flatMap(e => e.maPeriods));
  if (allPeriods.has(200)) return 0.25;
  if (allPeriods.has(100)) return 0.18;
  return 0.12;
}
