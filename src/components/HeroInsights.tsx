import { useState } from 'react';
import { HeroStats, IntelligenceWindow } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  data: HeroStats;
  window?: IntelligenceWindow;
  onTickerClick?: (ticker: string) => void;
}

type StreakMode = 'momentum' | 'deceleration';
type DragMode = 'drag' | 'driver';
type SectorMode = 'driver' | 'drag';

const PERIOD_LABELS: Record<IntelligenceWindow, string> = {
  '1d': 'today',
  '5d': 'this week',
  '1m': 'this month',
};

export function HeroInsights({ data, window: win = '1d', onTickerClick }: Props) {
  const period = PERIOD_LABELS[win];
  const { sectorDriver, sectorDrag, largestDrag, largestDriver, momentum, deceleration } = data;
  const [streakMode, setStreakMode] = useState<StreakMode>('momentum');
  const [dragMode, setDragMode] = useState<DragMode>('drag');
  const [sectorMode, setSectorMode] = useState<SectorMode>('driver');

  const activeStreak = streakMode === 'momentum' ? momentum : deceleration;
  const hasEither = momentum || deceleration;

  // Shared row content — used in both mobile and desktop layouts
  const sectorContent = (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={() => setSectorMode(m => m === 'driver' ? 'drag' : 'driver')}
        className="text-xs sm:text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
        title="Click to toggle between sector driver and sector drag"
      >
        {sectorMode === 'driver' ? (
          <>
            <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
            Sector Driver: {sectorDriver.sector ?? '\u2014'}
          </>
        ) : (
          <>
            <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
            Sector Drag: {sectorDrag.sector ?? '\u2014'}
          </>
        )}
      </button>
      <InfoTooltip text={
        sectorMode === 'driver'
          ? `The sector contributing the most to your gains ${period}.`
          : `The sector dragging your portfolio down the most ${period}.`
      } />
    </div>
  );

  const sectorLabel = sectorMode === 'driver' ? sectorDriver.label : sectorDrag.label;

  const dragContent = (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={() => setDragMode(m => m === 'drag' ? 'driver' : 'drag')}
        className="text-xs sm:text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
        title="Click to toggle between largest drag and largest driver"
      >
        {dragMode === 'drag' ? (
          <>
            <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
            Largest Drag: {largestDrag.ticker ? (
              <span className="text-rh-red hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onTickerClick?.(largestDrag.ticker!); }}>{largestDrag.ticker}</span>
            ) : '\u2014'}
          </>
        ) : (
          <>
            <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
            Largest Driver: {largestDriver.ticker ? (
              <span className="text-rh-green hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onTickerClick?.(largestDriver.ticker!); }}>{largestDriver.ticker}</span>
            ) : '\u2014'}
          </>
        )}
      </button>
      <InfoTooltip text={
        dragMode === 'drag'
          ? `Your biggest losing stock ${period} and how much of your total losses it accounts for.`
          : `Your biggest winning stock ${period} and how much of your total gains it accounts for.`
      } />
    </div>
  );

  const dragLabel = dragMode === 'drag' ? largestDrag.label : largestDriver.label;

  const streakContent = (
    <div className="flex items-center gap-1.5 min-w-0">
      {hasEither ? (
        <button
          onClick={() => setStreakMode(m => m === 'momentum' ? 'deceleration' : 'momentum')}
          className="text-xs sm:text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
          title="Click to toggle between winning and losing streaks"
        >
          {streakMode === 'momentum' ? (
            <>
              <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              </svg>
              Momentum: {activeStreak?.ticker ? (
                <span className="text-rh-green hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onTickerClick?.(activeStreak.ticker!); }}>{activeStreak.ticker}</span>
              ) : '\u2014'}
            </>
          ) : (
            <>
              <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              Deceleration: {activeStreak?.ticker ? (
                <span className="text-rh-red hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onTickerClick?.(activeStreak.ticker!); }}>{activeStreak.ticker}</span>
              ) : '\u2014'}
            </>
          )}
        </button>
      ) : (
        <span className="text-xs sm:text-sm font-semibold text-rh-light-text dark:text-rh-text truncate">
          Momentum: {'\u2014'}
        </span>
      )}
      <InfoTooltip text={
        streakMode === 'momentum'
          ? "The stock in your portfolio on the longest winning streak."
          : "The stock in your portfolio on the longest losing streak."
      } />
    </div>
  );

  const streakLabel = activeStreak ? activeStreak.label : 'Need more snapshot history';

  const sectorBorderColor = sectorMode === 'driver' ? 'border-rh-green/40' : 'border-rh-red/40';
  const dragBorderColor = dragMode === 'drag' ? 'border-rh-red/40' : 'border-rh-green/40';
  const streakBorderColor = streakMode === 'momentum' ? 'border-rh-green/40' : 'border-rh-red/40';

  return (
    <>
      {/* Mobile: single compact card with rows */}
      <div className="md:hidden bg-gray-50/40 dark:bg-white/[0.02] rounded-lg overflow-hidden">
        <div className={`flex items-center justify-between px-3 py-2.5 border-l-2 border-r-2 ${sectorBorderColor}`}>
          <div className="min-w-0 flex-1">
            {sectorContent}
            <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">{sectorLabel}</p>
          </div>
        </div>
        <div className="border-t border-gray-200/30 dark:border-white/[0.04]" />
        <div className={`flex items-center justify-between px-3 py-2.5 border-l-2 border-r-2 ${dragBorderColor}`}>
          <div className="min-w-0 flex-1">
            {dragContent}
            <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">{dragLabel}</p>
          </div>
        </div>
        <div className="border-t border-gray-200/30 dark:border-white/[0.04]" />
        <div className={`flex items-center justify-between px-3 py-2.5 border-l-2 border-r-2 ${streakBorderColor}`}>
          <div className="min-w-0 flex-1">
            {streakContent}
            <p className="text-[11px] text-rh-light-muted dark:text-rh-muted mt-0.5 truncate">{streakLabel}</p>
          </div>
        </div>
      </div>

      {/* Desktop: 3-column grid (unchanged) */}
      <div className="hidden md:grid grid-cols-3 gap-3">
        <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-l-2 ${sectorBorderColor}`}>
          {sectorContent}
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">{sectorLabel}</span>
        </div>
        <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-l-2 border-r-2 ${dragBorderColor}`}>
          {dragContent}
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">{dragLabel}</span>
        </div>
        <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-r-2 ${streakBorderColor}`}>
          {streakContent}
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">{streakLabel}</span>
        </div>
      </div>
    </>
  );
}
