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
  // Date-only strings parse as UTC midnight, which toLocaleDateString then
  // renders a day EARLY in all US timezones — anchor them to local midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Heatmap color — interpolates from neutral base to green (up) or red (down).
 * Power curve ensures even small moves (±0.3%) are visible.
 */
export function getHeatColor(pct: number, dark = true): string {
  return _heatColor(pct, dark, false);
}

/**
 * Polished variant — punchier saturation + faster ramp so tiles read with
 * more visual depth. Used by the heatmap polish-mode preview (?polish=1).
 */
export function getHeatColorPolished(pct: number, dark = true): string {
  return _heatColor(pct, dark, true);
}

function _heatColor(pct: number, dark: boolean, polished: boolean): string {
  const c = Math.max(-5, Math.min(5, pct));
  const [bR, bG, bB] = polished
    ? (dark ? [50, 54, 64] : [205, 207, 210])
    : (dark ? [62, 66, 78] : [200, 202, 206]);
  const upTarget = polished
    ? (dark ? [10, 200, 35] : [20, 195, 40])
    : (dark ? [18, 170, 36] : [30, 175, 45]);
  const downTarget = polished
    ? (dark ? [225, 50, 45] : [230, 55, 50])
    : (dark ? [200, 58, 50] : [215, 55, 50]);
  const denom = polished ? 2.0 : 2.5;
  const curve = polished ? 0.45 : 0.55;

  if (c > 0) {
    const t = Math.pow(Math.min(c / denom, 1), curve);
    return `rgb(${Math.round(bR + (upTarget[0] - bR) * t)},${Math.round(bG + (upTarget[1] - bG) * t)},${Math.round(bB + (upTarget[2] - bB) * t)})`;
  } else if (c < 0) {
    const t = Math.pow(Math.min(Math.abs(c) / denom, 1), curve);
    return `rgb(${Math.round(bR + (downTarget[0] - bR) * t)},${Math.round(bG + (downTarget[1] - bG) * t)},${Math.round(bB + (downTarget[2] - bB) * t)})`;
  }
  return `rgb(${bR},${bG},${bB})`;
}
