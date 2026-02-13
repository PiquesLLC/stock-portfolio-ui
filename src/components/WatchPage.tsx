import { useCallback, useState, useEffect } from 'react';
import { Channel } from '../utils/channels';
import { WatchHeadlines } from './WatchHeadlines';
import { LiveHeadlines } from './LiveHeadlines';

interface WatchPageProps {
  pipEnabled: boolean;
  onPipToggle: (enabled: boolean) => void;
  status: string;
  hasError: boolean;
  videoContainerRef: React.Ref<HTMLDivElement>;
  channels: Channel[];
  activeChannel: Channel;
  onChannelChange: (channel: Channel) => void;
  onTickerClick?: (ticker: string) => void;
}

export function WatchPage({
  pipEnabled, onPipToggle, status, hasError, videoContainerRef,
  channels, activeChannel, onChannelChange, onTickerClick,
}: WatchPageProps) {
  const handleTickerClick = useCallback((ticker: string) => {
    onTickerClick?.(ticker);
  }, [onTickerClick]);

  const [theatreMode, setTheatreMode] = useState(false);

  // Escape key exits theatre mode
  useEffect(() => {
    if (!theatreMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTheatreMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theatreMode]);

  return (
    <div className="max-w-[1440px] mx-auto py-4">
      {/* Theatre mode overlay */}
      {theatreMode && (
        <div
          className="fixed inset-0 z-40 bg-black/90 backdrop-blur-sm cursor-pointer animate-in fade-in duration-300"
          onClick={() => setTheatreMode(false)}
        />
      )}
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Watch</h1>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">Live financial news</p>
          <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mt-0.5 truncate max-w-[280px] sm:max-w-none">Now playing: {activeChannel.name} &bull; {activeChannel.description}</p>
        </div>

        {/* Background toggle chip */}
        <label className="self-start sm:self-auto flex items-center gap-2.5 cursor-pointer select-none px-3 py-1.5 rounded-lg
          bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm border border-gray-200/50 dark:border-white/[0.06]
          hover:border-gray-300/60 dark:hover:border-white/[0.12] transition-colors">
          <span className="text-xs text-rh-light-muted dark:text-rh-muted whitespace-nowrap">Background playback</span>
          <button
            role="switch"
            aria-checked={pipEnabled}
            onClick={() => onPipToggle(!pipEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              pipEnabled ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/10'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                pipEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Channel bar */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 pl-1 scrollbar-hide">
        {channels.map((ch) => {
          const isActive = activeChannel.id === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => onChannelChange(ch)}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all
                ${isActive
                  ? 'bg-gray-100/60 dark:bg-white/[0.06] border-rh-green/50 dark:border-rh-green/30 shadow-sm shadow-rh-green/5 dark:shadow-rh-green/10 scale-[1.02]'
                  : 'bg-gray-50/40 dark:bg-white/[0.02] border-gray-200/50 dark:border-white/[0.06] hover:border-gray-300/60 dark:hover:border-white/[0.12] hover:bg-gray-100/60 dark:hover:bg-white/[0.06] duration-150'
                }`}
            >
              {/* Live/idle dot */}
              <span className={`flex-shrink-0 flex h-2 w-2 ${isActive ? '' : 'opacity-30'}`}>
                {isActive ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </>
                ) : (
                  <span className="inline-flex rounded-full h-2 w-2 bg-rh-light-muted dark:bg-rh-muted" />
                )}
              </span>
              <div className="text-left">
                <div className={`text-sm font-semibold leading-tight ${
                  isActive
                    ? 'text-rh-light-text dark:text-rh-text'
                    : 'text-rh-light-muted dark:text-rh-muted'
                }`}>
                  {ch.name}
                </div>
                <div className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/60 leading-tight mt-0.5">
                  {ch.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Player card — subtle dark gradient anchor behind */}
      <div className={`dark:bg-gradient-to-b dark:from-white/[0.03] dark:to-transparent rounded-xl p-px transition-all duration-300 ${
        theatreMode ? 'relative z-50 scale-[1.02]' : ''
      }`}>
      <div className={`bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl overflow-hidden transition-shadow duration-300 ${
        theatreMode ? 'shadow-[0_0_80px_-10px_rgba(0,0,0,0.8)] dark:shadow-[0_0_80px_-10px_rgba(0,200,5,0.08)]' : 'shadow-sm dark:shadow-none'
      }`}>
        {/* Player header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200/50 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
              Live
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Theatre mode toggle */}
            <button
              onClick={() => setTheatreMode(t => !t)}
              className={`p-1.5 rounded-lg transition-colors ${
                theatreMode
                  ? 'text-rh-green bg-rh-green/10'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark'
              }`}
              title={theatreMode ? 'Exit theatre mode (Esc)' : 'Theatre mode'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {theatreMode ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                )}
              </svg>
            </button>
            {/* Open in new tab */}
            <a
              href={activeChannel.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
                hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
              title="Watch on website"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Video area */}
        <div className="relative bg-black">
          <div ref={videoContainerRef} className="aspect-video bg-black" />

          {/* Status overlay */}
          {status && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {hasError ? (
                <div className="flex flex-col items-center gap-3 pointer-events-auto">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/20">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm text-red-400">{status}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onChannelChange(activeChannel)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 transition-colors"
                    >
                      Try again
                    </button>
                    {channels.length > 1 && (
                      <button
                        onClick={() => {
                          const idx = channels.findIndex(c => c.id === activeChannel.id);
                          const next = channels[(idx + 1) % channels.length];
                          onChannelChange(next);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 transition-colors"
                      >
                        Switch provider
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm">
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-sm text-white/70">{status}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Live headlines under video */}
      <LiveHeadlines
        channel={activeChannel.id}
        isLive={!hasError}
        onTickerClick={handleTickerClick}
      />

      {/* Headlines + Mentioned Stocks */}
      <div className="mt-6 space-y-4">
        <WatchHeadlines
          onTickerClick={handleTickerClick}
        />
      </div>
    </div>
  );
}
