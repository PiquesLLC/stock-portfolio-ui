import { useState, useEffect } from 'react';
import { getPortfolioBriefing, PortfolioBriefingResponse } from '../api';


interface HomeBriefingCardProps {
  portfolioId?: string;
  displayName?: string;
  userId?: string;
  username?: string;
  onReadMore: () => void;
  onTickerClick?: (ticker: string) => void;
  /** Hide the card if the daily report modal was already opened */
  briefingOpened?: boolean;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Inline ticker highlight: wraps $TICKER patterns in green text */
function highlightTickers(text: string, onTickerClick?: (ticker: string) => void): (string | JSX.Element)[] {
  const parts = text.split(/(\b[A-Z]{1,5}\s[+-]?\d+\.?\d*%)/g);
  return parts.map((part, i) => {
    const match = part.match(/^([A-Z]{1,5})\s([+-]?\d+\.?\d*%)$/);
    if (match) {
      const [, ticker, pct] = match;
      const isNeg = pct.startsWith('-');
      return (
        <span
          key={i}
          className={`font-semibold cursor-pointer ${isNeg ? 'text-rh-red' : 'text-rh-green'}`}
          onClick={e => { e.stopPropagation(); onTickerClick?.(ticker); }}
        >
          {ticker} <span className="text-[11px]">{pct}</span>
        </span>
      );
    }
    return part;
  });
}

export function HomeBriefingCard({ portfolioId, displayName, onReadMore, onTickerClick, briefingOpened }: HomeBriefingCardProps) {
  const [briefing, setBriefing] = useState<PortfolioBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return localStorage.getItem('nala_briefing_dismissed') === today;
  });

  useEffect(() => {
    getPortfolioBriefing(portfolioId, 'daily')
      .then(resp => {
        if (resp.headline || resp.verdict) setBriefing(resp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId]);

  if (dismissed || briefingOpened || (!loading && !briefing)) return null;

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

  const topSection = briefing!.sections[0];

  return (
    <div className="relative bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl rounded-xl border border-gray-200/40 dark:border-white/[0.06] p-4 group">
      {/* Dismiss */}
      <button
        onClick={() => { setDismissed(true); localStorage.setItem('nala_briefing_dismissed', new Date().toISOString().split('T')[0]); }}
        className="absolute top-3 right-3 text-rh-light-muted/40 dark:text-rh-muted/30 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Greeting + headline */}
      <div className="flex items-start gap-3">
        <div className="w-0.5 h-10 bg-rh-green rounded-full flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-rh-light-muted/60 dark:text-rh-muted/50 mb-1">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </div>
          <p className="text-[13px] font-semibold text-rh-light-text dark:text-rh-text leading-snug">
            {briefing!.headline}
          </p>

          {/* First section preview */}
          {topSection && (
            <p className="mt-1.5 text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed line-clamp-2">
              {highlightTickers(topSection.body, onTickerClick)}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onReadMore}
              className="text-[11px] font-medium text-rh-green hover:text-rh-green/80 transition-colors"
            >
              Read full briefing →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
