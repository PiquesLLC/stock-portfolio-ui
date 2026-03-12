import { useState, useCallback } from 'react';
import { CurrentPaceResponse, MarketSession } from '../types';
import { Projections } from './Projections';
import { GoalsPage } from './GoalsPage';

interface Props {
  currentValue: number;
  refreshTrigger?: number;
  session?: MarketSession;
  portfolioId?: string;
}

export function ProjectionsAndGoals({ currentValue, refreshTrigger, session, portfolioId }: Props) {
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
        portfolioId={portfolioId}
      />
      <GoalsPage annualizedPacePct={annualizedPacePct} refreshTrigger={refreshTrigger} session={session} portfolioId={portfolioId} />
    </div>
  );
}
