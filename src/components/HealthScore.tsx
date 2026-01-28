import { HealthScore as HealthScoreType } from '../types';

interface HealthScoreProps {
  data: HealthScoreType;
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-rh-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 25) return 'text-orange-400';
  return 'text-rh-red';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Needs Work';
  return 'At Risk';
}

function BreakdownBar({ label, value, maxValue = 25 }: { label: string; value: number; maxValue?: number }) {
  const pct = Math.max(0, (value / maxValue) * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-rh-light-muted dark:text-rh-muted w-28">{label}</span>
      <div className="flex-1 h-2 bg-rh-light-border dark:bg-rh-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? 'bg-rh-green' : pct >= 50 ? 'bg-yellow-400' : 'bg-rh-red'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-rh-light-text dark:text-rh-text w-10 text-right">{value}/{maxValue}</span>
    </div>
  );
}

export function HealthScore({ data }: HealthScoreProps) {
  const { overall, breakdown, reasons, quickFixes, partial } = data;

  if (partial) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Health</h3>
        <p className="text-rh-light-muted dark:text-rh-muted">Add holdings to see your health score</p>
      </div>
    );
  }

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Portfolio Health</h3>

      <div className="flex items-center gap-6 mb-6">
        {/* Circular Score */}
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-rh-light-border dark:text-rh-border"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * overall) / 100}
              strokeLinecap="round"
              className={getScoreColor(overall)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(overall)}`}>{overall}</span>
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">/100</span>
          </div>
        </div>

        <div>
          <p className={`text-xl font-semibold ${getScoreColor(overall)}`}>{getScoreLabel(overall)}</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">Portfolio Health Score</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 mb-6">
        <BreakdownBar label="Concentration" value={breakdown.concentration} />
        <BreakdownBar label="Volatility" value={breakdown.volatility} />
        <BreakdownBar label="Drawdown" value={breakdown.drawdown} />
        <BreakdownBar label="Diversification" value={breakdown.diversification} />
        {breakdown.margin > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-rh-light-muted dark:text-rh-muted w-28">Margin Penalty</span>
            <span className="text-sm text-rh-red">-{breakdown.margin} points</span>
          </div>
        )}
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">What's Affecting Your Score</h4>
          <ul className="space-y-1">
            {reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-rh-light-muted dark:text-rh-muted">
                <span className="text-yellow-500 mt-0.5">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Fixes */}
      {quickFixes.length > 0 && (
        <div className="pt-4 border-t border-rh-light-border dark:border-rh-border">
          <h4 className="text-sm font-medium text-rh-light-text dark:text-rh-text mb-2">Quick Fixes</h4>
          <ul className="space-y-1">
            {quickFixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-rh-green">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {fix}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
