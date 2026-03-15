function getThemeStorage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function getInitialTheme(): 'dark' | 'light' {
  const stored = getThemeStorage()?.getItem('theme');
  if (stored === 'light') return 'light';
  return 'dark';
}

export function applyTheme(theme: 'dark' | 'light') {
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  getThemeStorage()?.setItem('theme', theme);
}
