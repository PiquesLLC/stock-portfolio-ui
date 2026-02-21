import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser, signup as apiSignup, verifyMfa as apiVerifyMfa, isMfaChallenge, setAuthExpiredHandler, isSameOriginApi, verifySignupEmail as apiVerifyEmail, resendSignupVerification as apiResendVerification, oauthGoogleLogin as apiOauthGoogle, oauthAppleLogin as apiOauthApple } from '../api';

export type PlanTier = 'free' | 'pro' | 'premium';

interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  emailVerified?: boolean;
  plan?: PlanTier;
  planExpiresAt?: string | null;
  createdAt?: string;
}

export interface MfaChallenge {
  challengeToken: string;
  methods: string[];
  maskedEmail: string | null;
}

interface SignupResult {
  emailVerificationRequired?: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaChallenge: MfaChallenge | null;
  login: (username: string, password: string) => Promise<void>;
  verifyMfa: (code: string, method: 'totp' | 'email' | 'backup') => Promise<void>;
  clearMfaChallenge: () => void;
  signup: (username: string, displayName: string, password: string, email: string, consent?: { acceptedPrivacyPolicy: boolean; acceptedTerms: boolean }, referralCode?: string) => Promise<SignupResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<{ isNewUser: boolean }>;
  loginWithApple: (idToken: string, user?: { firstName?: string; lastName?: string }, nonce?: string) => Promise<{ isNewUser: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Dev mode: set VITE_DEV_USER_ID in .env.local to skip login
const DEV_USER = import.meta.env.VITE_DEV_USER_ID ? {
  id: import.meta.env.VITE_DEV_USER_ID as string,
  username: (import.meta.env.VITE_DEV_USERNAME as string) || 'DevUser',
  displayName: (import.meta.env.VITE_DEV_DISPLAY_NAME as string) || 'Dev User',
} : null;

const STORAGE_KEY = 'nala_auth_user';

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.id || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    }
  } catch {
    // Ignore storage errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (DEV_USER) return DEV_USER;
    return readCachedUser();
  });
  const [isLoading, setIsLoading] = useState(true);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);

  // Check if user is authenticated on mount (cookie-based auth)
  useEffect(() => {
    // Dev mode bypass - skip login entirely
    if (DEV_USER) {
      setUser(DEV_USER);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 5;
    const baseDelayMs = 500;

    const loadUser = async () => {
      try {
        const current = await getCurrentUser();
        if (cancelled) return;
        const u: User = { ...current, plan: current.plan as PlanTier | undefined };
        setUser(u);
        writeCachedUser(u);
        setIsLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        const msg = (err?.message || '').toLowerCase();
        const isAuthError = msg.includes('401') || msg.includes('not authenticated') || msg.includes('unauthorized') || msg.includes('session expired') || msg.includes('token expired');
        if (isAuthError) {
          if (isSameOriginApi()) {
            setUser(null);
            writeCachedUser(null);
          } else {
            console.warn('[Auth] Not logging out due to cross-origin API base (cookies likely blocked).');
          }
          setIsLoading(false);
          return;
        }

        attempt += 1;
        if (attempt >= maxAttempts) {
          // Keep cached user (if any) when backend is temporarily unavailable
          setIsLoading(false);
          return;
        }
        const delay = Math.min(4000, baseDelayMs * (2 ** (attempt - 1)));
        setTimeout(loadUser, delay);
      }
    };

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);
  const login = useCallback(async (username: string, password: string) => {
    const response = await apiLogin(username, password);
    if (isMfaChallenge(response)) {
      // MFA required — store challenge, don't set user yet
      setMfaChallenge({
        challengeToken: response.challengeToken,
        methods: response.methods,
        maskedEmail: response.maskedEmail,
      });
      return;
    }
    // No MFA — login sets httpOnly cookie automatically
    setUser(response.user);
    writeCachedUser(response.user);
  }, []);

  const verifyMfa = useCallback(async (code: string, method: 'totp' | 'email' | 'backup') => {
    if (!mfaChallenge) throw new Error('No MFA challenge active');
    const response = await apiVerifyMfa(mfaChallenge.challengeToken, code, method);
    setMfaChallenge(null);
    setUser(response.user);
    writeCachedUser(response.user);
  }, [mfaChallenge]);

  const clearMfaChallenge = useCallback(() => {
    setMfaChallenge(null);
  }, []);

  const signup = useCallback(async (username: string, displayName: string, password: string, email: string, consent?: { acceptedPrivacyPolicy: boolean; acceptedTerms: boolean }, referralCode?: string): Promise<SignupResult> => {
    // Signup sets httpOnly cookie automatically (auto-login)
    const response = await apiSignup(username, displayName, password, email, consent, referralCode);
    if (response.emailVerificationRequired) {
      // Don't set user yet — show verification screen first
      return { emailVerificationRequired: true, email };
    }
    setUser(response.user);
    writeCachedUser(response.user);
    return {};
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    await apiVerifyEmail(email, code);
    // After verification, fetch the updated user (now emailVerified=true)
    const current = await getCurrentUser();
    const u: User = { ...current, plan: current.plan as PlanTier | undefined };
    setUser(u);
    writeCachedUser(u);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await apiResendVerification(email);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string): Promise<{ isNewUser: boolean }> => {
    const response = await apiOauthGoogle(credential);
    if (isMfaChallenge(response)) {
      setMfaChallenge({
        challengeToken: response.challengeToken,
        methods: response.methods,
        maskedEmail: response.maskedEmail,
      });
      return { isNewUser: false };
    }
    setUser(response.user);
    writeCachedUser(response.user);
    return { isNewUser: response.isNewUser };
  }, []);

  const loginWithApple = useCallback(async (
    idToken: string,
    appleUser?: { firstName?: string; lastName?: string },
    nonce?: string,
  ): Promise<{ isNewUser: boolean }> => {
    const response = await apiOauthApple(idToken, appleUser, nonce);
    if (isMfaChallenge(response)) {
      setMfaChallenge({
        challengeToken: response.challengeToken,
        methods: response.methods,
        maskedEmail: response.maskedEmail,
      });
      return { isNewUser: false };
    }
    setUser(response.user);
    writeCachedUser(response.user);
    return { isNewUser: response.isNewUser };
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to clear cookie server-side
      await apiLogout();
    } catch {
      // Even if logout request fails, clear local state
    }
    setUser(null);
    writeCachedUser(null);
  }, []);

  // When any API call gets an unrecoverable 401, force back to login
  useEffect(() => {
    setAuthExpiredHandler(() => {
      if (isSameOriginApi()) {
        setUser(null);
        writeCachedUser(null);
      } else {
        console.warn('[Auth] Skipping auto-logout due to cross-origin API base.');
      }
    });
    return () => setAuthExpiredHandler(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        mfaChallenge,
        login,
        verifyMfa,
        clearMfaChallenge,
        signup,
        verifyEmail,
        resendVerification,
        loginWithGoogle,
        loginWithApple,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}


