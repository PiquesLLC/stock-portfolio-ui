import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

export type TabType = 'portfolio' | 'nala' | 'insights' | 'watchlists' | 'discover' | 'macro' | 'leaderboard' | 'feed' | 'pricing' | 'profile';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userPlan?: string;
  portfolioMenuOpen?: boolean;
  portfolioMenu?: React.ReactNode;
  onPortfolioTabClick?: () => void;
  onPortfolioMenuClose?: () => void;
}

const TAB_ICONS: Record<TabType, JSX.Element> = {
  portfolio: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h4v11H3zM10 3h4v18h-4zM17 7h4v14h-4z" /></svg>,
  nala: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  insights: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  watchlists: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  discover: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM14 11a1 1 0 011-1h4a1 1 0 011 1v8a1 1 0 01-1 1h-4a1 1 0 01-1-1v-8zM9 15a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2a1 1 0 01-1-1v-4z" /></svg>,
  macro: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  leaderboard: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.5 3.5L12 3l3.5 3.5L19 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V3z" /></svg>,
  feed: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
  pricing: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  profile: <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
};

// Dots/ellipsis icon for "More" button
const MoreIcon = <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" /></svg>;

const PRIMARY_TABS: { id: TabType; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'insights', label: 'Insights' },
  { id: 'discover', label: 'Discover' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'feed', label: 'Feed' },
];

const OVERFLOW_TABS: { id: TabType; label: string }[] = [
  { id: 'nala', label: 'Nala AI' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'macro', label: 'Market' },
  { id: 'profile', label: 'Profile' },
  { id: 'pricing', label: 'Pricing' },
];

