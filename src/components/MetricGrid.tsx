/**
 * The key-figure row that opens a financial panel. Shared so Financials and
 * Earnings lead with the same shape: label, value, and an optional sub-line
 * naming the inputs behind a derived figure.
 */

export interface Metric {
  label: string;
  value: string;
  /** Sub-line for the inputs behind a derived figure. */
  detail?: string;
  /** Colour by sign — only where direction genuinely reads as good or bad. */
  signed?: number | null;
}

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
      {metrics.map(m => (
        <div key={m.label} className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-rh-light-text/70 dark:text-white/80 truncate">
            {m.label}
          </div>
          <div
            className={`text-sm font-semibold tabular-nums mt-0.5 truncate ${
              m.signed == null || m.signed === 0
                ? 'text-rh-light-text dark:text-rh-text'
                : m.signed > 0
                  ? 'text-rh-green'
                  : 'text-rh-red'
            }`}
          >
            {m.value}
          </div>
          {m.detail && (
            // The one step below full white in the whole app: a caption sitting
            // directly under the value it describes. Still #ccc, not grey.
            <div className="text-[10px] text-rh-light-text dark:text-white/80 tabular-nums truncate mt-0.5">
              {m.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
