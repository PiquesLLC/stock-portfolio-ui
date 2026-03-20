import { useState, useCallback } from 'react';
import { ToggleSwitch } from '../ToggleSwitch';
import { UserSettings } from '../../../api';

interface ProfileSectionProps {
  settings: UserSettings | null;
  displayName: string;
  setDisplayName: (v: string) => void;
  profilePublic: boolean;
  setProfilePublic: (v: boolean) => void;
  holdingsVisibility: 'all' | 'top5' | 'sectors' | 'hidden';
  setHoldingsVisibility: (v: 'all' | 'top5' | 'sectors' | 'hidden') => void;
  region: string | null;
  setRegion: (v: string | null) => void;
  showRegion: boolean;
  setShowRegion: (v: boolean) => void;
}

export function ProfileSection({
  settings,
  displayName,
  setDisplayName,
  profilePublic,
  setProfilePublic,
  holdingsVisibility,
  setHoldingsVisibility,
  region,
  setRegion,
  showRegion,
  setShowRegion,
}: ProfileSectionProps) {
  return (
    <div className="space-y-7">
      <div className="space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">Account Info</h3>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
              bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text
              focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
            placeholder="Your display name"
          />
        </div>

        {/* Username (read-only) */}
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Username
          </label>
          <input
            type="text"
            value={settings?.username || ''}
            disabled
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-rh-border/50
              bg-gray-50 dark:bg-rh-border/20 text-rh-light-muted dark:text-rh-muted cursor-not-allowed"
          />
        </div>

        {/* Member Since */}
        {settings?.createdAt && (
          <div className="flex items-center justify-between text-sm pt-4 border-t border-gray-200/10 dark:border-white/[0.04]">
            <span className="text-rh-light-muted dark:text-rh-muted">Member since</span>
            <span className="text-rh-light-text dark:text-rh-text">
              {new Date(settings.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* Invite Friends */}
      {settings?.username && (
        <InviteCard username={settings.username} />
      )}

      {/* Privacy */}
      <div className="space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pl-3 border-l-2 border-rh-green">Privacy</h3>

        {/* Profile Public */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Public Profile</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Allow others to view your profile</p>
          </div>
          <ToggleSwitch checked={profilePublic} onChange={setProfilePublic} />
        </label>

        {/* Holdings Visibility */}
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Holdings Visibility
          </label>
          <select
            value={holdingsVisibility}
            onChange={(e) => setHoldingsVisibility(e.target.value as typeof holdingsVisibility)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
              bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text
              focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
          >
            <option value="all">Show all holdings</option>
            <option value="top5">Show top 5 only</option>
            <option value="sectors">Show sectors only</option>
            <option value="hidden">Hide all holdings</option>
          </select>
          <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
            What others see when viewing your portfolio
          </p>
        </div>

        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Region
          </label>
          <div className="flex items-center gap-4">
            <select
              value={region || ''}
              onChange={(e) => setRegion(e.target.value || null)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
                bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text
                focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
            >
              <option value="">Not set</option>
              <option value="NA">North America</option>
              <option value="EU">Europe</option>
              <option value="APAC">Asia Pacific</option>
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRegion}
                onChange={(e) => setShowRegion(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-rh-border text-rh-green focus:ring-rh-green"
              />
              <span className="text-sm text-rh-light-muted dark:text-rh-muted">Show</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function InviteCard({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const referralUrl = origin ? `${origin}/join?ref=${encodeURIComponent(username)}` : '';

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard || !referralUrl) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }, [referralUrl]);

  const handleShareX = useCallback(() => {
    if (!referralUrl || typeof window === 'undefined') return;
    const text = `Track your portfolio like a pro with Nala`;
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420');
  }, [referralUrl]);

  return (
    <div className="border-t border-gray-200/10 dark:border-white/[0.04] pt-6 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Invite Friends</h3>
      </div>
      <p className="text-xs text-rh-light-muted dark:text-rh-muted">
        Share your referral link with friends. When they sign up, they&apos;ll be connected to your network.
      </p>

      {/* Referral link input + copy */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={referralUrl}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200/40 dark:border-white/[0.08]
            bg-white dark:bg-rh-black text-xs text-rh-light-text dark:text-rh-text truncate"
          onClick={handleCopy}
        />
        <button
          onClick={handleCopy}
          className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            copied
              ? 'bg-rh-green/20 text-rh-green'
              : 'bg-rh-green/10 text-rh-green hover:bg-rh-green/20'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Share buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleShareX}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-white/50 hover:text-rh-light-text dark:hover:text-white/80 hover:border-gray-300 dark:hover:border-white/[0.15] transition-all"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            onClick={() => navigator.share({ title: 'Join Nala', text: 'Track your portfolio like a pro', url: referralUrl })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-white/50 hover:text-rh-light-text dark:hover:text-white/80 hover:border-gray-300 dark:hover:border-white/[0.15] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            More
          </button>
        )}
      </div>
    </div>
  );
}
