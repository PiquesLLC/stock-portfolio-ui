import { describe, it, expect } from 'vitest';
import { calcSMA, computeCandleMaValues, periodStartClose, periodStartDate, trimToPeriodWindow } from './stock-chart';
import type { IntradayCandle } from '../api';

// Helper: make a daily history of N days ending today at 4:00 PM ET,
// with prices rising linearly. Returns { dates, closes }.
function makeDailyHistory(days: number, startPrice = 100, step = 1) {
  const dates: string[] = [];
  const closes: number[] = [];
  const now = new Date();
  now.setUTCHours(20, 0, 0, 0); // ~4pm ET
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
    closes.push(startPrice + (days - 1 - i) * step);
  }
  return { dates, closes };
}

// Helper: build intraday candles — K bars per day for the last `tradingDays` days.
// All bars for the same calendar date share that date.
function makeIntradayCandles(tradingDays: number, barsPerDay: number): IntradayCandle[] {
  const candles: IntradayCandle[] = [];
  const now = new Date();
  for (let d = tradingDays - 1; d >= 0; d--) {
    for (let b = 0; b < barsPerDay; b++) {
      const base = new Date(now.getTime() - d * 86400_000);
      // Spread bars across the trading day
      base.setUTCHours(13 + Math.floor(b * 7 / barsPerDay), (b * 15) % 60, 0, 0);
      candles.push({
        time: base.toISOString(),
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
      });
    }
  }
  return candles;
}

