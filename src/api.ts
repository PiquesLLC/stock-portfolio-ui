import { API_BASE_URL } from './config';
import {
  Portfolio,
  ProjectionResponse,
  MetricsResponse,
  HoldingInput,
  DividendEvent,
  DividendInput,
  ProjectionMode,
  LookbackPeriod,
  PerformanceSummary,
  BaselineInput,
  BrokerLifetimeInput,
  Settings,
  SettingsUpdateInput,
  HealthScore,
  Attribution,
  AttributionWindow,
  LeakDetectorResult,
  RiskForecast,
  Goal,
  GoalInput,
  SymbolSearchResponse,
  PortfolioIntelligenceResponse,
  IntelligenceWindow,
  CurrentPaceResponse,
  PaceWindow,
  YtdSettings,
  LeaderboardWindow,
  LeaderboardResponse,
  UserInfo,
  UserProfile,
  ActivityEvent,
  StockDetailsResponse,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function getPortfolio(): Promise<Portfolio> {
  return fetchJson<Portfolio>(`${API_BASE_URL}/portfolio`);
}

export async function getProjections(
  mode: ProjectionMode = 'sp500',
  lookback: LookbackPeriod = '1y'
): Promise<ProjectionResponse> {
  const params = new URLSearchParams({ mode });
  if (mode === 'realized') {
    params.append('lookback', lookback);
  }
  return fetchJson<ProjectionResponse>(`${API_BASE_URL}/portfolio/projections?${params}`);
}

export async function getMetrics(lookback: LookbackPeriod = '1y'): Promise<MetricsResponse> {
  return fetchJson<MetricsResponse>(`${API_BASE_URL}/portfolio/metrics?lookback=${lookback}`);
}

export async function updateCashBalance(cashBalance: number): Promise<{ cashBalance: number }> {
  return fetchJson<{ cashBalance: number }>(`${API_BASE_URL}/portfolio/cash`, {
    method: 'PUT',
    body: JSON.stringify({ cashBalance }),
  });
}

export async function addHolding(holding: HoldingInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings`, {
    method: 'POST',
    body: JSON.stringify(holding),
  });
}

export async function deleteHolding(ticker: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings/${ticker}`, {
    method: 'DELETE',
  });
}

// Dividend endpoints
export async function getDividends(): Promise<DividendEvent[]> {
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends`);
}

export async function addDividend(dividend: DividendInput): Promise<DividendEvent> {
  return fetchJson<DividendEvent>(`${API_BASE_URL}/dividends`, {
    method: 'POST',
    body: JSON.stringify(dividend),
  });
}

export async function deleteDividend(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/dividends/${id}`, {
    method: 'DELETE',
  });
}

