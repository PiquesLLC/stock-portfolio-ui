import { useMemo } from 'react';

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

export function TickerTape({ holdings, indices, onTickerClick }: TickerTapeProps) {
  // Build the tape: indices first, then holdings (deduplicate by ticker)
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: TickerTapeItem[] = [];

    for (const idx of indices) {
      const key = idx.ticker.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(idx);
      }
    }

    for (const h of holdings) {
      const key = h.ticker.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(h);
      }
    }

    return result;
  }, [holdings, indices]);

  if (items.length === 0) return null;

  // Scale animation duration based on item count (roughly 3s per item, min 20s, max 60s)
  const duration = Math.min(Math.max(items.length * 3, 20), 60);

  const renderItem = (item: TickerTapeItem, idx: number) => {
    const positive = item.changePercent >= 0;
    const flat = isEffectivelyZero(item.changePercent);
    const changeColor = flat
      ? 'text-rh-light-muted dark:text-rh-muted'
      : positive
        ? 'text-rh-green'
        : 'text-rh-red';

    return (
      <button
        key={`${item.ticker}-${idx}`}
        onClick={() => onTickerClick(item.ticker)}
        className="flex items-center gap-1 shrink-0 cursor-pointer
          hover:bg-gray-200/50 dark:hover:bg-white/[0.06] rounded px-1.5 py-0.5
          transition-colors duration-100"
      >
        <span className="text-[11px] font-semibold text-rh-light-text dark:text-white/70 whitespace-nowrap">
          {item.label || item.ticker}
        </span>
        <span className="text-[11px] font-medium text-rh-light-muted dark:text-white/50 tabular-nums whitespace-nowrap">
          {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${changeColor}`}>
          {flat ? '0.00' : (positive ? '+' : '') + item.changePercent.toFixed(2)}%
        </span>
        {/* Dot divider */}
        <span className="text-[9px] text-rh-light-muted/40 dark:text-white/15 ml-1.5 select-none" aria-hidden="true">
          &bull;
        </span>
      </button>
    );
  };

  return (
    <div
      className="relative z-10 overflow-hidden py-1.5
        bg-gray-50/80 dark:bg-black/60
        border-b border-gray-200/60 dark:border-white/[0.04]"
    >
      <div
        className="flex items-center gap-3 ticker-tape-track"
        style={{
          animation: `ticker-scroll ${duration}s linear infinite`,
          width: 'max-content',
        }}
      >
        {/* First pass */}
        {items.map((item, idx) => renderItem(item, idx))}
        {/* Duplicate for seamless loop */}
        {items.map((item, idx) => renderItem(item, idx + items.length))}
      </div>
    </div>
  );
}
