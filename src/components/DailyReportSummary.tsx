// DailyReportSummary — compact preview of today's brief for the home /
// portfolio dashboard. Mirrors the live-dashboard layout used in the full
// modal but condensed: portfolio block + 3 top movers + "View full brief"
// CTA. No editorial prose, no top-stories cards — matches the TestFlight
// version of "Today's Brief".
//
// Behavior:
//   - Quietly hides itself when there is nothing to show (e.g. user dismissed
//     it earlier today, or the user has no holdings yet).
//   - Click "View full brief" → calls onOpenFull, which the parent wires up
//     to opening the auto-popup DailyReportModal.
import { useEffect, useState } from 'react';
import { getPortfolio } from '../api';
import { Portfolio } from '../types';

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

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function DailyReportSummary({ onOpenFull, onTickerClick, displayName, briefingOpened }: Props) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === todayKey());

  useEffect(() => {
    let cancelled = false;
    getPortfolio()
      .then((p) => { if (!cancelled) setPortfolio(p); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (dismissed || briefingOpened) return null;
  if (!loading && (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0)) return null;

  const greeting = getGreeting();
  const firstName = displayName?.split(' ')[0] || displayName;

  if (loading || !portfolio) {
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

  // Top 3 movers by absolute day-change percent
  const movers = [...(portfolio.holdings ?? [])]
    .filter(h => h.shares > 0 && h.dayChangePercent != null)
    .sort((a, b) => Math.abs(b.dayChangePercent ?? 0) - Math.abs(a.dayChangePercent ?? 0))
    .slice(0, 3);

  const dayUp = portfolio.dayChange >= 0;

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
          <div className="text-[11px] font-medium text-rh-light-muted/60 dark:text-rh-muted/50 mb-1.5">
            {greeting}{firstName ? `, ${firstName}` : ''} · Today's Brief
          </div>

          {/* Portfolio mini-block */}
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-[15px] font-bold text-rh-light-text dark:text-rh-text font-mono">
              {formatCurrency(portfolio.netEquity ?? portfolio.totalValue)}
            </span>
            <span className={`text-[12px] font-semibold font-mono ${dayUp ? 'text-rh-green' : 'text-rh-red'}`}>
              {dayUp ? '+' : ''}{formatCurrency(portfolio.dayChange)} ({formatPct(portfolio.dayChangePercent)})
            </span>
          </div>

          {/* Top movers row */}
          {movers.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              {movers.map((m) => {
                const up = (m.dayChangePercent ?? 0) >= 0;
                return (
                  <button
                    key={m.ticker}
                    onClick={(e) => { e.stopPropagation(); onTickerClick?.(m.ticker); }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
                  >
                    <span className="text-rh-light-text dark:text-rh-text font-semibold">{m.ticker}</span>
                    <span className={up ? 'text-rh-green tabular-nums' : 'text-rh-red tabular-nums'}>
                      {up ? '+' : ''}{(m.dayChangePercent ?? 0).toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={onOpenFull}
            className="text-[11px] font-medium text-rh-green hover:text-rh-green/80 transition-colors"
          >
            View full brief →
          </button>
        </div>
      </div>
    </div>
  );
}
