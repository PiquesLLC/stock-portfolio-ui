import { API_BASE_URL } from './config';
import {
  Portfolio,
  ProjectionResponse,
  MetricsResponse,
  HoldingInput,
  DividendEvent,
  DividendEventInput,
  DividendCredit,
  DividendSummary,
  DividendReinvestment,
  DividendTimeline,
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
  LeaderboardRegion,
  LeaderboardResponse,
  UserInfo,
  UserProfile,
  ActivityEvent,
  StockDetailsResponse,
  PortfolioChartData,
  PortfolioChartPeriod,
  PerformanceData,
  PerformanceWindow,
  Transaction,
  AlertConfig,
  AlertEvent as AlertEventType,
  IncomeInsightsResponse,
  IncomeWindow,
  ETFHoldingsData,
  AssetAbout,
  PriceAlert,
  PriceAlertEvent,
  CreatePriceAlertInput,
  UpdatePriceAlertInput,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
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
export async function getDividendEvents(ticker?: string): Promise<DividendEvent[]> {
  const params = ticker ? `?ticker=${encodeURIComponent(ticker)}` : '';
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends/events${params}`);
}

export async function getUpcomingDividends(): Promise<DividendEvent[]> {
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends/events/upcoming`);
}

export async function addDividendEvent(input: DividendEventInput): Promise<DividendEvent> {
  return fetchJson<DividendEvent>(`${API_BASE_URL}/dividends/events`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteDividendEvent(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/dividends/events/${id}`, {
    method: 'DELETE',
  });
}

export async function getDividendCredits(userId?: string, ticker?: string): Promise<DividendCredit[]> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (ticker) params.set('ticker', ticker);
  const qs = params.toString();
  return fetchJson<DividendCredit[]>(`${API_BASE_URL}/dividends/credits${qs ? `?${qs}` : ''}`);
}

export async function getDividendSummary(userId?: string): Promise<DividendSummary> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return fetchJson<DividendSummary>(`${API_BASE_URL}/dividends/summary${params}`);
}

export async function syncDividends(ticker?: string): Promise<any> {
  return fetchJson(`${API_BASE_URL}/dividends/sync`, {
    method: 'POST',
    body: JSON.stringify(ticker ? { ticker } : {}),
  });
}

// DRIP (Dividend Reinvestment) endpoints
export async function getDividendTimeline(creditId: string): Promise<DividendTimeline> {
  return fetchJson<DividendTimeline>(`${API_BASE_URL}/dividends/credits/${creditId}/timeline`);
}

export async function reinvestDividend(creditId: string, userId?: string): Promise<DividendReinvestment> {
  return fetchJson<DividendReinvestment>(`${API_BASE_URL}/dividends/credits/${creditId}/reinvest`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getDividendReinvestments(userId?: string, ticker?: string): Promise<DividendReinvestment[]> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (ticker) params.set('ticker', ticker);
  const qs = params.toString();
  return fetchJson<DividendReinvestment[]>(`${API_BASE_URL}/dividends/reinvestments${qs ? `?${qs}` : ''}`);
}

export async function getDripSettings(userId?: string): Promise<{ enabled: boolean }> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return fetchJson<{ enabled: boolean }>(`${API_BASE_URL}/dividends/drip${params}`);
}

export async function updateDripSettings(enabled: boolean, userId?: string): Promise<{ enabled: boolean }> {
  return fetchJson<{ enabled: boolean }>(`${API_BASE_URL}/dividends/drip`, {
    method: 'PUT',
    body: JSON.stringify({ enabled, userId }),
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

export async function getIncomeInsights(window: IncomeWindow = 'today'): Promise<IncomeInsightsResponse> {
  return fetchJson<IncomeInsightsResponse>(`${API_BASE_URL}/insights/income?window=${window}`);
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
export async function getLeaderboard(window: LeaderboardWindow = '1M', region: LeaderboardRegion = 'world'): Promise<LeaderboardResponse> {
  return fetchJson<LeaderboardResponse>(`${API_BASE_URL}/leaderboard?window=${window}&region=${region}`);
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

export async function updateUserRegion(userId: string, region: string | null, showRegion: boolean): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${userId}/region`, {
    method: 'PUT',
    body: JSON.stringify({ region, showRegion }),
  });
}

export async function updateHoldingsVisibility(userId: string, holdingsVisibility: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/users/${userId}/holdings-visibility`, {
    method: 'PUT',
    body: JSON.stringify({ holdingsVisibility }),
  });
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

export async function getETFHoldings(ticker: string): Promise<ETFHoldingsData | null> {
  try {
    return await fetchJson<ETFHoldingsData>(`${API_BASE_URL}/market/stock/${ticker}/etf-holdings`);
  } catch {
    return null;
  }
}

export async function getAssetAbout(ticker: string): Promise<AssetAbout | null> {
  try {
    return await fetchJson<AssetAbout>(`${API_BASE_URL}/market/stock/${ticker}/about`);
  } catch {
    return null;
  }
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

export async function getHourlyCandles(ticker: string, period: '1W' | '1M'): Promise<IntradayCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: IntradayCandle[] }>(`${API_BASE_URL}/market/stock/${ticker}/hourly?period=${period}`);
  return resp.candles;
}

export interface BenchmarkCandle {
  date: string;
  time: number;
  close: number;
}

export async function getBenchmarkCloses(ticker: string = 'SPY'): Promise<BenchmarkCandle[]> {
  const resp = await fetchJson<{ ticker: string; candles: BenchmarkCandle[] }>(`${API_BASE_URL}/market/benchmark/${ticker}/closes`);
  return resp.candles;
}

export async function getPortfolioChart(period: PortfolioChartPeriod = '1D'): Promise<PortfolioChartData> {
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/portfolio/history/chart?period=${period}`);
}

