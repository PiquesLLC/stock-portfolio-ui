import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser, signup as apiSignup, setAuthExpiredHandler, isSameOriginApi } from '../api';

interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, displayName: string, password: string) => Promise<void>;
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
        setUser(current);
        writeCachedUser(current);
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
    // Login sets httpOnly cookie automatically
    const response = await apiLogin(username, password);
    setUser(response.user);
    writeCachedUser(response.user);
  }, []);

  const signup = useCallback(async (username: string, displayName: string, password: string) => {
    // Signup sets httpOnly cookie automatically (auto-login)
    const response = await apiSignup(username, displayName, password);
    setUser(response.user);
    writeCachedUser(response.user);
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
        login,
        signup,
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