// Settings endpoints
export async function getSettings(): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE_URL}/settings`);
}

export async function updateSettings(input: SettingsUpdateInput): Promise<Settings> {
  return fetchJson<Settings>(`${API_BASE_URL}/settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function setBaseline(input: BaselineInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/baseline`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function setBrokerLifetime(input: BrokerLifetimeInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/broker-lifetime`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearBrokerLifetime(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/broker-lifetime`, {
    method: 'DELETE',
  });
}

// Performance summary endpoint
export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  return fetchJson<PerformanceSummary>(`${API_BASE_URL}/portfolio/summary`);
}

// Insights endpoints
export async function getHealthScore(): Promise<HealthScore> {
  return fetchJson<HealthScore>(`${API_BASE_URL}/insights/health`);
}

export async function getAttribution(window: AttributionWindow = '1d'): Promise<Attribution> {
  return fetchJson<Attribution>(`${API_BASE_URL}/insights/attribution?window=${window}`);
}

export async function getLeakDetector(): Promise<LeakDetectorResult> {
  return fetchJson<LeakDetectorResult>(`${API_BASE_URL}/insights/leak-detector`);
}

export async function getRiskForecast(): Promise<RiskForecast> {
  return fetchJson<RiskForecast>(`${API_BASE_URL}/insights/risk-forecast`);
}

// Goals endpoints
export async function getGoals(): Promise<Goal[]> {
  return fetchJson<Goal[]>(`${API_BASE_URL}/goals`);
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  return fetchJson<Goal>(`${API_BASE_URL}/goals`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateGoal(id: string, input: Partial<GoalInput>): Promise<Goal> {
  return fetchJson<Goal>(`${API_BASE_URL}/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/goals/${id}`, {
    method: 'DELETE',
  });
}

// Symbol search endpoint
export async function searchSymbols(
  query: string,
  heldTickers: string[] = []
): Promise<SymbolSearchResponse> {
  if (!query.trim()) {
    return {
      results: [],
      meta: { query: '', count: 0, partial: false, cached: false, advPending: [] },
    };
  }

  let url = `${API_BASE_URL}/market/search?q=${encodeURIComponent(query.trim())}`;

  // Add held tickers to help with ranking
  if (heldTickers.length > 0) {
    url += `&held=${encodeURIComponent(heldTickers.join(','))}`;
  }

  return fetchJson<SymbolSearchResponse>(url);
}

// Current Pace endpoint
export async function getCurrentPace(window: PaceWindow = '1M'): Promise<CurrentPaceResponse> {
  return fetchJson<CurrentPaceResponse>(`${API_BASE_URL}/portfolio/projections/current-pace?window=${window}`);
}

// YTD Settings endpoints
export async function getYtdSettings(): Promise<YtdSettings> {
  return fetchJson<YtdSettings>(`${API_BASE_URL}/settings/ytd`);
}

export async function setYtdSettings(input: { ytdStartEquity: number; netContributionsYTD?: number }): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/ytd`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function clearYtdSettings(): Promise<void> {
  await fetchJson(`${API_BASE_URL}/settings/ytd`, {
    method: 'DELETE',
  });
}

// Portfolio Intelligence endpoint
export async function getPortfolioIntelligence(
  window: IntelligenceWindow = '1d'
): Promise<PortfolioIntelligenceResponse> {
  return fetchJson<PortfolioIntelligenceResponse>(
    `${API_BASE_URL}/intelligence?window=${window}`
  );
}

// Leaderboard endpoints
export async function getLeaderboard(window: LeaderboardWindow = '1M'): Promise<LeaderboardResponse> {
  return fetchJson<LeaderboardResponse>(`${API_BASE_URL}/leaderboard?window=${window}`);
}

export async function getUsers(): Promise<UserInfo[]> {
  return fetchJson<UserInfo[]>(`${API_BASE_URL}/users`);
}

export async function getUserPortfolio(userId: string): Promise<Portfolio> {
  return fetchJson<Portfolio>(`${API_BASE_URL}/users/${userId}/portfolio`);
}

// Social endpoints
export async function getUserProfile(userId: string, viewerId?: string): Promise<UserProfile> {
  const params = viewerId ? `?viewerId=${viewerId}` : '';
  return fetchJson<UserProfile>(`${API_BASE_URL}/users/${userId}/profile${params}`);
}

export async function followUser(targetUserId: string, followerId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'POST',
    body: JSON.stringify({ followerId }),
  });
}

export async function unfollowUser(targetUserId: string, followerId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${targetUserId}/follow`, {
    method: 'DELETE',
    body: JSON.stringify({ followerId }),
  });
}

export async function getFeed(userId: string, before?: string): Promise<{ events: ActivityEvent[] }> {
  const params = new URLSearchParams({ userId });
  if (before) params.append('before', before);
  return fetchJson<{ events: ActivityEvent[] }>(`${API_BASE_URL}/social/feed?${params}`);
}

export async function getFollowers(userId: string): Promise<{ id: string; username: string; displayName: string }[]> {
  return fetchJson(`${API_BASE_URL}/users/${userId}/followers`);
}

export async function getFollowingList(userId: string): Promise<{ id: string; username: string; displayName: string }[]> {
  return fetchJson(`${API_BASE_URL}/users/${userId}/following`);
}

export async function getStockDetails(ticker: string): Promise<StockDetailsResponse> {
  return fetchJson<StockDetailsResponse>(`${API_BASE_URL}/market/stock/${ticker}/details`);
}

export async function getStockQuote(ticker: string): Promise<StockDetailsResponse['quote']> {
  return fetchJson<StockDetailsResponse['quote']>(`${API_BASE_URL}/market/quote/${ticker}`);
}

export interface IntradayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getIntradayCandles(ticker: string): Promise<IntradayCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[] }>(`${API_BASE_URL}/market/stock/${ticker}/intraday`);
  return resp.candles;
}

export async function getUserIntelligence(
  userId: string,
  window: IntelligenceWindow = '1d'
): Promise<PortfolioIntelligenceResponse> {
  return fetchJson<PortfolioIntelligenceResponse>(
    `${API_BASE_URL}/users/${userId}/intelligence?window=${window}`
  );
}
