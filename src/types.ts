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
}

export interface Portfolio {
  holdings: Holding[];
  cashBalance: number;
  marginDebt: number;
  holdingsValue: number;
  netEquity: number;
  totalValue: number;
  totalCost: number;
  totalPL: number;
  totalPLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  quotesStale?: boolean;
  quotesUnavailableCount?: number;
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
