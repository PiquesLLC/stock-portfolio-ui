import { useRef, useEffect } from 'react';
import type { ThinkingSummary } from '../api';

const MAX_VISIBLE = 4;

interface ThinkingFeedProps {
  summaries: ThinkingSummary[];
}

export function ThinkingFeed({ summaries }: ThinkingFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new summaries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [summaries.length]);

  if (summaries.length === 0) return null;

  const visible = summaries.slice(-MAX_VISIBLE);
  const hiddenCount = summaries.length - visible.length;
  const latestIndex = summaries.length - 1;

  return (
    <div className="mt-2">
      {hiddenCount > 0 && (
        <p className="text-[9px] text-rh-light-muted dark:text-white/25 mb-1">
          {hiddenCount} earlier step{hiddenCount > 1 ? 's' : ''} hidden
        </p>
      )}
      <div
        ref={scrollRef}
        className="space-y-1 max-h-[96px] overflow-y-auto scrollbar-minimal"
      >
        {visible.map((s) => {
          const isLatest = s.index === latestIndex;
          return (
            <div
              key={s.index}
              className={`flex items-start gap-1.5 px-2 py-1 rounded-md text-[11px] leading-relaxed thinking-entry-in ${
                isLatest
                  ? 'bg-rh-green/[0.06] text-rh-light-text dark:text-white/80'
                  : 'text-rh-light-muted dark:text-white/40'
              }`}
            >
              <svg
                className={`w-3 h-3 mt-0.5 shrink-0 ${isLatest ? 'text-rh-green' : 'text-rh-light-muted dark:text-white/30'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span className="min-w-0 break-words">{s.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
