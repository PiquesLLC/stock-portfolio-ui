import { ActivityEvent } from '../types';

interface ActivityCardProps {
  event: ActivityEvent;
  showUser?: boolean;
  onUserClick?: (userId: string) => void;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function getEventIcon(type: string): { icon: string; color: string } {
  switch (type) {
    case 'holding_added':
      return { icon: '+', color: 'bg-rh-green/20 text-rh-green' };
    case 'holding_removed':
      return { icon: '-', color: 'bg-rh-red/20 text-rh-red' };
    case 'holding_updated':
      return { icon: '~', color: 'bg-blue-500/20 text-blue-400' };
    default:
      return { icon: '?', color: 'bg-gray-500/20 text-gray-400' };
  }
}

function getEventDescription(event: ActivityEvent): string {
  const { type, payload } = event;
  switch (type) {
    case 'holding_added':
      return `Added ${payload.shares} shares of ${payload.ticker}`;
    case 'holding_removed':
      return `Removed ${payload.ticker}`;
    case 'holding_updated':
      if (payload.previousShares && payload.shares) {
        const diff = payload.shares - payload.previousShares;
        if (diff > 0) return `Added ${diff} shares of ${payload.ticker} (now ${payload.shares})`;
        if (diff < 0) return `Sold ${Math.abs(diff)} shares of ${payload.ticker} (now ${payload.shares})`;
        return `Updated ${payload.ticker} position`;
      }
      return `Updated ${payload.ticker}`;
    default:
      return 'Portfolio activity';
  }
}

export function ActivityCard({ event, showUser = true, onUserClick }: ActivityCardProps) {
  const { icon, color } = getEventIcon(event.type);

  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        {showUser && (
          <button
            onClick={() => onUserClick?.(event.userId)}
            className="text-sm font-medium text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
          >
            {event.displayName}
          </button>
        )}
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">
          {getEventDescription(event)}
        </p>
      </div>
      <span className="text-xs text-rh-light-muted dark:text-rh-muted flex-shrink-0">
        {formatRelativeTime(event.createdAt)}
      </span>
    </div>
  );
}
