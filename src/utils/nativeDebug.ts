/**
 * Temporary native debug log — visible on-device via NativeDebugOverlay.
 * Remove after native auth is confirmed working.
 */

const MAX_ENTRIES = 80;
const entries: string[] = [];
let listeners: (() => void)[] = [];

export function nativeLog(tag: string, msg: string, data?: unknown): void {
  const time = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const line = data !== undefined
    ? `${time} [${tag}] ${msg}: ${JSON.stringify(data).slice(0, 300)}`
    : `${time} [${tag}] ${msg}`;
  entries.push(line);
  if (entries.length > MAX_ENTRIES) entries.shift();
  listeners.forEach(fn => fn());
  // Also log to console for Safari remote inspector
  console.log(`[NalaDebug] ${line}`);
}

export function getNativeLog(): string[] {
  return [...entries];
}

export function clearNativeLog(): void {
  entries.length = 0;
  listeners.forEach(fn => fn());
}

export function subscribeNativeLog(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}
