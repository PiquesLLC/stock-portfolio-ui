import { useState, useCallback } from 'react';

interface UseLocalStorageOptions<T> {
  /** Custom serializer (default: JSON.stringify) */
  serialize?: (value: T) => string;
  /** Custom deserializer (default: JSON.parse) */
  deserialize?: (raw: string) => T;
}

/**
 * useState backed by localStorage with automatic JSON serialization.
 * Supports updater functions like useState.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: UseLocalStorageOptions<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? JSON.parse;

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return deserialize(raw);
    } catch { /* ignore corrupt/missing data */ }
    return defaultValue;
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, serialize(next));
        } catch { /* quota exceeded or private browsing */ }
        return next;
      });
    },
    [key, serialize],
  );

  return [storedValue, setValue];
}
