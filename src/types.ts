export type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

export interface Holding {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  profitLoss: number;
  profitLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
  priceUnavailable?: boolean;
  priceIsStale?: boolean;
  isRepricing?: boolean;
  quoteAgeSeconds?: number;
  session?: MarketSession;
}

export interface QuotesMeta {
  anyRepricing: boolean;
  quoteTimestamp: number;
  provider: string;
  staleCount?: number;
  failedTickers?: string[];
}

export interface Portfolio {
  holdings: Holding[];
  cashBalance: number;
  marginDebt: number;
  holdingsValue: number;
  totalAssets: number;      // holdingsValue + cashBalance (NO marginDebt - for tracking)
  netEquity: number;        // totalAssets - marginDebt (for display only)
  totalValue: number;       // same as totalAssets for compatibility
  totalCost: number;
  totalPL: number;
  totalPLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  regularDayChange?: number;
  regularDayChangePercent?: number;
  afterHoursChange?: number;
  afterHoursChangePercent?: number;
  quotesStale?: boolean;
  quotesUnavailableCount?: number;
  quotesMeta?: QuotesMeta;
  session?: MarketSession;
  paceProjection?: PaceProjection; // MTD-based pace projections
}

export interface HoldingInput {
  ticker: string;
  shares: number;
  averageCost: number;
}

