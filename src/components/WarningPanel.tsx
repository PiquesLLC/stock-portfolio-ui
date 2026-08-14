import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getRiskTemperature, RiskTemperatureResponse, RiskMetricResult } from '../api';

// ─── Types ──────────────────────────────────────────────────────────────────
// The nine risk metrics + composite are computed SERVER-side
// (risk-temperature.service.ts — the canonical engine, previously duplicated
// here client-side). This component only renders what the API returns.

type MetricResult = RiskMetricResult;

interface WarningPanelProps {
  ticker: string;
}

// ─── Level styling ──────────────────────────────────────────────────────────
// One severity vocabulary, sourced ONLY from the server `level` field. Site
// color tokens (rh-green / rh-red) with the RiskForecast yellow family for
// the middle state; severity reads through a dot + value color, never a
// background wash.

const LEVEL_STYLES: Record<MetricResult['level'], { text: string; dot: string }> = {
  low: { text: 'text-rh-green', dot: 'bg-rh-green' },
  elevated: { text: 'text-amber-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  high: { text: 'text-rh-red', dot: 'bg-rh-red' },
};

const LEVEL_ORDER: Record<MetricResult['level'], number> = { high: 0, elevated: 1, low: 2 };

// ─── Sub-Components ─────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!ref.current || typeof window === 'undefined') return;
    const rect = ref.current.getBoundingClientRect();
    const tipW = 240;
    // Prefer right side; fall back to left if it would overflow viewport
    let left = rect.right + 8;
    if (left + tipW > window.innerWidth - 8) {
      left = rect.left - tipW - 8;
    }
    if (left < 8) left = 8;
    const top = rect.top + rect.height / 2;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (show) updatePos();
  }, [show, updatePos]);

  return (
    <div
      className="inline-flex"
      ref={ref}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && pos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] px-3 py-2 rounded-lg text-[11px] leading-relaxed text-white/80 pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translateY(-50%)',
            maxWidth: Math.min(300, window.innerWidth * 0.9 - 16),
            width: 260,
            wordBreak: 'break-word' as const,
            whiteSpace: 'normal' as const,
            background: 'rgba(10, 10, 15, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </div>
  );
}

function RiskChip({ label, value, level, tooltip }: { label: string; value: string; level: MetricResult['level']; tooltip?: string }) {
  const s = LEVEL_STYLES[level];
  const chip = (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200/60 dark:border-white/[0.08] bg-gray-50/60 dark:bg-transparent text-xs cursor-default">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <span className="font-medium text-rh-light-text dark:text-white/80">{label}</span>
      <span className={`font-semibold tabular-nums ${s.text}`}>{value}</span>
    </div>
  );
  if (tooltip) return <Tooltip text={tooltip}>{chip}</Tooltip>;
  return chip;
}

