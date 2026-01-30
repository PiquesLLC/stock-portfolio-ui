import { Channel } from '../App';

interface WatchPageProps {
  pipEnabled: boolean;
  onPipToggle: (enabled: boolean) => void;
  status: string;
  hasError: boolean;
  videoContainerRef: React.Ref<HTMLDivElement>;
  channels: Channel[];
  activeChannel: Channel;
  onChannelChange: (channel: Channel) => void;
}

export function WatchPage({
  pipEnabled, onPipToggle, status, hasError, videoContainerRef,
  channels, activeChannel, onChannelChange,
}: WatchPageProps) {
  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Watch</h1>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mt-1">Live financial news</p>
        </div>
        {/* PiP Toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <span className="text-sm text-rh-light-muted dark:text-rh-muted">Keep playing in background</span>
          <button
            role="switch"
            aria-checked={pipEnabled}
            onClick={() => onPipToggle(!pipEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              pipEnabled ? 'bg-rh-green' : 'bg-gray-300 dark:bg-rh-dark'
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

      {/* Channel selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onChannelChange(ch)}
            className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-lg border transition-all ${
              activeChannel.id === ch.id
                ? 'bg-rh-light-card dark:bg-rh-card border-rh-green shadow-sm'
                : 'bg-rh-light-bg dark:bg-rh-dark border-rh-light-border dark:border-rh-border hover:border-rh-light-text/30 dark:hover:border-rh-muted/30'
            }`}
          >
            {/* Live dot for active channel */}
            {activeChannel.id === ch.id && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            <div className="text-left">
              <div className={`text-sm font-semibold ${
                activeChannel.id === ch.id
                  ? 'text-rh-light-text dark:text-rh-text'
                  : 'text-rh-light-muted dark:text-rh-muted'
              }`}>
                {ch.name}
              </div>
              <div className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                {ch.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Video player */}
      <div className="bg-black rounded-xl overflow-hidden border border-rh-light-border dark:border-rh-border">
        <div className="flex items-center gap-2 px-4 py-2 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{activeChannel.name} Live</span>
        </div>
        <div className="relative">
          <div ref={videoContainerRef} className="aspect-video bg-black" />
          {status && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`text-sm px-3 py-1.5 rounded-lg ${hasError ? 'bg-red-500/20 text-red-400' : 'bg-black/60 text-white/70'}`}>
                {status}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
