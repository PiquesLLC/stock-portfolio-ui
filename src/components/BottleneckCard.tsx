import { BottleneckEntry } from '../api';

interface Props {
  entry: BottleneckEntry;
  onOpen: (entry: BottleneckEntry) => void;
  onTickerClick: (ticker: string) => void;
}

const LAYER_BAR_COLORS: Record<string, string> = {
  Compute: '#00C805',
  Lithography: '#8B5CF6',
  Memory: '#06B6D4',
  Foundry: '#EC4899',
  'Advanced Packaging': '#F472B6',
  'Power & Cooling': '#F59E0B',
  Networking: '#38BDF8',
  Optical: '#14B8A6',
  EDA: '#A78BFA',
  Energy: '#FBBF24',
};

export function layerBarColor(layer: string): string {
  return LAYER_BAR_COLORS[layer] || '#9b9b9b';
}

export function BottleneckCard({ entry, onOpen, onTickerClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="group text-left border border-gray-200/10 dark:border-white/[0.04] rounded-2xl p-6 hover:border-gray-300/30 dark:hover:border-white/[0.12] transition-colors w-full"
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-1 h-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: layerBarColor(entry.layer) }}
        />
        <span className="text-[11px] font-bold uppercase tracking-wider text-rh-light-text dark:text-rh-text">
          {entry.layer}
        </span>
      </div>

      <h3 className="text-base font-semibold text-rh-light-text dark:text-rh-text mb-1">
        {entry.name}
      </h3>

      <div className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">
        Primary:{' '}
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onTickerClick(entry.primaryTicker); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onTickerClick(entry.primaryTicker); } }}
          className="text-rh-green font-bold cursor-pointer hover:underline"
        >
          {entry.primaryTicker}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-rh-light-muted dark:text-rh-text/70 mb-4 line-clamp-3">
        {entry.thesisShort}
      </p>

      {entry.relatedTickers.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {entry.relatedTickers.slice(0, 4).map((t) => (
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
      )}
    </button>
  );
}
