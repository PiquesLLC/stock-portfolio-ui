import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { setPassword as apiSetPassword, checkHasPassword } from '../api';

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
  const { login, signup } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'set-password' | 'signup'>('login');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (!username.trim() || !displayName.trim()) {
          setError('Username and display name are required');
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
        await signup(username, displayName, password);
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

  const getTitle = () => {
    switch (mode) {
      case 'signup': return 'Create Account';
      case 'set-password': return 'Set Password';
      default: return 'Welcome Back';
    }
  };

  const getButtonText = () => {
    switch (mode) {
      case 'signup': return 'Create Account';
      case 'set-password': return 'Set Password';
      default: return 'Sign In';
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-rh-dark border border-rh-border rounded-lg text-white placeholder-rh-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/60 focus-visible:border-rh-green transition-all duration-150";

  return (
    <div className="min-h-screen flex items-center justify-center bg-rh-black px-4 py-8">
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
                        showToast('Password reset coming soon. Contact support for help.', 'info');
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
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className="w-full mt-5 text-sm text-rh-muted/70 hover:text-white transition-colors"
            >
              ← Back to Sign In
            </button>
          )}
        </div>

        {/* Footer - Trust Signal */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-rh-muted/40">
          <LockIcon />
          <span>Your connection is secure</span>
        </div>
      </div>
    </div>
  );
}
