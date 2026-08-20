import { describe, it, expect } from 'vitest';
import { isDeadListing, DEAD_QUOTE_AGE_SECONDS } from './DelistedNotice';

const DAY = 24 * 60 * 60;

describe('isDeadListing', () => {
  it('treats a months-old quote as a dead listing', () => {
    // K (Kellanova) as measured 2026-08-20: stale, ~253 days old.
    expect(isDeadListing(21_904_387, true)).toBe(true);
  });

  it('does not fire on a live ticker mid-session', () => {
    // A normal quote during market hours is minutes old, not days.
    expect(isDeadListing(900, false)).toBe(false);
    expect(isDeadListing(5, false)).toBe(false);
  });

  it('does not fire across a long weekend plus holidays', () => {
    // The threshold has to clear the longest legitimate market closure. A
    // Thursday-holiday + weekend + Monday-holiday run tops out near 5 days;
    // anything under the threshold must stay a normal (if stale) quote.
    for (const days of [3, 4, 5, 7, 9]) {
      expect(isDeadListing(days * DAY, true), `${days}d should not read as dead`).toBe(false);
    }
  });

  it('requires BOTH staleness and age — age alone is not enough', () => {
    // isStale is the API's own judgement; a large age without it means the
    // quote is still considered current and we should not override that.
    expect(isDeadListing(30 * DAY, false)).toBe(false);
    expect(isDeadListing(30 * DAY, true)).toBe(true);
  });

  it('is safe when the field is missing entirely', () => {
    expect(isDeadListing(undefined, true)).toBe(false);
    expect(isDeadListing(undefined, undefined)).toBe(false);
  });

  it('fires strictly above the threshold, not at it', () => {
    expect(isDeadListing(DEAD_QUOTE_AGE_SECONDS, true)).toBe(false);
    expect(isDeadListing(DEAD_QUOTE_AGE_SECONDS + 1, true)).toBe(true);
  });
});
