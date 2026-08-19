import { BottleneckMover } from '../api';
import { BottleneckRankDelta } from './BottleneckRankDelta';
import { layerBarColor } from './BottleneckCard';

/**
 * "Moving this week" — the reason to come back to Bottlenecks.
 *
 * The catalog itself changes slowly by design (it is editorial), so without a
 * surface that says WHAT CHANGED, a weekly re-rank is invisible to a returning
 * user. This strip is that surface.
 *
 * Copy rule: this reports ACTIVITY, never merit. "Moving this week" is fine;
 * "strongest", "leaders", "top picks" are not — they read as recommendations.
 */
interface Props {
  movers: BottleneckMover[];
  onOpen: (entryId: string) => void;
}

export function BottleneckMovers({ movers, onOpen }: Props) {
  if (movers.length === 0) return null;

  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-muted dark:text-rh-muted mb-4 pl-6">
        <span className="w-0.5 h-3.5 bg-rh-green rounded-full" />
        Moving this week
      </h2>

      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-transparent backdrop-blur-xl p-4">
        <div className="flex gap-2 flex-wrap">
          {movers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="flex items-center gap-2 rounded-lg border border-gray-200/40 dark:border-white/[0.08] px-3 py-2 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] hover:border-gray-300/60 dark:hover:border-white/[0.15] transition-colors text-left"
            >
              <span
                className="w-1 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: layerBarColor(m.layer) }}
              />
              <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text">
                {m.name}
              </span>
              <span className="text-[11px] font-bold tracking-wide text-rh-green">
                {m.primaryTicker}
              </span>
              <BottleneckRankDelta delta={m.rankDelta} sector={m.sector} />
            </button>
          ))}
        </div>

        {/* "the previous scored week", not "last week": the job diffs against
            the most recent week that actually has scores, which is older
            whenever a week was skipped. */}
        <p className="text-[10px] text-rh-light-text dark:text-white/80 mt-3">
          Change in rank within {movers[0].sector} since the previous scored week. Reflects recent
          price movement and our assessment of the chokepoint — not a recommendation.
        </p>
      </div>
    </div>
  );
}