export async function getUserChart(userId: string, period: PortfolioChartPeriod = '1D'): Promise<PortfolioChartData> {
  return fetchJson<PortfolioChartData>(`${API_BASE_URL}/users/${userId}/chart?period=${period}`);
}

// Performance comparison endpoint
export async function getPerformance(
  window: PerformanceWindow = '1M',
  benchmark: string = 'SPY'
): Promise<PerformanceData> {
  return fetchJson<PerformanceData>(
    `${API_BASE_URL}/portfolio/performance?window=${window}&benchmark=${benchmark}`
  );
}

// Transaction endpoints
export async function getTransactions(): Promise<Transaction[]> {
  return fetchJson<Transaction[]>(`${API_BASE_URL}/transactions`);
}

export async function addTransaction(input: { type: 'deposit' | 'withdrawal'; amount: number; date: string }): Promise<Transaction> {
  return fetchJson<Transaction>(`${API_BASE_URL}/transactions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' });
}

// Alert endpoints
export async function getAlerts(userId: string): Promise<AlertConfig[]> {
  return fetchJson<AlertConfig[]>(`${API_BASE_URL}/alerts?userId=${userId}`);
}

export async function updateAlertConfig(id: string, data: { threshold?: number | null; enabled?: boolean }): Promise<AlertConfig> {
  return fetchJson<AlertConfig>(`${API_BASE_URL}/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getAlertEvents(userId: string): Promise<AlertEventType[]> {
  return fetchJson<AlertEventType[]>(`${API_BASE_URL}/alerts/events?userId=${userId}`);
}

export async function getUnreadAlertCount(userId: string): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(`${API_BASE_URL}/alerts/events/unread-count?userId=${userId}`);
}

export async function markAlertRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/alerts/events/${eventId}/read`, { method: 'POST' });
}

export async function markAllAlertsRead(userId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/alerts/events/read-all?userId=${userId}`, { method: 'POST' });
}

export async function getUserIntelligence(
  userId: string,
  window: IntelligenceWindow = '1d'
): Promise<PortfolioIntelligenceResponse> {
  return fetchJson<PortfolioIntelligenceResponse>(
    `${API_BASE_URL}/users/${userId}/intelligence?window=${window}`
  );
}

export interface MarketNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  summary: string;
  image: string;
  datetime: number;
  related: string;
  category: string;
}

export async function getMarketNews(limit = 20): Promise<MarketNewsItem[]> {
  return fetchJson<MarketNewsItem[]>(`${API_BASE_URL}/market/news?limit=${limit}`);
}

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export async function getPrices(tickers: string[]): Promise<Record<string, PriceData>> {
  const resp = await fetchJson<{ prices: Record<string, PriceData> }>(
    `${API_BASE_URL}/market/prices?tickers=${tickers.join(',')}`
  );
  return resp.prices;
}

// Price Alert endpoints
export async function getPriceAlerts(ticker?: string, userId?: string): Promise<PriceAlert[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (userId) params.set('userId', userId);
  const qs = params.toString();
  return fetchJson<PriceAlert[]>(`${API_BASE_URL}/price-alerts${qs ? `?${qs}` : ''}`);
}

export async function getPriceAlert(id: string): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts/${id}`);
}

export async function createPriceAlert(input: CreatePriceAlertInput): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePriceAlert(id: string, data: UpdatePriceAlertInput): Promise<PriceAlert> {
  return fetchJson<PriceAlert>(`${API_BASE_URL}/price-alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePriceAlert(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/price-alerts/${id}`, { method: 'DELETE' });
}

export async function getPriceAlertEvents(userId?: string, limit?: number): Promise<PriceAlertEvent[]> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return fetchJson<PriceAlertEvent[]>(`${API_BASE_URL}/price-alerts/events${qs ? `?${qs}` : ''}`);
}

export async function markPriceAlertEventRead(eventId: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/price-alerts/events/${eventId}/read`, { method: 'POST' });
}

export async function getUnreadPriceAlertCount(userId?: string): Promise<{ count: number }> {
  const params = userId ? `?userId=${userId}` : '';
  return fetchJson<{ count: number }>(`${API_BASE_URL}/price-alerts/events/unread-count${params}`);
}
