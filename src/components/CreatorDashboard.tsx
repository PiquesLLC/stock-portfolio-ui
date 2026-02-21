import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCreatorDashboard, getCreatorLedger, requestCreatorPayout, getReferralStats, ReferralStats } from '../api';
import { CreatorDashboard as CreatorDashboardData, CreatorLedgerEntry, CreatorLedgerEntryType, CreatorLedgerSummary } from '../types';

// ── Use mock data until real creator subscriptions exist ──
const USE_MOCK = true;

const MOCK_DATA: CreatorDashboardData = {
  mrr: 126_00 * 5,
  activeSubscribers: 126,
  churnRatePct: 3.2,
  totalEarningsCents: 4_218_40,
  payoutBalanceCents: 7_840,
  monthlyEarnings: [
    { month: '2025-03', amountCents: 4_200, referralBonusCents: 0 },
    { month: '2025-04', amountCents: 7_800, referralBonusCents: 500 },
    { month: '2025-05', amountCents: 11_600, referralBonusCents: 500 },
    { month: '2025-06', amountCents: 14_400, referralBonusCents: 1_000 },
    { month: '2025-07', amountCents: 16_200, referralBonusCents: 1_500 },
    { month: '2025-08', amountCents: 15_800, referralBonusCents: 1_000 },
    { month: '2025-09', amountCents: 18_000, referralBonusCents: 2_000 },
    { month: '2025-10', amountCents: 32_400, referralBonusCents: 3_200 },
    { month: '2025-11', amountCents: 41_200, referralBonusCents: 4_000 },
    { month: '2025-12', amountCents: 55_800, referralBonusCents: 5_500 },
    { month: '2026-01', amountCents: 68_000, referralBonusCents: 6_800 },
    { month: '2026-02', amountCents: 63_000, referralBonusCents: 5_200 },
  ],
  recentEvents: [
    { type: 'created', description: 'New subscription from @TechTrader99', createdAt: '2026-02-20T14:22:00Z' },
    { type: 'renewed', description: 'Subscription renewed by @MarketMaven', createdAt: '2026-02-19T09:15:00Z' },
    { type: 'created', description: 'New subscription from @AlphaSeeker', createdAt: '2026-02-18T18:30:00Z' },
    { type: 'canceled', description: 'Subscription canceled by @CasualInvestor', createdAt: '2026-02-17T11:45:00Z' },
    { type: 'renewed', description: 'Subscription renewed by @DividendKing', createdAt: '2026-02-16T08:20:00Z' },
    { type: 'created', description: 'New subscription from @SwingQueen', createdAt: '2026-02-15T16:00:00Z' },
    { type: 'payment_failed', description: 'Payment failed for @BudgetBull', createdAt: '2026-02-14T22:10:00Z' },
    { type: 'renewed', description: 'Subscription renewed by @ValueHunter', createdAt: '2026-02-13T07:50:00Z' },
  ],
};

const MOCK_REFERRALS: ReferralStats = {
  totalReferrals: 34,
  verifiedReferrals: 28,
  activeReferrals: 22,
  conversionRate: 64.7,
  recentReferrals: [
    { id: '1', username: 'TechTrader99', displayName: 'Tech Trader', status: 'active', joinedAt: '2026-01-15T00:00:00Z' },
    { id: '2', username: 'AlphaSeeker', displayName: 'Alpha Seeker', status: 'active', joinedAt: '2026-01-20T00:00:00Z' },
    { id: '3', username: 'SwingQueen', displayName: 'Swing Queen', status: 'verified', joinedAt: '2026-02-01T00:00:00Z' },
    { id: '4', username: 'BudgetBull', displayName: 'Budget Bull', status: 'signed_up', joinedAt: '2026-02-10T00:00:00Z' },
    { id: '5', username: 'MarketMaven', displayName: 'Market Maven', status: 'active', joinedAt: '2026-02-14T00:00:00Z' },
  ],
};