// Dividend types
export interface DividendEvent {
  id: string;
  ticker: string;
  exDate: string;
  recordDate: string | null;
  payDate: string;
  amountPerShare: number;
  currency: string;
  dividendType: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DividendEventInput {
  ticker: string;
  exDate: string;
  payDate: string;
  amountPerShare: number;
  recordDate?: string;
  dividendType?: string;
}

export interface DividendCredit {
  id: string;
  userId: string | null;
  ticker: string;
  dividendEventId: string;
  sharesEligible: number;
  amountGross: number;
  currency: string;
  creditedAt: string;
  status: string;
  createdAt: string;
  dividendEvent?: DividendEvent;
  reinvestment?: DividendReinvestment;
}

export interface DividendReinvestment {
  id: string;
  dividendCreditId: string;
  ticker: string;
  sharesPurchased: number;
  pricePerShare: number;
  totalAmount: number;
  fillDate: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt?: string;
}

export interface DividendTimeline {
  creditId: string;
  ticker: string;
  sharesEligible: number;
  amountPerShare: number;
  totalAmount: number;
  steps: {
    announced: { date: string; completed: boolean };
    payment: { date: string; completed: boolean };
    reinvestment: {
      date: string | null;
      completed: boolean;
      sharesPurchased: number | null;
      pricePerShare: number | null;
    } | null;
  };
}

export interface DividendSummary {
  totalYTD: number;
  totalAllTime: number;
  byTicker: { ticker: string; total: number; count: number }[];
}

// Projection types
export type ProjectionMode = 'sp500' | 'realized';
export type LookbackPeriod = '1d' | '1w' | '1m' | '6m' | '1y' | 'max';

export interface ProjectionHorizons {
  '6m': { base: number };
  '1y': { base: number };
  '5y': { base: number };
  '10y': { base: number };
}

export interface SP500ProjectionResponse {
  mode: 'sp500';
  asOf: string;
  currentValue: number;
  assumptions: {
    annualReturn: number;
    compounding: 'monthly';
  };
  horizons: ProjectionHorizons;
}

export interface RealizedMetrics {
  cagr: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
}

export interface RealizedProjectionResponse {
  mode: 'realized';
  lookback: LookbackPeriod;
  lookbackUsed: LookbackPeriod;
  asOf: string;
  currentValue: number;
  realized: RealizedMetrics;
  horizons: ProjectionHorizons;
  notes: string[];
  snapshotCount: number;
  dataStartDate: string | null;
  dataEndDate: string | null;
}

export type ProjectionResponse = SP500ProjectionResponse | RealizedProjectionResponse;

export interface MetricsResponse {
  lookback: LookbackPeriod;
  lookbackUsed: LookbackPeriod;
  asOf: string;
  currentValue: number;
  metrics: RealizedMetrics;
  notes: string[];
  snapshotCount: number;
  dataStartDate: string | null;
  dataEndDate: string | null;
}

// Performance Summary types
export interface PerformanceSummary {
  sinceTracking: {
    hasBaseline: boolean;
    startDate: string | null;
    startingValue: number | null;
    currentValue: number;
    absoluteReturn: number | null;
    percentReturn: number | null;
    twrPercent: number | null;       // Time-weighted return (accounts for deposits/withdrawals)
    transactionCount: number;        // Number of cash flow transactions
    snapshotCount: number;
  };
  holdingsPL: {
    totalCost: number;
    currentValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
  };
  brokerLifetime: {
    hasData: boolean;
    deposits: number | null;
    withdrawals: number | null;
    currentValue: number | null;
    netContributions: number | null;
    absoluteReturn: number | null;
    percentReturn: number | null;
    asOf: string | null;
  } | null;
}

export interface BaselineInput {
  type: 'fresh_start' | 'existing_portfolio';
}

export interface BrokerLifetimeInput {
  deposits: number;
  withdrawals: number;
  currentValue: number;
}

export interface Settings {
  cashBalance: number;
  marginDebt: number;
}

export interface SettingsUpdateInput {
  cashBalance?: number;
  marginDebt?: number;
}

// Current Pace Projection types (CAGR-based)
export type PaceWindow = '1D' | '1M' | '6M' | '1Y' | 'YTD';

export interface CurrentPaceResponse {
  window: PaceWindow;
  windowLabel: string;
  dataStatus: 'ok' | 'insufficient' | 'no_data';
  snapshotCount: number;
  dataStartDate: string | null;
  dataEndDate: string | null;
  daysCovered: number;
  currentAssets: number;
  referenceAssets: number | null;
  windowReturnPct: number | null;
  annualizedPacePct: number | null;
  capped: boolean;
  projections: {
    '1y': { value: number; gainPct: number } | null;
    '2y': { value: number; gainPct: number } | null;
    '5y': { value: number; gainPct: number } | null;
    '10y': { value: number; gainPct: number } | null;
  };
  note: string | null;
  estimated: boolean;               // true if return is estimated from shorter history
  estimatedReason: string | null;   // explanation when estimated
  // YTD-specific fields (only present when window === 'YTD')
  trueYtdAvailable?: boolean;
  ytdDetail?: Record<string, unknown>;
}

export interface YtdSettings {
  ytdStartEquity: number | null;
  ytdNetContributions: number | null;
}

// Legacy Pace Projection types (MTD-based simple linear projections)
export interface PaceProjection {
  hasData: boolean;
  mtdReturnPct: number | null;        // Month-to-date return percentage
  paceMonthlyPct: number | null;      // Same as MTD (the month's current performance)
  paceAnnualPct: number | null;       // Monthly * 12
  horizonPct: {
    '1y': number | null;
    '2y': number | null;
    '5y': number | null;
    '10y': number | null;
  };
  horizonValue: {
    '1y': number | null;
    '2y': number | null;
    '5y': number | null;
    '10y': number | null;
  };
  baselineMonthDate: string | null;   // ISO date of baseline snapshot
  baselineMonthAssets: number | null; // Asset value at start of month
  currentAssets: number;              // Current total assets
  daysIntoMonth: number;              // Days elapsed in current month
  note: string | null;                // Any warning or info message
}

export interface FullSettings {
  id: string;
  cashBalance: number;
  marginDebt: number;
  trackingStartDate: string | null;
  baselineTotalValue: number | null;
  baselineType: string | null;
  brokerLifetimeDeposits: number | null;
  brokerLifetimeWithdrawals: number | null;
  brokerLifetimeValue: number | null;
  brokerLifetimeAsOf: string | null;
}

// Insights types
export interface HealthCategoryDetail {
  score: number;
  maxScore: number;
  calcBullets: string[];
  evidenceBullets: string[];
  drivers: { label: string; value: string; impact: string }[];
  quickFixes: string[];
}

export interface HealthScoreDetails {
  concentration: HealthCategoryDetail;
  volatility: HealthCategoryDetail;
  drawdown: HealthCategoryDetail;
  diversification: HealthCategoryDetail;
  margin: {
    penalty: number;
    calcBullets: string[];
    evidenceBullets: string[];
    drivers: { label: string; value: string; impact: string }[];
    quickFixes: string[];
  };
}

export interface HealthScore {
  overall: number; // 0-100
  breakdown: {
    concentration: number;
    volatility: number;
    drawdown: number;
    diversification: number;
    margin: number;
  };
  reasons: string[];
  quickFixes: string[];
  partial: boolean;
  details?: HealthScoreDetails;
}

export type AttributionWindow = '1d' | '5d' | '1m';

export interface Attribution {
  window: AttributionWindow;
  topContributors: {
    ticker: string;
    contributionDollar: number;
    contributionPct: number;
  }[];
  topDetractors: {
    ticker: string;
    contributionDollar: number;
    contributionPct: number;
  }[];
  partial: boolean;
}

export interface LeakDetectorResult {
  correlationClusters: {
    tickers: string[];
    avgCorrelation: number;
  }[];
  summaries: string[];
  heatmapData: {
    tickers: string[];
    matrix: number[][];
  } | null;
  partial: boolean;
  spyCorrelation: number | null;
  suggestedActions: string[];
  hiddenConcentration: boolean;
}

export interface RiskForecastBasis {
  lookbackDays: number;           // Actual days of data used
  dataQuality: 'full' | 'partial' | 'fallback';
  tickersCovered: number;         // How many tickers had data
  tickersTotal: number;           // Total tickers in portfolio
  note: string | null;            // Explanation of data source
}

export interface RiskForecastMetrics {
  annualReturn: number | null;    // CAGR from historical data
  annualVolatility: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;     // Risk-adjusted return (rf=0)
}

export interface RiskForecastScenarios {
  optimistic: number;             // 90th percentile outcome
  baseCase: number;               // 50th percentile outcome
  pessimistic: number;            // 10th percentile outcome
}

export interface RiskForecast {
  status: 'ready' | 'caching' | 'insufficient';
  basis: RiskForecastBasis;
  metrics: RiskForecastMetrics;
  scenarios: RiskForecastScenarios | null;
  currentValue: number;           // Portfolio value used as starting point
}

// Goal types
export interface TimeToGoalRange {
  optimistic: number | null;
  base: number | null;
  pessimistic: number | null;
}

export interface Goal {
  id: string;
  name: string;
  targetValue: number;
  monthlyContribution: number;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  currentProgress: number; // 0-100
  currentPortfolioValue: number;
  timeToGoal: TimeToGoalRange;
  projectedDate: {
    optimistic: string | null;
    base: string | null;
    pessimistic: string | null;
  };
}

export interface GoalInput {
  name: string;
  targetValue: number;
  monthlyContribution?: number;
  deadline?: string | null;
}

// Portfolio Intelligence types
export type IntelligenceWindow = '1d' | '5d' | '1m';

export interface ContributorEntry {
  ticker: string;
  percentReturn: number | null;
  contributionDollar: number;
}

export interface SectorExposureEntry {
  sector: string;
  exposurePercent: number;
  exposureDollar: number;
  tickers: { ticker: string; valueDollar: number; valuePercent: number }[];
}

export interface BetaResult {
  portfolioBeta: number;
  betaContributionPercent: number | null;
  spyReturnPercent: number;
  alphaPercent: number;
  dataNote: string;
}

export interface HeroStats {
  sectorDriver: {
    sector: string | null;
    percent: number;
    label: string;
  };
  sectorDrag: {
    sector: string | null;
    percent: number;
    label: string;
  };
  largestDrag: {
    ticker: string | null;
    lossDollar: number;
    percent: number;
    label: string;
  };
  largestDriver: {
    ticker: string | null;
    gainDollar: number;
    percent: number;
    label: string;
  };
  momentum: {
    ticker: string | null;
    streakDays: number;
    streakPct: number;
    label: string;
  } | null;
  deceleration: {
    ticker: string | null;
    streakDays: number;
    streakPct: number;
    label: string;
  } | null;
}

export interface PortfolioIntelligenceResponse {
  window: IntelligenceWindow;
  contributors: ContributorEntry[];
  detractors: ContributorEntry[];
  sectorExposure: SectorExposureEntry[];
  beta: BetaResult | null;
  explanation: string;
  partial: boolean;
  heroStats: HeroStats | null;
}

// Symbol search types
export interface SymbolSearchResult {
  symbol: string;
  description: string;
  type: string;
  primaryExchange: string;
  popularityScore: number;  // Combined ranking score (higher = more relevant)
  marketCapB?: number;      // Market cap in billions USD, if available
  avgVolume?: number;       // Average daily volume, if available
  isPopular?: boolean;      // True if this is a well-known popular ticker
  isHeld?: boolean;         // True if user currently holds this ticker
}

export interface SymbolSearchResponse {
  results: SymbolSearchResult[];
  meta: {
    query: string;
    count: number;
    partial: boolean;
    cached: boolean;
    advPending: string[];   // Tickers whose ADV is being fetched async
  };
}

// Leaderboard types
export type LeaderboardWindow = '1D' | '1W' | '1M' | 'YTD' | '1Y';
export type LeaderboardRegion = 'world' | 'na' | 'europe' | 'apac';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  region: string | null;
  window: LeaderboardWindow;
  returnPct: number | null;
  returnDollar: number | null;
  twrPct: number | null;
  verified: boolean;
  basis: 'verified' | 'none';
  sinceStart: boolean;
  isNew: boolean;
  flagged: boolean;
  flagReason: string | null;
  trackingStartAt: string;
  snapshotCount: number;
  startDateUsed: string | null;
  endDateUsed: string | null;
  currentAssets: number | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  lastUpdated: string;
}

