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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Sector Driver / Drag (toggleable) */}
      <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-l-2 ${sectorMode === 'driver' ? 'border-l-rh-green/60' : 'border-l-rh-red/60'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSectorMode(m => m === 'driver' ? 'drag' : 'driver')}
              className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
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
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {sectorMode === 'driver' ? sectorDriver.label : sectorDrag.label}
        </span>
      </div>

      {/* Largest Drag / Driver (toggleable) */}
      <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-l-2 border-r-2 ${dragMode === 'drag' ? 'border-l-rh-red/60 border-r-rh-red/60' : 'border-l-rh-green/60 border-r-rh-green/60'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setDragMode(m => m === 'drag' ? 'driver' : 'drag')}
              className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
              title="Click to toggle between largest drag and largest driver"
            >
              {dragMode === 'drag' ? (
                <>
                  <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                  Largest Drag: {largestDrag.ticker ? (
                    <button className="text-rh-red hover:underline" onClick={(e) => { e.stopPropagation(); onTickerClick?.(largestDrag.ticker!); }}>{largestDrag.ticker}</button>
                  ) : '\u2014'}
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                  Largest Driver: {largestDriver.ticker ? (
                    <button className="text-rh-green hover:underline" onClick={(e) => { e.stopPropagation(); onTickerClick?.(largestDriver.ticker!); }}>{largestDriver.ticker}</button>
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
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {dragMode === 'drag' ? largestDrag.label : largestDriver.label}
        </span>
      </div>

      {/* Momentum / Deceleration (toggleable) */}
      <div className={`bg-gray-50/40 dark:bg-white/[0.02] rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px] border-r-2 ${streakMode === 'momentum' ? 'border-r-rh-green/60' : 'border-r-rh-red/60'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {hasEither ? (
              <button
                onClick={() => setStreakMode(m => m === 'momentum' ? 'deceleration' : 'momentum')}
                className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate hover:text-rh-green transition-colors flex items-center gap-1"
                title="Click to toggle between winning and losing streaks"
              >
                {streakMode === 'momentum' ? (
                  <>
                    <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                    </svg>
                    Momentum: {activeStreak?.ticker ? (
                      <button className="text-rh-green hover:underline" onClick={(e) => { e.stopPropagation(); onTickerClick?.(activeStreak.ticker!); }}>{activeStreak.ticker}</button>
                    ) : '\u2014'}
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                    Deceleration: {activeStreak?.ticker ? (
                      <button className="text-rh-red hover:underline" onClick={(e) => { e.stopPropagation(); onTickerClick?.(activeStreak.ticker!); }}>{activeStreak.ticker}</button>
                    ) : '\u2014'}
                  </>
                )}
              </button>
            ) : (
              <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text truncate">
                Momentum: {'\u2014'}
              </span>
            )}
            <InfoTooltip text={
              streakMode === 'momentum'
                ? "The stock in your portfolio on the longest winning streak."
                : "The stock in your portfolio on the longest losing streak."
            } />
          </div>
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {activeStreak ? activeStreak.label : 'Need more snapshot history'}
        </span>
      </div>
    </div>
  );
}
