/**
 * Shown in place of the chart when a listing has stopped reporting prices.
 *
 * WHY: a delisted or acquired ticker still returns a quote — the API freezes the
 * last known bar rather than erroring — but every short chart period comes back
 * EMPTY because there are no recent candles. The result was a live-looking price
 * sitting above a blank chart, which reads as a broken page rather than a dead
 * listing. Measured on K (Kellanova) 2026-08-20: quote $83.44 with
 * quoteAgeSeconds 21,904,387 (~253 days) and 1D/1W/1M/3M/6M/YTD all empty.
 *
 * The price shown is real, just historical. Say so plainly rather than dressing
 * a 253-day-old print as today's.
 */
interface Props {
  ticker: string;
  /** Last known price — genuine, just not current. */
  lastPrice: number;
  /** Epoch seconds of that last print. */
  lastTradedAtSec: number;
}

/** A quote older than this is treated as a dead listing, not a stale fetch. */
export const DEAD_QUOTE_AGE_SECONDS = 10 * 24 * 60 * 60; // 10 days

/**
 * True when a quote has aged past any legitimate market closure. A long weekend
 * plus holidays tops out around 4-5 days, so 10 days cannot be reached by a
 * ticker that is still trading — while a delisted one is months out.
 */
export function isDeadListing(quoteAgeSeconds?: number, isStale?: boolean): boolean {
  if (!isStale || typeof quoteAgeSeconds !== 'number') return false;
  return quoteAgeSeconds > DEAD_QUOTE_AGE_SECONDS;
}

function formatDate(sec: number): string {
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return 'an earlier date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function DelistedNotice({ ticker, lastPrice, lastTradedAtSec }: Props) {
  const when = formatDate(lastTradedAtSec);

  return (
    <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-transparent backdrop-blur-xl p-6 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6 mx-auto mb-3 text-rh-light-text dark:text-white"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>

      <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-1">
        {ticker} is no longer reporting prices
      </p>
      <p className="text-[13px] leading-relaxed text-rh-light-text dark:text-white/80">
        The last price we have is{' '}
        <span className="font-semibold tabular-nums text-rh-light-text dark:text-rh-text">
          ${lastPrice.toFixed(2)}
        </span>{' '}
        from {when}. This usually means the company was acquired, merged, or delisted.
      </p>
      <p className="text-[11px] text-rh-light-text dark:text-white/80 mt-3">
        Any position you hold is still valued at that last price.
      </p>
    </div>
  );
}
