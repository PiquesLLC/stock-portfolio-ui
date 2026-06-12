import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldingsTable } from './HoldingsTable';

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (_key: string, initialValue: unknown) => [initialValue, vi.fn()],
}));

vi.mock('../api', () => ({
  deleteHolding: vi.fn(),
  addHolding: vi.fn(),
  updateSettings: vi.fn(),
  getPortfolio: vi.fn(),
  getEarningsSummary: vi.fn(() => new Promise(() => {})),
  getFastQuote: vi.fn(),
}));

vi.mock('./TickerAutocompleteInput', () => ({
  TickerAutocompleteInput: () => null,
}));

vi.mock('./MiniSparkline', () => ({
  MiniSparkline: () => <div />,
}));

vi.mock('./StockLogo', () => ({
  StockLogo: ({ ticker }: { ticker: string }) => <div>{ticker} logo</div>,
}));

vi.mock('./ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

vi.mock('./PortfolioImport', () => ({
  PortfolioImport: () => null,
}));

vi.mock('./DraggableHoldingCard', () => ({
  DraggableHoldingCard: () => null,
}));

const holdings = [
  {
    id: '1',
    ticker: 'AAPL',
    shares: 10,
    averageCost: 150,
    currentPrice: 180,
    currentValue: 1800,
    dayChange: 10,
    dayChangePercent: 1.5,
    profitLoss: 300,
    profitLossPercent: 20,
    priceUnavailable: false,
    isRepricing: false,
    priceIsStale: false,
  },
  {
    id: '2',
    ticker: 'MSFT',
    shares: 5,
    averageCost: 300,
    currentPrice: 420,
    currentValue: 2100,
    dayChange: -12,
    dayChangePercent: -0.5,
    profitLoss: 600,
    profitLossPercent: 40,
    priceUnavailable: false,
    isRepricing: false,
    priceIsStale: false,
  },
] as any;

describe('HoldingsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('highlights matching holdings and dims the rest when searchQuery filters by ticker', () => {
    render(
      <HoldingsTable holdings={holdings} onUpdate={vi.fn()} searchQuery="AAP" />,
    );

    // Non-matching holdings stay rendered for context — they are dimmed, not removed.
    expect(screen.getByText('AAPL').closest('tr')).toHaveAttribute('data-search-match', 'true');
    expect(screen.getByText('MSFT').closest('tr')).toHaveAttribute('data-search-match', 'false');
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });
});
