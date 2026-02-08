import { EconomicIndicator } from '../../types';

// Indicator health sentiment — drives subtle card accent colors
export type IndicatorSentiment = 'healthy' | 'caution' | 'concern' | 'neutral';

export function getIndicatorSentiment(indicator: EconomicIndicator): IndicatorSentiment {
  const { name, latestValue, changePercent } = indicator;
  if (latestValue == null) return 'neutral';

  switch (name) {
    case 'Consumer Price Index':
      // CPI: period-over-period change indicates inflation pace
      if (changePercent != null) {
        if (changePercent < 2.5) return 'healthy';
        if (changePercent < 4) return 'caution';
        return 'concern';
      }
      return 'neutral';
    case 'Inflation Rate':
      if (latestValue <= 2.5) return 'healthy';
      if (latestValue <= 4) return 'caution';
      return 'concern';
    case 'GDP Growth':
      if (latestValue > 2) return 'healthy';
      if (latestValue > 0) return 'caution';
      return 'concern';
    case 'Unemployment Rate':
      if (latestValue < 5) return 'healthy';
      if (latestValue < 7) return 'caution';
      return 'concern';
    default:
      return 'neutral';
  }
}

export const SENTIMENT_BORDER: Record<IndicatorSentiment, string> = {
  healthy: '#22c55e',  // green-500
  caution: '#f59e0b',  // amber-500
  concern: '#ef4444',  // red-500
  neutral: 'transparent',
};

// Glassmorphism background per sentiment — translucent tint with glow
export const SENTIMENT_BG: Record<IndicatorSentiment, string> = {
  healthy: 'rgba(34,197,94,0.05)',
  caution: 'rgba(245,158,11,0.035)',  // amber is perceptually brighter, use lower opacity
  concern: 'rgba(239,68,68,0.04)',
  neutral: 'transparent',
};

// Inner glow gradient for glass left edge
export const SENTIMENT_GLOW: Record<IndicatorSentiment, string> = {
  healthy: 'linear-gradient(90deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.03) 35%, transparent 100%)',
  caution: 'linear-gradient(90deg, rgba(245,158,11,0.09) 0%, rgba(245,158,11,0.02) 35%, transparent 100%)',
  concern: 'linear-gradient(90deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.025) 35%, transparent 100%)',
  neutral: 'none',
};

// Value text color per sentiment
export const SENTIMENT_VALUE_CLASS: Record<IndicatorSentiment, string> = {
  healthy: 'text-green-600 dark:text-green-400',
  caution: 'text-amber-600 dark:text-amber-400',
  concern: 'text-red-500 dark:text-red-400',
  neutral: 'text-rh-light-text dark:text-rh-text',
};

