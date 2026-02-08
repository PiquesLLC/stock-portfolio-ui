import { useMemo, useState, useEffect, useRef } from 'react';
import { useHeadlineParser } from './useHeadlineParser';
import { useTickerDetection, detectTickersFromText } from './useTickerDetection';

interface LiveHeadlinesProps {
  channel: string;
  isLive: boolean;
  onTickerClick: (ticker: string) => void;
}

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5) return 'now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

const CYCLE_INTERVAL = 8000; // Cycle every 8 seconds

const KEYFRAMES = `
@keyframes liveHeadlineIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes liveHeadlineFade {
  0% { opacity: 0; transform: translateY(8px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-8px); }
}`;

export function LiveHeadlines({ channel, isLive, onTickerClick }: LiveHeadlinesProps) {
  const headlines = useHeadlineParser(channel, isLive);
  const headlineTexts = useMemo(() => headlines.map(h => h.text), [headlines]);
  const detectedTickers = useTickerDetection(headlineTexts);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get available headlines (most recent first)
  const available = useMemo(() => headlines.slice(-10).reverse(), [headlines]);

  // Auto-cycle through headlines
  useEffect(() => {
    if (available.length <= 1) return;

    cycleRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % available.length);
    }, CYCLE_INTERVAL);

    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [available.length]);

  // Reset index when headlines change significantly
  useEffect(() => {
    if (currentIndex >= available.length) {
      setCurrentIndex(0);
    }
  }, [available.length, currentIndex]);

  // Show single cycling headline
  const visible = available.length > 0 ? [available[currentIndex]] : [];

  if (!isLive) return null;

  return (
    <div className="mt-3 space-y-2.5">
      <style>{KEYFRAMES}</style>

      {/* Live headlines section */}
      <div className="px-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rh-green" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rh-green/80">
              Live headlines
            </span>
          </div>
          {available.length > 1 && (
            <div className="flex items-center gap-1">
              {available.slice(0, Math.min(available.length, 5)).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    i === currentIndex % Math.min(available.length, 5)
                      ? 'bg-rh-green scale-110'
                      : 'bg-rh-light-muted/40 dark:bg-white/20'
                  }`}
                />
              ))}
              {available.length > 5 && (
                <span className="text-[9px] text-rh-light-muted/50 dark:text-white/30 ml-1">+{available.length - 5}</span>
              )}
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="text-xs text-rh-light-muted/50 dark:text-white/30 italic pl-3.5">
            Listening for market headlines…
          </p>
        ) : (
          <div className="space-y-1">
            {visible.map((h) => {
              const ticker = detectTickersFromText(h.text);
              const handleClick = () => {
                // Open article tab, then immediately pull focus back to our app
                window.open(h.url, '_blank', 'noopener,noreferrer');
                // Refocus our window after a frame so the tab is created but we stay here
                requestAnimationFrame(() => {
                  window.focus();
                  if (ticker) onTickerClick(ticker);
                });
              };
              return (
                <div
                  key={`${h.id}-${currentIndex}`}
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
                  className="flex items-start gap-2 pl-0.5 rounded-lg transition-colors duration-150
                    cursor-pointer hover:bg-gray-100/60 dark:hover:bg-white/[0.04] -mx-1.5 px-1.5"
                  style={{
                    animation: 'liveHeadlineIn 300ms ease-out both',
                  }}
                >
                  <span className="flex-shrink-0 mt-[5px] h-1 w-1 rounded-full bg-rh-light-muted/40 dark:bg-white/20" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-rh-light-muted/80 dark:text-white/60 leading-snug line-clamp-1">
                      {h.text}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-medium text-rh-light-muted/45 dark:text-white/25">{h.source}</span>
                      <span className="text-[10px] tabular-nums text-rh-light-muted/40 dark:text-white/20">{timeAgo(h.timestamp)}</span>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted/70 dark:hover:text-white/50 transition-colors"
                        title="Read article"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detected tickers row */}
      {detectedTickers.length > 0 && (
        <div className="px-1">
          <span className="text-[10px] text-rh-light-muted/45 dark:text-white/25 mb-1.5 block">Symbols mentioned</span>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            {detectedTickers.map(({ ticker }) => (
              <button
                key={ticker}
                onClick={() => onTickerClick(ticker)}
                className="flex-shrink-0 text-xs font-mono font-medium px-2.5 py-1 rounded-full
                  bg-neutral-800 border border-neutral-700
                  text-white/70 hover:bg-neutral-700 hover:text-green-400
                  transition-colors duration-150 cursor-pointer"
              >
                {ticker}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
