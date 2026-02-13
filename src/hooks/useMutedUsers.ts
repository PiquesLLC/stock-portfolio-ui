import { useState, useCallback } from 'react';

const STORAGE_KEY = 'nala:muted-users';

function loadMuted(): Map<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: [string, string][] = JSON.parse(raw);
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function saveMuted(map: Map<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
}

/**
 * Hook for managing muted users in the activity feed.
 * Stores userId → displayName pairs in localStorage.
 */
export function useMutedUsers() {
  const [mutedMap, setMutedMap] = useState<Map<string, string>>(loadMuted);

  const isMuted = useCallback((userId: string) => mutedMap.has(userId), [mutedMap]);

  const toggleMute = useCallback((userId: string, displayName: string) => {
    setMutedMap((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.set(userId, displayName);
      }
      saveMuted(next);
      return next;
    });
  }, []);

  const unmute = useCallback((userId: string) => {
    setMutedMap((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      saveMuted(next);
      return next;
    });
  }, []);

  return {
    mutedMap,
    isMuted,
    toggleMute,
    unmute,
    mutedList: Array.from(mutedMap.entries()).map(([userId, displayName]) => ({ userId, displayName })),
  };
}