export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

// Social types
export type ActivityType = 'holding_added' | 'holding_removed' | 'holding_updated';

export interface ActivityPayload {
  ticker: string;
  shares?: number;
  previousShares?: number;
  averageCost?: number;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  type: ActivityType;
  payload: ActivityPayload;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  profilePublic: boolean;
  region: string | null;
  showRegion: boolean;
  trackingActive: boolean;
  leaderboardEligible: boolean;
  followerCount: number;
  followingCount: number;
  viewerIsFollowing: boolean;
  recentActivity: ActivityEvent[];
  performance: PerformanceData | null;
  holdingsVisibility: string;
}

// Portfolio Chart types
export type PortfolioChartPeriod = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export interface PortfolioChartPoint {
  time: number; // ms timestamp
  value: number;
}

export interface PortfolioChartData {
  points: PortfolioChartPoint[];
  periodStartValue: number;
  period: PortfolioChartPeriod;
}

// Benchmark Performance types
export type PerformanceWindow = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export interface PerformanceData {
  window: PerformanceWindow;
  benchmarkTicker: string;
  simpleReturnPct: number | null;
  twrPct: number | null;
  mwrPct: number | null;
  benchmarkReturnPct: number | null;
  alphaPct: number | null;
  beta: number | null;
  correlation: number | null;
  volatilityPct: number | null;
  maxDrawdownPct: number | null;
  bestDay: { date: string; returnPct: number } | null;
  worstDay: { date: string; returnPct: number } | null;
  snapshotCount: number;
  dataStartDate: string | null;
  dataEndDate: string | null;
}

