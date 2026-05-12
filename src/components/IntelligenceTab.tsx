import { useState, useEffect, useMemo, useRef } from 'react';
import {
  PortfolioIntelligenceResponse,
  HealthScore as HealthScoreType,
  RiskForecast,
  LeakDetectorResult,
  Portfolio,
  IntelligenceWindow,
} from '../types';
import {
  getPortfolioIntelligence,
  getHealthScore,
  getRiskForecast,
  getLeakDetector,
  getPortfolio,
  getPortfolioNews,
  getFastQuote,
  PortfolioNewsItem,
} from '../api';
import { useToast } from '../context/ToastContext';
import { PortfolioVsSpyMini } from './PortfolioVsSpyMini';

/* ─────────────────────────────────────────────
   Tokens & helpers
   ───────────────────────────────────────────── */

const SECTOR_COLORS = [
  '#0a84ff', '#00c805', '#ff9f0a', '#bf5af2',
  '#ff3b30', '#5ac8fa', '#ff7066', '#a78bfa',
  '#34d399', '#fbbf24',
];

function colorFor(idx: number): string {
  return SECTOR_COLORS[idx % SECTOR_COLORS.length];
}

function fmtMoney(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (opts.sign) return `${n >= 0 ? '+' : '−'}$${formatted}`;
  return `${n < 0 ? '−' : ''}$${formatted}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

/* ─────────────────────────────────────────────
   Section label (green vertical bar + uppercase)
   ───────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-rh-light-text dark:text-rh-text">
      <span className="block w-[3px] h-3 rounded-full bg-rh-green shadow-[0_0_10px_rgba(0,200,5,0.45)]" />
      {children}
    </span>
  );
}

function SectionHeader({
  label, title, sub, right,
}: {
  label: string; title?: string; sub?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-end mb-5">
      <div>
        <SectionLabel>{label}</SectionLabel>
        {title && <h3 className="text-[16px] font-bold tracking-tight mt-2 text-rh-light-text dark:text-rh-text">{title}</h3>}
        {sub && <p className="text-[12px] text-rh-light-muted dark:text-rh-muted mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Clickable ticker (used in narrative paragraph)
   ───────────────────────────────────────────── */

const TICKER_BLACKLIST = new Set(['AI','EV','PE','PB','PS','SK','IV','YTD','QTD','MTD','ATH','ATL','EPS','ROI','ROE','GAAP','ETF','SPY','IPO','CEO','CFO','GDP','CPI','PMI','FED','SEC','NYSE']);

function RichNarrative({ text, knownTickers, onTickerClick }: {
  text: string;
  knownTickers: Set<string>;
  onTickerClick?: (ticker: string) => void;
}) {
  if (!text) return null;
  const parts = text.split(/(\b[A-Z]{1,5}\b)/);
  return (
    <p className="text-[14px] leading-[1.6] text-rh-light-text dark:text-rh-text max-w-[640px]">
      {parts.map((part, i) => {
        const looksLikeTicker = /^[A-Z]{1,5}$/.test(part);
        const isKnown = knownTickers.has(part);
        const isBlacklist = TICKER_BLACKLIST.has(part);
        if (looksLikeTicker && isKnown && !isBlacklist) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onTickerClick?.(part)}
              className="font-bold tracking-wide hover:text-rh-green transition-colors cursor-pointer"
            >{part}</button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

/* ─────────────────────────────────────────────
   Period selector
   ───────────────────────────────────────────── */

const PERIODS: { id: IntelligenceWindow; label: string }[] = [
  { id: '1d', label: 'Today' },
  { id: '5d', label: '1W' }, // backend label is '5d', display 1W to match the main Portfolio chart nomenclature
  { id: '1m', label: '1M' },
];

function PeriodSelector({ value, onChange }: {
  value: IntelligenceWindow;
  onChange: (v: IntelligenceWindow) => void;
}) {
  return (
    <div className="flex gap-5 lg:gap-7 overflow-x-auto no-scrollbar -mx-1 px-1">
      {PERIODS.map(p => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`relative py-1 text-[13px] font-semibold transition-colors flex-shrink-0 ${
              active
                ? 'text-rh-light-text dark:text-rh-text'
                : 'text-rh-light-muted/60 dark:text-rh-muted/60 hover:text-rh-light-text dark:hover:text-white/70'
            }`}
          >
            {p.label}
            {active && (
              <span className="absolute -bottom-1.5 left-[-2px] right-[-2px] h-[2px] rounded-full bg-rh-green shadow-[0_0_10px_rgba(0,200,5,0.45)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Live dot
   ───────────────────────────────────────────── */

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase text-rh-green">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rh-green shadow-[0_0_8px_rgba(0,200,5,1)]" />
      </span>
      Live
    </span>
  );
}

/* ─────────────────────────────────────────────
   Mover bar row (waterfall)
   ───────────────────────────────────────────── */

function MoverRow({ ticker, dollar, percent, max, kind, onTickerClick }: {
  ticker: string;
  dollar: number;
  percent: number;
  max: number;
  kind: 'gain' | 'loss';
  onTickerClick?: (ticker: string) => void;
}) {
  const widthPct = max > 0 ? Math.min(100, (Math.abs(dollar) / max) * 100) : 0;
  const colorText = kind === 'gain' ? 'text-rh-green' : 'text-rh-red';
  const barClass = kind === 'gain'
    ? 'bg-gradient-to-r from-rh-green to-emerald-400 shadow-[0_0_10px_rgba(0,200,5,0.45)]'
    : 'bg-gradient-to-r from-rh-red to-red-300 shadow-[0_0_10px_rgba(255,59,48,0.45)]';
  return (
    <button
      type="button"
      onClick={() => onTickerClick?.(ticker)}
      className="grid grid-cols-[44px_1fr_64px_50px] sm:grid-cols-[56px_1fr_80px_56px] gap-x-2.5 sm:gap-x-3.5 items-center py-2.5 sm:py-3 border-b border-white/[0.06] last:border-b-0 w-full text-left hover:opacity-90 transition-opacity"
    >
      <span className="font-bold text-[12px] sm:text-[13px] tracking-wide text-rh-light-text dark:text-rh-text">{ticker}</span>
      <span className="relative h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <span className={`absolute inset-y-0 left-0 rounded-full ${barClass}`} style={{ width: `${widthPct}%` }} />
      </span>
      <span className={`text-right text-[11px] sm:text-[13px] font-bold tabular-nums ${colorText}`}>{fmtMoney(dollar, { sign: true })}</span>
      <span className={`text-right text-[10px] sm:text-[12px] font-semibold tabular-nums ${colorText}`}>{fmtPct(percent)}</span>
    </button>
  );
}

/* ─────────────────────────────────────────────
   Risk Radar (custom SVG)
   ───────────────────────────────────────────── */

function RiskRadar({ values, labels }: {
  values: number[]; // 0..1, length 6
  labels: string[];
}) {
  // 6 vertices on a hexagon, starting from top, clockwise
  const angles = [-90, -30, 30, 90, 150, 210].map(d => (d * Math.PI) / 180);
  const r = 110;
  const cx = 150, cy = 140;
  const point = (val: number, i: number) => {
    const x = cx + r * val * Math.cos(angles[i]);
    const y = cy + r * val * Math.sin(angles[i]);
    return [x, y];
  };
  const polygonPoints = (scale: number) =>
    angles.map(a => `${cx + r * scale * Math.cos(a)},${cy + r * scale * Math.sin(a)}`).join(' ');
  const dataPoints = values.map((v, i) => point(v, i));
  const dataPath = dataPoints.map(([x, y]) => `${x},${y}`).join(' ');

  const labelPos = (i: number, offset = 22) => {
    const x = cx + (r + offset) * Math.cos(angles[i]);
    const y = cy + (r + offset) * Math.sin(angles[i]);
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (Math.cos(angles[i]) > 0.4) anchor = 'start';
    else if (Math.cos(angles[i]) < -0.4) anchor = 'end';
    return { x, y, anchor };
  };

  return (
    <svg viewBox="0 0 300 280" className="w-full max-w-[280px] h-auto mx-auto">
      {/* grid hexagons */}
      {[1, 0.75, 0.5, 0.25].map((s, i) => (
        <polygon
          key={i}
          points={polygonPoints(s)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
          opacity={0.3 + (1 - s) * 0.7}
        />
      ))}
      {/* spokes */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={cx + r * Math.cos(a)}
          y2={cy + r * Math.sin(a)}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}
      {/* data area */}
      <polygon
        points={dataPath}
        fill="rgba(0,200,5,0.18)"
        stroke="#00c805"
        strokeWidth={1.5}
        style={{ filter: 'drop-shadow(0 0 8px rgba(0,200,5,0.45))' }}
      />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill="#00c805" stroke="#000" strokeWidth={2} />
      ))}
      {/* labels */}
      {labels.map((l, i) => {
        const p = labelPos(i, 16);
        return (
          <text
            key={i}
            x={p.x} y={p.y}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            className="fill-rh-light-muted dark:fill-rh-muted"
            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {l}
          </text>
        );
      })}
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Donut chart
   ───────────────────────────────────────────── */

function SectorDonut({ slices }: {
  slices: { sector: string; pct: number; color: string }[];
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] mx-auto" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="14" />
      {slices.map((s, i) => {
        const dash = (s.pct / 100) * circumference;
        const seg = (
          <circle
            key={i}
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return seg;
      })}
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Insight signal row
   ───────────────────────────────────────────── */

type InsightKind = 'warn' | 'good' | 'info' | 'tax';

interface InsightSignal {
  kind: InsightKind;
  title: string;
  sub: string;
  cta?: string;
  url?: string; // external link (e.g. news article)
  onClick?: () => void;
}

const INSIGHT_GLYPH: Record<InsightKind, { ch: string; cls: string }> = {
  warn: { ch: '!', cls: 'text-rh-amber dark:text-amber-400' },
  good: { ch: '↑', cls: 'text-rh-green' },
  info: { ch: '⊙', cls: 'text-blue-400' },
  tax: { ch: '$', cls: 'text-purple-400' },
};

function InsightRow({ signal }: { signal: InsightSignal }) {
  const { ch, cls } = INSIGHT_GLYPH[signal.kind];
  const inner = (
    <>
      <span className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[14px] sm:text-[16px] font-bold ${cls}`}>{ch}</span>
      <span className="flex flex-col gap-1 min-w-0">
        <span className="text-[12px] sm:text-[13px] font-semibold text-rh-light-text dark:text-rh-text">{signal.title}</span>
        <span className="text-[11px] text-rh-light-muted dark:text-rh-muted leading-snug">{signal.sub}</span>
      </span>
      {signal.cta && (
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-rh-green hidden sm:inline-flex items-center gap-1">{signal.cta}<span aria-hidden>→</span></span>
      )}
    </>
  );
  const cls2 = "grid grid-cols-[20px_1fr] sm:grid-cols-[24px_1fr_auto] gap-3 sm:gap-4 items-center py-3.5 sm:py-4 border-b border-white/[0.06] last:border-b-0 cursor-pointer transition-all hover:pl-1";
  if (signal.url) {
    return <a className={cls2} href={signal.url} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  return <button type="button" className={`${cls2} text-left w-full`} onClick={signal.onClick}>{inner}</button>;
}

