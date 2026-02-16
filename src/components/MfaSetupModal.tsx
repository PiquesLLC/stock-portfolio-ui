import { useState, useEffect } from 'react';
import {
  getMfaStatus, MfaStatus, setupTotp, verifyTotpSetup, disableTotp,
  updateMfaEmail, verifyMfaEmail, setupEmailOtp, verifyEmailOtpSetup, disableEmailOtp,
  regenerateBackupCodes,
} from '../api';
import { BackupCodesDisplay } from './BackupCodesDisplay';

interface MfaSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Spinner = () => (
  <svg className="animate-spin h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

type View = 'overview' | 'totp-setup' | 'email-setup' | 'backup-codes' | 'regenerate-backup';

export function MfaSetupModal({ isOpen, onClose }: MfaSetupModalProps) {
  const [view, setView] = useState<View>('overview');
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // TOTP setup state
  const [qrData, setQrData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  // Email setup state
  const [emailInput, setEmailInput] = useState('');
  const [emailStep, setEmailStep] = useState<'enter' | 'verify-email' | 'verify-otp'>('enter');
  const [emailCode, setEmailCode] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // Backup codes
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Disable password
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableTarget, setDisableTarget] = useState<'totp' | 'email' | null>(null);

  // Regenerate backup codes
  const [regenPassword, setRegenPassword] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const s = await getMfaStatus();
      setStatus(s);
    } catch {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setView('overview');
      setError('');
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totpEnabled = status?.methods.some(m => m.type === 'totp' && m.enabled);
  const emailEnabled = status?.methods.some(m => m.type === 'email' && m.enabled);
  const anyMfaEnabled = totpEnabled || emailEnabled;

  // ─── TOTP Setup Flow ───
  const handleBeginTotpSetup = async () => {
    setError('');
    setTotpLoading(true);
    try {
      const result = await setupTotp();
      setQrData({ qrCodeDataUrl: result.qrCodeDataUrl, secret: result.secret });
      setTotpCode('');
      setView('totp-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start setup');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleVerifyTotp = async () => {
    if (totpCode.length !== 6) return;
    setError('');
    setTotpLoading(true);
    try {
      const result = await verifyTotpSetup(totpCode);
      setBackupCodes(result.backupCodes);
      setView('backup-codes');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setTotpLoading(false);
    }
  };

  // ─── Email OTP Setup Flow ───
  const handleEmailSubmit = async () => {
    setError('');
    setEmailLoading(true);
    try {
      await updateMfaEmail(emailInput);
      setEmailStep('verify-email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    setError('');
    setEmailLoading(true);
    try {
      await verifyMfaEmail(emailCode);
      // Now enable email OTP
      await setupEmailOtp();
      setEmailCode('');
      setEmailStep('verify-otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    setError('');
    setEmailLoading(true);
    try {
      const result = await verifyEmailOtpSetup(emailCode);
      setBackupCodes(result.backupCodes);
      setView('backup-codes');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setEmailLoading(false);
    }
  };

  // ─── Disable ───
  const handleDisable = async () => {
    if (!disableTarget || !disablePassword) return;
    setError('');
    setDisabling(true);
    try {
      if (disableTarget === 'totp') {
        await disableTotp(disablePassword);
      } else {
        await disableEmailOtp(disablePassword);
      }
      setDisableTarget(null);
      setDisablePassword('');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable');
    } finally {
      setDisabling(false);
    }
  };

  // ─── Regenerate Backup Codes ───
  const handleRegenerate = async () => {
    if (!regenPassword) return;
    setError('');
    setRegenLoading(true);
    try {
      const result = await regenerateBackupCodes(regenPassword);
      setBackupCodes(result.backupCodes);
      setRegenPassword('');
      setView('backup-codes');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setRegenLoading(false);
    }
  };

  const inputClasses = "w-full px-3 py-2 rounded-lg border border-rh-border bg-rh-black text-white text-sm focus:ring-2 focus:ring-rh-green/50 focus:border-rh-green outline-none transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-rh-card border border-rh-border/40 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-rh-border/30">
          <h2 className="text-lg font-semibold text-white">
            {view === 'overview' && 'Two-Factor Authentication'}
            {view === 'totp-setup' && 'Authenticator App Setup'}
            {view === 'email-setup' && 'Email OTP Setup'}
            {view === 'backup-codes' && 'Backup Codes'}
            {view === 'regenerate-backup' && 'Regenerate Backup Codes'}
          </h2>
          <button onClick={onClose} className="p-1 text-rh-muted hover:text-white transition-colors rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {loading && view === 'overview' && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}

          {/* ═══ Overview ═══ */}
          {view === 'overview' && !loading && status && (
            <>
              {/* TOTP Method */}
              <div className="p-4 bg-rh-dark rounded-lg border border-rh-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-white">Authenticator App</span>
                  </div>
                  {totpEnabled ? (
                    <span className="text-xs px-2 py-0.5 bg-rh-green/15 text-rh-green rounded-full font-medium">Enabled</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-rh-border text-rh-muted rounded-full">Disabled</span>
                  )}
                </div>
                <p className="text-xs text-rh-muted mb-3">
                  Use Google Authenticator, Authy, or similar app to generate time-based codes.
                </p>
                {totpEnabled ? (
                  disableTarget === 'totp' ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Enter password to disable"
                        className={inputClasses}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleDisable} disabled={disabling || !disablePassword}
                          className="flex-1 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50">
                          {disabling ? <Spinner /> : 'Disable'}
                        </button>
                        <button onClick={() => { setDisableTarget(null); setDisablePassword(''); setError(''); }}
                          className="flex-1 py-1.5 text-xs font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setDisableTarget('totp')}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
                      Disable authenticator
                    </button>
                  )
                ) : (
                  <button onClick={handleBeginTotpSetup} disabled={totpLoading}
                    className="py-1.5 px-3 text-xs font-medium bg-rh-green/15 text-rh-green hover:bg-rh-green/25 rounded-lg transition-colors disabled:opacity-50">
                    {totpLoading ? <Spinner /> : 'Set up'}
                  </button>
                )}
              </div>

              {/* Email OTP Method */}
              <div className="p-4 bg-rh-dark rounded-lg border border-rh-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-white">Email Code</span>
                  </div>
                  {emailEnabled ? (
                    <span className="text-xs px-2 py-0.5 bg-rh-green/15 text-rh-green rounded-full font-medium">Enabled</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-rh-border text-rh-muted rounded-full">Disabled</span>
                  )}
                </div>
                <p className="text-xs text-rh-muted mb-1">
                  Receive a one-time code via email when you sign in.
                </p>
                {status.email && (
                  <p className="text-xs text-rh-muted/60 mb-3">
                    Email: {status.email} {status.emailVerified ? '(verified)' : '(not verified)'}
                  </p>
                )}
                {emailEnabled ? (
                  disableTarget === 'email' ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Enter password to disable"
                        className={inputClasses}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleDisable} disabled={disabling || !disablePassword}
                          className="flex-1 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50">
                          {disabling ? <Spinner /> : 'Disable'}
                        </button>
                        <button onClick={() => { setDisableTarget(null); setDisablePassword(''); setError(''); }}
                          className="flex-1 py-1.5 text-xs font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setDisableTarget('email')}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
                      Disable email OTP
                    </button>
                  )
                ) : (
                  <button onClick={() => {
                    setEmailInput(status.email || '');
                    setEmailStep(status.emailVerified ? 'verify-otp' : 'enter');
                    setEmailCode('');
                    setError('');
                    setView('email-setup');
                  }}
                    className="py-1.5 px-3 text-xs font-medium bg-rh-green/15 text-rh-green hover:bg-rh-green/25 rounded-lg transition-colors">
                    Set up
                  </button>
                )}
              </div>

              {/* Backup Codes */}
              {anyMfaEnabled && (
                <div className="p-4 bg-rh-dark rounded-lg border border-rh-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">Backup Codes</span>
                    <span className="text-xs text-rh-muted">{status.backupCodesRemaining} remaining</span>
                  </div>
                  <p className="text-xs text-rh-muted mb-3">
                    Use these one-time codes if you can't access your authenticator or email.
                  </p>
                  <button onClick={() => { setRegenPassword(''); setError(''); setView('regenerate-backup'); }}
                    className="py-1.5 px-3 text-xs font-medium bg-rh-border text-rh-text hover:bg-rh-border/80 rounded-lg transition-colors">
                    Regenerate codes
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══ TOTP Setup ═══ */}
          {view === 'totp-setup' && qrData && (
            <div className="space-y-4">
              <p className="text-sm text-rh-muted">
                Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img src={qrData.qrCodeDataUrl} alt="TOTP QR Code" className="w-48 h-48" />
              </div>
              <details className="text-xs">
                <summary className="text-rh-muted cursor-pointer hover:text-white transition-colors">
                  Can't scan? Enter code manually
                </summary>
                <div className="mt-2 p-2 bg-rh-dark rounded font-mono text-rh-muted break-all text-[11px]">
                  {qrData.secret}
                </div>
              </details>
              <div>
                <label className="block text-xs font-medium text-rh-muted mb-1">Verification Code</label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  className={`${inputClasses} text-center tracking-[0.3em] font-mono text-lg`}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setView('overview')}
                  className="flex-1 py-2 text-sm font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                  Back
                </button>
                <button onClick={handleVerifyTotp} disabled={totpLoading || totpCode.length !== 6}
                  className="flex-1 py-2 text-sm font-medium bg-rh-green hover:bg-rh-green/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {totpLoading ? <Spinner /> : 'Verify & Enable'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ Email OTP Setup ═══ */}
          {view === 'email-setup' && (
            <div className="space-y-4">
              {emailStep === 'enter' && (
                <>
                  <p className="text-sm text-rh-muted">Enter your email address. We'll send a verification code.</p>
                  <div>
                    <label className="block text-xs font-medium text-rh-muted mb-1">Email Address</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      autoFocus
                      className={inputClasses}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setView('overview')}
                      className="flex-1 py-2 text-sm font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                      Back
                    </button>
                    <button onClick={handleEmailSubmit} disabled={emailLoading || !emailInput.includes('@')}
                      className="flex-1 py-2 text-sm font-medium bg-rh-green hover:bg-rh-green/90 text-white rounded-lg transition-colors disabled:opacity-50">
                      {emailLoading ? <Spinner /> : 'Send Code'}
                    </button>
                  </div>
                </>
              )}

              {emailStep === 'verify-email' && (
                <>
                  <p className="text-sm text-rh-muted">Enter the 6-digit code sent to {emailInput}</p>
                  <div>
                    <label className="block text-xs font-medium text-rh-muted mb-1">Verification Code</label>
                    <input
                      type="text"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                      className={`${inputClasses} text-center tracking-[0.3em] font-mono text-lg`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEmailStep('enter')}
                      className="flex-1 py-2 text-sm font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                      Back
                    </button>
                    <button onClick={handleVerifyEmail} disabled={emailLoading || emailCode.length !== 6}
                      className="flex-1 py-2 text-sm font-medium bg-rh-green hover:bg-rh-green/90 text-white rounded-lg transition-colors disabled:opacity-50">
                      {emailLoading ? <Spinner /> : 'Verify Email'}
                    </button>
                  </div>
                </>
              )}

              {emailStep === 'verify-otp' && (
                <>
                  <p className="text-sm text-rh-muted">
                    A code was sent to your verified email. Enter it to enable email OTP.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-rh-muted mb-1">OTP Code</label>
                    <input
                      type="text"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                      className={`${inputClasses} text-center tracking-[0.3em] font-mono text-lg`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setView('overview')}
                      className="flex-1 py-2 text-sm font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                      Back
                    </button>
                    <button onClick={handleVerifyEmailOtp} disabled={emailLoading || emailCode.length !== 6}
                      className="flex-1 py-2 text-sm font-medium bg-rh-green hover:bg-rh-green/90 text-white rounded-lg transition-colors disabled:opacity-50">
                      {emailLoading ? <Spinner /> : 'Enable Email OTP'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ Backup Codes Display ═══ */}
          {view === 'backup-codes' && backupCodes.length > 0 && (
            <BackupCodesDisplay
              codes={backupCodes}
              onDone={() => { setBackupCodes([]); setView('overview'); }}
            />
          )}

          {/* ═══ Regenerate Backup Codes ═══ */}
          {view === 'regenerate-backup' && (
            <div className="space-y-4">
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-400">
                  This will invalidate all existing backup codes and generate 10 new ones.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-rh-muted mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  className={inputClasses}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setView('overview')}
                  className="flex-1 py-2 text-sm font-medium bg-rh-border text-rh-muted hover:text-white rounded-lg transition-colors">
                  Back
                </button>
                <button onClick={handleRegenerate} disabled={regenLoading || !regenPassword}
                  className="flex-1 py-2 text-sm font-medium bg-rh-green hover:bg-rh-green/90 text-white rounded-lg transition-colors disabled:opacity-50">
                  {regenLoading ? <Spinner /> : 'Regenerate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