// Transaction types
export interface Transaction {
  id: string;
  userId: string | null;
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
  createdAt: string;
}

// Alert types
export interface AlertConfig {
  id: string;
  userId: string | null;
  type: string;
  threshold: number | null;
  enabled: boolean;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  alert: { type: string };
  message: string;
  data: string | null;
  read: boolean;
  createdAt: string;
}

// Income Insights types
export type IncomeWindow = 'today' | '5d' | '1m';

export interface IncomeHealthBreakdown {
  stability: number;
  growth: number;
  coverage: number;
  diversification: number;
}

export interface IncomeCategoryDetail {
  score: number;
  maxScore: number;
  calcBullets: string[];
  evidenceBullets: string[];
  drivers: { label: string; value: string; impact: string }[];
  quickFixes: string[];
}

export interface IncomeHealthDetails {
  stability: IncomeCategoryDetail;
  growth: IncomeCategoryDetail;
  coverage: IncomeCategoryDetail;
  diversification: IncomeCategoryDetail;
}

export interface IncomeHealthScore {
  overall: number;
  breakdown: IncomeHealthBreakdown;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  details: IncomeHealthDetails;
}

export interface IncomeCashFlow {
  annualIncome: number;
  monthlyIncome: number;
  dailyIncome: number;
  projectedNextMonth: number;
}

export interface IncomeMomentum {
  yoyChangePct: number | null;
  holdingsRaisedPayout: string[];
  trend: 'growing' | 'stable' | 'declining' | 'unknown';
}

export interface IncomeReliability {
  classification: 'stable' | 'moderate' | 'volatile';
  monthlyStdDev: number | null;
  consecutiveMonths: number;
}

export interface IncomeContributor {
  ticker: string;
  dividendDollar: number;
  yieldPct: number | null;
  percentOfTotal: number;
  paymentCount: number;
}

export interface IncomeConcentration {
  top1Percent: number;
  top3Percent: number;
  top1Ticker: string | null;
  top3Tickers: string[];
  isConcentrated: boolean;
}

