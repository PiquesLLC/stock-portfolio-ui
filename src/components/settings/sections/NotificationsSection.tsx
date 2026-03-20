import { ToggleSwitch } from '../ToggleSwitch';
import { HealthStatus, NotificationStatus } from '../../../api';

interface NotificationsSectionProps {
  notifyPriceAlerts: boolean;
  setNotifyPriceAlerts: (v: boolean) => void;
  notifyEarnings: boolean;
  setNotifyEarnings: (v: boolean) => void;
  notifyFollowedActivity: boolean;
  setNotifyFollowedActivity: (v: boolean) => void;
  isAdmin: boolean;
  healthStatus?: HealthStatus | null;
  notifStatus: NotificationStatus | null;
}

export function NotificationsSection({
  notifyPriceAlerts,
  setNotifyPriceAlerts,
  notifyEarnings,
  setNotifyEarnings,
  notifyFollowedActivity,
  setNotifyFollowedActivity,
  isAdmin,
  healthStatus,
  notifStatus,
}: NotificationsSectionProps) {
  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">Alerts</h3>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Price Alerts</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Get notified when price targets are hit</p>
          </div>
          <ToggleSwitch checked={notifyPriceAlerts} onChange={setNotifyPriceAlerts} />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Earnings Alerts</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Get notified before earnings announcements for your holdings</p>
          </div>
          <ToggleSwitch checked={notifyEarnings} onChange={setNotifyEarnings} />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Activity from Followed Users</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Get notified when users you follow make trades</p>
          </div>
          <ToggleSwitch checked={notifyFollowedActivity} onChange={setNotifyFollowedActivity} />
        </label>
      </div>

      {/* Diagnostics — admin only */}
      {isAdmin && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">System Status</h3>
          <div className="space-y-1.5 text-[11px] text-rh-light-muted dark:text-rh-muted">
            {healthStatus?.providers ? Object.entries(healthStatus.providers).map(([name, p]) => {
              const isOk = p.configured && p.lastSuccessMs > 0 && (!p.rateLimitedUntil || p.rateLimitedUntil < Date.now());
              const ago = p.lastSuccessMs > 0 ? Math.round((Date.now() - p.lastSuccessMs) / 60000) : null;
              return (
                <div key={name} className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-rh-green' : 'bg-yellow-400'}`} />
                    <span className="capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                  <span className="text-rh-light-muted/50 dark:text-rh-muted/50">
                    {ago !== null ? `${ago}m ago` : 'Pending'}
                  </span>
                </div>
              );
            }) : (
              <p className="text-rh-light-muted/50 dark:text-rh-muted/50">Loading...</p>
            )}
          </div>
          {/* Notification History */}
          <div className="mt-3 pt-2 border-t border-rh-light-border/20 dark:border-rh-border/20">
            <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-1.5">Last Alerts</p>
            <div className="space-y-1 text-[11px] text-rh-light-muted dark:text-rh-muted">
              <div className="flex justify-between items-center">
                <span>Earnings</span>
                <span className="text-rh-light-muted/50 dark:text-rh-muted/50">
                  {notifStatus?.earnings.lastSentAt
                    ? new Date(notifStatus.earnings.lastSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'No alerts yet'}
                </span>
              </div>
              {notifStatus?.earnings.lastMessage && (
                <p className="text-[10px] text-rh-light-muted/40 dark:text-rh-muted/40 truncate">
                  {notifStatus.earnings.lastMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
