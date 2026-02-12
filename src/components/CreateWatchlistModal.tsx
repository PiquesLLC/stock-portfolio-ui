import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const PRESET_COLORS = [
  '#00C805', // Green (Nala default)
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
];

interface CreateWatchlistModalProps {
  onClose: () => void;
  onSave: (data: { name: string; description?: string; color: string }) => void;
  initialData?: { name: string; description?: string; color: string };
  isEdit?: boolean;
}

export function CreateWatchlistModal({ onClose, onSave, initialData, isEdit }: CreateWatchlistModalProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [color, setColor] = useState(initialData?.color ?? PRESET_COLORS[0]);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    onSave({ name: trimmed, description: description.trim() || undefined, color });
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[90%] max-w-md bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] border border-white/20 dark:border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-rh-light-text dark:text-white">
            {isEdit ? 'Edit Watchlist' : 'New Watchlist'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1.5">Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Dividend Kings, Tech Watchlist"
              maxLength={50}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 focus:ring-1 focus:ring-rh-green/20 transition-colors"
            />
            {error && <p className="text-xs text-rh-red mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1.5">Description <span className="text-rh-light-muted/50 dark:text-rh-muted/50">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this watchlist for?"
              maxLength={200}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 focus:ring-1 focus:ring-rh-green/20 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-2">Color</label>
            <div className="flex gap-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1e1e1e] scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-sm font-bold bg-rh-green/15 text-rh-green hover:bg-rh-green/25 transition-colors"
            >
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
