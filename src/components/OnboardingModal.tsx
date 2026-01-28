import { useState } from 'react';
import { setBaseline } from '../api';

interface Props {
  onComplete: () => void;
  hasExistingHoldings: boolean;
}

export function OnboardingModal({ onComplete, hasExistingHoldings }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetBaseline = async (type: 'fresh_start' | 'existing_portfolio') => {
    try {
      setLoading(true);
      setError('');
      await setBaseline({ type });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set baseline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-rh-card border border-rh-border rounded-xl max-w-lg w-full p-6">
        <h2 className="text-xl font-bold mb-2">Welcome to Stock Portfolio</h2>
        <p className="text-rh-muted mb-6">
          To track your performance accurately, we need to set a starting point.
        </p>

        {error && (
          <div className="bg-rh-red/10 border border-rh-red/30 rounded-lg p-3 mb-4">
            <p className="text-rh-red text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {hasExistingHoldings ? (
            <>
              <button
                onClick={() => handleSetBaseline('existing_portfolio')}
                disabled={loading}
                className="w-full bg-rh-green hover:bg-green-600 disabled:opacity-50 text-black font-semibold px-4 py-3 rounded-lg transition-colors text-left"
              >
                <div className="font-semibold">Start tracking from today</div>
                <div className="text-sm text-black/70 mt-1">
                  Your current portfolio value will be the baseline. Future performance will be measured from this point.
                </div>
              </button>

              <div className="text-center text-rh-muted text-sm">or</div>

              <button
                onClick={() => handleSetBaseline('fresh_start')}
                disabled={loading}
                className="w-full bg-rh-dark hover:bg-rh-border disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-lg transition-colors border border-rh-border text-left"
              >
                <div className="font-semibold">Fresh start (baseline = $0)</div>
                <div className="text-sm text-rh-muted mt-1">
                  Useful if you're adding holdings you just bought. All gains/losses will be counted.
                </div>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSetBaseline('fresh_start')}
              disabled={loading}
              className="w-full bg-rh-green hover:bg-green-600 disabled:opacity-50 text-black font-semibold px-4 py-3 rounded-lg transition-colors"
            >
              {loading ? 'Setting up...' : 'Start Tracking My Portfolio'}
            </button>
          )}
        </div>

        <p className="text-xs text-rh-muted mt-6 text-center">
          You can add your broker's lifetime stats later for a complete picture.
        </p>
      </div>
    </div>
  );
}
