import { useEffect, useMemo, useState } from 'react';
import { BottleneckEntry, BottlenecksResponse, getBottlenecks } from '../api';
import { BottleneckCard } from './BottleneckCard';
import { BottleneckHero } from './BottleneckHero';
import { BottleneckDrawer } from './BottleneckDrawer';

let cachedResponse: BottlenecksResponse | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Props {
  onTickerClick: (ticker: string) => void;
}

const SECTOR_BLURB: Record<string, string> = {
  AI: 'Critical chokepoints in the AI supply chain — where demand is exploding and supply is constrained.',
  Healthcare: 'GLP-1 capacity, CDMO crunch, gene-therapy manufacturing, and the medical devices that doctors physically cannot replace.',
  Defense: 'Munitions production, shipyards, rare-earth processing, and the geopolitical chokepoints reshaping the defense buildout.',
  Energy: 'LNG export terminals, refining capacity, premium-basin E&P, midstream rights-of-way, and the assets that move every BTU.',
};

export function BottlenecksView({ onTickerClick }: Props) {
  const [data, setData] = useState<BottlenecksResponse | null>(cachedResponse);
  const [loading, setLoading] = useState(!cachedResponse);
  const [error, setError] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('AI');
  const [layerFilter, setLayerFilter] = useState<string>('all');
  const [drawerEntry, setDrawerEntry] = useState<BottleneckEntry | null>(null);

  useEffect(() => {
    // Honor the in-memory cache only while it's still fresh (5 min). Lets the
    // user pick up newly-populated sectors after a reload without a hard refresh.
    if (cachedResponse && Date.now() - cachedAt < CACHE_TTL_MS) {
      setData(cachedResponse);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    getBottlenecks()
      .then((resp) => {
        if (cancelled) return;
        cachedResponse = resp;
        cachedAt = Date.now();
        setData(resp);
        // Functional setState: only fall back if the user's current sector isn't in the response
        setSectorFilter((cur) =>
          resp.sectors.includes(cur) ? cur : (resp.sectors[0] || cur),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load bottlenecks');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset layer filter when sector changes
  const handleSectorChange = (sector: string) => {
    setSectorFilter(sector);
    setLayerFilter('all');
  };

  // Entries scoped to the current sector (non-featured only — featured is the hero)
  const sectorEntries = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((e) => e.sector === sectorFilter);
  }, [data, sectorFilter]);

  const sectorFeatured = useMemo(() => {
    if (!data) return null;
    return data.featured[sectorFilter] || null;
  }, [data, sectorFilter]);

  // Layer counts for the current sector — include the featured entry
  const layerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (sectorFeatured) {
      counts.set(sectorFeatured.layer, 1);
    }
    for (const e of sectorEntries) {
      counts.set(e.layer, (counts.get(e.layer) || 0) + 1);
    }
    return counts;
  }, [sectorEntries, sectorFeatured]);

  // Visible layer chips: only sector-relevant layers with > 0 entries
  const visibleLayers = useMemo(() => {
    if (!data) return [];
    return data.layers.filter((l) => (layerCounts.get(l) || 0) > 0);
  }, [data, layerCounts]);

  // Grid: non-featured entries in current sector, filtered by layer
  const filtered = useMemo(() => {
    if (layerFilter === 'all') return sectorEntries;
    return sectorEntries.filter((e) => e.layer === layerFilter);
  }, [sectorEntries, layerFilter]);

  // Hero respects the layer filter
  const showHero = useMemo(() => {
    if (!sectorFeatured) return false;
    return layerFilter === 'all' || sectorFeatured.layer === layerFilter;
  }, [sectorFeatured, layerFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          {error || 'No bottleneck data available'}
        </p>
      </div>
    );
  }

  const sectorTotal = (sectorFeatured ? 1 : 0) + sectorEntries.length;

  const chipBaseClass =
    'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap';
  const chipInactiveClass =
    'border-gray-200/30 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text hover:border-gray-300/50 dark:hover:border-white/[0.18]';
  const chipActiveClass = 'border-rh-green text-rh-green font-bold bg-rh-green/[0.06]';

  const sectorTabBaseClass =
    'px-4 py-2 text-sm font-bold tracking-wide transition-colors border-b-2 -mb-px whitespace-nowrap';
  const sectorTabActiveClass = 'text-rh-light-text dark:text-rh-text border-rh-green';
  const sectorTabInactiveClass =
    'text-rh-light-muted dark:text-rh-muted border-transparent hover:text-rh-light-text dark:hover:text-rh-text';

  return (
    <div>
      {/* Page intro — pl-6 aligns with card's internal content (p-6) */}
      <div className="mb-4 pl-6">
        <h1 className="text-2xl font-bold text-rh-light-text dark:text-rh-text mb-1">
          Bottlenecks
        </h1>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          {SECTOR_BLURB[sectorFilter] || SECTOR_BLURB.AI}
        </p>
      </div>

      {/* Sector tabs (outer level) */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-gray-200/40 dark:border-white/[0.04] mb-5 pl-6">
        {data.sectors.map((sector) => (
          <button
            key={sector}
            onClick={() => handleSectorChange(sector)}
            className={`${sectorTabBaseClass} ${
              sectorFilter === sector ? sectorTabActiveClass : sectorTabInactiveClass
            }`}
          >
            {sector}
          </button>
        ))}
      </div>

      {/* Featured hero — gated on layer filter */}
      {showHero && sectorFeatured && (
        <BottleneckHero
          entry={sectorFeatured}
          onOpen={(e) => setDrawerEntry(e)}
          onTickerClick={onTickerClick}
        />
      )}

      {/* Layer filter chips (inner level) */}
      <div className="flex gap-2 flex-wrap mb-5 pl-6">
        <button
          onClick={() => setLayerFilter('all')}
          className={`${chipBaseClass} ${layerFilter === 'all' ? chipActiveClass : chipInactiveClass}`}
        >
          All · {sectorTotal}
        </button>
        {visibleLayers.map((layer) => (
          <button
            key={layer}
            onClick={() => setLayerFilter(layer)}
            className={`${chipBaseClass} ${layerFilter === layer ? chipActiveClass : chipInactiveClass}`}
          >
            {layer}
          </button>
        ))}
      </div>

      {/* Grid of cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <BottleneckCard
              key={entry.id}
              entry={entry}
              onOpen={(e) => setDrawerEntry(e)}
              onTickerClick={onTickerClick}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-rh-light-muted dark:text-rh-muted">
          No bottlenecks found in this layer.
        </div>
      )}

      {/* Detail drawer */}
      <BottleneckDrawer
        entry={drawerEntry}
        open={drawerEntry !== null}
        onClose={() => setDrawerEntry(null)}
        onTickerClick={onTickerClick}
      />
    </div>
  );
}
