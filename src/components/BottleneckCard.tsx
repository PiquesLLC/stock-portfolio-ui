import { BottleneckEntry } from '../api';

interface Props {
  entry: BottleneckEntry;
  onOpen: (entry: BottleneckEntry) => void;
  onTickerClick: (ticker: string) => void;
}

const LAYER_BAR_COLORS: Record<string, string> = {
  // AI
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
  // Healthcare
  'GLP-1 & Obesity': '#10B981',
  'CDMO / Bio Manufacturing': '#3B82F6',
  'Gene & Cell Therapy': '#A855F7',
  'Oncology Pipeline': '#F43F5E',
  'Diagnostics & Imaging': '#22D3EE',
  'Medical Devices Surgery': '#6366F1',
  'Generics & Compounding': '#FB923C',
  'Plasma / Blood Products': '#DC2626',
  'Animal Health': '#84CC16',
  'Hospital REITs / Operators': '#64748B',
  // Defense
  Munitions: '#D97706',
  Shipyards: '#1E40AF',
  'Aerospace & Engines': '#475569',
  'Space Launch': '#4F46E5',
  'Rare Earths & Critical Minerals': '#92400E',
  'Cyber & Defense Software': '#059669',
  'Satellites & ISR': '#0891B2',
  'Drones & Autonomous Systems': '#7C3AED',
  'Specialty Metals': '#78716C',
  // Energy (broader sector — distinct from AI's "Energy" layer)
  'LNG Export': '#CA8A04',
  Refining: '#EA580C',
  'Midstream / Pipelines': '#0EA5E9',
  'Oilfield Services': '#7C2D12',
  'E&P Premium Basins': '#A16207',
  'Uranium Fuel Cycle': '#A3E635',
  'Solar Manufacturing': '#FACC15',
  'Inverters / Power Electronics': '#FDBA74',
  Coal: '#525252',
  'Grid Transmission & Equipment': '#0D9488',
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
