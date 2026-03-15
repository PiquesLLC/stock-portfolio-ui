import { EarningsPreviewItem } from '../api';

export interface UpcomingEarningCacheEntry {
  ticker: string;
  date: string;
  dateMs: number;
  estimatedEPS: number | null;
  daysUntil: number;
  dayLabel: string;
}

export const EARNINGS_CACHE_TTL_MS = 5 * 60 * 1000;

export const earningsPreviewCache = new Map<
  string | undefined,
  { data: EarningsPreviewItem[]; partial: boolean; timestamp: number }
>();

export const earningsUpcomingCache = new Map<
  string | undefined,
  { data: UpcomingEarningCacheEntry[]; timestamp: number }
>();

export function clearEarningsPreviewCache(): void {
  earningsPreviewCache.clear();
}

export function clearEarningsTabCache(): void {
  earningsUpcomingCache.clear();
}
