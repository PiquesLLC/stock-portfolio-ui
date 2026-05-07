// DailyReportSummary — compact preview of today's brief for the home /
// portfolio dashboard. Replaces HomeBriefingCard and reads from the same
// canonical /insights/daily-report endpoint that the modal + Insights tab
// use, so all three surfaces show the same content.
//
// Behavior:
//   - Quietly hides itself when there is nothing to show (e.g. user dismissed
//     it earlier today, or the report has not been generated yet).
//   - Click "View full brief" → calls onOpenFull, which the parent wires up
//     to opening the auto-popup DailyReportModal.
import { useEffect, useState } from 'react';
import { getDailyReport } from '../api';
import { DailyReportResponse } from '../types';

interface Props {
  onOpenFull: () => void;
  onTickerClick?: (ticker: string) => void;
  displayName?: string;
  /** Hide the card if the daily report modal was already opened this view. */
  briefingOpened?: boolean;
}

const DISMISS_KEY = 'nala_briefing_dismissed';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function DailyReportSummary({ onOpenFull, onTickerClick, displayName, briefingOpened }: Props) {
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === todayKey());

  useEffect(() => {
    let cancelled = false;
    getDailyReport()
      .then((r) => {
        if (cancelled) return;
        // Only show the card when there's actual content (not an in-flight fallback)
        if (r.topStories && r.topStories.length > 0) setReport(r);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (dismissed || briefingOpened) return null;
  if (!loading && !report) return null;

  const greeting = getGreeting();
  const firstName = displayName?.split(' ')[0] || displayName;

  if (loading) {
    return (
      <div className="bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-32 bg-gray-200/40 dark:bg-white/[0.06] rounded animate-pulse" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-2.5 w-full bg-gray-200/30 dark:bg-white/[0.04] rounded animate-pulse" />
          <div className="h-2.5 w-3/4 bg-gray-200/30 dark:bg-white/[0.04] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Pull a headline + a couple of position moves for the preview
  const topStory = report!.topStories[0];
  const moves = (report!.positionMoves ?? []).slice(0, 3);

  return (
    <div className="relative bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4 group">
      {/* Dismiss */}
      <button
        onClick={() => { setDismissed(true); localStorage.setItem(DISMISS_KEY, todayKey()); }}
        className="absolute top-3 right-3 text-rh-light-muted/40 dark:text-rh-muted/30 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="w-0.5 h-10 bg-rh-green rounded-full flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 pr-6">
          <div className="text-[11px] font-medium text-rh-light-muted/60 dark:text-rh-muted/50 mb-1">
            {greeting}{firstName ? `, ${firstName}` : ''} · Today's Brief
          </div>

          {topStory && (
            <p className="text-[13px] font-semibold text-rh-light-text dark:text-rh-text leading-snug">
              {topStory.headline}
            </p>
          )}

          {moves.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {moves.map((m) => (
                <button
                  key={m.ticker}
                  onClick={(e) => { e.stopPropagation(); onTickerClick?.(m.ticker); }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
                >
                  <span className="text-rh-light-text dark:text-rh-text font-semibold">{m.ticker}</span>
                  <span className={m.changePercent >= 0 ? 'text-rh-green tabular-nums' : 'text-rh-red tabular-nums'}>
                    {m.changePercent >= 0 ? '+' : ''}{m.changePercent.toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          )}

          {topStory && (
            <p className="mt-1.5 text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed line-clamp-2">
              {topStory.body}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onOpenFull}
              className="text-[11px] font-medium text-rh-green hover:text-rh-green/80 transition-colors"
            >
              View full brief →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
