import { useEffect, useMemo, useState } from 'react';
import { BottleneckEntry, BottlenecksResponse, getBottlenecks } from '../api';
import { BottleneckCard } from './BottleneckCard';
import { BottleneckHero } from './BottleneckHero';
import { BottleneckDrawer } from './BottleneckDrawer';

let cachedResponse: BottlenecksResponse | null = null;

interface Props {
  onTickerClick: (ticker: string) => void;
}

export function BottlenecksView({ onTickerClick }: Props) {
  const [data, setData] = useState<BottlenecksResponse | null>(cachedResponse);
  const [loading, setLoading] = useState(!cachedResponse);
  const [error, setError] = useState('');
  const [layerFilter, setLayerFilter] = useState<string>('all');
  const [drawerEntry, setDrawerEntry] = useState<BottleneckEntry | null>(null);

  useEffect(() => {
    if (cachedResponse) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getBottlenecks()
      .then((resp) => {
        if (cancelled) return;
        cachedResponse = resp;
        setData(resp);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load bottlenecks');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Layer counts include the featured entry so the chip math is consistent
  // (clicking the featured entry's layer should still show "Lithography · 1" etc.)
  const layerCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    if (data.featured) {
      counts.set(data.featured.layer, 1);
    }
    for (const e of data.entries) {
      counts.set(e.layer, (counts.get(e.layer) || 0) + 1);
    }
    return counts;
  }, [data]);

  const visibleLayers = useMemo(() => {
    if (!data) return [];
    return data.layers.filter((l) => (layerCounts.get(l) || 0) > 0);
  }, [data, layerCounts]);

  // Grid only shows non-featured entries (featured is rendered as the hero above)
  const filtered = useMemo(() => {
    if (!data) return [];
    if (layerFilter === 'all') return data.entries;
    return data.entries.filter((e) => e.layer === layerFilter);
  }, [data, layerFilter]);

  // Hero respects the layer filter — only render when filter is "all" or matches featured's layer
  const showHero = useMemo(() => {
    if (!data?.featured) return false;
    return layerFilter === 'all' || data.featured.layer === layerFilter;
  }, [data, layerFilter]);

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

  const totalCount = (data.featured ? 1 : 0) + data.entries.length;

  const chipBaseClass =
    'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap';
  const chipInactiveClass =
    'border-gray-200/30 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text hover:border-gray-300/50 dark:hover:border-white/[0.18]';
  const chipActiveClass = 'border-rh-green text-rh-green font-bold bg-rh-green/[0.06]';

  return (
    <div>
      {/* Page intro — pl-6 aligns with card's internal content (p-6) */}
      <div className="mb-5 pl-6">
        <h1 className="text-2xl font-bold text-rh-light-text dark:text-rh-text mb-1">
          AI Bottlenecks
        </h1>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          Critical chokepoints in the AI supply chain — where demand is exploding and supply is constrained.
        </p>
      </div>

      {/* Featured hero — gated on layer filter */}
      {showHero && data.featured && (
        <BottleneckHero
          entry={data.featured}
          onOpen={(e) => setDrawerEntry(e)}
          onTickerClick={onTickerClick}
        />
      )}

      {/* Layer filter chips — same inset as page intro so chips align with card content */}
      <div className="flex gap-2 flex-wrap mb-5 pl-6">
        <button
          onClick={() => setLayerFilter('all')}
          className={`${chipBaseClass} ${layerFilter === 'all' ? chipActiveClass : chipInactiveClass}`}
        >
          All · {totalCount}
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
