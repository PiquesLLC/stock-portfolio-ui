import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser, signup as apiSignup } from '../api';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated on mount (cookie-based auth)
  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // Cookie invalid or not present - user not authenticated
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // Login sets httpOnly cookie automatically
    const response = await apiLogin(username, password);
    setUser(response.user);
  }, []);

  const signup = useCallback(async (username: string, displayName: string, password: string) => {
    // Signup sets httpOnly cookie automatically (auto-login)
    const response = await apiSignup(username, displayName, password);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to clear cookie server-side
      await apiLogout();
    } catch {
      // Even if logout request fails, clear local state
    }
    setUser(null);
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
