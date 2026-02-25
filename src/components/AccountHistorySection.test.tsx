import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountHistorySection from './AccountHistorySection';
import * as api from '../api';

vi.mock('../api', () => ({
  getAccountHistory: vi.fn(),
}));

const mockGetAccountHistory = vi.mocked(api.getAccountHistory);

function makeEntry(overrides: Partial<api.AccountHistoryEntry>): api.AccountHistoryEntry {
  return {
    id: '1',
    source: 'trade',
    category: 'trade',
    type: 'buy',
    ticker: 'AAPL',
    shares: 10,
    price: 185,
    amount: -1850,
    date: '2026-02-24T10:00:00.000Z',
    description: 'Bought 10 AAPL @ $185.00',
    sourceBroker: 'schwab',
    ...overrides,
  };
}

describe('AccountHistorySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountHistory.mockResolvedValue({ entries: [], nextCursor: null });
  });

  it('renders entries on initial load', async () => {
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({})],
      nextCursor: null,
    });

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();
    });
  });

  it('resets entries and refetches when category filter changes', async () => {
    // Initial load with a trade entry
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({ id: 'trade-1', description: 'Bought 10 AAPL @ $185.00' })],
      nextCursor: null,
    });

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();
    });

    // Setup mock for the Cash filter
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({
        id: 'dep-1',
        source: 'ledger',
        category: 'cash',
        type: 'DEPOSIT',
        ticker: null,
        shares: null,
        price: null,
        amount: 500,
        description: 'Deposit $500.00',
        sourceBroker: null,
      })],
      nextCursor: null,
    });

    // Click "Cash" pill
    fireEvent.click(screen.getByText('Cash'));

    // Old entry should be gone, new entry should appear
    await waitFor(() => {
      expect(screen.getByText('Deposit $500.00')).toBeInTheDocument();
    });
    expect(screen.queryByText('Bought 10 AAPL @ $185.00')).not.toBeInTheDocument();

    // Verify API was called with category
    expect(mockGetAccountHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'cash' }),
    );
  });

  it('applies ticker filter + category together after debounce', async () => {
    // Initial load
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({})],
      nextCursor: null,
    });

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();
    });

    // Switch to Cash category
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({
        id: 'div-1',
        source: 'ledger',
        category: 'cash',
        type: 'CASH_DIVIDEND',
        ticker: 'AAPL',
        amount: 12.5,
        description: 'Dividend: AAPL $12.50',
        sourceBroker: null,
      })],
      nextCursor: null,
    });

    fireEvent.click(screen.getByText('Cash'));

    await waitFor(() => {
      expect(screen.getByText('Dividend: AAPL $12.50')).toBeInTheDocument();
    });

    // Now type a ticker — combined filter should send both params
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [],
      nextCursor: null,
    });

    const searchInput = screen.getByPlaceholderText('Search AAPL');
    fireEvent.change(searchInput, { target: { value: 'MSFT' } });

    // Wait for debounce (300ms) to trigger refetch with both filters
    await waitFor(() => {
      const lastCall = mockGetAccountHistory.mock.calls[mockGetAccountHistory.mock.calls.length - 1][0];
      expect(lastCall).toEqual(expect.objectContaining({
        category: 'cash',
        ticker: 'MSFT',
      }));
    }, { timeout: 1000 });

    // Old entries cleared, empty state shown
    await waitFor(() => {
      expect(screen.getByText('No account history yet')).toBeInTheDocument();
    });
    expect(screen.queryByText('Dividend: AAPL $12.50')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries exist', async () => {
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [],
      nextCursor: null,
    });

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText('No account history yet')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button', async () => {
    mockGetAccountHistory.mockRejectedValueOnce(new Error('Network error'));

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText("Couldn't load history")).toBeInTheDocument();
    });

    // Setup success for retry
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({})],
      nextCursor: null,
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();
    });
  });

  it('Load More appends next page without losing existing entries', async () => {
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({ id: '1', description: 'Bought 10 AAPL @ $185.00' })],
      nextCursor: '2026-02-24T10:00:00.000Z|trade|1',
    });

    render(<AccountHistorySection />);

    await waitFor(() => {
      expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();
    });

    // Setup page 2
    mockGetAccountHistory.mockResolvedValueOnce({
      entries: [makeEntry({
        id: '2',
        date: '2026-02-23T10:00:00.000Z',
        description: 'Sold 5 MSFT @ $410.00',
      })],
      nextCursor: null,
    });

    fireEvent.click(screen.getByText('Load More'));

    // Both entries should be visible
    await waitFor(() => {
      expect(screen.getByText('Sold 5 MSFT @ $410.00')).toBeInTheDocument();
    });
    expect(screen.getByText('Bought 10 AAPL @ $185.00')).toBeInTheDocument();

    // Load More button should be gone (no more pages)
    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });
});
