import { useState, useCallback, useRef, useEffect } from 'react';
import {
  startDeepResearch,
  getDeepResearchResult,
  cancelDeepResearch,
  DeepResearchJobSummary,
  DeepResearchJobResult,
} from '../api';
import { useDeepResearchPoller } from '../hooks/useDeepResearchPoller';
import { DeepResearchReport } from './DeepResearchReport';
import { ThinkingFeed } from './ThinkingFeed';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { useToast } from '../context/ToastContext';

const RESEARCH_TYPES = [
  { id: 'stock', label: 'Stock', icon: '📈' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' },
  { id: 'sector', label: 'Sector', icon: '🏭' },
  { id: 'custom', label: 'Custom', icon: '🔬' },
] as const;

const ACTIVE_STATUSES = new Set(['queued', 'submitted', 'in_progress']);

interface DeepResearchPageProps {
  onTickerClick?: (ticker: string) => void;
}

export function DeepResearchPage({ onTickerClick }: DeepResearchPageProps) {
  const { showToast } = useToast();
  const { jobs, activeStatuses, loading, error, refresh } = useDeepResearchPoller();

  // Form state
  const [researchType, setResearchType] = useState<string>('stock');
  const [ticker, setTicker] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // View state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<DeepResearchJobResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Track previous job statuses for transition detection
  const prevJobsRef = useRef<Map<string, string>>(new Map());

  // Detect job completion transitions
  useEffect(() => {
    const prev = prevJobsRef.current;
    for (const job of jobs) {
      const oldStatus = prev.get(job.id);
      if (oldStatus && ACTIVE_STATUSES.has(oldStatus) && job.status === 'completed') {
        showToast(`Research completed${job.ticker ? ` for ${job.ticker}` : ''}`, 'success');
      } else if (oldStatus && ACTIVE_STATUSES.has(oldStatus) && job.status === 'failed') {
        showToast('Research job failed', 'error');
      }
    }
    const next = new Map<string, string>();
    jobs.forEach(j => next.set(j.id, j.status));
    prevJobsRef.current = next;
  }, [jobs, showToast]);

  const handleSubmit = async () => {
    if (prompt.trim().length < 10) {
      showToast('Prompt must be at least 10 characters', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const opts: { ticker?: string; researchType: string } = { researchType };
      if (ticker.trim()) opts.ticker = ticker.trim().toUpperCase();
      await startDeepResearch(prompt.trim(), opts);
      showToast('Deep research submitted — this typically takes ~20 minutes', 'success');
      setPrompt('');
      setTicker('');
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start research';
      if (msg.includes('concurrent')) {
        showToast('You already have an active research job', 'error');
      } else if (msg.includes('Monthly') || msg.includes('monthly')) {
        showToast('Monthly research limit reached', 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await cancelDeepResearch(jobId);
      showToast('Research job cancelled', 'success');
      refresh();
    } catch {
      showToast('Failed to cancel job', 'error');
    }
  };

  const handleViewReport = useCallback(async (jobId: string) => {
    setSelectedJobId(jobId);
    setLoadingReport(true);
    try {
      const result = await getDeepResearchResult(jobId);
      setReportData(result);
    } catch {
      showToast('Failed to load report', 'error');
      setSelectedJobId(null);
    } finally {
      setLoadingReport(false);
    }
  }, [showToast]);

  const handleRetry = async (job: DeepResearchJobSummary) => {
    setResearchType(job.researchType);
    setPrompt(job.prompt);
    if (job.ticker) setTicker(job.ticker);
    showToast('Job details loaded — edit and resubmit', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If viewing a report, show it
  if (selectedJobId && reportData) {
    return (
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => { setSelectedJobId(null); setReportData(null); }}
          className="flex items-center gap-1.5 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to jobs
        </button>
        <DeepResearchReport
          result={reportData}
          onFollowUpSubmitted={refresh}
          onTickerClick={onTickerClick}
        />
      </div>
    );
  }

  // Loading report state
  if (selectedJobId && loadingReport) {
    return (
      <div className="flex items-center justify-center py-20">
        <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const hasJobs = jobs.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rh-green/20 to-rh-green/5 flex items-center justify-center">
            <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          {jobs.some(j => ACTIVE_STATUSES.has(j.status)) && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rh-green deep-research-progress" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold text-rh-light-text dark:text-white">NALA AI Deep Research</h1>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted">
            Institutional-quality research reports powered by Google Deep Research
          </p>
        </div>
      </div>

      {/* ── New Research Form ── */}
      <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
        {/* Research type pills */}
        <div className="flex gap-1.5 mb-3">
          {RESEARCH_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setResearchType(rt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                researchType === rt.id
                  ? 'bg-rh-green/15 text-rh-green border border-rh-green/30'
                  : 'bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-white/50 border border-gray-200/50 dark:border-white/[0.06] hover:border-gray-300 dark:hover:border-white/[0.12]'
              }`}
            >
              <span className="mr-1">{rt.icon}</span>
              {rt.label}
            </button>
          ))}
        </div>

        {/* Ticker input (only for stock/sector) */}
        {(researchType === 'stock' || researchType === 'sector') && (
          <div className="mb-3">
            <label className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-1 block">
              {researchType === 'stock' ? 'Ticker (optional)' : 'Sector / ETF'}
            </label>
            <TickerAutocompleteInput
              value={ticker}
              onChange={setTicker}
              onSelect={(r) => setTicker(r.symbol)}
              placeholder={researchType === 'stock' ? 'e.g. AAPL' : 'e.g. XLF, Technology'}
              compact
            />
          </div>
        )}

        {/* Prompt */}
        <div className="mb-3">
          <label className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-1 block">
            Research Prompt
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={
              researchType === 'stock'
                ? 'e.g. "Deep dive on NVDA\'s AI datacenter growth prospects, competitive moat vs AMD/Intel, and valuation at current levels"'
                : researchType === 'portfolio'
                ? 'e.g. "Analyze my portfolio for concentration risk, sector imbalances, and suggest rebalancing opportunities"'
                : researchType === 'sector'
                ? 'e.g. "Analyze the semiconductor sector outlook for 2026 given AI capex trends and trade policy risks"'
                : 'e.g. "Compare the risk-adjusted returns of growth vs value strategies in the current macro environment"'
            }
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-rh-light-text dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-rh-green/50 resize-none"
            rows={3}
            maxLength={2000}
          />
          <div className="flex justify-end mt-1">
            <span className={`text-[10px] ${prompt.length > 1800 ? 'text-amber-400' : 'text-rh-light-muted dark:text-white/30'}`}>
              {prompt.length}/2000
            </span>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || prompt.trim().length < 10}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-rh-green text-white hover:bg-rh-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <img src="/north-signal-logo-transparent.png" alt="" className="h-4 w-4 animate-spin" />
              Submitting...
            </span>
          ) : (
            'Start Deep Research'
          )}
        </button>
        <p className="text-[10px] text-rh-light-muted dark:text-white/30 mt-2 text-center">
          Research typically takes 15-25 minutes. You'll be notified when complete.
        </p>
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && !hasJobs && (
        <div className="flex items-center justify-center py-12">
          <img src="/north-signal-logo-transparent.png" alt="" className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !hasJobs && (
        <EmptyState />
      )}

      {/* ── Job List ── */}
      {hasJobs && (
        <div>
          <h2 className="text-sm font-semibold text-rh-light-text dark:text-white mb-3">
            Research Jobs
          </h2>
          <div className="space-y-2">
            {jobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                activeStatus={activeStatuses.get(job.id)}
                onView={() => handleViewReport(job.id)}
                onCancel={() => handleCancel(job.id)}
                onRetry={() => handleRetry(job)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-10 text-center">
      {/* Orbital animation */}
      <div className="relative w-20 h-20 mx-auto mb-5">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-rh-green/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-0" style={{ animation: 'nala-orbit 6s linear infinite' }}>
          <div className="w-2 h-2 rounded-full bg-rh-green/60" />
        </div>
        <div className="absolute inset-0" style={{ animation: 'nala-orbit 8s linear infinite reverse' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400/50" />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-rh-light-text dark:text-white mb-2">
        Your AI Research Analyst
      </h3>
      <p className="text-xs text-rh-light-muted dark:text-rh-muted max-w-md mx-auto leading-relaxed mb-4">
        NALA AI Deep Research generates institutional-quality reports by analyzing hundreds of sources,
        financial data, and your portfolio context.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
        {[
          'Deep-dive stock analysis',
          'Portfolio risk assessment',
          'Sector outlook reports',
          'Bull/Bear/Base scenarios',
          'Valuation analysis',
          'Source citations',
        ].map(feat => (
          <span
            key={feat}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-white/50 border border-gray-200/50 dark:border-white/[0.06]"
          >
            {feat}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────

function JobCard({
  job,
  activeStatus,
  onView,
  onCancel,
  onRetry,
}: {
  job: DeepResearchJobSummary;
  activeStatus?: import('../api').DeepResearchJobStatus;
  onView: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const isActive = ACTIVE_STATUSES.has(job.status);
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  const etaMinutes = activeStatus?.estimatedTimeRemainingMs
    ? Math.ceil(activeStatus.estimatedTimeRemainingMs / 60000)
    : null;

  // Progress bar: estimate based on typical 20-min job (poll now at 5s intervals)
  const progressPct = activeStatus
    ? Math.min(95, ((activeStatus.pollCount * 5) / (20 * 60)) * 100)
    : 0;

  // Thinking summaries from SSE stream
  const thinkingSummaries = activeStatus?.thinkingSummaries ?? [];
  const latestThinking = thinkingSummaries.length > 0
    ? thinkingSummaries[thinkingSummaries.length - 1].text
    : null;

  const timeAgo = formatTimeAgo(job.createdAt);

  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      isActive
        ? 'bg-gray-50 dark:bg-white/[0.03] border-rh-green/20'
        : 'bg-gray-50 dark:bg-white/[0.02] border-gray-200/50 dark:border-white/[0.06]'
    }`}>
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="mt-0.5 shrink-0">
          {isActive && (
            <span className="flex h-5 w-5 items-center justify-center">
              <span className="absolute h-2.5 w-2.5 rounded-full bg-rh-green/40 deep-research-progress" />
              <span className="relative h-2 w-2 rounded-full bg-rh-green" />
            </span>
          )}
          {isCompleted && (
            <span className="flex h-5 w-5 items-center justify-center">
              <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          {isFailed && (
            <span className="flex h-5 w-5 items-center justify-center">
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          {isCancelled && (
            <span className="flex h-5 w-5 items-center justify-center">
              <svg className="w-4 h-4 text-gray-400 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {job.ticker && (
              <span className="text-xs font-semibold text-rh-green">{job.ticker}</span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-white/40">
              {job.researchType}
            </span>
            <span className="text-[10px] text-rh-light-muted dark:text-white/30 ml-auto shrink-0">
              {timeAgo}
            </span>
          </div>
          <p className="text-xs text-rh-light-text dark:text-white/80 line-clamp-2 leading-relaxed">
            {job.prompt}
          </p>

          {/* Progress bar for active jobs */}
          {isActive && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-rh-green/60 deep-research-progress transition-all duration-1000"
                  style={{ width: `${Math.max(5, progressPct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-rh-light-muted dark:text-white/30 truncate max-w-[70%]">
                  {job.status === 'queued'
                    ? 'Queued'
                    : job.status === 'submitted'
                    ? 'Starting...'
                    : latestThinking
                    ? latestThinking
                    : 'Researching...'}
                </span>
                {etaMinutes != null && etaMinutes > 0 && (
                  <span className="text-[10px] text-rh-light-muted dark:text-white/30 shrink-0">
                    ~{etaMinutes} min remaining
                  </span>
                )}
              </div>
              {/* Thinking summaries feed */}
              {thinkingSummaries.length > 0 && (
                <ThinkingFeed summaries={thinkingSummaries} />
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5">
          {isActive && (
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          )}
          {isCompleted && (
            <button
              onClick={onView}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-rh-green hover:bg-rh-green/10 transition-colors"
            >
              View Report
            </button>
          )}
          {isFailed && (
            <button
              onClick={onRetry}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default DeepResearchPage;
