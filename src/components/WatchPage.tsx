import { useCallback } from 'react';
import { Channel } from '../App';
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

  return (
    <div className="max-w-5xl mx-auto py-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Watch</h1>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">Live financial news</p>
            <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mt-0.5">Now playing: {activeChannel.name} &bull; {activeChannel.description}</p>
          </div>
        </div>

        {/* Background toggle chip */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none px-3 py-1.5 rounded-lg
          bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border
          hover:border-rh-light-text/20 dark:hover:border-rh-muted/30 transition-colors">
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
                  ? 'bg-rh-light-card dark:bg-rh-card border-rh-green/50 dark:border-rh-green/30 shadow-sm shadow-rh-green/5 dark:shadow-rh-green/10 scale-[1.02]'
                  : 'bg-rh-light-bg dark:bg-rh-dark border-rh-light-border dark:border-rh-border hover:border-rh-light-text/20 dark:hover:border-rh-muted/50 hover:bg-rh-light-card dark:hover:bg-white/[0.06] duration-150'
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
      <div className="dark:bg-gradient-to-b dark:from-white/[0.03] dark:to-transparent rounded-xl p-px">
      <div className="bg-rh-light-card dark:bg-rh-card rounded-xl overflow-hidden border border-rh-light-border dark:border-rh-border shadow-sm dark:shadow-none">
        {/* Player header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-rh-light-border/50 dark:border-rh-border/50">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
              Live
            </span>
          </div>
          {/* Open in new tab */}
          <a
            href={activeChannel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
              hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            title="Open stream"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
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
