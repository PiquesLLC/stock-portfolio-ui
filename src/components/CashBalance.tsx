import { useState, useEffect } from 'react';
import { updateSettings } from '../api';

interface Props {
  currentBalance: number;
  onUpdate: () => void;
  userId?: string;
}

export function CashBalance({ currentBalance, onUpdate, userId }: Props) {
  const [value, setValue] = useState(currentBalance.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Update value when currentBalance prop changes
  useEffect(() => {
    setValue(currentBalance.toString());
  }, [currentBalance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setError('Cash balance must be a non-negative number');
      return;
    }

    setLoading(true);
    try {
      await updateSettings({ cashBalance: numValue }, userId);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Cash Balance</h2>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg px-3 py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green focus:ring-2 focus:ring-rh-green/20"
              placeholder="0.00"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-rh-green hover:bg-green-600 disabled:bg-gray-600 text-black font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </form>
      {error && <p className="text-rh-red text-sm mt-2">{error}</p>}
    </div>
  );
}
