import { useState, useEffect, useCallback } from 'react';
import { timeAgo } from '../utils/format';

type FailureCategory = 'TRANSIENT' | 'PERMANENT' | 'RATE_LIMITED' | 'DATA_QUALITY';

interface JobStat {
  jobName: string;
  total: number;
  success: number;
  failed: number;
  deadLettered: number;
  failureRate: number;
  alertSeverity: 'none' | 'warning' | 'critical';
  failureCategories: Record<FailureCategory, number>;
  avgDurationMs: number;
  lastRun: string | null;
  lastError: string | null;
}

interface ReliabilityMetrics {
  period: { hours: number; since: string };
  runs: {
    total: number;
    running: number;
    success: number;
    failed: number;
    deadLettered: number;
    successRate: number;
    failureRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
  };
  idempotency: { activeKeys: number; duplicateHits: number };
  deadLetters: { unresolved: number };
}

interface DeadLetterEntry {
  id: string;
  jobName: string;
  error: string;
  attempts: number;
  context: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface SnapshotHealth {
  userId: string;
  username: string;
  lastSnapshotAge: number | null; // minutes, null if never
  snapshotsLast24h: number;
  gapCount: number;
  longestGapMinutes: number;
  status: 'healthy' | 'stale' | 'gaps' | 'critical';
}

interface StuckJob {
  id: string;
  jobName: string;
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  durationMs: number | null;
}

interface JobsResponse {
  summary: {
    totalJobs: number;
    totalRuns: number;
    totalFailed: number;
    totalDeadLettered: number;
    failureRate: string;
  };
  jobs: JobStat[];
}

async function fetchJobStats(): Promise<JobsResponse> {
  const res = await fetch('/api/admin/jobs/stats', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch job stats');
  return res.json();
}

async function fetchDeadLetterEntries(): Promise<DeadLetterEntry[]> {
  const res = await fetch('/api/admin/jobs/dead-letter', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch dead letter entries');
  const data = await res.json();
  return data.entries;
}

async function resolveEntry(id: string): Promise<void> {
  const res = await fetch(`/api/admin/jobs/dead-letter/${id}/resolve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to resolve entry');
}

async function fetchSnapshotHealth(): Promise<SnapshotHealth[]> {
  const res = await fetch('/api/admin/jobs/snapshot-health', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch snapshot health');
  const data = await res.json();
  return data.reports;
}

async function fetchStuckJobs(): Promise<StuckJob[]> {
  const res = await fetch('/api/admin/jobs/stuck', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch stuck jobs');
  const data = await res.json();
  return data.stuck;
}

async function fetchReliabilityMetrics(): Promise<ReliabilityMetrics | null> {
  try {
    const res = await fetch('/api/health/job-metrics', { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function healStuckJobs(dryRun = false): Promise<{ dryRun: boolean; wouldHeal?: number; healed?: number; details?: Array<{ id: string; jobName: string; action: string }> }> {
  const res = await fetch('/api/admin/jobs/heal', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
  if (!res.ok) throw new Error('Failed to heal stuck jobs');
  return res.json();
}

interface Props {
  onBack: () => void;
}

type AlertLevel = 'ok' | 'warning' | 'critical';

function getSystemAlertLevel(stats: JobsResponse | null, deadLetters: DeadLetterEntry[], healthEntries: SnapshotHealth[], stuckJobs: StuckJob[]): AlertLevel {
  if (!stats) return 'ok';
  const failureRate = stats.summary.totalRuns > 0 ? stats.summary.totalFailed / stats.summary.totalRuns : 0;
  const criticalHealth = healthEntries.filter(h => h.status === 'critical').length;
  if (failureRate > 0.15 || stuckJobs.length > 2 || criticalHealth > 2) return 'critical';
  if (failureRate > 0.05 || stuckJobs.length > 0 || deadLetters.filter(d => !d.resolved).length > 3 || criticalHealth > 0) return 'warning';
  return 'ok';
}

function AlertBanner({ level, stats, stuckCount, dlqCount, criticalCount }: { level: AlertLevel; stats: JobsResponse | null; stuckCount: number; dlqCount: number; criticalCount: number }) {
  if (level === 'ok') return null;
  const failureRate = stats && stats.summary.totalRuns > 0 ? ((stats.summary.totalFailed / stats.summary.totalRuns) * 100).toFixed(1) : '0';
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
      <span className={`text-lg mt-0.5 ${isCritical ? 'text-red-500' : 'text-yellow-500'}`}>
        {isCritical ? '!' : '!'}
      </span>
      <div>
        <p className={`text-sm font-medium ${isCritical ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
          {isCritical ? 'Critical — Immediate attention needed' : 'Warning — Issues detected'}
        </p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">{issues.join(' · ')}</p>
      </div>
    </div>
  );
}

export function JobsDashboard({ onBack }: Props) {
  const [stats, setStats] = useState<JobsResponse | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [healthEntries, setHealthEntries] = useState<SnapshotHealth[]>([]);
  const [stuckJobs, setStuckJobs] = useState<StuckJob[]>([]);
  const [reliability, setReliability] = useState<ReliabilityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'dead-letter' | 'health' | 'stuck'>('overview');
  const [healDryRun, setHealDryRun] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [jobStats, dlEntries, health, stuck, rel] = await Promise.all([
        fetchJobStats(),
        fetchDeadLetterEntries(),
        fetchSnapshotHealth(),
        fetchStuckJobs(),
        fetchReliabilityMetrics(),
      ]);
      setStats(jobStats);
      setDeadLetters(dlEntries);
      setHealthEntries(health);
      setStuckJobs(stuck);
      setReliability(rel);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(id);
  }, [load]);

  const [resolving, setResolving] = useState<string | null>(null);
  const [healing, setHealing] = useState(false);

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await resolveEntry(id);
      setDeadLetters(prev => prev.filter(e => e.id !== id));
    } catch {
      setError('Failed to resolve entry');
    } finally {
      setResolving(null);
    }
  };

