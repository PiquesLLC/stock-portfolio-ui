import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NalaScore } from './NalaScore';
import * as api from '../api';
import type { NalaScoreResponse } from '../types';

vi.mock('../api', () => ({
  getNalaScore: vi.fn(),
}));

const mockGetNalaScore = vi.mocked(api.getNalaScore);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeScore(ticker: string, composite: number, insight: string): NalaScoreResponse {
  return {
    ticker,
    composite,
    grade: composite >= 75 ? 'Strong' : 'Fair',
    dataAge: 'fresh',
    isETF: false,
    availableDimensions: ['Value', 'Quality'],
    lastUpdated: '2026-03-14T10:00:00.000Z',
    keyInsights: [insight],
    dimensions: {
      value: {
        name: 'Value',
        score: composite,
        weight: 0.25,
        subMetrics: [{ name: 'P/E', score: 8, maxScore: 10, rawValue: '18x', explanation: 'Reasonable multiple' }],
        insight: insight,
      },
      quality: {
        name: 'Quality',
        score: composite - 5,
        weight: 0.25,
        subMetrics: [{ name: 'ROE', score: 7, maxScore: 10, rawValue: '19%', explanation: 'Healthy returns' }],
        insight: `${insight} quality`,
      },
    },
  };
}

describe('NalaScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores a late score response from the previous ticker', async () => {
    const aaplRequest = deferred<NalaScoreResponse | null>();
    const msftRequest = deferred<NalaScoreResponse | null>();

    mockGetNalaScore
      .mockImplementationOnce(() => aaplRequest.promise)
      .mockImplementationOnce(() => msftRequest.promise);

    const { rerender } = render(<NalaScore ticker="AAPL" />);

    rerender(<NalaScore ticker="MSFT" />);

    aaplRequest.resolve(makeScore('AAPL', 41, 'AAPL insight'));

    await waitFor(() => {
      expect(screen.queryByText('AAPL insight')).not.toBeInTheDocument();
    });

    msftRequest.resolve(makeScore('MSFT', 88, 'MSFT insight'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /key insights/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /key insights/i }));

    expect(screen.queryByText('AAPL insight')).not.toBeInTheDocument();
    expect(screen.getByText('MSFT insight')).toBeInTheDocument();
  });
});
