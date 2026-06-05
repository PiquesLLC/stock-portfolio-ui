import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MiniSparkline } from './MiniSparkline';

vi.mock('../api', () => ({
  getIntradayCandlesWithPrevClose: vi.fn(),
  getHourlyCandles: vi.fn(),
  getDailyCandles: vi.fn(),
}));

import { getIntradayCandlesWithPrevClose } from '../api';

describe('MiniSparkline weekend session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Saturday 2026-05-02 16:00 UTC = noon ET
    vi.setSystemTime(new Date('2026-05-02T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders Friday\'s intraday session on Saturday (does not collapse to flat dashed line)', async () => {
    // 20 Friday intraday candles, 09:30 ET → 14:15 ET in 15-min steps
    // 09:30 ET = 13:30 UTC (during EDT)
    const fridayCandles = Array.from({ length: 20 }, (_, i) => {
      const minutes = 13 * 60 + 30 + i * 15; // start 13:30 UTC
      const h = String(Math.floor(minutes / 60)).padStart(2, '0');
      const m = String(minutes % 60).padStart(2, '0');
      const close = 100 + Math.sin(i / 3) * 5; // varying values so range > 0
      return {
        time: new Date(`2026-05-01T${h}:${m}:00Z`).getTime(),
        open: close,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 1000,
      };
    });

    (getIntradayCandlesWithPrevClose as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ candles: fridayCandles, previousClose: 100 });

    // Use unique ticker to bypass module-level cache
    const { container } = render(<MiniSparkline ticker="WKEND-TEST-1" period="1D" />);

    // Wait for fetch + render
    await vi.waitFor(
      () => {
        const path = container.querySelector('path[d]');
        expect(path).toBeTruthy();
        expect(path?.getAttribute('d')?.length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 2000, interval: 50 },
    );

    const paths = Array.from(container.querySelectorAll('path[d]'));
    const allD = paths.map(p => p.getAttribute('d') || '').join(' ');

    // Bug repro: with "today" = Saturday and data = Friday, the today-filter
    // would strip everything → render the flat dashed midline `M{x},{y} L{x},{y}`
    // with zero cubic-bezier (C) commands. After the fix, the smooth line uses
    // many C commands (Catmull-Rom over the 20 sampled points).
    const cCommandCount = (allD.match(/C/g) || []).length;
    expect(cCommandCount).toBeGreaterThan(5);
  });

  it('anchors the 1D line on previousClose (not the first candle) so up/down days are not inverted', async () => {
    // Friday candles oscillate ~95–105. Render twice with previousClose well
    // ABOVE vs well BELOW that band; the left anchor point (first "M x,y" of the
    // path) must follow it — a higher previousClose anchors near the top (small
    // y), a lower one near the bottom (large y). This is the AMD bug: anchoring
    // on the first candle instead of previousClose flips the apparent direction.
    const candles = Array.from({ length: 20 }, (_, i) => {
      const minutes = 13 * 60 + 30 + i * 15;
      const h = String(Math.floor(minutes / 60)).padStart(2, '0');
      const m = String(minutes % 60).padStart(2, '0');
      const close = 100 + Math.sin(i / 3) * 5;
      return {
        time: new Date(`2026-05-01T${h}:${m}:00Z`).getTime(),
        open: close, high: close + 0.5, low: close - 0.5, close, volume: 1000,
      };
    });
    (getIntradayCandlesWithPrevClose as unknown as { mockImplementation: (fn: (t: string) => unknown) => void })
      .mockImplementation((ticker: string) =>
        Promise.resolve({ candles, previousClose: ticker === 'PC-HIGH' ? 130 : 80 }));

    const firstAnchorY = async (ticker: string): Promise<number> => {
      const { container, unmount } = render(<MiniSparkline ticker={ticker} period="1D" />);
      let y = NaN;
      await vi.waitFor(() => {
        const d = container.querySelector('path[d]')?.getAttribute('d') || '';
        const match = d.match(/^M[\d.]+,([\d.]+)/);
        expect(match).toBeTruthy();
        y = parseFloat(match![1]);
      }, { timeout: 2000, interval: 50 });
      unmount(); // clear the live-refresh timers so no fake-timer/closure leaks
      return y;
    };

    const highY = await firstAnchorY('PC-HIGH'); // anchor near top → small y
    const lowY = await firstAnchorY('PC-LOW');   // anchor near bottom → large y
    expect(highY).toBeLessThan(lowY);
  });
});
