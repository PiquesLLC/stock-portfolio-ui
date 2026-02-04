import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { setPassword as apiSetPassword, checkHasPassword } from '../api';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'set-password'>('login');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (mode === 'set-password') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }
        await apiSetPassword(username, password);
        setSuccessMessage('Password set successfully! You can now log in.');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-rh-light-bg dark:bg-rh-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-rh-light-text dark:text-rh-text">
            Nala
          </h1>
          <p className="text-rh-light-muted dark:text-rh-muted mt-2">
            Portfolio Tracking
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-rh-card rounded-xl p-6 shadow-lg border border-gray-200 dark:border-rh-border">
          <h2 className="text-xl font-semibold text-rh-light-text dark:text-rh-text mb-6">
            {mode === 'login' ? 'Sign In' : 'Set Password'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-600 dark:text-green-400 text-sm">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1.5"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={checkAndSwitchMode}
                  className="w-full px-3 py-2.5 bg-white dark:bg-rh-dark border border-gray-200 dark:border-rh-border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green focus:border-transparent"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-rh-dark border border-gray-200 dark:border-rh-border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green focus:border-transparent"
                  placeholder={mode === 'set-password' ? 'Create a password' : 'Enter your password'}
                  autoComplete={mode === 'set-password' ? 'new-password' : 'current-password'}
                  required
                />
              </div>

              {mode === 'set-password' && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-rh-dark border border-gray-200 dark:border-rh-border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-rh-muted focus:outline-none focus:ring-2 focus:ring-rh-green focus:border-transparent"
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-rh-green hover:bg-rh-green/90 disabled:bg-rh-green/50 text-white font-semibold rounded-lg transition-colors duration-150"
              >
                {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Set Password'}
              </button>
            </div>
          </form>

          {mode === 'set-password' && (
            <button
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMessage('');
              }}
              className="w-full mt-3 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text"
            >
              Back to Sign In
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mt-6">
          Secure portfolio tracking
        </p>
      </div>
    </div>
  );
}
