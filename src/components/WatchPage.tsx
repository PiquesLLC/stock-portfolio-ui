interface WatchPageProps {
  pipEnabled: boolean;
  onPipToggle: (enabled: boolean) => void;
  status: string;
  hasError: boolean;
  videoContainerRef: React.Ref<HTMLDivElement>;
}

export function WatchPage({ pipEnabled, onPipToggle, status, hasError, videoContainerRef }: WatchPageProps) {
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

      <div className="bg-black rounded-xl overflow-hidden border border-rh-light-border dark:border-rh-border">
        <div className="flex items-center gap-2 px-4 py-2 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">CNBC Live</span>
        </div>
        <div className="relative">
          {/* Video gets moved here by App via DOM manipulation */}
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
