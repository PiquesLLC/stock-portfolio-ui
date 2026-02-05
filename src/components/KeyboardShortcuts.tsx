import { useEffect } from 'react';

// ─── Toast ──────────────────────────────────────────────────────────────────

interface ShortcutToastProps {
  message: string | null;
}

export function ShortcutToast({ message }: ShortcutToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[60] animate-fade-in-up pointer-events-none">
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg px-3 py-2 shadow-lg text-sm text-rh-light-text dark:text-rh-text flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {message}
      </div>
    </div>
  );
}

// ─── Cheat Sheet Modal ──────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: ['G', 'P'], description: 'Go to Portfolio' },
  { keys: ['G', 'I'], description: 'Go to Insights' },
  { keys: ['G', 'M'], description: 'Go to Macro' },
  { keys: ['G', 'L'], description: 'Go to Leaderboard' },
  { keys: ['G', 'F'], description: 'Go to Feed' },
  { keys: ['G', 'W'], description: 'Go to Watch' },
  { keys: ['/'], description: 'Focus search' },
  { keys: ['Esc'], description: 'Close overlay' },
  { keys: ['1'], description: 'Scroll to US (Macro)', context: 'Macro' },
  { keys: ['2'], description: 'Scroll to EU (Macro)', context: 'Macro' },
  { keys: ['3'], description: 'Scroll to Japan (Macro)', context: 'Macro' },
  { keys: ['?'], description: 'Show this menu' },
];

interface KeyboardCheatSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardCheatSheet({ isOpen, onClose }: KeyboardCheatSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-rh-light-border/50 dark:border-rh-border/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <div className="px-5 py-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                {s.description}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <span key={j}>
                    {j > 0 && <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 mx-0.5">then</span>}
                    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-[11px] font-mono font-medium text-rh-light-text dark:text-rh-text">
                      {k}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-rh-light-border/30 dark:border-rh-border/30">
          <p className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 text-center">
            Press <kbd className="inline px-1 py-0.5 rounded border border-rh-light-border/50 dark:border-rh-border/50 text-[10px] font-mono">?</kbd> to toggle
          </p>
        </div>
      </div>
    </div>
  );
}
