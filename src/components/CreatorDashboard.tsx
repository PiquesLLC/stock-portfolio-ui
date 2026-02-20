import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getCreatorDashboard, requestCreatorPayout, getReferralStats, ReferralStats } from '../api';
import { CreatorDashboard as CreatorDashboardData } from '../types';

interface CreatorDashboardProps {
  onBack: () => void;
  onSettingsClick: () => void;
  onLedgerClick: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const PAYOUT_MIN_CENTS = 5000; // $50.00 minimum — must match API

export function CreatorDashboard({ onBack, onSettingsClick, onLedgerClick }: CreatorDashboardProps) {
  const [data, setData] = useState<CreatorDashboardData | null>(null);
  const [referralData, setReferralData] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboard, referrals] = await Promise.all([
        getCreatorDashboard(),
        getReferralStats().catch(() => null),
      ]);
      setData(dashboard);
      setReferralData(referrals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handlePayout = async () => {
    if (!data) return;
    setPayoutLoading(true);
    setPayoutMessage(null);
    try {
      const result = await requestCreatorPayout();
      setPayoutMessage({ text: `Payout of ${formatCents(result.amountCents)} requested`, isError: false });
      loadDashboard();
    } catch (err) {
      setPayoutMessage({ text: err instanceof Error ? err.message : 'Payout failed', isError: true });
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-white/10 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-gray-200 dark:bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">{error || 'No data available'}</p>
        <button onClick={onBack} className="mt-3 text-sm text-rh-green hover:underline">Go back</button>
      </div>
    );
  }

  // Sparkline for monthly earnings
  const maxEarning = Math.max(...data.monthlyEarnings.map(e => e.amountCents), 1);
  const sparkW = 280;
  const sparkH = 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto px-4 py-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors">
            <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Creator Dashboard</h1>
        </div>
        <button
          onClick={onSettingsClick}
          className="px-3 py-1.5 text-xs font-medium rounded-lg
            bg-gray-100 dark:bg-white/[0.08] text-rh-light-text dark:text-rh-text
            hover:bg-gray-200 dark:hover:bg-white/[0.12] transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
          <p className="text-xl font-bold text-rh-green">{formatDollars(data.mrr)}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">MRR</p>
        </div>
        <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
          <p className="text-xl font-bold text-rh-light-text dark:text-rh-text">{data.activeSubscribers}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">Subscribers</p>
        </div>
        <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-3 text-center">
          <p className="text-xl font-bold text-rh-light-text dark:text-rh-text">{data.churnRatePct.toFixed(1)}%</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">Churn</p>
        </div>
      </div>

      {/* Monthly earnings chart */}
      {data.monthlyEarnings.length > 1 && (
        <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
            Monthly Earnings
          </h2>
          <div className="flex justify-center">
            <svg width={sparkW} height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`}>
              {data.monthlyEarnings.map((e, i) => {
                const barW = Math.max(8, sparkW / data.monthlyEarnings.length - 4);
                const barH = Math.max(2, (e.amountCents / maxEarning) * (sparkH - 16));
                const x = (sparkW / data.monthlyEarnings.length) * i + 2;
                return (
                  <g key={e.month}>
                    <rect
                      x={x}
                      y={sparkH - 12 - barH}
                      width={barW}
                      height={barH}
                      rx={3}
                      className="fill-rh-green/70"
                    />
                    <text
                      x={x + barW / 2}
                      y={sparkH - 2}
                      textAnchor="middle"
                      className="fill-gray-500 dark:fill-gray-400"
                      style={{ fontSize: '8px' }}
                    >
                      {e.month.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      )}

      {/* Payout section */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
          Payouts
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted">Available balance</p>
            <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(data.payoutBalanceCents)}</p>
          </div>
          <button
            onClick={handlePayout}
            disabled={payoutLoading || data.payoutBalanceCents < PAYOUT_MIN_CENTS}
            className="px-4 py-2 text-xs font-semibold rounded-lg
              bg-rh-green text-white hover:bg-rh-green/90 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {payoutLoading ? 'Processing...' : 'Request Payout'}
          </button>
        </div>
        {data.payoutBalanceCents < PAYOUT_MIN_CENTS && data.payoutBalanceCents > 0 && (
          <p className="mt-1.5 text-[10px] text-rh-light-muted dark:text-rh-muted">
            Minimum payout: {formatCents(PAYOUT_MIN_CENTS)} ({formatCents(PAYOUT_MIN_CENTS - data.payoutBalanceCents)} more needed)
          </p>
        )}
        {payoutMessage && (
          <p className={`mt-2 text-xs ${payoutMessage.isError ? 'text-red-600 dark:text-red-400' : 'text-rh-green'}`}>
            {payoutMessage.text}
          </p>
        )}
        <button
          onClick={onLedgerClick}
          className="mt-3 text-xs font-medium text-rh-green hover:text-rh-green/80 transition-colors"
        >
          View transaction history &rarr;
        </button>
      </section>

      {/* Recent events */}
      {data.recentEvents.length > 0 && (
        <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
            Recent Activity
          </h2>
          <div className="space-y-2">
            {data.recentEvents.slice(0, 10).map((event, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  event.type === 'created' ? 'bg-rh-green'
                  : event.type === 'canceled' ? 'bg-red-400'
                  : 'bg-gray-400'
                }`} />
                <span className="text-rh-light-text dark:text-rh-text flex-1">{event.description}</span>
                <span className="text-rh-light-muted dark:text-rh-muted flex-shrink-0">
                  {new Date(event.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Referral stats */}
      {referralData && referralData.totalReferrals > 0 && (
        <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
          bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
            Referrals
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{referralData.totalReferrals}</p>
              <p className="text-[10px] text-rh-light-muted dark:text-rh-muted">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-rh-green">{referralData.activeReferrals}</p>
              <p className="text-[10px] text-rh-light-muted dark:text-rh-muted">Active</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{referralData.conversionRate}%</p>
              <p className="text-[10px] text-rh-light-muted dark:text-rh-muted">Conversion</p>
            </div>
          </div>
          {referralData.recentReferrals.length > 0 && (
            <div className="space-y-1.5">
              {referralData.recentReferrals.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-rh-light-text dark:text-rh-text">@{r.username}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    r.status === 'active' ? 'bg-rh-green/10 text-rh-green'
                    : r.status === 'verified' ? 'bg-blue-500/10 text-blue-500'
                    : 'bg-gray-200 dark:bg-white/10 text-rh-light-muted dark:text-rh-muted'
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Total earnings */}
      <div className="text-center py-4">
        <p className="text-xs text-rh-light-muted dark:text-rh-muted">Total earnings (all time)</p>
        <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(data.totalEarningsCents)}</p>
      </div>
    </motion.div>
  );
}
