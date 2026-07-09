import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getRiskTemperature, RiskTemperatureResponse } from '../api';

// ─── Types ──────────────────────────────────────────────────────────────────
// The nine risk metrics + composite are computed SERVER-side
// (risk-temperature.service.ts — the canonical engine, previously duplicated
// here client-side). This component only renders what the API returns.

interface MetricResult {
  value: string;
  context: string;
  percentile?: number;
  level: 'low' | 'elevated' | 'high';
  detail?: string; // tooltip extra
  explanation?: string; // one-sentence "why is this LOW/ELEVATED/HIGH"
}

interface WarningPanelProps {
  ticker: string;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const LEVEL_COLORS = {
  low: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'hover:shadow-emerald-500/5' },
  elevated: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'hover:shadow-amber-500/5' },
  high: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', glow: 'hover:shadow-red-500/5' },
};

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
  const c = LEVEL_COLORS[level];
  const chip = (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${c.border} ${c.bg} text-sm cursor-default`}>
      <span className="text-rh-light-muted dark:text-white/50 font-medium">{label}</span>
      <span className={`font-bold ${c.text}`}>{value}</span>
    </div>
  );
  if (tooltip) return <Tooltip text={tooltip}>{chip}</Tooltip>;
  return chip;
}

const ICONS: Record<string, string> = {
  temperature: '🌡️',
  correction: '⏰',
  trend: '📊',
  trendBreak: '⚠️',
  volatility: '📈',
  crash: '💥',
  drawdown: '📉',
  gap: '🌙',
  distribution: '📦',
  euphoria: '🎢',
};

function MetricRow({ id, title, metric }: { id: string; title: string; metric: MetricResult }) {
  const [showDetail, setShowDetail] = useState(false);
  const c = LEVEL_COLORS[metric.level];
  return (
    <button
      onClick={() => setShowDetail(d => !d)}
      className={`w-full text-left px-3 py-2 rounded-lg ${c.bg} border ${c.border} transition-all hover:brightness-110`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs shrink-0">{ICONS[id] || '📊'}</span>
        <span className="text-[11px] font-medium text-rh-light-muted dark:text-white/50 min-w-0 truncate">{title}</span>
        <span className={`ml-auto text-sm font-bold ${c.text} shrink-0 tabular-nums`}>
          {metric.value}
        </span>
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${c.text} shrink-0 w-14 text-right`}>
          {metric.level}
        </span>
      </div>
      {showDetail && (
        <div className="mt-1.5 pl-6">
          <p className="text-[10px] text-rh-light-muted/70 dark:text-white/40 leading-snug">{metric.context}</p>
          {metric.explanation && (
            <p className="text-[10px] text-rh-light-muted/50 dark:text-white/25 leading-snug mt-0.5 italic">{metric.explanation}</p>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<MetricResult['level'], number> = { high: 0, elevated: 1, low: 2 };

export function WarningPanel({ ticker }: WarningPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showLow, setShowLow] = useState(false);
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

  const riskTemperature = m.temperature;
  const trendDistance = m.trend;
  const trendBreak = m.trendBreak;
  const volatility = m.volatility;
  const euphoriaMeter = m.euphoria;
  const crashCluster = m.crash;
  const drawdownPressure = m.drawdown;
  const correctionClocks = m.correction;
  const gapRisk = m.gap;
  const distributionDays = m.distribution;

  // Collect all available cards
  const cards: { id: string; title: string; metric: MetricResult }[] = [];
  if (riskTemperature) cards.push({ id: 'temperature', title: 'Risk Temperature', metric: riskTemperature });
  if (trendDistance) cards.push({ id: 'trend', title: 'Distance to Trend', metric: trendDistance });
  if (trendBreak) cards.push({ id: 'trendBreak', title: 'Trend Break', metric: trendBreak });
  if (volatility) cards.push({ id: 'volatility', title: 'Realized Volatility', metric: volatility });
  if (euphoriaMeter) cards.push({ id: 'euphoria', title: 'Euphoria Meter', metric: euphoriaMeter });
  if (crashCluster) cards.push({ id: 'crash', title: 'Crash Cluster Risk', metric: crashCluster });
  if (drawdownPressure) cards.push({ id: 'drawdown', title: 'Drawdown Pressure', metric: drawdownPressure });
  if (correctionClocks) cards.push({ id: 'correction', title: 'Correction Clocks', metric: correctionClocks });
  if (gapRisk) cards.push({ id: 'gap', title: 'Overnight Gap Risk', metric: gapRisk });
  if (distributionDays) cards.push({ id: 'distribution', title: 'Distribution Days', metric: distributionDays });

  if (cards.length === 0) return null;

  const tempColor = riskTemperature ? LEVEL_COLORS[riskTemperature.level] : LEVEL_COLORS.low;

  // Dynamic header based on risk temperature score
  const tempScore = riskTemperature ? parseFloat(riskTemperature.value) : 0;
  const isHighRisk = tempScore >= 50;
  const headerLabel = isHighRisk ? 'ELEVATED RISK' : 'FAVORABLE RISK';

  return (
    <div className="mb-6">
      <style>{`
        @keyframes fadeInRight { from { opacity: 0; transform: translateY(-50%) translateX(-4px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fire-text {
          0%   { background-position: 0% 80%; }
          50%  { background-position: 100% 20%; }
          100% { background-position: 0% 80%; }
        }
        @keyframes fire-glow {
          0%, 100% { text-shadow: 0 0 4px rgba(239,68,68,0.3), 0 0 8px rgba(251,146,60,0.15); }
          50%      { text-shadow: 0 0 8px rgba(239,68,68,0.5), 0 0 16px rgba(251,146,60,0.25), 0 0 24px rgba(234,179,8,0.1); }
        }
        .fire-text {
          background: linear-gradient(
            0deg,
            #EF4444 0%,
            #F97316 25%,
            #FBBF24 50%,
            #F97316 75%,
            #EF4444 100%
          );
          background-size: 200% 200%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: fire-text 3s ease-in-out infinite, fire-glow 2s ease-in-out infinite;
        }
        @keyframes money-text {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes money-glow {
          0%, 100% { text-shadow: 0 0 4px rgba(0,200,5,0.3), 0 0 8px rgba(16,185,129,0.15); }
          50%      { text-shadow: 0 0 8px rgba(0,200,5,0.5), 0 0 16px rgba(16,185,129,0.25), 0 0 24px rgba(52,211,153,0.1); }
        }
        .money-text {
          background: linear-gradient(
            90deg,
            #00c805 0%,
            #10B981 30%,
            #34D399 50%,
            #10B981 70%,
            #00c805 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: money-text 4s ease-in-out infinite, money-glow 2s ease-in-out infinite;
        }
      `}</style>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between group mb-3"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tracking-wide ${
            isHighRisk ? 'fire-text' : 'money-text'
          }`}>
            {headerLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && riskTemperature && (
            <div className={`px-2 py-0.5 rounded text-xs font-bold ${tempColor.text} ${tempColor.bg} border ${tempColor.border}`}>
              {riskTemperature.context} · {riskTemperature.value}/100
            </div>
          )}
          <svg
            className={`w-4 h-4 text-rh-light-muted/50 dark:text-white/40 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsed: chips */}
      {!expanded && (
        <div className="flex flex-wrap gap-2 mb-2">
          {trendDistance && <RiskChip label="Trend" value={trendDistance.value} level={trendDistance.level} tooltip={trendDistance.explanation} />}
          {euphoriaMeter && <RiskChip label="Euphoria" value={`${euphoriaMeter.value}/100`} level={euphoriaMeter.level} tooltip={euphoriaMeter.explanation} />}
          {volatility && <RiskChip label="Vol" value={volatility.value} level={volatility.level} tooltip={volatility.explanation} />}
          {drawdownPressure && <RiskChip label="DD" value={drawdownPressure.value} level={drawdownPressure.level} tooltip={drawdownPressure.explanation} />}
        </div>
      )}

      {/* Expanded: compact list — severity sorted, LOW hidden by default */}
      {expanded && (() => {
        const sorted = [...cards].sort((a, b) => LEVEL_ORDER[a.metric.level] - LEVEL_ORDER[b.metric.level]);
        // Pull Risk Temperature to top
        const temp = sorted.find(c => c.id === 'temperature');
        const rest = sorted.filter(c => c.id !== 'temperature');
        const elevated = rest.filter(c => c.metric.level !== 'low');
        const low = rest.filter(c => c.metric.level === 'low');
        const tempScore = temp ? parseFloat(temp.metric.value) : 0;
        const tempC = temp ? LEVEL_COLORS[temp.metric.level] : LEVEL_COLORS.low;
        return (
          <>
            {/* Risk Temperature bar */}
            {temp && (
              <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${tempC.bg} border ${tempC.border} mb-2`}>
                <span className="text-sm">🌡️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-rh-light-muted dark:text-white/50">Risk Temperature</span>
                    <span className={`text-sm font-bold ${tempC.text} tabular-nums`}>{temp.metric.value} / 100</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-gray-100/60 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, tempScore))}%`,
                        background: tempScore > 70 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : tempScore > 45 ? 'linear-gradient(90deg, #22c55e, #f59e0b)' : 'linear-gradient(90deg, #22c55e, #22c55e)',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Metric rows */}
            <div className="flex flex-col gap-1.5 mb-2">
              {elevated.map(card => (
                <MetricRow key={card.id} id={card.id} title={card.title} metric={card.metric} />
              ))}
              {showLow && low.map(card => (
                <MetricRow key={card.id} id={card.id} title={card.title} metric={card.metric} />
              ))}
            </div>
            {low.length > 0 && (
              <button
                onClick={() => setShowLow(s => !s)}
                className="text-[11px] font-medium text-rh-light-muted/60 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/60 transition-colors mb-2"
              >
                {showLow ? 'Hide low risk metrics' : `Show ${low.length} low risk metric${low.length > 1 ? 's' : ''}`}
              </button>
            )}
          </>
        );
      })()}

      {/* Disclaimer */}
      <p className="text-[10px] text-rh-light-muted/40 dark:text-white/20 leading-relaxed">
        Historical risk context — not a prediction. Not financial advice.
      </p>
    </div>
  );
}
