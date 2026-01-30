import { useState, useCallback } from 'react';
import { CurrentPaceResponse, MarketSession } from '../types';
import { Projections } from './Projections';
import { GoalsPage } from './GoalsPage';

interface Props {
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
}

export function ProjectionsAndGoals({ currentValue, refreshTrigger, session }: Props) {
  const [annualizedPacePct, setAnnualizedPacePct] = useState<number | null>(null);

  const handlePaceData = useCallback((data: CurrentPaceResponse) => {
    setAnnualizedPacePct(data.dataStatus === 'ok' ? data.annualizedPacePct : null);
  }, []);

  return (
    <div className="space-y-8">
      <Projections
        currentValue={currentValue}
        refreshTrigger={refreshTrigger}
        session={session}
        onPaceData={handlePaceData}
      />
      <GoalsPage annualizedPacePct={annualizedPacePct} refreshTrigger={refreshTrigger} session={session} />
    </div>
  );
}