  const [healResult, setHealResult] = useState<string | null>(null);

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
        const stuck = await fetchStuckJobs();
        setStuckJobs(stuck);
      }
    } catch {
      setError('Failed to heal stuck jobs');
    } finally {
      setHealing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Background Jobs</h1>
        <button onClick={load} className="ml-auto text-xs text-rh-green hover:underline">
          Refresh
        </button>
      </div>

      {loading && !stats && (
        <div className="text-center py-12 text-rh-light-muted dark:text-rh-muted">Loading...</div>
      )}

      {error && (
        <div className="text-center py-12 text-red-500 dark:text-red-400">{error}</div>
      )}

      {stats && (() => {
        const unresolvedDlq = deadLetters.filter(d => !d.resolved).length;
        const criticalSnapshots = healthEntries.filter(h => h.status === 'critical').length;
        const alertLevel = getSystemAlertLevel(stats, deadLetters, healthEntries, stuckJobs);
        const failureRate = stats.summary.totalRuns > 0 ? ((stats.summary.totalFailed / stats.summary.totalRuns) * 100).toFixed(1) : '0';
        return (
        <>
          {/* System alert banner */}
          <AlertBanner
            level={alertLevel}
            stats={stats}
            stuckCount={stuckJobs.length}
            dlqCount={unresolvedDlq}
            criticalCount={criticalSnapshots}
          />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <StatCard label="Jobs (24h)" value={stats.summary.totalRuns} />
            <StatCard label="Active Jobs" value={stats.summary.totalJobs} />
            <StatCard label="Failed" value={stats.summary.totalFailed} color={stats.summary.totalFailed > 0 ? 'red' : undefined} />
            <StatCard label="Dead Letter" value={stats.summary.totalDeadLettered} color={stats.summary.totalDeadLettered > 0 ? 'orange' : undefined} />
            <StatCard label="Fail Rate" value={parseFloat(failureRate)} suffix="%" color={parseFloat(failureRate) > 15 ? 'red' : parseFloat(failureRate) > 5 ? 'orange' : undefined} />
          </div>

          {/* Reliability metrics */}
          {reliability && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="P95 Duration" value={reliability.runs.p95DurationMs > 0 ? Math.round(reliability.runs.p95DurationMs / 1000 * 10) / 10 : 0} suffix="s" />
              <StatCard label="Running Now" value={reliability.runs.running} color={reliability.runs.running > 3 ? 'orange' : undefined} />
              <StatCard label="Idemp. Keys" value={reliability.idempotency.activeKeys} />
              <StatCard label="Dedup Hits" value={reliability.idempotency.duplicateHits} color={reliability.idempotency.duplicateHits > 10 ? 'orange' : undefined} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-4 border-b border-rh-light-border dark:border-rh-border mb-4">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} label="Job Status" count={stats.jobs.length} />
            <TabButton active={tab === 'dead-letter'} onClick={() => setTab('dead-letter')} label="Dead Letter" count={unresolvedDlq} alertColor={unresolvedDlq > 3 ? 'red' : unresolvedDlq > 0 ? 'orange' : undefined} />
            <TabButton active={tab === 'health'} onClick={() => setTab('health')} label="Health" count={healthEntries.length} alertColor={criticalSnapshots > 0 ? 'red' : undefined} />
            <TabButton active={tab === 'stuck'} onClick={() => setTab('stuck')} label="Stuck" count={stuckJobs.length} alertColor={stuckJobs.length > 0 ? 'red' : undefined} />
          </div>

          {tab === 'overview' && (
            <div className="space-y-2">
              {stats.jobs.length === 0 ? (
                <div className="text-center py-8 text-rh-light-muted dark:text-rh-muted text-sm">
                  No job runs in the last 24 hours
                </div>
              ) : (
                stats.jobs.map(job => (
                  <JobRow key={job.jobName} job={job} />
                ))
              )}
            </div>
          )}

          {tab === 'dead-letter' && (
            <div className="space-y-2">
              {deadLetters.length === 0 ? (
                <div className="text-center py-8 text-rh-light-muted dark:text-rh-muted text-sm">
                  No dead letter entries
                </div>
              ) : (
                deadLetters.map(entry => (
                  <div key={entry.id} className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                        {entry.jobName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-rh-light-muted dark:text-rh-muted">
                          {entry.attempts} attempts
                        </span>
                        <button
                          onClick={() => handleResolve(entry.id)}
                          disabled={resolving === entry.id}
                          className="text-xs text-rh-green hover:underline disabled:opacity-50"
                        >
                          {resolving === entry.id ? 'Resolving...' : 'Resolve'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">{entry.error}</p>
                    <p className="text-[10px] text-rh-light-muted dark:text-rh-muted mt-1">
                      {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'health' && (
            <div className="space-y-2">
              {healthEntries.length === 0 ? (
                <div className="text-center py-8 text-rh-light-muted dark:text-rh-muted text-sm">
                  No snapshot health data
                </div>
              ) : (
                [...healthEntries]
                  .sort((a, b) => {
                    const priority: Record<string, number> = { critical: 0, stale: 1, gaps: 2, healthy: 3 };
                    return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
                  })
                  .map(entry => (
                    <div key={entry.userId} className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                          {entry.username}
                        </span>
                        <HealthBadge status={entry.status} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-rh-light-muted dark:text-rh-muted">Last snapshot: </span>
                          <span className="text-rh-light-text dark:text-rh-text">{entry.lastSnapshotAge == null ? '—' : entry.lastSnapshotAge < 1 ? '<1 min' : `${Math.round(entry.lastSnapshotAge)} min`}</span>
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
                          <span className="text-rh-light-text dark:text-rh-text">{entry.longestGapMinutes > 0 ? `${Math.round(entry.longestGapMinutes)} min` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {tab === 'stuck' && (
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
                  onClick={handleHealAll}
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
                <div className="text-center py-8 text-rh-light-muted dark:text-rh-muted text-sm">
                  No stuck jobs
                </div>
              ) : (
                stuckJobs.map(job => (
                  <div key={job.id} className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                        {job.jobName.replace(/_/g, ' ')}
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
          )}
        </>
        );
      })()}
    </div>
  );
}

function StatCard({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color?: 'red' | 'orange' }) {
  const valueColor = color === 'red' ? 'text-red-500 dark:text-red-400' : color === 'orange' ? 'text-orange-500 dark:text-orange-400' : 'text-rh-light-text dark:text-rh-text';
  return (
    <div className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border text-center">
      <div className={`text-2xl font-bold ${valueColor}`}>
        {Number.isInteger(value) ? value : value.toFixed(1)}{suffix || ''}
      </div>
      <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count, alertColor }: { active: boolean; onClick: () => void; label: string; count: number; alertColor?: 'red' | 'orange' }) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
      }`}
    >
      {label} ({count})
      {alertColor && count > 0 && (
        <span className={`w-2 h-2 rounded-full ${alertColor === 'red' ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} />
      )}
    </button>
  );
}

function HealthBadge({ status }: { status: SnapshotHealth['status'] }) {
  const styles: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
    stale: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    gaps: 'bg-orange-500/10 text-orange-500 dark:text-orange-400',
    critical: 'bg-red-500/10 text-red-500 dark:text-red-400',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[status] ?? styles.healthy}`}>
      {status}
    </span>
  );
}

const CATEGORY_STYLES: Record<FailureCategory, { bg: string; text: string; label: string }> = {
  TRANSIENT: { bg: 'bg-blue-500/10', text: 'text-blue-500 dark:text-blue-400', label: 'Transient' },
  PERMANENT: { bg: 'bg-red-500/10', text: 'text-red-500 dark:text-red-400', label: 'Permanent' },
  RATE_LIMITED: { bg: 'bg-orange-500/10', text: 'text-orange-500 dark:text-orange-400', label: 'Rate Limited' },
  DATA_QUALITY: { bg: 'bg-purple-500/10', text: 'text-purple-500 dark:text-purple-400', label: 'Data Quality' },
};

function JobRow({ job }: { job: JobStat }) {
  const successRate = job.total > 0 ? ((job.success / job.total) * 100).toFixed(0) : '—';
  const severity = job.alertSeverity ?? 'none';
  const dotColor = severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-orange-500' : job.failed > 0 || job.deadLettered > 0 ? 'bg-yellow-500' : 'bg-emerald-500';
  const hasCategories = job.failureCategories && Object.values(job.failureCategories).some(v => v > 0);

  return (
    <div className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
            {job.jobName.replace(/_/g, ' ')}
          </span>
          {severity === 'critical' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 dark:text-red-400 font-medium">CRITICAL</span>
          )}
          {severity === 'warning' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium">WARNING</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-rh-light-muted dark:text-rh-muted">
          <span>{successRate}% ok</span>
          <span>{job.total} runs</span>
          {job.failed > 0 && <span className="text-red-500 dark:text-red-400">{job.failed} failed</span>}
          <span>{job.avgDurationMs > 0 ? `${(job.avgDurationMs / 1000).toFixed(1)}s avg` : '—'}</span>
        </div>
      </div>
      {hasCategories && (
        <div className="flex items-center gap-1.5 mt-1.5 ml-4">
          {(Object.entries(job.failureCategories) as [FailureCategory, number][])
            .filter(([, count]) => count > 0)
            .map(([cat, count]) => (
              <span key={cat} className={`text-[9px] px-1.5 py-0.5 rounded ${CATEGORY_STYLES[cat].bg} ${CATEGORY_STYLES[cat].text} font-medium`}>
                {CATEGORY_STYLES[cat].label} ({count})
              </span>
            ))}
        </div>
      )}
      {job.lastRun && (
        <div className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 mt-1 ml-4">
          Last: {timeAgo(job.lastRun)}
          {job.lastError && (
            <span className="text-red-600 dark:text-red-400 ml-2">Error: {job.lastError.slice(0, 80)}</span>
          )}
        </div>
      )}
    </div>
  );
}
