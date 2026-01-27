import { ProjectionResponse } from '../types';

interface Props {
  data: ProjectionResponse | null;
  loading: boolean;
  error: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetric(value: number): string {
  if (value === 0) return '0';
  // Show as percentage for easier interpretation
  return (value * 100).toFixed(4) + '%';
}

function formatDrawdown(value: number): string {
  if (value === 0) return '0%';
  return (value * 100).toFixed(2) + '%';
}

const horizonLabels: Record<string, string> = {
  '6mo': '6 Months',
  '1yr': '1 Year',
  '5yr': '5 Years',
  '10yr': '10 Years',
};

export function Projections({ data, loading, error }: Props) {
  if (loading && !data) {
    return (
      <div className="bg-rh-card border border-rh-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Projections</h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-rh-green border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rh-card border border-rh-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Projections</h2>
        <p className="text-rh-red text-center py-8">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const isInsufficientData = data.method === 'insufficient_data';
  const metrics = data.metrics;

  return (
    <div className="bg-rh-card border border-rh-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Portfolio Projections</h2>
        <div className="flex items-center gap-2">
          {isInsufficientData ? (
            <span className="text-sm text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
              Need more history
            </span>
          ) : (
            <span className="text-sm text-rh-muted">
              Momentum-based ({data.snapshotCount} snapshots)
            </span>
          )}
        </div>
      </div>

      {/* Insufficient data message */}
      {isInsufficientData && data.message && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
          <p className="text-yellow-400 text-sm">{data.message}</p>
        </div>
      )}

      <div className="mb-6">
        <p className="text-rh-muted text-sm mb-1">Current Value</p>
        <p className="text-2xl font-bold">{formatCurrency(data.currentValue)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {data.projections.map((proj) => {
          // Check if projections are meaningful (not just repeating current value)
          const hasVariation = proj.bull !== proj.base || proj.bear !== proj.base;
          const showProjections = !isInsufficientData || hasVariation;

          return (
            <div key={proj.horizon} className={`bg-rh-dark rounded-lg p-4 ${isInsufficientData ? 'opacity-50' : ''}`}>
              <p className="text-rh-muted text-sm mb-2">{horizonLabels[proj.horizon]}</p>
              {showProjections ? (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-rh-muted">Bull</span>
                    <span className="text-sm text-rh-green">{formatCurrency(proj.bull)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-rh-muted">Base</span>
                    <span className="text-sm font-semibold">{formatCurrency(proj.base)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-rh-muted">Bear</span>
                    <span className="text-sm text-rh-red">{formatCurrency(proj.bear)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <span className="text-rh-muted text-sm">—</span>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-rh-border">
                <div className="flex justify-between">
                  <span className="text-xs text-rh-muted">Confidence</span>
                  <span className={`text-xs ${proj.confidence < 30 ? 'text-yellow-400' : ''}`}>
                    {proj.confidence.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Projection Metrics */}
      {metrics && !isInsufficientData && (
        <div className="border-t border-rh-border pt-4">
          <p className="text-sm text-rh-muted mb-3">Projection Metrics (Daily)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-rh-muted">Velocity</p>
              <p className={`text-sm font-mono ${metrics.velocity > 0 ? 'text-rh-green' : metrics.velocity < 0 ? 'text-rh-red' : ''}`}>
                {formatMetric(metrics.velocity)}
              </p>
              <p className="text-xs text-rh-muted mt-0.5">
                ({(metrics.velocity * 252 * 100).toFixed(1)}% ann.)
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-muted">Acceleration</p>
              <p className={`text-sm font-mono ${metrics.acceleration > 0 ? 'text-rh-green' : metrics.acceleration < 0 ? 'text-rh-red' : ''}`}>
                {formatMetric(metrics.acceleration)}
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-muted">Volatility</p>
              <p className="text-sm font-mono">{formatMetric(metrics.volatility)}</p>
              <p className="text-xs text-rh-muted mt-0.5">
                ({(metrics.volatility * Math.sqrt(252) * 100).toFixed(1)}% ann.)
              </p>
            </div>
            <div>
              <p className="text-xs text-rh-muted">Drawdown</p>
              <p className={`text-sm font-mono ${metrics.drawdown < -0.05 ? 'text-rh-red' : metrics.drawdown < 0 ? 'text-yellow-400' : ''}`}>
                {formatDrawdown(metrics.drawdown)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No metrics available */}
      {!metrics && isInsufficientData && (
        <div className="border-t border-rh-border pt-4">
          <p className="text-sm text-rh-muted text-center py-2">
            Metrics will appear once enough history is collected
          </p>
        </div>
      )}
    </div>
  );
}