export interface IncomeTimelineEvent {
  ticker: string;
  eventType: 'paid' | 'declared';
  date: string;
  amountReceived: number;
  dateEstimated: boolean;
}

export interface IncomeLiveIntelligence {
  window: IncomeWindow;
  statement: string;
  amountInWindow: number;
}

export interface IncomeInsightsResponse {
  healthScore: IncomeHealthScore;
  keyDrivers: string[];
  liveIntelligence: IncomeLiveIntelligence;
  signals: {
    cashFlow: IncomeCashFlow;
    momentum: IncomeMomentum;
    reliability: IncomeReliability;
  };
  contributors: IncomeContributor[];
  concentration: IncomeConcentration;
  timeline: IncomeTimelineEvent[];
}

// Stock Detail types
export type ChartPeriod = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'MAX';

export interface StockProfile {
  ticker: string;
  name: string;
  description: string;
  logo: string;
  industry: string;
  marketCapM: number;
  ipoDate: string;
  weburl: string;
  country: string;
  exchange: string;
  phone: string;
}

export interface StockMetrics {
  ticker: string;
  peRatio: number | null;
  week52High: number | null;
  week52Low: number | null;
  dividendYield: number | null;
  avgVolume10D: number | null;
  beta: number | null;
  eps: number | null;
}

export interface AssetAbout {
  description: string;
  sector: string;
  industry: string;
  // ETF-specific fields
  category: string | null;
  fundFamily: string | null;
  legalType: string | null;
  totalAssets: number | null;
  numberOfHoldings: number | null;
  inceptionDate: string | null;
  // Stock-specific fields
  fullTimeEmployees: number | null;
  headquarters: string | null;
}

export interface StockCandles {
  closes: number[];
  dates: string[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
}

export interface StockDetailsResponse {
  ticker: string;
  quote: {
    ticker: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    timestamp: number;
    session?: MarketSession;
    regularClose?: number;
    extendedPrice?: number;
    extendedChange?: number;
    extendedChangePercent?: number;
  };
  profile: StockProfile | null;
  metrics: StockMetrics | null;
  candles: StockCandles | null;
}

// ETF Holdings types
export interface ETFHolding {
  symbol: string;
  holdingName: string;
  holdingPercent: number;
}

export interface ETFSectorWeighting {
  sector: string;
  weight: number;
}

export interface ETFHoldingsData {
  topHoldings: ETFHolding[];
  sectorWeightings: ETFSectorWeighting[];
  totalHoldingsPercent: number;
  asOfDate: string | null;
  isETF: boolean;
}

// Price Alert types
export type PriceAlertCondition = 'above' | 'below' | 'pct_up' | 'pct_down';

export interface PriceAlert {
  id: string;
  userId: string | null;
  ticker: string;
  condition: PriceAlertCondition;
  targetPrice: number | null;
  percentChange: number | null;
  referencePrice: number | null;
  enabled: boolean;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  events?: PriceAlertEvent[];
}

export interface PriceAlertEvent {
  id: string;
  priceAlertId: string;
  triggerPrice: number;
  message: string;
  read: boolean;
  createdAt: string;
  priceAlert?: {
    ticker: string;
    condition: PriceAlertCondition;
    targetPrice: number | null;
    percentChange: number | null;
  };
}

export type ReferencePriceType = 'current' | 'open' | 'avgCost';

export interface CreatePriceAlertInput {
  ticker: string;
  condition: PriceAlertCondition;
  targetPrice?: number;
  percentChange?: number;
  referencePrice?: number;
  referencePriceType?: ReferencePriceType;
  repeatAlert?: boolean;
  expiresAt?: string; // ISO date string
  userId?: string;
}

export interface UpdatePriceAlertInput {
  targetPrice?: number;
  percentChange?: number;
  enabled?: boolean;
}

// Analyst events
export interface AnalystEvent {
  id: string;
  ticker: string;
  eventType: 'target_change' | 'rating_change';
  message: string;
  oldValue: string | null;
  newValue: string | null;
  changePct: number | null;
  read: boolean;
  createdAt: string;
}

export interface MilestoneEvent {
  id: string;
  userId: string;
  ticker: string;
  eventType: '52w_high' | '52w_low' | 'ath' | 'atl';
  message: string;
  currentPrice: number;
  thresholdPrice: number;
  isNewRecord: boolean;
  read: boolean;
  createdAt: string;
}
