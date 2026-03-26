/** Human-readable relative time (e.g. "5m ago", "2h ago", "3d ago"). */
export function timeAgo(ts: number | string | Date): string {
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Returns true when a percent change rounds to +0.00% or -0.00% */
export function isEffectivelyZero(pct: number): boolean {
  return Math.abs(pct) < 0.005;
}

/** Tailwind color class for a percent change value */
export function changeColorClass(pct: number): string {
  if (isEffectivelyZero(pct)) return 'text-rh-light-muted dark:text-rh-muted';
  return pct >= 0 ? 'text-rh-green' : 'text-rh-red';
}

/** Format a date string as "Mon D" (e.g. "Mar 26") */
export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Heatmap color — interpolates from neutral base to green (up) or red (down).
 * Power curve ensures even small moves (±0.3%) are visible.
 */
export function getHeatColor(pct: number, dark = true): string {
  const c = Math.max(-5, Math.min(5, pct));
  const [bR, bG, bB] = dark ? [62, 66, 78] : [200, 202, 206];
  const upTarget = dark ? [18, 170, 36] : [30, 175, 45];
  const downTarget = dark ? [200, 58, 50] : [215, 55, 50];

  if (c > 0) {
    const t = Math.pow(Math.min(c / 2.5, 1), 0.55);
    return `rgb(${Math.round(bR + (upTarget[0] - bR) * t)},${Math.round(bG + (upTarget[1] - bG) * t)},${Math.round(bB + (upTarget[2] - bB) * t)})`;
  } else if (c < 0) {
    const t = Math.pow(Math.min(Math.abs(c) / 2.5, 1), 0.55);
    return `rgb(${Math.round(bR + (downTarget[0] - bR) * t)},${Math.round(bG + (downTarget[1] - bG) * t)},${Math.round(bB + (downTarget[2] - bB) * t)})`;
  }
  return `rgb(${bR},${bG},${bB})`;
}
