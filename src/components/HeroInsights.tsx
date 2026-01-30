import { useState } from 'react';
import { HeroStats } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  data: HeroStats;
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rh-light-muted dark:text-rh-muted font-medium">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rh-green" />
      </span>
      Live
    </span>
  );
}

type StreakMode = 'momentum' | 'deceleration';
type DragMode = 'drag' | 'driver';
type SectorMode = 'driver' | 'drag';

export function HeroInsights({ data }: Props) {
  const { sectorDriver, sectorDrag, largestDrag, largestDriver, momentum, deceleration } = data;
  const [streakMode, setStreakMode] = useState<StreakMode>('momentum');
  const [dragMode, setDragMode] = useState<DragMode>('drag');
  const [sectorMode, setSectorMode] = useState<SectorMode>('driver');

  const activeStreak = streakMode === 'momentum' ? momentum : deceleration;
  const hasEither = momentum || deceleration;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Sector Driver / Drag (toggleable) */}
      <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px]">
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
                ? "Sector with the highest sum of absolute day P/L across its holdings, as a share of total absolute portfolio movement."
                : "Sector with the most negative day P/L, shown as its share of total sector losses today."
            } />
          </div>
          <LiveBadge />
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {sectorMode === 'driver' ? sectorDriver.label : sectorDrag.label}
        </span>
      </div>

      {/* Largest Drag / Driver (toggleable) */}
      <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px]">
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
                    <span className="text-rh-red">{largestDrag.ticker}</span>
                  ) : '\u2014'}
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                  Largest Driver: {largestDriver.ticker ? (
                    <span className="text-rh-green">{largestDriver.ticker}</span>
                  ) : '\u2014'}
                </>
              )}
            </button>
            <InfoTooltip text={
              dragMode === 'drag'
                ? "Holding with the most negative day P/L, shown as its share of total losses across all losing positions today."
                : "Holding with the most positive day P/L, shown as its share of total gains across all winning positions today."
            } />
          </div>
          <LiveBadge />
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {dragMode === 'drag' ? largestDrag.label : largestDriver.label}
        </span>
      </div>

      {/* Momentum / Deceleration (toggleable) */}
      <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-4 py-3 flex flex-col gap-1 min-h-[72px]">
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
                      <span className="text-rh-green">{activeStreak.ticker}</span>
                    ) : '\u2014'}
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-rh-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                    Deceleration: {activeStreak?.ticker ? (
                      <span className="text-rh-red">{activeStreak.ticker}</span>
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
                ? "Holding with the longest consecutive winning streak (days up in a row), with cumulative gain % over the streak."
                : "Holding with the longest consecutive losing streak (days down in a row), with cumulative loss % over the streak."
            } />
          </div>
          {activeStreak && <LiveBadge />}
        </div>
        <span className="text-xs text-rh-light-muted dark:text-rh-muted">
          {activeStreak ? activeStreak.label : 'Need more snapshot history'}
        </span>
      </div>
    </div>
  );
}
