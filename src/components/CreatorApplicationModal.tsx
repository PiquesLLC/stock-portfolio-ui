import { useState, useEffect } from 'react';
import { applyAsCreator } from '../api';

interface CreatorApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatorApplicationModal({ isOpen, onClose, onSuccess }: CreatorApplicationModalProps) {
  const [acceptedCompliance, setAcceptedCompliance] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canSubmit = acceptedCompliance && acceptedTerms && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await applyAsCreator();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept terms');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4
        bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl
        border border-gray-200/60 dark:border-white/[0.1]
        rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/40 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
            Creator Terms
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors">
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto scrollbar-minimal space-y-4">
          {/* Description */}
          <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed">
            Share your portfolio insights and earn money from subscribers.
            You set your price, and keep 80% of subscription revenue.
          </p>

          {/* Compliance checkboxes */}
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptedCompliance}
                onChange={(e) => setAcceptedCompliance(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-white/20
                  text-rh-green focus:ring-rh-green/50 bg-transparent"
              />
              <span className="text-xs text-rh-light-text dark:text-rh-text leading-relaxed">
                I understand my published content is <strong>educational only</strong> and does not
                constitute investment advice. Subscribers make their own investment decisions.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-white/20
                  text-rh-green focus:ring-rh-green/50 bg-transparent"
              />
              <span className="text-xs text-rh-light-text dark:text-rh-text leading-relaxed">
                I agree to the Creator Terms of Service and understand Nala retains a 20% platform fee
                on subscription revenue.
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 dark:border-red-500/30 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200/40 dark:border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg
              text-rh-light-text dark:text-rh-text
              hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-lg
              bg-rh-green text-white hover:bg-rh-green/90 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Accepting...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
