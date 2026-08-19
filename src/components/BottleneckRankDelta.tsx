/**
 * Weekly rank-movement chip for Bottlenecks.
 *
 * Deliberately NOT green/red. In this design system green and red carry
 * gain/loss and nothing else, and a rank move is neither — it is a change in
 * placement driven by relative price movement. Colouring it green would also
 * read as endorsement, which is exactly the merit framing this section avoids:
 * the chip reports that something MOVED, not that it is good.
 */
interface Props {
  /** prevRank - rank; positive = moved up. Null/0 renders nothing. */
  delta: number | null | undefined;
  /** Sector name, for the screen-reader label. */
  sector?: string;
  className?: string;
}

export function BottleneckRankDelta({ delta, sector, className = '' }: Props) {
  if (delta == null || delta === 0) return null;

  const up = delta > 0;
  const magnitude = Math.abs(delta);
  // "in the latest weekly ranking" rather than "this week" — the comparison is
  // against the most recent SCORED week, which isn't always the prior one.
  const label = `Moved ${up ? 'up' : 'down'} ${magnitude} place${magnitude === 1 ? '' : 's'}${
    sector ? ` in ${sector}` : ''
  } in the latest weekly ranking`;

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-0.5 rounded-full border border-gray-200/40 dark:border-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rh-light-text dark:text-white ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-2 h-2"
      >
        {up ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
      {magnitude}
    </span>
  );
}
