import { useState, useRef, useEffect, useCallback } from 'react';
import { PortfolioRecord, listPortfolios, createPortfolio, deletePortfolio } from '../api';
import { normalizePortfolioTabs } from '../utils/portfolioDisplay';

interface PortfolioPickerProps {
  selectedPortfolioId: string | undefined;
  onSelect: (portfolioId: string | undefined) => void;
  userPlan: string;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  pro: 2,
  premium: 3,
  elite: 999,
};

export default function PortfolioPicker({ selectedPortfolioId, onSelect, userPlan }: PortfolioPickerProps) {
  const [portfolios, setPortfolios] = useState<PortfolioRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const limit = PLAN_LIMITS[userPlan] ?? 1;
  const canCreate = portfolios.length < limit;
  const visiblePortfolios = normalizePortfolioTabs(portfolios);
  const displayPortfolios = (() => {
    if (!selectedPortfolioId || visiblePortfolios.some((p) => p.id === selectedPortfolioId)) {
      return visiblePortfolios;
    }
    const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId);
    if (!selectedPortfolio) return visiblePortfolios;
    return [
      {
        ...selectedPortfolio,
        name: selectedPortfolio.isDefault ? 'Portfolio 1' : selectedPortfolio.name,
      },
      ...visiblePortfolios,
    ];
  })();

  useEffect(() => {
    listPortfolios().then(setPortfolios).catch(() => {});
  }, []);

  const handleStartCreating = useCallback(() => {
    setCreating(true);
    setError('');
    setNewName('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const created = await createPortfolio({ name: newName.trim() });
      setPortfolios(prev => [...prev, created]);
      setNewName('');
      setCreating(false);
      onSelect(created.id);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('limit_reached')) {
        setError('Upgrade plan for more');
      } else if (msg.includes('already exists')) {
        setError('Name taken');
      } else {
        setError('Failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePortfolio(id);
      setPortfolios(prev => prev.filter(p => p.id !== id));
      setConfirmDelete(null);
      if (selectedPortfolioId === id) {
        onSelect(undefined);
      }
    } catch {
      setConfirmDelete(null);
    }
  };

  // Auto-select the first portfolio if none is selected
  useEffect(() => {
    if (!selectedPortfolioId && displayPortfolios.length > 0) {
      onSelect(displayPortfolios[0].id);
    }
  }, [selectedPortfolioId, displayPortfolios, onSelect]);

  useEffect(() => {
    if (!selectedPortfolioId) return;
    if (displayPortfolios.length === 0) return;
    if (!displayPortfolios.some((p) => p.id === selectedPortfolioId)) {
      onSelect(displayPortfolios[0].id);
    }
  }, [selectedPortfolioId, displayPortfolios, onSelect]);

  // Check scroll overflow
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkOverflow); ro.disconnect(); };
  }, [checkOverflow, portfolios]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  // Don't render if the user truly has only one portfolio and can't create more.
  // Normalization can intentionally hide legacy/system tabs, so use the raw count here.
  if (portfolios.length <= 1 && !canCreate) return null;

  return (
    <div className="relative flex items-center max-w-[210px] sm:max-w-[300px] overflow-hidden">
      {/* Left fade + chevron */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 h-full w-6 flex items-center justify-start
            bg-gradient-to-r from-[#111]/90 to-transparent"
        >
          <svg className="w-3 h-3 text-white/50 hover:text-white/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Scrollable tab row */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto no-scrollbar px-0.5 py-0.5 pb-2 -mb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {displayPortfolios.map(p => {
          const isActive = selectedPortfolioId === p.id;
          const isConfirmingDelete = confirmDelete === p.id;
          return (
            <div key={p.id} className="relative shrink-0 group flex items-center">
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 dark:bg-red-500/10 border border-red-500/20">
                  <span className="text-xs text-red-400 font-medium">Delete?</span>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-400 font-bold hover:text-red-300 px-1"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-gray-400 hover:text-gray-300 px-1"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSelect(p.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-200 whitespace-nowrap flex items-center
                    ${isActive
                      ? 'bg-[#0f2614] text-[#2fd05a] border border-[#184222]'
                      : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 bg-gray-100/80 dark:bg-white/[0.04] hover:bg-gray-200/80 dark:hover:bg-white/[0.08]'
                    }`}
                >
                  <span>{p.name}</span>
                </button>
              )}
              {/* Delete button — only for non-default empty portfolios */}
              {!p.isDefault && p.holdingsCount === 0 && !isConfirmingDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
                    bg-gray-300 dark:bg-white/15 text-gray-600 dark:text-white/50
                    text-[10px] leading-none flex items-center justify-center
                    opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white
                    dark:hover:bg-red-500 dark:hover:text-white transition-all duration-150 shadow-sm"
                  title="Delete portfolio"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Create new tab */}
        {canCreate && (
          <>
            {creating ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={inputRef}
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setError(''); }
                  }}
                  placeholder="Portfolio name..."
                  className="w-28 sm:w-36 text-xs px-3 py-1.5 rounded-lg border border-[#00c805]/30
                    bg-white dark:bg-white/[0.04] text-gray-800 dark:text-white/80
                    focus:outline-none focus:border-[#00c805] focus:shadow-[0_0_8px_rgba(0,200,5,0.15)]
                    placeholder:text-gray-400 dark:placeholder:text-white/20 transition-all"
                  maxLength={50}
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="words"
                />
                <button
                  onClick={handleCreate}
                  disabled={submitting || !newName.trim()}
                  className="text-xs font-semibold text-[#00c805] px-2 py-1.5 rounded-md
                    disabled:opacity-30 hover:bg-[#00c805]/10 transition-all"
                >
                  {submitting ? '...' : 'Add'}
                </button>
                <button
                  onClick={() => { setCreating(false); setError(''); }}
                  className="text-xs text-gray-400 dark:text-white/30 px-1 py-1.5 hover:text-gray-600 dark:hover:text-white/50 transition-all"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartCreating}
                className="shrink-0 w-5.5 h-5.5 rounded-md flex items-center justify-center
                  text-gray-400 dark:text-white/25 bg-gray-100/80 dark:bg-white/[0.04]
                  hover:text-[#00c805] hover:bg-[#00c805]/10 hover:shadow-[0_0_8px_rgba(0,200,5,0.1)]
                  transition-all duration-200"
                title="New Portfolio"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Right fade + chevron */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 z-10 h-full w-6 flex items-center justify-end
            bg-gradient-to-l from-[#111]/90 to-transparent"
        >
          <svg className="w-3 h-3 text-white/50 hover:text-white/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Error toast */}
      {error && (
        <span className="text-[10px] text-red-400 font-medium shrink-0 ml-1">{error}</span>
      )}
    </div>
  );
}
