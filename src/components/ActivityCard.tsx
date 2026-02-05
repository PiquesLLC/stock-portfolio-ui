import { useState } from 'react';
import { ActivityEvent } from '../types';

interface ActivityCardProps {
  events: ActivityEvent[]; // All events for this user group
  onUserClick?: (userId: string) => void;
  onTickerClick?: (ticker: string) => void;
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
      details = `−${Math.abs(diff)} → ${payload.shares}`;
    }
  } else if (type === 'holding_removed') {
    details = 'closed';
  }

  const verbColor = isSell ? 'text-rh-red' : 'text-rh-green';

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[14px] font-medium ${verbColor}`}>
          {verb}
        </span>
        <button
          onClick={() => onTickerClick?.(payload.ticker)}
          className="text-[15px] font-bold text-white hover:text-rh-green transition-colors"
        >
          {payload.ticker}
        </button>
        {details && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-[14px] text-white/50">{details}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {notionalValue && notionalValue >= 1000 && (
          <span className="text-[13px] text-white/40 tabular-nums">
            {formatValue(notionalValue)}
          </span>
        )}
        <span className="text-[13px] text-white/30 tabular-nums">
          · {formatRelativeTime(event.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function ActivityCard({ events, onUserClick, onTickerClick }: ActivityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (events.length === 0) return null;

  const firstEvent = events[0];
  const initials = getInitials(firstEvent.displayName);
  const additionalCount = events.length - 1;

  // Determine avatar color: check if there's a mix of buys and sells
  const hasBuys = events.some(e => !isSellAction(e.type, e.payload));
  const hasSells = events.some(e => isSellAction(e.type, e.payload));
  const isMixed = hasBuys && hasSells;

  // Avatar styling
  let avatarStyle = '';
  let avatarTextColor = '';

  if (isMixed) {
    // Split color - gradient from green to red
    avatarStyle = 'bg-gradient-to-br from-rh-green/30 via-transparent to-rh-red/30 border-white/20';
    avatarTextColor = 'text-white/80';
  } else if (hasSells) {
    avatarStyle = 'bg-gradient-to-br from-rh-red/25 to-rh-red/10 border-rh-red/30';
    avatarTextColor = 'text-rh-red/90';
  } else {
    avatarStyle = 'bg-gradient-to-br from-rh-green/25 to-rh-green/10 border-rh-green/30';
    avatarTextColor = 'text-rh-green/90';
  }

  const visibleEvents = isExpanded ? events : [firstEvent];

  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        {/* Avatar */}
        <button
          onClick={() => onUserClick?.(firstEvent.userId)}
          className="flex-shrink-0"
        >
          <div className={`w-10 h-10 rounded-full border flex items-center justify-center
            text-xs font-bold transition-colors hover:brightness-110 ${avatarStyle} ${avatarTextColor}`}
          >
            {initials}
          </div>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* User name */}
          <button
            onClick={() => onUserClick?.(firstEvent.userId)}
            className="font-semibold text-[15px] text-white hover:underline"
          >
            {firstEvent.displayName}
          </button>

          {/* Trade rows */}
          <div className={`mt-1 ${isExpanded ? 'space-y-1' : ''}`}>
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
              className={`mt-2 text-[13px] flex items-center gap-1 transition-colors ${
                isExpanded
                  ? 'text-white/25 hover:text-white/40'
                  : 'text-white/40 hover:text-white/60'
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
