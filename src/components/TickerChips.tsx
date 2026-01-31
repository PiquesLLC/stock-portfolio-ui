export interface ChipData {
  ticker: string;
  isEtf: boolean;
}

interface TickerChipsProps {
  chips: ChipData[];
  onTickerClick: (ticker: string) => void;
}

export function TickerChips({ chips, onTickerClick }: TickerChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {chips.slice(0, 6).map(({ ticker, isEtf }) => (
        <button
          key={ticker}
          aria-label={`View ${ticker} chart`}
          onClick={(e) => { e.stopPropagation(); onTickerClick(ticker); }}
          className="text-xs font-mono font-medium px-2.5 py-1 min-h-[28px] rounded-full
            bg-rh-light-bg dark:bg-white/[0.06] border border-rh-light-border dark:border-white/[0.08]
            text-rh-light-text dark:text-rh-text
            hover:border-rh-green/40 hover:text-rh-green hover:-translate-y-px
            transition-all duration-150 cursor-pointer flex items-center gap-1.5"
        >
          {ticker}
          {isEtf && (
            <span className="text-[9px] font-sans font-semibold uppercase tracking-wider px-1 py-px rounded
              bg-rh-light-muted/10 dark:bg-white/[0.08] text-rh-light-muted dark:text-rh-muted">
              ETF
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
