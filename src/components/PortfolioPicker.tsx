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
        const isConfirmingDelete = confirmDelete === p.id;

        if (isConfirmingDelete) {
          return (
            <div key={p.id} className="flex items-center gap-2 px-2.5 py-1">
              <span className="text-[11px] text-red-400">Delete?</span>
              <button onClick={() => handleDelete(p.id)} className="text-[11px] text-red-400 font-semibold hover:text-red-300">Y</button>
              <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-white/40 hover:text-white/60">N</button>
            </div>
          );
        }

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
            {!p.isDefault && p.holdingsCount === 0 && (
              <svg
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                className="w-2.5 h-2.5 ml-auto shrink-0 text-transparent group-hover:text-white/20 hover:!text-red-400 cursor-pointer transition-colors"
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
    </div>
  );
}
