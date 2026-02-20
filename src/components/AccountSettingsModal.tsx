import { useState, useEffect } from 'react';
import { getUserSettings, updateUserSettings, UserSettings, UserSettingsUpdate, changePassword, deleteAccount, getPortfolio, HealthStatus, getNotificationStatus, NotificationStatus } from '../api';
import { useToast } from '../context/ToastContext';
import { PortfolioImport } from './PortfolioImport';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { MfaSetupModal } from './MfaSetupModal';
import { LinkedAccountsSection } from './LinkedAccountsSection';
import { BillingSection } from './BillingSection';
import { CreatorApplicationModal } from './CreatorApplicationModal';
import { CreatorSubscriptionManager } from './CreatorSubscriptionManager';
import { getCreatorProfile } from '../api';
import { CreatorProfile } from '../types';

interface AccountSettingsModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  healthStatus?: HealthStatus | null;
  onCreatorNavigate?: (view: 'dashboard' | 'settings' | 'ledger') => void;
}

export function AccountSettingsModal({ userId, isOpen, onClose, onSave, healthStatus, onCreatorNavigate }: AccountSettingsModalProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // Local form state
  const [displayName, setDisplayName] = useState('');
  const [profilePublic, setProfilePublic] = useState(true);
  const [region, setRegion] = useState<string | null>(null);
  const [showRegion, setShowRegion] = useState(true);
  const [holdingsVisibility, setHoldingsVisibility] = useState<'all' | 'top5' | 'sectors' | 'hidden'>('all');
  const [dripEnabled, setDripEnabled] = useState(false);
  const [cashInterestRate, setCashInterestRate] = useState('');

  // Theme from localStorage (managed separately from API)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  });

  // Extended hours from localStorage
  const [extendedHours, setExtendedHours] = useState(() => {
    const stored = localStorage.getItem('showExtendedHours');
    return stored !== null ? stored === 'true' : true;
  });

  // Starfield background from localStorage (default: enabled)
  const [starfieldEnabled, setStarfieldEnabled] = useState(() => {
    return localStorage.getItem('starfieldEnabled') !== 'false';
  });

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences (localStorage)
  const [notifyPriceAlerts, setNotifyPriceAlerts] = useState(() => {
    return localStorage.getItem('notifyPriceAlerts') !== 'false';
  });
  const [notifyFollowedActivity, setNotifyFollowedActivity] = useState(() => {
    return localStorage.getItem('notifyFollowedActivity') !== 'false';
  });
  const [notifyEarnings, setNotifyEarnings] = useState(() => {
    return localStorage.getItem('notifyEarnings') !== 'false';
  });

  // Legal modal
  const [showLegalModal, setShowLegalModal] = useState(false);

  // MFA modal
  const [showMfaModal, setShowMfaModal] = useState(false);

  // Creator monetization state
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [showCreatorApply, setShowCreatorApply] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Notification diagnostics
  const [notifStatus, setNotifStatus] = useState<NotificationStatus | null>(null);

  // Export/Import state
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getNotificationStatus().then(setNotifStatus).catch(() => {});
    }
  }, [isOpen]);

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
          setCashInterestRate(data.cashInterestRate != null ? String(data.cashInterestRate) : '');
        })
        .catch((err) => {
          setError(err.message || 'Failed to load settings');
        })
        .finally(() => setLoading(false));

      // Load creator profile (non-blocking)
      getCreatorProfile(userId).then(setCreatorProfile).catch(() => setCreatorProfile(null));
    }
  }, [isOpen, userId]);

  const handleChangePassword = async () => {
    setPasswordError('');

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
      showToast('Password changed successfully', 'success');
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
      const rateVal = cashInterestRate ? parseFloat(cashInterestRate) : null;
      if (rateVal !== (settings.cashInterestRate ?? null)) updates.cashInterestRate = rateVal;

      // Save local preferences
      localStorage.setItem('theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('showExtendedHours', String(extendedHours));
      localStorage.setItem('starfieldEnabled', String(starfieldEnabled));
      localStorage.setItem('notifyPriceAlerts', String(notifyPriceAlerts));
      localStorage.setItem('notifyFollowedActivity', String(notifyFollowedActivity));
      localStorage.setItem('notifyEarnings', String(notifyEarnings));

      // Only call API if there are server-side changes
      if (Object.keys(updates).length > 0) {
        await updateUserSettings(userId, updates);
      }

      onSave?.();
      showToast('Settings saved', 'success');
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
    } catch (_err) {
      setError('Failed to export portfolio');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/20 dark:border-white/[0.1] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/40 dark:border-white/[0.08]">
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
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto scrollbar-minimal space-y-6">
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

                  {/* Starfield Background */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Starfield Background</span>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">Animated stars in dark mode (desktop only)</p>
                    </div>
                    <ToggleSwitch checked={starfieldEnabled} onChange={setStarfieldEnabled} />
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
                  {/* Cash Interest Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Cash Interest Rate (APY)</span>
                        <p className="text-xs text-rh-light-muted dark:text-rh-muted">Interest earned on uninvested cash</p>
                      </div>
                    </div>
                    <div className="relative w-32">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="20"
                        value={cashInterestRate}
                        onChange={e => setCashInterestRate(e.target.value)}
                        placeholder="e.g. 4.5"
                        className="w-full px-3 py-1.5 pr-7 text-sm bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-1 focus:ring-rh-green/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rh-light-muted/50 dark:text-rh-muted text-xs">%</span>
                    </div>
                  </div>
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

                  {/* Two-Factor Authentication */}
                  <button
                    type="button"
                    onClick={() => setShowMfaModal(true)}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                      bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                      hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                      flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Two-Factor Authentication</span>
                    </div>
                    <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </section>

              {/* Linked Accounts Section */}
              <LinkedAccountsSection />

              {/* Subscription & Billing Section */}
              <BillingSection />

              {/* Creator Monetization Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Creator
                </h3>
                <div className="space-y-3">
                  {creatorProfile ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Creator Status</span>
                          <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                            creatorProfile.status === 'active'
                              ? 'bg-rh-green/15 text-rh-green'
                              : creatorProfile.status === 'pending'
                              ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                              : 'bg-red-500/15 text-red-600 dark:text-red-400'
                          }`}>
                            {creatorProfile.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted">
                        {creatorProfile.status === 'active'
                          ? 'Your creator profile is live. Manage your settings and view earnings from the dashboard.'
                          : creatorProfile.status === 'suspended'
                          ? 'Your creator profile has been suspended. Contact support for details.'
                          : 'Your application is being reviewed.'}
                      </p>
                      {creatorProfile.status === 'active' && onCreatorNavigate && (
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
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-rh-light-text dark:text-rh-text mb-1">Become a Creator</p>
                      <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-2">
                        Share your portfolio insights and earn money from subscribers. Keep 80% of revenue.
                      </p>
                      <button
                        onClick={() => setShowCreatorApply(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg
                          bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
                      >
                        Apply Now
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* My Creator Subscriptions */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Creator Subscriptions
                </h3>
                <CreatorSubscriptionManager />
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
                {/* Diagnostics */}
                <div className="mt-4 pt-3 border-t border-rh-light-border/30 dark:border-rh-border/30">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 mb-2">System Status</p>
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
              </section>

              {/* Data & Export Section */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Data & Export
                </h3>
                <div className="space-y-3">
                  {/* Import */}
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                      bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                      hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                      flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>Import Portfolio (CSV)</span>
                    </div>
                  </button>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted px-1">
                    Upload a CSV to replace or merge with your current holdings
                  </p>

                  {/* Export */}
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

              {/* Legal */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
                  Legal
                </h3>
                <button
                  type="button"
                  onClick={() => setShowLegalModal(true)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                    bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                    hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                    flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Privacy Policy & Terms of Service</span>
                  </div>
                  <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200/40 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03]">
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

      {/* Portfolio Import Modal */}
      {showImport && (
        <PortfolioImport
          onClose={() => setShowImport(false)}
          onImportComplete={() => { setShowImport(false); onSave?.(); }}
        />
      )}

      {/* Legal Modal */}
      <PrivacyPolicyModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
      />

      {/* MFA Setup Modal */}
      <MfaSetupModal
        isOpen={showMfaModal}
        onClose={() => setShowMfaModal(false)}
      />

      {/* Creator Application Modal */}
      <CreatorApplicationModal
        isOpen={showCreatorApply}
        onClose={() => setShowCreatorApply(false)}
        onSuccess={() => {
          getCreatorProfile(userId).then(setCreatorProfile).catch(() => {});
          showToast('Creator application submitted!', 'success');
        }}
      />
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
