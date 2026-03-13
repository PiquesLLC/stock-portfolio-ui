import { useState, useEffect, useCallback, useRef } from 'react';
import { getAnalyticsDashboard, type AnalyticsDashboardResponse, type AnalyticsDashboardFeature } from '../api';

// ─── Constants ────────────────────────────────────────────────────────────

const CARD = 'rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl';
const AUTO_REFRESH_MS = 30_000;

type Period = '7d' | '30d' | '90d';
type SortKey = 'views' | 'uniqueUsers' | 'totalTimeMs' | 'avgTimeMs';

const FEATURE_LABELS: Record<string, string> = {
  portfolio: 'Portfolio',
  insights: 'Insights',
  discover: 'Discover',
  leaderboard: 'Leaderboard',
  watchlists: 'Watchlists',
  nala_ai: 'Nala AI',
  macro: 'Macro',
  feed: 'Feed',
  profile: 'Profile',
  pricing: 'Pricing',
  stock_detail: 'Stock Detail',
  compare_stocks: 'Compare Stocks',
  portfolio_compare: 'Portfolio Compare',
  user_profile: 'User Profile',
  daily_brief: 'Daily Brief',
  settings: 'Settings',
  creator_dashboard: 'Creator Dashboard',
  creator_settings: 'Creator Settings',
  admin_waitlist: 'Admin Waitlist',
  admin_jobs: 'Admin Jobs',
  admin_analytics: 'Admin Analytics',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────

export function AnalyticsDashboard({ onBack }: Props) {
  const [data, setData] = useState<AnalyticsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('7d');
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [sortAsc, setSortAsc] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (p: Period) => {
    try {
      const res = await getAnalyticsDashboard(p);
      if (!mountedRef.current) return;
      setData(res);
      setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load(period);
    const id = setInterval(() => load(period), AUTO_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load, period]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedFeatures = [...(data?.featureUsage ?? [])].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortAsc ? diff : -diff;
  });

  const maxViews = Math.max(...(data?.featureUsage ?? []).map(f => f.views), 1);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">User Analytics</h1>
        <div className="ml-auto flex items-center gap-2">
          {/* Period selector */}
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? 'bg-rh-green/10 text-rh-green'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {p}
            </button>
          ))}
          <button onClick={() => { setLoading(true); load(period); }} className="ml-2 text-xs text-rh-green hover:underline font-medium">
            Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted">Loading...</div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Active Users" value={formatNumber(data.overview.uniqueUsers)} />
            <StatCard label="Sessions" value={formatNumber(data.overview.totalSessions)} />
            <StatCard label="Avg Session" value={formatDuration(data.overview.avgSessionDurationMs)} />
            <StatCard label="Portfolios" value={formatNumber(data.userEngagement.portfoliosCreated)} />
          </div>

          {/* Engagement row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className={`${CARD} px-4 py-3`}>
              <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mb-1">Registered Users</div>
              <div className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{formatNumber(data.userEngagement.registeredUsers)}</div>
            </div>
            <div className={`${CARD} px-4 py-3`}>
              <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mb-1">Total Holdings</div>
              <div className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{formatNumber(data.userEngagement.holdingsCount)}</div>
            </div>
            <div className={`${CARD} px-4 py-3`}>
              <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mb-1">Watchlists</div>
              <div className="text-lg font-semibold text-rh-light-text dark:text-rh-text">{formatNumber(data.userEngagement.watchlistsCount)}</div>
            </div>
          </div>

          {/* DAU Sparkline */}
          {data.dauTrend.length > 1 && (
            <div className={`${CARD} p-4 mb-6`}>
              <h2 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-3">Daily Active Users</h2>
              <DAUSparkline data={data.dauTrend} />
            </div>
          )}

          {/* Feature Usage Table */}
          <div className={`${CARD} p-4`}>
            <h2 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-3">Feature Usage</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">
                    <th className="text-left pb-2 pr-3 font-medium">Feature</th>
                    <SortHeader label="Views" sortKey="views" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                    <SortHeader label="Users" sortKey="uniqueUsers" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                    <SortHeader label="Total Time" sortKey="totalTimeMs" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                    <SortHeader label="Avg Time" sortKey="avgTimeMs" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                    <th className="text-right pb-2 font-medium">% of Total</th>
                    <th className="text-left pb-2 pl-3 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFeatures.map((f) => (
                    <FeatureRow key={f.feature} feature={f} maxViews={maxViews} />
                  ))}
                  {sortedFeatures.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-rh-light-muted dark:text-rh-muted text-xs">
                        No analytics data yet. Events will appear as users navigate the app.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} px-4 py-3 text-center`}>
      <div className="text-xl font-bold text-rh-light-text dark:text-rh-text">{value}</div>
      <div className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-0.5">{label}</div>
    </div>
  );
}

function SortHeader({ label, sortKey, currentKey, asc, onSort }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === currentKey;
  return (
    <th
      className="text-right pb-2 pr-3 font-medium cursor-pointer select-none hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-0.5 text-rh-green">{asc ? '\u25B2' : '\u25BC'}</span>
      )}
    </th>
  );
}

function FeatureRow({ feature, maxViews }: { feature: AnalyticsDashboardFeature; maxViews: number }) {
  const barWidth = Math.max(2, (feature.views / maxViews) * 100);
  return (
    <tr className="border-t border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
      <td className="py-2.5 pr-3 text-rh-light-text dark:text-rh-text font-medium text-[13px]">
        {FEATURE_LABELS[feature.feature] || feature.feature}
      </td>
      <td className="py-2.5 pr-3 text-right text-rh-light-text dark:text-rh-text tabular-nums">
        {formatNumber(feature.views)}
      </td>
      <td className="py-2.5 pr-3 text-right text-rh-light-muted dark:text-rh-muted tabular-nums">
        {feature.uniqueUsers}
      </td>
      <td className="py-2.5 pr-3 text-right text-rh-light-muted dark:text-rh-muted tabular-nums">
        {formatDuration(feature.totalTimeMs)}
      </td>
      <td className="py-2.5 pr-3 text-right text-rh-light-muted dark:text-rh-muted tabular-nums">
        {formatDuration(feature.avgTimeMs)}
      </td>
      <td className="py-2.5 text-right text-rh-light-muted dark:text-rh-muted tabular-nums text-[12px]">
        {feature.pctOfTotal.toFixed(1)}%
      </td>
      <td className="py-2.5 pl-3">
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-rh-green/60"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </td>
    </tr>
  );
}

function DAUSparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const h = 80;
  const w = 600;
  const padding = { top: 10, bottom: 20, left: 0, right: 0 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - (d.count / maxCount) * chartH;
    return `${x},${y}`;
  });

  const areaPoints = [
    `${padding.left},${padding.top + chartH}`,
    ...points,
    `${padding.left + chartW},${padding.top + chartH}`,
  ];

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {/* Area fill */}
        <polygon
          points={areaPoints.join(' ')}
          fill="url(#dauGradient)"
        />
        {/* Line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#00c805"
          strokeWidth="2"
        />
        <defs>
          <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c805" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00c805" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-rh-light-muted dark:text-rh-muted mt-1 px-0.5">
        {data.length > 0 && <span>{data[0].date.slice(5)}</span>}
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)].date.slice(5)}</span>}
        {data.length > 0 && <span>{data[data.length - 1].date.slice(5)}</span>}
      </div>
    </div>
  );
}
