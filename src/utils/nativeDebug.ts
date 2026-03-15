/**
 * Temporary native debug log — visible on-device via NativeDebugOverlay.
 * Remove after native auth is confirmed working.
 */

const MAX_ENTRIES = 120;
const STORAGE_KEY = 'nala_native_debug_lines';
const entries: string[] = [];
let listeners: (() => void)[] = [];

function persistEntries(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Ignore storage failures
  }
}

function loadEntries(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries.splice(0, entries.length, ...parsed.filter((v): v is string => typeof v === 'string').slice(-MAX_ENTRIES));
    }
  } catch {
    // Ignore corrupt debug storage
  }
}

loadEntries();

export function nativeLog(tag: string, msg: string, data?: unknown): void {
  const time = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const line = data !== undefined
    ? `${time} [${tag}] ${msg}: ${JSON.stringify(data).slice(0, 300)}`
    : `${time} [${tag}] ${msg}`;
  entries.push(line);
  if (entries.length > MAX_ENTRIES) entries.shift();
  persistEntries();
  listeners.forEach(fn => fn());
  // Also log to console for Safari remote inspector
  console.log(`[NalaDebug] ${line}`);
}

export function getNativeLog(): string[] {
  return [...entries];
}

export function clearNativeLog(): void {
  entries.length = 0;
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  listeners.forEach(fn => fn());
}

export function subscribeNativeLog(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}