describe('calcSMA (existing)', () => {
  it('returns nulls for leading indices before period fills', () => {
    const out = calcSMA([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2); // (1+2+3)/3
    expect(out[3]).toBeCloseTo(3); // (2+3+4)/3
    expect(out[4]).toBeCloseTo(4); // (3+4+5)/3
  });

  it('returns number for every index when prices.length >= period', () => {
    const out = calcSMA([10, 20, 30, 40], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(25);
    expect(out[3]).toBeCloseTo(35);
  });
});

describe('computeCandleMaValues (bug: MA legend disappears when hovering right half of candle chart)', () => {
  it('returns an array the same length as candleData', () => {
    const daily = makeDailyHistory(300);
    const candles = makeIntradayCandles(22, 27); // ~594 candles for 1M/15m
    const out = computeCandleMaValues(candles, daily, 50);
    expect(out).toHaveLength(candles.length);
  });

  it('aligns each candle to the daily SMA value for that candle\'s calendar date', () => {
    const daily = makeDailyHistory(300);
    const candles = makeIntradayCandles(22, 27);
    const out = computeCandleMaValues(candles, daily, 50);
    const sma50 = calcSMA(daily.closes, 50);

    // Build date → daily index map the same way the production code does
    const dateToIdx = new Map<string, number>();
    for (let i = 0; i < daily.dates.length; i++) dateToIdx.set(daily.dates[i], i);

    for (let ci = 0; ci < candles.length; ci++) {
      const d = new Date(candles[ci].time);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dailyIdx = dateToIdx.get(dateStr);
      const expected = dailyIdx !== undefined ? sma50[dailyIdx] : null;
      expect(out[ci]).toBe(expected);
    }
  });

  it('returns a non-null MA value for the LAST candle when daily history has enough data (regression: right-edge legend bug)', () => {
    // Reproduces the reported bug: hovering the right portion of a 1M/15m chart showed
    // no MA readout because hoverIndex (candle-aligned, ~500) exceeded points.length (~150).
    const daily = makeDailyHistory(300); // plenty of history for all MAs
    const candles = makeIntradayCandles(22, 27); // ~594 intraday candles

    for (const period of [5, 10, 50, 100, 200]) {
      const out = computeCandleMaValues(candles, daily, period);
      // The very last candle should have a computable MA (its calendar date is in daily history).
      expect(out[out.length - 1]).not.toBeNull();
      expect(typeof out[out.length - 1]).toBe('number');
      // And a candle deep in the right half (past the old points-based cutoff) should also be non-null.
      const rightHalfIdx = Math.floor(candles.length * 0.85);
      expect(out[rightHalfIdx]).not.toBeNull();
    }
  });

  it('returns null for candles whose date is not present in dailyCandles', () => {
    const daily = makeDailyHistory(30); // only last 30 days
    // Fabricate a candle 10 years in the future — date not in daily.dates
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    const candles: IntradayCandle[] = [
      { time: future.toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 0 },
    ];
    const out = computeCandleMaValues(candles, daily, 5);
    expect(out[0]).toBeNull();
  });

  it('returns null for MA200 when daily history is shorter than 200 bars', () => {
    const daily = makeDailyHistory(50); // insufficient for MA200
    const candles = makeIntradayCandles(5, 4);
    const out = computeCandleMaValues(candles, daily, 200);
    for (const v of out) expect(v).toBeNull();
  });

  it('multiple intraday candles on the same calendar day share the same daily SMA value', () => {
    const daily = makeDailyHistory(100);
    const candles = makeIntradayCandles(3, 10); // 3 days × 10 bars
    const out = computeCandleMaValues(candles, daily, 5);
    // First 10 candles all fall on the same (earliest) day
    const firstDayVals = out.slice(0, 10);
    for (const v of firstDayVals) expect(v).toBe(firstDayVals[0]);
    // Last 10 candles all fall on the same (latest) day
    const lastDayVals = out.slice(-10);
    for (const v of lastDayVals) expect(v).toBe(lastDayVals[0]);
  });

  it('handles empty candleData', () => {
    const daily = makeDailyHistory(50);
    const out = computeCandleMaValues([], daily, 5);
    expect(out).toEqual([]);
  });

  it('returns array of nulls when dailyCandles is empty', () => {
    const candles = makeIntradayCandles(2, 3);
    const out = computeCandleMaValues(candles, { dates: [], closes: [] }, 5);
    expect(out).toHaveLength(candles.length);
    for (const v of out) expect(v).toBeNull();
  });
});

describe('periodStartClose (shared chart/Compare period anchor)', () => {
  it('returns null for 1D and for empty candle data', () => {
    expect(periodStartClose('1D', makeDailyHistory(60))).toBeNull();
    expect(periodStartClose('1W', { dates: [], closes: [] })).toBeNull();
  });

  it('anchors 1W at the close BEFORE the window, not the first close inside it (RDDT regression)', () => {
    // Model the RDDT 2026-07-07 shape with the -7d cutoff landing in a
    // "weekend" gap (no candles at back-7/-6), which makes the old and new
    // anchors provably diverge at ANY test run time: pre-gap closes ~178,
    // the first post-gap day rallies to 197.76, then ~196-197 after.
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const dates: string[] = [];
    const closes: number[] = [];
    for (const back of [9, 8, 5, 4, 3, 2, 1, 0]) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      dates.push(fmt.format(d));
      closes.push(back >= 8 ? 178 : back === 5 ? 197.76 : 196.67);
    }
    const start = periodStartClose('1W', { dates, closes })!;
    // Baseline must be the ~178 close from before the window — the old
    // first-close-INSIDE anchor picked the 197.76 rally close and made a
    // clearly-up week read as -0.55%.
    expect(start).toBe(178);
    const latest = closes[closes.length - 1];
    expect((latest - start) / start).toBeGreaterThan(0); // week reads positive
  });

  it('YTD anchors at the prior year\'s final close when available', () => {
    const year = new Date().getFullYear();
    const dates = [`${year - 1}-12-30`, `${year - 1}-12-31`, `${year}-01-02`, `${year}-01-03`];
    const closes = [100, 105, 110, 120];
    // Baseline = Dec 31 close (105), not Jan 2's close (110).
    expect(periodStartClose('YTD', { dates, closes })).toBe(105);
  });

  it('MAX anchors at the earliest available close', () => {
    const daily = makeDailyHistory(120, 50, 2);
    expect(periodStartClose('MAX', daily)).toBe(daily.closes[0]);
  });

  it('anchors at a more recent close as the lookback shortens (calendar-anchored, monotonic)', () => {
    const daily = makeDailyHistory(400, 100, 1); // consecutive days rising 100..499
    const wk = periodStartClose('1W', daily)!;
    const mo = periodStartClose('1M', daily)!;
    const q3 = periodStartClose('3M', daily)!;
    const six = periodStartClose('6M', daily)!;
    const yr = periodStartClose('1Y', daily)!;
    const max = periodStartClose('MAX', daily)!;
    // Shorter lookback → later start date → higher close in a rising series.
    expect(wk).toBeGreaterThanOrEqual(mo);
    expect(mo).toBeGreaterThanOrEqual(q3);
    expect(q3).toBeGreaterThanOrEqual(six);
    expect(six).toBeGreaterThanOrEqual(yr);
    expect(yr).toBeGreaterThanOrEqual(max);
    // 6M must anchor ~6 calendar months back, NOT fall through to inception —
    // guards the bug where the components' switch omitted 6M (→ closes[0]).
    expect(six).toBeGreaterThan(max);
    expect(max).toBe(daily.closes[0]);
    expect(daily.closes).toContain(wk);
  });
});

describe('trimToPeriodWindow (1W/1M plotted window)', () => {
  const etDate = (t: string | number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));
  const etDays = (series: { time: string | number }[]) => new Set(series.map(c => etDate(c.time)));

  it('drops the anchor day so the line starts where the header starts (AAPL 2026-08-11 regression)', () => {
    // The header quotes against the anchor day's CLOSE. Replotting that whole day
    // put its own session — which can open far below its close — inside the
    // window, so the chart drew green under a red "-2.07 (-0.67%) Past Week".
    const daily = makeDailyHistory(10);
    const anchorDate = periodStartDate('1W', daily)!;
    // The baseline and the trim must come off the SAME candle.
    expect(periodStartClose('1W', daily)).toBe(daily.closes[daily.dates.indexOf(anchorDate)]);

    const hourly = makeIntradayCandles(10, 4);
    // The anchor day really was being plotted — otherwise this pins nothing.
    expect(etDays(hourly).has(anchorDate)).toBe(true);

    const trimmed = trimToPeriodWindow(hourly, '1W', daily);
    expect(etDays(trimmed).has(anchorDate)).toBe(false); // …and now it isn't
    // Everything after it survives, in order, and nothing before it sneaks back.
    expect(trimmed).toEqual(hourly.filter(c => etDate(c.time) > anchorDate));
    expect([...etDays(trimmed)].every(d => d > anchorDate)).toBe(true);
    expect(trimmed.length).toBeGreaterThan(1);
  });

  it('trims a candlestick series (numeric ms timestamps) the same way', () => {
    const daily = makeDailyHistory(10);
    const anchorDate = periodStartDate('1W', daily)!;
    // Candle mode carries `time` as ms, not an ISO string.
    const candles = makeIntradayCandles(10, 4).map(c => ({ ...c, time: new Date(c.time).getTime() }));
    const trimmed = trimToPeriodWindow(candles, '1W', daily);
    expect(etDays(trimmed).has(anchorDate)).toBe(false);
    expect(trimmed.length).toBeLessThan(candles.length);
  });

  it('leaves daily-candle periods and un-anchorable series untouched', () => {
    const daily = makeDailyHistory(400);
    const hourly = makeIntradayCandles(10, 4);
    expect(trimToPeriodWindow(hourly, '3M', daily)).toBe(hourly);
    expect(trimToPeriodWindow(hourly, '1D', daily)).toBe(hourly);
    expect(trimToPeriodWindow(hourly, '1W', { dates: [], closes: [] })).toBe(hourly);
    expect(trimToPeriodWindow(hourly, '1W', null)).toBe(hourly);
    // Identity, not just equality: the chart passes a shared empty sentinel whose
    // stable reference keeps a downstream useMemo from recomputing every render.
    const empty: IntradayCandle[] = [];
    expect(trimToPeriodWindow(empty, '1W', daily)).toBe(empty);
  });

  it('keeps the full series rather than leave a one-point chart', () => {
    // An hourly feed that stops on/before the anchor day — trimming empties it.
    const daily = makeDailyHistory(30);
    const anchorDate = periodStartDate('1W', daily)!;
    const hourly = makeIntradayCandles(30, 4).filter(c => etDate(c.time) <= anchorDate);
    expect(hourly.length).toBeGreaterThan(1);
    expect(trimToPeriodWindow(hourly, '1W', daily)).toBe(hourly);
  });
});
