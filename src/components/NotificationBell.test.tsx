import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
import * as api from '../api';

vi.mock('../api', () => ({
  getAlertEvents: vi.fn(),
  getUnreadAlertCount: vi.fn(),
  markAlertRead: vi.fn(),
  markAllAlertsRead: vi.fn(),
  getPriceAlertEvents: vi.fn(),
  getUnreadPriceAlertCount: vi.fn(),
  markPriceAlertEventRead: vi.fn(),
  getAnalystEvents: vi.fn(),
  getUnreadAnalystCount: vi.fn(),
  markAllAnalystEventsRead: vi.fn(),
  getMilestoneEvents: vi.fn(),
  getUnreadMilestoneCount: vi.fn(),
  markMilestoneEventRead: vi.fn(),
  markAllMilestoneEventsRead: vi.fn(),
  getAnomalies: vi.fn(),
  markAnomalyRead: vi.fn(),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('./AlertsPanel', () => ({
  AlertsPanel: () => null,
}));

vi.mock('../utils/push', () => ({
  isPushSupported: () => false,
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  isPushSubscribed: vi.fn().mockResolvedValue(false),
  getPushPermission: () => 'unsupported',
}));

const mockGetUnreadAlertCount = vi.mocked(api.getUnreadAlertCount);
const mockGetUnreadPriceAlertCount = vi.mocked(api.getUnreadPriceAlertCount);
const mockGetUnreadAnalystCount = vi.mocked(api.getUnreadAnalystCount);
const mockGetUnreadMilestoneCount = vi.mocked(api.getUnreadMilestoneCount);
const mockGetAnomalies = vi.mocked(api.getAnomalies);
const mockGetAlertEvents = vi.mocked(api.getAlertEvents);
const mockGetPriceAlertEvents = vi.mocked(api.getPriceAlertEvents);
const mockGetAnalystEvents = vi.mocked(api.getAnalystEvents);
const mockGetMilestoneEvents = vi.mocked(api.getMilestoneEvents);
const mockMarkAllAlertsRead = vi.mocked(api.markAllAlertsRead);
const mockMarkAllAnalystEventsRead = vi.mocked(api.markAllAnalystEventsRead);
const mockMarkAllMilestoneEventsRead = vi.mocked(api.markAllMilestoneEventsRead);
const mockMarkAnomalyRead = vi.mocked(api.markAnomalyRead);

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUnreadAlertCount.mockResolvedValue({ count: 1 });
    mockGetUnreadPriceAlertCount.mockResolvedValue({ count: 0 });
    mockGetUnreadAnalystCount.mockResolvedValue({ count: 0 });
    mockGetUnreadMilestoneCount.mockResolvedValue({ count: 0 });
    mockGetAnomalies.mockResolvedValue([
      { id: 'a-visible', type: 'price_spike', title: 'Visible', analysis: null, read: false, createdAt: '2026-03-14T10:00:00.000Z', ticker: 'AAPL' },
      { id: 'a-hidden', type: 'concentration', title: 'Hidden', analysis: null, read: false, createdAt: '2026-03-14T09:00:00.000Z', ticker: null },
    ] as any);
    mockGetAlertEvents.mockResolvedValue([]);
    mockGetPriceAlertEvents.mockResolvedValue([]);
    mockGetAnalystEvents.mockResolvedValue([]);
    mockGetMilestoneEvents.mockResolvedValue([]);
    mockMarkAllAlertsRead.mockResolvedValue();
    mockMarkAllAnalystEventsRead.mockResolvedValue();
    mockMarkAllMilestoneEventsRead.mockResolvedValue();
    mockMarkAnomalyRead.mockResolvedValue();
    localStorage.clear();
  });

  it('excludes hidden concentration anomalies from the unread badge', async () => {
    render(<NotificationBell userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(mockGetAnomalies).toHaveBeenCalledWith(100);
  });

  it('marks only visible anomalies as read when opening the dropdown', async () => {
    render(<NotificationBell userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(mockMarkAnomalyRead).toHaveBeenCalledWith('a-visible');
    });
    expect(mockMarkAnomalyRead).not.toHaveBeenCalledWith('a-hidden');
    expect(mockMarkAllAlertsRead).toHaveBeenCalledWith('user-1');
    expect(mockMarkAllAnalystEventsRead).toHaveBeenCalled();
    expect(mockMarkAllMilestoneEventsRead).toHaveBeenCalled();
  });
});
