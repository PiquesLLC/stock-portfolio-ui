// DailyReportModal — fullscreen modal wrapper around DailyReportContent.
// All visual content lives in DailyReportContent; this file is just the modal
// chrome: portal to document.body (per project rule), backdrop, sticky top
// bar (Back / Share / Refresh / Don't show again), Escape key handling, and
// body scroll locking. Behavior unchanged from the prior implementation.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { Portfolio } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DailyReportContent, DailyReportContentHandle } from './DailyReportContent';

interface DailyReportModalProps {
  onClose: () => void;
  onTickerClick?: (ticker: string) => void;
  hidden?: boolean;
  portfolio?: Portfolio | null;
}

export function DailyReportModal({ onClose, onTickerClick, hidden }: DailyReportModalProps) {
  const [dontShowAgain, setDontShowAgain] = useLocalStorage('dailyReportDisabled', false);
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<DailyReportContentHandle>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Lock body + html scroll while visible (prevents double scrollbar on Windows)
  useEffect(() => {
    if (hidden) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; };
  }, [hidden]);

  const handleRegenerate = async () => {
    if (!reportRef.current) return;
    setRegenerating(true);
    try { await reportRef.current.regenerate(); }
    finally { setRegenerating(false); }
  };

  const handleShare = async () => {
    if (!contentRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await toPng(contentRef.current, {
        backgroundColor: '#000000',
        pixelRatio: 2,
        filter: (node) => {
          if (node instanceof HTMLElement && node.dataset.excludeShare) return false;
          return true;
        },
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'nala-daily-brief.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Nala - Today's Brief" });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'nala-daily-brief.png';
        a.click();
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-white dark:bg-black overflow-y-auto"
      role="dialog" aria-modal="true"
      style={{ display: hidden ? 'none' : undefined, WebkitOverflowScrolling: 'touch' }}
    >
      {/* Sticky top bar — safe-area padding lives here so content never leaks above */}
      <div
        className="sticky z-20 flex items-center justify-between px-6 py-3 bg-white dark:bg-black"
        style={{ top: 0, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <div className="flex items-center gap-3" data-exclude-share="true">
          <button onClick={handleShare} disabled={sharing} className="flex items-center gap-1.5 text-[11px] text-rh-light-text dark:text-white hover:text-rh-green transition-colors disabled:opacity-50">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            {sharing ? 'Saving...' : 'Share'}
          </button>
          <button onClick={handleRegenerate} disabled={regenerating} className="flex items-center gap-1.5 text-[11px] text-rh-light-text dark:text-white hover:text-rh-green transition-colors disabled:opacity-50">
            <svg className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {regenerating ? 'Generating...' : 'Refresh'}
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} className="w-3 h-3 accent-rh-green" />
            <span className="text-[11px] text-rh-light-text dark:text-white">Don't show on startup</span>
          </label>
        </div>
      </div>

      <div ref={contentRef}>
        <DailyReportContent
          ref={reportRef}
          onTickerClick={onTickerClick}
          paused={hidden}
          dismissSlot={
            <button onClick={onClose} className="px-10 py-3 bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-white font-medium rounded-full hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors border border-gray-200/60 dark:border-white/[0.08]">
              Continue to Portfolio
            </button>
          }
        />
      </div>
    </div>
  );

  // Per project memory: every modal MUST createPortal to document.body.
  return createPortal(modal, document.body);
}
