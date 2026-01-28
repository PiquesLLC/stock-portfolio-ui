import { useState, useEffect } from 'react';
import { Goal, GoalInput } from '../types';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api';

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
          className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
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
            className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
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
            className="w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text placeholder-rh-light-muted dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green"
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
            className="px-4 py-2 rounded-lg border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
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
}

function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete goal "${goal.name}"?`)) return;

    try {
      setDeleting(true);
      await onDelete(goal.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete goal');
      setDeleting(false);
    }
  }

  const isAchieved = goal.currentProgress >= 100;
  const { timeToGoal, projectedDate } = goal;

  return (
    <div className={`bg-rh-light-card dark:bg-rh-card border rounded-lg p-6 shadow-sm dark:shadow-none ${
      isAchieved ? 'border-rh-green' : 'border-rh-light-border dark:border-rh-border'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{goal.name}</h3>
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
        <div className="mb-4 p-3 bg-rh-light-bg dark:bg-rh-dark rounded-lg">
          <p className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">Estimated Time to Goal</p>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-rh-green">Optimistic</span>
              <span className="text-rh-green">
                {formatMonths(timeToGoal.optimistic)}
                {projectedDate.optimistic && ` (${formatDate(projectedDate.optimistic)})`}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-400">Base Case</span>
              <span className="text-blue-400">
                {formatMonths(timeToGoal.base)}
                {projectedDate.base && ` (${formatDate(projectedDate.base)})`}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-rh-red">Pessimistic</span>
              <span className="text-rh-red">
                {formatMonths(timeToGoal.pessimistic)}
                {projectedDate.pessimistic && ` (${formatDate(projectedDate.pessimistic)})`}
              </span>
            </div>
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
    </div>
  );
}

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  async function fetchGoals() {
    try {
      setLoading(true);
      setError(null);
      const data = await getGoals();
      setGoals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGoals();
  }, []);

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
          onClick={fetchGoals}
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-rh-light-text dark:text-rh-text">Financial Goals</h2>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            Track your progress with optimistic, base, and pessimistic scenarios
          </p>
        </div>
        {!showForm && !editingGoal && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rh-green text-black rounded-lg font-medium hover:bg-green-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Goal
          </button>
        )}
      </div>

      {/* Add Goal Form */}
      {showForm && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Add New Goal</h3>
          <GoalForm
            onSubmit={handleCreateGoal}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Edit Goal Form */}
      {editingGoal && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
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
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-12 text-center">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
