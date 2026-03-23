import { useEffect, useState, useRef } from 'react';
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
  onDelete?: (ticker: string) => void;
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
  onDelete,
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

  // Swipe-to-delete state
  const [swipeX, setSwipeX] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const didSwipeRef = useRef(false);
  const swipeThreshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDragActive) return;
    didSwipeRef.current = false;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isDragActive) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    // Only track horizontal swipes (ignore vertical scroll)
    if (dy > 30) { touchStartRef.current = null; setSwipeX(0); return; }
    // Only allow left swipe — mark as swiping if moved more than 10px
    if (dx < -10) didSwipeRef.current = true;
    if (dx < 0) setSwipeX(dx);
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    if (swipeX < -swipeThreshold) {
      setShowDeleteConfirm(true);
    }
    setSwipeX(0);
    touchStartRef.current = null;
  };

  const handleClick = () => {
    if (shouldSuppressClick()) return;
    // Suppress click after a swipe gesture to prevent accidental navigation
    if (didSwipeRef.current) { didSwipeRef.current = false; return; }
    if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={swipeX < 0 ? { transform: `translateX(${swipeX}px)`, transition: 'none' } : { transition: 'transform 0.2s ease' }}
        className={`flex items-center px-3 py-3 transition-all duration-150 relative ${
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

        {/* Swipe-to-delete confirmation */}
        {showDeleteConfirm && onDelete && (
          <div className="absolute inset-0 flex items-center justify-end bg-red-600/95 rounded-xl px-4 gap-3">
            <span className="text-white text-sm font-medium mr-auto">Remove {holding.ticker}?</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/20"
            >
              Cancel
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(holding.ticker); setShowDeleteConfirm(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/30"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </Reorder.Item>
  );
}
