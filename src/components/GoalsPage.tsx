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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const target = parseFloat(targetValue);
    if (!name.trim()) {
      setError('Name is required');
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
          className="w-full px-3 py-2 rounded-lg bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Target Value ($)
          </label>
          <input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="1000000"
            min="1"
            step="any"
            className="w-full px-3 py-2 rounded-lg bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Monthly Contribution ($)
          </label>
          <input
            type="number"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            placeholder="500"
            min="0"
            step="any"
            className="w-full px-3 py-2 rounded-lg bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-rh-green hover:bg-green-600 disabled:bg-green-800 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          {submitting ? 'Saving...' : isEditing ? 'Update Goal' : 'Add Goal'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-rh-light-text dark:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
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
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  annualizedPacePct?: number | null;
}

function GoalCard({ goal, onEdit, onDelete, annualizedPacePct }: GoalCardProps) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
  const yourPaceDate = getProjectedDate(yourPaceMonths);

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
    <div className={`bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm border rounded-lg p-4 sm:p-6 shadow-sm dark:shadow-none ${
      isAchieved ? 'border-rh-green' : 'border-gray-200/30 dark:border-white/[0.04]'
    }`}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-rh-light-text dark:text-rh-text truncate">{goal.name}</h3>
            {trackStatus === 'ahead' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rh-green/15 text-rh-green">Ahead</span>
            )}
            {trackStatus === 'on-track' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400">On track</span>
            )}
            {trackStatus === 'behind' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rh-red/15 text-rh-red">Behind</span>
            )}
          </div>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            Target: {formatCurrency(goal.targetValue)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(goal)}
            className="p-2 rounded-lg hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4 text-rh-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-rh-light-muted dark:text-rh-muted">Progress</span>
          <span className={isAchieved ? 'text-rh-green font-medium' : 'text-rh-light-text dark:text-rh-text'}>
            {goal.currentProgress.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 bg-rh-light-border dark:bg-rh-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isAchieved ? 'bg-rh-green' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, goal.currentProgress)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-rh-light-muted dark:text-rh-muted mt-1">
          <span>{formatCurrency(goal.currentPortfolioValue)}</span>
          <span>{formatCurrency(goal.targetValue)}</span>
        </div>
      </div>

      {/* Time to Goal Range */}
      {!isAchieved && timeToGoal && (
        <div className="mb-4 p-3 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg">
          <p className="text-xs sm:text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">Estimated Time to Goal</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs sm:text-sm gap-2">
              <span className="text-rh-green shrink-0">Optimistic</span>
              <span className="text-rh-green text-right">
                {formatMonths(timeToGoal.optimistic)}
                <span className="hidden sm:inline">{projectedDate.optimistic && ` (${formatDate(projectedDate.optimistic)})`}</span>
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm gap-2">
              <span className="text-blue-400 shrink-0">Base Case</span>
              <span className="text-blue-400 text-right">
                {formatMonths(timeToGoal.base)}
                <span className="hidden sm:inline">{projectedDate.base && ` (${formatDate(projectedDate.base)})`}</span>
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm gap-2">
              <span className="text-rh-red shrink-0">Pessimistic</span>
              <span className="text-rh-red text-right">
                {formatMonths(timeToGoal.pessimistic)}
                <span className="hidden sm:inline">{projectedDate.pessimistic && ` (${formatDate(projectedDate.pessimistic)})`}</span>
              </span>
            </div>
            {annualizedPacePct != null && (
              <div className="flex justify-between text-xs sm:text-sm border-t border-gray-200/30 dark:border-white/[0.04] pt-1 mt-1 gap-2">
                <span className="text-amber-400 shrink-0">Your Pace ({annualizedPacePct > 0 ? '+' : ''}{annualizedPacePct.toFixed(1)}%)</span>
                <span className="text-amber-400 text-right">
                  {yourPaceMonths !== null
                    ? `${formatMonths(yourPaceMonths)}${yourPaceDate ? ` (${formatDate(yourPaceDate)})` : ''}`
                    : 'N/A'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {isAchieved && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <span className="text-rh-green font-medium">Goal Achieved!</span>
        </div>
      )}

      {/* Monthly Contribution */}
      <div className="text-sm">
        <span className="text-rh-light-muted dark:text-rh-muted">Monthly Contribution: </span>
        <span className="font-medium text-rh-light-text dark:text-rh-text">
          {goal.monthlyContribution > 0 ? formatCurrency(goal.monthlyContribution) : 'None'}
        </span>
      </div>
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
}

export function GoalsPage({ annualizedPacePct, refreshTrigger, session }: GoalsPageProps = {}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGoals = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const data = await getGoals();
      setGoals(data);
    } catch (err) {
      if (goals.length === 0) {
        setError(err instanceof Error ? err.message : 'Failed to load goals');
      }
    } finally {
      setLoading(false);
    }
  }, [goals.length]);

  // Initial fetch
  useEffect(() => {
    fetchGoals(true);
  }, []);

  // Re-fetch when portfolio refreshes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchGoals();
    }
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
    await createGoal(input);
    await fetchGoals();
    setShowForm(false);
  }

  async function handleUpdateGoal(input: GoalInput) {
    if (!editingGoal) return;
    await updateGoal(editingGoal.id, input);
    await fetchGoals();
    setEditingGoal(null);
  }

  async function handleDeleteGoal(id: string) {
    await deleteGoal(id);
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
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
        <p className="text-rh-red font-medium mb-2">Error loading goals</p>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">{error}</p>
        <button
          onClick={() => fetchGoals()}
          className="mt-3 px-4 py-2 bg-rh-green text-black rounded-lg font-medium hover:bg-green-600 transition-colors"
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
          <h2 className="text-lg sm:text-xl font-semibold text-rh-light-text dark:text-rh-text">Financial Goals</h2>
          <p className="text-xs sm:text-sm text-rh-light-muted dark:text-rh-muted">
            Track your progress with optimistic, base, and pessimistic scenarios
          </p>
        </div>
        {!showForm && !editingGoal && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-rh-green text-black rounded-lg font-medium hover:bg-green-600 transition-colors text-sm shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Goal</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {/* Add Goal Form */}
      {showForm && (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Add New Goal</h3>
          <GoalForm
            onSubmit={handleCreateGoal}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Edit Goal Form */}
      {editingGoal && (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Edit Goal</h3>
          <GoalForm
            onSubmit={handleUpdateGoal}
            onCancel={() => setEditingGoal(null)}
            initialValues={{
              name: editingGoal.name,
              targetValue: editingGoal.targetValue,
              monthlyContribution: editingGoal.monthlyContribution,
              deadline: editingGoal.deadline?.split('T')[0] || '',
            }}
            isEditing
          />
        </div>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-medium text-rh-light-text dark:text-rh-text mb-2">No goals yet</h3>
          <p className="text-rh-light-muted dark:text-rh-muted mb-4">
            Set financial goals to track your progress with realistic time estimates
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-rh-green text-black rounded-lg font-medium hover:bg-green-600 transition-colors"
            >
              Create Your First Goal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={setEditingGoal}
              onDelete={handleDeleteGoal}
              annualizedPacePct={annualizedPacePct}
            />
          ))}
        </div>
      )}
    </div>
  );
}
