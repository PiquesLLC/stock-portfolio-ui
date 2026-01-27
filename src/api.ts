import { API_BASE_URL } from './config';
import { Portfolio, ProjectionResponse, HoldingInput } from './types';

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

export async function getProjections(): Promise<ProjectionResponse> {
  return fetchJson<ProjectionResponse>(`${API_BASE_URL}/portfolio/projections`);
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
