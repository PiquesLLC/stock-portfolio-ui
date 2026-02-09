import { useState, useEffect } from 'react';
import { PortfolioMacroImpactResponse, MacroInsight, FedSentiment } from '../../types';
import { getPortfolioMacroImpact } from '../../api';


export const MACRO_IMPACT_CACHE_TTL = 10 * 60 * 1000; // 10 min UI-side

// Subtle versions of the sentiment colors for insight pills
const PILL_BORDER: Record<string, string> = {
  healthy: 'rgba(34,197,94,0.25)',
  caution: 'rgba(245,158,11,0.25)',
  concern: 'rgba(239,68,68,0.25)',
  neutral: 'rgba(156,163,175,0.2)',
};

const PILL_BG: Record<string, string> = {
  healthy: 'rgba(34,197,94,0.03)',
  caution: 'rgba(245,158,11,0.02)',
  concern: 'rgba(239,68,68,0.025)',
  neutral: 'transparent',
};

export function InsightPill({ insight }: { insight: MacroInsight }) {
  const borderColor = PILL_BORDER[insight.sentiment] ?? PILL_BORDER.neutral;
  const bgColor = PILL_BG[insight.sentiment] ?? PILL_BG.neutral;

  return (
    <div
      className="group relative rounded-md px-3 py-2 text-left border border-transparent overflow-hidden backdrop-blur-sm"
      style={{
        borderLeftWidth: '2px',
        borderLeftColor: borderColor,
        backgroundColor: bgColor,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0 mt-0.5">{insight.icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-rh-light-text dark:text-rh-text leading-snug">
            {insight.headline}
          </p>
        </div>
      </div>
      {/* Tooltip overlay — doesn't affect layout */}
      {insight.detail && (
        <div className="pointer-events-none absolute left-0 right-0 bottom-full mb-1.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="mx-2 rounded-lg bg-gray-100/80 dark:bg-white/[0.08] backdrop-blur-md border border-gray-200/50 dark:border-white/[0.06] px-3 py-2 shadow-lg">
            <p className="text-[11px] leading-relaxed text-rh-light-text dark:text-rh-text">
              {insight.detail}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Semicircular needle gauge for Fed hawkish/dovish sentiment
export function FedSentimentGauge({ sentiment }: { sentiment: FedSentiment }) {
  // score: -100 (dovish) to +100 (hawkish)
  // Map to angle: -90deg (left/dovish) to +90deg (right/hawkish)
  const angle = (sentiment.score / 100) * 90; // -90 to +90
  const needleAngle = angle - 90; // SVG rotation: -180 (left) to 0 (right)

  // Colors for the arc segments
  const arcColors = [
    { color: '#22c55e', label: 'Dovish' },     // green (left)
    { color: '#86efac', label: '' },
    { color: '#fbbf24', label: 'Neutral' },     // amber (center)
    { color: '#fb923c', label: '' },
    { color: '#ef4444', label: 'Hawkish' },     // red (right)
  ];

  const cx = 60;
  const cy = 52;
  const r = 40;

  // Build 5 arc segments across 180 degrees
  const arcs = arcColors.map((seg, i) => {
    const startAngle = Math.PI + (i / 5) * Math.PI;     // PI to 2*PI
    const endAngle = Math.PI + ((i + 1) / 5) * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return (
      <path
        key={i}
        d={`M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`}
        fill="none"
        stroke={seg.color}
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.7"
      />
    );
  });

  // Needle
  const needleLen = r - 8;
  const needleRad = (needleAngle * Math.PI) / 180;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="68" viewBox="0 0 120 68">
        {arcs}
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke="currentColor"
          className="text-rh-light-text dark:text-rh-text"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" className="fill-rh-light-text dark:fill-rh-text" />
        {/* Labels */}
        <text x="12" y="56" fontSize="7" className="fill-rh-light-muted dark:fill-rh-muted" textAnchor="start">Dovish</text>
        <text x="108" y="56" fontSize="7" className="fill-rh-light-muted dark:fill-rh-muted" textAnchor="end">Hawkish</text>
      </svg>
      <div className="text-center -mt-1">
        <span className="text-xs font-medium text-rh-light-text dark:text-rh-text">{sentiment.label}</span>
        <p className="text-[9px] text-rh-light-muted dark:text-rh-muted mt-0.5">{sentiment.rationale}</p>
      </div>
    </div>
  );
}

export function PortfolioImpactSkeleton() {
  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4 mb-6 animate-pulse">
      <div className="h-3 bg-gray-200 dark:bg-rh-border rounded w-24 mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-gray-200 dark:bg-rh-border rounded-md" />
        ))}
      </div>
    </div>
  );
}

let macroImpactCache: PortfolioMacroImpactResponse | null = null;
let macroImpactCacheTime: number | null = null;

export function PortfolioImpactCard() {
  const [data, setData] = useState<PortfolioMacroImpactResponse | null>(macroImpactCache);
  const [loading, setLoading] = useState(!macroImpactCache);

  useEffect(() => {
    const cacheAge = macroImpactCacheTime ? Date.now() - macroImpactCacheTime : Infinity;
    if (macroImpactCache && cacheAge < MACRO_IMPACT_CACHE_TTL) {
      setData(macroImpactCache);
      setLoading(false);
      return;
    }

    setLoading(!macroImpactCache);
    getPortfolioMacroImpact()
      .then(resp => {
        macroImpactCache = resp;
        macroImpactCacheTime = Date.now();
        setData(resp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <PortfolioImpactSkeleton />;
  if (!data || data.insights.length === 0) return null;

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-4 mb-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-rh-light-muted dark:text-rh-muted uppercase tracking-wide">
          Portfolio Impact
        </h3>
        {data.projectedQuarter && (
          <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50">
            Outlook through {data.projectedQuarter}
          </span>
        )}
      </div>
      <div className="flex gap-4">
        {/* Insight pills — 2x2 grid */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.insights.map(insight => (
            <InsightPill key={insight.id} insight={insight} />
          ))}
        </div>
        {/* Fed Sentiment Gauge — right side */}
        {data.fedSentiment && (
          <div className="hidden md:flex flex-shrink-0 items-center border-l border-gray-200/50 dark:border-white/[0.06] pl-4">
            <FedSentimentGauge sentiment={data.fedSentiment} />
          </div>
        )}
      </div>
    </div>
  );
}
