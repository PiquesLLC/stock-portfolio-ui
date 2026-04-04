import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUserSettings, updateUserSettings, UserSettings, UserSettingsUpdate, deleteAccount, getNotificationStatus, NotificationStatus, HealthStatus } from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PortfolioImport } from '../PortfolioImport';
import { PrivacyPolicyModal } from '../PrivacyPolicyModal';
import { MfaSetupModal } from '../MfaSetupModal';
import { SettingsSidebar, SettingsSection } from './SettingsSidebar';
import { ProfileSection } from './sections/ProfileSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { SecuritySection } from './sections/SecuritySection';
import { BillingSettingsSection } from './sections/BillingSettingsSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { PortfolioDataSection } from './sections/PortfolioDataSection';
import { CreatorSection } from './sections/CreatorSection';

interface AccountSettingsPageProps {
  userId: string;
  onBack: () => void;
  onSave?: () => void;
  healthStatus?: HealthStatus | null;
  onCreatorNavigate: (view: 'dashboard' | 'settings') => void;
}

const ADMIN_USER_ID = '237198da-612e-411c-9ef8-f267c887a9f1';

// Section metadata for the content header
const SECTION_META: Record<SettingsSection, { title: string; description: string }> = {
  profile: { title: 'Profile', description: 'How you appear to other users on Nala.' },
  appearance: { title: 'Appearance', description: 'Theme, display preferences, and portfolio settings.' },
  security: { title: 'Security', description: 'Password and two-factor authentication.' },
  billing: { title: 'Billing', description: 'Your subscription plan and linked accounts.' },
  notifications: { title: 'Notifications', description: 'Alerts, earnings, and activity updates.' },
  data: { title: 'Portfolio Data', description: 'Import and export your portfolio.' },
  creator: { title: 'Creator', description: 'Your creator profile and subscriber management.' },
};

