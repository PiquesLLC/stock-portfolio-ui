import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

function storageKey(currentUserId: string | undefined): string {
  return currentUserId ? `nala:muted-users:${currentUserId}` : 'nala:muted-users';
}

function loadMuted(key: string): Map<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const parsed: [string, string][] = JSON.parse(raw);
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function saveMuted(key: string, map: Map<string, string>) {
  localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
}

/**
 * Hook for managing muted users in the activity feed.
 * Stores userId → displayName pairs in localStorage, scoped per current user.
 */
export function useMutedUsers() {
  const { user } = useAuth();
  const key = storageKey(user?.id);
  const [mutedMap, setMutedMap] = useState<Map<string, string>>(() => loadMuted(key));

  const isMuted = useCallback((userId: string) => mutedMap.has(userId), [mutedMap]);

  const toggleMute = useCallback((userId: string, displayName: string) => {
    setMutedMap((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.set(userId, displayName);
      }
      saveMuted(key, next);
      return next;
    });
  }, [key]);

  const unmute = useCallback((userId: string) => {
    setMutedMap((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      saveMuted(key, next);
      return next;
    });
  }, [key]);

  return {
    mutedMap,
    isMuted,
    toggleMute,
    unmute,
    mutedList: Array.from(mutedMap.entries()).map(([userId, displayName]) => ({ userId, displayName })),
  };
}
