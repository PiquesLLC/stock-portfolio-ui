import { useState, useCallback, useEffect } from 'react';

function storageKey(userId: string) { return `nala_getting_started_${userId}`; }
function dismissedKey(userId: string) { return `nala_getting_started_dismissed_${userId}`; }

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* quota/blocked — degrade gracefully */ }
}

interface Step {
  id: string;
  label: string;
  description: string;
  icon: JSX.Element;
}

const STEPS: Step[] = [
  {
    id: 'add_stock',
    label: 'Add your first stock',
    description: 'Search for a ticker and add it to your portfolio',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: 'daily_briefing',
    label: 'Check your Daily Briefing',
    description: 'Your AI-generated morning report on your holdings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
      </svg>
    ),
  },
  {
    id: 'discover',
    label: 'Explore the Discover page',
    description: 'Market heatmaps, themes, and a stock screener',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
      </svg>
    ),
  },
  {
    id: 'explore_creators',
    label: 'Explore creators',
    description: 'Find top investors and follow their portfolios',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    id: 'creator_account',
    label: 'Set up creator account',
    description: 'Share your portfolio and earn from followers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    id: 'ask_nala',
    label: 'Ask Nala a question',
    description: 'Chat with AI about any stock or your portfolio',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: 'watchlist',
    label: 'Set up a Watchlist',
    description: 'Track stocks you\'re interested in buying',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function loadCompleted(userId: string): Set<string> {
  try {
    const raw = safeGetItem(storageKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCompleted(userId: string, completed: Set<string>) {
  safeSetItem(storageKey(userId), JSON.stringify([...completed]));
}

interface GettingStartedChecklistProps {
  userId: string;
  hasHoldings: boolean;
  onNavigate: (tab: string) => void;
  onOpenDailyBrief: () => void;
  onOpenCreatorSettings: () => void;
  onOpenAddStock: () => void;
}

export function GettingStartedChecklist({
  userId,
  hasHoldings,
  onNavigate,
  onOpenDailyBrief,
  onOpenCreatorSettings,
  onOpenAddStock,
}: GettingStartedChecklistProps) {
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted(userId));
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => safeGetItem(dismissedKey(userId)) === '1');

  // Auto-complete "add stock" when holdings exist
  useEffect(() => {
    if (hasHoldings && !completed.has('add_stock')) {
      setCompleted(prev => {
        const next = new Set(prev);
        next.add('add_stock');
        saveCompleted(userId, next);
        return next;
      });
    }
  }, [hasHoldings, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markComplete = useCallback((id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.add(id);
      saveCompleted(userId, next);
      return next;
    });
  }, [userId]);

  const handleStepClick = useCallback((step: Step) => {
    markComplete(step.id);
    switch (step.id) {
      case 'add_stock':
        onOpenAddStock();
        break;
      case 'daily_briefing':
        onOpenDailyBrief();
        break;
      case 'discover':
        onNavigate('discover');
        break;
      case 'explore_creators':
        onNavigate('leaderboard');
        break;
      case 'creator_account':
        onOpenCreatorSettings();
        break;
      case 'ask_nala':
        onNavigate('nala');
        break;
      case 'watchlist':
        onNavigate('watchlists');
        break;
    }
  }, [markComplete, onNavigate, onOpenDailyBrief, onOpenCreatorSettings, onOpenAddStock]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    safeSetItem(dismissedKey(userId), '1');
  }, [userId]);

  if (dismissed) return null;

  const completedCount = STEPS.filter(s => completed.has(s.id)).length;
  const progressPct = Math.round((completedCount / STEPS.length) * 100);
  const allDone = completedCount === STEPS.length;

  return (
    <div className="mb-3 rounded-xl border border-rh-green/20 dark:border-rh-green/15 bg-white/80 dark:bg-white/[0.03] overflow-hidden">
      {/* Header — div with click handler, not button, to avoid nesting buttons */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(c => !c)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c => !c); } }}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
      >
        {/* Logo/icon */}
        <div className="w-8 h-8 rounded-lg bg-rh-green/10 flex items-center justify-center flex-shrink-0">
          {allDone ? (
            <svg className="w-4.5 h-4.5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-4.5 h-4.5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-white">
              {allDone ? 'You\'re all set!' : 'Getting Started'}
            </h3>
            <span className="text-[10px] font-medium text-rh-green bg-rh-green/10 px-1.5 py-0.5 rounded-full">
              {completedCount}/{STEPS.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 h-1 w-full max-w-[200px] rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-rh-green rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Dismiss button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/20 hover:text-gray-600 dark:hover:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Dismiss getting started checklist"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* Collapse chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 dark:text-white/20 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div className="px-4 pb-3 space-y-0.5">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group
                  ${done
                    ? 'bg-rh-green/[0.04] dark:bg-rh-green/[0.03]'
                    : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  }`}
              >
                {/* Check circle */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors
                  ${done
                    ? 'bg-rh-green border-rh-green'
                    : 'border-gray-300 dark:border-white/15 group-hover:border-rh-green/50'
                  }`}
                >
                  {done ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-gray-400 dark:text-white/25 group-hover:text-rh-green/60 transition-colors">
                      {step.icon}
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium block ${
                    done
                      ? 'text-rh-green/70 dark:text-rh-green/60 line-through decoration-rh-green/30'
                      : 'text-rh-light-text dark:text-white group-hover:text-rh-green'
                  }`}>
                    {step.label}
                  </span>
                  {!done && (
                    <span className="text-[11px] text-gray-400 dark:text-white/30">
                      {step.description}
                    </span>
                  )}
                </div>

                {/* Arrow */}
                {!done && (
                  <svg className="w-4 h-4 text-gray-300 dark:text-white/15 group-hover:text-rh-green/50 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