export function Navigation({
  activeTab,
  onTabChange,
  userPlan,
  portfolioMenuOpen = false,
  portfolioMenu,
  onPortfolioTabClick,
  onPortfolioMenuClose,
}: NavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const portfolioMenuRef = useRef<HTMLDivElement>(null);
  const isPaid = userPlan === 'pro' || userPlan === 'premium' || userPlan === 'elite';
  const visibleOverflow = useMemo(() =>
    isPaid ? OVERFLOW_TABS.filter(t => t.id !== 'pricing') : OVERFLOW_TABS,
    [isPaid]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!portfolioMenuOpen || !onPortfolioMenuClose) return;
    const handler = (e: MouseEvent) => {
      if (portfolioMenuRef.current && !portfolioMenuRef.current.contains(e.target as Node)) {
        onPortfolioMenuClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [portfolioMenuOpen, onPortfolioMenuClose]);

  const allTabs = [...PRIMARY_TABS, ...visibleOverflow];
  const isOverflowActive = visibleOverflow.some(t => t.id === activeTab);
  const activeOverflowLabel = visibleOverflow.find(t => t.id === activeTab)?.label;

  // --- Drag-to-select tabs (mobile) ---
  const [dragTab, setDragTab] = useState<TabType | null>(null);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const startTab = useRef<TabType | null>(null);
  const ignoreNextClick = useRef(false);

  const getTabFromPoint = useCallback((x: number, y: number): TabType | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const btn = (el as Element).closest?.('[data-tab-id]');
    return (btn?.getAttribute('data-tab-id') as TabType) || null;
  }, []);

  const onNavTouchStart = useCallback((e: React.TouchEvent) => {
    const tab = getTabFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    if (tab) {
      dragging.current = true;
      didDrag.current = false;
      startTab.current = tab;
      setDragTab(tab);
    }
  }, [getTabFromPoint]);

  const onNavTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const tab = getTabFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    if (tab) {
      if (tab !== startTab.current) didDrag.current = true;
      if (tab !== dragTab) navigator.vibrate?.(5);
      setDragTab(tab);
    }
  }, [getTabFromPoint, dragTab]);

  const onNavTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragTab) {
      ignoreNextClick.current = true;
      if (dragTab === 'portfolio' && onPortfolioTabClick) {
        onPortfolioTabClick();
      } else {
        onTabChange(dragTab);
      }
      setMoreOpen(false);
    }
    setDragTab(null);
  }, [dragTab, onPortfolioTabClick, onTabChange]);

  return (
    <nav className="border-b border-rh-light-border/60 dark:border-rh-border/60 bg-rh-light-bg/95 dark:bg-black/80 backdrop-blur-md">
      <div className="max-w-[clamp(1200px,75vw,1800px)] mx-auto px-0 sm:px-4 relative">
        {/* Desktop: show all tabs in a row */}
        <div className="hidden sm:flex items-center gap-1">
          {allTabs.map((tab) => (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => onTabChange(tab.id)}
              className={`group flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all duration-200 relative
                ${activeTab === tab.id
                  ? 'text-rh-green'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              <span className={`transition-opacity duration-200 ${activeTab === tab.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>
                {TAB_ICONS[tab.id]}
              </span>
              <span>{tab.label}</span>
              <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-rh-green rounded-full nav-underline ${
                activeTab === tab.id ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              }`} />
              {activeTab !== tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-current rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-200" />
              )}
            </motion.button>
          ))}
        </div>

        {/* Mobile: 4 primary tabs + "More" dropdown */}
        <div
          className="flex sm:hidden items-center justify-around"
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
          onTouchStart={onNavTouchStart}
          onTouchMove={onNavTouchMove}
          onTouchEnd={onNavTouchEnd}
          data-no-tab-swipe
        >
          {PRIMARY_TABS.map((tab) => {
            const isDragging = dragTab !== null;
            const isUnderFinger = dragTab === tab.id;
            const isActive = activeTab === tab.id;
            const showPortfolioActive = tab.id === 'portfolio' && portfolioMenuOpen;
            const lit = isDragging ? isUnderFinger : isActive;
            return (
            <div key={tab.id} className="relative" ref={tab.id === 'portfolio' ? portfolioMenuRef : undefined}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                data-tab-id={tab.id}
                onClick={(e) => {
                  if (ignoreNextClick.current) {
                    ignoreNextClick.current = false;
                    e.preventDefault();
                    return;
                  }
                  if (didDrag.current) { e.preventDefault(); return; }
                  if (tab.id === 'portfolio' && onPortfolioTabClick) {
                    onPortfolioTabClick();
                  } else {
                    onTabChange(tab.id);
                  }
                  setMoreOpen(false);
                }}
                className={`group flex flex-col items-center gap-0.5 px-3 py-2.5 font-medium transition-all duration-200 relative
                  ${(lit || showPortfolioActive)
                    ? 'text-rh-green'
                    : 'text-rh-light-muted dark:text-rh-muted'
                  }`}
              >
                <span className={`transition-opacity duration-200 ${(lit || showPortfolioActive) ? 'opacity-100' : 'opacity-50'}`}>
                  {TAB_ICONS[tab.id]}
                </span>
                <span className="text-[10px]">{tab.label}</span>
                <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-rh-green rounded-full nav-underline ${
                  (lit || showPortfolioActive) ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`} />
              </motion.button>
              {tab.id === 'portfolio' && portfolioMenuOpen && portfolioMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-gray-200/60 dark:border-white/[0.08] bg-white dark:bg-[#1c1c1f] shadow-[0_8px_32px_rgba(0,0,0,0.3)] py-1 px-0.5" data-no-tab-swipe>
                  {portfolioMenu}
                </div>
              )}
            </div>
            );
          })}

          {/* More button + dropdown */}
          <div ref={moreRef} className="relative">
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => setMoreOpen(prev => !prev)}
              className={`group flex flex-col items-center gap-0.5 px-3 py-2.5 font-medium transition-all duration-200 relative
                ${isOverflowActive
                  ? 'text-rh-green'
                  : 'text-rh-light-muted dark:text-rh-muted'
                }`}
            >
              <span className={`transition-opacity duration-200 ${isOverflowActive || moreOpen ? 'opacity-100' : 'opacity-50'}`}>
                {MoreIcon}
              </span>
              <span className="text-[10px]">{isOverflowActive ? activeOverflowLabel : 'More'}</span>
              <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-rh-green rounded-full nav-underline ${
                isOverflowActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              }`} />
            </motion.button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b]" data-no-tab-swipe>
                {visibleOverflow.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
                      ${activeTab === tab.id
                        ? 'text-rh-green bg-rh-green/10'
                        : 'text-rh-light-text dark:text-rh-text hover:bg-white/5'
                      }`}
                  >
                    <span className={activeTab === tab.id ? 'opacity-100' : 'opacity-50'}>
                      {TAB_ICONS[tab.id]}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
