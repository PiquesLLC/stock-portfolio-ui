import { useState, useEffect, useCallback, useRef } from 'react';

type AlertLevel = 'ok' | 'warning' | 'critical';

interface JobAlertState {
  level: AlertLevel;
  failedCount: number;
  dlqCount: number;
  stuckCount: number;
}

const POLL_INTERVAL = 60_000; // 1 minute

export function useJobAlerts(isAdmin: boolean): JobAlertState {
  const [state, setState] = useState<JobAlertState>({ level: 'ok', failedCount: 0, dlqCount: 0, stuckCount: 0 });
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [statsRes, dlqRes, stuckRes] = await Promise.all([
        fetch('/api/admin/jobs/stats', { credentials: 'include' }),
        fetch('/api/admin/jobs/dead-letter', { credentials: 'include' }),
        fetch('/api/admin/jobs/stuck', { credentials: 'include' }),
      ]);
      if (!statsRes.ok || !dlqRes.ok || !stuckRes.ok) return;

      const stats = await statsRes.json();
      const dlq = await dlqRes.json();
      const stuck = await stuckRes.json();

      if (!mountedRef.current) return;

      const failedCount = stats.summary?.totalFailed ?? 0;
      const totalRuns = stats.summary?.totalRuns ?? 0;
      const dlqCount = (dlq.entries ?? []).filter((e: { resolved: boolean }) => !e.resolved).length;
      const stuckCount = stuck.count ?? 0;

      const failureRate = totalRuns > 0 ? failedCount / totalRuns : 0;

      let level: AlertLevel = 'ok';
      if (failureRate > 0.15 || stuckCount > 2) level = 'critical';
      else if (failureRate > 0.05 || stuckCount > 0 || dlqCount > 3) level = 'warning';

      setState({ level, failedCount, dlqCount, stuckCount });
    } catch {
      // silently ignore — don't disrupt the main app
    }
  }, [isAdmin]);

  useEffect(() => {
    mountedRef.current = true;
    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [check]);

  return state;
}
