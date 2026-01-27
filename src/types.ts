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
  totalValue: number;
  totalCost: number;
  totalPL: number;
  totalPLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  quotesStale?: boolean;
  quotesUnavailableCount?: number;
}

export interface ProjectionMetrics {
  velocity: number;
  acceleration: number;
  volatility: number;
  drawdown: number;
}

export interface Projection {
  horizon: '6mo' | '1yr' | '5yr' | '10yr';
  base: number;
  bull: number;
  bear: number;
  confidence: number;
}

export interface ProjectionResponse {
  currentValue: number;
  projections: Projection[];
  snapshotCount: number;
  method: 'momentum' | 'insufficient_data';
  metrics: ProjectionMetrics | null;
  message?: string;
}

export interface HoldingInput {
  ticker: string;
  shares: number;
  averageCost: number;
}