// Mini sparkline SVG for cards — with area fill for visibility
function Sparkline({ data, color }: { data: { date: string; value: number }[]; color: string }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 90;
  const h = 32;
  const padding = 2;

  const pts = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (w - padding * 2),
    y: h - padding - ((v - min) / range) * (h - padding * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const fillPath = linePath + ` L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function formatValue(value: number | null, unit: string): string {
  if (value == null) return 'N/A';
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'index') return value.toFixed(1);
  if (unit.includes('billion')) {
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}T`;
    return `$${value.toFixed(1)}B`;
  }
  if (unit.includes('trillion')) return `$${value.toFixed(2)}T`;
  if (unit === 'current usd') {
    // World Bank GDP comes in raw USD (e.g. 16815152000000)
    const absVal = Math.abs(value);
    if (absVal >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (absVal >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  }
  return value.toFixed(2);
}

export function formatChange(change: number | null, changePercent: number | null, unit?: string): { text: string; positive: boolean } {
  if (change == null) return { text: '', positive: true };
  const sign = change >= 0 ? '+' : '';
  // For percent-unit indicators (GDP growth, inflation, unemployment), show "pp" instead of percent-of-percent
  if (unit === 'percent') {
    return {
      text: `${sign}${change.toFixed(2)} pp`,
      positive: change >= 0,
    };
  }
  // For current USD (World Bank GDP), show change in trillions/billions
  if (unit === 'current usd') {
    const absChange = Math.abs(change);
    let formatted: string;
    if (absChange >= 1e12) formatted = `${sign}$${(change / 1e12).toFixed(2)}T`;
    else if (absChange >= 1e9) formatted = `${sign}$${(change / 1e9).toFixed(1)}B`;
    else formatted = `${sign}$${(change / 1e6).toFixed(1)}M`;
    const pctText = changePercent != null ? ` (${sign}${changePercent.toFixed(1)}%)` : '';
    return {
      text: `${formatted}${pctText}`,
      positive: change >= 0,
    };
  }
  const pctText = changePercent != null ? ` (${sign}${changePercent.toFixed(1)}%)` : '';
  return {
    text: `${sign}${change.toFixed(2)}${pctText}`,
    positive: change >= 0,
  };
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // Annual data — just a year like "2024"
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  // Monthly/quarterly — "2025-12-01" → "Dec 2025"
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Dynamic "So What?" tooltips — contextual based on actual current values
function getContextualTooltip(indicator: EconomicIndicator): string {
  const { name, latestValue } = indicator;
  if (latestValue == null) return '';
  const v = formatValue(latestValue, indicator.unit);

  switch (name) {
    case 'Consumer Price Index':
      if (indicator.changePercent != null && indicator.changePercent > 3)
        return `CPI at ${v}. Inflation is running hot — expect the Fed to hold or raise rates. This compresses P/E multiples on growth stocks and favors companies with pricing power (consumer staples, energy).`;
      if (indicator.changePercent != null && indicator.changePercent > 2)
        return `CPI at ${v}. Inflation is near the Fed's 2% target. This is the sweet spot — the Fed can hold steady, which lets the market price in earnings growth without rate headwinds.`;
      return `CPI at ${v}. Below-target inflation gives the Fed room to cut rates. Rate-sensitive sectors (tech, REITs) tend to rally on rate-cut expectations.`;

    case 'Federal Funds Rate':
      if (latestValue > 4)
        return `Fed Funds at ${v}. Higher rates generally compress P/E ratios, especially on growth stocks. Companies with strong cash positions and pricing power tend to outperform in this environment.`;
      if (latestValue > 2)
        return `Fed Funds at ${v}. A neutral-ish stance — the Fed is balancing growth and inflation. Rate-sensitive sectors (REITs, utilities) may see relief when cuts begin.`;
      return `Fed Funds at ${v}. Low rates benefit leveraged companies and growth names by reducing borrowing costs. Dividend stocks become less attractive vs. bond alternatives.`;

    case '10-Year Treasury Yield':
      if (latestValue > 4.5)
        return `10Y yield at ${v}. At this level, bonds compete directly with stock dividends for investor capital. Growth stocks with distant earnings are hit hardest as future cash flows get discounted more heavily.`;
      if (latestValue > 3)
        return `10Y yield at ${v}. A moderate yield environment — value stocks and dividend payers remain competitive. Watch for movement above 4.5% as a potential trigger for equity rotation.`;
      return `10Y yield at ${v}. Low yields push investors toward stocks for returns, creating a tailwind for equity valuations and making dividend stocks more attractive.`;

    case 'Unemployment Rate':
      if (latestValue < 4)
        return `Unemployment at ${v}. A tight labor market supports consumer spending and retail earnings, but watch for wage-driven inflation that keeps the Fed hawkish — bad for rate-sensitive holdings.`;
      if (latestValue < 6)
        return `Unemployment at ${v}. Moderate conditions — consumer discretionary names can do well here. If this starts rising quickly, defensive sectors (healthcare, utilities) tend to outperform.`;
      return `Unemployment at ${v}. Elevated unemployment signals weakening demand. The Fed typically responds with rate cuts — but earnings downgrades may offset the rate tailwind.`;

    case 'Real GDP':
      if (indicator.change != null && indicator.change > 0)
        return `Real GDP at ${v}. Economic output is growing, which supports corporate revenue and typically correlates with positive equity returns.`;
      return `Real GDP at ${v}. Slowing output may signal a cooling economy — watch for impacts on corporate earnings.`;

    case 'GDP Growth':
      if (latestValue > 2)
        return `GDP expanding at ${v}. Healthy growth signals strong corporate revenue environment and consumer confidence — generally bullish for equities.`;
      if (latestValue > 0)
        return `GDP at ${v}. Sluggish growth may indicate economic headwinds ahead. Corporate earnings growth could slow.`;
      return `GDP contracting at ${v}. Negative growth signals recession risk, historically associated with market drawdowns and risk-off sentiment.`;

    case 'Inflation Rate':
      if (latestValue > 4)
        return `Inflation at ${v}. Well above the central bank target — real returns are being eroded, and tighter monetary policy is likely, pressuring risk assets.`;
      if (latestValue > 2.5)
        return `Inflation at ${v}. Slightly elevated but manageable. Central banks may hold steady, which markets can digest.`;
      return `Inflation at ${v}. Near or below target — this creates room for monetary easing, which tends to support equity and bond markets.`;

    case 'GDP':
      return `GDP at ${v}. Total economic output in current USD — useful for comparing the relative scale of economies across regions.`;

    default:
      return '';
  }
}

export function IndicatorCard({ indicator, isSelected, onClick }: { indicator: EconomicIndicator; isSelected: boolean; onClick: () => void }) {
  const { text: changeText, positive } = formatChange(indicator.change, indicator.changePercent, indicator.unit);
  const sentiment = getIndicatorSentiment(indicator);
  const accentColor = SENTIMENT_BORDER[sentiment];
  const bgColor = SENTIMENT_BG[sentiment];
  const glowBg = SENTIMENT_GLOW[sentiment];
  const valueClass = SENTIMENT_VALUE_CLASS[sentiment];
  const tooltip = getContextualTooltip(indicator);

  // Sparkline color follows sentiment when available, otherwise trend direction
  const sparkColor = sentiment === 'concern' ? '#ef4444'
    : sentiment === 'caution' ? '#f59e0b'
    : sentiment === 'healthy' ? '#22c55e'
    : positive ? '#00c805' : '#ff5252';

  // Derive recent trend from last 3 data points (if available)
  const history = indicator.history;
  const recentTrend = history.length >= 3
    ? history[history.length - 1].value - history[history.length - 3].value
    : null;
  const trendArrow = recentTrend != null
    ? recentTrend > 0 ? '\u2197' : recentTrend < 0 ? '\u2198' : '\u2192'
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg p-4 transition-all cursor-pointer relative overflow-hidden
        border backdrop-blur-sm
        ${isSelected
          ? 'border-rh-green ring-1 ring-rh-green/30'
          : 'border-gray-200/40 dark:border-white/[0.06] hover:border-gray-300/50 dark:hover:border-white/[0.12]'
        }`}
      style={{
        borderLeftWidth: sentiment !== 'neutral' ? '2px' : undefined,
        borderLeftColor: sentiment !== 'neutral' ? accentColor : undefined,
        backgroundColor: bgColor,
        boxShadow: sentiment !== 'neutral' ? `inset 2px 0 12px -4px ${accentColor}44` : undefined,
      }}
    >
      {/* Glass inner glow from left edge */}
      {sentiment !== 'neutral' && (
        <div className="absolute inset-0 pointer-events-none rounded-lg" style={{ background: glowBg }} />
      )}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-rh-light-muted dark:text-rh-muted uppercase tracking-wide truncate">
              {indicator.name}
            </h4>
            {tooltip && (
              <span className="group relative flex-shrink-0">
                <svg className="w-3 h-3 text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-100/80 dark:bg-white/[0.08] backdrop-blur-md border border-gray-200/50 dark:border-white/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-rh-light-text dark:text-rh-text shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                  {tooltip}
                </span>
              </span>
            )}
          </div>
          <div className={`text-xl font-semibold mt-1 ${valueClass}`}>
            {formatValue(indicator.latestValue, indicator.unit)}
          </div>
        </div>
        <Sparkline data={indicator.history} color={sparkColor} />
      </div>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {changeText && (
            <span className={`text-xs font-medium ${positive ? 'text-rh-green' : 'text-rh-red'}`}>
              {changeText}
            </span>
          )}
          {trendArrow && (
            <span className={`text-xs ${
              sentiment === 'concern' ? 'text-red-400'
              : sentiment === 'caution' ? 'text-amber-400'
              : sentiment === 'healthy' ? 'text-green-400'
              : 'text-rh-light-muted/40 dark:text-rh-muted/40'
            }`}>
              {trendArrow}
            </span>
          )}
        </div>
        {indicator.latestDate && (
          <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
            {formatDate(indicator.latestDate)}
          </span>
        )}
      </div>
    </button>
  );
}
