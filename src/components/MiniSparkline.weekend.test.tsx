import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MiniSparkline } from './MiniSparkline';

vi.mock('../api', () => ({
  getIntradayCandles: vi.fn(),
  getHourlyCandles: vi.fn(),
  getDailyCandles: vi.fn(),
}));

import { getIntradayCandles } from '../api';

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

    (getIntradayCandles as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(fridayCandles);

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
});
