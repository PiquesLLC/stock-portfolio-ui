import { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { getTransactions, addTransaction, deleteTransaction } from '../api';

interface Props {
  onTransactionChange: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TransactionManager({ onTransactionChange }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchTransactions = async () => {
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      await addTransaction({ type, amount: amountNum, date });
      await fetchTransactions();
      onTransactionChange();
      // Reset form
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      await fetchTransactions();
      onTransactionChange();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-rh-light-border/20 dark:border-white/[0.03]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Cash Flows ({transactions.length})</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Transaction list */}
          {transactions.length > 0 && (
            <div className="space-y-1">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-rh-light-bg/50 dark:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${
                      t.type === 'deposit' ? 'text-rh-green' : 'text-rh-red'
                    }`}>
                      {t.type === 'deposit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                    <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
                      {formatDate(t.date)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-red transition-colors p-1"
                    title="Delete"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form toggle */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="text-xs text-rh-green hover:text-rh-green/80 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Log Cash Flow
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'deposit' | 'withdrawal')}
                  className="text-xs px-2 py-1.5 rounded bg-rh-light-bg dark:bg-white/[0.03] border border-rh-light-border/30 dark:border-white/[0.06] text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green"
                >
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  min="0"
                  step="0.01"
                  className="flex-1 text-xs px-2 py-1.5 rounded bg-rh-light-bg dark:bg-white/[0.03] border border-rh-light-border/30 dark:border-white/[0.06] text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted/40 dark:placeholder:text-rh-muted/40 focus:outline-none focus:border-rh-green"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded bg-rh-light-bg dark:bg-white/[0.03] border border-rh-light-border/30 dark:border-white/[0.06] text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green"
                />
              </div>
              {error && <p className="text-xs text-rh-red">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-xs px-3 py-1.5 rounded bg-rh-green text-white hover:bg-rh-green/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Adding...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError('');
                  }}
                  className="text-xs px-3 py-1.5 rounded text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Info text */}
          <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40">
            Log deposits and withdrawals to get accurate time-weighted returns.
          </p>
        </div>
      )}
    </div>
  );
}
