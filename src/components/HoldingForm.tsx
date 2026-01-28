import { useState } from 'react';
import { addHolding } from '../api';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';

interface Props {
  onUpdate: () => void;
  heldTickers?: string[];
}

export function HoldingForm({ onUpdate, heldTickers = [] }: Props) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [averageCost, setAverageCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    const tickerTrimmed = ticker.trim().toUpperCase();
    if (!tickerTrimmed) {
      setError('Ticker is required');
      return;
    }

    const sharesNum = parseFloat(shares);
    if (isNaN(sharesNum) || sharesNum <= 0) {
      setError('Shares must be greater than 0');
      return;
    }

    const avgCostNum = parseFloat(averageCost);
    if (isNaN(avgCostNum) || avgCostNum < 0) {
      setError('Average cost must be 0 or greater');
      return;
    }

    setLoading(true);
    try {
      await addHolding({
        ticker: tickerTrimmed,
        shares: sharesNum,
        averageCost: avgCostNum,
      });
      setTicker('');
      setShares('');
      setAverageCost('');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Add / Update Holding</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-rh-light-muted dark:text-rh-muted mb-1">Ticker</label>
            <TickerAutocompleteInput
              value={ticker}
              onChange={setTicker}
              placeholder="AAPL"
              heldTickers={heldTickers}
            />
          </div>
          <div>
            <label className="block text-sm text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-full bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg px-3 py-2 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green focus:ring-2 focus:ring-rh-green/20"
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-sm text-rh-light-muted dark:text-rh-muted mb-1">Average Cost</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted dark:text-rh-muted">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={averageCost}
                onChange={(e) => setAverageCost(e.target.value)}
                className="w-full bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg px-3 py-2 pl-7 text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green focus:ring-2 focus:ring-rh-green/20"
                placeholder="150.00"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-rh-green hover:bg-green-600 disabled:bg-gray-600 text-black font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Holding'}
          </button>
          {error && <p className="text-rh-red text-sm">{error}</p>}
        </div>
      </form>
    </div>
  );
}