const MOCK_LEDGER_SUMMARY: CreatorLedgerSummary = {
  availableCents: 7_840,
  reservedCents: 1_200,
  pendingPayoutCents: 0,
};

const MOCK_LEDGER_ENTRIES: CreatorLedgerEntry[] = [
  { id: 'l1', createdAt: '2026-02-20T14:22:00Z', type: 'earning', amountCents: 400, description: 'Subscription — @TechTrader99', subscriptionId: 's1' },
  { id: 'l2', createdAt: '2026-02-20T14:22:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @TechTrader99', subscriptionId: 's1' },
  { id: 'l3', createdAt: '2026-02-19T09:15:00Z', type: 'earning', amountCents: 400, description: 'Renewal — @MarketMaven', subscriptionId: 's2' },
  { id: 'l4', createdAt: '2026-02-19T09:15:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @MarketMaven', subscriptionId: 's2' },
  { id: 'l5', createdAt: '2026-02-18T18:30:00Z', type: 'earning', amountCents: 400, description: 'Subscription — @AlphaSeeker', subscriptionId: 's3' },
  { id: 'l6', createdAt: '2026-02-18T18:30:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @AlphaSeeker', subscriptionId: 's3' },
  { id: 'l7', createdAt: '2026-02-15T16:00:00Z', type: 'earning', amountCents: 400, description: 'Subscription — @SwingQueen', subscriptionId: 's4' },
  { id: 'l8', createdAt: '2026-02-15T16:00:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @SwingQueen', subscriptionId: 's4' },
  { id: 'l9', createdAt: '2026-02-14T22:10:00Z', type: 'refund', amountCents: -400, description: 'Refund — @BudgetBull (payment failed)', subscriptionId: 's5' },
  { id: 'l10', createdAt: '2026-02-10T12:00:00Z', type: 'payout', amountCents: -5000, description: 'Payout to bank account — ****4829', subscriptionId: null },
  { id: 'l11', createdAt: '2026-02-08T10:00:00Z', type: 'earning', amountCents: 400, description: 'Renewal — @DividendKing', subscriptionId: 's6' },
  { id: 'l12', createdAt: '2026-02-08T10:00:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @DividendKing', subscriptionId: 's6' },
  { id: 'l13', createdAt: '2026-02-05T08:00:00Z', type: 'earning', amountCents: 400, description: 'Renewal — @ValueHunter', subscriptionId: 's7' },
  { id: 'l14', createdAt: '2026-02-05T08:00:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @ValueHunter', subscriptionId: 's7' },
  { id: 'l15', createdAt: '2026-02-01T06:00:00Z', type: 'earning', amountCents: 400, description: 'Subscription — @GrowthGuru', subscriptionId: 's8' },
  { id: 'l16', createdAt: '2026-02-01T06:00:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @GrowthGuru', subscriptionId: 's8' },
  { id: 'l17', createdAt: '2026-01-28T14:00:00Z', type: 'earning', amountCents: 400, description: 'Renewal — @OptionsOracle', subscriptionId: 's9' },
  { id: 'l18', createdAt: '2026-01-28T14:00:00Z', type: 'platform_fee', amountCents: -100, description: 'Platform fee (20%) — @OptionsOracle', subscriptionId: 's9' },
];

function mockFilterEntries(entries: CreatorLedgerEntry[], filter: CreatorLedgerEntryType | 'all'): CreatorLedgerEntry[] {
  if (filter === 'all') return entries;
  return entries.filter(e => e.type === filter);
}

interface CreatorDashboardProps {
  onBack: () => void;
  onSettingsClick: () => void;
  onUserClick?: (username: string) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  if (dollars >= 1) return `$${dollars.toFixed(0)}`;
  return `$${dollars.toFixed(2)}`;
}

const PAYOUT_MIN_CENTS = 500;

function ledgerTypeColor(type: CreatorLedgerEntryType): string {
  switch (type) {
    case 'earning': return 'text-rh-green';
    case 'refund': return 'text-red-500 dark:text-red-400';
    case 'payout': return 'text-blue-500 dark:text-blue-400';
    case 'platform_fee': return 'text-rh-light-muted dark:text-rh-muted';
  }
}

