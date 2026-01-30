import { useState, useEffect } from 'react';
import { UserProfile, MarketSession } from '../types';
import { getUserProfile } from '../api';
import { FollowButton } from './FollowButton';
import { UserPortfolioView } from './UserPortfolioView';
import { ActivityCard } from './ActivityCard';

interface UserProfileViewProps {
  userId: string;
  currentUserId: string;
  session?: MarketSession;
  onBack: () => void;
  onStockClick?: (ticker: string) => void;
}

export function UserProfileView({ userId, currentUserId, session, onBack, onStockClick }: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPortfolio, setShowPortfolio] = useState(false);

  useEffect(() => {
    setLoading(true);
    getUserProfile(userId, currentUserId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, currentUserId]);

  if (showPortfolio && profile) {
    return (
      <UserPortfolioView
        userId={userId}
        displayName={profile.displayName}
        returnPct={null}
        window="1M"
        session={session}
        onBack={() => setShowPortfolio(false)}
        onStockClick={onStockClick}
      />
    );
  }

  if (loading) {
    return (
      <div className="text-rh-light-muted dark:text-rh-muted text-sm py-8 text-center">
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-rh-red text-sm py-8 text-center">
        User not found.
        <button onClick={onBack} className="ml-2 text-rh-green hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Profile header */}
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-rh-light-text dark:text-rh-text">
              {profile.displayName}
            </h2>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted">@{profile.username}</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
              Joined {new Date(profile.createdAt).toLocaleDateString()}
            </p>
          </div>
          <FollowButton
            targetUserId={userId}
            currentUserId={currentUserId}
            initialFollowing={profile.viewerIsFollowing}
            onToggle={(nowFollowing) => {
              setProfile((p) =>
                p
                  ? {
                      ...p,
                      viewerIsFollowing: nowFollowing,
                      followerCount: p.followerCount + (nowFollowing ? 1 : -1),
                    }
                  : p
              );
            }}
          />
        </div>

        {/* Stats row */}
        <div className="flex gap-6 mt-4">
          <div>
            <span className="text-lg font-bold text-rh-light-text dark:text-rh-text">
              {profile.followerCount}
            </span>
            <span className="text-sm text-rh-light-muted dark:text-rh-muted ml-1">Followers</span>
          </div>
          <div>
            <span className="text-lg font-bold text-rh-light-text dark:text-rh-text">
              {profile.followingCount}
            </span>
            <span className="text-sm text-rh-light-muted dark:text-rh-muted ml-1">Following</span>
          </div>
        </div>

        {/* View portfolio button */}
        {profile.profilePublic && (
          <button
            onClick={() => setShowPortfolio(true)}
            className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-rh-light-bg dark:bg-rh-dark
              text-rh-light-text dark:text-rh-text hover:bg-gray-200 dark:hover:bg-rh-border transition-colors"
          >
            View Portfolio
          </button>
        )}
      </div>

      {/* Recent activity */}
      {profile.profilePublic && profile.recentActivity.length > 0 && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
            Recent Activity
          </h3>
          <div className="space-y-2">
            {profile.recentActivity.map((event) => (
              <ActivityCard key={event.id} event={event} showUser={false} />
            ))}
          </div>
        </div>
      )}

      {!profile.profilePublic && (
        <div className="text-center text-rh-light-muted dark:text-rh-muted text-sm py-8">
          This profile is private.
        </div>
      )}
    </div>
  );
}
