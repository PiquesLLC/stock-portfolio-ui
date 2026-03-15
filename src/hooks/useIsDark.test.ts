import { afterEach, describe, expect, it, vi } from 'vitest';
import { readIsDarkFromDom } from './useIsDark';

describe('readIsDarkFromDom', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when document is unavailable', () => {
    vi.stubGlobal('document', undefined);

    expect(readIsDarkFromDom()).toBe(false);
  });

  it('reads the dark class from documentElement when available', () => {
    document.documentElement.classList.add('dark');

    expect(readIsDarkFromDom()).toBe(true);

    document.documentElement.classList.remove('dark');
  });
});
