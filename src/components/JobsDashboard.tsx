import { useState, useEffect, useCallback, useRef } from 'react';
import { timeAgo } from '../utils/format';
import {
  getJobMetrics,
  getJobStats,
  getDeadLetterEntries as fetchDeadLetterEntries,
  retryDeadLetterEntry,
  resolveDeadLetterEntry,
  getSnapshotHealth,
  getStuckJobs,
  healStuckJobs,
  type JobMetricsResponse,
  type JobStatsResponse,
  type DeadLetterEntry,
  type DeadLetterPaginatedResponse,
  type SnapshotHealthEntry,
  type StuckJobEntry,
  type JobFailureCategory,
} from '../api';

// ─── Constants ────────────────────────────────────────────────────────────

const CARD = 'rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl';
const AUTO_REFRESH_MS = 30_000;

/** Humanize a snake_case job name */
function humanJobName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Parse failure category prefix from error string like "[TRANSIENT] ..." */
function parseCategory(error: string): JobFailureCategory | null {
  const m = error.match(/^\[(TRANSIENT|PERMANENT|RATE_LIMITED|DATA_QUALITY|UNKNOWN)\]\s+/);
  return (m?.[1] as JobFailureCategory | undefined) ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'dead-letter' | 'health' | 'stuck';
type AlertLevel = 'ok' | 'warning' | 'critical';

interface Props {
  onBack: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────

export function JobsDashboard({ onBack }: Props) {
  const [metrics, setMetrics] = useState<JobMetricsResponse | null>(null);
  const [jobStats, setJobStats] = useState<JobStatsResponse | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [dlqPagination, setDlqPagination] = useState<DeadLetterPaginatedResponse['pagination'] | null>(null);
  const [healthEntries, setHealthEntries] = useState<SnapshotHealthEntry[]>([]);
  const [stuckJobs, setStuckJobs] = useState<StuckJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [healDryRun, setHealDryRun] = useState(true);
  const [healing, setHealing] = useState(false);
  const [healResult, setHealResult] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const [metricsRes, statsRes, dlRes, healthRes, stuckRes] = await Promise.all([
        getJobMetrics().catch(() => null),
        getJobStats().catch(() => null),
        fetchDeadLetterEntries({ pageSize: 50 }).catch(() => null),
        getSnapshotHealth().catch(() => null),
        getStuckJobs().catch(() => null),
      ]);
      if (!mountedRef.current) return;
      if (metricsRes) setMetrics(metricsRes);
      if (statsRes) setJobStats(statsRes);
      if (dlRes) {
        setDeadLetters(dlRes.entries);
        setDlqPagination(dlRes.pagination);
      }
      if (healthRes) setHealthEntries(healthRes.reports);
      if (stuckRes) setStuckJobs(stuckRes.stuck);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, AUTO_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await resolveDeadLetterEntry(id);
      setDeadLetters(prev => prev.filter(e => e.id !== id));
    } catch {
      setError('Failed to resolve entry');
    } finally {
      setResolving(null);
    }
  };

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await retryDeadLetterEntry(id);
      setDeadLetters(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry entry');
    } finally {
      setRetrying(null);
    }
  };

  const handleHealAll = async () => {
    setHealing(true);
    setHealResult(null);
    try {
      const result = await healStuckJobs(healDryRun);
      if (healDryRun) {
        const count = result.wouldHeal ?? result.details?.length ?? 0;
        setHealResult(`Dry run: ${count} job${count !== 1 ? 's' : ''} would be healed`);
      } else {
        const count = result.healed ?? result.details?.length ?? 0;
        setHealResult(`Healed ${count} stuck job${count !== 1 ? 's' : ''}`);
        const stuckRes = await getStuckJobs();
        setStuckJobs(stuckRes.stuck);
      }
    } catch {
      setError('Failed to heal stuck jobs');
    } finally {
      setHealing(false);
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────

  const jobs = jobStats?.jobs ?? [];
  const unresolvedDlq = deadLetters.filter(d => !d.resolved).length;
  const criticalSnapshots = healthEntries.filter(h => h.status === 'critical').length;
  const totalJobs = metrics?.jobs?.length ?? jobs.length;
  const healthyJobs = (metrics?.jobs ?? []).filter(j => j.alertSeverity === 'none').length;
  const healthPercent = totalJobs > 0 ? Math.round((healthyJobs / totalJobs) * 100) : 100;
  const alertLevel = computeAlertLevel(jobStats, deadLetters, healthEntries, stuckJobs);

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
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Jobs & Reliability</h1>
        <div className="ml-auto flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
              Updated {timeAgo(lastRefresh)}
            </span>
          )}
          <button onClick={load} className="text-xs text-rh-green hover:underline font-medium">
            Refresh
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !jobStats && (
        <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted">Loading...</div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {(jobStats || metrics) && (
        <>
          {/* Alert banner */}
          <AlertBanner
            level={alertLevel}
            stats={jobStats}
            stuckCount={stuckJobs.length}
            dlqCount={unresolvedDlq}
            criticalCount={criticalSnapshots}
          />

          {/* Summary stats row */}
          <div className={`${CARD} p-0 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200/40 dark:divide-white/[0.06] mb-4`}>
            <SummaryStatBox label="Jobs Tracked" value={totalJobs} />
            <SummaryStatBox
              label="Overall Health"
              value={`${healthPercent}%`}
              accent={healthPercent === 100 ? 'green' : healthPercent >= 80 ? undefined : 'red'}
            />
            <SummaryStatBox
              label="Dead Letters"
              value={dlqPagination?.total ?? unresolvedDlq}
              accent={unresolvedDlq > 0 ? 'amber' : undefined}
            />
            <SummaryStatBox
              label="Last Check"
              value={lastRefresh ? timeAgo(lastRefresh) : '--'}
            />
          </div>

          {/* Reliability metrics row */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <MiniStat label="Runs (24h)" value={metrics.runs.total} />
              <MiniStat label="Success Rate" value={`${metrics.runs.successRate}%`} accent={metrics.runs.successRate >= 95 ? 'green' : metrics.runs.successRate >= 80 ? undefined : 'red'} />
              <MiniStat label="P95 Duration" value={metrics.runs.p95DurationMs > 0 ? `${(metrics.runs.p95DurationMs / 1000).toFixed(1)}s` : '--'} />
              <MiniStat label="Running Now" value={metrics.runs.running} accent={metrics.runs.running > 3 ? 'amber' : undefined} />
              <MiniStat label="Dedup Hits" value={metrics.idempotency.duplicateHits} accent={metrics.idempotency.duplicateHits > 10 ? 'amber' : undefined} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-200/40 dark:border-white/[0.06] mb-4">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} label="Job Status" count={jobs.length} />
            <TabButton active={tab === 'dead-letter'} onClick={() => setTab('dead-letter')} label="Dead Letter" count={unresolvedDlq} alertColor={unresolvedDlq > 3 ? 'red' : unresolvedDlq > 0 ? 'amber' : undefined} />
            <TabButton active={tab === 'health'} onClick={() => setTab('health')} label="Snapshots" count={healthEntries.length} alertColor={criticalSnapshots > 0 ? 'red' : undefined} />
            <TabButton active={tab === 'stuck'} onClick={() => setTab('stuck')} label="Stuck" count={stuckJobs.length} alertColor={stuckJobs.length > 0 ? 'red' : undefined} />
          </div>

          {/* Tab content */}
          {tab === 'overview' && <OverviewTab jobs={jobs} />}
          {tab === 'dead-letter' && (
            <DeadLetterTab
              entries={deadLetters}
              resolving={resolving}
              retrying={retrying}
              onResolve={handleResolve}
              onRetry={handleRetry}
            />
          )}
          {tab === 'health' && <HealthTab entries={healthEntries} />}
          {tab === 'stuck' && (
            <StuckTab
              stuckJobs={stuckJobs}
              healDryRun={healDryRun}
              setHealDryRun={setHealDryRun}
              healing={healing}
              healResult={healResult}
              onHealAll={handleHealAll}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Summary Stat Box ─────────────────────────────────────────────────────

function SummaryStatBox({ label, value, accent }: { label: string; value: string | number; accent?: 'green' | 'amber' | 'red' }) {
  const color = accent === 'green' ? 'text-rh-green' : accent === 'amber' ? 'text-amber-500' : accent === 'red' ? 'text-red-500 dark:text-red-400' : 'text-rh-light-text dark:text-rh-text';
  return (
    <div className="py-3.5 px-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string | number; accent?: 'green' | 'amber' | 'red' }) {
  const color = accent === 'green' ? 'text-rh-green' : accent === 'amber' ? 'text-amber-500' : accent === 'red' ? 'text-red-500 dark:text-red-400' : 'text-rh-light-text dark:text-rh-text';
  return (
    <div className={`${CARD} p-3 text-center`}>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────

function computeAlertLevel(
  stats: JobStatsResponse | null,
  deadLetters: DeadLetterEntry[],
  healthEntries: SnapshotHealthEntry[],
  stuckJobs: StuckJobEntry[],
): AlertLevel {
  if (!stats) return 'ok';
  const failureRate = stats.summary.totalRuns > 0 ? stats.summary.totalFailed / stats.summary.totalRuns : 0;
  const criticalHealth = healthEntries.filter(h => h.status === 'critical').length;
  if (failureRate > 0.15 || stuckJobs.length > 2 || criticalHealth > 2) return 'critical';
  if (failureRate > 0.05 || stuckJobs.length > 0 || deadLetters.filter(d => !d.resolved).length > 3 || criticalHealth > 0) return 'warning';
  return 'ok';
}

function AlertBanner({ level, stats, stuckCount, dlqCount, criticalCount }: {
  level: AlertLevel;
  stats: JobStatsResponse | null;
  stuckCount: number;
  dlqCount: number;
  criticalCount: number;
}) {
  if (level === 'ok') return null;
  const failureRate = stats && stats.summary.totalRuns > 0
    ? ((stats.summary.totalFailed / stats.summary.totalRuns) * 100).toFixed(1)
    : '0';
  const issues: string[] = [];
  if (parseFloat(failureRate) > 5) issues.push(`${failureRate}% failure rate`);
  if (stuckCount > 0) issues.push(`${stuckCount} stuck job${stuckCount > 1 ? 's' : ''}`);
  if (dlqCount > 0) issues.push(`${dlqCount} unresolved DLQ`);
  if (criticalCount > 0) issues.push(`${criticalCount} critical snapshot${criticalCount > 1 ? 's' : ''}`);
  const isCritical = level === 'critical';
  return (
    <div className={`mb-4 px-4 py-3 rounded-xl border flex items-start gap-3 ${
      isCritical
        ? 'bg-red-500/10 border-red-500/20'
        : 'bg-yellow-500/10 border-yellow-500/20'
    }`}>
      <span className={`text-base font-bold mt-0.5 ${isCritical ? 'text-red-500' : 'text-yellow-500'}`}>
        {isCritical ? '!!' : '!'}
      </span>
      <div>
        <p className={`text-sm font-medium ${isCritical ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
          {isCritical ? 'Critical -- Immediate attention needed' : 'Warning -- Issues detected'}
        </p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">{issues.join(' · ')}</p>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, label, count, alertColor }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  alertColor?: 'red' | 'amber';
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
      }`}
    >
      {label} ({count})
      {alertColor && count > 0 && (
        <span className={`w-2 h-2 rounded-full ${alertColor === 'red' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
      )}
    </button>
  );
}

// ─── Overview Tab (Job Health Grid) ───────────────────────────────────────

function OverviewTab({ jobs }: { jobs: JobStatsResponse['jobs'] }) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted text-sm">
        No job runs in the last 24 hours
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {jobs.map(job => (
        <JobCard key={job.jobName} job={job} />
      ))}
    </div>
  );
}

function JobCard({ job }: { job: JobStatsResponse['jobs'][number] }) {
  const severity = job.alertSeverity ?? 'none';
  const borderColor =
    severity === 'critical' ? 'border-red-500/40' :
    severity === 'warning' ? 'border-amber-500/40' :
    'border-gray-200/40 dark:border-white/[0.06]';
  const statusBg =
    severity === 'critical' ? 'bg-red-500' :
    severity === 'warning' ? 'bg-amber-500' :
    'bg-emerald-500';
  const statusLabel =
    severity === 'critical' ? 'Critical' :
    severity === 'warning' ? 'Warning' :
    'Healthy';
  const statusTextColor =
    severity === 'critical' ? 'text-red-600 dark:text-red-400' :
    severity === 'warning' ? 'text-amber-600 dark:text-amber-400' :
    'text-emerald-600 dark:text-emerald-400';
  const failureRate = job.failureRate;
  const hasCategories = job.failureCategories && Object.values(job.failureCategories).some(v => v > 0);

  return (
    <div className={`p-4 rounded-xl border ${borderColor} bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate">
          {humanJobName(job.jobName)}
        </h3>
        <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${statusTextColor}`}>
          <span className={`w-2 h-2 rounded-full ${statusBg} ${severity === 'critical' ? 'animate-pulse' : ''}`} />
          {statusLabel}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-base font-bold text-rh-light-text dark:text-rh-text">{job.total}</p>
          <p className="text-[9px] text-rh-light-muted dark:text-rh-muted uppercase">Runs</p>
        </div>
        <div>
          <p className={`text-base font-bold ${failureRate > 10 ? 'text-red-500' : failureRate > 5 ? 'text-amber-500' : 'text-rh-light-text dark:text-rh-text'}`}>
            {failureRate.toFixed(1)}%
          </p>
          <p className="text-[9px] text-rh-light-muted dark:text-rh-muted uppercase">Fail Rate</p>
        </div>
        <div>
          <p className="text-base font-bold text-rh-light-text dark:text-rh-text">
            {job.avgDurationMs > 0 ? `${(job.avgDurationMs / 1000).toFixed(1)}s` : '--'}
          </p>
          <p className="text-[9px] text-rh-light-muted dark:text-rh-muted uppercase">Avg Time</p>
        </div>
      </div>

      {/* Failure category badges */}
      {hasCategories && (
        <div className="flex flex-wrap items-center gap-1 mt-2">
          {(Object.entries(job.failureCategories) as [JobFailureCategory, number][])
            .filter(([, count]) => count > 0)
            .map(([cat, count]) => (
              <span key={cat} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_STYLES[cat].bg} ${CATEGORY_STYLES[cat].text}`}>
                {CATEGORY_STYLES[cat].label} ({count})
              </span>
            ))}
        </div>
      )}

      {/* Last run + last error */}
      <div className="mt-3 pt-2 border-t border-gray-200/30 dark:border-white/[0.04]">
        <p className="text-[10px] text-rh-light-muted dark:text-rh-muted">
          Last run: {job.lastRun ? timeAgo(job.lastRun) : 'never'}
        </p>
        {job.lastError && (
          <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 line-clamp-1">
            {job.lastError.replace(/^\[(TRANSIENT|PERMANENT|RATE_LIMITED|DATA_QUALITY|UNKNOWN)\]\s+/, '')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Dead Letter Tab ──────────────────────────────────────────────────────

function DeadLetterTab({ entries, resolving, retrying, onResolve, onRetry }: {
  entries: DeadLetterEntry[];
  resolving: string | null;
  retrying: string | null;
  onResolve: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted text-sm">
        No dead letter entries -- all clear
      </div>
    );
  }

  return (
    <div className={`${CARD} divide-y divide-gray-200/40 dark:divide-white/[0.06]`}>
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">
        <div className="col-span-2">Job</div>
        <div className="col-span-4">Error</div>
        <div className="col-span-2">Category</div>
        <div className="col-span-2">Time</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {entries.map(entry => {
        const category = parseCategory(entry.error);
        const cleanError = entry.error.replace(/^\[(TRANSIENT|PERMANENT|RATE_LIMITED|DATA_QUALITY|UNKNOWN)\]\s+/, '');
        const isResolving = resolving === entry.id;
        const isRetrying = retrying === entry.id;
        const isBusy = isResolving || isRetrying;

        return (
          <div key={entry.id} className="px-4 py-3">
            {/* Mobile layout */}
            <div className="sm:hidden space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                  {humanJobName(entry.jobName)}
                </span>
                {category && (
                  <CategoryBadge category={category} />
                )}
              </div>
              <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">{cleanError}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                  {entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''} · {timeAgo(entry.createdAt)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRetry(entry.id)}
                    disabled={isBusy}
                    className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry'}
                  </button>
                  <button
                    onClick={() => onResolve(entry.id)}
                    disabled={isBusy}
                    className="text-xs text-rh-light-muted dark:text-rh-muted hover:underline disabled:opacity-50"
                  >
                    {isResolving ? 'Resolving...' : 'Resolve'}
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop layout */}
            <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                  {humanJobName(entry.jobName)}
                </span>
                <span className="block text-[10px] text-rh-light-muted dark:text-rh-muted">
                  {entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="col-span-4">
                <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2" title={cleanError}>
                  {cleanError}
                </p>
              </div>
              <div className="col-span-2">
                {category ? <CategoryBadge category={category} /> : (
                  <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">--</span>
                )}
              </div>
              <div className="col-span-2">
                <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                  {timeAgo(entry.createdAt)}
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => onRetry(entry.id)}
                  disabled={isBusy}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {isRetrying ? 'Retrying...' : 'Retry'}
                </button>
                <button
                  onClick={() => onResolve(entry.id)}
                  disabled={isBusy}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md text-rh-light-muted dark:text-rh-muted hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                  {isResolving ? '...' : 'Resolve'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Health Tab ───────────────────────────────────────────────────────────

function HealthTab({ entries }: { entries: SnapshotHealthEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted text-sm">
        No snapshot health data
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => {
    const priority: Record<string, number> = { critical: 0, stale: 1, gaps: 2, healthy: 3 };
    return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
  });

  return (
    <div className="space-y-2">
      {sorted.map(entry => (
        <div key={entry.userId} className={`${CARD} p-3`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
              {entry.username}
            </span>
            <HealthBadge status={entry.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-rh-light-muted dark:text-rh-muted">Last snapshot: </span>
              <span className="text-rh-light-text dark:text-rh-text">
                {entry.lastSnapshotAge == null ? '--' : entry.lastSnapshotAge < 1 ? '<1 min' : `${Math.round(entry.lastSnapshotAge)} min`}
              </span>
            </div>
            <div>
              <span className="text-rh-light-muted dark:text-rh-muted">24h count: </span>
              <span className="text-rh-light-text dark:text-rh-text">{entry.snapshotsLast24h}</span>
            </div>
            <div>
              <span className="text-rh-light-muted dark:text-rh-muted">Gaps: </span>
              <span className="text-rh-light-text dark:text-rh-text">{entry.gapCount}</span>
            </div>
            <div>
              <span className="text-rh-light-muted dark:text-rh-muted">Longest gap: </span>
              <span className="text-rh-light-text dark:text-rh-text">
                {entry.longestGapMinutes > 0 ? `${Math.round(entry.longestGapMinutes)} min` : '--'}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stuck Tab ────────────────────────────────────────────────────────────

function StuckTab({ stuckJobs, healDryRun, setHealDryRun, healing, healResult, onHealAll }: {
  stuckJobs: StuckJobEntry[];
  healDryRun: boolean;
  setHealDryRun: (v: boolean) => void;
  healing: boolean;
  healResult: string | null;
  onHealAll: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
          <input
            type="checkbox"
            checked={healDryRun}
            onChange={(e) => setHealDryRun(e.target.checked)}
            className="rounded border-rh-border accent-rh-green"
          />
          Dry run (preview only)
        </label>
        <button
          onClick={onHealAll}
          disabled={healing || stuckJobs.length === 0}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            healDryRun
              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20'
              : 'bg-rh-green text-white hover:bg-rh-green/90'
          }`}
        >
          {healing ? 'Healing...' : healDryRun ? 'Preview Heal' : 'Heal All'}
        </button>
      </div>

      {healResult && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
          healDryRun ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400'
        }`}>
          {healResult}
        </div>
      )}

      {stuckJobs.length === 0 ? (
        <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted text-sm">
          No stuck jobs
        </div>
      ) : (
        stuckJobs.map(job => (
          <div key={job.id} className={`${CARD} p-3`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                {humanJobName(job.jobName)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 dark:text-red-400 font-medium">
                Stuck
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-rh-light-muted dark:text-rh-muted">
              <span>Attempt: {job.attempt}/{job.maxAttempts}</span>
              <span>Started: {timeAgo(job.startedAt)}</span>
              <span>Running: {Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000)} min</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────

function HealthBadge({ status }: { status: SnapshotHealthEntry['status'] }) {
  const styles: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
    stale: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    gaps: 'bg-amber-500/10 text-amber-500 dark:text-amber-400',
    critical: 'bg-red-500/10 text-red-500 dark:text-red-400',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[status] ?? styles.healthy}`}>
      {status}
    </span>
  );
}

const CATEGORY_STYLES: Record<JobFailureCategory, { bg: string; text: string; label: string }> = {
  TRANSIENT: { bg: 'bg-blue-500/10', text: 'text-blue-500 dark:text-blue-400', label: 'Transient' },
  PERMANENT: { bg: 'bg-red-500/10', text: 'text-red-500 dark:text-red-400', label: 'Permanent' },
  RATE_LIMITED: { bg: 'bg-amber-500/10', text: 'text-amber-500 dark:text-amber-400', label: 'Rate Limited' },
  DATA_QUALITY: { bg: 'bg-purple-500/10', text: 'text-purple-500 dark:text-purple-400', label: 'Data Quality' },
  UNKNOWN: { bg: 'bg-gray-500/10', text: 'text-gray-500 dark:text-gray-400', label: 'Unknown' },
};

function CategoryBadge({ category }: { category: JobFailureCategory }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.UNKNOWN;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
