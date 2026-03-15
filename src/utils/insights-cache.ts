import { HealthScore as HealthScoreType, PortfolioIntelligenceResponse } from '../types';

export const INSIGHTS_CACHE_TTL_MS = 5 * 60 * 1000;

export const insightsCache: {
  healthScore: HealthScoreType | null;
  intelligence: PortfolioIntelligenceResponse | null;
  lastFetchTime: number | null;
} = {
  healthScore: null,
  intelligence: null,
  lastFetchTime: null,
};

export function clearInsightsCache(): void {
  insightsCache.healthScore = null;
  insightsCache.intelligence = null;
  insightsCache.lastFetchTime = null;
}
