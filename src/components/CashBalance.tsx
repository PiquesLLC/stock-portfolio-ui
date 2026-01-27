import { useState } from 'react';
import { updateCashBalance } from '../api';

interface Props {
  currentBalance: number;
  onUpdate: () => void;
}

export function CashBalance({ currentBalance, onUpdate }: Props) {
  const [value, setValue] = useState(currentBalance.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      await updateCashBalance(numValue);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-rh-card border border-rh-border rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Cash Balance</h2>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-muted">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-rh-dark border border-rh-border rounded-lg px-3 py-2 pl-7 text-white focus:outline-none focus:border-rh-green"
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
