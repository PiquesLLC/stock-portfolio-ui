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

vi.mock('../utils/haptics', () => ({
  hapticSelection: vi.fn(),
  hapticLight: vi.fn(),
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
    // jsdom doesn't implement matchMedia; report reduced-motion so the
    // slide-between-stocks navigation resolves synchronously (no framer
    // animation to await) and the assertions below stay deterministic.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('clears compare tickers when navigating to a new stock', async () => {
    const { rerender } = render(
      <StockDetailView ticker="AAPL" holding={null} portfolioTotal={0} onBack={vi.fn()} />,
    );

    // The Compare button renders in both the header toolbar and the chart strip,
    // so query with getAllBy* and use the first instance.
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select MSFT' })[0]);

    expect(await screen.findAllByText('MSFT')).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /full compare/i }).length).toBeGreaterThan(0);

    rerender(
      <StockDetailView ticker="NVDA" holding={null} portfolioTotal={0} onBack={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /full compare/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Compare' }).length).toBeGreaterThan(0);
    });
  });

  // Desktop counterpart to the mobile swipe-between-stocks gesture. Note jsdom
  // can't evaluate the Tailwind breakpoints that decide WHERE the buttons show
  // (edge vs header), so these cover the keyboard handler's logic — which is
  // what could silently regress.
  describe('keyboard navigation between sibling stocks', () => {
    const SIBLINGS = ['AAPL', 'NVDA', 'MSFT'];

    it('ArrowRight goes to the next sibling and ArrowLeft to the previous', () => {
      const onTickerNavigate = vi.fn();
      render(
        <StockDetailView
          ticker="NVDA"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );

      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(onTickerNavigate).toHaveBeenLastCalledWith('MSFT');

      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(onTickerNavigate).toHaveBeenLastCalledWith('AAPL');
    });

    it('does not navigate past the first or last sibling', () => {
      const onTickerNavigate = vi.fn();
      const { rerender } = render(
        <StockDetailView
          ticker="AAPL"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(onTickerNavigate).not.toHaveBeenCalled();

      rerender(
        <StockDetailView
          ticker="MSFT"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(onTickerNavigate).not.toHaveBeenCalled();
    });

    it('ignores arrow keys while typing in a field', () => {
      const onTickerNavigate = vi.fn();
      render(
        <StockDetailView
          ticker="NVDA"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      expect(onTickerNavigate).not.toHaveBeenCalled();
      input.remove();
    });

    it('ignores modifier + arrow combos so browser shortcuts (Alt+Left) survive', () => {
      const onTickerNavigate = vi.fn();
      render(
        <StockDetailView
          ticker="NVDA"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true });
      fireEvent.keyDown(document.body, { key: 'ArrowRight', metaKey: true });
      expect(onTickerNavigate).not.toHaveBeenCalled();
    });

    it('ignores arrows when focus is in a region that owns them (data-no-swipe, e.g. the chart)', () => {
      const onTickerNavigate = vi.fn();
      render(
        <StockDetailView
          ticker="NVDA"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          siblings={SIBLINGS}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      const region = document.createElement('div');
      region.setAttribute('data-no-swipe', '');
      const focusable = document.createElement('button');
      region.appendChild(focusable);
      document.body.appendChild(region);
      focusable.focus();
      fireEvent.keyDown(focusable, { key: 'ArrowRight' });
      expect(onTickerNavigate).not.toHaveBeenCalled();
      region.remove();
    });

    it('does nothing when there is no sibling list', () => {
      const onTickerNavigate = vi.fn();
      render(
        <StockDetailView
          ticker="AAPL"
          holding={null}
          portfolioTotal={0}
          onBack={vi.fn()}
          onTickerNavigate={onTickerNavigate}
        />,
      );
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(onTickerNavigate).not.toHaveBeenCalled();
    });
  });
});
