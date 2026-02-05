import { useState, useEffect } from 'react';
import { getUserSettings, updateUserSettings, UserSettings, UserSettingsUpdate, changePassword, deleteAccount, getPortfolio } from '../api';

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

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences (localStorage)
  const [notifyPriceAlerts, setNotifyPriceAlerts] = useState(() => {
    return localStorage.getItem('notifyPriceAlerts') !== 'false';
  });
  const [notifyFollowedActivity, setNotifyFollowedActivity] = useState(() => {
    return localStorage.getItem('notifyFollowedActivity') !== 'false';
  });

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

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

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }

    if (!newPassword) {
      setPasswordError('New password is required');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Password must include uppercase, lowercase, and a number');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordChange(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

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
      localStorage.setItem('notifyPriceAlerts', String(notifyPriceAlerts));
      localStorage.setItem('notifyFollowedActivity', String(notifyFollowedActivity));

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

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Password is required to confirm deletion');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      await deleteAccount(deletePassword);
      // Redirect to login page after deletion
      window.location.href = '/';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportPortfolio = async () => {
    setExporting(true);
    try {
      const portfolio = await getPortfolio(userId);

      // Generate CSV
      const headers = ['Ticker', 'Shares', 'Average Cost', 'Current Price', 'Current Value', 'Total Cost', 'Profit/Loss', 'Profit/Loss %'];
      const rows = portfolio.holdings.map(h => [
        h.ticker,
        h.shares,
        h.averageCost?.toFixed(2) ?? '',
        h.currentPrice?.toFixed(2) ?? '',
        h.currentValue?.toFixed(2) ?? '',
        h.totalCost?.toFixed(2) ?? '',
        h.profitLoss?.toFixed(2) ?? '',
        h.profitLossPercent?.toFixed(2) ?? '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export portfolio');
    } finally {
      setExporting(false);
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

              {/* Security Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Security
                </h3>
                <div className="space-y-4">
                  {!showPasswordChange ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordChange(true);
                        setPasswordError('');
                        setPasswordSuccess('');
                      }}
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                        bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                        hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                        flex items-center justify-between"
                    >
                      <span>Change Password</span>
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-gray-50 dark:bg-rh-border/20 rounded-lg">
                      {passwordError && (
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs">
                          {passwordError}
                        </div>
                      )}
                      {passwordSuccess && (
                        <div className="p-2 bg-rh-green/10 border border-rh-green/30 rounded text-rh-green text-xs">
                          {passwordSuccess}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
                            bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text text-sm
                            focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 8 chars, upper/lower/number"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
                            bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text text-sm
                            focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-rh-border
                            bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text text-sm
                            focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordChange(false);
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmNewPassword('');
                            setPasswordError('');
                          }}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium
                            text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
                            hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={changingPassword}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold
                            bg-rh-green text-black hover:bg-green-400
                            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {changingPassword ? 'Changing...' : 'Change Password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Notifications Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Notifications
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Price Alerts</span>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">Get notified when price targets are hit</p>
                    </div>
                    <ToggleSwitch checked={notifyPriceAlerts} onChange={setNotifyPriceAlerts} />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Activity from Followed Users</span>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">Get notified when users you follow make trades</p>
                    </div>
                    <ToggleSwitch checked={notifyFollowedActivity} onChange={setNotifyFollowedActivity} />
                  </label>
                </div>
              </section>

              {/* Data & Export Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Data & Export
                </h3>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleExportPortfolio}
                    disabled={exporting}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                      bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                      hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>{exporting ? 'Exporting...' : 'Export Portfolio (CSV)'}</span>
                    </div>
                  </button>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted px-1">
                    Download your holdings, cost basis, and current values
                  </p>
                </div>
              </section>

              {/* Danger Zone */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-red/80 mb-3">
                  Danger Zone
                </h3>
                <div className="space-y-3">
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                        bg-rh-red/10 text-rh-red border border-rh-red/30
                        hover:bg-rh-red/20 transition-colors
                        flex items-center justify-between"
                    >
                      <span>Delete Account</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  ) : (
                    <div className="p-4 bg-rh-red/5 border border-rh-red/30 rounded-lg space-y-3">
                      <p className="text-sm text-rh-red font-medium">
                        Are you sure? This action cannot be undone.
                      </p>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                        All your data including portfolio history, follows, and settings will be permanently deleted.
                      </p>
                      {deleteError && (
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs">
                          {deleteError}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                          Enter your password to confirm
                        </label>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-rh-red/30
                            bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text text-sm
                            focus:ring-2 focus:ring-rh-red/50 focus:border-rh-red outline-none transition-colors"
                          placeholder="Your password"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteError('');
                          }}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium
                            text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
                            hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold
                            bg-rh-red text-white hover:bg-red-600
                            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Delete My Account'}
                        </button>
                      </div>
                    </div>
                  )}
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
