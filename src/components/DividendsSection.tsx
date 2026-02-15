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
  onTickerClick?: (ticker: string) => void;
}

export function DividendsSection({ refreshTrigger, holdings, onTickerClick }: Props) {
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
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50">
            Dividends
          </h3>
          {/* DRIP Toggle */}
          <button
            onClick={handleDripToggle}
            disabled={dripLoading}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              dripEnabled
                ? 'bg-rh-green/10 text-rh-green'
                : 'text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
            title={dripEnabled ? 'DRIP enabled - dividends will be auto-reinvested' : 'Enable DRIP to auto-reinvest dividends'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dripEnabled ? 'bg-rh-green' : 'bg-rh-light-muted/30 dark:bg-rh-muted/30'}`} />
            DRIP
          </button>
        </div>
        <div className="flex items-center gap-3">
          {hasData && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`text-[10px] transition-colors ${showHistory ? 'text-rh-green' : 'text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-text dark:hover:text-rh-text'}`}
            >
              History
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-green transition-colors disabled:opacity-50"
            title="Sync dividend data"
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-green transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
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
            <div className="flex items-center gap-4 mb-3">
              <div>
                <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">YTD</p>
                <p className="text-base font-semibold text-rh-green">{formatCurrency(summary.totalYTD)}</p>
              </div>
              <span className="text-rh-light-muted/15 dark:text-rh-muted/15">|</span>
              <div>
                <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">All-time</p>
                <p className="text-base font-semibold text-rh-light-text dark:text-rh-text">{formatCurrency(summary.totalAllTime)}</p>
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider">Upcoming</p>
                  {totalEst > 0 && (
                    <div className="text-right">
                      <p className="text-base font-semibold text-rh-green">{formatCurrency(totalEst)}</p>
                      <p className="text-[9px] text-rh-light-muted/40 dark:text-rh-muted/40 -mt-0.5">estimated</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {sorted.slice(0, 8).map(ev => {
                    const holding = holdingsByTicker.get(ev.ticker);
                    const estPayout = holding ? holding.shares * ev.amountPerShare : null;
                    const exPassed = new Date(ev.exDate) <= now;
                    return (
                      <div key={ev.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); onTickerClick?.(ev.ticker); }}
                            className="font-medium text-rh-green hover:underline"
                          >{ev.ticker}</button>
                          {exPassed ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">confirmed</span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">expected</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-rh-light-muted/50 dark:text-rh-muted/50">{shortDate(ev.payDate)}</span>
                          {estPayout !== null && (
                            <span className="text-rh-green font-medium">{formatCurrency(estPayout)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* History table */}
          {showHistory && credits.length > 0 && (
            <div className="mt-3 pt-3 border-t border-rh-light-border/30 dark:border-rh-border/30 max-h-[280px] overflow-y-auto no-scrollbar">
              <div className="space-y-1.5">
                {credits.map(c => {
                  const isReinvested = c.reinvestment != null;
                  const eventType = c.dividendEvent?.dividendType;
                  const badgeType = eventType === 'drip' || isReinvested ? 'drip' : 'cash';
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCredit(c)}
                      className="w-full flex items-center justify-between text-xs py-1 px-1 -mx-1 rounded hover:bg-rh-light-bg dark:hover:bg-rh-dark/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); onTickerClick?.(c.ticker); }}
                          className="font-medium text-rh-green hover:underline"
                        >{c.ticker}</button>
                        <span className="text-rh-light-muted/60 dark:text-rh-muted/60">
                          {c.sharesEligible} sh
                        </span>
                        {badgeType === 'drip' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">
                            Reinvested
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                            Cash
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
                    <button
                      onClick={() => onTickerClick?.(t.ticker)}
                      className="font-medium text-rh-green hover:underline"
                    >{t.ticker}</button>
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

      <p className="text-[9px] text-rh-light-muted/30 dark:text-rh-muted/20 mt-2">
        Dividend data may be updated by issuers.
      </p>
    </div>
  );
}

// ─── Add Dividend Modal ──────────────────────────────────────────

function AddDividendModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [dividendType, setDividendType] = useState<'cash' | 'drip'>('cash');
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
        dividendType,
      });
      onAdded();
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border rounded-lg text-rh-light-text dark:text-rh-text";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/20 dark:border-white/[0.1] shadow-2xl rounded-2xl p-6 w-[340px]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-4">Add Dividend</h3>

        {/* Cash vs DRIP selector */}
        <div className="flex gap-1 p-1 rounded-lg bg-rh-light-bg dark:bg-rh-dark mb-3">
          <button
            type="button"
            onClick={() => setDividendType('cash')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              dividendType === 'cash'
                ? 'bg-rh-green text-white shadow-sm'
                : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
          >
            Cash Dividend
          </button>
          <button
            type="button"
            onClick={() => setDividendType('drip')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              dividendType === 'drip'
                ? 'bg-rh-green text-white shadow-sm'
                : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
            }`}
          >
            DRIP Reinvest
          </button>
        </div>

        {/* Help text */}
        <p className="text-[10px] text-rh-light-muted dark:text-rh-muted mb-4 leading-relaxed">
          {dividendType === 'cash'
            ? 'Cash dividend paid to your account. Does not change your share count.'
            : 'Dividend automatically reinvested to purchase additional shares of the stock.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="Ticker (e.g. AAPL)" value={ticker} onChange={e => setTicker(e.target.value)} className={inputClass} />
          <input type="number" step="0.0001" placeholder="Amount per share" value={amountPerShare} onChange={e => setAmountPerShare(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted">Ex-Date</label>
              <input type="date" value={exDate} onChange={e => setExDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-rh-light-muted dark:text-rh-muted">Pay Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inputClass} />
            </div>
          </div>
          {error && <p className="text-xs text-rh-red">{error}</p>}
          <div className="flex gap-2 pt-1">
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
              {saving ? 'Saving...' : `Add ${dividendType === 'cash' ? 'Cash' : 'DRIP'} Dividend`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
