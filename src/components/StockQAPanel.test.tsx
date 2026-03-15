import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StockQAPanel from './StockQAPanel';
import * as api from '../api';

vi.mock('../api', () => ({
  askStockQuestion: vi.fn(),
}));

const mockAskStockQuestion = vi.mocked(api.askStockQuestion);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('StockQAPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('ignores a late answer from the previous ticker after switching stocks', async () => {
    const aaplRequest = deferred<{ answer: string; citations: string[] }>();
    mockAskStockQuestion.mockImplementation(() => aaplRequest.promise as Promise<any>);

    const { rerender } = render(<StockQAPanel ticker="AAPL" />);

    fireEvent.click(screen.getByRole('button', { name: /what are the biggest risks\?/i }));

    await waitFor(() => {
      expect(mockAskStockQuestion).toHaveBeenCalledWith('AAPL', 'What are the biggest risks?');
    });

    rerender(<StockQAPanel ticker="MSFT" />);
    expect(screen.getByText('Ask about MSFT')).toBeInTheDocument();

    aaplRequest.resolve({
      answer: 'Old AAPL answer',
      citations: ['https://example.com/aapl'],
    });

    await waitFor(() => {
      expect(screen.queryByText('Old AAPL answer')).not.toBeInTheDocument();
    });
  });

  it('routes upgrade CTA to the canonical pricing hash', async () => {
    mockAskStockQuestion.mockRejectedValue(new Error('upgrade_required'));

    render(<StockQAPanel ticker="AAPL" />);

    fireEvent.click(screen.getByRole('button', { name: /bull vs bear case/i }));

    const upgradeLink = await screen.findByRole('link', { name: /upgrade to premium/i });
    fireEvent.click(upgradeLink);

    expect(window.location.hash).toBe('#tab=pricing');
  });
});
