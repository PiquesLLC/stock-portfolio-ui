import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

type JargonMode = 'beginner' | 'advanced';

interface JargonContextValue {
  mode: JargonMode;
  toggle: () => void;
}

const JargonContext = createContext<JargonContextValue>({ mode: 'beginner', toggle: () => {} });

export function JargonProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useLocalStorage<JargonMode>('jargonMode', 'beginner', {
    serialize: v => v,
    deserialize: v => (v === 'advanced' ? 'advanced' : 'beginner'),
  });

  const toggle = useCallback(() => {
    setMode(prev => prev === 'beginner' ? 'advanced' : 'beginner');
  }, [setMode]);

  return (
    <JargonContext.Provider value={{ mode, toggle }}>
      {children}
    </JargonContext.Provider>
  );
}

export function useJargon() {
  return useContext(JargonContext);
}
