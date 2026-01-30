/**
 * Acronym tooltip component — wraps any abbreviation with a dotted underline
 * and shows the full meaning on hover.
 */

const ACRONYM_DEFINITIONS: Record<string, string> = {
  // Returns & Performance
  'TWR': 'Time-Weighted Return — measures portfolio performance excluding the impact of deposits and withdrawals',
  'MWR': 'Money-Weighted Return — measures portfolio performance including the timing and size of deposits and withdrawals',
  'XIRR': 'Extended Internal Rate of Return — annualized return accounting for irregular cash flows',
  'P/L': 'Profit / Loss — the difference between current value and cost basis',
  'P&L': 'Profit & Loss — the difference between current value and cost basis',
  'YTD': 'Year to Date — from January 1st of this year to today',
  'ROI': 'Return on Investment — percentage gain or loss relative to the amount invested',
  'Alpha': 'Alpha — excess return of the portfolio compared to a benchmark index',
  'Alpha (ann.)': 'Annualized Alpha — excess return vs benchmark, expressed as a yearly rate',

  // Risk Metrics
  'Beta': 'Beta — measures how much the portfolio moves relative to the market (1.0 = moves with market)',
  'Vol': 'Volatility — annualized standard deviation of daily returns, measuring price fluctuation',
  'Sharpe Ratio': 'Sharpe Ratio — risk-adjusted return: how much excess return per unit of risk taken',
  'Sharpe': 'Sharpe Ratio — risk-adjusted return: how much excess return per unit of risk taken',

  // Benchmarks & ETFs
  'SPY': 'SPDR S&P 500 ETF — tracks the S&P 500 index of 500 large US companies',
  'QQQ': 'Invesco QQQ ETF — tracks the Nasdaq-100 index of 100 large non-financial companies',
  'DIA': 'SPDR Dow Jones ETF — tracks the Dow Jones Industrial Average of 30 blue-chip US stocks',
  'ETF': 'Exchange-Traded Fund — a basket of securities that trades on an exchange like a stock',

  // Stock Metrics
  'EPS': 'Earnings Per Share — company net income divided by shares outstanding',
  'EPS (TTM)': 'Earnings Per Share (Trailing Twelve Months) — earnings over the last 4 quarters',
  'P/E': 'Price-to-Earnings Ratio — stock price divided by earnings per share',
  'P/E Ratio': 'Price-to-Earnings Ratio — stock price divided by earnings per share',
  'IPO': 'Initial Public Offering — the first time a company sells shares to the public',

  // Market Sessions
  'PRE': 'Pre-Market — trading session before regular hours (4:00–9:30 AM ET)',
  'REG': 'Regular Market — standard trading hours (9:30 AM–4:00 PM ET)',
  'AH': 'After Hours — trading session after regular hours (4:00–8:00 PM ET)',
  'POST': 'After Hours — trading session after regular hours (4:00–8:00 PM ET)',

  // Time Periods
  '1D': '1 Day',
  '1W': '1 Week',
  '1M': '1 Month',
  '3M': '3 Months',
  '1Y': '1 Year',
  'ALL': 'All available history',

  // Exchanges
  'TSX': 'Toronto Stock Exchange',
  'TSX-V': 'TSX Venture Exchange',
  'LSE': 'London Stock Exchange',
  'HKEX': 'Hong Kong Stock Exchange',
  'ASX': 'Australian Securities Exchange',
  'NAV': 'Net Asset Value — total value of assets minus liabilities',
};

interface AcronymProps {
  label: string;
  className?: string;
}

export function Acronym({ label, className = '' }: AcronymProps) {
  const definition = ACRONYM_DEFINITIONS[label];
  if (!definition) return <span className={className}>{label}</span>;

  return (
    <span
      className={`underline decoration-dotted decoration-current/40 underline-offset-2 cursor-help ${className}`}
      title={definition}
    >
      {label}
    </span>
  );
}

/** For inline use where you just need the title attribute on existing text */
export function getAcronymTitle(label: string): string | undefined {
  return ACRONYM_DEFINITIONS[label];
}
