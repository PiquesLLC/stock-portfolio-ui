export function nativeLog(_tag: string, _msg: string, _data?: unknown): void {
  // Intentionally a no-op in release builds.
}

export function getNativeLog(): string[] {
  return [];
}

export function clearNativeLog(): void {
  // No-op.
}

export function subscribeNativeLog(_fn: () => void): () => void {
  return () => {};
}
