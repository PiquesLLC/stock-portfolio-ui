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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const limit = PLAN_LIMITS[userPlan] ?? 1;
  const canCreate = portfolios.length < limit;

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

  // Don't render if only one portfolio and can't create more
  if (portfolios.length <= 1 && !canCreate) return null;

  const isAllSelected = !selectedPortfolioId;

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
      {/* "All" tab */}
      <button
        onClick={() => onSelect(undefined)}
        className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
          isAllSelected
            ? 'bg-[#00c805]/10 text-[#00c805] dark:bg-[#00c805]/15'
            : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
        }`}
      >
        All
      </button>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-200 dark:bg-white/[0.08] shrink-0" />

      {/* Portfolio tabs */}
      {portfolios.map(p => {
        const isActive = selectedPortfolioId === p.id;
        const isConfirmingDelete = confirmDelete === p.id;
        return (
          <div key={p.id} className="relative shrink-0 group flex items-center">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 dark:bg-red-500/15">
                <span className="text-xs text-red-500 font-medium">Delete?</span>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs text-red-500 font-bold hover:underline px-1"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="text-xs text-gray-400 hover:underline px-1"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSelect(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#00c805]/10 text-[#00c805] dark:bg-[#00c805]/15'
                    : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                {p.name}
                {p.holdingsCount > 0 && (
                  <span className={`ml-1.5 text-[10px] ${isActive ? 'text-[#00c805]/60' : 'text-gray-400 dark:text-white/25'}`}>
                    {p.holdingsCount}
                  </span>
                )}
              </button>
            )}
            {/* Delete button — only for non-default empty portfolios */}
            {!p.isDefault && p.holdingsCount === 0 && !isConfirmingDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-white/10
                  text-gray-500 dark:text-white/40 text-[10px] leading-none flex items-center justify-center
                  opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500
                  dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-all"
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
            <div className="flex items-center gap-1 shrink-0">
              <input
                ref={inputRef}
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setError(''); }
                }}
                placeholder="Name..."
                className="w-24 sm:w-32 text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-white/[0.1]
                  bg-white dark:bg-white/[0.04] text-gray-800 dark:text-white/80
                  focus:outline-none focus:border-[#00c805]"
                maxLength={50}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="words"
              />
              <button
                onClick={handleCreate}
                disabled={submitting || !newName.trim()}
                className="text-xs text-[#00c805] font-medium px-1.5 py-1.5 disabled:opacity-40 hover:underline"
              >
                {submitting ? '...' : 'Add'}
              </button>
              <button
                onClick={() => { setCreating(false); setError(''); }}
                className="text-xs text-gray-400 px-1 py-1.5 hover:underline"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartCreating}
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center
                text-gray-400 dark:text-white/30 hover:text-[#00c805] hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-all"
              title="New Portfolio"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* Error toast */}
      {error && (
        <span className="text-[10px] text-red-500 shrink-0 ml-1">{error}</span>
      )}
    </div>
  );
}
