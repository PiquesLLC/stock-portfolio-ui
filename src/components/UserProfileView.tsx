import { useState, useEffect } from 'react';
import { UserProfile, MarketSession } from '../types';
import { getUserProfile, updateUserRegion, updateHoldingsVisibility } from '../api';
import { FollowButton } from './FollowButton';
import { UserPortfolioView } from './UserPortfolioView';
import { ActivityCard } from './ActivityCard';

const REGION_OPTIONS = [
  { value: 'NA', label: 'North America' },
  { value: 'EU', label: 'Europe' },
  { value: 'APAC', label: 'Asia-Pacific' },
] as const;

function regionLabel(region: string | null): string {
  return REGION_OPTIONS.find((r) => r.value === region)?.label ?? 'Not set';
}

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
            {profile.showRegion && profile.region && (
              <span className="inline-block mt-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted">
                {regionLabel(profile.region)}
              </span>
            )}
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

        {/* Region settings (own profile only) */}
        {userId === currentUserId && (
          <div className="mt-4 pt-4 border-t border-rh-light-border dark:border-rh-border">
            <h3 className="text-xs font-semibold text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-2">Region</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={profile.region ?? ''}
                onChange={async (e) => {
                  const newRegion = e.target.value || null;
                  setProfile((p) => p ? { ...p, region: newRegion } : p);
                  await updateUserRegion(userId, newRegion, profile.showRegion);
                }}
                className="px-2 py-1.5 text-sm rounded-lg bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text"
              >
                <option value="">Not set</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-rh-light-muted dark:text-rh-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.showRegion}
                  onChange={async (e) => {
                    const newShow = e.target.checked;
                    setProfile((p) => p ? { ...p, showRegion: newShow } : p);
                    await updateUserRegion(userId, profile.region, newShow);
                  }}
                  className="rounded"
                />
                Display on profile
              </label>
            </div>
            {!profile.showRegion && (
              <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 mt-1">
                Region hidden. You will appear in the World leaderboard only.
              </p>
            )}
          </div>
        )}

        {/* Holdings visibility (own profile only) */}
        {userId === currentUserId && (
          <div className="mt-4 pt-4 border-t border-rh-light-border dark:border-rh-border">
            <h3 className="text-xs font-semibold text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-2">Holdings Visibility</h3>
            <select
              value={profile.holdingsVisibility ?? 'all'}
              onChange={async (e) => {
                const val = e.target.value;
                setProfile((p) => p ? { ...p, holdingsVisibility: val } : p);
                await updateHoldingsVisibility(userId, val);
              }}
              className="px-2 py-1.5 text-sm rounded-lg bg-rh-light-bg dark:bg-rh-dark border border-rh-light-border dark:border-rh-border text-rh-light-text dark:text-rh-text"
            >
              <option value="all">All Holdings</option>
              <option value="top5">Top 5 Only</option>
              <option value="sectors">Sectors Only</option>
              <option value="hidden">Hidden</option>
            </select>
            <p className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70 mt-1">
              Controls what other users see when viewing your portfolio.
            </p>
          </div>
        )}

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

      {/* Performance Stats */}
      {profile.profilePublic && profile.performance && profile.performance.snapshotCount >= 2 && (
        <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Performance (1M)</h3>
            {profile.performance.alphaPct !== null && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                profile.performance.alphaPct >= 0
                  ? 'bg-green-500/10 text-rh-green'
                  : 'bg-red-500/10 text-rh-red'
              }`}>
                {profile.performance.alphaPct >= 0 ? 'Beating' : 'Trailing'} {profile.performance.benchmarkTicker} by{' '}
                {profile.performance.alphaPct >= 0 ? '+' : ''}{profile.performance.alphaPct.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            <div>
              <p className="text-rh-light-muted dark:text-rh-muted">TWR</p>
              <p className={`font-bold ${
                (profile.performance.twrPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'
              }`}>
                {profile.performance.twrPct !== null ? `${profile.performance.twrPct >= 0 ? '+' : ''}${profile.performance.twrPct.toFixed(2)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-rh-light-muted dark:text-rh-muted">Volatility</p>
              <p className="text-rh-light-text dark:text-rh-text font-medium">
                {profile.performance.volatilityPct !== null ? `${profile.performance.volatilityPct.toFixed(1)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-rh-light-muted dark:text-rh-muted">Max DD</p>
              <p className="text-rh-red font-medium">
                {profile.performance.maxDrawdownPct !== null ? `-${profile.performance.maxDrawdownPct.toFixed(2)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-rh-light-muted dark:text-rh-muted">Beta</p>
              <p className="text-rh-light-text dark:text-rh-text font-medium">
                {profile.performance.beta !== null ? profile.performance.beta.toFixed(2) : '--'}
              </p>
            </div>
            {profile.performance.bestDay && (
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted">Best Day</p>
                <p className="text-rh-green font-medium">+{profile.performance.bestDay.returnPct.toFixed(2)}%</p>
              </div>
            )}
            {profile.performance.worstDay && (
              <div>
                <p className="text-rh-light-muted dark:text-rh-muted">Worst Day</p>
                <p className="text-rh-red font-medium">{profile.performance.worstDay.returnPct.toFixed(2)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

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