function ledgerTypeLabel(type: CreatorLedgerEntryType): string {
  switch (type) {
    case 'earning': return 'Earning';
    case 'refund': return 'Refund';
    case 'payout': return 'Payout';
    case 'platform_fee': return 'Fee';
  }
}

const LEDGER_FILTERS: { value: CreatorLedgerEntryType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'earning', label: 'Earnings' },
  { value: 'refund', label: 'Refunds' },
  { value: 'payout', label: 'Payouts' },
  { value: 'platform_fee', label: 'Fees' },
];

const CARD = 'rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl';
const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted';

function UsernameLink({ username, onUserClick }: { username: string; onUserClick?: (username: string) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onUserClick?.(username); }}
      className="text-rh-green hover:underline font-medium cursor-pointer"
    >
      @{username}
    </button>
  );
}

function DescriptionWithLinks({ text, onUserClick }: { text: string; onUserClick?: (username: string) => void }) {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          return <UsernameLink key={i} username={part.slice(1)} onUserClick={onUserClick} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-white/20 flex items-center justify-center cursor-help text-[9px] font-semibold text-gray-400 dark:text-white/30 leading-none select-none">
        i
      </span>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg
          bg-gray-800 dark:bg-white/90 text-white dark:text-gray-900 text-[10px] leading-tight
          whitespace-normal w-52 text-center shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

export function CreatorDashboard({ onBack, onSettingsClick, onUserClick }: CreatorDashboardProps) {
  const [data, setData] = useState<CreatorDashboardData | null>(USE_MOCK ? MOCK_DATA : null);
  const [referralData, setReferralData] = useState<ReferralStats | null>(USE_MOCK ? MOCK_REFERRALS : null);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [earningsPeriod, setEarningsPeriod] = useState<'D' | 'W' | 'M' | 'YR' | 'ALL'>('ALL');
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<CreatorLedgerEntry[]>(USE_MOCK ? MOCK_LEDGER_ENTRIES : []);
  const [ledgerSummary, setLedgerSummary] = useState<CreatorLedgerSummary | null>(USE_MOCK ? MOCK_LEDGER_SUMMARY : null);
  const [ledgerFilter, setLedgerFilter] = useState<CreatorLedgerEntryType | 'all'>('all');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerCursor, setLedgerCursor] = useState<string | undefined>();
  const [ledgerHasMore, setLedgerHasMore] = useState(false);
  const ledgerRequestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    if (USE_MOCK) return;
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
    if (USE_MOCK) {
      setPayoutMessage({ text: `Payout of ${formatCents(data.payoutBalanceCents)} requested (demo)`, isError: false });
      return;
    }
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

  const fetchLedger = useCallback(async (filter: CreatorLedgerEntryType | 'all', cursor?: string) => {
    if (USE_MOCK) {
      setLedgerEntries(mockFilterEntries(MOCK_LEDGER_ENTRIES, filter));
      setLedgerSummary(MOCK_LEDGER_SUMMARY);
      setLedgerHasMore(false);
      return;
    }
    const reqId = ++ledgerRequestId.current;
    setLedgerLoading(true);
    try {
      const res = await getCreatorLedger({
        limit: 25,
        cursor,
        type: filter === 'all' ? undefined : filter,
      });
      if (reqId !== ledgerRequestId.current) return;
      if (cursor) {
        setLedgerEntries(prev => [...prev, ...res.items]);
      } else {
        setLedgerEntries(res.items);
      }
      setLedgerSummary(res.summary);
      setLedgerCursor(res.page.nextCursor);
      setLedgerHasMore(res.page.hasMore);
    } catch { /* silent */ } finally {
      if (reqId === ledgerRequestId.current) setLedgerLoading(false);
    }
  }, []);

  const openLedger = useCallback(() => {
    setShowLedger(true);
    setLedgerFilter('all');
    fetchLedger('all');
  }, [fetchLedger]);

  const handleLedgerFilterChange = useCallback((filter: CreatorLedgerEntryType | 'all') => {
    setLedgerFilter(filter);
    if (!USE_MOCK) {
      setLedgerEntries([]);
      setLedgerCursor(undefined);
      setLedgerHasMore(false);
    }
    fetchLedger(filter);
  }, [fetchLedger]);

  const loadMoreLedger = useCallback(() => {
    if (!ledgerCursor || ledgerLoading || USE_MOCK) return;
    fetchLedger(ledgerFilter, ledgerCursor);
  }, [ledgerCursor, ledgerLoading, ledgerFilter, fetchLedger]);

  const payoutProgress = useMemo(() => {
    if (!data) return 0;
    return Math.min((data.payoutBalanceCents / PAYOUT_MIN_CENTS) * 100, 100);
  }, [data]);

  const payoutMet = data ? data.payoutBalanceCents >= PAYOUT_MIN_CENTS : false;

  // Escape key to close ledger modal
  useEffect(() => {
    if (!showLedger) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowLedger(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showLedger]);

  // Earnings period filter
  const filteredEarnings = useMemo(() => {
    if (!data) return [];
    const all = data.monthlyEarnings;
    switch (earningsPeriod) {
      case 'D': return all.slice(-1);
      case 'W': return all.slice(-2);
      case 'M': return all.slice(-3);
      case 'YR': return all.slice(-12);
      case 'ALL': default: return all;
    }
  }, [data, earningsPeriod]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-56 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-[72px] bg-gray-200 dark:bg-white/10 rounded-xl" />
            ))}
          </div>
          <div className="h-56 bg-gray-200 dark:bg-white/10 rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-44 bg-gray-200 dark:bg-white/10 rounded-xl" />
            <div className="h-44 bg-gray-200 dark:bg-white/10 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">{error || 'No data available'}</p>
        <button onClick={onBack} className="mt-3 text-sm text-rh-green hover:underline">Go back</button>
      </div>
    );
  }

  // ── Chart calculations ──
  const earnings = filteredEarnings;
  const maxEarning = Math.max(...earnings.map(e => e.amountCents + (e.referralBonusCents ?? 0)), 100);
  const CHART_W = 720;
  const CHART_H = 200;
  const PAD = { l: 52, r: 16, t: 32, b: 28 };
  const plotW = CHART_W - PAD.l - PAD.r;
  const plotH = CHART_H - PAD.t - PAD.b;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    y: PAD.t + plotH * (1 - pct),
    label: formatCompact(maxEarning * pct),
  }));

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const referralCount = referralData?.totalReferrals ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto px-4 py-5 space-y-3"
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors">
            <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Creator Dashboard</h1>
            <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">As of {dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openLedger}
            className="px-3 py-1.5 text-xs font-medium rounded-lg
              bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-rh-text
              hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
          >
            Transaction History
          </button>
          <button
            onClick={onSettingsClick}
            className="px-3 py-1.5 text-xs font-medium rounded-lg
              bg-gray-100 dark:bg-white/[0.06] text-rh-light-text dark:text-rh-text
              hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      {/* ─── Stat Strip ─── */}
      <div className={`${CARD} p-0 grid grid-cols-5 divide-x divide-gray-200/40 dark:divide-white/[0.06]`}>
        {[
          { value: formatCents(data.totalEarningsCents), label: 'Revenue', accent: true, tip: 'Total lifetime earnings from all subscription revenue (your 80% share)' },
          { value: formatCents(data.mrr), label: 'MRR', accent: true, tip: 'Monthly Recurring Revenue — projected monthly income from active subscribers' },
          { value: String(data.activeSubscribers), label: 'Subscribers', tip: 'Number of currently active paid subscribers' },
          { value: `${data.churnRatePct.toFixed(1)}%`, label: 'Churn', tip: 'Percentage of subscribers who canceled in the last 30 days' },
          { value: String(referralCount), label: 'Referrals', tip: 'Users who signed up for Premium through your referral link' },
        ].map((stat) => (
          <div key={stat.label} className="py-3.5 px-3 text-center">
            <p className={`text-xl font-bold ${stat.accent ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text'}`}>
              {stat.value}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5 flex items-center justify-center gap-0">
              {stat.label}<InfoTip text={stat.tip} />
            </p>
          </div>
        ))}
      </div>

      {/* ─── Revenue Chart ─── */}
      <section className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className={SECTION_TITLE}>Monthly Earnings</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {(['D', 'W', 'M', 'YR', 'ALL'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setEarningsPeriod(period)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-150 ${
                    earningsPeriod === period
                      ? 'bg-rh-green/10 text-rh-green'
                      : 'text-rh-light-muted/45 dark:text-rh-muted/45 hover:text-rh-light-muted dark:hover:text-rh-muted'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 ml-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rh-green/70" />
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Subscriptions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Referrals</span>
              </div>
            </div>
          </div>
        </div>

        {earnings.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-rh-light-muted dark:text-rh-muted">
            Revenue will appear here once subscribers start paying.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            style={{ maxHeight: 220 }}
            onMouseLeave={() => setHoveredBar(null)}
          >
            {/* Gridlines */}
            {gridLines.map((gl, i) => (
              <g key={i}>
                <line
                  x1={PAD.l} y1={gl.y} x2={CHART_W - PAD.r} y2={gl.y}
                  className="stroke-gray-200 dark:stroke-white/[0.06]"
                  strokeDasharray={i === 0 ? undefined : '4 3'}
                />
                <text
                  x={PAD.l - 8} y={gl.y + 3} textAnchor="end"
                  className="fill-gray-400 dark:fill-gray-500"
                  style={{ fontSize: '10px' }}
                >
                  {gl.label}
                </text>
              </g>
            ))}

            {/* Bars */}
            {earnings.map((e, i) => {
              const n = earnings.length;
              const gap = Math.max(6, plotW * 0.06 / n);
              const rawBarW = Math.max(16, (plotW - gap * (n + 1)) / n);
              const barW = Math.min(rawBarW, 48);
              const totalBarsW = n * barW + (n + 1) * gap;
              const offsetX = (plotW - totalBarsW) / 2;
              const x = PAD.l + offsetX + gap + i * (barW + gap);
              const refBonus = e.referralBonusCents ?? 0;
              const totalCents = e.amountCents + refBonus;
              const totalH = Math.max(2, (totalCents / maxEarning) * plotH);
              const subH = Math.max(refBonus > 0 ? 0 : 2, (e.amountCents / maxEarning) * plotH);
              const refH = totalH - subH;
              const yTotal = PAD.t + plotH - totalH;
              const ySub = PAD.t + plotH - subH;
              const isHovered = hoveredBar === i;
              const clipId = `bar-clip-${i}`;

              return (
                <g key={e.month} onMouseEnter={() => setHoveredBar(i)} style={{ cursor: 'pointer' }}>
                  <defs>
                    <clipPath id={clipId}>
                      <rect x={x} y={yTotal} width={barW} height={totalH} rx={3} />
                    </clipPath>
                  </defs>
                  <rect x={x - gap / 2} y={PAD.t} width={barW + gap} height={plotH + PAD.b} fill="transparent" />
                  <g clipPath={`url(#${clipId})`}>
                    {/* Subscription (green, full height — blue overlays the top) */}
                    <rect
                      x={x} y={ySub} width={barW} height={subH}
                      fill={isHovered ? '#00c805' : '#00c805'}
                      opacity={isHovered ? 1 : 0.85}
                      style={{ transition: 'opacity 0.15s' }}
                    />
                    {/* Referral (blue, stacked on top) */}
                    {refH > 0 && (
                      <rect
                        x={x} y={yTotal} width={barW} height={refH}
                        fill={isHovered ? '#3b82f6' : '#3b82f6'}
                        opacity={isHovered ? 1 : 0.85}
                        style={{ transition: 'opacity 0.15s' }}
                      />
                    )}
                  </g>
                  {isHovered && (
                    <>
                      <rect x={x + barW / 2 - 46} y={yTotal - 24} width={92} height={18} rx={4} className="fill-gray-800 dark:fill-white/90" />
                      <text x={x + barW / 2} y={yTotal - 12} textAnchor="middle" className="fill-white dark:fill-gray-900" style={{ fontSize: '10px', fontWeight: 600 }}>
                        {formatCents(totalCents)}
                      </text>
                    </>
                  )}
                  <text x={x + barW / 2} y={CHART_H - 6} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>
                    {new Date(e.month + '-15').toLocaleDateString('en-US', { month: 'short' })}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </section>

      {/* ─── Revenue Sources + Subscribers ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Revenue Sources */}
        <section className={`${CARD} p-4`}>
          <h2 className={`${SECTION_TITLE} mb-3`}>Revenue Sources</h2>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-[10px] text-rh-light-muted dark:text-rh-muted flex items-center">Total Estimated Revenue<InfoTip text="Sum of all earnings credited to your account" /></p>
              <p className="text-2xl font-bold text-rh-light-text dark:text-rh-text">{formatCents(data.totalEarningsCents)}</p>
            </div>
            <button onClick={openLedger} className="text-xs text-rh-green hover:text-rh-green/80 transition-colors">
              View Ledger
            </button>
          </div>
          <div className="space-y-2.5 border-t border-gray-200/40 dark:border-white/[0.06] pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-rh-green" />
                <span className="text-sm text-rh-light-text dark:text-rh-text">Subscriptions</span>
              </div>
              <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{formatCents(data.totalEarningsCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span className="text-sm text-rh-light-text dark:text-rh-text">Referral Bonuses</span>
              </div>
              <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">$0.00</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-rh-light-muted dark:text-rh-muted">
            You earn 80% of subscription revenue. Nala retains 20% as a platform fee.
          </p>
        </section>

        {/* Subscriber Summary */}
        <section className={`${CARD} p-4`}>
          <h2 className={`${SECTION_TITLE} mb-3`}>Subscribers</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rh-light-muted dark:text-rh-muted text-[10px] uppercase tracking-wider">
                <th className="text-left pb-2 font-medium">Status</th>
                <th className="text-right pb-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="text-rh-light-text dark:text-rh-text">
              <tr className="border-t border-gray-200/30 dark:border-white/[0.04]">
                <td className="py-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rh-green" />Active
                </td>
                <td className="py-2 text-right font-semibold">{data.activeSubscribers}</td>
              </tr>
              <tr className="border-t border-gray-200/30 dark:border-white/[0.04]">
                <td className="py-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />Churned (30d)
                </td>
                <td className="py-2 text-right font-semibold">
                  {data.churnRatePct > 0 ? Math.round(data.activeSubscribers * data.churnRatePct / (100 - data.churnRatePct)) : 0}
                </td>
              </tr>
              <tr className="border-t border-gray-200/30 dark:border-white/[0.04]">
                <td className="py-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />Churn Rate
                </td>
                <td className="py-2 text-right font-semibold">{data.churnRatePct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 pt-2.5 border-t border-gray-200/40 dark:border-white/[0.06]">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-rh-light-muted dark:text-rh-muted flex items-center">Monthly Revenue per Sub<InfoTip text="Your MRR divided by active subscriber count" /></span>
              <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                {data.activeSubscribers > 0 ? formatCents(Math.round(data.mrr / data.activeSubscribers)) : '—'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ─── Payouts ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Payout Threshold */}
        <section className={`${CARD} p-4`}>
          <h2 className={`${SECTION_TITLE} mb-3 flex items-center`}>Payout Threshold<InfoTip text="You need at least $5.00 in available balance to request a payout" /></h2>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Current Progress</span>
            <span className="text-sm text-rh-light-text dark:text-rh-text">
              {formatCents(data.payoutBalanceCents)} / {formatCents(PAYOUT_MIN_CENTS)}
            </span>
          </div>
          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded mb-2.5 ${
            payoutMet ? 'bg-rh-green/20 text-rh-green' : 'bg-yellow-500/20 text-yellow-500'
          }`}>
            {payoutMet ? 'Ready' : 'In Progress'}
          </span>
          <div className="h-2 rounded-full bg-gray-200 dark:bg-white/[0.08] overflow-hidden">
            <div className="h-full rounded-full bg-rh-green transition-all duration-500" style={{ width: `${payoutProgress}%` }} />
          </div>
          {!payoutMet && data.payoutBalanceCents > 0 && (
            <p className="mt-1.5 text-[10px] text-rh-light-muted dark:text-rh-muted">
              {formatCents(PAYOUT_MIN_CENTS - data.payoutBalanceCents)} more to reach payout threshold
            </p>
          )}
          {payoutMet && (
            <button
              onClick={handlePayout}
              disabled={payoutLoading}
              className="mt-3 w-full px-4 py-2.5 text-xs font-semibold rounded-lg
                bg-rh-green text-white hover:bg-rh-green/90 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {payoutLoading ? 'Processing...' : 'Request Payout'}
            </button>
          )}
          {payoutMessage && (
            <p className={`mt-2 text-xs ${payoutMessage.isError ? 'text-red-600 dark:text-red-400' : 'text-rh-green'}`}>
              {payoutMessage.text}
            </p>
          )}
        </section>

        {/* Payout Eligibility */}
        <section className={`${CARD} p-4`}>
          <h2 className={`${SECTION_TITLE} mb-3 flex items-center`}>Payout Eligibility<InfoTip text="Your account status and payout method configuration" /></h2>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">Payable Status</p>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rh-green/20 text-rh-green">Eligible</span>
              <p className="mt-1 text-xs text-rh-light-muted dark:text-rh-muted">Your creator account is active and in good standing.</p>
            </div>
            <div className="border-t border-gray-200/40 dark:border-white/[0.06] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1 flex items-center">Revenue Split<InfoTip text="Nala takes 20% platform fee, you receive 80% of subscription revenue" /></p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-full overflow-hidden flex">
                  <div className="h-full bg-rh-green" style={{ width: '80%' }} />
                  <div className="h-full bg-gray-400 dark:bg-white/20" style={{ width: '20%' }} />
                </div>
                <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text whitespace-nowrap">80 / 20</span>
              </div>
              <p className="mt-1 text-[10px] text-rh-light-muted dark:text-rh-muted">You receive 80% of all subscription revenue.</p>
            </div>
            <div className="border-t border-gray-200/40 dark:border-white/[0.06] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-1">Payout Method</p>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Payouts processed via Stripe Connect to your linked bank account.</p>
            </div>
          </div>
        </section>
      </div>

      {/* ─── Recent Activity ─── */}
      <section className={`${CARD} p-4`}>
        <h2 className={`${SECTION_TITLE} mb-2`}>Recent Activity</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-xs text-rh-light-muted dark:text-rh-muted py-4 text-center">
            Events will appear here as subscribers join.
          </p>
        ) : (
          <div className="divide-y divide-gray-200/30 dark:divide-white/[0.04]">
            {data.recentEvents.slice(0, 10).map((event, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  event.type === 'created' || event.type === 'renewed' ? 'bg-rh-green'
                  : event.type === 'canceled' || event.type === 'expired' ? 'bg-red-400'
                  : event.type === 'payment_failed' ? 'bg-yellow-500'
                  : 'bg-gray-400'
                }`} />
                <span className="text-sm text-rh-light-text dark:text-rh-text flex-1">
                  <DescriptionWithLinks text={event.description} onUserClick={onUserClick} />
                </span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted flex-shrink-0">
                  {new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Referrals (only if they have data — stat strip already shows count) ─── */}
      {referralData && referralData.totalReferrals > 0 && (
        <section className={`${CARD} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={SECTION_TITLE}>Referral Breakdown</h2>
            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">Credited on Premium signup</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{referralData.totalReferrals}</p>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-rh-green">{referralData.activeReferrals}</p>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Premium</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{referralData.conversionRate}%</p>
              <p className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Conversion</p>
            </div>
          </div>
          {referralData.recentReferrals.length > 0 && (
            <div className="border-t border-gray-200/40 dark:border-white/[0.06] pt-2.5 divide-y divide-gray-200/20 dark:divide-white/[0.03]">
              {referralData.recentReferrals.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                  <UsernameLink username={r.username} onUserClick={onUserClick} />
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    r.status === 'active' ? 'bg-rh-green/15 text-rh-green'
                    : r.status === 'verified' ? 'bg-blue-500/15 text-blue-500'
                    : 'bg-gray-200 dark:bg-white/10 text-rh-light-muted dark:text-rh-muted'
                  }`}>
                    {r.status === 'active' ? 'premium' : r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {/* ─── Ledger Modal ─── */}
      <AnimatePresence>
        {showLedger && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLedger(false); }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl max-h-[75vh] flex flex-col
                bg-white dark:bg-[#1a1a1e] rounded-2xl border border-gray-200/60 dark:border-white/[0.08]
                shadow-2xl overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/40 dark:border-white/[0.06]">
                <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">Transaction History</h2>
                <button
                  onClick={() => setShowLedger(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors"
                >
                  <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Summary strip */}
              {ledgerSummary && (
                <div className="grid grid-cols-3 divide-x divide-gray-200/40 dark:divide-white/[0.06] border-b border-gray-200/40 dark:border-white/[0.06]">
                  <div className="py-3 px-4 text-center">
                    <p className="text-lg font-bold text-rh-green">{formatCents(ledgerSummary.availableCents)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Available</p>
                  </div>
                  <div className="py-3 px-4 text-center">
                    <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(ledgerSummary.reservedCents)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Reserved</p>
                  </div>
                  <div className="py-3 px-4 text-center">
                    <p className="text-lg font-bold text-rh-light-text dark:text-rh-text">{formatCents(ledgerSummary.pendingPayoutCents)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">Pending</p>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex gap-1.5 px-5 py-3 border-b border-gray-200/40 dark:border-white/[0.06]">
                {LEDGER_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => handleLedgerFilterChange(f.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                      ledgerFilter === f.value
                        ? 'border-rh-green bg-rh-green/10 text-rh-green'
                        : 'border-gray-200 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:border-gray-300 dark:hover:border-white/20'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Entries */}
              <div className="flex-1 overflow-y-auto scrollbar-minimal">
                {ledgerLoading && ledgerEntries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-rh-light-muted dark:text-rh-muted">Loading...</div>
                ) : ledgerEntries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-rh-light-muted dark:text-rh-muted">No transactions yet.</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                    {ledgerEntries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${ledgerTypeColor(entry.type)}`}>
                              {ledgerTypeLabel(entry.type)}
                            </span>
                            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                              {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          {entry.description && (
                            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">
                              <DescriptionWithLinks text={entry.description} onUserClick={onUserClick} />
                            </p>
                          )}
                        </div>
                        <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${
                          entry.amountCents >= 0 ? 'text-rh-green' : 'text-red-500 dark:text-red-400'
                        }`}>
                          {entry.amountCents >= 0 ? '+' : ''}{formatCents(entry.amountCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Load more */}
                {ledgerHasMore && (
                  <div className="text-center py-3 border-t border-gray-200/40 dark:border-white/[0.06]">
                    <button
                      onClick={loadMoreLedger}
                      disabled={ledgerLoading}
                      className="text-xs font-medium text-rh-green hover:text-rh-green/80 transition-colors disabled:opacity-50"
                    >
                      {ledgerLoading ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
