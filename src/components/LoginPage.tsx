import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { setPassword as apiSetPassword, checkHasPassword, forgotPassword, resetPassword } from '../api';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { MfaVerifyStep } from './MfaVerifyStep';

// Eye icons for password visibility toggle
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export function LoginPage() {
  const { login, signup, verifyEmail, resendVerification, mfaChallenge } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'set-password' | 'signup' | 'verify-email' | 'forgot-password' | 'reset-password'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [privacyTab, setPrivacyTab] = useState<'privacy' | 'terms'>('privacy');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [referralCode, setReferralCode] = useState('');

  // Capture referral code from URL (?ref=username)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref);
      setMode('signup');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (mode === 'forgot-password') {
        if (!resetEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
          setError('Please enter a valid email address');
          setIsLoading(false);
          return;
        }
        await forgotPassword(resetEmail);
        setMode('reset-password');
        setSuccessMessage('Reset code sent! Check your email.');
        setError('');
        setIsLoading(false);
        return;
      } else if (mode === 'reset-password') {
        if (resetCode.length !== 6) {
          setError('Please enter the 6-digit reset code');
          setIsLoading(false);
          return;
        }
        if (newPassword.length < 8) {
          setError('Password must be at least 8 characters');
          setIsLoading(false);
          return;
        }
        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
          setError('Password must include uppercase, lowercase, and a number');
          setIsLoading(false);
          return;
        }
        if (newPassword !== newPasswordConfirm) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        await resetPassword(resetEmail, resetCode, newPassword);
        setSuccessMessage('Password reset! You can now sign in.');
        setMode('login');
        setResetEmail('');
        setResetCode('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setIsLoading(false);
        return;
      } else if (mode === 'verify-email') {
        if (verificationCode.length !== 6) {
          setError('Please enter the 6-digit verification code');
          setIsLoading(false);
          return;
        }
        await verifyEmail(verificationEmail, verificationCode);
        // Success — AuthContext will set user and we'll navigate to app
      } else if (mode === 'signup') {
        if (!username.trim() || !displayName.trim()) {
          setError('Username and display name are required');
          setIsLoading(false);
          return;
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError('Please enter a valid email address');
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setIsLoading(false);
          return;
        }
        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
          setError('Password must include uppercase, lowercase, and a number');
          setIsLoading(false);
          return;
        }
        if (!acceptedTerms) {
          setError('You must accept the Privacy Policy and Terms of Service');
          setIsLoading(false);
          return;
        }
        const result = await signup(username, displayName, password, email, { acceptedPrivacyPolicy: true, acceptedTerms: true }, referralCode || undefined);
        if (result.emailVerificationRequired) {
          setVerificationEmail(email);
          setMode('verify-email');
          setError('');
          setSuccessMessage('');
          setIsLoading(false);
          return;
        }
      } else if (mode === 'set-password') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setIsLoading(false);
          return;
        }
        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
          setError('Password must include uppercase, lowercase, and a number');
          setIsLoading(false);
          return;
        }
        await apiSetPassword(username, password);
        setSuccessMessage('Password set successfully! You can now sign in.');
        setMode('login');
        setPasswordValue('');
        setConfirmPassword('');
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const checkAndSwitchMode = async () => {
    if (!username.trim()) return;
    try {
      const result = await checkHasPassword(username);
      if (!result.hasPassword) {
        setMode('set-password');
        setError('');
        setSuccessMessage('This account needs a password. Please set one to continue.');
      }
    } catch {
      // User might not exist, stay in login mode
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      await resendVerification(verificationEmail);
      showToast('Verification code resent', 'success');
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signup': return 'Create Account';
      case 'set-password': return 'Set Password';
      case 'verify-email': return 'Verify Your Email';
      case 'forgot-password': return 'Reset Password';
      case 'reset-password': return 'Enter Reset Code';
      default: return 'Welcome Back';
    }
  };

  const getButtonText = () => {
    switch (mode) {
      case 'signup': return 'Create Account';
      case 'set-password': return 'Set Password';
      case 'verify-email': return 'Verify';
      case 'forgot-password': return 'Send Reset Code';
      case 'reset-password': return 'Reset Password';
      default: return 'Sign In';
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-rh-dark border border-rh-border rounded-lg text-white placeholder-rh-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/60 focus-visible:border-rh-green transition-all duration-150";

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center bg-rh-black px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2.5">
            <img
              src="/north-signal-logo.png"
              alt=""
              className="h-9 w-9"
            />
            <h1 className="text-3xl font-bold text-white leading-none tracking-tight">
              Nala
            </h1>
          </div>
          <p className="text-rh-muted text-sm mt-2.5">
            Portfolio Tracking Intelligence
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-rh-card rounded-2xl p-6 shadow-2xl border border-rh-border/40">
          {/* MFA Verify Step — shown when MFA challenge is active */}
          {mfaChallenge ? (
            <MfaVerifyStep challenge={mfaChallenge} />
          ) : (
          <>
          <h2 className="text-xl font-semibold text-white mb-6">
            {getTitle()}
          </h2>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2.5" role="alert" aria-live="assertive">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-5 p-3 bg-rh-green/10 border border-rh-green/30 rounded-lg text-rh-green text-sm flex items-start gap-2.5" role="status" aria-live="polite">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5">
              {/* Verify Email Mode */}
              {mode === 'verify-email' ? (<>
                <p className="text-sm text-rh-muted leading-relaxed">
                  We sent a 6-digit code to <span className="text-white font-medium">{verificationEmail}</span>. Enter it below to verify your account.
                </p>
                <div>
                  <label htmlFor="verificationCode" className="block text-sm font-medium text-rh-muted mb-2">
                    Verification Code
                  </label>
                  <input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={`${inputClasses} text-center text-2xl tracking-[0.3em] font-mono`}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0}
                    className="text-sm text-rh-green hover:text-rh-green/80 disabled:text-rh-muted/40 disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                  <span className="text-xs text-rh-muted/40">Check your spam folder</span>
                </div>
              </>) : mode === 'forgot-password' ? (<>
                <p className="text-sm text-rh-muted leading-relaxed">
                  Enter the email address associated with your account and we'll send you a reset code.
                </p>
                <div>
                  <label htmlFor="resetEmail" className="block text-sm font-medium text-rh-muted mb-2">
                    Email
                  </label>
                  <input
                    id="resetEmail"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={inputClasses}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoFocus
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                  className="text-sm text-rh-green hover:text-rh-green/80 transition-colors"
                >
                  Back to sign in
                </button>
              </>) : mode === 'reset-password' ? (<>
                <p className="text-sm text-rh-muted leading-relaxed">
                  Enter the 6-digit code sent to <span className="text-white font-medium">{resetEmail}</span> and choose a new password.
                </p>
                <div>
                  <label htmlFor="resetCode" className="block text-sm font-medium text-rh-muted mb-2">
                    Reset Code
                  </label>
                  <input
                    id="resetCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={`${inputClasses} text-center text-2xl tracking-[0.3em] font-mono`}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-rh-muted mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${inputClasses} pr-11`}
                      placeholder="Min. 8 chars, upper/lower/number"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-rh-muted/60 hover:text-white transition-colors rounded"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="newPasswordConfirm" className="block text-sm font-medium text-rh-muted mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPasswordConfirm"
                      type={showNewPasswordConfirm ? 'text' : 'password'}
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      className={`${inputClasses} pr-11`}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPasswordConfirm(!showNewPasswordConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-rh-muted/60 hover:text-white transition-colors rounded"
                      tabIndex={-1}
                    >
                      {showNewPasswordConfirm ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={async () => {
                      if (resetCooldown > 0) return;
                      try {
                        await forgotPassword(resetEmail);
                        showToast('Reset code resent', 'success');
                        setResetCooldown(60);
                        const interval = setInterval(() => {
                          setResetCooldown(prev => {
                            if (prev <= 1) { clearInterval(interval); return 0; }
                            return prev - 1;
                          });
                        }, 1000);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to resend code');
                      }
                    }}
                    disabled={resetCooldown > 0}
                    className="text-sm text-rh-green hover:text-rh-green/80 disabled:text-rh-muted/40 disabled:cursor-not-allowed transition-colors"
                  >
                    {resetCooldown > 0 ? `Resend in ${resetCooldown}s` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); setResetEmail(''); setResetCode(''); setNewPassword(''); setNewPasswordConfirm(''); }}
                    className="text-sm text-rh-muted/60 hover:text-rh-muted transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              </>) : (<>
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-rh-muted mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={mode === 'login' ? checkAndSwitchMode : undefined}
                  className={inputClasses}
                  placeholder="e.g. nala_investor"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                />
              </div>

              {/* Display Name Field (Signup only) */}
              {mode === 'signup' && (
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-rh-muted mb-2">
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClasses}
                    placeholder="How others will see you"
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              {/* Email Field (Signup only) */}
              {mode === 'signup' && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-rh-muted mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClasses}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    required
                  />
                </div>
              )}

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-rh-muted">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="text-xs text-rh-muted/60 hover:text-rh-muted transition-colors"
                      onClick={() => {
                        setMode('forgot-password');
                        setError('');
                        setSuccessMessage('');
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className={`${inputClasses} pr-11`}
                    placeholder={mode === 'login' ? '••••••••' : 'Min. 8 chars, upper/lower/number'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-rh-muted/60 hover:text-white transition-colors rounded"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field (Set Password / Signup) */}
              {(mode === 'set-password' || mode === 'signup') && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-rh-muted mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`${inputClasses} pr-11`}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-rh-muted/60 hover:text-white transition-colors rounded"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
              )}

              {/* Referral badge (Signup mode only) */}
              {mode === 'signup' && referralCode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rh-green/10 dark:bg-rh-green/5 border border-rh-green/20">
                  <span className="text-rh-green text-sm font-medium">Invited by @{referralCode}</span>
                </div>
              )}

              {/* Consent Checkbox (Signup mode only) */}
              {mode === 'signup' && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-rh-border bg-rh-dark text-rh-green accent-rh-green focus:ring-rh-green/50 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm text-rh-muted group-hover:text-rh-muted/80 transition-colors leading-tight">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setPrivacyTab('privacy'); setShowPrivacyPolicy(true); }}
                      className="text-rh-green hover:underline"
                    >
                      Privacy Policy
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setPrivacyTab('terms'); setShowPrivacyPolicy(true); }}
                      className="text-rh-green hover:underline"
                    >
                      Terms of Service
                    </button>
                  </span>
                </label>
              )}

              {/* Stay Signed In (Login mode only) */}
              {mode === 'login' && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={(e) => setStaySignedIn(e.target.checked)}
                    className="w-4 h-4 rounded border-rh-border bg-rh-dark text-rh-green accent-rh-green focus:ring-rh-green/50 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm text-rh-muted group-hover:text-rh-muted/80 transition-colors">
                    Stay signed in
                  </span>
                </label>
              )}

              </>)}
              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-rh-green hover:bg-rh-green/90 active:bg-rh-green/80 disabled:bg-rh-green/50 disabled:cursor-wait text-white font-semibold rounded-lg transition-all duration-150 shadow-lg shadow-rh-green/25 hover:shadow-rh-green/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green focus-visible:ring-offset-2 focus-visible:ring-offset-rh-card"
              >
                {isLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner />
                    <span>Please wait...</span>
                  </span>
                ) : (
                  getButtonText()
                )}
              </button>
            </div>
          </form>

          {/* Sign Up Section (Login mode only) */}
          {mode === 'login' && (
            <div className="mt-6 pt-5 border-t border-rh-border/30">
              <p className="text-center text-sm text-rh-muted/70 mb-3">
                New to Nala?
              </p>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setMode('signup');
                  setError('');
                  setSuccessMessage('');
                  setPasswordValue('');
                  setShowPassword(false);
                }}
                className="w-full py-2.5 bg-transparent border border-rh-border/60 hover:border-rh-green/40 hover:bg-rh-green/5 text-white font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/50"
              >
                Create an Account
              </button>
            </div>
          )}

          {/* Back to Sign In (Set Password / Signup modes) */}
          {(mode === 'set-password' || mode === 'signup') && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMessage('');
                setConfirmPassword('');
                setDisplayName('');
                setEmail('');
                setShowPassword(false);
                setShowConfirmPassword(false);
                setAcceptedTerms(false);
              }}
              className="w-full mt-5 text-sm text-rh-muted/70 hover:text-white transition-colors"
            >
              ← Back to Sign In
            </button>
          )}
          </>
          )}
        </div>

        {/* Footer - Trust Signal */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-rh-muted/40">
          <LockIcon />
          <span>Your connection is secure</span>
        </div>
      </div>

      <PrivacyPolicyModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
        initialTab={privacyTab}
      />
    </div>
  );
}
