import { beforeEach, describe, expect, it, vi } from 'vitest';
import { healStuckJobs } from './api';

describe('jobs admin API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        target: 'stuck_jobs',
        dryRun: true,
        thresholdMinutes: 45,
        wouldHeal: 2,
        details: [],
      }),
    }));
  });

  it('posts explicit stuck-job heal params', async () => {
    await healStuckJobs({ dryRun: true, thresholdMinutes: 45 });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/jobs/heal'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          target: 'stuck_jobs',
          dryRun: true,
          thresholdMinutes: 45,
        }),
      }),
    );
  });
});
