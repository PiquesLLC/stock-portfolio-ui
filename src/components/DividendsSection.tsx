import { useState, useEffect, useCallback } from 'react';
import { DividendEvent, DividendCredit, DividendSummary, Holding } from '../types';
import {
  getUpcomingDividends,
  getDividendSummary,
  getDividendCredits,
  addDividendEvent,
  syncDividends,
  getDripSettings,
  updateDripSettings,
} from '../api';
import { DividendDetailDrawer } from './DividendDetailDrawer';

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  refreshTrigger?: number;
  holdings?: Holding[];
}

export function DividendsSection({ refreshTrigger, holdings }: Props) {
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [upcoming, setUpcoming] = useState<DividendEvent[]>([]);
  const [credits, setCredits] = useState<DividendCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState('');
  const [dripEnabled, setDripEnabled] = useState(false);
  const [dripLoading, setDripLoading] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<DividendCredit | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [sum, upcom, creds, drip] = await Promise.all([
        getDividendSummary(),
        getUpcomingDividends(),
        getDividendCredits(),
        getDripSettings(),
      ]);
      setSummary(sum);
      setUpcoming(upcom);
      setCredits(creds);
      setDripEnabled(drip.enabled);
    } catch {
      setError('Failed to load dividend data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDripToggle = async () => {
    setDripLoading(true);
    try {
      const result = await updateDripSettings(!dripEnabled);
      setDripEnabled(result.enabled);
    } catch {
      setError('Failed to update DRIP setting');
    } finally {
      setDripLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncDividends();
      await fetchData();
    } catch {
      setError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Match upcoming events with held shares for estimated payout
  const holdingsByTicker = new Map(holdings?.map(h => [h.ticker, h]) ?? []);

  if (loading && !summary) {
    return (
      <div className="px-6 py-4">
        <div className="h-16 flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-rh-green border-t-transparent"></div>
        </div>
      </div>
    );
  }

  const hasData = summary && (summary.totalAllTime > 0 || upcoming.length > 0);

  return (
    <div className="px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50">
            Dividends
          </h3>
          {/* DRIP Toggle */}
          <button
            onClick={handleDripToggle}
            disabled={dripLoading}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              dripEnabled
                ? 'bg-rh-green/10 text-rh-green'
                : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            title={dripEnabled ? 'DRIP enabled - dividends will be auto-reinvested' : 'Enable DRIP to auto-reinvest dividends'}
          >
            <span className={`w-2 h-2 rounded-full ${dripEnabled ? 'bg-rh-green' : 'bg-rh-light-muted/40 dark:bg-rh-muted/40'}`} />
            DRIP {dripEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-green transition-colors"
          >
            + Add
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-green transition-colors disabled:opacity-50"
            title="Sync dividend data from Yahoo Finance"
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-rh-red mb-2">{error}</p>
      )}

      {!hasData ? (
        <p className="text-sm text-rh-light-muted dark:text-rh-muted text-center py-3">
          No dividend data yet. Click Sync to fetch from Yahoo Finance.
        </p>
      ) : (
        <>
          {/* Summary totals */}
          {summary && (summary.totalYTD > 0 || summary.totalAllTime > 0) && (
            <div className="flex items-center gap-6 mb-3">
              <div>
                <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">YTD</p>
                <p className="text-lg font-semibold text-rh-green">{formatCurrency(summary.totalYTD)}</p>
              </div>
              <div>
                <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">All-time</p>
                <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{formatCurrency(summary.totalAllTime)}</p>
              </div>
            </div>
          )}

          {/* Upcoming dividends */}
          {upcoming.length > 0 && (() => {
            const now = new Date();
            // Sort by pay date ascending
            const sorted = [...upcoming].sort((a, b) => new Date(a.payDate).getTime() - new Date(b.payDate).getTime());
            // Compute total estimated payout
            const totalEst = sorted.reduce((sum, ev) => {
              const h = holdingsByTicker.get(ev.ticker);
              return sum + (h ? h.shares * ev.amountPerShare : 0);
            }, 0);

            return (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">Upcoming</p>
                  {totalEst > 0 && (
                    <p className="text-xs text-rh-light-muted/40 dark:text-rh-muted/40">
                      Est. total: <span className="text-rh-green font-medium">{formatCurrency(totalEst)}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  {sorted.slice(0, 8).map(ev => {
                    const holding = holdingsByTicker.get(ev.ticker);
                    const estPayout = holding ? holding.shares * ev.amountPerShare : null;
                    const exPassed = new Date(ev.exDate) <= now;
                    return (
                      <div key={ev.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-rh-light-text dark:text-rh-text">{ev.ticker}</span>
                          <span className="text-rh-light-muted/60 dark:text-rh-muted/60">
                            ${ev.amountPerShare.toFixed(4)}/sh
                            {holding && <> &times; {holding.shares}</>}
                          </span>
                          {!exPassed && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">expected</span>
                          )}
                          {exPassed && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">confirmed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {estPayout !== null && (
                            <span className="text-rh-green font-medium">{formatCurrency(estPayout)}</span>
                          )}
                          <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{shortDate(ev.payDate)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
          >
            {showHistory ? 'Hide history' : 'View history'}
          </button>

          {/* History table */}
          {showHistory && credits.length > 0 && (
            <div className="mt-3 pt-3 border-t border-rh-light-border/30 dark:border-rh-border/30">
              <div className="space-y-1.5">
                {credits.map(c => {
                  const isReinvested = c.reinvestment != null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCredit(c)}
                      className="w-full flex items-center justify-between text-xs py-1 px-1 -mx-1 rounded hover:bg-rh-light-bg dark:hover:bg-rh-dark/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-rh-light-text dark:text-rh-text">{c.ticker}</span>
                        <span className="text-rh-light-muted/60 dark:text-rh-muted/60">
                          {c.sharesEligible} sh
                        </span>
                        {isReinvested && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">
                            Reinvested
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-rh-green font-medium">{formatCurrency(c.amountGross)}</span>
                        {isReinvested && c.reinvestment && (
                          <span className="text-rh-green/70 text-[10px]">
                            +{c.reinvestment.sharesPurchased.toFixed(4)} sh
                          </span>
                        )}
                        <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{shortDate(c.creditedAt)}</span>
                        <svg className="w-3.5 h-3.5 text-rh-light-muted/40 dark:text-rh-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
              {credits.length === 0 && (
                <p className="text-xs text-rh-light-muted dark:text-rh-muted text-center py-2">
                  No dividends credited yet
                </p>
              )}
            </div>
          )}

          {/* Per-ticker breakdown */}
          {showHistory && summary && summary.byTicker.length > 0 && (
            <div className="mt-3 pt-3 border-t border-rh-light-border/30 dark:border-rh-border/30">
              <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider mb-1.5">By ticker</p>
              <div className="space-y-1">
                {summary.byTicker.map(t => (
                  <div key={t.ticker} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-rh-light-text dark:text-rh-text">{t.ticker}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-rh-green">{formatCurrency(t.total)}</span>
                      <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{t.count} payouts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddDividendModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); fetchData(); }}
        />
      )}

      {/* Dividend detail drawer */}
      <DividendDetailDrawer
        credit={selectedCredit}
        open={selectedCredit !== null}
        onClose={() => setSelectedCredit(null)}
        onReinvested={fetchData}
      />

      <p className="text-[9px] text-rh-light-muted/30 dark:text-rh-muted/30 mt-3">
        Dividend info may be updated by issuers. Not financial advice.
      </p>
    </div>
  );
}

// ─── Add Dividend Modal ──────────────────────────────────────────

function AddDividendModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [ticker, setTicker] = useState('');
  const [amountPerShare, setAmountPerShare] = useState('');
  const [exDate, setExDate] = useState('');
  const [payDate, setPayDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !amountPerShare || !exDate || !payDate) {
      setError('All fields required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDividendEvent({
        ticker: ticker.toUpperCase(),
        amountPerShare: parseFloat(amountPerShare),
        exDate,
        payDate,
      });
      onAdded();
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 w-80"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-4">Add Dividend Event</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Ticker (e.g. AAPL)"
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Amount per share"
            value={amountPerShare}
            onChange={e => setAmountPerShare(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted">Ex-Date</label>
              <input
                type="date"
                value={exDate}
                onChange={e => setExDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text"
              />
            </div>
            <div>
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted">Pay Date</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text"
              />
            </div>
          </div>
          {error && <p className="text-xs text-rh-red">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm text-rh-light-muted dark:text-rh-muted border border-rh-light-border dark:border-rh-border rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-rh-green rounded-lg hover:bg-rh-green/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
