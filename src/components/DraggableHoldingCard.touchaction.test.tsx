import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Reorder } from 'framer-motion';
import { DraggableHoldingCard } from './DraggableHoldingCard';

vi.mock('./StockLogo', () => ({
  StockLogo: ({ ticker }: { ticker: string }) => <div data-testid={`logo-${ticker}`} />,
}));

vi.mock('./MiniSparkline', () => ({
  MiniSparkline: () => <div data-testid="sparkline" />,
}));

const baseHolding = {
  id: 'h-1',
  ticker: 'AAPL',
  shares: 10,
  averageCost: 150,
  currentPrice: 180,
  currentValue: 1800,
  dayChange: 10,
  dayChangePercent: 1.5,
  profitLoss: 300,
  profitLossPercent: 20,
  priceUnavailable: false,
  isRepricing: false,
  priceIsStale: false,
  // Holding type carries more fields, but DraggableHoldingCard only reads the
  // ones above for the rendering paths covered by this regression test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('DraggableHoldingCard touch-action regression', () => {
  it('defaults touchAction to manipulation so tap-scroll keeps working; flips to none only during drag', () => {
    // The card uses long-press-then-drag. To preserve native page scrolling
    // when the user just taps and drags, default touchAction must NOT be
    // 'none' — we want the browser to handle scroll until the 350ms long-press
    // fires, at which point we flip to 'none' (and the native touchmove
    // listener also preventDefaults to stop in-progress browser scroll).
    // Regression guard: if someone reverts to 'none' default, this test fails.
    const { container } = render(
      <Reorder.Group axis="y" values={['h-1']} onReorder={vi.fn()} as="div">
        <DraggableHoldingCard
          holding={baseHolding}
          idx={0}
          displayMetric="dayChangePct"
          chartPeriod="1D"
          getMetricDisplay={() => ({ text: '+1.5%', isPositive: true, isNeutral: false })}
          formatCurrency={(v) => `$${v.toFixed(2)}`}
          dragActiveId={null}
        />
      </Reorder.Group>,
    );

    // Reorder.Item renders as <li> by default; the inline style we care about
    // lives on it. Default state (no drag active) must allow native scroll.
    const item = container.querySelector('li');
    expect(item).toBeTruthy();
    expect((item as HTMLElement).style.touchAction).toBe('manipulation');
  });

  it('does not silently swap to a value that breaks framer-motion drag', () => {
    // The fix relies on the inline touchAction being only one of two values:
    // 'manipulation' (default) or 'none' (drag active). Anything else
    // ('pan-y', 'auto', '') would either break drag or break scroll.
    const { container } = render(
      <Reorder.Group axis="y" values={['h-1']} onReorder={vi.fn()} as="div">
        <DraggableHoldingCard
          holding={baseHolding}
          idx={0}
          displayMetric="dayChangePct"
          chartPeriod="1D"
          getMetricDisplay={() => ({ text: '+1.5%', isPositive: true, isNeutral: false })}
          formatCurrency={(v) => `$${v.toFixed(2)}`}
          dragActiveId={null}
        />
      </Reorder.Group>,
    );
    const item = container.querySelector('li');
    expect((item as HTMLElement).style.touchAction).toMatch(/^(manipulation|none)$/);
  });
});
