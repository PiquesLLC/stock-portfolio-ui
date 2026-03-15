import { useState, useEffect } from 'react';

export function readIsDarkFromDom(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(readIsDarkFromDom);
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => setIsDark(readIsDarkFromDom()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}
