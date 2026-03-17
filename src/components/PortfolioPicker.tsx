import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Don't render if the user truly has only one portfolio and can't create more.
  if (portfolios.length <= 1 && !canCreate) return null;

  return (
    <div>
      {displayPortfolios.map(p => {
        const isActive = selectedPortfolioId === p.id;

        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`group flex items-center w-full px-2.5 py-1 rounded text-[12px] whitespace-nowrap transition-colors
              ${isActive
                ? 'text-rh-green font-semibold'
                : 'text-gray-500 dark:text-white/45 font-medium hover:text-gray-800 dark:hover:text-white/75'
              }`}
          >
            <span className="truncate">{p.name}</span>
            {!p.isDefault && (
              <svg
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                className="w-3 h-3 ml-auto shrink-0 text-gray-300 dark:text-white/15 group-hover:text-gray-400 dark:group-hover:text-white/30 hover:!text-red-400 cursor-pointer transition-colors"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        );
      })}

      {canCreate && (
        <>
          <div className="mx-2 my-0.5 border-t border-gray-200/15 dark:border-white/[0.05]" />
          {creating ? (
            <div className="px-1.5 py-0.5">
              <input
                ref={inputRef}
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setError(''); }
                }}
                placeholder="Name"
                className="w-full text-[11px] px-2 py-0.5 rounded border border-white/10
                  bg-transparent text-gray-800 dark:text-white/80 focus:outline-none focus:border-rh-green/40
                  placeholder:text-gray-400 dark:placeholder:text-white/20"
                maxLength={50}
                autoComplete="off"
              />
              <div className="flex justify-end gap-2 mt-0.5">
                <button onClick={() => { setCreating(false); setError(''); }} className="text-[10px] text-gray-400 dark:text-white/30">esc</button>
                <button onClick={handleCreate} disabled={submitting || !newName.trim()} className="text-[10px] text-rh-green font-medium disabled:opacity-30">{submitting ? '...' : 'save'}</button>
              </div>
              {error && <p className="text-[10px] text-red-400 px-1">{error}</p>}
            </div>
          ) : (
            <button
              onClick={handleStartCreating}
              className="w-full px-2.5 py-1 rounded text-[11px] text-left
                text-gray-400 dark:text-white/20 hover:text-rh-green transition-colors"
            >
              + new
            </button>
          )}
        </>
      )}
      {/* Delete confirmation modal — portaled to document.body for true centering */}
      {confirmDelete && typeof document !== 'undefined' && document.body && (() => {
        const p = displayPortfolios.find(x => x.id === confirmDelete);
        if (!p) return null;
        return createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
            <div className="bg-white dark:bg-[#1a1a1e] rounded-2xl shadow-2xl p-6 w-[320px] mx-4 border border-gray-200/60 dark:border-white/[0.08]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white text-center mb-1">Delete Portfolio</h3>
              <p className="text-sm text-gray-500 dark:text-white/50 text-center mb-5">
                Are you sure you want to delete <strong className="text-gray-800 dark:text-white/80">{p.name}</strong>?
                {(p.holdingsCount ?? 0) > 0 && (
                  <span className="block text-red-400 text-xs mt-1">{p.holdingsCount} holding{p.holdingsCount === 1 ? '' : 's'} will be permanently removed.</span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
