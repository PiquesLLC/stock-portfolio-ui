function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateUuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = hex(bytes);
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
  }

  const fallback = `${Date.now()}-${Math.random()}-${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < fallback.length; i++) {
    hash = ((hash << 5) - hash) + fallback.charCodeAt(i);
    hash |= 0;
  }
  const base = Math.abs(hash).toString(16).padStart(8, '0');
  return `${base.slice(0, 8)}-${base.slice(0, 4)}-4${base.slice(1, 4)}-8${base.slice(4, 7)}-${base.padEnd(12, '0').slice(0, 12)}`;
}
