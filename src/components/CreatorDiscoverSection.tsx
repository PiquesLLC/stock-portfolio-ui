import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverCreators, subscribeToCreator, DiscoverCreatorEntry } from '../api';
import { useAuth } from '../context/AuthContext';

type SortOption = 'popular' | 'newest' | 'price_low' | 'price_high' | 'performance';

const SORT_ORDER: SortOption[] = ['performance', 'popular', 'newest', 'price_low', 'price_high'];

const SORT_LABELS: Record<SortOption, string> = {
  performance: 'Top Performers',
  popular: 'Popular',
  newest: 'Newest',
  price_low: 'Price: Low \u2192 High',
  price_high: 'Price: High \u2192 Low',
};

function trackEvent(name: string, props?: Record<string, unknown>) {
  console.log('[Analytics]', name, props);
}

interface CreatorDiscoverSectionProps {
  onUserClick?: (userId: string) => void;
}

export function CreatorDiscoverSection({ onUserClick }: CreatorDiscoverSectionProps) {
  const { isAuthenticated } = useAuth();
  const [creators, setCreators] = useState<DiscoverCreatorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const [sort, setSort] = useState<SortOption>('performance');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Fetch creators
  const fetchCreators = useCallback(async (cursor?: string) => {
    try {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const data = await discoverCreators({
        limit: 20,
        cursor,
        sort,
        search: debouncedSearch || undefined,
      });

      if (!mountedRef.current) return;

      if (cursor) {
        setCreators(prev => [...prev, ...data.creators]);
      } else {
        setCreators(data.creators);
        if (data.total != null) setTotal(data.total);
      }
      setNextCursor(data.nextCursor);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load creators');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [sort, debouncedSearch]);

  useEffect(() => {
    mountedRef.current = true;
    fetchCreators();
    return () => { mountedRef.current = false; };
  }, [fetchCreators]);

  // Analytics: page view
  useEffect(() => {
    trackEvent('discovery_page_view');
  }, []);

  // Analytics: filter change
  useEffect(() => {
    if (!loading) {
      trackEvent('discovery_filter_change', { sort, search: debouncedSearch });
    }
  }, [sort, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchCreators(nextCursor);
    }
  };

  const handleSubscribe = async (creator: DiscoverCreatorEntry) => {
    if (!isAuthenticated) {
      // Save return destination and prompt login
      window.location.hash = 'tab=discover&subtab=creators';
      window.location.reload();
      return;
    }

    trackEvent('discovery_subscribe_click', { userId: creator.userId, pricingCents: creator.pricingCents });
    setSubscribingId(creator.userId);
    try {
      const { url } = await subscribeToCreator(creator.userId);
      window.location.href = url;
    } catch (err) {
      setSubscribingId(null);
    }
  };

  const handleViewCreator = (creator: DiscoverCreatorEntry) => {
    trackEvent('discovery_card_click', { userId: creator.userId });
    onUserClick?.(creator.userId);
  };

  const hasFilters = sort !== 'performance' || debouncedSearch.length > 0;

  const resetFilters = () => {
    setSort('performance');
    setSearch('');
    setDebouncedSearch('');
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <FilterBar
          sort={sort}
          onSortChange={setSort}
          search={search}
          onSearchChange={setSearch}
          hasFilters={hasFilters}
          onReset={resetFilters}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <FilterBar
          sort={sort}
          onSortChange={setSort}
          search={search}
          onSearchChange={setSearch}
          hasFilters={hasFilters}
          onReset={resetFilters}
        />
        <div className="text-center py-16">
          <div className="text-rh-light-muted dark:text-rh-muted text-4xl mb-3">!</div>
          <p className="text-rh-light-text dark:text-rh-text font-medium mb-1">Couldn't load creators</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted mb-4">{error}</p>
          <button
            onClick={() => fetchCreators()}
            className="px-4 py-2 bg-rh-green hover:bg-rh-green/90 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (creators.length === 0) {
    return (
      <div className="space-y-4">
        <FilterBar
          sort={sort}
          onSortChange={setSort}
          search={search}
          onSearchChange={setSearch}
          hasFilters={hasFilters}
          onReset={resetFilters}
        />
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-60">
            <svg className="w-12 h-12 mx-auto text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-rh-light-text dark:text-rh-text font-semibold mb-1">
            {debouncedSearch ? 'No matching creators' : 'No creators yet'}
          </p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            {debouncedSearch
              ? 'Try a different search term or reset filters.'
              : 'Be the first to share your portfolio insights.'}
          </p>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="mt-4 text-sm text-rh-green hover:text-rh-green/80 font-medium transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={setSearch}
        hasFilters={hasFilters}
        onReset={resetFilters}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {creators.map(creator => (
          <CreatorCard
            key={creator.userId}
            creator={creator}
            onView={() => handleViewCreator(creator)}
            onSubscribe={() => handleSubscribe(creator)}
            subscribing={subscribingId === creator.userId}
          />
        ))}
      </div>

      {/* Load more / end of list */}
      <div className="text-center pt-2 pb-4">
        {nextCursor ? (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg text-sm font-medium text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        ) : creators.length > 0 ? (
          <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
            You've seen all {total != null && total > 0 ? total : creators.length} creators
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Filter Bar ─── */

function FilterBar({
  sort,
  onSortChange,
  search,
  onSearchChange,
  hasFilters,
  onReset,
}: {
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  search: string;
  onSearchChange: (s: string) => void;
  hasFilters: boolean;
  onReset: () => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  return (
    <div className="sticky top-[90px] sm:top-[52px] z-20 py-2 -my-2 bg-rh-light-bg dark:bg-[#050505]">
    <div className="flex flex-wrap items-center gap-2">
      {/* Sort dropdown */}
      <div className="relative" ref={sortRef}>
        <button
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg text-xs font-medium text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          Sort: {SORT_LABELS[sort]}
          <svg className={`w-3 h-3 transition-transform ${sortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {sortOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1a1a1e]/95 border border-gray-200 dark:border-white/[0.08] rounded-xl shadow-2xl py-1 min-w-[180px] z-30">
            {SORT_ORDER.map(key => (
              <button
                key={key}
                onClick={() => { onSortChange(key); setSortOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  sort === key
                    ? 'text-rh-green font-semibold bg-rh-green/[0.06]'
                    : 'text-rh-light-text dark:text-rh-text/80 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative flex-1 w-full sm:w-auto min-w-0 sm:min-w-[160px] sm:max-w-[280px]">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search creators..."
          maxLength={100}
          className="w-full pl-8 pr-3 py-1.5 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg text-xs text-rh-light-text dark:text-rh-text placeholder:text-rh-light-muted dark:placeholder:text-rh-muted focus:outline-none focus:ring-1 focus:ring-rh-green/40 focus:border-rh-green/40"
        />
      </div>

      {hasFilters && (
        <button
          onClick={onReset}
          className="text-xs text-rh-green hover:text-rh-green/80 font-medium transition-colors"
        >
          Reset
        </button>
      )}
    </div>
    </div>
  );
}

/* ─── Streak Logic ─── */

type StreakState =
  | { kind: 'hot'; days: number }
  | { kind: 'cold'; days: number }
  | { kind: 'flat' }
  | { kind: 'new' }
  | { kind: 'stale' }
  | { kind: 'hidden' };

function getStreakState(creator: DiscoverCreatorEntry): StreakState {
  // Non-creator without performance data: hide
  if (!creator.isCreator && creator.returnPct == null) return { kind: 'hidden' };

  // Fewer than 6 data points
  if (creator.dataPointCount != null && creator.dataPointCount < 6) return { kind: 'new' };

  // Stale data (>48h old)
  if (creator.lastUpdatedAt) {
    const age = Date.now() - new Date(creator.lastUpdatedAt).getTime();
    if (age > 48 * 60 * 60 * 1000) return { kind: 'stale' };
  }

  // No streak data from API yet
  if (creator.rolling5dPct == null || creator.streakDays == null) return { kind: 'new' };

  const r5d = creator.rolling5dPct;
  const days = creator.streakDays;

  if (r5d >= 0.02 && days >= 2) return { kind: 'hot', days };
  if (r5d <= -0.02 && days >= 2) return { kind: 'cold', days };
  return { kind: 'flat' };
}

function StreakChip({ state }: { state: StreakState }) {
  if (state.kind === 'hidden') {
    return <span className="rounded-md border border-gray-200/60 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-300 dark:text-zinc-600">&nbsp;</span>;
  }
  if (state.kind === 'new') {
    return <span className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-400 dark:text-zinc-400">New</span>;
  }
  if (state.kind === 'stale') {
    return <span className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-400 dark:text-zinc-400">Awaiting update</span>;
  }
  if (state.kind === 'hot') {
    return <span className="rounded-md border border-rh-green/30 bg-rh-green/10 px-2 py-1 text-[11px] text-rh-green font-medium">Hot streak &middot; {state.days}d</span>;
  }
  if (state.kind === 'cold') {
    return <span className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-500 dark:text-rose-400 font-medium">Cold streak &middot; {state.days}d</span>;
  }
  // flat
  return <span className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-500 dark:text-zinc-300">Flat this week</span>;
}

/* ─── Section Summary ─── */

const SECTION_LABELS: Record<string, string> = {
  holdings: 'Shows holdings',
  tradeHistory: 'Trade history',
  rationale: 'Why they trade',
  riskMetrics: 'Risk analysis',
};

function sectionSummary(sections: string[]): string | null {
  if (sections.length === 0) return null;
  const labels = sections.map(s => SECTION_LABELS[s] ?? s).map(l => l.toLowerCase());
  if (labels.length === 1) return labels[0].charAt(0).toUpperCase() + labels[0].slice(1);
  const last = labels.pop()!;
  return (labels.join(', ') + ' & ' + last).replace(/^./, c => c.toUpperCase());
}

/* ─── Creator Card ─── */

function CreatorCard({
  creator,
  onView,
  onSubscribe,
  subscribing,
}: {
  creator: DiscoverCreatorEntry;
  onView: () => void;
  onSubscribe: () => void;
  subscribing: boolean;
}) {
  const ret = creator.returnPct ?? null;
  const retUp = (ret ?? 0) >= 0;
  const streak = getStreakState(creator);

  // Chip 1: Pricing
  const pricingChip = creator.pricingCents != null && creator.pricingCents > 0
    ? { label: `$${(creator.pricingCents / 100).toFixed(creator.pricingCents % 100 === 0 ? 0 : 2)}/mo`, accent: false }
    : { label: 'Free', accent: true };

  // Chip 2: Status
  const statusChip = creator.isCreator
    ? (creator.subscriberCount > 0
      ? `${creator.subscriberCount} subscriber${creator.subscriberCount !== 1 ? 's' : ''}`
      : 'New creator')
    : 'Public profile';

  // Section summary line
  const sections = sectionSummary(creator.sectionsUnlocked);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-zinc-950/80 p-5 dark:backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-rh-green/40 flex flex-col">
      {/* Glow effects (dark mode only) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 dark:opacity-70">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rh-green/10 blur-3xl transition group-hover:bg-rh-green/20" />
      </div>
      {/* Top gradient strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rh-green/0 via-rh-green/20 dark:via-rh-green/60 to-rh-green/0" />

      <div className="relative flex flex-col flex-1">
        {/* Row 1: Name/handle + performance */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-rh-light-text dark:text-white truncate">
                {creator.displayName || creator.username}
              </h3>
              {creator.isVerified && (
                <span className="flex-shrink-0 rounded-full border border-rh-green/40 bg-rh-green/10 px-2 py-0.5 text-[10px] font-medium text-rh-green">
                  Verified
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-zinc-400">@{creator.username}</p>
          </div>

          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-bold ${ret == null ? 'text-gray-400 dark:text-zinc-500' : retUp ? 'text-rh-green' : 'text-rh-red'}`}>
              {ret == null ? 'New' : `${retUp ? '+' : ''}${ret.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-500">
              {ret == null ? 'creator' : '1M performance'}
            </p>
          </div>
        </div>

        {/* Row 2: Thesis (or placeholder) */}
        <div className="mb-4 min-h-[40px]">
          {creator.pitch ? (
            <p className="text-sm text-gray-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
              {creator.pitch}
            </p>
          ) : (
            <span className="inline-block rounded-lg bg-gray-100 dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-400 dark:text-zinc-500 italic">
              New creator — no pitch yet
            </span>
          )}
          {sections && (
            <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">
              {sections}
            </p>
          )}
        </div>

        {/* Row 3: 3 status chips (always rendered) */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Chip 1: Pricing */}
          {pricingChip.accent ? (
            <span className="rounded-md border border-rh-green/30 bg-rh-green/10 px-2 py-1 text-[11px] font-medium text-rh-green">
              Free
            </span>
          ) : (
            <span className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-600 dark:text-zinc-300">
              {pricingChip.label}
            </span>
          )}

          {/* Chip 2: Subscribers / Status */}
          <span className="rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2 py-1 text-[11px] text-gray-600 dark:text-zinc-300">
            {statusChip}
          </span>

          {/* Chip 3: Streak */}
          <StreakChip state={streak} />
        </div>

        {/* Row 4: CTA row (fixed height) */}
        <div className="flex gap-2 mt-auto">
          <button
            onClick={onView}
            className="flex-1 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-50 dark:bg-white/5 px-3 py-2 text-sm font-medium text-rh-light-text dark:text-white transition hover:bg-gray-100 dark:hover:bg-white/10"
          >
            See strategy
          </button>
          {creator.isCreator && (
            <button
              onClick={onSubscribe}
              disabled={subscribing}
              className="rounded-lg border border-rh-green/40 px-4 py-2 text-sm font-semibold text-rh-green transition hover:bg-rh-green hover:text-black disabled:opacity-50"
            >
              {subscribing ? 'Redirecting...' : 'Subscribe'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─── Skeleton Card ─── */

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-zinc-950/80 p-5 animate-pulse">
      {/* Gradient strip skeleton */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent" />

      {/* Row 1: name + metric */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-2/3" />
          <div className="h-3.5 bg-gray-200 dark:bg-white/[0.06] rounded w-1/3" />
        </div>
        <div className="space-y-1.5 flex-shrink-0">
          <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-16 ml-auto" />
          <div className="h-3 bg-gray-200 dark:bg-white/[0.06] rounded w-20 ml-auto" />
        </div>
      </div>

      {/* Row 2: pitch */}
      <div className="mb-4 min-h-[40px] space-y-1.5">
        <div className="h-3.5 bg-gray-200 dark:bg-white/[0.06] rounded w-full" />
        <div className="h-3.5 bg-gray-200 dark:bg-white/[0.06] rounded w-4/5" />
      </div>

      {/* Row 3: 3 chips */}
      <div className="mb-5 flex gap-2">
        <div className="h-6 bg-gray-200 dark:bg-white/[0.06] rounded-md w-14" />
        <div className="h-6 bg-gray-200 dark:bg-white/[0.06] rounded-md w-20" />
        <div className="h-6 bg-gray-200 dark:bg-white/[0.06] rounded-md w-24" />
      </div>

      {/* Row 4: CTAs */}
      <div className="flex gap-2">
        <div className="flex-1 h-9 bg-gray-200 dark:bg-white/[0.06] rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 dark:bg-white/[0.06] rounded-lg" />
      </div>
    </div>
  );
}

export default CreatorDiscoverSection;
