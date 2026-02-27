import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listDeepResearchJobs,
  getDeepResearchStatus,
  DeepResearchJobSummary,
  DeepResearchJobStatus,
} from '../api';

const POLL_INTERVAL_MS = 5_000;
const ACTIVE_STATUSES = new Set(['queued', 'submitted', 'in_progress']);

export function useDeepResearchPoller() {
  const [jobs, setJobs] = useState<DeepResearchJobSummary[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<Map<string, DeepResearchJobStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchJobs = useCallback(async () => {
    try {
      const resp = await listDeepResearchJobs({ limit: 50 });
      if (!mountedRef.current) return;
      setJobs(resp.jobs);
      setError(null);

      // Fetch detailed status for active jobs
      const active = resp.jobs.filter(j => ACTIVE_STATUSES.has(j.status));
      if (active.length > 0) {
        const statuses = await Promise.all(
          active.map(j => getDeepResearchStatus(j.id).catch(() => null))
        );
        if (!mountedRef.current) return;
        const map = new Map<string, DeepResearchJobStatus>();
        statuses.forEach(s => { if (s) map.set(s.id, s); });
        setActiveStatuses(map);
      } else {
        setActiveStatuses(new Map());
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load research jobs');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchJobs();
    return () => { mountedRef.current = false; };
  }, [fetchJobs]);

  // Poll only when active jobs exist
  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE_STATUSES.has(j.status));

    if (hasActive) {
      timerRef.current = setInterval(fetchJobs, POLL_INTERVAL_MS);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [jobs, fetchJobs]);

  return { jobs, activeStatuses, loading, error, refresh: fetchJobs };
}
