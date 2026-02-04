import { useState, useEffect } from 'react';
import { getUserSettings, updateUserSettings, UserSettings, UserSettingsUpdate } from '../api';

interface AccountSettingsModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function AccountSettingsModal({ userId, isOpen, onClose, onSave }: AccountSettingsModalProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state
  const [displayName, setDisplayName] = useState('');
  const [profilePublic, setProfilePublic] = useState(true);
  const [region, setRegion] = useState<string | null>(null);
  const [showRegion, setShowRegion] = useState(true);
  const [holdingsVisibility, setHoldingsVisibility] = useState<'all' | 'top5' | 'sectors' | 'hidden'>('all');
  const [dripEnabled, setDripEnabled] = useState(false);

  // Theme from localStorage (managed separately from API)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  });

  // Extended hours from localStorage
  const [extendedHours, setExtendedHours] = useState(() => {
    const stored = localStorage.getItem('showExtendedHours');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      setError(null);
      getUserSettings(userId)
        .then((data) => {
          setSettings(data);
          setDisplayName(data.displayName);
          setProfilePublic(data.profilePublic);
          setRegion(data.region);
          setShowRegion(data.showRegion);
          setHoldingsVisibility(data.holdingsVisibility);
          setDripEnabled(data.dripEnabled);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load settings');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, userId]);

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);

    try {
      const updates: UserSettingsUpdate = {};

      if (displayName !== settings.displayName) updates.displayName = displayName;
      if (profilePublic !== settings.profilePublic) updates.profilePublic = profilePublic;
      if (region !== settings.region) updates.region = region;
      if (showRegion !== settings.showRegion) updates.showRegion = showRegion;
      if (holdingsVisibility !== settings.holdingsVisibility) updates.holdingsVisibility = holdingsVisibility;
      if (dripEnabled !== settings.dripEnabled) updates.dripEnabled = dripEnabled;

      // Save local preferences
      localStorage.setItem('theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('showExtendedHours', String(extendedHours));

      // Only call API if there are server-side changes
      if (Object.keys(updates).length > 0) {
        await updateUserSettings(userId, updates);
      }

      onSave?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-rh-dark border border-gray-200 dark:border-rh-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-rh-border">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
            Account Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
          >
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-rh-red text-sm">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Profile Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Profile
                </h3>
                <div className="space-y-4">
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
                </div>
              </section>

              {/* Privacy Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Privacy
                </h3>
                <div className="space-y-4">
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
              </section>

              {/* Display Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Display
                </h3>
                <div className="space-y-4">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
                      Theme
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                          ${theme === 'dark'
                            ? 'bg-rh-green text-black'
                            : 'bg-gray-100 dark:bg-rh-border text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-rh-border/80'
                          }`}
                      >
                        Dark
                      </button>
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                          ${theme === 'light'
                            ? 'bg-rh-green text-black'
                            : 'bg-gray-100 dark:bg-rh-border text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-rh-border/80'
                          }`}
                      >
                        Light
                      </button>
                    </div>
                  </div>

                  {/* Extended Hours */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Extended Hours</span>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">Show pre/post market prices by default</p>
                    </div>
                    <ToggleSwitch checked={extendedHours} onChange={setExtendedHours} />
                  </label>
                </div>
              </section>

              {/* Portfolio Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Portfolio
                </h3>
                <div className="space-y-4">
                  {/* DRIP */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Dividend Reinvestment (DRIP)</span>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">Automatically reinvest dividends</p>
                    </div>
                    <ToggleSwitch checked={dripEnabled} onChange={setDripEnabled} />
                  </label>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-rh-border bg-gray-50 dark:bg-rh-border/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium
              text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
              hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold
              bg-rh-green text-black hover:bg-green-400
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle Switch Component
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? 'bg-rh-green' : 'bg-gray-300 dark:bg-rh-border'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}
