import { describe, expect, it, vi } from 'vitest';

import { generateUuid } from './uuid';

describe('generateUuid', () => {
  it('falls back when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.set(new Uint8Array([1, 35, 69, 103, 137, 171, 205, 239, 16, 50, 84, 118, 152, 186, 220, 254]));
      return array;
    });

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues },
    });

    const value = generateUuid();

    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });
});
