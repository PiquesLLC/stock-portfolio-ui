import { useState, useEffect, useRef, useCallback } from 'react';
import { TabType } from './Navigation';

interface UseKeyboardShortcutsOptions {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  focusSearch: () => void;
  clearNavigationState: () => void;
}

interface UseKeyboardShortcutsReturn {
  toastMessage: string | null;
  isCheatSheetOpen: boolean;
  closeCheatSheet: () => void;
}

const NAV_MAP: Record<string, { tab: TabType; label: string }> = {
  p: { tab: 'portfolio', label: 'Portfolio' },
  i: { tab: 'insights', label: 'Insights' },
  m: { tab: 'macro', label: 'Macro' },
  l: { tab: 'leaderboard', label: 'Leaderboard' },
  f: { tab: 'feed', label: 'Feed' },
  w: { tab: 'watch', label: 'Watch' },
};

const MACRO_REGIONS = [
  { id: 'macro-region-us', label: 'United States' },
  { id: 'macro-region-eu', label: 'European Union' },
  { id: 'macro-region-japan', label: 'Japan' },
];

export function useKeyboardShortcuts({
  activeTab,
  setActiveTab,
  focusSearch,
  clearNavigationState,
}: UseKeyboardShortcutsOptions): UseKeyboardShortcutsReturn {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);

  const activeTabRef = useRef(activeTab);
  const cheatSheetRef = useRef(isCheatSheetOpen);
  const gPending = useRef(false);
  const gTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { cheatSheetRef.current = isCheatSheetOpen; }, [isCheatSheetOpen]);

  const showToast = useCallback((msg: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToastMessage(msg);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 1500);
  }, []);

  const closeCheatSheet = useCallback(() => setIsCheatSheetOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key;

      // Escape closes cheat sheet
      if (key === 'Escape' && cheatSheetRef.current) {
        e.preventDefault();
        setIsCheatSheetOpen(false);
        return;
      }

      // Skip all other shortcuts when cheat sheet is open
      if (cheatSheetRef.current) return;

      // G-prefix: second key
      if (gPending.current) {
        gPending.current = false;
        if (gTimeout.current) clearTimeout(gTimeout.current);

        const entry = NAV_MAP[key.toLowerCase()];
        if (entry) {
          e.preventDefault();
          clearNavigationState();
          setActiveTab(entry.tab);
          showToast(`Go to ${entry.label}`);
        }
        return;
      }

      // G-prefix: first key
      if (key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        gPending.current = true;
        gTimeout.current = setTimeout(() => { gPending.current = false; }, 800);
        return;
      }

      // / — focus search
      if (key === '/') {
        e.preventDefault();
        focusSearch();
        showToast('Search');
        return;
      }

      // ? — toggle cheat sheet
      if (key === '?') {
        e.preventDefault();
        setIsCheatSheetOpen(prev => !prev);
        return;
      }

      // 1/2/3 — macro region scroll
      if (activeTabRef.current === 'macro' && ['1', '2', '3'].includes(key)) {
        e.preventDefault();
        const region = MACRO_REGIONS[parseInt(key) - 1];
        const el = document.getElementById(region.id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Brief highlight flash on the region header
          const header = el.querySelector('h3');
          if (header) {
            header.classList.add('shortcut-highlight');
            setTimeout(() => header.classList.remove('shortcut-highlight'), 1200);
          }
          showToast(region.label);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, focusSearch, clearNavigationState, showToast]);

  return { toastMessage, isCheatSheetOpen, closeCheatSheet };
}
