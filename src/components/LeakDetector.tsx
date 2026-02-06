import { LeakDetectorResult } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface LeakDetectorProps {
  data: LeakDetectorResult;
}

function CorrelationHeatmap({ heatmapData }: { heatmapData: LeakDetectorResult['heatmapData'] }) {
  if (!heatmapData || heatmapData.tickers.length === 0) return null;

  const { tickers, matrix } = heatmapData;

  const getColor = (corr: number) => {
    if (corr >= 0.8) return 'bg-red-500';
    if (corr >= 0.6) return 'bg-orange-500';
    if (corr >= 0.4) return 'bg-yellow-500';
    if (corr >= 0.2) return 'bg-green-500';
    return 'bg-blue-500';
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-1"></th>
            {tickers.map((t) => (
              <th key={t} className="p-1 text-rh-light-muted dark:text-rh-muted font-normal">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={tickers[i]}>
              <td className="p-1 text-rh-light-muted dark:text-rh-muted">{tickers[i]}</td>
              {row.map((corr, j) => (
                <td key={j} className="p-1">
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center text-white text-[10px] ${
                      i === j ? 'bg-gray-600' : getColor(corr)
                    }`}
                    title={`${tickers[i]} vs ${tickers[j]}: ${(corr * 100).toFixed(0)}%`}
                  >
                    {i !== j && corr >= 0.5 ? (corr * 100).toFixed(0) : ''}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-2">
        Red = highly correlated (80%+), Orange = correlated (60-80%), Yellow = moderate (40-60%)
      </p>
    </div>
  );
}

export function LeakDetector({ data }: LeakDetectorProps) {
  const { correlationClusters, summaries, heatmapData, partial, spyCorrelation, suggestedActions, hiddenConcentration } = data;

  const hasClusters = correlationClusters.length > 0;
  const hasHeatmap = heatmapData && heatmapData.tickers.length >= 2;
  const hasSummaries = summaries.length > 0;

  return (
    <div className="bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-rh-light-border dark:border-rh-border rounded-lg p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">Correlation Analysis <InfoTooltip text="Pearson correlation of daily returns between holdings. Clusters show groups with correlation > 0.7, meaning they tend to move together. High correlation reduces effective diversification." /></h3>
        <div className="flex items-center gap-2">
          {partial && !hasClusters && !hasHeatmap && (
            <span className="text-xs px-2 py-1 rounded-full bg-rh-light-muted/10 dark:bg-white/10 text-rh-light-muted dark:text-rh-muted">
              Data limited
            </span>
          )}
          {!hasClusters && !partial && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-rh-green">
              Diversified
            </span>
          )}
          {hasClusters && (
            <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
              Overlap found
            </span>
          )}
        </div>
      </div>

      {/* SPY Correlation Badge */}
      {spyCorrelation !== null && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-rh-light-muted dark:text-rh-muted">Portfolio vs SPY correlation:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            Math.abs(spyCorrelation) > 0.8
              ? 'bg-red-500/15 text-red-400'
              : Math.abs(spyCorrelation) > 0.5
                ? 'bg-yellow-500/15 text-yellow-400'
                : 'bg-green-500/15 text-rh-green'
          }`}>
            <span className="tabular-nums">{spyCorrelation.toFixed(2)}</span>
          </span>
          <span className="text-[11px] text-rh-light-muted/70 dark:text-rh-muted/70">
            {Math.abs(spyCorrelation) > 0.8
              ? 'Moves closely with the market'
              : Math.abs(spyCorrelation) > 0.5
                ? 'Moderate market correlation'
                : 'Low market correlation'}
          </span>
        </div>
      )}

      {/* Correlation Clusters */}
      {hasClusters && (
        <div className="space-y-3 mb-4">
          {correlationClusters.map((cluster, i) => (
            <div
              key={i}
              className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
            >
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <div>
                  <p className="text-rh-light-text dark:text-rh-text font-medium text-sm">
                    Correlated holdings:
                  </p>
                  <p className="text-yellow-400 font-semibold">
                    {cluster.tickers.join(', ')}
                  </p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                    {(cluster.avgCorrelation * 100).toFixed(0)}% correlation — these move together
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Well Diversified State */}
      {!hasClusters && !partial && (
        <div className="text-center py-4">
          <svg className="w-10 h-10 mx-auto mb-2 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-rh-light-text dark:text-rh-text font-medium">Well Diversified</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">No highly correlated clusters</p>
        </div>
      )}

      {/* Data Limited State - Show what we CAN compute */}
      {!hasClusters && !hasHeatmap && partial && (
        <div className="space-y-3">
          <div className="space-y-2">
            {spyCorrelation === null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-rh-light-muted dark:text-rh-muted">Holdings tracked</span>
                <span className="text-rh-light-text dark:text-rh-text font-medium">
                  {correlationClusters.length > 0 ? 'Analyzing...' : 'Collecting data'}
                </span>
              </div>
            )}
            <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
              Full correlation matrix needs 60+ days of history. Collecting daily price data.
            </p>
          </div>
        </div>
      )}

      {/* Hidden Concentration Warning */}
      {hiddenConcentration && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-400">Hidden Concentration</p>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
                Effective diversification is less than 50% of your holding count due to correlation overlap.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {suggestedActions && suggestedActions.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {suggestedActions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
              <span className="text-rh-light-text dark:text-rh-text mt-0.5">•</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Messages */}
      {hasSummaries && (
        <div className={`${hasClusters ? 'pt-3 border-t border-rh-light-border dark:border-rh-border' : ''}`}>
          {summaries.map((summary, i) => (
            <p key={i} className="text-sm text-rh-light-muted dark:text-rh-muted">
              {summary}
            </p>
          ))}
        </div>
      )}

      {/* Correlation Heatmap */}
      {hasHeatmap && (
        <details className="mt-4">
          <summary className="text-sm text-rh-light-muted dark:text-rh-muted cursor-pointer hover:text-rh-light-text dark:hover:text-rh-text">
            View correlation matrix
          </summary>
          <CorrelationHeatmap heatmapData={heatmapData} />
        </details>
      )}
    </div>
  );
}
