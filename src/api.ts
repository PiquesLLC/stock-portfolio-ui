import { API_BASE_URL } from './config';
import {
  Portfolio,
  ProjectionResponse,
  MetricsResponse,
  HoldingInput,
  DividendEvent,
  DividendInput,
  ProjectionMode,
  LookbackPeriod,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function getPortfolio(): Promise<Portfolio> {
  return fetchJson<Portfolio>(`${API_BASE_URL}/portfolio`);
}

export async function getProjections(
  mode: ProjectionMode = 'sp500',
  lookback: LookbackPeriod = '1y'
): Promise<ProjectionResponse> {
  const params = new URLSearchParams({ mode });
  if (mode === 'realized') {
    params.append('lookback', lookback);
  }
  return fetchJson<ProjectionResponse>(`${API_BASE_URL}/portfolio/projections?${params}`);
}

export async function getMetrics(lookback: LookbackPeriod = '1y'): Promise<MetricsResponse> {
  return fetchJson<MetricsResponse>(`${API_BASE_URL}/portfolio/metrics?lookback=${lookback}`);
}

export async function updateCashBalance(cashBalance: number): Promise<{ cashBalance: number }> {
  return fetchJson<{ cashBalance: number }>(`${API_BASE_URL}/portfolio/cash`, {
    method: 'PUT',
    body: JSON.stringify({ cashBalance }),
  });
}

export async function addHolding(holding: HoldingInput): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings`, {
    method: 'POST',
    body: JSON.stringify(holding),
  });
}

export async function deleteHolding(ticker: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/portfolio/holdings/${ticker}`, {
    method: 'DELETE',
  });
}

// Dividend endpoints
export async function getDividends(): Promise<DividendEvent[]> {
  return fetchJson<DividendEvent[]>(`${API_BASE_URL}/dividends`);
}

export async function addDividend(dividend: DividendInput): Promise<DividendEvent> {
  return fetchJson<DividendEvent>(`${API_BASE_URL}/dividends`, {
    method: 'POST',
    body: JSON.stringify(dividend),
  });
}

export async function deleteDividend(id: string): Promise<void> {
  await fetchJson(`${API_BASE_URL}/dividends/${id}`, {
    method: 'DELETE',
  });
}
