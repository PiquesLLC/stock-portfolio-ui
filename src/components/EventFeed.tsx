import { useState } from 'react';
import { motion } from 'framer-motion';
import { AIEvent } from '../api';

interface EventFeedProps {
  events: AIEvent[];
  ticker: string;
}

const TYPE_LABELS: Record<string, string> = {
  EARNINGS: 'EARNINGS',
  ANALYST: 'ANALYST RATING',
  DIVIDEND: 'DIVIDEND',
  NEWS: 'NEWS',
};

function getSentimentMeta(s: number) {
  if (s > 0.3) return {
    label: 'Bullish',
    dot: 'bg-emerald-400',
    pill: 'text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/20',
    border: 'border-l-emerald-400',
    glow: 'radial-gradient(ellipse at 95% 10%, rgba(52,211,153,0.08) 0%, transparent 50%)',
    spine: 'rgba(52,211,153,0.7)',
  };
  if (s < -0.3) return {
    label: 'Bearish',
    dot: 'bg-rose-400',
    pill: 'text-rose-400 bg-rose-400/[0.08] border-rose-400/20',
    border: 'border-l-rose-500',
    glow: 'radial-gradient(ellipse at 95% 10%, rgba(251,113,133,0.08) 0%, transparent 50%)',
    spine: 'rgba(251,113,133,0.7)',
  };
  return {
    label: 'Neutral',
    dot: 'bg-yellow-400',
    pill: 'text-yellow-400 bg-yellow-400/[0.08] border-yellow-400/20',
    border: 'border-l-yellow-400/60',
    glow: 'radial-gradient(ellipse at 95% 10%, rgba(250,204,21,0.05) 0%, transparent 50%)',
    spine: 'rgba(250,204,21,0.5)',
  };
}

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'TODAY';
    if (diff === 1) return '1D AGO';
    if (diff < 7) return `${diff}D AGO`;
    if (diff < 30) return `${Math.floor(diff / 7)}W AGO`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  } catch { return dateStr; }
}

function getDomainFromUrl(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return 'source'; }
}

function SentimentPill({ sentiment }: { sentiment: number }) {
  const meta = getSentimentMeta(sentiment);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border ${meta.pill}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${meta.dot}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${meta.dot}`} />
      </span>
      {meta.label}
    </span>
  );
}

export default function EventFeed({ events }: EventFeedProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!events || events.length === 0) return null;

  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rh-green" />
          </span>
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">
            Intelligence Feed
          </h2>
        </div>
        <span className="text-[10px] font-mono font-medium uppercase tracking-widest text-rh-light-muted/40 dark:text-white/20">
          {sorted.length} signals
        </span>
      </div>

      <div className="relative max-h-[420px] overflow-y-auto scrollbar-minimal pr-1">
        {/* Vertical spine */}
        <div className="absolute left-[11px] top-0 bottom-0 w-px overflow-visible pointer-events-none">
          <div
            className="absolute inset-0 w-px transition-all duration-500"
            style={{
              background: hoveredIdx !== null
                ? getSentimentMeta(sorted[hoveredIdx]?.sentiment ?? 0).spine
                : 'linear-gradient(to bottom, rgba(0,200,5,0.3), rgba(0,200,5,0.05), transparent)',
              boxShadow: hoveredIdx !== null
                ? `0 0 8px 1px ${getSentimentMeta(sorted[hoveredIdx]?.sentiment ?? 0).spine}`
                : '0 0 4px 0px rgba(0,200,5,0.08)',
            }}
          />
        </div>

        {/* Intelligence cards */}
        <div className="space-y-2 pl-8">
          {sorted.map((event, i) => {
            const meta = getSentimentMeta(event.sentiment);

            return (
              <motion.div
                key={`${event.date}-${event.type}-${i}`}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.05,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                whileHover={{
                  y: -3,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  transition: { duration: 0.2 },
                }}
                onHoverStart={() => setHoveredIdx(i)}
                onHoverEnd={() => setHoveredIdx(null)}
                className={`group relative overflow-hidden
                  bg-white/[0.02] dark:bg-white/[0.02] bg-gray-50/40
                  backdrop-blur-md
                  border border-white/[0.05] dark:border-white/[0.05] border-gray-200/40
                  border-l-4 ${meta.border}
                  rounded-xl p-3.5
                  hover:border-t-white/[0.08] hover:border-r-white/[0.08] hover:border-b-white/[0.08]
                  hover:shadow-lg hover:shadow-black/15
                  transition-all duration-300 ease-out cursor-default`}
              >
                {/* Mood glow */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: meta.glow }}
                />

                {/* Timeline dot */}
                <div className="absolute -left-[29px] top-5 w-2 h-2 rounded-full bg-white/15 group-hover:bg-rh-green group-hover:shadow-md group-hover:shadow-green-500/40 transition-all duration-300 ring-[3px] ring-[#080809] dark:ring-[#080809] ring-gray-100" />

                {/* Top row */}
                <div className="relative flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-mono font-semibold tracking-[0.18em] text-rh-light-muted/40 dark:text-white/20">
                      {TYPE_LABELS[event.type] || event.type}
                    </span>
                    <span className="text-[10px] font-mono text-rh-light-muted/40 dark:text-white/25 tabular-nums">
                      {formatEventDate(event.date)}
                    </span>
                  </div>
                  <SentimentPill sentiment={event.sentiment} />
                </div>

                {/* Headline */}
                <h3 className="relative text-[13px] font-bold tracking-tight text-rh-light-text dark:text-white/95 mb-1.5 leading-snug">
                  {event.label}
                </h3>

                {/* Insight — truncated to 2 lines */}
                <p className="relative text-[12px] leading-[1.6] tracking-[-0.005em] line-clamp-2
                  bg-gradient-to-b from-gray-700 to-gray-700/40 dark:from-white/85 dark:to-white/35
                  bg-clip-text text-transparent">
                  {event.insight}
                </p>

                {/* Footer */}
                <div className="relative flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.03] dark:border-white/[0.03] border-gray-200/20">
                  {event.source_url ? (
                    <a
                      href={event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono font-medium text-rh-green/40 hover:text-rh-green transition-colors"
                    >
                      {getDomainFromUrl(event.source_url)} &#8599;
                    </a>
                  ) : (
                    <span className="text-[10px] font-mono text-rh-light-muted/50 dark:text-white/25">
                      perplexity.ai
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
