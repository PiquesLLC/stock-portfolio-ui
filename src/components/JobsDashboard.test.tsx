import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JobsDashboard } from './JobsDashboard';
import * as api from '../api';

vi.mock('../api', () => ({
  getJobMetrics: vi.fn(),
  getJobStats: vi.fn(),
  getDeadLetterEntries: vi.fn(),
  retryDeadLetterEntry: vi.fn(),
  resolveDeadLetterEntry: vi.fn(),
  getSnapshotHealth: vi.fn(),
  getStuckJobs: vi.fn(),
  healStuckJobs: vi.fn(),
}));

const mockGetJobMetrics = vi.mocked(api.getJobMetrics);
const mockGetJobStats = vi.mocked(api.getJobStats);
const mockGetDeadLetterEntries = vi.mocked(api.getDeadLetterEntries);
const mockGetSnapshotHealth = vi.mocked(api.getSnapshotHealth);
const mockGetStuckJobs = vi.mocked(api.getStuckJobs);
const mockHealStuckJobs = vi.mocked(api.healStuckJobs);

describe('JobsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJobMetrics.mockResolvedValue({
      period: { hours: 24, since: '2026-03-14T00:00:00.000Z' },
      runs: { total: 4, running: 1, success: 3, failed: 1, deadLettered: 0, successRate: 75, failureRate: 25, avgDurationMs: 500, p95DurationMs: 900 },
      idempotency: { activeKeys: 0, duplicateHits: 0 },
      deadLetters: { unresolved: 0 },
      jobs: [],
    });
    mockGetJobStats.mockResolvedValue({
      summary: {
        totalJobs: 1,
        totalRuns: 4,
        totalFailed: 1,
        totalDeadLettered: 0,
        failureRate: '25.0%',
        alert: { failureRate: 25, warningThreshold: 5, criticalThreshold: 15, severity: 'critical' },
      },
      jobs: [{
        jobName: 'snapshot_scheduler',
        total: 4,
        success: 3,
        failed: 1,
        deadLettered: 0,
        failureRate: 25,
        alertSeverity: 'critical',
        alertThresholds: { warning: 3, critical: 10 },
        failureCategories: { TRANSIENT: 1, PERMANENT: 0, RATE_LIMITED: 0, DATA_QUALITY: 0, UNKNOWN: 0 },
        avgDurationMs: 500,
        lastRun: '2026-03-14T10:00:00.000Z',
        lastError: '[TRANSIENT] timeout',
      }],
    });
    mockGetDeadLetterEntries.mockResolvedValue({
      entries: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasMore: false },
    });
    mockGetSnapshotHealth.mockResolvedValue({
      summary: { totalUsers: 1, healthy: 1, stale: 0, gaps: 0, critical: 0 },
      reports: [],
    });
    mockGetStuckJobs.mockResolvedValue({
      stuck: [{
        id: 'run-1',
        jobName: 'snapshot_scheduler',
        attempt: 1,
        maxAttempts: 3,
        startedAt: '2026-03-14T09:00:00.000Z',
        durationMs: null,
      }],
      count: 1,
    });
    mockHealStuckJobs.mockResolvedValue({
      target: 'stuck_jobs',
      dryRun: true,
      thresholdMinutes: 30,
      wouldHeal: 1,
      details: [{ id: 'run-1', jobName: 'snapshot_scheduler', action: 'would_mark_failed' }],
    });
  });

  it('requests stuck-job heal with the explicit threshold payload', async () => {
    render(<JobsDashboard onBack={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText('Jobs & Reliability')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /stuck \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /preview heal/i }));

    await waitFor(() => {
      expect(mockHealStuckJobs).toHaveBeenCalledWith({ dryRun: true, thresholdMinutes: 30 });
    });
    expect(screen.getByText('Dry run: 1 job would be healed')).toBeInTheDocument();
  });
});
