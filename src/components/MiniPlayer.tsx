interface MiniPlayerProps {
  channelName: string;
  onClose: () => void;
  onExpand: () => void;
  children: React.ReactNode;
}

export function MiniPlayer({ channelName, onClose, onExpand, children }: MiniPlayerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl overflow-hidden shadow-2xl
      border border-rh-light-border dark:border-white/[0.06] bg-black
      dark:shadow-[0_18px_60px_rgba(0,0,0,0.65),0_2px_12px_rgba(0,0,0,0.35)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border/50 dark:border-rh-border/50">
        <button
          onClick={onExpand}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text">{channelName}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded bg-red-500/15 text-red-400">
            Live
          </span>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onExpand}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/[0.06] transition-colors"
            title="Expand"
          >
            <svg className="w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {/* Video container */}
      <div className="aspect-video cursor-pointer" onClick={onExpand}>
        {children}
      </div>
    </div>
  );
}
