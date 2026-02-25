import { describe, expect, it } from 'vitest';
import { shouldShowEstimatedBadge } from './PortfolioValueChart';

describe('shouldShowEstimatedBadge', () => {
  it('returns false for 1D regardless of confidence flags', () => {
    expect(
      shouldShowEstimatedBadge('1D', [{ confidence: 10, estimated: true }], true, 80),
    ).toBe(false);
  });

  it('returns true when chart-level estimated flag is set on non-1D', () => {
    expect(
      shouldShowEstimatedBadge('1W', [{ confidence: 95, estimated: false }], true, 80),
    ).toBe(true);
  });

  it('returns true when any point confidence is below threshold', () => {
    expect(
      shouldShowEstimatedBadge('1M', [{ confidence: 79 }, { confidence: 92 }], false, 80),
    ).toBe(true);
  });

  it('returns false when all points are above threshold and not estimated', () => {
    expect(
      shouldShowEstimatedBadge('3M', [{ confidence: 90 }, { confidence: 80, estimated: false }], false, 80),
    ).toBe(false);
  });
});

