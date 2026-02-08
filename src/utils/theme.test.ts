import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInitialTheme, applyTheme } from './theme';

describe('getInitialTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns dark by default', () => {
    expect(getInitialTheme()).toBe('dark');
  });

  it('returns light when stored', () => {
    localStorage.setItem('theme', 'light');
    expect(getInitialTheme()).toBe('light');
  });

  it('returns dark for any non-light value', () => {
    localStorage.setItem('theme', 'auto');
    expect(getInitialTheme()).toBe('dark');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('adds dark class for dark theme', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('removes dark class for light theme', () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
