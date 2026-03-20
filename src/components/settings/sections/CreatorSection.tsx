import { useState, useEffect } from 'react';
import { getCreatorProfile } from '../../../api';
import { CreatorProfile } from '../../../types';
import { CreatorSubscriptionManager } from '../../CreatorSubscriptionManager';

interface CreatorSectionProps {
  userId: string;
  onCreatorNavigate: (view: 'dashboard' | 'settings') => void;
}

export function CreatorSection({ userId, onCreatorNavigate }: CreatorSectionProps) {
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    getCreatorProfile(userId).then(setCreatorProfile).catch(() => setCreatorProfile(null));
  }, [userId]);

  return (
    <div className="space-y-7">
      {/* Creator Status */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">Creator Status</h3>
        {creatorProfile?.status === 'active' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Creator Status</span>
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-rh-green/15 text-rh-green">
                  active
                </span>
              </div>
            </div>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              Your creator profile is live. Manage your settings and view earnings from the dashboard.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onCreatorNavigate('dashboard')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg
                  bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => onCreatorNavigate('settings')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg
                  bg-gray-100 dark:bg-white/[0.08] text-rh-light-text dark:text-rh-text
                  hover:bg-gray-200 dark:hover:bg-white/[0.12] transition-colors"
              >
                Settings
              </button>
            </div>
          </div>
        ) : creatorProfile?.status === 'suspended' ? (
          <div className="space-y-2">
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Creator Status</span>
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-red-500/15 text-red-600 dark:text-red-400">suspended</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              Your creator profile has been suspended. Contact support for details.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-rh-light-text dark:text-rh-text mb-1">
              {creatorProfile?.status === 'pending' ? 'Continue Creator Setup' : 'Start Earning as a Creator'}
            </p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-2">
              Share your portfolio insights and earn money from subscribers. Keep 80% of revenue.
            </p>
            <button
              onClick={() => onCreatorNavigate('dashboard')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg
                bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
            >
              {creatorProfile?.status === 'pending' ? 'Continue Setup' : 'Get Started'}
            </button>
          </div>
        )}
      </div>

      {/* My Creator Subscriptions */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">
          Creator Subscriptions
        </h3>
        <CreatorSubscriptionManager />
      </div>
    </div>
  );
}
