import { useMemo, useState, useCallback, useRef, useEffect } from 'react';

export interface TickerTapeItem {
  ticker: string;
  label?: string;
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

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(pct: number): string {
  if (isEffectivelyZero(pct)) return '0.00%';
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function changeColorClass(pct: number): string {
  if (isEffectivelyZero(pct)) return 'text-rh-light-muted dark:text-rh-muted';
  return pct >= 0 ? 'text-rh-green' : 'text-rh-red';
}

/**
 * Individual ticker item — updates price/change via refs to avoid
 * re-rendering the parent (which would reset the CSS scroll animation).
 */
function TickerItem({ item, isSelected, onClick }: {
  item: TickerTapeItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const priceRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLSpanElement>(null);

  // Update text + color in-place when data changes — no parent re-render
  useEffect(() => {
    if (priceRef.current) {
      priceRef.current.textContent = formatPrice(item.price);
    }
    if (changeRef.current) {
      changeRef.current.textContent = formatChange(item.changePercent);
      // Update color class
      const el = changeRef.current;
      el.classList.remove('text-rh-green', 'text-rh-red', 'text-rh-light-muted', 'dark:text-rh-muted');
      const cls = changeColorClass(item.changePercent);
      cls.split(' ').forEach(c => el.classList.add(c));
    }
  }, [item.price, item.changePercent]);

  return (
    <button
      onClick={onClick}
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
      <span
        ref={priceRef}
        className="text-[11px] font-medium text-rh-light-muted dark:text-white/50 tabular-nums whitespace-nowrap"
      >
        {formatPrice(item.price)}
      </span>
      <span
        ref={changeRef}
        className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${changeColorClass(item.changePercent)}`}
      >
        {formatChange(item.changePercent)}
      </span>
      <span className="text-[9px] text-rh-light-muted/40 dark:text-white/15 ml-1.5 select-none" aria-hidden="true">
        &bull;
      </span>
    </button>
  );
}

export function TickerTape({ holdings, indices, onTickerClick }: TickerTapeProps) {
  const isDesktop = useIsDesktop();
  const [paused, setPaused] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build stable ticker list — only changes when tickers are added/removed, NOT on price updates
  const tickerKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    if (!isDesktop) {
      for (const idx of indices) {
        const key = idx.ticker.toUpperCase();
        if (!seen.has(key)) { seen.add(key); keys.push(key); }
      }
    }
    for (const h of holdings) {
      const key = h.ticker.toUpperCase();
      if (isDesktop && INDEX_TICKERS.has(key)) continue;
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
    }
    return keys;
  }, [
    // Only recompute when the SET of tickers changes, not prices
    // eslint-disable-next-line react-hooks/exhaustive-deps
    holdings.map(h => h.ticker).join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    indices.map(i => i.ticker).join(','),
    isDesktop,
  ]);

  // Live lookup map — updated every render but doesn't trigger list rebuild
  const dataMap = useMemo(() => {
    const map = new Map<string, TickerTapeItem>();
    for (const idx of indices) map.set(idx.ticker.toUpperCase(), idx);
    for (const h of holdings) map.set(h.ticker.toUpperCase(), h);
    return map;
  }, [holdings, indices]);

  const handleItemClick = useCallback((ticker: string) => {
    if (isDesktop) {
      onTickerClick(ticker);
      return;
    }
    if (selectedTicker === ticker) {
      setSelectedTicker(null);
      setPaused(false);
      onTickerClick(ticker);
    } else {
      setSelectedTicker(ticker);
      setPaused(true);
    }
  }, [isDesktop, selectedTicker, onTickerClick]);

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

  if (tickerKeys.length === 0) return null;

  const duration = Math.min(Math.max(tickerKeys.length * 3, 20), 60);

  const renderItem = (ticker: string, idx: number) => {
    const item = dataMap.get(ticker);
    if (!item) return null;
    return (
      <TickerItem
        key={`${ticker}-${idx}`}
        item={item}
        isSelected={selectedTicker === ticker}
        onClick={() => handleItemClick(ticker)}
      />
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
          animationName: 'ticker-scroll',
          animationDuration: `${duration}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          animationPlayState: paused ? 'paused' : 'running',
          width: 'max-content',
        }}
      >
        {tickerKeys.map((t, i) => renderItem(t, i))}
        {tickerKeys.map((t, i) => renderItem(t, i + tickerKeys.length))}
      </div>
    </div>
  );
}
