import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StockDetailView } from './StockDetailView';

const EMPTY_ARRAY: [] = [];
const HOURLY_CACHE = { current: {} };
const SET_FOLLOWING = vi.fn();
const FETCH_PRICE_ALERTS = vi.fn();
const SET_HOURLY_CANDLES = vi.fn();

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: () => ['1D', vi.fn()],
}));

vi.mock('../hooks/useStockData', () => ({
  useStockData: (ticker: string) => ({
    data: {
      ticker,
      quote: {
        currentPrice: 100,
        previousClose: 99,
        open: 100,
        high: 101,
        low: 98,
        session: 'REG',
      },
      profile: { name: ticker === 'NVDA' ? 'NVIDIA Corporation' : 'Apple Inc.', exchange: 'NASDAQ', marketCapM: 1000 },
      metrics: null,
      candles: null,
    },
    loading: false,
    quickLoaded: true,
    candlesLoaded: true,
    error: null,
    tickerDividends: EMPTY_ARRAY,
    tickerCredits: EMPTY_ARRAY,
    etfHoldings: null,
    about: null,
    earnings: null,
    tradeEvents: EMPTY_ARRAY,
    analystEvents: EMPTY_ARRAY,
    aiEvents: null,
    aiEventsLoaded: true,
    priceAlerts: EMPTY_ARRAY,
    isFollowingStock: false,
    setIsFollowingStock: SET_FOLLOWING,
    fetchPriceAlerts: FETCH_PRICE_ALERTS,
    intradayCandles: EMPTY_ARRAY,
    livePrices: EMPTY_ARRAY,
    hourlyCandles: EMPTY_ARRAY,
    setHourlyCandles: SET_HOURLY_CANDLES,
    hourlyCache: HOURLY_CACHE,
  }),
}));

vi.mock('../hooks/useStockChart', () => ({
  useStockChart: () => ({
    handlePeriodChange: vi.fn(),
    zoomData: null,
    hoverPrice: null,
    hoverLabel: null,
    hoverRefPrice: null,
    handleHoverPrice: vi.fn(),
    handleResolutionRequest: vi.fn(),
    periodChange: { change: 0, changePct: 0, label: 'Today' },
    goldenCrossInfo: { active: false },
  }),
}));

vi.mock('./StockPriceChart', () => ({
  StockPriceChart: () => <div>Stock chart</div>,
}));

vi.mock('./WarningPanel', () => ({
  WarningPanel: () => null,
}));

vi.mock('./ETFDetailsPanel', () => ({
  ETFDetailsPanel: () => null,
}));

vi.mock('./CreatePriceAlertModal', () => ({
  CreatePriceAlertModal: () => null,
}));

vi.mock('./PriceAlertsList', () => ({
  PriceAlertsList: () => null,
}));

vi.mock('./FundamentalsSection', () => ({
  FundamentalsSection: () => <div>Financials</div>,
}));

vi.mock('./EarningsSection', () => ({
  EarningsSection: () => <div>Earnings</div>,
}));

vi.mock('./StockQAPanel', () => ({
  default: ({ ticker }: { ticker: string }) => <div>Ask about {ticker}</div>,
}));

vi.mock('./EventFeed', () => ({
  default: () => null,
}));

vi.mock('./AddHoldingModal', () => ({
  AddHoldingModal: () => null,
}));

vi.mock('./AddToWatchlistModal', () => ({
  AddToWatchlistModal: () => null,
}));

vi.mock('./CreateWatchlistModal', () => ({
  CreateWatchlistModal: () => null,
}));

vi.mock('./NalaScore', () => ({
  NalaScore: ({ ticker }: { ticker: string }) => <div>Nala Score {ticker}</div>,
}));

vi.mock('./ShareButton', () => ({
  ShareButton: () => <button type="button">Share</button>,
}));

vi.mock('./Term', () => ({
  Term: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./Acronym', () => ({
  Acronym: ({ label }: { label: string }) => <>{label}</>,
  getAcronymTitle: () => '',
}));

vi.mock('./StockLogo', () => ({
  StockLogo: ({ ticker }: { ticker: string }) => <div>{ticker} logo</div>,
}));

vi.mock('../api', () => ({
  getStockDetails: vi.fn(),
  getIntradayCandles: vi.fn(),
  getHourlyCandles: vi.fn(),
  followStock: vi.fn(),
  unfollowStock: vi.fn(),
  createWatchlist: vi.fn(),
}));

vi.mock('./TickerAutocompleteInput', () => ({
  TickerAutocompleteInput: ({ onSelect }: { onSelect?: (result: { symbol: string }) => void }) => (
    <button type="button" onClick={() => onSelect?.({ symbol: 'MSFT' })}>
      Select MSFT
    </button>
  ),
}));

describe('StockDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears compare tickers when navigating to a new stock', async () => {
    const { rerender } = render(
      <StockDetailView ticker="AAPL" holding={null} portfolioTotal={0} onBack={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ compare/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Select MSFT' }));

    expect(await screen.findByText('MSFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /full compare/i })).toBeInTheDocument();

    rerender(
      <StockDetailView ticker="NVDA" holding={null} portfolioTotal={0} onBack={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /full compare/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ compare/i })).toBeInTheDocument();
    });
  });
});
