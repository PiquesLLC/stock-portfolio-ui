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

interface Props {
  onBack: () => void;
}

export function JobsDashboard({ onBack }: Props) {
  const [stats, setStats] = useState<JobsResponse | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'dead-letter'>('overview');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [jobStats, dlEntries] = await Promise.all([
        fetchJobStats(),
        fetchDeadLetterEntries(),
      ]);
      setStats(jobStats);
      setDeadLetters(dlEntries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [resolving, setResolving] = useState<string | null>(null);

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
