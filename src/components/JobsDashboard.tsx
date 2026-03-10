import { useState, useEffect, useCallback } from 'react';
import { timeAgo } from '../utils/format';

interface JobStat {
  jobName: string;
  total: number;
  success: number;
  failed: number;
  deadLettered: number;
  avgDurationMs: number;
  lastRun: string | null;
  lastError: string | null;
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

async function healStuckJobs(): Promise<void> {
  const res = await fetch('/api/admin/jobs/heal', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to heal stuck jobs');
}

interface Props {
  onBack: () => void;
}

export function JobsDashboard({ onBack }: Props) {
  const [stats, setStats] = useState<JobsResponse | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [healthEntries, setHealthEntries] = useState<SnapshotHealth[]>([]);
  const [stuckJobs, setStuckJobs] = useState<StuckJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'dead-letter' | 'health' | 'stuck'>('overview');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [jobStats, dlEntries, health, stuck] = await Promise.all([
        fetchJobStats(),
        fetchDeadLetterEntries(),
        fetchSnapshotHealth(),
        fetchStuckJobs(),
      ]);
      setStats(jobStats);
      setDeadLetters(dlEntries);
      setHealthEntries(health);
      setStuckJobs(stuck);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const handleHealAll = async () => {
    setHealing(true);
    try {
      await healStuckJobs();
      const stuck = await fetchStuckJobs();
      setStuckJobs(stuck);
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

      {stats && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Jobs (24h)" value={stats.summary.totalRuns} />
            <StatCard label="Active Jobs" value={stats.summary.totalJobs} />
            <StatCard label="Failed" value={stats.summary.totalFailed} color={stats.summary.totalFailed > 0 ? 'red' : undefined} />
            <StatCard label="Dead Letter" value={stats.summary.totalDeadLettered} color={stats.summary.totalDeadLettered > 0 ? 'orange' : undefined} />
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-rh-light-border dark:border-rh-border mb-4">
            <button
              onClick={() => setTab('overview')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'overview' ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
              }`}
            >
              Job Status ({stats.jobs.length})
            </button>
            <button
              onClick={() => setTab('dead-letter')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'dead-letter' ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
              }`}
            >
              Dead Letter ({deadLetters.length})
            </button>
            <button
              onClick={() => setTab('health')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'health' ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
              }`}
            >
              Health ({healthEntries.length})
            </button>
            <button
              onClick={() => setTab('stuck')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'stuck' ? 'border-rh-green text-rh-green' : 'border-transparent text-rh-light-muted dark:text-rh-muted'
              }`}
            >
              Stuck ({stuckJobs.length})
            </button>
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
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleHealAll}
                  disabled={healing || stuckJobs.length === 0}
                  className="text-xs px-3 py-1.5 rounded-md bg-rh-green text-white font-medium hover:bg-rh-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {healing ? 'Healing...' : 'Heal All'}
                </button>
              </div>
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
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: 'red' | 'orange' }) {
  const valueColor = color === 'red' ? 'text-red-500 dark:text-red-400' : color === 'orange' ? 'text-orange-500 dark:text-orange-400' : 'text-rh-light-text dark:text-rh-text';
  return (
    <div className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border text-center">
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">{label}</div>
    </div>
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

function JobRow({ job }: { job: JobStat }) {
  const successRate = job.total > 0 ? ((job.success / job.total) * 100).toFixed(0) : '—';
  const hasIssues = job.failed > 0 || job.deadLettered > 0;

  return (
    <div className="p-3 rounded-lg bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hasIssues ? 'bg-orange-500' : 'bg-emerald-500'}`} />
          <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
            {job.jobName.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-rh-light-muted dark:text-rh-muted">
          <span>{successRate}% ok</span>
          <span>{job.total} runs</span>
          <span>{job.avgDurationMs > 0 ? `${(job.avgDurationMs / 1000).toFixed(1)}s avg` : '—'}</span>
        </div>
      </div>
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
