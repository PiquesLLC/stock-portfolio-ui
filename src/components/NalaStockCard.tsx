import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NalaStockResult } from '../api';

interface NalaStockCardProps {
  stock: NalaStockResult;
  rank: number;
  index: number;
  onTickerClick?: (ticker: string) => void;
}

function formatMetric(value: number | null, suffix: string = ''): string {
  if (value === null || value === undefined) return '--';
  return `${value.toFixed(1)}${suffix}`;
}

function formatMarketCap(b: number | null): string {
  if (b === null) return '--';
  if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

function formatPrice(price: number | null): string {
  if (price === null) return '--';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getConfidenceGlow(score: number): string {
  if (score >= 85) return 'shadow-green-500/20';
  if (score >= 75) return 'shadow-yellow-500/20';
  return 'shadow-orange-500/20';
}

function getConfidenceGradient(score: number): string {
  if (score >= 85) return 'from-green-400 to-emerald-500';
  if (score >= 75) return 'from-yellow-400 to-amber-500';
  return 'from-orange-400 to-red-500';
}

function getConfidenceText(score: number): string {
  if (score >= 85) return 'text-green-400';
  if (score >= 75) return 'text-yellow-400';
  return 'text-orange-400';
}

export default function NalaStockCard({ stock, rank, index, onTickerClick }: NalaStockCardProps) {
  const [showRisks, setShowRisks] = useState(false);
  const m = stock.metrics;
  const confidenceWidth = ((stock.confidenceScore - 60) / 35) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
      className={`relative bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-[30px]
        border border-gray-200/60 dark:border-white/[0.08]
        rounded-[20px] p-5 transition-shadow duration-300
        hover:shadow-lg hover:${getConfidenceGlow(stock.confidenceScore)}
        hover:border-gray-300 dark:hover:border-white/[0.15]`}
    >
      {/* Rank badge */}
      <div className="absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full bg-rh-green flex items-center justify-center shadow-lg shadow-green-500/30">
        <span className="text-[11px] font-bold text-white">{rank}</span>
      </div>

      {/* Header: ticker, name, price */}
      <div className="flex items-start justify-between mb-3 pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onTickerClick?.(stock.ticker)}
              className="text-base font-bold tracking-tight text-rh-green hover:text-rh-green/80 transition-all"
            >
              {stock.ticker}
            </button>
            <span className="text-sm text-rh-light-text/80 dark:text-white/70 font-medium tracking-tight">
              {stock.companyName}
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full
            bg-gray-100 dark:bg-white/[0.06]
            border border-gray-200/50 dark:border-white/[0.08]
            text-rh-light-muted dark:text-white/40 tracking-wider">
            {stock.sector}
          </span>
        </div>
        <div className="text-right">
          <div className="font-mono text-base font-bold text-rh-light-text dark:text-white tabular-nums tracking-tight">
            {formatPrice(stock.currentPrice)}
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-1.5 bg-gray-200/50 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, confidenceWidth))}%` }}
            transition={{ duration: 0.8, delay: index * 0.08 + 0.3, ease: 'easeOut' }}
            className={`h-full rounded-full bg-gradient-to-r ${getConfidenceGradient(stock.confidenceScore)}`}
          />
        </div>
        <span className={`font-mono text-xs font-bold tabular-nums ${getConfidenceText(stock.confidenceScore)}`}>
          {stock.confidenceScore}
        </span>
      </div>

      {/* Metrics grid — glassmorphic inner card */}
      <div className="bg-gray-50/60 dark:bg-white/[0.03] rounded-2xl border border-gray-200/40 dark:border-white/[0.05] p-3 mb-4">
        <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
          <MetricCell label="P/E" value={formatMetric(m.peRatio)} />
          <MetricCell label="ROE" value={formatMetric(m.roe, '%')} />
          <MetricCell label="Div Yield" value={formatMetric(m.dividendYield, '%')} />
          <MetricCell label="Rev Growth" value={formatMetric(m.revenueGrowthYoY, '%')} />
          <MetricCell label="Margin" value={formatMetric(m.profitMargin, '%')} />
          <MetricCell label="D/E" value={formatMetric(m.debtToEquity)} />
          <MetricCell label="FCF Yield" value={formatMetric(m.freeCashFlowYield, '%')} />
          <MetricCell label="Mkt Cap" value={formatMarketCap(m.marketCapB)} />
        </div>
      </div>

      {/* AI Explanation — gradient text */}
      <p className="font-mono text-sm leading-relaxed mb-3 text-rh-light-text/90 dark:text-white/60">
        {stock.explanation}
      </p>

      {/* Risks (collapsible) */}
      {stock.risks && (
        <div className="mb-3">
          <button
            onClick={() => setShowRisks(!showRisks)}
            className="flex items-center gap-1.5 text-xs text-rh-light-muted/50 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/50 transition-colors"
          >
            <motion.svg
              animate={{ rotate: showRisks ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
            Risks
          </button>
          <AnimatePresence>
            {showRisks && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="font-mono text-xs text-rh-light-muted/70 dark:text-white/30 mt-1.5 pl-4 leading-relaxed overflow-hidden"
              >
                {stock.risks}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200/30 dark:border-white/[0.05]">
        {stock.localData ? (
          <span className="flex items-center gap-1.5 text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400/80">In portfolio</span>
          </span>
        ) : (
          <span />
        )}
        <button
          onClick={() => onTickerClick?.(stock.ticker)}
          className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md
            bg-transparent border border-rh-green/25
            text-rh-green/60 hover:text-rh-green hover:border-rh-green/50
            transition-all duration-200"
          onMouseEnter={e => (e.currentTarget.style.animation = 'nala-glow-pulse 2s ease-in-out infinite')}
          onMouseLeave={e => (e.currentTarget.style.animation = 'none')}
        >
          View Details
        </button>
      </div>
    </motion.div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  const isNA = value === '--';
  return (
    <div>
      <div className={`text-[9px] uppercase tracking-widest font-medium ${isNA ? 'text-rh-light-muted/50 dark:text-white/20' : 'text-rh-light-muted/60 dark:text-white/25'}`}>{label}</div>
      <div className={`font-mono text-xs font-bold tabular-nums tracking-tight ${isNA ? 'text-rh-light-muted/40 dark:text-white/15' : 'text-rh-light-text dark:text-white/80'}`}>
        {isNA ? '·' : value}
      </div>
    </div>
  );
}
