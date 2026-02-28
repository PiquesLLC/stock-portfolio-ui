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
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Account Info</h3>

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
          <div className="flex items-center justify-between text-sm">
            <span className="text-rh-light-muted dark:text-rh-muted">Member since</span>
            <span className="text-rh-light-text dark:text-rh-text">
              {new Date(settings.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* Privacy */}
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Privacy</h3>

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
