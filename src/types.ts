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
  amount: number;
  date: string;
  createdAt: string;
}

export interface DividendInput {
  ticker: string;
  amount: number;
  date: string;
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
}

export interface BetaResult {
  portfolioBeta: number;
  betaContributionPercent: number | null;
  spyReturnPercent: number;
  alphaPercent: number;
  dataNote: string;
}

export interface PortfolioIntelligenceResponse {
  window: IntelligenceWindow;
  contributors: ContributorEntry[];
  detractors: ContributorEntry[];
  sectorExposure: SectorExposureEntry[];
  beta: BetaResult | null;
  explanation: string;
  partial: boolean;
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

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  window: LeaderboardWindow;
  returnPct: number | null;
  returnDollar: number | null;
  verified: boolean;
  basis: 'verified' | 'none';
  sinceStart: boolean;
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
