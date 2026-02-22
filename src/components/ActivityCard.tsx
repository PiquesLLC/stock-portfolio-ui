import { useState, useRef, useEffect } from 'react';
import { ActivityEvent } from '../types';
import { StockLogo } from './StockLogo';

interface ActivityCardProps {
  events: ActivityEvent[]; // All events for this user group
  onUserClick?: (userId: string) => void;
  onTickerClick?: (ticker: string) => void;
  onMute?: (userId: string, displayName: string) => void;
  onReport?: (userId: string, username: string) => void;
  currentUserId?: string;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatValue(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function isSellAction(type: string, payload: { shares?: number; previousShares?: number }): boolean {
  if (type === 'holding_removed') return true;
  if (type === 'holding_updated' && payload.previousShares && payload.shares) {
    return payload.shares < payload.previousShares;
  }
  return false;
}

function getActionInfo(type: string, payload: { shares?: number; previousShares?: number }): {
  verb: string;
  isSell: boolean;
} {
  if (type === 'holding_added') {
    return { verb: 'Bought', isSell: false };
  }
  if (type === 'holding_removed') {
    return { verb: 'Sold', isSell: true };
  }
  if (type === 'holding_updated' && payload.previousShares && payload.shares) {
    const diff = payload.shares - payload.previousShares;
    if (diff > 0) {
      return { verb: 'Added', isSell: false };
    }
    return { verb: 'Sold', isSell: true };
  }
  return { verb: 'Updated', isSell: false };
}

function TradeRow({
  event,
  onTickerClick,
}: {
  event: ActivityEvent;
  onTickerClick?: (ticker: string) => void;
}) {
  const { type, payload } = event;
  const { verb, isSell } = getActionInfo(type, payload);

  // Calculate notional value
  const notionalValue = payload.shares && payload.averageCost
    ? payload.shares * payload.averageCost
    : null;

  // Build details string
  let details = '';
  if (type === 'holding_added' && payload.shares) {
    details = `${payload.shares}`;
  } else if (type === 'holding_updated' && payload.previousShares && payload.shares) {
    const diff = payload.shares - payload.previousShares;
    if (diff > 0) {
      details = `+${diff} → ${payload.shares}`;
    } else {
      details = `${diff} → ${payload.shares}`;
    }
  } else if (type === 'holding_removed') {
    details = 'closed';
  }

  const verbColor = isSell ? 'text-rh-red' : 'text-rh-green';

  return (
    <div className="flex items-center justify-between gap-2 py-2 group/row">
      <div className="flex items-center gap-2 min-w-0">
        <StockLogo ticker={payload.ticker} size="sm" />
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className={`text-[13px] font-semibold ${verbColor}`}>
            {verb}
          </span>
          <button
            onClick={() => onTickerClick?.(payload.ticker)}
            className="text-[14px] font-bold text-rh-light-text dark:text-white hover:text-rh-green transition-colors"
          >
            {payload.ticker}
          </button>
          {details && (
            <>
              <span className="text-rh-light-muted/40 dark:text-white/20">·</span>
              <span className="text-[13px] text-rh-light-muted/60 dark:text-white/40">{details}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {notionalValue && notionalValue > 0 && (
          <span className={`text-[12px] font-medium tabular-nums ${
            isSell ? 'text-rh-red/60' : 'text-rh-green/60'
          }`}>
            {formatValue(notionalValue)}
          </span>
        )}
        <span className="text-[11px] text-rh-light-muted/40 dark:text-white/20 tabular-nums">
          {formatRelativeTime(event.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function ActivityCard({ events, onUserClick, onTickerClick, onMute, onReport, currentUserId }: ActivityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMuteConfirm, setShowMuteConfirm] = useState(false);
  const mutePopupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!showMuteConfirm) return;
    function handleClick(e: MouseEvent) {
      if (mutePopupRef.current && !mutePopupRef.current.contains(e.target as Node)) {
        setShowMuteConfirm(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMuteConfirm]);

  if (events.length === 0) return null;

  const firstEvent = events[0];
  const initials = getInitials(firstEvent.displayName);
  const additionalCount = events.length - 1;

  // Determine avatar color: check if there's a mix of buys and sells
  const hasBuys = events.some(e => !isSellAction(e.type, e.payload));
  const hasSells = events.some(e => isSellAction(e.type, e.payload));
  const isMixed = hasBuys && hasSells;

  // Glassmorphed avatar with buy/sell accent glow
  const glassBase = 'bg-gray-200/60 dark:bg-white/[0.03] backdrop-blur-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]';
  let accentRing = '';
  let avatarTextColor = '';

  if (isMixed) {
    accentRing = 'ring-1 ring-gray-300 dark:ring-white/10';
    avatarTextColor = 'text-gray-600 dark:text-white/70';
  } else if (hasSells) {
    accentRing = 'ring-1 ring-rh-red/25';
    avatarTextColor = 'text-rh-red/80';
  } else {
    accentRing = 'ring-1 ring-rh-green/25';
    avatarTextColor = 'text-rh-green/80';
  }

  const visibleEvents = isExpanded ? events : [firstEvent];

  // Total notional for the group
  const totalNotional = events.reduce((sum, e) => {
    const val = e.payload.shares && e.payload.averageCost
      ? e.payload.shares * e.payload.averageCost
      : 0;
    return sum + val;
  }, 0);

  return (
    <div className="group/card px-4 py-3 hover:bg-rh-light-bg/30 dark:hover:bg-white/[0.015] transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        <button
          onClick={() => onUserClick?.(firstEvent.userId)}
          className="flex-shrink-0 mt-0.5"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center
            text-[11px] font-bold transition-all hover:brightness-125 ${glassBase} ${accentRing} ${avatarTextColor}`}
          >
            {initials}
          </div>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* User name + mute + total value */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 relative">
              <button
                onClick={() => onUserClick?.(firstEvent.userId)}
                className="font-semibold text-[15px] text-rh-light-text dark:text-white hover:underline"
              >
                {firstEvent.displayName}
              </button>
              {onMute && (
                <button
                  onClick={() => setShowMuteConfirm(true)}
                  title={`Mute ${firstEvent.displayName}`}
                  className="opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/[0.06]"
                >
                  <svg className="w-3.5 h-3.5 text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted dark:hover:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                </button>
              )}
              {onReport && currentUserId !== firstEvent.userId && (
                <button
                  onClick={() => onReport(firstEvent.userId, firstEvent.displayName)}
                  title={`Report ${firstEvent.displayName}`}
                  className="opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/[0.06]"
                >
                  <svg className="w-3.5 h-3.5 text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted dark:hover:text-white/50" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-18m0 0l9 4 9-4v12l-9 4-9-4" />
                  </svg>
                </button>
              )}

              {/* Mute confirmation popup */}
              {showMuteConfirm && (
                <div
                  ref={mutePopupRef}
                  className="absolute left-0 top-full mt-1.5 z-50 w-56 rounded-xl overflow-hidden
                    bg-[#1a1a1e]/90 backdrop-blur-2xl border border-white/[0.08]
                    shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)]"
                >
                  <div className="px-3.5 pt-3 pb-2">
                    <p className="text-[13px] font-semibold text-white/90">
                      Mute {firstEvent.displayName}?
                    </p>
                    <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                      Their trades won't appear in your feed. You can unmute anytime from settings.
                    </p>
                  </div>
                  <div className="flex border-t border-white/[0.06]">
                    <button
                      onClick={() => setShowMuteConfirm(false)}
                      className="flex-1 px-3 py-2.5 text-[12px] font-semibold text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
                    >
                      Cancel
                    </button>
                    <div className="w-px bg-white/[0.06]" />
                    <button
                      onClick={() => {
                        onMute?.(firstEvent.userId, firstEvent.displayName);
                        setShowMuteConfirm(false);
                      }}
                      className="flex-1 px-3 py-2.5 text-[12px] font-semibold text-rh-red hover:bg-rh-red/10 transition-colors"
                    >
                      Mute
                    </button>
                  </div>
                </div>
              )}
            </div>
            {totalNotional >= 1000 && events.length > 1 && (
              <span className="text-[11px] text-rh-light-muted/40 dark:text-white/20 tabular-nums">
                {formatValue(totalNotional)} total
              </span>
            )}
          </div>

          {/* Trade rows */}
          <div className="mt-0.5">
            {visibleEvents.map((event) => (
              <TradeRow
                key={event.id}
                event={event}
                onTickerClick={onTickerClick}
              />
            ))}
          </div>

          {/* Expand/collapse button */}
          {additionalCount > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`mt-1 text-[12px] flex items-center gap-1 transition-colors ${
                isExpanded
                  ? 'text-rh-light-muted/45 dark:text-white/25 hover:text-rh-light-muted/60 dark:hover:text-white/40'
                  : 'text-rh-light-muted/60 dark:text-white/40 hover:text-rh-light-muted/80 dark:hover:text-white/60'
              }`}
            >
              {isExpanded ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>+{additionalCount} more trade{additionalCount > 1 ? 's' : ''}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