function MetricRow({ title, metric }: { title: string; metric: MetricResult }) {
  const [showDetail, setShowDetail] = useState(false);
  const s = LEVEL_STYLES[metric.level];
  return (
    <button
      type="button"
      onClick={() => setShowDetail(d => !d)}
      className="w-full text-left py-2.5 transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
        <span className="text-[12px] text-rh-light-text/80 dark:text-white min-w-0 truncate">{title}</span>
        <span className={`ml-auto text-[12px] font-semibold tabular-nums shrink-0 ${s.text}`}>{metric.value}</span>
        <span className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 w-14 text-right opacity-60 ${s.text}`}>{metric.level}</span>
      </div>
      {showDetail && (
        <div className="mt-1.5 pl-4">
          <p className="text-[11px] text-rh-light-text dark:text-white leading-snug">{metric.context}</p>
          {metric.explanation && (
            <p className="text-[11px] text-rh-light-text dark:text-white/80 leading-snug mt-0.5">{metric.explanation}</p>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

// Short chip labels for the collapsed state
const CHIP_LABELS: Record<string, string> = {
  trend: 'Trend',
  trendBreak: 'Trend Break',
  volatility: 'Vol',
  euphoria: 'Euphoria',
  crash: 'Crash Risk',
  drawdown: 'DD',
  correction: 'Correction',
  gap: 'Gap Risk',
  distribution: 'Distribution',
};

// Default chips when nothing is elevated — the four headline gauges
const HEADLINE_IDS = ['trend', 'euphoria', 'volatility', 'drawdown'];

export function WarningPanel({ ticker }: WarningPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [risk, setRisk] = useState<RiskTemperatureResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRisk(null);
    getRiskTemperature(ticker).then(r => { if (!cancelled) setRisk(r); });
    return () => { cancelled = true; };
  }, [ticker]);

  // Loading, error, or <200 days of history — render nothing (matches the old
  // client-side behavior when candles were missing/short).
  const m = risk?.available ? risk.metrics : null;
  if (!m) return null;

  // Collect all available cards
  const cards: { id: string; title: string; metric: MetricResult }[] = [];
  if (m.temperature) cards.push({ id: 'temperature', title: 'Risk Temperature', metric: m.temperature });
  if (m.trend) cards.push({ id: 'trend', title: 'Distance to Trend', metric: m.trend });
  if (m.trendBreak) cards.push({ id: 'trendBreak', title: 'Trend Break', metric: m.trendBreak });
  if (m.volatility) cards.push({ id: 'volatility', title: 'Realized Volatility', metric: m.volatility });
  if (m.euphoria) cards.push({ id: 'euphoria', title: 'Euphoria Meter', metric: m.euphoria });
  if (m.crash) cards.push({ id: 'crash', title: 'Crash Cluster Risk', metric: m.crash });
  if (m.drawdown) cards.push({ id: 'drawdown', title: 'Drawdown Pressure', metric: m.drawdown });
  if (m.correction) cards.push({ id: 'correction', title: 'Correction Clocks', metric: m.correction });
  if (m.gap) cards.push({ id: 'gap', title: 'Overnight Gap Risk', metric: m.gap });
  if (m.distribution) cards.push({ id: 'distribution', title: 'Distribution Days', metric: m.distribution });

  if (cards.length === 0) return null;

  const composite = m.temperature;
  const components = cards.filter(c => c.id !== 'temperature');
  const sorted = [...components].sort((a, b) => LEVEL_ORDER[a.metric.level] - LEVEL_ORDER[b.metric.level]);

  // Collapsed chips: every non-low gauge surfaces (severity first), padded
  // with the headline four when things are calm. Capped to keep it to a row
  // or two.
  const nonLow = sorted.filter(c => c.metric.level !== 'low');
  const fillers = components.filter(c => HEADLINE_IDS.includes(c.id) && c.metric.level === 'low');
  const chips = [...nonLow, ...fillers].slice(0, 6);
  const chipValue = (c: { id: string; metric: MetricResult }) =>
    c.id === 'euphoria' ? `${c.metric.value}/100` : c.metric.value;

  const rawScore = composite ? parseFloat(composite.value) : NaN;
  const score = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, rawScore)) : null;
  const compositeStyle = LEVEL_STYLES[composite?.level ?? 'low'];

  return (
    <div className="mb-6">
      {/* Header — standard section style; the whole row toggles expanded */}
      {/* Hitbox extends ~12px past both edges and into the gap below (negative
          margins compensated by padding) so near-misses around the chevron
          still register; visual position is unchanged. */}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(e => !e)}
        className="w-[calc(100%+1.5rem)] -mx-3 px-3 -mt-2 pt-2 pb-2 mb-1 flex items-center justify-between gap-2 rounded-lg transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-text dark:text-white">
          <span className="w-0.5 h-3.5 bg-rh-green rounded-full" />Risk Temperature
        </span>
        <span className="flex items-center gap-2">
          {composite && (
            <span className={`text-xs font-semibold tabular-nums ${compositeStyle.text}`}>
              {composite.value}/100 · {composite.context}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-rh-light-text dark:text-white transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Composite meter — solid fill, colored by the server level only */}
      {score !== null && (
        <div className="relative h-1 rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden mb-3">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${compositeStyle.dot}`}
            style={{ width: `${score}%` }}
          />
        </div>
      )}

      {expanded ? (
        /* Expanded: all gauges, severity sorted, hairline dividers */
        <div className="divide-y divide-gray-200/40 dark:divide-white/[0.04] mb-1">
          {sorted.map(card => (
            // chipValue keeps the euphoria "/100" scale consistent between
            // the collapsed chips and the expanded rows
            <MetricRow key={card.id} title={card.title} metric={{ ...card.metric, value: chipValue(card) }} />
          ))}
        </div>
      ) : (
        chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {chips.map(c => (
              <RiskChip
                key={c.id}
                label={CHIP_LABELS[c.id] ?? c.title}
                value={chipValue(c)}
                level={c.metric.level}
                tooltip={c.metric.explanation}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
