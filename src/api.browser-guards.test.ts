import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOriginApi } from './api';

describe('api browser guards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats API as same-origin when window is unavailable', () => {
    vi.stubGlobal('window', undefined);

    expect(isSameOriginApi()).toBe(true);
  });
});
