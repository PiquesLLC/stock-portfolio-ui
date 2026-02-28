import { useState } from 'react';
import { changePassword } from '../../../api';
import { useToast } from '../../../context/ToastContext';

interface SecuritySectionProps {
  onOpenMfa: () => void;
}

export function SecuritySection({ onOpenMfa }: SecuritySectionProps) {
  const { showToast } = useToast();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Authentication</h3>

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
          onClick={onOpenMfa}
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
    </div>
  );
}
