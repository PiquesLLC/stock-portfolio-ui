import { useMemo, useState, useCallback, useRef, useEffect } from 'react';

export interface TickerTapeItem {
  ticker: string;
  label?: string;        // e.g. "S&P 500" for SPY — falls back to ticker
  price: number;
  changePercent: number;
}

interface TickerTapeProps {
  holdings: TickerTapeItem[];
  indices: TickerTapeItem[];
  onTickerClick: (ticker: string) => void;
}

function isEffectivelyZero(pct: number): boolean {
  return Math.abs(pct) < 0.005;
}

// Desktop: min-width 768px
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return desktop;
}

const INDEX_TICKERS = new Set(['SPY', 'QQQ', 'DIA']);

export function TickerTape({ holdings, indices, onTickerClick }: TickerTapeProps) {
  const isDesktop = useIsDesktop();
  const [paused, setPaused] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the tape: on desktop skip indices (already shown above), on mobile include them
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: TickerTapeItem[] = [];

    if (!isDesktop) {
      for (const idx of indices) {
        const key = idx.ticker.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(idx);
        }
      }
    }

    for (const h of holdings) {
      const key = h.ticker.toUpperCase();
      // On desktop, also skip index tickers from holdings
      if (isDesktop && INDEX_TICKERS.has(key)) continue;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(h);
      }
    }

    return result;
  }, [holdings, indices, isDesktop]);

  // Handle tap on mobile: first tap = select + pause, second tap = navigate
  const handleItemClick = useCallback((ticker: string) => {
    if (isDesktop) {
      onTickerClick(ticker);
      return;
    }
    // Mobile: two-tap pattern
    if (selectedTicker === ticker) {
      // Second tap — navigate to stock
      setSelectedTicker(null);
      setPaused(false);
      onTickerClick(ticker);
    } else {
      // First tap — select and pause
      setSelectedTicker(ticker);
      setPaused(true);
    }
  }, [isDesktop, selectedTicker, onTickerClick]);

  // Tap outside deselects and resumes scrolling
  useEffect(() => {
    if (!paused || isDesktop) return;
    const handler = (e: TouchEvent | MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedTicker(null);
        setPaused(false);
      }
    };
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [paused, isDesktop]);

  if (items.length === 0) return null;

  const duration = Math.min(Math.max(items.length * 3, 20), 60);

  const renderItem = (item: TickerTapeItem, idx: number) => {
    const positive = item.changePercent >= 0;
    const flat = isEffectivelyZero(item.changePercent);
    const changeColor = flat
      ? 'text-rh-light-muted dark:text-rh-muted'
      : positive
        ? 'text-rh-green'
        : 'text-rh-red';
    const isSelected = selectedTicker === item.ticker;

    return (
      <button
        key={`${item.ticker}-${idx}`}
        onClick={() => handleItemClick(item.ticker)}
        className={`flex items-center gap-1 shrink-0 cursor-pointer rounded px-1.5 py-0.5 transition-colors duration-100 ${
          isSelected
            ? 'bg-rh-green/15 ring-1 ring-rh-green/30'
            : 'hover:bg-gray-200/50 dark:hover:bg-white/[0.06]'
        }`}
      >
        <span className={`text-[11px] font-semibold whitespace-nowrap ${
          isSelected ? 'text-rh-green' : 'text-rh-light-text dark:text-white/70'
        }`}>
          {item.label || item.ticker}
        </span>
        <span className="text-[11px] font-medium text-rh-light-muted dark:text-white/50 tabular-nums whitespace-nowrap">
          {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${changeColor}`}>
          {flat ? '0.00' : (positive ? '+' : '') + item.changePercent.toFixed(2)}%
        </span>
        <span className="text-[9px] text-rh-light-muted/40 dark:text-white/15 ml-1.5 select-none" aria-hidden="true">
          &bull;
        </span>
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative z-10 overflow-hidden py-1.5
        bg-gray-50/80 dark:bg-black/60
        border-b border-gray-200/60 dark:border-white/[0.04]"
    >
      <div
        className="flex items-center gap-3 ticker-tape-track"
        style={{
          animation: `ticker-scroll ${duration}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
          width: 'max-content',
        }}
      >
        {items.map((item, idx) => renderItem(item, idx))}
        {items.map((item, idx) => renderItem(item, idx + items.length))}
      </div>
    </div>
  );
}
