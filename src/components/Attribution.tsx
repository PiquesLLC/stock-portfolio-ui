import { useState, useMemo } from 'react';
import { Attribution as AttributionType, AttributionWindow } from '../types';
import { getAttribution } from '../api';
import { InfoTooltip } from './InfoTooltip';

interface AttributionProps {
  initialData: AttributionType;
  onTickerClick?: (ticker: string) => void;
}

interface WaterfallEntry {
  ticker: string;
  contributionDollar: number;
  contributionPct: number;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

// ---- Waterfall Chart Sub-component ----

interface WaterfallChartProps {
  topContributors: WaterfallEntry[];
  topDetractors: WaterfallEntry[];
  onTickerClick?: (ticker: string) => void;
}

function WaterfallChart({ topContributors, topDetractors, onTickerClick }: WaterfallChartProps) {
  const items = useMemo(() => {
    // Take top 5 contributors and top 5 detractors, sorted so contributors come first
    // then detractors, which creates the classic waterfall shape (rises then falls)
    const contributors = topContributors.slice(0, 5);
    const detractors = topDetractors.slice(0, 5);
    return [...contributors, ...detractors];
  }, [topContributors, topDetractors]);

  if (items.length === 0) return null;

  const totalReturn = items.reduce((sum, item) => sum + item.contributionDollar, 0);

  // Compute running totals to determine bar positions
  const bars = useMemo(() => {
    let runningTotal = 0;
    const result = items.map((item) => {
      const start = runningTotal;
      runningTotal += item.contributionDollar;
      return {
        ticker: item.ticker,
        value: item.contributionDollar,
        start,
        end: runningTotal,
        isPositive: item.contributionDollar >= 0,
      };
    });
    // Add the total bar
    result.push({
      ticker: 'Total',
      value: totalReturn,
      start: 0,
      end: totalReturn,
      isPositive: totalReturn >= 0,
    });
    return result;
  }, [items, totalReturn]);

  // Calculate the min/max values for the Y axis
  const allYValues = bars.flatMap((b) => [b.start, b.end, 0]);
  const rawMin = Math.min(...allYValues);
  const rawMax = Math.max(...allYValues);
  // Add 25% padding for labels
  const yRange = rawMax - rawMin || 1;
  const yMin = rawMin - yRange * 0.3;
  const yMax = rawMax + yRange * 0.35;

  // SVG dimensions
  const barCount = bars.length;
  const barWidth = 24;
  const barGap = 8;
  const chartLeftPadding = 8;
  const chartRightPadding = 8;
  const chartWidth = chartLeftPadding + barCount * barWidth + (barCount - 1) * barGap + chartRightPadding;
  const chartHeight = 160;
  const topMargin = 28;
  const bottomMargin = 32;
  const plotHeight = chartHeight - topMargin - bottomMargin;

  // Map data value to Y pixel coordinate (inverted: higher value = lower Y)
  const yScale = (val: number) => {
    return topMargin + (1 - (val - yMin) / (yMax - yMin)) * plotHeight;
  };

  const xForBar = (index: number) => {
    return chartLeftPadding + index * (barWidth + barGap);
  };

  // Grid lines: compute nice round values
  const gridLines = useMemo(() => {
    const lines: number[] = [];
    const step = yRange / 4;
    // Round step to nearest nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(step || 1)));
    const niceStep = Math.ceil(step / magnitude) * magnitude;
    const startVal = Math.floor(rawMin / niceStep) * niceStep;
    for (let v = startVal; v <= rawMax + niceStep; v += niceStep) {
      if (v >= yMin && v <= yMax) {
        lines.push(v);
      }
    }
    return lines;
  }, [rawMin, rawMax, yMin, yMax, yRange]);

  // Zero line position
  const zeroY = yScale(0);

  return (
    <div className="mt-5 pt-4 border-t border-gray-200/60 dark:border-white/[0.06]">
      <h4 className="text-xs font-medium uppercase tracking-wider text-rh-light-muted dark:text-white/40 mb-3">
        Contribution Flow
      </h4>
      <div className="bg-gray-50/80 dark:bg-white/[0.03] rounded-lg p-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          style={{ minWidth: `${Math.max(chartWidth, 280)}px`, maxWidth: '100%' }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {gridLines.map((val) => {
            const y = yScale(val);
            return (
              <g key={`grid-${val}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-white/[0.06]"
                  strokeWidth={0.5}
                  strokeDasharray={val === 0 ? undefined : '2,3'}
                />
              </g>
            );
          })}

          {/* Zero line (solid, slightly more visible) */}
          <line
            x1={0}
            y1={zeroY}
            x2={chartWidth}
            y2={zeroY}
            stroke="currentColor"
            className="text-gray-300 dark:text-white/[0.12]"
            strokeWidth={0.75}
          />

          {/* Bars and connectors */}
          {bars.map((bar, i) => {
            const x = xForBar(i);
            const isTotal = bar.ticker === 'Total';
            const barTop = yScale(Math.max(bar.start, bar.end));
            const barBottom = yScale(Math.min(bar.start, bar.end));
            const barH = Math.max(barBottom - barTop, 1.5);

            // Colors
            let fillColor: string;
            if (isTotal) {
              fillColor = bar.isPositive ? '#00C805' : '#E8544E';
            } else {
              fillColor = bar.isPositive ? '#00C805' : '#E8544E';
            }
            const fillOpacity = isTotal ? 0.85 : 0.55;

            // Connector line to next bar
            const showConnector = i < bars.length - 2; // Not from last holding or total
            const nextX = xForBar(i + 1);
            const connectorY = yScale(bar.end);

            // Value label position
            const labelY = bar.isPositive || isTotal
              ? barTop - 4
              : barBottom + 10;

            return (
              <g key={bar.ticker}>
                {/* Bar */}
                <rect
                  x={x}
                  y={barTop}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                  className={!isTotal ? 'cursor-pointer' : ''}
                  onClick={() => !isTotal && onTickerClick?.(bar.ticker)}
                >
                  <title>{`${bar.ticker}: ${formatCurrency(bar.value)}`}</title>
                </rect>

                {/* Total bar has a distinct border */}
                {isTotal && (
                  <rect
                    x={x}
                    y={barTop}
                    width={barWidth}
                    height={barH}
                    rx={2}
                    fill="none"
                    stroke={fillColor}
                    strokeWidth={1.5}
                    strokeOpacity={0.9}
                  />
                )}

                {/* Dollar value label above/below bar */}
                <text
                  x={x + barWidth / 2}
                  y={labelY}
                  textAnchor="middle"
                  className={`text-[7px] font-medium ${
                    bar.isPositive || (isTotal && bar.isPositive)
                      ? 'fill-[#00C805]'
                      : 'fill-[#E8544E]'
                  }`}
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
                >
                  {formatCompact(bar.value)}
                </text>

                {/* Ticker label below chart */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - bottomMargin + 14}
                  textAnchor="middle"
                  className={`text-[7px] ${
                    isTotal
                      ? 'font-semibold fill-gray-500 dark:fill-white/60'
                      : 'font-normal fill-gray-400 dark:fill-white/40'
                  }`}
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
                    cursor: !isTotal ? 'pointer' : 'default',
                  }}
                  onClick={() => !isTotal && onTickerClick?.(bar.ticker)}
                >
                  {bar.ticker}
                </text>

                {/* Connector line from this bar's end to next bar's start */}
                {showConnector && (
                  <line
                    x1={x + barWidth}
                    y1={connectorY}
                    x2={nextX}
                    y2={connectorY}
                    stroke="currentColor"
                    className="text-gray-300 dark:text-white/[0.15]"
                    strokeWidth={0.75}
                    strokeDasharray="2,2"
                  />
                )}
              </g>
            );
          })}

          {/* Separator line before Total bar */}
          {bars.length > 1 && (
            <line
              x1={xForBar(bars.length - 1) - barGap / 2}
              y1={topMargin - 4}
              x2={xForBar(bars.length - 1) - barGap / 2}
              y2={chartHeight - bottomMargin + 4}
              stroke="currentColor"
              className="text-gray-300 dark:text-white/[0.1]"
              strokeWidth={0.5}
              strokeDasharray="3,3"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

const WINDOW_LABELS: Record<AttributionWindow, string> = {
  '1d': 'Today',
  '5d': '5 Days',
  '1m': '1 Month',
};

export function Attribution({ initialData, onTickerClick }: AttributionProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<AttributionWindow>(initialData.window);

  const handleWindowChange = async (window: AttributionWindow) => {
    if (window === selectedWindow) return;

    setLoading(true);
    setSelectedWindow(window);

    try {
      const newData = await getAttribution(window);
      setData(newData);
    } catch (err) {
      console.error('Failed to fetch attribution:', err);
    } finally {
      setLoading(false);
    }
  };

  const { topContributors, topDetractors, partial } = data;

  const allEntries = [...topContributors, ...topDetractors];
  const maxAbsDollar = allEntries.length > 0
    ? Math.max(...allEntries.map(e => Math.abs(e.contributionDollar)))
    : 0;

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-lg p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-rh-light-text dark:text-rh-text flex items-center gap-2">What Moved My Portfolio? <InfoTooltip text="Attribution shows which holdings contributed most to your portfolio's gain or loss. Contribution = holding's dollar P&L over the selected window, ranked by absolute impact." /></h3>

        {/* Window Selector */}
        <div className="flex gap-1 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-1">
          {(Object.keys(WINDOW_LABELS) as AttributionWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowChange(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedWindow === w
                  ? 'bg-rh-light-card dark:bg-rh-card text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted">
            <div className="w-3 h-3 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin"></div>
            <span>Loading...</span>
          </div>
        </div>
      )}
      {partial && topContributors.length === 0 && topDetractors.length === 0 ? (
        <p className="text-sm text-rh-light-muted/60 dark:text-rh-muted/60 italic">
          Add holdings to see what's driving your returns.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Contributors */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-rh-green/80 mb-2">Contributors</h4>
              {topContributors.length === 0 ? (
                <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 italic">No gains this period</p>
              ) : (
                <div className="space-y-1.5">
                  {topContributors.map((h) => {
                    const barWidth = maxAbsDollar > 0 ? (Math.abs(h.contributionDollar) / maxAbsDollar) * 100 : 0;
                    return (
                      <div key={h.ticker} className="flex items-center gap-2">
                        <button className="w-12 text-sm font-medium text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors cursor-pointer text-left shrink-0" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</button>
                        <div className="flex-1 h-3 bg-rh-light-bg dark:bg-rh-dark rounded-sm overflow-hidden">
                          <div className="h-full bg-rh-green/50 rounded-sm" style={{ width: `${Math.max(barWidth, 3)}%` }} />
                        </div>
                        <span className="text-rh-green text-xs font-medium w-16 text-right shrink-0 tabular-nums">{formatCurrency(h.contributionDollar)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Detractors */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-rh-red/80 mb-2">Detractors</h4>
              {topDetractors.length === 0 ? (
                <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 italic">No losses this period</p>
              ) : (
                <div className="space-y-1.5">
                  {topDetractors.map((h) => {
                    const barWidth = maxAbsDollar > 0 ? (Math.abs(h.contributionDollar) / maxAbsDollar) * 100 : 0;
                    return (
                      <div key={h.ticker} className="flex items-center gap-2">
                        <button className="w-12 text-sm font-medium text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors cursor-pointer text-left shrink-0" onClick={() => onTickerClick?.(h.ticker)}>{h.ticker}</button>
                        <div className="flex-1 h-3 bg-rh-light-bg dark:bg-rh-dark rounded-sm overflow-hidden">
                          <div className="h-full bg-rh-red/40 rounded-sm" style={{ width: `${Math.max(barWidth, 3)}%` }} />
                        </div>
                        <span className="text-rh-red text-xs font-medium w-16 text-right shrink-0 tabular-nums">{formatCurrency(h.contributionDollar)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Waterfall Chart */}
          <WaterfallChart
            topContributors={topContributors}
            topDetractors={topDetractors}
            onTickerClick={onTickerClick}
          />
        </>
      )}
    </div>
  );
}
