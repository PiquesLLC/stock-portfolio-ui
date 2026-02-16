import { useState, useEffect, useRef } from 'react';
import { DividendTimeline, DividendCredit } from '../types';
import { getDividendTimeline, reinvestDividend } from '../api';

interface Props {
  credit: DividendCredit | null;
  open: boolean;
  onClose: () => void;
  onReinvested?: () => void;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShares(val: number): string {
  return val.toFixed(6).replace(/\.?0+$/, '');
}

export function DividendDetailDrawer({ credit, open, onClose, onReinvested }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [timeline, setTimeline] = useState<DividendTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reinvesting, setReinvesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!credit || !open) {
      setTimeline(null);
      return;
    }

    setLoading(true);
    setError('');
    getDividendTimeline(credit.id)
      .then(setTimeline)
      .catch(() => setError('Failed to load dividend details'))
      .finally(() => setLoading(false));
  }, [credit, open]);

  const handleReinvest = async () => {
    if (!credit) return;
    setReinvesting(true);
    setError('');
    try {
      await reinvestDividend(credit.id);
      // Reload timeline to show reinvestment
      const updated = await getDividendTimeline(credit.id);
      setTimeline(updated);
      onReinvested?.();
    } catch (err: any) {
      setError(err.message || 'Failed to reinvest');
    } finally {
      setReinvesting(false);
    }
  };

  if (!open || !credit) return null;

  const isReinvested = timeline?.steps.reinvestment?.completed ?? credit.reinvestment != null;
  const eventType = credit.dividendEvent?.dividendType;
  const isCashType = eventType === 'cash';
  const canReinvest = !isReinvested && !isCashType && credit.status === 'posted';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Dividend Details"
        className="fixed top-0 right-0 h-full w-full max-w-md bg-rh-light-card dark:bg-rh-card border-l border-rh-light-border dark:border-rh-border
          shadow-xl z-50 overflow-y-auto outline-none animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">
                {credit.ticker} Dividend
              </h2>
              {eventType && eventType !== 'regular' && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  eventType === 'drip' ? 'bg-rh-green/10 text-rh-green' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {eventType === 'drip' ? 'DRIP' : 'Cash'}
                </span>
              )}
            </div>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              {formatDate(credit.creditedAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted
              hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-rh-green border-t-transparent" />
            </div>
          )}

          {error && (
            <p className="text-sm text-rh-red mb-4">{error}</p>
          )}

          {!loading && timeline && (
            <>
              {/* Timeline */}
              <div className="mb-6">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-4">
                  Timeline
                </h3>

                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-rh-light-border dark:bg-rh-border" />

                  {/* Steps */}
                  <div className="space-y-5">
                    {/* Announced (Ex-Date) */}
                    <TimelineStep
                      completed={timeline.steps.announced.completed}
                      title="Announced"
                      subtitle={`Ex-date: ${formatDate(timeline.steps.announced.date)}`}
                    />

                    {/* Payment */}
                    <TimelineStep
                      completed={timeline.steps.payment.completed}
                      title="Dividend Payment"
                      subtitle={formatDate(timeline.steps.payment.date)}
                      value={formatCurrency(timeline.totalAmount)}
                    />

                    {/* Reinvestment */}
                    {timeline.steps.reinvestment ? (
                      <TimelineStep
                        completed={timeline.steps.reinvestment.completed}
                        title="Dividend Reinvestment"
                        subtitle={timeline.steps.reinvestment.date ? formatDate(timeline.steps.reinvestment.date) : 'Pending'}
                        value={
                          timeline.steps.reinvestment.sharesPurchased
                            ? `+${formatShares(timeline.steps.reinvestment.sharesPurchased)} shares`
                            : undefined
                        }
                        subValue={
                          timeline.steps.reinvestment.pricePerShare
                            ? `@ ${formatCurrency(timeline.steps.reinvestment.pricePerShare)}`
                            : undefined
                        }
                      />
                    ) : (
                      <TimelineStep
                        completed={false}
                        title="Dividend Reinvestment"
                        subtitle="Not reinvested"
                        dimmed
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-rh-light-bg dark:bg-rh-dark rounded-xl p-4 mb-6">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-3">
                  Summary
                </h3>

                <div className="space-y-2">
                  <SummaryRow label="Eligible Shares" value={formatShares(timeline.sharesEligible)} />
                  <SummaryRow label="Amount per Share" value={formatCurrency(timeline.amountPerShare)} />
                  <SummaryRow label="Total Amount" value={formatCurrency(timeline.totalAmount)} highlight />

                  {timeline.steps.reinvestment?.completed && (
                    <>
                      <div className="border-t border-rh-light-border/30 dark:border-rh-border/30 my-2" />
                      <SummaryRow
                        label="Shares Purchased"
                        value={`+${formatShares(timeline.steps.reinvestment.sharesPurchased!)}`}
                        highlight
                        green
                      />
                      <SummaryRow
                        label="Price per Share"
                        value={formatCurrency(timeline.steps.reinvestment.pricePerShare!)}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Reinvest button (if not already reinvested) */}
              {canReinvest && (
                <button
                  onClick={handleReinvest}
                  disabled={reinvesting}
                  className="w-full py-3 px-4 bg-rh-green text-white font-medium rounded-xl hover:bg-rh-green/90 transition-colors disabled:opacity-50"
                >
                  {reinvesting ? 'Reinvesting...' : 'Reinvest This Dividend'}
                </button>
              )}

              {isReinvested && (
                <div className="flex items-center justify-center gap-2 py-3 text-rh-green">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Reinvested</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface TimelineStepProps {
  completed: boolean;
  title: string;
  subtitle: string;
  value?: string;
  subValue?: string;
  dimmed?: boolean;
}

function TimelineStep({ completed, title, subtitle, value, subValue, dimmed }: TimelineStepProps) {
  return (
    <div className="flex items-start gap-3">
      {/* Circle indicator */}
      <div
        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          completed
            ? 'bg-rh-green'
            : dimmed
            ? 'bg-rh-light-border dark:bg-rh-border'
            : 'bg-rh-light-bg dark:bg-rh-dark border-2 border-rh-light-border dark:border-rh-border'
        }`}
      >
        {completed && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 ${dimmed ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">{title}</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">{subtitle}</p>
          </div>
          {value && (
            <div className="text-right">
              <p className="text-sm font-semibold text-rh-green">{value}</p>
              {subValue && (
                <p className="text-[10px] text-rh-light-muted dark:text-rh-muted">{subValue}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  green?: boolean;
}

function SummaryRow({ label, value, highlight, green }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-rh-light-muted dark:text-rh-muted">{label}</span>
      <span
        className={`text-sm ${
          highlight
            ? green
              ? 'font-semibold text-rh-green'
              : 'font-semibold text-rh-light-text dark:text-rh-text'
            : 'text-rh-light-text dark:text-rh-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
