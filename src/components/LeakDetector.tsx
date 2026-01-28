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

  const hasClusters = correlationClusters.length > 0;
  const hasHeatmap = heatmapData && heatmapData.tickers.length >= 2;
  const hasSummaries = summaries.length > 0;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Correlation Analysis</h3>
        <div className="flex items-center gap-2">
          {partial && !hasClusters && !hasHeatmap && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
              Building data
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

      {/* Building Data State - Show useful info instead of spinner */}
      {!hasClusters && !hasHeatmap && partial && (
        <div className="text-center py-4">
          <svg className="w-10 h-10 mx-auto mb-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-rh-light-text dark:text-rh-text font-medium">Building Correlation Data</p>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">
            Requires 60+ days of price history per holding
          </p>
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
