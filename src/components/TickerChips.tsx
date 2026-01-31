interface TickerChipsProps {
  tickers: string[];
  onTickerClick: (ticker: string) => void;
}

export function TickerChips({ tickers, onTickerClick }: TickerChipsProps) {
  if (tickers.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {tickers.slice(0, 6).map((ticker) => (
        <button
          key={ticker}
          onClick={(e) => { e.stopPropagation(); onTickerClick(ticker); }}
          className="text-xs font-mono font-medium px-2 py-0.5 rounded-full
            bg-rh-light-bg dark:bg-white/[0.06] border border-rh-light-border dark:border-white/[0.08]
            text-rh-light-text dark:text-rh-text
            hover:border-rh-green/40 hover:text-rh-green
            transition-colors duration-150 cursor-pointer"
        >
          {ticker}
        </button>
      ))}
    </div>
  );
}
