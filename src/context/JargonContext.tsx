import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

type JargonMode = 'beginner' | 'advanced';

interface JargonContextValue {
  mode: JargonMode;
  toggle: () => void;
}

const JargonContext = createContext<JargonContextValue>({ mode: 'beginner', toggle: () => {} });

const STORAGE_KEY = 'jargonMode';

export function JargonProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<JargonMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'advanced' ? 'advanced' : 'beginner';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(prev => prev === 'beginner' ? 'advanced' : 'beginner');
  }, []);

  return (
    <JargonContext.Provider value={{ mode, toggle }}>
      {children}
    </JargonContext.Provider>
  );
}

export function useJargon() {
  return useContext(JargonContext);
}
