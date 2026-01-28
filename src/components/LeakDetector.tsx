import { LeakDetectorResult } from '../types';

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
  const { correlationClusters, summaries, heatmapData, partial } = data;

  // Check if we have any meaningful content
  const hasClusters = correlationClusters.length > 0;
  const hasHeatmap = heatmapData && heatmapData.tickers.length >= 2;
  const hasSummaries = summaries.length > 0;

  // Partial state with some data
  if (partial && !hasClusters && !hasHeatmap) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text mb-4">Diversification Check</h3>

        {/* Caching indicator */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0"></div>
          <div>
            <p className="text-sm text-blue-400 font-medium">Caching price history...</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              Correlation analysis requires historical data. Refresh to check progress.
            </p>
          </div>
        </div>

        {/* Show any summaries we have */}
        {hasSummaries && (
          <div className="space-y-2">
            {summaries.map((summary, i) => (
              <p key={i} className="text-sm text-rh-light-muted dark:text-rh-muted">
                {summary}
              </p>
            ))}
          </div>
        )}

        {!hasSummaries && (
          <p className="text-rh-light-muted dark:text-rh-muted">
            Need at least 60 days of price data to analyze correlations.
          </p>
        )}
      </div>
    );
  }

  const hasIssues = correlationClusters.length > 0;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Diversification Check</h3>
        <div className="flex items-center gap-2">
          {partial && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
              Partial data
            </span>
          )}
          {!hasIssues && !partial && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-rh-green">
              Well diversified
            </span>
          )}
        </div>
      </div>

      {!hasIssues ? (
        <div className="text-center py-4">
          <svg className="w-12 h-12 mx-auto mb-3 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-rh-light-text dark:text-rh-text font-medium">No correlation clusters found</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">Your holdings appear well diversified</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Correlation Clusters */}
          {correlationClusters.map((cluster, i) => (
            <div
              key={i}
              className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
            >
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-rh-light-text dark:text-rh-text font-medium">
                    These stocks move together:
                  </p>
                  <p className="text-yellow-500 font-semibold mt-1">
                    {cluster.tickers.join(', ')}
                  </p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-1">
                    {(cluster.avgCorrelation * 100).toFixed(0)}% average correlation
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Summary Messages */}
          {summaries.length > 0 && (
            <div className="pt-4 border-t border-rh-light-border dark:border-rh-border">
              {summaries.map((summary, i) => (
                <p key={i} className="text-sm text-rh-light-muted dark:text-rh-muted">
                  {summary}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Correlation Heatmap */}
      {heatmapData && heatmapData.tickers.length >= 3 && (
        <details className="mt-4">
          <summary className="text-sm text-rh-light-muted dark:text-rh-muted cursor-pointer hover:text-rh-light-text dark:hover:text-rh-text">
            Show correlation matrix
          </summary>
          <CorrelationHeatmap heatmapData={heatmapData} />
        </details>
      )}
    </div>
  );
}
