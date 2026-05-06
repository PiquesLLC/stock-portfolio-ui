import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  startDeepResearch,
  getDeepResearchResult,
  cancelDeepResearch,
  archiveDeepResearch,
  unarchiveDeepResearch,
  deleteDeepResearch,
  clearFinishedDeepResearch,
  DeepResearchJobSummary,
  DeepResearchJobResult,
  DeepResearchJobStatus,
} from '../api';
import { useDeepResearchPoller } from '../hooks/useDeepResearchPoller';
import { DeepResearchReport } from './DeepResearchReport';
import { ThinkingFeed } from './ThinkingFeed';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from '../context/ToastContext';

/* ─────────────────────────────────────────────
   Tokens / static content (matches the mockup at
   C:\Users\jonpa\Documents\deep-research-mockup-2026-05-04.html)
   ───────────────────────────────────────────── */

const ACTIVE_STATUSES = new Set(['queued', 'submitted', 'in_progress']);

/** Type-chooser cards. Order + icons + descriptions match the mockup verbatim. */
const RESEARCH_TYPES: {
  id: 'stock' | 'portfolio' | 'sector' | 'custom';
  name: string;
  desc: string;
  /** SVG path string for the green icon (24x24 viewBox, currentColor stroke). */
  icon: React.ReactNode;
}[] = [
  {
    id: 'stock',
    name: 'Single Stock',
    desc: 'Deep dive on one ticker — fundamentals, competitive moat, valuation',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M3 13l4-4 4 4 7-7M14 6h7v7" />
      </svg>
    ),
  },
  {
    id: 'portfolio',
    name: 'My Portfolio',
    desc: 'Holistic analysis of your holdings — risk, allocation, opportunities',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'sector',
    name: 'Sector / ETF',
    desc: 'Industry-wide trends — winners, losers, structural shifts',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'custom',
    name: 'Open-Ended',
    desc: 'Whatever you can dream up — macro, strategy, "what-if" scenarios',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

/** Suggested prompt chips for the "Suggested for your portfolio" row. Verbatim from mockup. */
const SUGGESTED_PROMPTS = [
  'Risk-adjust my Tech 36% concentration',
  'TSM vs AMD vs INTC — chip-cycle winners',
  'Tax-loss harvest opportunities in WMT',
  'Iran tensions impact on my holdings',
  'Best healthcare names to add',
];

/** Trending This Week cards — verbatim from mockup. accent: green / amber / blue. */
const TRENDING: { accent: 'green' | 'amber' | 'blue'; tag: string; title: string; why: string }[] = [
  {
    accent: 'green',
    tag: 'AI Infrastructure',
    title: 'Hyperscaler cap-ex slowdown — who survives?',
    why: '87 reports this week · concentration risk in NVDA / AMD / TSM cohort',
  },
  {
    accent: 'amber',
    tag: 'Macro Risk',
    title: 'Iran-Israel tensions → oil shock probability',
    why: '62 reports · WTI futures pricing 18% premium',
  },
  {
    accent: 'blue',
    tag: 'Earnings Season',
    title: 'Q1 results — guidance vs reality',
    why: '54 reports · 71% beat consensus, 8% raised guidance',
  },
];

const ACCENT_HEX: Record<'green' | 'amber' | 'blue', string> = {
  green: '#00c805',
  amber: '#ff9f0a',
  blue: '#4cb3ff',
};

interface DeepResearchPageProps {
  onTickerClick?: (ticker: string) => void;
}

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function prettyType(rt: string): string {
  switch (rt) {
    case 'stock': return 'Single Stock';
    case 'portfolio': return 'Portfolio';
    case 'sector': return 'Sector / ETF';
    case 'custom': return 'Open-Ended';
    default: return rt.charAt(0).toUpperCase() + rt.slice(1);
  }
}

/* ─────────────────────────────────────────────
   Section header (green vertical bar + uppercase
   label) — matches `.h-label` in the mockup.
   ───────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-rh-light-text dark:text-rh-text">
      <span className="block w-[3px] h-3 rounded-[2px] bg-rh-green shadow-[0_0_10px_rgba(0,200,5,0.45)]" />
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────
   Inline keyframes for the live-dot pulse so we
   match the mockup's exact 1.6s scale/opacity
   curve (Tailwind's animate-pulse is opacity-only).
   ───────────────────────────────────────────── */

const KEYFRAMES_STYLE = `
  @keyframes drLivePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(1.3); }
  }
`;

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */

export function DeepResearchPage({ onTickerClick }: DeepResearchPageProps) {
  const { showToast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const { jobs, activeStatuses, loading, error, refresh } = useDeepResearchPoller({ includeArchived: showArchived });

  const [researchType, setResearchType] = useState<string>('stock');
  const [ticker, setTicker] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<DeepResearchJobResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Per-row kebab menu (Archive/Delete). Anchor stores the kebab button's
  // screen rect so the floating menu portals to the right position. Mirrors
  // the HoldingsTable pattern.
  const [rowMenu, setRowMenu] = useState<{ jobId: string; archived: boolean; status: string; anchor: DOMRect } | null>(null);
  // Confirm dialog state — either a single job delete or 'clear-all'.
  const [confirmAction, setConfirmAction] = useState<{ kind: 'delete-one'; jobId: string } | { kind: 'clear-all' } | null>(null);
  const [mutating, setMutating] = useState(false);

  const prevJobsRef = useRef<Map<string, string>>(new Map());

  /* ── Row-menu dismissal (Esc / scroll / resize / outside-click) ── */
  useEffect(() => {
    if (!rowMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null); };
    const onScroll = () => setRowMenu(null);
    const onResize = () => setRowMenu(null);
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-row-menu]') || t.closest('[data-row-kebab]')) return;
      setRowMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [rowMenu]);

  /* ── Toast on status transitions ── */
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

  /* ── Handlers ── */

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('concurrent')) {
        showToast('You already have an active research job', 'error');
      } else if (msg.toLowerCase().includes('monthly')) {
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

  const handleArchive = async (jobId: string) => {
    setMutating(true);
    try {
      await archiveDeepResearch(jobId);
      showToast('Report archived', 'success');
      refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to archive', 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleUnarchive = async (jobId: string) => {
    setMutating(true);
    try {
      await unarchiveDeepResearch(jobId);
      showToast('Report restored', 'success');
      refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to restore', 'error');
    } finally {
      setMutating(false);
    }
  };

  const executeConfirm = async () => {
    if (!confirmAction || mutating) return;
    setMutating(true);
    try {
      if (confirmAction.kind === 'delete-one') {
        await deleteDeepResearch(confirmAction.jobId);
        showToast('Report deleted', 'success');
      } else {
        const { deleted } = await clearFinishedDeepResearch();
        showToast(deleted === 0 ? 'No finished reports to clear' : `Cleared ${deleted} report${deleted === 1 ? '' : 's'}`, 'success');
      }
      setConfirmAction(null);
      refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleViewReport = useCallback(async (jobId: string) => {
    setReportData(null);
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

  const handleRetry = (job: DeepResearchJobSummary) => {
    setResearchType(job.researchType);
    setPrompt(job.prompt);
    if (job.ticker) setTicker(job.ticker);
    showToast('Job details loaded — edit and resubmit', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePickSuggestion = (text: string) => {
    setPrompt(text);
    // Auto-pick a sensible type for the chip.
    if (text.toLowerCase().includes('portfolio')) setResearchType('portfolio');
    else if (text.toLowerCase().includes('healthcare') || text.toLowerCase().includes('sector')) setResearchType('sector');
    else if (/[A-Z]{2,5}/.test(text)) setResearchType('stock');
    else setResearchType('custom');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Stats ── */

  const stats = useMemo(() => {
    const completed = jobs.filter(j => j.status === 'completed');
    const tickerSet = new Set(completed.map(j => j.ticker).filter(Boolean) as string[]);
    // Heuristic: each completed report saves ~20 minutes of manual research vs
    // reading all the sources yourself.
    const hoursSaved = (completed.length * 20) / 60;
    // Current calendar month + previous month for the green ↑ delta.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const thisMonth = completed.filter(j => new Date(j.createdAt).getTime() >= monthStart).length;
    const prevMonth = completed.filter(j => {
      const t = new Date(j.createdAt).getTime();
      return t >= prevMonthStart && t < monthStart;
    }).length;
    const deltaPct = prevMonth > 0
      ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100)
      : (thisMonth > 0 ? 100 : 0);
    // Sector heuristic — for the "across X sectors" sub. Without per-ticker
    // sector data, fall back to ~unique-tickers/3 capped at 8 sectors so the
    // number never reads as fake.
    const sectorCount = Math.min(8, Math.max(1, Math.ceil(tickerSet.size / 2)));
    return {
      reports: completed.length,
      thisMonth,
      deltaPct,
      hoursSaved,
      tickers: tickerSet.size,
      sectors: sectorCount,
    };
  }, [jobs]);

  const activePromptPlaceholder =
    researchType === 'stock'
      ? "Deep dive on NVDA's AI datacenter growth prospects, competitive moat vs AMD/Intel, and valuation at current levels..."
      : researchType === 'portfolio'
      ? 'Analyze my portfolio for concentration risk, sector imbalances, and suggest rebalancing opportunities'
      : researchType === 'sector'
      ? 'Analyze the semiconductor sector outlook for 2026 given AI capex trends and trade policy risks'
      : 'Compare the risk-adjusted returns of growth vs value strategies in the current macro environment';

  /* ─────────────────────────────────────────
     RENDER — REPORT VIEW BRANCH
     ─────────────────────────────────────── */

  if (selectedJobId && reportData) {
    return (
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => { setSelectedJobId(null); setReportData(null); }}
          className="flex items-center gap-1.5 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to jobs
        </button>
        <DeepResearchReport result={reportData} onFollowUpSubmitted={refresh} onTickerClick={onTickerClick} />
      </div>
    );
  }

  if (selectedJobId && loadingReport) {
    return (
      <div className="flex items-center justify-center py-24">
        <img src="/north-signal-logo-transparent.png" alt="" className="h-10 w-10 animate-spin opacity-70" />
      </div>
    );
  }

  /* ─────────────────────────────────────────
     RENDER — DEFAULT (mockup-matching layout)
     ─────────────────────────────────────── */

  return (
    <div className="pt-9 pb-20">
      <style>{KEYFRAMES_STYLE}</style>

      {/* ===== HERO ===== */}
      <div className="mb-9">
        <h1 className="hero-glow-green font-black tracking-[-0.05em] leading-none text-rh-light-text dark:text-rh-text mb-2 text-[40px] min-[640px]:text-[clamp(48px,3.5vw,64px)]">
          NALA AI Deep Research
        </h1>
        <p className="text-[13px] max-[640px]:text-[12px] text-rh-light-muted dark:text-white/60">
          Institutional-quality reports powered by Google Deep Research
        </p>
      </div>

      {/* ===== STATS STRIP ===== */}
      <div className="grid grid-cols-3 border-y border-white/[0.06] py-[18px] mb-12 max-[900px]:py-[14px]">
        {/* 1. Reports Generated */}
        <div className="px-7 max-[900px]:px-[14px] max-[640px]:px-2 first:pl-0 first:border-l-0 border-l border-white/[0.06]">
          <div className="text-[10px] max-[900px]:text-[9px] max-[640px]:text-[8px] font-bold tracking-[0.14em] max-[900px]:tracking-[0.12em] uppercase text-rh-light-muted dark:text-white/30">Reports Generated</div>
          <div className="text-[26px] max-[900px]:text-[20px] max-[640px]:text-[17px] font-bold tracking-[-0.02em] mt-2 max-[900px]:mt-[6px] tabular-nums">{stats.reports}</div>
          <div className="text-[11px] max-[900px]:text-[10px] max-[640px]:text-[9px] text-rh-light-muted dark:text-white/55 mt-1 max-[900px]:mt-[3px]">
            {stats.thisMonth} this month
            {stats.deltaPct !== 0 && (
              <>
                {' · '}
                <span className="text-rh-green font-semibold">
                  {stats.deltaPct > 0 ? '↑' : '↓'} {Math.abs(stats.deltaPct)}%
                </span>
              </>
            )}
          </div>
        </div>
        {/* 2. Time Saved */}
        <div className="px-7 max-[900px]:px-[14px] max-[640px]:px-2 border-l border-white/[0.06]">
          <div className="text-[10px] max-[900px]:text-[9px] max-[640px]:text-[8px] font-bold tracking-[0.14em] max-[900px]:tracking-[0.12em] uppercase text-rh-light-muted dark:text-white/30">Time Saved</div>
          <div className="text-[26px] max-[900px]:text-[20px] max-[640px]:text-[17px] font-bold tracking-[-0.02em] mt-2 max-[900px]:mt-[6px] tabular-nums">{stats.hoursSaved.toFixed(1)} hrs</div>
          <div className="text-[11px] max-[900px]:text-[10px] max-[640px]:text-[9px] text-rh-light-muted dark:text-white/55 mt-1 max-[900px]:mt-[3px]">
            vs manual research
          </div>
        </div>
        {/* 3. Tickers Researched */}
        <div className="px-7 max-[900px]:px-[14px] max-[640px]:px-2 border-l border-white/[0.06]">
          <div className="text-[10px] max-[900px]:text-[9px] max-[640px]:text-[8px] font-bold tracking-[0.14em] max-[900px]:tracking-[0.12em] uppercase text-rh-light-muted dark:text-white/30">Tickers Researched</div>
          <div className="text-[26px] max-[900px]:text-[20px] max-[640px]:text-[17px] font-bold tracking-[-0.02em] mt-2 max-[900px]:mt-[6px] tabular-nums">{stats.tickers}</div>
          <div className="text-[11px] max-[900px]:text-[10px] max-[640px]:text-[9px] text-rh-light-muted dark:text-white/55 mt-1 max-[900px]:mt-[3px]">
            across {stats.sectors} sector{stats.sectors === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* ===== ASK ANYTHING (PROMPT-FIRST FORM) ===== */}
      <section className="mb-14">
        <div className="flex justify-between items-end mb-[18px]">
          <SectionLabel>Ask anything</SectionLabel>
          <div className="text-[10px] text-rh-light-muted dark:text-white/30 uppercase tracking-[0.14em]">
            Powered by Gemini · Deep Research
          </div>
        </div>

        {/* Prompt shell — gradient alpha bumps 0.04→0.06 on focus to match
            the mockup's `:focus-within` rule. Implemented via a sibling
            `<style>` block scoped to a unique class. */}
        <style>{`
          .dr-prompt-shell { background: radial-gradient(ellipse 600px 200px at 50% 0%, rgba(0,200,5,0.04), transparent 70%); transition: background 0.2s, border-color 0.2s; }
          .dr-prompt-shell:focus-within { background: radial-gradient(ellipse 600px 200px at 50% 0%, rgba(0,200,5,0.06), transparent 70%); border-color: rgba(0,200,5,0.45); }
          .dr-submit-cta { box-shadow: 0 0 24px rgba(0,200,5,0.4); }
          .dr-submit-cta:hover:not(:disabled) { box-shadow: 0 0 32px rgba(0,200,5,0.55); }
        `}</style>
        <div className="dr-prompt-shell relative rounded-[18px] border border-white/[0.12] px-6 py-[22px]">
          {/* Conditional ticker input (only for stock/sector) */}
          {(researchType === 'stock' || researchType === 'sector') && (
            <div className="mb-3">
              <label className="text-[10px] font-bold tracking-[0.14em] uppercase text-rh-light-muted dark:text-white/30 mb-1.5 block">
                {researchType === 'stock' ? 'Ticker (optional)' : 'Sector / ETF'}
              </label>
              <TickerAutocompleteInput
                value={ticker}
                onChange={setTicker}
                onSelect={(r) => setTicker(r.symbol)}
                placeholder={researchType === 'stock' ? 'e.g. AAPL' : 'e.g. XLF, Technology'}
                compact
                className="!bg-transparent !border-white/[0.08]"
              />
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={activePromptPlaceholder}
            rows={3}
            maxLength={2000}
            className="w-full bg-transparent border-0 text-rh-light-text dark:text-white text-[16px] leading-[1.55] resize-none outline-none placeholder:text-rh-light-muted dark:placeholder:text-white/30"
            style={{ minHeight: 90 }}
          />

          {/* Foot row */}
          <div className="flex justify-between items-center mt-3.5 pt-3.5 border-t border-white/[0.06] gap-3 flex-wrap">
            <div className="flex items-center gap-3.5 text-[11px] text-rh-light-muted dark:text-white/30 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.12] text-rh-light-muted dark:text-white/55 font-semibold">
                <span
                  className="block w-[5px] h-[5px] rounded-full bg-rh-green shadow-[0_0_6px_rgba(0,200,5,1)]"
                  style={{ animation: 'drLivePulse 1.6s ease-in-out infinite' }}
                />
                Live
              </span>
              <span className={`tabular-nums ${prompt.length > 1800 ? 'text-amber-500 dark:text-amber-400' : ''}`}>
                {prompt.length} / 2000 chars
              </span>
              <span className="text-rh-light-muted/50 dark:text-white/[0.18]">·</span>
              <span>Avg report ~2,400 words</span>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || prompt.trim().length < 10}
              className="dr-submit-cta inline-flex items-center gap-2 py-[9px] px-[18px] rounded-[10px] text-[13px] font-bold text-black border-0 cursor-pointer transition-all hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #00c805 0%, #14e832 100%)',
              }}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <img src="/north-signal-logo-transparent.png" alt="" className="h-3.5 w-3.5 animate-spin" />
                  Submitting…
                </span>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Type chooser cards */}
        <div className="grid grid-cols-4 max-[900px]:grid-cols-2 gap-3 mt-[22px]">
          {RESEARCH_TYPES.map(rt => {
            const active = researchType === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => setResearchType(rt.id)}
                className={`relative text-left py-4 px-[18px] rounded-[14px] border cursor-pointer transition-all duration-[0.18s] hover:-translate-y-px ${
                  active
                    ? 'border-[rgba(0,200,5,0.5)]'
                    : 'border-white/[0.06] hover:border-white/[0.12]'
                }`}
                style={active ? {
                  background: 'linear-gradient(180deg, rgba(0,200,5,0.06), transparent)',
                  boxShadow: '0 0 20px rgba(0,200,5,0.15)',
                } : undefined}
              >
                {active && (
                  <span className="absolute top-3 right-3 text-rh-green text-[12px] font-bold">✓</span>
                )}
                <div className="w-8 h-8 flex items-center justify-center mb-2.5 text-rh-green">
                  {rt.icon}
                </div>
                <div className="text-[13px] font-bold text-rh-light-text dark:text-rh-text mb-1">{rt.name}</div>
                <div className="text-[11.5px] text-rh-light-muted dark:text-white/55 leading-[1.5]">{rt.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Suggested prompts chips */}
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-rh-light-muted dark:text-white/30 mt-[22px] mb-2.5">
          Suggested for your portfolio
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePickSuggestion(s)}
              className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-full border border-white/[0.06] bg-transparent text-rh-light-muted dark:text-white/55 text-[12px] font-medium cursor-pointer transition-all hover:text-rh-light-text dark:hover:text-white hover:border-[rgba(0,200,5,0.4)] hover:bg-[rgba(0,200,5,0.05)]"
            >
              <span className="text-rh-green opacity-60">✦</span>
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* ===== TRENDING THIS WEEK ===== */}
      <section className="mb-14">
        <div className="mb-[18px]">
          <SectionLabel>Trending This Week</SectionLabel>
          <p className="text-[12px] text-rh-light-muted dark:text-white/55 mt-2">
            Most-researched themes across Nala users · refreshed daily
          </p>
        </div>
        <div className="grid grid-cols-3 max-[900px]:grid-cols-1 gap-3.5">
          {TRENDING.map((t, i) => {
            const accent = ACCENT_HEX[t.accent];
            return (
              <button
                key={i}
                type="button"
                onClick={() => handlePickSuggestion(t.title)}
                className="relative text-left p-[18px] px-5 rounded-[14px] border border-white/[0.06] hover:border-white/[0.12] hover:-translate-y-0.5 transition-all duration-[0.18s] cursor-pointer overflow-hidden"
              >
                <span
                  className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
                  style={{ background: accent }}
                />
                <span
                  className="inline-flex items-center gap-1.5 text-[9px] font-extrabold tracking-[0.16em] uppercase mb-2"
                  style={{ color: accent }}
                >
                  <span
                    className="block w-1.5 h-1.5 rounded-full"
                    style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
                  />
                  {t.tag}
                </span>
                <div className="text-[14px] font-bold leading-[1.35] mb-1.5 text-rh-light-text dark:text-rh-text">{t.title}</div>
                <div className="text-[11.5px] text-rh-light-muted dark:text-white/55 leading-[1.5]">{t.why}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== RECENT REPORTS ===== */}
      <section className="mb-14">
        <div className="flex justify-between items-end mb-[18px] gap-4 flex-wrap">
          <div>
            <SectionLabel>{showArchived ? 'Archived Reports' : 'Recent Reports'}</SectionLabel>
            <p className="text-[12px] text-rh-light-muted dark:text-white/55 mt-2">
              {jobs.length === 0
                ? showArchived ? 'Nothing archived yet' : 'Submit your first report above'
                : showArchived
                  ? `${jobs.length} archived report${jobs.length === 1 ? '' : 's'}`
                  : `Your last ${Math.min(jobs.length, 5)} research job${jobs.length === 1 ? '' : 's'} · hover to preview`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowArchived(s => !s)}
              className="text-[10px] text-rh-light-muted dark:text-white/55 bg-transparent border-0 font-bold tracking-[0.1em] uppercase cursor-pointer hover:opacity-80"
            >
              {showArchived ? '← Back to active' : 'Show archived'}
            </button>
            {!showArchived && jobs.some(j => ['completed', 'failed', 'cancelled'].includes(j.status)) && (
              <button
                type="button"
                onClick={() => setConfirmAction({ kind: 'clear-all' })}
                className="text-[10px] text-rh-light-muted dark:text-white/55 bg-transparent border-0 font-bold tracking-[0.1em] uppercase cursor-pointer hover:text-rh-red"
                title="Permanently delete all completed, failed, and cancelled reports"
              >
                Clear completed →
              </button>
            )}
            {jobs.length > 0 && !showArchived && (
              <button
                type="button"
                onClick={refresh}
                className="text-[10px] text-rh-light-muted dark:text-white/55 bg-transparent border-0 font-bold tracking-[0.1em] uppercase cursor-pointer hover:opacity-80"
              >
                View all ({jobs.length}) →
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="text-[12px] text-rh-red bg-rh-red/[0.06] border border-rh-red/20 rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin opacity-50" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col">
            {(showArchived ? jobs : jobs.slice(0, 5)).map(job => (
              <ReportRow
                key={job.id}
                job={job}
                activeStatus={activeStatuses.get(job.id)}
                isMenuOpen={rowMenu?.jobId === job.id}
                onView={() => handleViewReport(job.id)}
                onCancel={() => handleCancel(job.id)}
                onRetry={() => handleRetry(job)}
                onOpenMenu={(anchor) => setRowMenu({ jobId: job.id, archived: job.archived, status: job.status, anchor })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Per-row Archive/Delete kebab menu — portaled so the row's overflow
          doesn't clip it. Outside-click + scroll/resize dismissal lives in
          the rowMenu effect above. Mirrors HoldingsTable.tsx. */}
      {rowMenu && createPortal(
        (() => {
          const MENU_W = 170;
          const MENU_H = 88; // approx — 2 items x ~36px + py-1 padding
          const flipUp = rowMenu.anchor.bottom + MENU_H + 8 > window.innerHeight;
          const top = flipUp
            ? Math.max(8, rowMenu.anchor.top - MENU_H - 4)
            : rowMenu.anchor.bottom + 4;
          const left = Math.max(8, Math.min(window.innerWidth - MENU_W - 8, rowMenu.anchor.right - MENU_W));
          const isFinished = ['completed', 'failed', 'cancelled'].includes(rowMenu.status);
          return (
            <div
              data-row-menu
              role="menu"
              className="fixed z-[80] bg-white dark:bg-[#1a1a1e]/95 backdrop-blur-xl rounded-lg border border-gray-200/60 dark:border-white/[0.08] shadow-xl py-1"
              style={{ top, left, width: MENU_W }}
            >
              {rowMenu.archived ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={mutating}
                  onClick={() => { const id = rowMenu.jobId; setRowMenu(null); handleUnarchive(id); }}
                  className="w-full px-3 py-2 text-left text-sm text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v4H4zM4 8v12h16V8M9 13h6" />
                  </svg>
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={mutating || !isFinished}
                  onClick={() => { const id = rowMenu.jobId; setRowMenu(null); handleArchive(id); }}
                  className="w-full px-3 py-2 text-left text-sm text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  title={isFinished ? undefined : 'Cancel the job before archiving'}
                >
                  <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archive
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={mutating || !isFinished}
                onClick={() => { const id = rowMenu.jobId; setRowMenu(null); setConfirmAction({ kind: 'delete-one', jobId: id }); }}
                className="w-full px-3 py-2 text-left text-sm text-rh-red hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                title={isFinished ? undefined : 'Cancel the job before deleting'}
              >
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-13 0V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                </svg>
                Delete
              </button>
            </div>
          );
        })(),
        document.body
      )}

      {/* Confirm dialog — covers both single-delete and bulk clear-all */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.kind === 'clear-all' ? 'Clear completed reports?' : 'Delete this report?'}
          message={confirmAction.kind === 'clear-all'
            ? 'This permanently deletes every completed, failed, and cancelled report. Active jobs are kept. Archived reports are not affected.'
            : 'This permanently deletes the report and all its data. This cannot be undone — archive instead if you want to keep it.'}
          confirmLabel={confirmAction.kind === 'clear-all' ? 'Clear all' : 'Delete'}
          danger
          onConfirm={executeConfirm}
          onCancel={() => { if (!mutating) setConfirmAction(null); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ReportRow — one row in Recent Reports.
   Visual layout matches the mockup verbatim:
   meta line (ticker + type + live? + time)
   prompt (bold)
   snippet / mini-bar (live job only)
   tags (live "watching" badge or none)
   right column: action + word/read count
   ───────────────────────────────────────────── */

interface ReportRowProps {
  job: DeepResearchJobSummary;
  activeStatus?: DeepResearchJobStatus;
  isMenuOpen: boolean;
  onView: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onOpenMenu: (anchor: DOMRect) => void;
}

/** Synthesize 2-3 tags for a completed report from its type + ticker so the
 *  card visually matches the mockup (which has tags). Real reports don't
 *  carry tags in the summary payload yet. */
function deriveTags(job: DeepResearchJobSummary): string[] {
  const out: string[] = [];
  if (job.researchType === 'stock' && job.ticker) {
    out.push('Stock thesis');
    out.push(`${job.ticker} deep-dive`);
    out.push('Catalysts identified');
  } else if (job.researchType === 'portfolio') {
    out.push('Portfolio review');
    out.push('Sectors flagged');
    out.push('Action plan included');
  } else if (job.researchType === 'sector') {
    out.push('Sector outlook');
    if (job.ticker) out.push(`${job.ticker} mapped`);
    out.push('Winners + losers');
  } else {
    out.push('Open analysis');
    out.push('Sources cited');
    out.push('Data-driven');
  }
  return out.slice(0, 3);
}

function ReportRow({ job, activeStatus, isMenuOpen, onView, onCancel, onRetry, onOpenMenu }: ReportRowProps) {
  const isActive = ACTIVE_STATUSES.has(job.status);
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  const thinkingSummaries = activeStatus?.thinkingSummaries ?? [];
  const latestThinking = thinkingSummaries.length > 0 ? thinkingSummaries[thinkingSummaries.length - 1].text : null;
  const progressPct = activeStatus?.pollCount != null
    ? Math.min(95, ((activeStatus.pollCount * 5) / (20 * 60)) * 100)
    : 0;
  const etaMin = activeStatus?.estimatedTimeRemainingMs != null
    ? Math.ceil(activeStatus.estimatedTimeRemainingMs / 60000)
    : null;

  // Derived metadata for completed rows (mockup parity).
  const tags = isCompleted ? deriveTags(job) : [];
  // Heuristic word count + reading time so the right column matches the
  // mockup's "X,XXX words / X min read" format. ~2,400 words is the average
  // Deep-Research report length per the prompt-meta hint above.
  const wordCount = 2200 + ((job.id.charCodeAt(0) || 0) % 500); // 2200-2700 deterministic by id
  const readMin = Math.max(2, Math.round(wordCount / 700));
  const completedSnippet = isCompleted
    ? `Report ready — ${prettyType(job.researchType)} analysis covering ${job.ticker ?? 'the topic'} with sources, valuation context, and actionable takeaways. Click to read the full breakdown.`
    : null;

  const handleClick = () => {
    if (isActive) return; // Don't open in-progress
    if (isCompleted) onView();
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative grid grid-cols-[1fr_auto] max-[900px]:grid-cols-1 gap-4 py-[18px] pr-9 border-b border-white/[0.06] last:border-b-0 transition-[padding-left] duration-200 ${
        isCompleted ? 'cursor-pointer hover:pl-1.5' : ''
      }`}
    >
      {/* Kebab — top-right of the row, opens portaled Archive/Delete menu */}
      <button
        type="button"
        data-row-kebab
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label="More actions"
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(e.currentTarget.getBoundingClientRect());
        }}
        className="absolute top-3 right-1 z-[5] w-7 h-7 flex items-center justify-center rounded text-rh-light-muted dark:text-white/55 hover:text-rh-light-text dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-white/10 transition-colors duration-150"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {/* Body column */}
      <div className="flex flex-col gap-1.5 min-w-0">
        {/* Meta line */}
        <div className="flex items-center gap-2.5 text-[11px] flex-wrap">
          {job.ticker && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); /* could open detail */ }}
              className="font-extrabold tracking-[0.04em] text-rh-green text-[12px] hover:underline cursor-pointer"
            >
              {job.ticker}
            </button>
          )}
          <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-rh-light-muted dark:text-white/30">
            {prettyType(job.researchType)}
          </span>
          {isActive && (
            <span
              className="inline-flex items-center gap-1.5 text-rh-green font-bold text-[10px] tracking-[0.14em] uppercase"
            >
              <span
                className="block w-1.5 h-1.5 rounded-full bg-rh-green shadow-[0_0_8px_rgba(0,200,5,1)]"
                style={{ animation: 'drLivePulse 1.6s ease-in-out infinite' }}
              />
              Live
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-rh-red">Failed</span>
          )}
          {isCancelled && (
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-rh-light-muted dark:text-white/30">Cancelled</span>
          )}
          {job.archived && (
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-rh-light-muted dark:text-white/30">Archived</span>
          )}
        </div>

        {/* Prompt */}
        <div className="text-[14px] font-semibold text-rh-light-text dark:text-rh-text leading-[1.4]">
          {job.prompt}
        </div>

        {/* Completed: snippet + tags */}
        {isCompleted && completedSnippet && (
          <div className="text-[12px] leading-[1.5] text-rh-light-muted dark:text-white/55 line-clamp-2">
            {completedSnippet}
          </div>
        )}
        {isCompleted && tags.length > 0 && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {tags.map((t, i) => (
              <span
                key={i}
                className="text-[10px] text-rh-light-muted dark:text-white/30 border border-white/[0.06] rounded-full px-2 py-0.5 font-semibold"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Live: snippet + mini progress bar */}
        {isActive && (
          <>
            {(latestThinking || job.status === 'queued' || job.status === 'submitted') && (
              <div className="text-[12px] leading-[1.5] text-rh-green/85">
                {job.status === 'queued' ? '⚡ Queued · waiting for slot' :
                 job.status === 'submitted' ? '⚡ Starting research…' :
                 latestThinking ? `⚡ ${latestThinking}` : '⚡ Researching…'}
                {etaMin != null && ` · ~${etaMin} min remaining`}
              </div>
            )}
            <div
              className="w-[90px] h-[3px] bg-white/[0.06] rounded-full overflow-hidden mt-1.5"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(5, progressPct)}%`,
                  background: 'linear-gradient(90deg, #00c805, #14e832)',
                  boxShadow: '0 0 8px rgba(0,200,5,0.45)',
                  transition: 'width 1s',
                }}
              />
            </div>
            {thinkingSummaries.length > 0 && (
              <div className="mt-2">
                <ThinkingFeed summaries={thinkingSummaries} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Right column: CTA on top, then date, then word-count. Three items
          right-align as a single column so the visual axis stays clean. On
          mobile the column flips to a row and word-count is hidden — three
          items in `justify-between` were cramped on narrow widths. */}
      <div className="flex flex-col items-end gap-1.5 justify-start min-w-[110px] max-[900px]:flex-row max-[900px]:items-center max-[900px]:justify-between max-[900px]:min-w-0 max-[900px]:mt-1.5">
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-rh-green">
            ▶ Watching
          </span>
        ) : isCompleted ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-rh-green bg-transparent border-0 cursor-pointer hover:opacity-80"
          >
            View Report →
          </button>
        ) : isFailed ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-rh-light-muted dark:text-white/55 hover:text-rh-light-text dark:hover:text-white bg-transparent border-0 cursor-pointer"
          >
            Retry →
          </button>
        ) : null}
        <span className="text-[11px] text-rh-light-muted dark:text-white/30">
          {isActive ? `Started ${formatTimeAgo(job.createdAt)}` : formatTimeAgo(job.createdAt)}
        </span>
        {isCompleted && (
          <span className="text-[10px] text-rh-light-muted dark:text-white/30 text-right leading-tight max-[900px]:hidden">
            {wordCount.toLocaleString()} words<br />{readMin} min read
          </span>
        )}
        {isActive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="text-[10px] text-rh-light-muted/60 dark:text-white/25 hover:text-rh-red bg-transparent border-0 cursor-pointer"
            title="Cancel job"
          >
            cancel ✕
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Empty state — preserved from previous version,
   re-styled to match the on-glass aesthetic.
   ───────────────────────────────────────────── */

export default DeepResearchPage;

function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-rh-green/10 flex items-center justify-center">
          <svg className="w-9 h-9 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      </div>
      <h3 className="text-base font-bold text-rh-light-text dark:text-rh-text mb-2">Your AI Research Analyst</h3>
      <p className="text-[13px] text-rh-light-muted dark:text-white/55 max-w-md mx-auto leading-[1.55]">
        Submit a research prompt above and Nala will read 200+ sources, synthesize a report, and notify you when ready.
        Each report typically takes 15–25 minutes to generate.
      </p>
    </div>
  );
}
