import { useEffect } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Holding } from '../types';
import { useLongPressDrag } from '../hooks/useLongPressDrag';
import { StockLogo } from './StockLogo';
import { MiniSparkline } from './MiniSparkline';

type DisplayMetric = 'lastPrice' | 'dayChangePct' | 'equity' | 'dayChange' | 'totalReturn' | 'totalReturnPct';

interface MetricDisplay {
  text: string;
  isPositive: boolean;
  isNeutral: boolean;
}

interface EarningsBadge {
  daysUntil: number;
  label: string;
}

interface DraggableHoldingCardProps {
  holding: Holding;
  idx: number;
  displayMetric: DisplayMetric;
  chartPeriod: import('../types').PortfolioChartPeriod;
  earningsBadge?: EarningsBadge;
  onTickerClick?: (ticker: string, holding: Holding) => void;
  getMetricDisplay: (h: Holding, metric: DisplayMetric) => MetricDisplay;
  formatCurrency: (value: number) => string;
  dragActiveId: string | null;
  onDragActiveChange?: (id: string | null) => void;
  isSearchMatch?: boolean;
  isSearchDimmed?: boolean;
}

export function DraggableHoldingCard({
  holding,
  idx,
  displayMetric,
  chartPeriod,
  earningsBadge,
  onTickerClick,
  getMetricDisplay: getMetric,
  formatCurrency,
  dragActiveId,
  onDragActiveChange,
  isSearchMatch = false,
  isSearchDimmed = false,
}: DraggableHoldingCardProps) {
  const dragControls = useDragControls();
  const { isPressed, isDragActive, onPointerDown, onPointerMove, onPointerUp, shouldSuppressClick } = useLongPressDrag(dragControls);

  // Report drag state changes to parent
  useEffect(() => {
    onDragActiveChange?.(isDragActive ? holding.id : null);
  }, [isDragActive, holding.id, onDragActiveChange]);

  const isUnavailable = holding.priceUnavailable;
  const hasValidPrice = !isUnavailable && holding.currentPrice > 0;
  const metric = hasValidPrice ? getMetric(holding, displayMetric) : null;

  const isAnotherDragging = dragActiveId != null && dragActiveId !== holding.id;

  const handleClick = () => {
    if (shouldSuppressClick()) return;
    if (onTickerClick && !isUnavailable) {
      onTickerClick(holding.ticker, holding);
    }
  };

  return (
    <Reorder.Item
      value={holding.id}
      dragListener={false}
      dragControls={dragControls}
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        touchAction: 'manipulation',
        position: 'relative',
        zIndex: isDragActive ? 50 : 'auto',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      className="list-none"
    >
      <div
        data-search-match={isSearchMatch ? 'true' : 'false'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleClick}
        className={`flex items-center px-3 py-3 transition-all duration-150 ${
          idx > 0 ? 'border-t border-rh-light-border/15 dark:border-rh-border/15' : ''
        } ${
          onTickerClick && !isDragActive ? 'cursor-pointer active:bg-gray-100 dark:active:bg-white/[0.03]' : ''
        } ${
          isSearchMatch
            ? 'bg-rh-green/10 ring-1 ring-rh-green/25 rounded-xl'
            : isSearchDimmed
            ? 'opacity-55'
            : ''
        } ${
          isDragActive
            ? 'scale-[1.03] shadow-lg bg-white dark:bg-rh-card rounded-xl'
            : isPressed
            ? 'scale-[0.98] bg-gray-50 dark:bg-white/[0.02]'
            : ''
        } ${
          isAnotherDragging ? 'opacity-50' : ''
        }`}
      >
        {/* Left: Logo + Ticker + Shares */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <StockLogo ticker={holding.ticker} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{holding.ticker}</span>
              {earningsBadge && (
                <span className="text-[9px] bg-amber-500/15 text-amber-500 dark:text-amber-400 px-1 py-0.5 rounded-full font-medium">
                  {earningsBadge.daysUntil === 0 ? 'ER' : `ER ${earningsBadge.label}`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/50">
              {holding.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares
            </p>
          </div>
        </div>

        {/* Center: Sparkline */}
        <div className="flex-shrink-0 px-3">
          {hasValidPrice && (
            <MiniSparkline ticker={holding.ticker} positive={holding.dayChange >= 0} period={chartPeriod} />
          )}
        </div>

        {/* Right: Equity + Metric stacked */}
        <div className="flex-1 text-right">
          {hasValidPrice ? (
            <>
              <p className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                {formatCurrency(holding.currentValue)}
              </p>
              {metric && (
                <p className={`text-[11px] font-medium ${
                  metric.isNeutral
                    ? 'text-rh-light-muted dark:text-rh-muted'
                    : metric.isPositive
                    ? 'text-rh-green'
                    : 'text-rh-red'
                }`}>
                  {metric.text}
                </p>
              )}
            </>
          ) : (
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">—</span>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}
