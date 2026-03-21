import { useState, useEffect, useRef, useCallback } from 'react';
import { Goal, GoalInput } from '../types';
import { useToast } from '../context/ToastContext';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api';
import { ConfirmModal } from './ConfirmModal';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonths(months: number | null): string {
  if (months === null) return 'Unknown';
  if (months === 0) return 'Achieved!';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years}y ${remainingMonths}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function calculateTimeToGoalMonths(
  currentValue: number,
  targetValue: number,
  annualReturnPct: number,
  monthlyContribution: number,
): number | null {
  if (currentValue >= targetValue) return 0;
  if (annualReturnPct <= -100) return null;

  const monthlyRate = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const maxMonths = 1200; // 100 years

  for (let m = 1; m <= maxMonths; m++) {
    let fv: number;
    if (Math.abs(monthlyRate) < 1e-10) {
      fv = currentValue + monthlyContribution * m;
    } else {
      fv = currentValue * Math.pow(1 + monthlyRate, m) +
        monthlyContribution * (Math.pow(1 + monthlyRate, m) - 1) / monthlyRate;
    }
    if (fv >= targetValue) return m;
  }
  return null;
}

function getProjectedDate(months: number | null): string | null {
  if (months === null) return null;
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

interface GoalFormProps {
  onSubmit: (input: GoalInput) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<GoalInput>;
  isEditing?: boolean;
}

function GoalForm({ onSubmit, onCancel, initialValues, isEditing }: GoalFormProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [targetValue, setTargetValue] = useState(initialValues?.targetValue?.toString() || '');
  const [monthlyContribution, setMonthlyContribution] = useState(initialValues?.monthlyContribution?.toString() || '');
  const [deadline, setDeadline] = useState(initialValues?.deadline || '');
  const [trackSeparately, setTrackSeparately] = useState(true);
  const [currentValue, setCurrentValue] = useState(initialValues?.currentValue?.toString() || '0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const target = parseFloat(targetValue);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (isNaN(target) || target <= 0) {
      setError('Target value must be a positive number');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        name: name.trim(),
        targetValue: target,
        monthlyContribution: monthlyContribution ? parseFloat(monthlyContribution) : 0,
        deadline: deadline || null,
        currentValue: trackSeparately ? (parseFloat(currentValue) || 0) : null,
      });

      if (!isEditing) {
        setName('');
        setTargetValue('');
        setMonthlyContribution('');
        setDeadline('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-rh-red text-sm bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
          Goal Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Retirement, House Down Payment"
          className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Target Value ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="1000000"
            min="1"
            step="any"
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Monthly Contribution ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            placeholder="500"
            min="0"
            step="any"
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 transition-colors"
          />
        </div>
      </div>

      {/* Track separately toggle */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={trackSeparately}
            onClick={() => setTrackSeparately(prev => !prev)}
            className={`relative w-9 h-5 rounded-full transition-colors ${trackSeparately ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${trackSeparately ? 'translate-x-4' : ''}`} />
          </button>
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Track separately from portfolio</span>
            <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">Set your own starting amount instead of using portfolio value</p>
          </div>
        </label>
        {trackSeparately && (
          <div>
            <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
              Current Amount ($)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              placeholder="0"
              min="0"
              step="any"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-sm text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/50 dark:placeholder:text-rh-muted/50 focus:outline-none focus:border-rh-green/50 transition-colors"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-rh-green hover:bg-rh-green/90 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2 px-4 rounded-xl transition-colors"
        >
          {submitting ? 'Saving...' : isEditing ? 'Update Goal' : 'Add Goal'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface GoalCardProps {
  goal: Goal;
  onUpdate: (id: string, input: GoalInput) => Promise<void>;
  onDelete: (id: string) => void;
  annualizedPacePct?: number | null;
}

function GoalCard({ goal, onUpdate, onDelete, annualizedPacePct }: GoalCardProps) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(goal.name);
  const [editTarget, setEditTarget] = useState(goal.targetValue.toString());
  const [editMonthly, setEditMonthly] = useState(goal.monthlyContribution.toString());
  const [editTrackSeparately, setEditTrackSeparately] = useState((goal as any).currentValue != null);
  const [editCurrentValue, setEditCurrentValue] = useState(((goal as any).currentValue ?? 0).toString());
  const [saving, setSaving] = useState(false);

  function handleDelete() {
    setShowConfirm(true);
  }

  async function executeDelete() {
    setShowConfirm(false);
    try {
      setDeleting(true);
      await onDelete(goal.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete goal', 'error');
      setDeleting(false);
    }
  }

  const isAchieved = goal.currentProgress >= 100;
  const { timeToGoal, projectedDate } = goal;

  // Calculate "Your Pace" scenario
  const yourPaceMonths = annualizedPacePct != null && !isAchieved
    ? calculateTimeToGoalMonths(goal.currentPortfolioValue, goal.targetValue, annualizedPacePct, goal.monthlyContribution)
    : null;

  // On-track indicator
  let trackStatus: 'ahead' | 'on-track' | 'behind' | null = null;
  if (annualizedPacePct != null && !isAchieved && timeToGoal.base != null) {
    if (yourPaceMonths === null || annualizedPacePct <= 0) {
      trackStatus = 'behind';
    } else if (yourPaceMonths < timeToGoal.base * 0.9) {
      trackStatus = 'ahead';
    } else if (yourPaceMonths <= timeToGoal.base * 1.1) {
      trackStatus = 'on-track';
    } else {
      trackStatus = 'behind';
    }
  }

  return (
    <div className={`group p-4 sm:p-6 border-b transition-colors ${
      isAchieved
        ? 'border-rh-green/30 bg-rh-green/[0.02]'
        : 'border-gray-200/10 dark:border-white/[0.04] hover:bg-gray-100/40 dark:hover:bg-white/[0.02]'
    }`}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="text-base sm:text-lg font-semibold text-rh-light-text dark:text-rh-text bg-transparent border-b border-rh-green/40 focus:outline-none focus:border-rh-green w-full mb-1"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-rh-light-text dark:text-rh-text truncate">{goal.name}</h3>
              {trackStatus === 'ahead' && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rh-green/15 text-rh-green">Ahead</span>}
              {trackStatus === 'on-track' && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400">On track</span>}
              {trackStatus === 'behind' && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rh-red/15 text-rh-red">Behind</span>}
            </div>
          )}
          {editing ? (
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">Target:</span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">$</span>
                <input type="number" value={editTarget} onChange={e => setEditTarget(e.target.value)}
                  className="w-24 text-xs font-medium text-rh-light-text dark:text-rh-text bg-transparent border-b border-white/10 focus:outline-none focus:border-rh-green/40" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">/mo:</span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">$</span>
                <input type="number" value={editMonthly} onChange={e => setEditMonthly(e.target.value)}
                  className="w-16 text-xs font-medium text-rh-light-text dark:text-rh-text bg-transparent border-b border-white/10 focus:outline-none focus:border-rh-green/40" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-rh-light-muted dark:text-rh-muted">
              Target: {formatCurrency(goal.targetValue)}
            </p>
          )}
        </div>
        <div className={`flex gap-1 shrink-0 ${editing ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          {editing ? (
            <>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onUpdate(goal.id, {
                      name: editName.trim() || goal.name,
                      targetValue: parseFloat(editTarget) || goal.targetValue,
                      monthlyContribution: parseFloat(editMonthly) || 0,
                      currentValue: editTrackSeparately ? (parseFloat(editCurrentValue) || 0) : null,
                    });
                    setEditing(false);
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="p-1.5 rounded-lg text-rh-green hover:bg-rh-green/10 transition-colors"
                title="Save"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditName(goal.name);
                  setEditTarget(goal.targetValue.toString());
                  setEditMonthly(goal.monthlyContribution.toString());
                }}
                className="p-1.5 rounded-lg text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                title="Cancel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                title="Delete"
              >
                <svg className="w-4 h-4 text-rh-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline separate tracking toggle — only in edit mode */}
      {editing && (
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={editTrackSeparately}
            onClick={() => setEditTrackSeparately(prev => !prev)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${editTrackSeparately ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editTrackSeparately ? 'translate-x-4' : ''}`} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">Track separately</span>
            {editTrackSeparately && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">Saved so far: $</span>
                <input
                  type="number"
                  value={editCurrentValue}
                  onChange={e => setEditCurrentValue(e.target.value)}
                  className="w-20 text-[11px] font-medium text-rh-light-text dark:text-rh-text bg-transparent border-b border-white/10 focus:outline-none focus:border-rh-green/40"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-2.5 bg-gray-200/60 dark:bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isAchieved ? 'bg-rh-green' : 'bg-blue-500'}`}
              style={{ width: `${Math.max(1, Math.min(100, goal.currentProgress))}%` }}
            />
          </div>
          <span className={`text-xs font-medium tabular-nums shrink-0 ${isAchieved ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text'}`}>
            {goal.currentProgress.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-rh-light-muted dark:text-rh-muted">
          <span>{formatCurrency(goal.currentPortfolioValue)}</span>
          <span>{formatCurrency(goal.targetValue)}</span>
        </div>
      </div>

      {/* Time to Goal — flattened, no nested box */}
      {!isAchieved && timeToGoal && (
        <div className="mb-3 space-y-0.5">
          <div className="flex justify-between text-xs gap-2">
            <span className="text-rh-green">Optimistic</span>
            <span className="text-rh-green">{formatMonths(timeToGoal.optimistic)}{projectedDate.optimistic ? ` (${formatDate(projectedDate.optimistic)})` : ''}</span>
          </div>
          <div className="flex justify-between text-xs gap-2">
            <span className="text-blue-400">Base</span>
            <span className="text-blue-400">{formatMonths(timeToGoal.base)}{projectedDate.base ? ` (${formatDate(projectedDate.base)})` : ''}</span>
          </div>
          <div className="flex justify-between text-xs gap-2">
            <span className="text-rh-red">Pessimistic</span>
            <span className="text-rh-red">{formatMonths(timeToGoal.pessimistic)}{projectedDate.pessimistic ? ` (${formatDate(projectedDate.pessimistic)})` : ''}</span>
          </div>
          {annualizedPacePct != null && (
            <div className="flex justify-between text-xs border-t border-gray-200/20 dark:border-white/[0.04] pt-1 mt-1 gap-2">
              <span className="text-amber-400">Your Pace</span>
              <span className="text-amber-400">
                {yourPaceMonths !== null
                  ? `${formatMonths(yourPaceMonths)}${getProjectedDate(yourPaceMonths) ? ` (${formatDate(getProjectedDate(yourPaceMonths))})` : ''}`
                  : 'N/A'}
              </span>
            </div>
          )}
        </div>
      )}

      {isAchieved && (
        <div className="text-xs text-rh-green font-medium mt-1">Goal Achieved</div>
      )}
      {showConfirm && (
        <ConfirmModal
          title="Delete Goal"
          message={`Are you sure you want to delete "${goal.name}"?`}
          confirmLabel="Delete"
          danger
          onConfirm={executeDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

interface GoalsPageProps {
  annualizedPacePct?: number | null;
  refreshTrigger?: number;
  session?: string;
  portfolioId?: string;
}

const GOAL_TEMPLATES: { name: string; target: number; icon: string; monthly: number }[] = [
  { name: 'Retirement', target: 2000000, icon: '\u{1F3D6}\u{FE0F}', monthly: 500 },
  { name: 'House Down Payment', target: 80000, icon: '\u{1F3E0}', monthly: 1000 },
  { name: 'First $100K', target: 100000, icon: '\u{1F4AF}', monthly: 500 },
  { name: 'Emergency Fund', target: 30000, icon: '\u{1F6E1}\u{FE0F}', monthly: 500 },
  { name: 'Financial Independence', target: 1500000, icon: '\u{1F680}', monthly: 1000 },
];

export function GoalsPage({ annualizedPacePct, refreshTrigger, session, portfolioId }: GoalsPageProps = {}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [goalTemplate, setGoalTemplate] = useState<{ name: string; target: number; icon: string; monthly: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when portfolioId changes to avoid stale data flash
  const prevPortfolioIdRef = useRef(portfolioId);
  const currentPortfolioIdRef = useRef(portfolioId);
  currentPortfolioIdRef.current = portfolioId;
  useEffect(() => {
    if (prevPortfolioIdRef.current !== portfolioId) {
      prevPortfolioIdRef.current = portfolioId;
      setGoals([]);
      setLoading(true);
      setError(null);
      setShowForm(false);
    }
  }, [portfolioId]);

  const fetchGoals = useCallback(async (showSpinner = false) => {
    const fetchPortfolioId = portfolioId; // capture at call time
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const data = await getGoals(portfolioId);
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      setGoals(data);
    } catch (err) {
      if (fetchPortfolioId !== currentPortfolioIdRef.current) return; // stale, discard
      if (goals.length === 0) {
        setError(err instanceof Error ? err.message : 'Failed to load goals');
      }
    } finally {
      setLoading(false);
    }
  }, [goals.length, portfolioId]);

  // Initial fetch + re-fetch when portfolioId changes
  useEffect(() => {
    fetchGoals(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  // Re-fetch when portfolio refreshes — same reason: fetchGoals identity changes with goals.length
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchGoals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Poll: 30s during market, 120s otherwise
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const isMarketActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isMarketActive ? 30000 : 120000;
    intervalRef.current = setInterval(() => {
      if (document.hasFocus()) fetchGoals();
    }, pollMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchGoals, session]);

  async function handleCreateGoal(input: GoalInput) {
    await createGoal(input, portfolioId);
    await fetchGoals();
    setShowForm(false);
    setGoalTemplate(null);
  }


  async function handleDeleteGoal(id: string) {
    await deleteGoal(id, portfolioId);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-rh-green border-t-transparent mx-auto mb-3"></div>
          <p className="text-rh-light-muted dark:text-rh-muted">Loading goals...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-l-2 border-rh-red/40 pl-4 py-4">
        <p className="text-sm text-rh-red font-medium mb-1">Error loading goals</p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">{error}</p>
        <button
          onClick={() => fetchGoals()}
          className="mt-3 px-4 py-1.5 text-xs font-medium text-rh-green bg-rh-green/10 hover:bg-rh-green/20 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-rh-green" />
            <h2 className="text-lg sm:text-xl font-semibold text-rh-light-text dark:text-rh-text">Financial Goals</h2>
          </div>
          <p className="text-xs sm:text-sm text-rh-light-muted dark:text-rh-muted">
            Track your progress with optimistic, base, and pessimistic scenarios
          </p>
        </div>
      </div>

      {/* Edit is now inline on the goal card. Template picker / custom form is inline in the grid. */}

      {/* Goals List */}
      {goals.length === 0 ? (
        !showForm ? (
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-rh-green" />
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Choose a Goal</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GOAL_TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={async () => {
                    try {
                      await handleCreateGoal({ name: t.name, targetValue: t.target, monthlyContribution: t.monthly, currentValue: 0 });
                    } catch {}
                  }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-gray-200/10 dark:border-white/[0.04] hover:border-rh-green/40 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-all text-center"
                >
                  <span className="text-lg">{t.icon}</span>
                  <span className="text-[12px] font-medium text-rh-light-text dark:text-rh-text leading-tight">{t.name}</span>
                  <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">{formatCurrency(t.target)}</span>
                </button>
              ))}
              <button
                onClick={() => { setShowForm(true); setGoalTemplate({ name: '', target: 0, icon: '', monthly: 0 }); }}
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-dashed border-gray-300/40 dark:border-white/[0.08] hover:border-rh-green/40 hover:bg-rh-green/[0.04] transition-all"
              >
                <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="text-[12px] font-medium text-rh-light-muted dark:text-rh-muted">Custom</span>
              </button>
            </div>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onUpdate={async (id, input) => {
                await updateGoal(id, input, portfolioId);
                await fetchGoals();
              }}
              onDelete={handleDeleteGoal}
              annualizedPacePct={annualizedPacePct}
            />
          ))}
          {/* Add Goal card — shows template picker inline when clicked */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex flex-col items-center justify-center gap-2 min-h-[120px] rounded-lg border border-dashed border-gray-300/30 dark:border-white/[0.06] hover:border-rh-green/30 hover:bg-rh-green/[0.03] transition-all"
            >
              <svg className="w-6 h-6 text-rh-light-muted/50 dark:text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs text-rh-light-muted/60 dark:text-white/20 font-medium">Add Goal</span>
            </button>
          ) : !goalTemplate ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-rh-green" />
                  <span className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Choose a Goal</span>
                </div>
                <button onClick={() => setShowForm(false)} className="text-[10px] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {GOAL_TEMPLATES.map(t => (
                  <button
                    key={t.name}
                    onClick={async () => {
                      try {
                        await handleCreateGoal({ name: t.name, targetValue: t.target, monthlyContribution: t.monthly, currentValue: 0 });
                      } catch {}
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-md border border-gray-200/10 dark:border-white/[0.04] hover:border-rh-green/30 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-all text-center"
                  >
                    <span className="text-sm">{t.icon}</span>
                    <span className="text-[10px] font-medium text-rh-light-text dark:text-rh-text leading-tight">{t.name}</span>
                  </button>
                ))}
                <button
                  onClick={() => setGoalTemplate({ name: '', target: 0, icon: '', monthly: 0 })}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-md border border-dashed border-gray-300/30 dark:border-white/[0.06] hover:border-rh-green/30 hover:bg-rh-green/[0.04] transition-all"
                >
                  <svg className="w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span className="text-[10px] font-medium text-rh-light-muted dark:text-rh-muted">Custom</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full bg-rh-green" />
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Custom Goal</h3>
              </div>
              <GoalForm
                onSubmit={handleCreateGoal}
                onCancel={() => { setShowForm(false); setGoalTemplate(null); }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
