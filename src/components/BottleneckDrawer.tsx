import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BottleneckEntry } from '../api';
import { layerBarColor } from './BottleneckCard';

interface Props {
  entry: BottleneckEntry | null;
  open: boolean;
  onClose: () => void;
  onTickerClick: (ticker: string) => void;
}

export function BottleneckDrawer({ entry, open, onClose, onTickerClick }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  if (!open || !entry) return null;

  const handleTicker = (ticker: string) => {
    onTickerClick(ticker);
    onClose();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${entry.name} bottleneck details`}
        className="fixed top-0 right-0 h-full w-full sm:max-w-xl bg-rh-light-card dark:bg-rh-card border-l border-rh-light-border dark:border-rh-border z-50 overflow-y-auto outline-none animate-slide-in-right shadow-xl"
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border px-5 sm:px-7 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-1 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: layerBarColor(entry.layer) }}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-rh-light-text dark:text-rh-text truncate">
              {entry.layer}
            </span>
            {entry.featured && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-rh-green ml-2">
                ★ Featured
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted hover:bg-gray-100/40 dark:hover:bg-white/[0.04] transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-rh-light-text dark:text-rh-text mb-2">
            {entry.name}
          </h2>
          <div
            role="link"
            tabIndex={0}
            onClick={() => handleTicker(entry.primaryTicker)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTicker(entry.primaryTicker); }}
            className="text-sm text-rh-green font-bold cursor-pointer hover:underline mb-5 inline-block"
          >
            {entry.primaryTicker} →
          </div>

          {/* Long thesis — split paragraphs on \n\n */}
          <div className="space-y-4 mb-6">
            {entry.thesisLong.split(/\n\n+/).map((para, i) => (
              <p
                key={i}
                className="text-[14px] leading-relaxed text-rh-light-text/85 dark:text-rh-text/85"
              >
                {para}
              </p>
            ))}
          </div>

          {/* Chokepoint metrics */}
          {entry.chokepointMetrics.length > 0 && (
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                Chokepoint metrics
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {entry.chokepointMetrics.map((m, i) => (
                  <div key={i}>
                    <div className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">
                      {m.label}
                    </div>
                    <div
                      className={`text-base font-bold ${
                        i === 0
                          ? 'text-rh-green'
                          : 'text-rh-light-text dark:text-rh-text'
                      }`}
                    >
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Catalysts */}
          {entry.catalysts.length > 0 && (
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rh-green mb-2">
                Catalysts
              </div>
              <ul className="list-disc pl-5 space-y-1.5 text-[13px] leading-relaxed text-rh-light-text/85 dark:text-rh-text/85">
                {entry.catalysts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {entry.risks.length > 0 && (
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mb-2">
                Risks
              </div>
              <ul className="list-disc pl-5 space-y-1.5 text-[13px] leading-relaxed text-rh-light-text/85 dark:text-rh-text/85">
                {entry.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Related tickers */}
          {entry.relatedTickers.length > 0 && (
            <div className="pt-5 border-t border-rh-light-border dark:border-rh-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
                Related tickers
              </div>
              <div className="flex flex-wrap gap-4">
                {entry.relatedTickers.map((t) => (
                  <span
                    key={t}
                    role="link"
                    tabIndex={0}
                    onClick={() => handleTicker(t)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleTicker(t); }}
                    className="text-xs font-bold tracking-wide text-rh-light-text dark:text-rh-text hover:text-rh-green cursor-pointer transition-colors"
                  >
                    {t} →
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer caveat */}
          {entry.lastUpdated && (
            <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mt-6 italic">
              Last updated {entry.lastUpdated}
            </p>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
