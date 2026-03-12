import { useState, useRef, useEffect, useCallback } from 'react';
import { PortfolioRecord, listPortfolios, createPortfolio, deletePortfolio } from '../api';

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
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard: ignore outside-click for a brief window after entering create mode
  const justEnteredCreateRef = useRef(false);

  const limit = PLAN_LIMITS[userPlan] ?? 1;
  const canCreate = portfolios.length < limit;

  useEffect(() => {
    listPortfolios().then(setPortfolios).catch(() => {});
  }, []);

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      // Skip if we just entered create mode (prevents race on mobile)
      if (justEnteredCreateRef.current) {
        justEnteredCreateRef.current = false;
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const selectedLabel = selectedPortfolioId
    ? portfolios.find(p => p.id === selectedPortfolioId)?.name ?? 'Portfolio'
    : 'All Portfolios';

  const handleStartCreating = useCallback(() => {
    justEnteredCreateRef.current = true;
    setCreating(true);
    setError('');
    setNewName('');
    // Focus the input after React renders it
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Reset the guard after the event cycle completes
      justEnteredCreateRef.current = false;
    });
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
      setOpen(false);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('limit_reached')) {
        setError('Upgrade to create more portfolios');
      } else if (msg.includes('already exists')) {
        setError('Name already taken');
      } else {
        setError('Failed to create portfolio');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePortfolio(id);
      setPortfolios(prev => prev.filter(p => p.id !== id));
      if (selectedPortfolioId === id) {
        onSelect(undefined);
      }
    } catch {
      // silently fail — user sees the portfolio still there
    }
  };

  // Don't render if only one portfolio (or none) and can't create more
  if (portfolios.length <= 1 && !canCreate) return null;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium
          bg-transparent text-gray-500 dark:text-white/40
          hover:text-gray-700 dark:hover:text-white/60 transition-colors"
      >
        <span>{selectedLabel}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 sm:w-56 z-50 rounded-lg shadow-lg
          bg-white dark:bg-[#1a1a1e]/95 border border-gray-200 dark:border-white/[0.08]
          py-1 overflow-hidden">
          {/* All Portfolios option */}
          <button
            onClick={() => { onSelect(undefined); setOpen(false); }}
            className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2
              hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors
              ${!selectedPortfolioId ? 'text-[#00c805] font-medium' : 'text-gray-700 dark:text-white/70'}`}
          >
            <span className="w-4 text-center">{!selectedPortfolioId ? '✓' : ''}</span>
            All Portfolios
          </button>

          <div className="border-t border-gray-100 dark:border-white/[0.06] my-1" />

          {/* Individual portfolios */}
          {portfolios.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 group
                hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors
                ${selectedPortfolioId === p.id ? 'text-[#00c805] font-medium' : 'text-gray-700 dark:text-white/70'}`}
            >
              <span className="w-4 text-center">{selectedPortfolioId === p.id ? '✓' : ''}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-gray-400 dark:text-white/30">{p.holdingsCount}</span>
              {!p.isDefault && p.holdingsCount === 0 && (
                <span
                  onClick={(e) => handleDelete(p.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-all cursor-pointer p-1"
                  title="Delete portfolio"
                >
                  ×
                </span>
              )}
            </button>
          ))}

          {/* Create new */}
          {canCreate && (
            <>
              <div className="border-t border-gray-100 dark:border-white/[0.06] my-1" />
              {creating ? (
                <div className="px-3 py-2.5">
                  <input
                    ref={inputRef}
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setError(''); } }}
                    placeholder="Portfolio name"
                    className="w-full text-sm px-2.5 py-2 rounded border border-gray-200 dark:border-white/[0.1]
                      bg-white dark:bg-white/[0.04] text-gray-800 dark:text-white/80
                      focus:outline-none focus:border-[#00c805]"
                    maxLength={50}
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="words"
                  />
                  {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={handleCreate}
                      disabled={submitting || !newName.trim()}
                      className="text-sm text-[#00c805] font-medium hover:underline py-1 px-1 disabled:opacity-40"
                    >
                      {submitting ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setCreating(false); setError(''); }}
                      className="text-sm text-gray-400 hover:underline py-1 px-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleStartCreating}
                  className="w-full text-left px-3 py-2.5 text-sm text-[#00c805] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors flex items-center gap-2"
                >
                  <span className="w-4 text-center">+</span>
                  New Portfolio
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
