import { useMemo } from 'react';
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

const KEYFRAMES = `
@keyframes liveHeadlineIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}`;

export function LiveHeadlines({ channel, isLive, onTickerClick }: LiveHeadlinesProps) {
  const headlines = useHeadlineParser(channel, isLive);
  const headlineTexts = useMemo(() => headlines.map(h => h.text), [headlines]);
  const detectedTickers = useTickerDetection(headlineTexts);

  // Show most recent 3
  const visible = headlines.slice(-3).reverse();

  if (!isLive) return null;

  return (
    <div className="mt-3 space-y-2.5">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Live headlines section */}
      <div className="px-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rh-green" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rh-green/80">
            Live headlines
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="text-xs text-white/30 italic pl-3.5">
            Listening for market headlines…
          </p>
        ) : (
          <div className="space-y-1">
            {visible.map((h, i) => {
              const ticker = detectTickersFromText(h.text);
              const handleClick = () => {
                // Open article tab, then immediately pull focus back to our app
                const newTab = window.open(h.url, '_blank', 'noopener,noreferrer');
                // Refocus our window after a frame so the tab is created but we stay here
                requestAnimationFrame(() => {
                  window.focus();
                  if (ticker) onTickerClick(ticker);
                });
              };
              return (
                <div
                  key={h.id}
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
                  className="flex items-start gap-2 pl-0.5 rounded-lg transition-colors duration-150
                    cursor-pointer hover:bg-white/[0.04] -mx-1.5 px-1.5"
                  style={{
                    animation: 'liveHeadlineIn 180ms ease-out both',
                    animationDelay: `${i * 40}ms`,
                  }}
                >
                  <span className="flex-shrink-0 mt-[5px] h-1 w-1 rounded-full bg-white/20" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-white/60 leading-snug line-clamp-1">
                      {h.text}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-medium text-white/25">{h.source}</span>
                      <span className="text-[10px] tabular-nums text-white/20">{timeAgo(h.timestamp)}</span>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-white/20 hover:text-white/50 transition-colors"
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
          <span className="text-[10px] text-white/25 mb-1.5 block">Symbols mentioned</span>
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
