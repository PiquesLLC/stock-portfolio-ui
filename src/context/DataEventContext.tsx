import { createContext, useContext, useCallback, useRef } from 'react';

type DataEventType = 'watchlist:changed' | 'portfolio:changed';
type Listener = () => void;

interface DataEventContextValue {
  emit: (type: DataEventType) => void;
  on: (type: DataEventType, listener: Listener) => () => void;
}

const DataEventContext = createContext<DataEventContextValue | null>(null);

export function useDataEvents() {
  const ctx = useContext(DataEventContext);
  if (!ctx) throw new Error('useDataEvents must be inside DataEventProvider');
  return ctx;
}

export function DataEventProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Map<DataEventType, Set<Listener>>>(new Map());

  const emit = useCallback((type: DataEventType) => {
    const set = listenersRef.current.get(type);
    if (set) set.forEach(fn => fn());
  }, []);

  const on = useCallback((type: DataEventType, listener: Listener) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(listener);
    return () => { listenersRef.current.get(type)?.delete(listener); };
  }, []);

  return (
    <DataEventContext.Provider value={{ emit, on }}>
      {children}
    </DataEventContext.Provider>
  );
}
