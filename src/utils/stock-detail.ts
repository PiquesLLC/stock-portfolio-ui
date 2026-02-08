export function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export function formatLargeNumber(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}T`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}B`;
  return `${v.toFixed(2)}M`;
}

export function formatVolume(v: number | null): string {
  if (v === null) return 'N/A';
  // avgVolume10D from Finnhub is in millions
  if (v >= 1000) return `${(v / 1000).toFixed(2)}B`;
  return `${v.toFixed(2)}M`;
}

export function formatPercent(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function inferExchangeLabel(ticker: string): string | null {
  const t = ticker.toUpperCase();
  if (t.endsWith('.TO')) return 'TSX';
  if (t.endsWith('.V')) return 'TSX-V';
  if (t.endsWith('.L')) return 'LSE';
  if (t.endsWith('.PA')) return 'Euronext Paris';
  if (t.endsWith('.AS')) return 'Euronext Amsterdam';
  if (t.endsWith('.DE')) return 'Xetra';
  if (t.endsWith('.MI')) return 'Borsa Italiana';
  if (t.endsWith('.T')) return 'Tokyo';
  if (t.endsWith('.HK')) return 'HKEX';
  if (t.endsWith('.AX')) return 'ASX';
  if (t.includes('=F')) return 'Futures';
  if (t.endsWith('-USD') || t.endsWith('-CAD') || t.endsWith('-EUR')) return 'Crypto';
  return null;
}