/* ─────────────────────────────────────────────
   Smart action card
   ───────────────────────────────────────────── */

interface SmartAction {
  tag: string;
  accent: 'green' | 'blue' | 'amber';
  title: string;
  detail: string;
  cta: string;
  onClick?: () => void;
}

const ACCENT_COLORS = {
  green: '#00c805',
  blue: '#4cb3ff',
  amber: '#ff9f0a',
};

function SmartActionCard({ action }: { action: SmartAction }) {
  const accent = ACCENT_COLORS[action.accent];
  return (
    <button
      type="button"
      onClick={action.onClick}
      className="text-left flex flex-col gap-2.5 py-4 sm:py-2 sm:px-7 first:sm:pl-0 last:sm:pr-0 sm:border-l border-white/[0.06] first:sm:border-l-0 sm:hover:translate-x-[3px] transition-transform border-b sm:border-b-0 border-white/[0.06] last:border-b-0"
    >
      <span className="inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: accent }}>
        <span className="block w-[7px] h-[7px] rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
        {action.tag}
      </span>
      <span className="text-[14px] font-bold tracking-tight text-rh-light-text dark:text-rh-text">{action.title}</span>
      <span className="text-[11.5px] sm:text-[12px] leading-[1.55] text-rh-light-muted dark:text-rh-muted">{action.detail}</span>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-rh-light-text dark:text-rh-text mt-1" style={{ color: accent }}>
        {action.cta} <span aria-hidden>→</span>
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
   Health ring
   ───────────────────────────────────────────── */

function HealthRing({ score }: { score: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <div className="relative w-10 h-10">
      <svg width="40" height="40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="#00c805" strokeWidth="2.5"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 5px rgba(0,200,5,0.45))' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-rh-green">{score}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stat cell
   ───────────────────────────────────────────── */

function StatCell({
  label, value, valueColor, sub, glyph, onClick,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub: React.ReactNode;
  glyph?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left p-4 sm:p-5 lg:p-6 lg:first:pl-0 lg:last:pr-0 border-l border-t border-white/[0.06] sm:[&:nth-child(2n+1)]:border-l-0 lg:[&:nth-child(2n+1)]:border-l lg:first:border-l-0 sm:[&:nth-child(-n+2)]:border-t-0 lg:border-t-0 enabled:hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center justify-between mb-2.5 sm:mb-3">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">{label}</span>
        {glyph}
      </div>
      <div className="text-[22px] sm:text-[24px] font-bold tracking-tight tabular-nums leading-tight" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] text-rh-light-muted dark:text-rh-muted flex items-center gap-1.5">
        {sub}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */

interface Props {
  initialIntelligence: PortfolioIntelligenceResponse;
  initialHealthScore: HealthScoreType | null;
  portfolioId?: string;
  onTickerClick?: (ticker: string) => void;
  onJumpToTab?: (tab: string) => void;
  /** Fires when the tab's period selector changes. InsightsPage uses this
   * to keep the bottom "Download Intelligence Report" button in sync with
   * whatever timeline the user is currently viewing. */
  onPeriodChange?: (period: IntelligenceWindow) => void;
}

export function IntelligenceTab({
  initialIntelligence,
  initialHealthScore,
  portfolioId,
  onTickerClick,
  onJumpToTab,
  onPeriodChange,
}: Props) {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<IntelligenceWindow>(initialIntelligence.window);
  const [intelligence, setIntelligence] = useState<PortfolioIntelligenceResponse>(initialIntelligence);
  // Period-matched returns reported by PortfolioVsSpyMini once its data loads.
  // Used to derive the Alpha-vs-SPY card so it stays consistent with the chart.
  const [chartMetrics, setChartMetrics] = useState<{ youPct: number | null; spyPct: number | null }>({ youPct: null, spyPct: null });

  // Forward period changes to the parent (InsightsPage) so the bottom
  // "Download Intelligence Report" button can pick up whatever timeline the
  // user is currently viewing — without lifting period state out of this tab.
  useEffect(() => {
    onPeriodChange?.(period);
  }, [period, onPeriodChange]);
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(initialHealthScore);
  const [risk, setRisk] = useState<RiskForecast | null>(null);
  const [leak, setLeak] = useState<LeakDetectorResult | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [news, setNews] = useState<PortfolioNewsItem[]>([]);
  // SPY's actual day-change % — used to compute today's alpha vs the API's
  // beta.alphaPercent which is computed over the beta-fit lookback (~1Y) and
  // would show wildly inflated values when labeled "today vs SPY".
  const [spyDayPct, setSpyDayPct] = useState<number | null>(null);
  const [valueMode, setValueMode] = useState<'$' | '%'>('$');
  const [periodLoading, setPeriodLoading] = useState(false);
  const periodReqId = useRef(0);

  /* ── one-shot fetches for non-period-dependent data ── */
  useEffect(() => {
    let cancelled = false;
    const safe = <T,>(p: Promise<T>) => p.catch((e) => { console.warn('[IntelligenceTab]', e); return null as unknown as T; });
    Promise.all([
      safe(getRiskForecast(portfolioId)),
      safe(getLeakDetector(portfolioId)),
      safe(getPortfolio(undefined, portfolioId)),
      safe(getPortfolioNews(8)),
      safe(getFastQuote('SPY')),
    ]).then(([r, l, p, n, q]) => {
      if (cancelled) return;
      if (r) setRisk(r);
      if (l) setLeak(l);
      if (p) setPortfolio(p);
      if (n?.items) setNews(n.items);
      if (q && Number.isFinite(q.changePercent)) setSpyDayPct(q.changePercent);
    });
    return () => { cancelled = true; };
  }, [portfolioId]);

  /* ── refetch intelligence when period changes ── */
  useEffect(() => {
    if (period === intelligence.window) return;
    const reqId = ++periodReqId.current;
    setPeriodLoading(true);
    getPortfolioIntelligence(period, portfolioId)
      .then(d => {
        if (reqId !== periodReqId.current) return;
        setIntelligence(d);
      })
      .catch(e => {
        if (reqId !== periodReqId.current) return;
        console.error(e);
        showToast('Failed to load period data', 'error');
      })
      .finally(() => {
        // Only the latest in-flight request clears the spinner —
        // out-of-order responses won't leave it stuck on.
        if (reqId === periodReqId.current) setPeriodLoading(false);
      });
  }, [period, intelligence.window, portfolioId, showToast]);

  /* ── re-fetch health score on portfolio change ── */
  useEffect(() => {
    let cancelled = false;
    if (!healthScore) {
      getHealthScore(portfolioId).then(d => { if (!cancelled) setHealthScore(d); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [portfolioId, healthScore]);

  /* ── derived data ── */

  const knownTickers = useMemo(() => {
    const set = new Set<string>();
    intelligence.contributors.forEach(c => set.add(c.ticker));
    intelligence.detractors.forEach(c => set.add(c.ticker));
    portfolio?.holdings.forEach(h => set.add(h.ticker));
    return set;
  }, [intelligence, portfolio]);

  const netEquity = portfolio?.netEquity ?? portfolio?.totalValue ?? 0;
  // Hero number tracks the selected period. For 1d we trust the portfolio
  // service's dayChange (most recent live tick). For 5d/1m we use the
  // intelligence service's netPnL for that window. The percent is computed
  // off net equity rather than a baseline that may not match.
  const isToday = period === '1d';
  const heroAmount = isToday
    ? (portfolio?.dayChange ?? intelligence.netPnL ?? 0)
    : (intelligence.netPnL ?? 0);
  const heroPct = isToday
    ? (portfolio?.dayChangePercent ?? 0)
    : (netEquity > 0 ? (intelligence.netPnL / netEquity) * 100 : 0);
  const isLoss = heroAmount < 0;
  const heroColor = isLoss ? 'text-rh-red' : 'text-rh-green';
  const heroGlow = isLoss ? '0 0 40px rgba(255,59,48,0.25)' : '0 0 40px rgba(0,200,5,0.25)';

  const contribMax = useMemo(
    () => Math.max(0, ...intelligence.contributors.map(c => Math.abs(c.contributionDollar))),
    [intelligence.contributors]
  );
  const detractMax = useMemo(
    () => Math.max(0, ...intelligence.detractors.map(c => Math.abs(c.contributionDollar))),
    [intelligence.detractors]
  );

  const sectorSlices = useMemo(() => {
    return intelligence.sectorExposure.slice(0, 10).map((s, i) => ({
      sector: s.sector,
      pct: s.exposurePercent,
      color: colorFor(i),
    }));
  }, [intelligence.sectorExposure]);

  // Risk radar values 0..1 (higher = more risk)
  const radarValues = useMemo(() => {
    const breakdown = healthScore?.breakdown;
    // Health-score sub-metrics: higher score = lower risk. Invert for radar.
    const inv = (n: number, max: number) => Math.max(0.05, Math.min(1, 1 - n / max));
    const concentration = breakdown ? inv(breakdown.concentration, 25) : 0.5;
    const volatility = breakdown ? inv(breakdown.volatility, 25) : 0.5;
    const drawdown = breakdown ? inv(breakdown.drawdown, 25) : 0.5;
    const diversification = breakdown ? inv(breakdown.diversification, 25) : 0.5;
    const beta = intelligence.beta?.portfolioBeta ?? 1.0;
    const betaRisk = Math.max(0.1, Math.min(1, Math.abs(beta - 1) + 0.4));
    const corr = leak?.spyCorrelation ?? 0.6;
    const corrRisk = Math.max(0.15, Math.min(1, corr));
    return [concentration, volatility, betaRisk, drawdown, corrRisk, diversification];
  }, [healthScore, intelligence.beta, leak]);

  const radarLabels = ['Concen.', 'Vol', 'Beta', 'Drawdown', 'Correl.', 'Diversif.'];

  // Composite risk: average of the 6 dims, scale to 0-10
  const compositeRisk = useMemo(
    () => Math.round((radarValues.reduce((s, v) => s + v, 0) / radarValues.length) * 10 * 10) / 10,
    [radarValues]
  );

  const compositeRiskColor =
    compositeRisk < 4 ? '#00c805' : compositeRisk < 6.5 ? '#ff9f0a' : '#ff3b30';

  const healthLabel =
    !healthScore ? '—' :
    healthScore.overall >= 85 ? 'Excellent' :
    healthScore.overall >= 70 ? 'Strong' :
    healthScore.overall >= 55 ? 'Good' :
    healthScore.overall >= 40 ? 'Fair' :
    'Needs work';

  // Period-matched alpha = portfolio period-return % minus SPY period-return %.
  // We DO NOT use intelligence.beta.alphaPercent (CAPM alpha over the
  // ~180-day beta-fit lookback) NOR intelligence.beta.spyReturnPercent
  // (SPY return over that SAME 180-day window). Both produce wildly wrong
  // values against the period selector — they're the source of the
  // inverted "−0.78% underperforming" bug when the chart clearly showed
  // You +16.75% vs SPY +9.44% for 1M.
  //   - 1D: portfolio.dayChangePercent − SPY's live quote.changePercent
  //   - 5D/1M: chartMetrics from PortfolioVsSpyMini — the same series the
  //     chart's legend renders, so the card and chart can never disagree.
  const periodSpyPct = isToday
    ? spyDayPct
    : chartMetrics.spyPct;
  const periodYouPct = isToday
    ? (portfolio?.dayChangePercent ?? null)
    : (chartMetrics.youPct ?? (Number.isFinite(heroPct) ? heroPct : null));
  const alphaPct = (periodYouPct != null && periodSpyPct != null) ? periodYouPct - periodSpyPct : null;
  const alphaPositive = (alphaPct ?? 0) >= 0;
  const alphaPeriodLabel = isToday ? 'today' : period === '5d' ? '1-week' : '1-month';

  const diversifGrade =
    !healthScore ? 'B' :
    healthScore.breakdown.diversification >= 22 ? 'A+' :
    healthScore.breakdown.diversification >= 18 ? 'A' :
    healthScore.breakdown.diversification >= 14 ? 'B+' :
    healthScore.breakdown.diversification >= 10 ? 'B' :
    healthScore.breakdown.diversification >= 6 ? 'C' : 'D';

  /* ── derive Live Signals ── */
  const liveSignals: InsightSignal[] = useMemo(() => {
    const out: InsightSignal[] = [];

    // Sector concentration warning
    const topSector = intelligence.sectorExposure[0];
    if (topSector && topSector.exposurePercent > 30) {
      out.push({
        kind: 'warn',
        title: `${topSector.sector} concentration is ${topSector.exposurePercent.toFixed(0)}% of portfolio`,
        sub: `Above 25% threshold · consider trimming to reduce risk`,
        cta: 'Review',
        onClick: () => onJumpToTab?.('allocation'),
      });
    }

    // Health-score reasons (top one — context only, no cta since we're on the page)
    healthScore?.reasons.slice(0, 1).forEach(r => {
      out.push({ kind: 'warn', title: r, sub: 'From your portfolio health analysis' });
    });

    // Leak detector hidden concentration
    if (leak?.hiddenConcentration) {
      out.push({
        kind: 'warn',
        title: 'Hidden concentration via correlated holdings',
        sub: 'Multiple holdings move together — diversification is overstated',
        cta: 'Inspect',
        onClick: () => onJumpToTab?.('etf-overlap'),
      });
    }

    // Positive driver
    const topContrib = intelligence.contributors[0];
    if (topContrib && topContrib.contributionDollar > 0) {
      out.push({
        kind: 'good',
        title: `${topContrib.ticker} is leading your gains${topContrib.percentReturn != null ? ` — ${fmtPct(topContrib.percentReturn)}` : ''}`,
        sub: `Contributing ${fmtMoney(topContrib.contributionDollar, { sign: true })} ${period === '1d' ? 'today' : period === '5d' ? 'this week' : 'this month'}`,
        cta: 'Open',
        onClick: () => onTickerClick?.(topContrib.ticker),
      });
    }

    // Tax-loss harvesting opportunity from biggest detractor
    const topDetract = intelligence.detractors[0];
    if (topDetract && topDetract.contributionDollar < -500) {
      out.push({
        kind: 'tax',
        title: `${Math.abs(topDetract.contributionDollar).toLocaleString('en-US', { maximumFractionDigits: 0 })} potential tax-loss in ${topDetract.ticker}`,
        sub: `Position down ${fmtMoney(topDetract.contributionDollar, { sign: true })} ${period === '1d' ? 'today' : period === '5d' ? 'this week' : 'this month'}`,
        cta: 'Plan',
        onClick: () => onJumpToTab?.('tax-harvest'),
      });
    }

    // News articles (top 2 portfolio-relevant)
    news.slice(0, 2).forEach(n => {
      if (!n.url) return;
      out.push({
        kind: 'info',
        title: n.headline,
        sub: `${n.source}${n.matchedTickers && n.matchedTickers.length > 0 ? ` · ${n.matchedTickers.slice(0, 3).join(', ')}` : ''}`,
        cta: 'Read',
        url: n.url,
      });
    });

    return out;
  }, [intelligence, healthScore, leak, news, period, onJumpToTab, onTickerClick]);

  /* ── derive Smart Actions ── */
  const smartActions: SmartAction[] = useMemo(() => {
    const out: SmartAction[] = [];

    // Rebalance if any sector >30%
    const topSector = intelligence.sectorExposure[0];
    if (topSector && topSector.exposurePercent > 30) {
      const target = 28;
      out.push({
        tag: 'Rebalance',
        accent: 'blue',
        title: `Trim ${topSector.sector} ${topSector.exposurePercent.toFixed(0)} → ${target}%`,
        detail: `${topSector.sector} is ${(topSector.exposurePercent - target).toFixed(0)}pp above target. Trimming reduces concentration risk and frees capital to deploy elsewhere.`,
        cta: 'Open allocation',
        onClick: () => onJumpToTab?.('allocation'),
      });
    }

    // Take profits on biggest gainer
    const topContrib = intelligence.contributors[0];
    if (topContrib && topContrib.percentReturn != null && topContrib.percentReturn > 15) {
      out.push({
        tag: 'Take Profits',
        accent: 'green',
        title: `${topContrib.ticker} up ${fmtPct(topContrib.percentReturn)} from cost`,
        detail: `Lock in gains on a portion. Long-term capital gains rate (15-20%) typically applies after 12+ months of holding.`,
        cta: 'View position',
        onClick: () => onTickerClick?.(topContrib.ticker),
      });
    }

    // Protect a volatile loser
    const topDetract = intelligence.detractors[0];
    if (topDetract && topDetract.percentReturn != null && topDetract.percentReturn < -10) {
      out.push({
        tag: 'Protect',
        accent: 'amber',
        title: `Set stop-loss on ${topDetract.ticker}`,
        detail: `Position down ${fmtPct(topDetract.percentReturn)} with elevated drawdown risk. A trailing stop limits further downside.`,
        cta: 'Configure',
        onClick: () => onTickerClick?.(topDetract.ticker),
      });
    }

    // Fall-back: leak detector suggested actions
    leak?.suggestedActions.slice(0, 3 - out.length).forEach((a) => {
      out.push({
        tag: 'Diversify',
        accent: 'blue',
        title: a.length > 80 ? a.slice(0, 80) + '…' : a,
        detail: 'From correlation analysis — reducing correlated exposure improves true diversification.',
        cta: 'Review',
        onClick: () => onJumpToTab?.('etf-overlap'),
      });
    });

    return out.slice(0, 3);
  }, [intelligence, leak, onJumpToTab, onTickerClick]);

  // No width / padding wrapper — App.tsx <main> is the canonical container
  // (max-w + px). Adding our own px or max-w here would offset our content
  // from the InsightsTabBar above (which lives in the same parent and
  // inherits <main>'s padding directly).
  return (
    <div className="pt-4 lg:pt-6 pb-12">

      {/* ============== HERO ============== */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-14 mb-10 lg:mb-14">

        <div>
          <div className="flex items-center flex-wrap gap-3 mb-4 lg:mb-5">
            <SectionLabel>Portfolio Intelligence</SectionLabel>
            <span className="inline-flex items-center gap-2.5 text-[10px] text-rh-light-muted dark:text-rh-muted tabular-nums">
              <LivePulse />
              <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET
            </span>
          </div>

          <div className="flex items-baseline gap-3 mb-1.5">
            <div className={`text-[36px] sm:text-[44px] font-bold tracking-[-0.025em] leading-none tabular-nums ${heroColor}`}
              style={{ textShadow: heroGlow }}>
              {fmtMoney(heroAmount, { sign: true })}
            </div>
            <div className={`text-[14px] sm:text-[16px] font-semibold tabular-nums ${heroColor}`}>
              {fmtPct(heroPct, 2)}
            </div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-rh-light-muted dark:text-rh-muted ml-1">
              {isToday ? 'today' : period === '5d' ? '1-week' : '1-month'}
            </div>
          </div>
          <div className="text-[11px] sm:text-[12px] text-rh-light-muted dark:text-rh-muted mb-5 sm:mb-6 tabular-nums">
            ${netEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })} net equity
            {portfolio?.dayChange != null && !isToday && (
              <>
                <span className="text-white/[0.18] mx-2">·</span>
                <span className={portfolio.dayChange >= 0 ? 'text-rh-green font-semibold' : 'text-rh-red font-semibold'}>
                  {fmtMoney(portfolio.dayChange, { sign: true })} today
                </span>
              </>
            )}
          </div>

          {intelligence.explanation ? (
            <RichNarrative
              text={intelligence.explanation}
              knownTickers={knownTickers}
              onTickerClick={onTickerClick}
            />
          ) : (
            <p className="text-[13px] sm:text-[14px] text-rh-light-muted dark:text-rh-muted leading-[1.6]">
              Portfolio analysis is being generated. Refresh in a moment for a personalized briefing.
            </p>
          )}

          <div className="text-[10px] text-rh-light-muted dark:text-rh-muted tracking-wide flex items-center gap-2 mt-4">
            <span className="text-blue-400 font-bold uppercase tracking-[0.12em]">AI Brief</span>
            <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
            <span>Generated from your portfolio + market signals</span>
          </div>
        </div>

        {/* Path vs SPY intraday chart — replaces the old Hero Stats panel.
            Hero-stats data (sector driver, largest drag/driver, win rate)
            moves to a slim inline strip below the chart so we keep the info
            without losing the visual the mockup intended. Period selector
            lives inside the chart header so the pills sit next to the chart
            they control (instead of floating in the left column where they
            had no visual connection to the chart on desktop). */}
        <div className="lg:pt-1">
          <PortfolioVsSpyMini
            portfolioId={portfolioId}
            period={period}
            height={210}
            periodSelector={
              <div className="flex items-center gap-3">
                <PeriodSelector value={period} onChange={setPeriod} />
                {periodLoading && <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">Updating…</span>}
              </div>
            }
            onMetricsLoaded={setChartMetrics}
          />

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-[11px]">
            {intelligence.heroStats?.sectorDriver?.sector && (
              <div className="flex flex-col gap-0.5 border-b border-white/[0.06] pb-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Sector Driver</span>
                <span className="text-[12px] font-bold text-rh-light-text dark:text-rh-text">
                  {intelligence.heroStats.sectorDriver.sector}{' '}
                  <span className="text-rh-green">{fmtPct(intelligence.heroStats.sectorDriver.percent)}</span>
                </span>
              </div>
            )}
            {intelligence.heroStats?.largestDriver?.ticker && (
              <button
                type="button"
                onClick={() => onTickerClick?.(intelligence.heroStats!.largestDriver.ticker!)}
                className="flex flex-col gap-0.5 border-b border-white/[0.06] pb-2 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Largest Driver</span>
                <span className="text-[12px] font-bold text-rh-light-text dark:text-rh-text">
                  {intelligence.heroStats.largestDriver.ticker}{' '}
                  <span className="text-rh-green">{fmtMoney(intelligence.heroStats.largestDriver.gainDollar, { sign: true })}</span>
                </span>
              </button>
            )}
            {intelligence.heroStats?.largestDrag?.ticker && (
              <button
                type="button"
                onClick={() => onTickerClick?.(intelligence.heroStats!.largestDrag.ticker!)}
                className="flex flex-col gap-0.5 border-b border-white/[0.06] pb-2 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Largest Drag</span>
                <span className="text-[12px] font-bold text-rh-light-text dark:text-rh-text">
                  {intelligence.heroStats.largestDrag.ticker}{' '}
                  <span className="text-rh-red">{fmtMoney(intelligence.heroStats.largestDrag.lossDollar, { sign: true })}</span>
                </span>
              </button>
            )}
            <div className="flex flex-col gap-0.5 border-b border-white/[0.06] pb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Win Rate</span>
              <span className="text-[12px] font-bold text-rh-light-text dark:text-rh-text">
                {intelligence.winnersCount} <span className="text-rh-green">↑</span>
                <span className="text-rh-light-muted dark:text-rh-muted mx-1">/</span>
                {intelligence.losersCount} <span className="text-rh-red">↓</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============== STAT ROW ============== */}
      <section className="mb-10 lg:mb-14 border-t border-b border-white/[0.06] grid grid-cols-2 lg:grid-cols-4">
        <StatCell
          label="Health Score"
          value={healthLabel}
          valueColor="#00c805"
          glyph={healthScore && <HealthRing score={healthScore.overall} />}
          sub={<>
            {healthScore ? `${healthScore.overall} / 100` : '—'}
            {healthScore && healthScore.quickFixes.length > 0 && <>
              <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
              <span className="text-rh-amber dark:text-amber-400 font-semibold">{healthScore.quickFixes.length} quick fix{healthScore.quickFixes.length > 1 ? 'es' : ''}</span>
            </>}
          </>}
        />
        <StatCell
          label="Risk Index"
          value={compositeRisk < 4 ? 'Low' : compositeRisk < 6.5 ? 'Moderate' : 'High'}
          valueColor={compositeRiskColor}
          glyph={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={compositeRiskColor} strokeWidth="2">
              <path d="M12 2 L2 22 H22 L12 2 Z M12 9 V14 M12 17 V18" />
            </svg>
          }
          sub={<>
            β {(intelligence.beta?.portfolioBeta ?? 1).toFixed(2)}
            <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
            <span className="tabular-nums">{compositeRisk.toFixed(1)}/10</span>
          </>}
        />
        <StatCell
          label="Alpha vs SPY"
          value={alphaPct != null ? fmtPct(alphaPct, 2) : '—'}
          valueColor={alphaPct == null ? undefined : alphaPositive ? '#00c805' : '#ff3b30'}
          glyph={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={alphaPct == null ? 'currentColor' : alphaPositive ? '#00c805' : '#ff3b30'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={alphaPositive ? "M3 17 L9 11 L13 15 L21 7 M14 7 H21 V14" : "M3 7 L9 13 L13 9 L21 17 M14 17 H21 V10"} />
            </svg>
          }
          sub={<>
            {alphaPeriodLabel} vs SPY{periodSpyPct != null && <> ({fmtPct(periodSpyPct, 2)})</>}
            {alphaPct != null && <>
              <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
              <span className={alphaPositive ? 'text-rh-green font-semibold' : 'text-rh-red font-semibold'}>
                {alphaPositive ? '▲ outperforming' : '▼ underperforming'}
              </span>
            </>}
          </>}
        />
        <StatCell
          label="Diversification"
          value={diversifGrade}
          glyph={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#4cb3ff">
              <circle cx="12" cy="12" r="3" />
              <circle cx="6" cy="6" r="2" />
              <circle cx="18" cy="6" r="2" />
              <circle cx="18" cy="18" r="2" />
              <circle cx="6" cy="18" r="2" />
            </svg>
          }
          sub={<>
            {intelligence.sectorExposure.length} sectors
            <span className="block w-[3px] h-[3px] rounded-full bg-white/[0.18]" />
            {portfolio?.holdings?.length ?? '—'} holdings
          </>}
          onClick={() => onJumpToTab?.('allocation')}
        />
      </section>

      {/* ============== ATTRIBUTION + RADAR ============== */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 lg:gap-14 mb-10 lg:mb-14">

        <div>
          <SectionHeader
            label="P/L Attribution"
            title={period === '1d' ? "Today's Movers" : period === '5d' ? "1-Week Movers" : "1-Month Movers"}
            sub={`${intelligence.contributors.length} contributors · ${intelligence.detractors.length} detractors`}
            right={
              <div className="flex gap-3.5 text-[11px] font-bold tracking-wide">
                {(['$', '%'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setValueMode(m)}
                    className={`relative py-1 ${valueMode === m ? 'text-rh-light-text dark:text-rh-text' : 'text-rh-light-muted dark:text-rh-muted'}`}
                  >
                    {m}
                    {valueMode === m && (
                      <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-rh-green" />
                    )}
                  </button>
                ))}
              </div>
            }
          />

          <div className="text-[9px] font-bold tracking-[0.18em] text-rh-green flex items-center gap-2.5 mt-4 mb-1">
            CONTRIBUTORS <span className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div>
            {intelligence.contributors.length === 0 && (
              <div className="text-[12px] text-rh-light-muted dark:text-rh-muted py-3">No contributors {period === '1d' ? 'today' : 'in this window'}.</div>
            )}
            {intelligence.contributors.slice(0, 5).map(c => (
              <MoverRow
                key={c.ticker}
                ticker={c.ticker}
                dollar={c.contributionDollar}
                percent={c.percentReturn ?? 0}
                max={contribMax}
                kind="gain"
                onTickerClick={onTickerClick}
              />
            ))}
          </div>

          <div className="text-[9px] font-bold tracking-[0.18em] text-rh-red flex items-center gap-2.5 mt-5 mb-1">
            DETRACTORS <span className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div>
            {intelligence.detractors.length === 0 && (
              <div className="text-[12px] text-rh-light-muted dark:text-rh-muted py-3">No detractors — clean window.</div>
            )}
            {intelligence.detractors.slice(0, 5).map(c => (
              <MoverRow
                key={c.ticker}
                ticker={c.ticker}
                dollar={c.contributionDollar}
                percent={c.percentReturn ?? 0}
                max={detractMax}
                kind="loss"
                onTickerClick={onTickerClick}
              />
            ))}
          </div>
        </div>

        <div>
          <SectionHeader
            label="Risk Profile"
            title="Six-Dimensional Health"
            sub="Larger = more risk vs S&P 500"
          />
          <RiskRadar values={radarValues} labels={radarLabels} />
          <div className="flex justify-between items-center pt-4 mt-3 border-t border-white/[0.06]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Composite Risk</div>
              <div className="text-[16px] font-bold tabular-nums mt-1.5" style={{ color: compositeRiskColor }}>
                {compositeRisk.toFixed(1)} / 10
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-rh-light-muted dark:text-rh-muted">Sharpe (1Y)</div>
              <div className="text-[16px] font-bold tabular-nums mt-1.5 text-rh-light-text dark:text-rh-text">
                {risk?.metrics.sharpeRatio != null ? risk.metrics.sharpeRatio.toFixed(2) : '—'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============== SECTOR DONUT ============== */}
      <section className="mb-10 lg:mb-14">
        <SectionHeader
          label="Sector Exposure"
          title={`${intelligence.sectorExposure.length} sectors · ${portfolio?.holdings?.length ?? '—'} holdings`}
          right={
            <button
              type="button"
              onClick={() => onJumpToTab?.('allocation')}
              className="text-[10px] uppercase tracking-[0.12em] text-rh-green font-bold hover:opacity-80"
            >
              Allocation tab →
            </button>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-8 sm:gap-12 items-center">
          <div className="flex flex-col items-center">
            <div className="relative">
              <SectorDonut slices={sectorSlices} />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-[22px] sm:text-[26px] font-bold tracking-tight tabular-nums">{diversifGrade}</div>
                <div className="text-[8px] sm:text-[9px] text-rh-light-muted dark:text-rh-muted uppercase tracking-[0.16em] mt-1">grade</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 sm:gap-x-9">
            {sectorSlices.map((s) => (
              <button
                key={s.sector}
                type="button"
                onClick={() => onJumpToTab?.('allocation')}
                className="grid grid-cols-[10px_1fr_auto] gap-3 items-center py-2.5 border-b border-white/[0.06] text-left hover:bg-white/[0.02]"
              >
                <span className="block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                <span className="text-[11px] sm:text-[12px] text-rh-light-muted dark:text-rh-muted">{s.sector}</span>
                <span className="text-[11px] sm:text-[12px] font-bold tabular-nums text-rh-light-text dark:text-rh-text">
                  {s.pct.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ============== LIVE SIGNALS ============== */}
      {liveSignals.length > 0 && (
        <section className="mb-10 lg:mb-14">
          <SectionHeader
            label="Live Signals"
            title="What deserves your attention"
            sub={`${liveSignals.length} active signals · refreshed live`}
          />
          <div className="border-t border-white/[0.06]">
            {liveSignals.map((s, i) => (
              <InsightRow key={i} signal={s} />
            ))}
          </div>
        </section>
      )}

      {/* ============== SMART ACTIONS ============== */}
      {smartActions.length > 0 && (
        <section className="mb-10 lg:mb-14">
          <SectionHeader
            label="Smart Actions"
            title={`${smartActions.length === 1 ? 'One move' : 'Moves'} to consider`}
            sub="Generated from your portfolio's risk and return profile"
          />
          <div className="border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 pt-4 sm:pt-6">
            {smartActions.map((a, i) => (
              <SmartActionCard key={i} action={a} />
            ))}
          </div>
        </section>
      )}

      {/* ============== RELATED NEWS ============== */}
      {news.length > 0 && (
        <section>
          <SectionHeader
            label="Portfolio News"
            title="Headlines touching your holdings"
            sub={`${news.length} articles`}
          />
          <div className="border-t border-white/[0.06]">
            {news.slice(0, 6).map(n => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 py-3.5 sm:py-4 border-b border-white/[0.06] last:border-b-0 hover:pl-1 transition-all cursor-pointer"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] sm:text-[13px] font-semibold text-rh-light-text dark:text-rh-text leading-snug">{n.headline}</span>
                  <span className="text-[11px] text-rh-light-muted dark:text-rh-muted">
                    {n.source}
                    {n.matchedTickers && n.matchedTickers.length > 0 && (
                      <>
                        <span className="mx-2 text-white/[0.18]">·</span>
                        {n.matchedTickers.slice(0, 4).map((t: string, idx: number) => (
                          <span key={t}>
                            {/* span+role=button (not <button>) — outer is <a>, nested
                                <button> inside <a> is invalid HTML and warns in dev. */}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTickerClick?.(t); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTickerClick?.(t); } }}
                              className="text-rh-green hover:underline font-semibold cursor-pointer"
                            >{t}</span>
                            {idx < Math.min(3, n.matchedTickers!.length - 1) && <span className="text-rh-light-muted dark:text-rh-muted">, </span>}
                          </span>
                        ))}
                      </>
                    )}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.12em] text-rh-green font-bold sm:self-center">Read →</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
