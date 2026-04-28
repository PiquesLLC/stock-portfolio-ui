import { BottleneckEntry } from '../api';
import { StockLogo } from './StockLogo';
import { layerBarColor } from './BottleneckCard';

interface Props {
  entry: BottleneckEntry;
  onOpen: (entry: BottleneckEntry) => void;
  onTickerClick: (ticker: string) => void;
}

export function BottleneckHero({ entry, onOpen, onTickerClick }: Props) {
  const primaryMetrics = entry.chokepointMetrics.slice(0, 4);

  return (
    <div className="border border-gray-200/10 dark:border-white/[0.04] rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-1 h-3.5 rounded-full"
            style={{ backgroundColor: layerBarColor(entry.layer) }}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-rh-light-text dark:text-rh-text">
            {entry.layer}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-rh-green" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-rh-green">
            ★ Featured
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <StockLogo ticker={entry.primaryTicker} size="lg" />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-rh-light-text dark:text-rh-text leading-tight">
            {entry.name}
          </h2>
          <div
            role="link"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onTickerClick(entry.primaryTicker); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onTickerClick(entry.primaryTicker); } }}
            className="text-sm text-rh-green font-bold cursor-pointer hover:underline mt-0.5 inline-block"
          >
            {entry.primaryTicker}
          </div>
        </div>
      </div>

      <p className="text-[14px] sm:text-[15px] leading-relaxed text-rh-light-text/80 dark:text-rh-text/85 mb-5 max-w-3xl">
        {entry.thesisShort}
      </p>

      {primaryMetrics.length > 0 && (
        <div className="flex gap-6 sm:gap-8 mb-5 flex-wrap">
          {primaryMetrics.map((m, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted font-medium mb-1">
                {m.label}
              </div>
              <div
                className={`text-lg sm:text-xl font-bold ${
                  i === 0
                    ? 'text-rh-green'
                    : 'text-rh-light-text dark:text-rh-text'
                }`}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          {entry.relatedTickers.map((t) => (
            <span
              key={t}
              role="link"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onTickerClick(t); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onTickerClick(t); } }}
              className="text-xs font-bold tracking-wide text-rh-light-text dark:text-rh-text hover:text-rh-green cursor-pointer transition-colors"
            >
              {t}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpen(entry)}
          className="ml-auto text-[13px] font-bold text-rh-green border border-rh-green/60 hover:border-rh-green hover:bg-rh-green/[0.06] rounded-lg px-4 py-2 transition-colors"
        >
          Read full thesis →
        </button>
      </div>
    </div>
  );
}
