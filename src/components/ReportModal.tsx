import { useState } from 'react';
import { createPortal } from 'react-dom';
import { reportUser } from '../api';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUsername: string;
  context?: string;
}

const REASONS = [
  { value: 'misleading', label: 'Misleading Content' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const;

export function ReportModal({ isOpen, onClose, targetUserId, targetUsername, context }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await reportUser(targetUserId, reason, description || undefined, context);
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    setDescription('');
    setError('');
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Report user"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[90%] max-w-sm bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[18px] border border-white/20 dark:border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-rh-light-text dark:text-white">
            Report @{targetUsername}
          </h3>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-rh-green/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-rh-light-text dark:text-white">Report submitted</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">We'll review this shortly.</p>
          </div>
        ) : (
          <>
            {/* Reason dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1.5">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08]
                  bg-white dark:bg-[#1a1a1e]/95 text-rh-light-text dark:text-rh-text
                  focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors text-sm"
              >
                <option value="">Select a reason...</option>
                {REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Description textarea */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1.5">
                Additional details <span className="text-rh-light-muted dark:text-rh-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                rows={3}
                maxLength={1000}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08]
                  bg-white dark:bg-[#1a1a1e]/95 text-rh-light-text dark:text-rh-text
                  focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors
                  text-sm resize-none"
              />
              <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-1 text-right">
                {description.length}/1000
              </p>
            </div>

            {error && (
              <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !reason}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-rh-red/15 text-rh-red hover:bg-rh-red/25
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