function readStorageFlag(key: string, defaultValue: boolean): boolean {
  if (typeof localStorage === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : defaultValue;
}

function readThemePreference(): 'dark' | 'light' {
  if (typeof localStorage === 'undefined') return 'dark';
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

function readViewportIsMobile(): boolean {
  return typeof window !== 'undefined' ? window.innerWidth < 640 : false;
}

export default function AccountSettingsPage({ userId, onBack, onSave, healthStatus, onCreatorNavigate }: AccountSettingsPageProps) {
  const isAdmin = userId === ADMIN_USER_ID;
  const { showToast } = useToast();
  const { refreshUser } = useAuth();

  const handleUsernameChanged = useCallback(
    async (newUsername: string) => {
      setSettings((prev) => (prev ? { ...prev, username: newUsername } : prev));
      await refreshUser();
      showToast('Username updated', 'success');
    },
    [refreshUser, showToast],
  );

  // Global load state
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  // Active section
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(() => {
    return readViewportIsMobile() ? null : 'profile';
  });

  // Profile state
  const [displayName, setDisplayName] = useState('');
  const [profilePublic, setProfilePublic] = useState(true);
  const [region, setRegion] = useState<string | null>(null);
  const [showRegion, setShowRegion] = useState(true);
  const [holdingsVisibility, setHoldingsVisibility] = useState<'all' | 'top5' | 'sectors' | 'hidden'>('all');

  // Appearance state
  const [theme, setTheme] = useState<'dark' | 'light'>(readThemePreference);
  const [extendedHours, setExtendedHours] = useState(() => {
    return readStorageFlag('showExtendedHours', true);
  });
  const [starfieldEnabled, setStarfieldEnabled] = useState(() => {
    return readStorageFlag('starfieldEnabled', true);
  });
  const [dripEnabled, setDripEnabled] = useState(false);
  const [cashInterestRate, setCashInterestRate] = useState('');
  const [ytdBaseline, setYtdBaseline] = useState('');
  const [marginDebt, setMarginDebt] = useState('');
  const [annualSalary, setAnnualSalary] = useState('');

  // Notification state
  const [notifyPriceAlerts, setNotifyPriceAlerts] = useState(() => {
    return readStorageFlag('notifyPriceAlerts', true);
  });
  const [notifyFollowedActivity, setNotifyFollowedActivity] = useState(() => {
    return readStorageFlag('notifyFollowedActivity', true);
  });
  const [notifyEarnings, setNotifyEarnings] = useState(() => {
    return readStorageFlag('notifyEarnings', true);
  });
  const [notifStatus, setNotifStatus] = useState<NotificationStatus | null>(null);

  // Sub-modal state
  const [showImport, setShowImport] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [showDeleteConfirm]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    if (!settings) return false;
    const localTheme = readThemePreference();
    const localEH = readStorageFlag('showExtendedHours', true);
    const localSF = readStorageFlag('starfieldEnabled', true);
    const localPA = readStorageFlag('notifyPriceAlerts', true);
    const localFA = readStorageFlag('notifyFollowedActivity', true);
    const localEA = readStorageFlag('notifyEarnings', true);

    return (
      displayName !== settings.displayName ||
      profilePublic !== settings.profilePublic ||
      region !== settings.region ||
      showRegion !== settings.showRegion ||
      holdingsVisibility !== settings.holdingsVisibility ||
      dripEnabled !== settings.dripEnabled ||
      (cashInterestRate ? parseFloat(cashInterestRate) : null) !== (settings.cashInterestRate ?? null) ||
      (() => { const p = parseFloat(ytdBaseline); return (ytdBaseline && Number.isFinite(p) ? p : null) !== (settings.ytdBaselineValue ?? null); })() ||
      (() => { const m = parseFloat(marginDebt); return (marginDebt && Number.isFinite(m) ? m : null) !== (settings.marginDebt ?? null); })() ||
      (() => { const s = parseFloat(annualSalary); return (annualSalary && Number.isFinite(s) ? s : null) !== (settings.annualSalary ?? null); })() ||
      theme !== localTheme ||
      extendedHours !== localEH ||
      starfieldEnabled !== localSF ||
      notifyPriceAlerts !== localPA ||
      notifyFollowedActivity !== localFA ||
      notifyEarnings !== localEA
    );
  }, [settings, displayName, profilePublic, region, showRegion, holdingsVisibility, dripEnabled,
      cashInterestRate, ytdBaseline, marginDebt, annualSalary, theme, extendedHours, starfieldEnabled,
      notifyPriceAlerts, notifyFollowedActivity, notifyEarnings]);

  // Load settings
  useEffect(() => {
    if (!userId) return;
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
        setYtdBaseline(data.ytdBaselineValue != null ? String(data.ytdBaselineValue) : '');
        setMarginDebt(data.marginDebt != null ? String(data.marginDebt) : '');
        setAnnualSalary(data.annualSalary != null ? String(data.annualSalary) : '');
      })
      .catch((err) => {
        setError(err.message || 'Failed to load settings');
      })
      .finally(() => setLoading(false));

    getNotificationStatus().then(setNotifStatus).catch(e => console.error('Notification status fetch failed:', e));
  }, [userId]);

  // Save handler
  const handleSave = useCallback(async () => {
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
      const parsedBaseline = parseFloat(ytdBaseline);
      const baselineVal = ytdBaseline && Number.isFinite(parsedBaseline) ? parsedBaseline : null;
      if (baselineVal !== (settings.ytdBaselineValue ?? null)) updates.ytdBaselineValue = baselineVal;
      const parsedMarginDebt = parseFloat(marginDebt);
      const marginDebtVal = marginDebt && Number.isFinite(parsedMarginDebt) ? parsedMarginDebt : null;
      if (marginDebtVal !== (settings.marginDebt ?? null)) updates.marginDebt = marginDebtVal;
      const parsedSalary = parseFloat(annualSalary);
      const salaryVal = annualSalary && Number.isFinite(parsedSalary) ? parsedSalary : null;
      if (salaryVal !== (settings.annualSalary ?? null)) updates.annualSalary = salaryVal;

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', theme);
        localStorage.setItem('showExtendedHours', String(extendedHours));
        localStorage.setItem('starfieldEnabled', String(starfieldEnabled));
        localStorage.setItem('notifyPriceAlerts', String(notifyPriceAlerts));
        localStorage.setItem('notifyFollowedActivity', String(notifyFollowedActivity));
        localStorage.setItem('notifyEarnings', String(notifyEarnings));
      }
      if (typeof document !== 'undefined') {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      if (Object.keys(updates).length > 0) {
        const updated = await updateUserSettings(userId, updates);
        setSettings(updated);
      }

      setLastSaved(Date.now());
      onSave?.();
      showToast('Settings saved', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [settings, displayName, profilePublic, region, showRegion, holdingsVisibility, dripEnabled,
      cashInterestRate, ytdBaseline, marginDebt, annualSalary, theme, extendedHours, starfieldEnabled,
      notifyPriceAlerts, notifyFollowedActivity, notifyEarnings, userId, onSave, showToast]);

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Password is required to confirm deletion');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      // Clear biometric Keychain before account deletion (native only)
      const { clearBiometricToken } = await import('../../utils/biometric');
      await clearBiometricToken();
      await deleteAccount(deletePassword);
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectSection = (section: SettingsSection) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMobileBack = () => {
    setActiveSection(null);
  };

  // Responsive
  const [isMobile, setIsMobile] = useState(readViewportIsMobile);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (!mobile && activeSection === null) {
        setActiveSection('profile');
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeSection]);

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <ProfileSection
            settings={settings}
            displayName={displayName}
            setDisplayName={setDisplayName}
            profilePublic={profilePublic}
            setProfilePublic={setProfilePublic}
            holdingsVisibility={holdingsVisibility}
            setHoldingsVisibility={setHoldingsVisibility}
            region={region}
            setRegion={setRegion}
            showRegion={showRegion}
            setShowRegion={setShowRegion}
            onUsernameChanged={handleUsernameChanged}
          />
        );
      case 'appearance':
        return (
          <AppearanceSection
            theme={theme}
            setTheme={setTheme}
            extendedHours={extendedHours}
            setExtendedHours={setExtendedHours}
            starfieldEnabled={starfieldEnabled}
            setStarfieldEnabled={setStarfieldEnabled}
          />
        );
      case 'security':
        return <SecuritySection onOpenMfa={() => setShowMfaModal(true)} />;
      case 'billing':
        return <BillingSettingsSection />;
      case 'notifications':
        return (
          <NotificationsSection
            notifyPriceAlerts={notifyPriceAlerts}
            setNotifyPriceAlerts={setNotifyPriceAlerts}
            notifyEarnings={notifyEarnings}
            setNotifyEarnings={setNotifyEarnings}
            notifyFollowedActivity={notifyFollowedActivity}
            setNotifyFollowedActivity={setNotifyFollowedActivity}
            isAdmin={isAdmin}
            healthStatus={healthStatus}
            notifStatus={notifStatus}
          />
        );
      case 'data':
        return (
          <PortfolioDataSection
            userId={userId}
            onOpenImport={() => setShowImport(true)}
            onDeleteAccount={() => setShowDeleteConfirm(true)}
            dripEnabled={dripEnabled}
            setDripEnabled={setDripEnabled}
            cashInterestRate={cashInterestRate}
            setCashInterestRate={setCashInterestRate}
            ytdBaseline={ytdBaseline}
            setYtdBaseline={setYtdBaseline}
            marginDebt={marginDebt}
            setMarginDebt={setMarginDebt}
            annualSalary={annualSalary}
            setAnnualSalary={setAnnualSalary}
          />
        );
      case 'creator':
        return (
          <CreatorSection
            userId={userId}
            onCreatorNavigate={(view) => { onCreatorNavigate(view); }}
          />
        );
      default:
        return null;
    }
  };

  // Save state label
  const saveStateLabel = saving
    ? 'Saving...'
    : isDirty
      ? 'Unsaved changes'
      : lastSaved
        ? 'All changes saved'
        : null;

  if (loading) {
    return (
      <div className="w-full py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-white/10 rounded-xl" />
          <div className="h-40 bg-gray-200 dark:bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="w-full py-8 text-center">
        <p className="text-rh-red text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
        >
          Retry
        </button>
      </div>
    );
  }

  // Sticky save bar — shown when there are unsaved changes
  const stickyBar = isDirty && (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(90vw,36rem)]">
      <div className="flex items-center justify-between px-5 py-3 rounded-xl
        bg-white/95 dark:bg-white/[0.06] backdrop-blur-xl
        border border-gray-200/50 dark:border-white/[0.06]"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">You have unsaved changes</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg
            bg-rh-green text-black hover:bg-green-400 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Layout */}
      {isMobile ? (
        <>
          {/* Mobile page header */}
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={activeSection !== null ? handleMobileBack : onBack}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex-1">Settings</h1>
          </div>
          {activeSection === null ? (
            <SettingsSidebar
              activeSection={null}
              onSelectSection={handleSelectSection}
              onPrivacyPolicy={() => setShowLegalModal(true)}
              isMobile
            />
          ) : (
            <div className="min-h-[60vh]">
              {/* Mobile section header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">{SECTION_META[activeSection].title}</h2>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">{SECTION_META[activeSection].description}</p>
                </div>
                {saveStateLabel && (
                  <span className={`text-[11px] font-medium mt-0.5 flex-shrink-0 ${
                    isDirty ? 'text-yellow-500' : saving ? 'text-rh-light-muted dark:text-rh-muted' : 'text-rh-green/60'
                  }`}>
                    {saveStateLabel}
                  </span>
                )}
              </div>
              {renderContent()}
              {stickyBar}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-start">
          {/* Left column: Settings header + sidebar nav */}
          <div className="w-48 flex-shrink-0 mr-10">
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={onBack}
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Settings</h1>
            </div>
            <SettingsSidebar
              activeSection={activeSection}
              onSelectSection={handleSelectSection}
              onPrivacyPolicy={() => setShowLegalModal(true)}
              isMobile={false}
            />
          </div>

          {/* Right column: section header + content */}
          <div className="flex-1 min-w-0 max-w-2xl mx-auto">
            {activeSection && (
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-rh-light-text dark:text-rh-text">{SECTION_META[activeSection].title}</h2>
                  <p className="text-xs text-rh-light-muted/70 dark:text-rh-muted/60 mt-0.5">{SECTION_META[activeSection].description}</p>
                </div>
                {saveStateLabel && (
                  <span className={`text-[11px] font-medium flex items-center gap-1.5 flex-shrink-0 ${
                    isDirty ? 'text-yellow-500' : saving ? 'text-rh-light-muted dark:text-rh-muted' : 'text-rh-green/40'
                  }`}>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                    {!isDirty && lastSaved && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {saveStateLabel}
                  </span>
                )}
              </div>
            )}
            {renderContent()}
            {stickyBar}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 pb-4 text-center">
        <p className="text-[11px] text-gray-400/40 dark:text-white/[0.12]">
          Nala v{__APP_VERSION__} · <button onClick={() => setShowLegalModal(true)} className="hover:text-gray-500 dark:hover:text-white/30 transition-colors">Privacy & Terms</button>
        </p>
      </div>

      {/* Delete Account Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#111] border border-gray-200 dark:border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-2">Delete Account</h3>
            <p className="text-sm text-rh-red font-medium mb-1">
              Are you sure? This action cannot be undone.
            </p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-4">
              All your data including portfolio history, follows, and settings will be permanently deleted.
            </p>
            {deleteError && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs">
                {deleteError}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-1">
                Enter your password to confirm
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-rh-red/30
                  bg-white dark:bg-rh-black text-rh-light-text dark:text-rh-text text-sm
                  focus:ring-2 focus:ring-rh-red/50 focus:border-rh-red outline-none transition-colors"
                placeholder="Your password"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium
                  text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text
                  hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold
                  bg-rh-red text-white hover:bg-red-600
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
