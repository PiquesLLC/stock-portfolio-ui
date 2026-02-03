import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ─── Types ──────────────────────────────────────────────────────────────────

interface StockCandles {
  closes: number[];
  dates: string[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
}

interface MetricResult {
  value: string;
  context: string;
  percentile?: number;
  level: 'low' | 'elevated' | 'high';
  detail?: string; // tooltip extra
  explanation?: string; // one-sentence "why is this LOW/ELEVATED/HIGH"
}

interface WarningPanelProps {
  candles: StockCandles | null;
  currentPrice: number;
}

// ─── Pure Math Utilities ────────────────────────────────────────────────────

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    r.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return r;
}

function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function percentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 50;
  let below = 0;
  for (const v of history) if (v < value) below++;
  return (below / history.length) * 100;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─── Metric Computations ────────────────────────────────────────────────────

function computeCorrectionClocks(closes: number[], _dates: string[]): MetricResult | null {
  if (closes.length < 365) return null;
  try {
    const thresholds = [0.10, 0.20, 0.30];
    const today = closes.length - 1;
    const years = (closes.length / 252).toFixed(1);

    // ── Pass 1: Walk forward, track completed corrections ──
    // A completed correction at threshold T means:
    //   drawdown from running peak crossed T%, then price made a new high.
    // We record the index of the new high (= resolution date).
    const completedDates: number[][] = [[], [], []];
    let peak = closes[0];
    const inCorrection = [false, false, false];

    for (let i = 0; i < closes.length; i++) {
      if (closes[i] >= peak) {
        peak = closes[i];
        for (let t = 0; t < 3; t++) {
          if (inCorrection[t]) {
            completedDates[t].push(i);
            inCorrection[t] = false;
          }
        }
      }
      const dd = (peak - closes[i]) / peak;
      for (let t = 0; t < 3; t++) {
        if (dd >= thresholds[t] && !inCorrection[t]) {
          inCorrection[t] = true;
        }
      }
    }

    // ── Pass 2: Determine current state from the LAST peak ──
    // Find the most recent all-time-or-local high (the running peak at end of pass 1 IS the ATH-like peak).
    // But we need the last peak index — scan backward for it.
    let lastPeakIdx = today;
    for (let i = today; i >= 0; i--) {
      if (closes[i] >= peak) { lastPeakIdx = i; break; }
    }

    const currentPrice = closes[today];
    const currentDD = (peak - currentPrice) / peak; // drawdown from peak as positive fraction

    // Which thresholds does the CURRENT drawdown exceed?
    let highestActiveThreshold = -1;
    for (let t = 2; t >= 0; t--) {
      if (currentDD >= thresholds[t]) { highestActiveThreshold = t; break; }
    }

    // For "days since correction began": find the first day after the last peak
    // where drawdown crossed the active threshold.
    let correctionStartDay = 0;
    if (highestActiveThreshold >= 0) {
      let runPeak = closes[lastPeakIdx];
      for (let i = lastPeakIdx + 1; i <= today; i++) {
        if (closes[i] >= runPeak) runPeak = closes[i]; // minor new highs within the drawdown path
        const dd = (runPeak - closes[i]) / runPeak;
        if (dd >= thresholds[highestActiveThreshold]) {
          correctionStartDay = i;
          break;
        }
      }
    }

    // Median spacing for completed 10% corrections
    let medianSpacing10 = '—';
    if (completedDates[0].length >= 2) {
      const spacings: number[] = [];
      for (let i = 1; i < completedDates[0].length; i++) {
        spacings.push(completedDates[0][i] - completedDates[0][i - 1]);
      }
      spacings.sort((a, b) => a - b);
      medianSpacing10 = `${spacings[Math.floor(spacings.length / 2)]}d median`;
    }

    // ── Build display ──
    if (highestActiveThreshold >= 0) {
      const pct = Math.round(thresholds[highestActiveThreshold] * 100);
      const daysSinceStart = today - correctionStartDay;
      const ddPct = (currentDD * 100).toFixed(1);
      const daysSincePeak = today - lastPeakIdx;

      const level: MetricResult['level'] = highestActiveThreshold >= 1 ? 'high' : 'elevated';
      const explanation = `Currently −${ddPct}% from peak (${daysSincePeak}d ago). ${pct}% threshold first crossed ${daysSinceStart}d ago.`;

      return {
        value: `${pct}% IN PROGRESS`,
        context: `−${ddPct}% from peak · ${daysSinceStart}d since correction began`,
        level,
        explanation,
        detail: `Correction = peak-to-trough decline ≥ ${pct}%. Currently in progress — no new high since peak. Based on ${years} years of data. Descriptive only — not predictive.`,
      };
    }

    // No active correction (current DD < 10%)
    // Show current drawdown + last completed 10% correction info
    const ddPct = (currentDD * 100).toFixed(1);
    const daysSincePeak = today - lastPeakIdx;

    const lastCompleted10 = completedDates[0].length > 0 ? completedDates[0][completedDates[0].length - 1] : null;
    const ds10 = lastCompleted10 !== null ? today - lastCompleted10 : 9999;

    // Show count of completed corrections at each threshold
    const counts = thresholds.map((t, i) => `${completedDates[i].length}×${Math.round(t * 100)}%`);

    const level: MetricResult['level'] = ds10 > 500 ? 'elevated' : 'low';

    const peakNote = daysSincePeak === 0 ? 'At peak' : `−${ddPct}% from peak (${daysSincePeak}d ago)`;
    const resolved10Note = ds10 < 9999 ? `Last 10%+ correction resolved ${ds10}d ago` : 'No 10%+ correction detected';
    const explanation = `${peakNote}. ${resolved10Note}. Historical: ${counts.join(', ')} corrections in ${years}yr.`;

    return {
      value: daysSincePeak === 0 ? 'At Peak' : `−${ddPct}%`,
      context: ds10 < 9999 ? `${resolved10Note} · ${medianSpacing10}` : `No correction on record · ${years}yr data`,
      level,
      explanation,
      detail: `Correction = peak-to-trough decline ≥ threshold. Completed = new high made after the drawdown. If currently in a drawdown < 10%, the current distance from peak is shown. Based on ${years} years of data. Descriptive only — not predictive.`,
    };
  } catch { return null; }
}

function computeTrendDistance(closes: number[]): MetricResult | null {
  if (closes.length < 400) return null;
  try {
    const current = closes[closes.length - 1];
    const ma200 = movingAverage(closes, 200)!;
    const ma400 = movingAverage(closes, 400)!;
    const distMA200 = ((current - ma200) / ma200) * 100;
    const distMA400 = ((current - ma400) / ma400) * 100;

    // Historical percentile for MA200 distance
    const historical: number[] = [];
    for (let i = 200; i < closes.length; i++) {
      let s = 0;
      for (let j = i - 200; j < i; j++) s += closes[j];
      const h = s / 200;
      historical.push(((closes[i] - h) / h) * 100);
    }
    const pctl = percentileRank(distMA200, historical);

    const sign200 = distMA200 >= 0 ? '+' : '';
    const sign400 = distMA400 >= 0 ? '+' : '';

    const level: MetricResult['level'] = pctl > 85 ? 'high' : pctl > 65 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? 'Price within typical range of long-term trend.'
      : level === 'elevated'
        ? `Price ${sign200}${distMA200.toFixed(1)}% from MA200 — more extended than ${pctl.toFixed(0)}% of historical readings.`
        : `Price significantly extended above long-term trend at ${pctl.toFixed(0)}th percentile.`;

    return {
      value: `${sign200}${distMA200.toFixed(1)}%`,
      context: `vs MA200 (${pctl.toFixed(0)}th pctl) · ${sign400}${distMA400.toFixed(1)}% vs MA400`,
      percentile: pctl,
      level,
      explanation,
      detail: `Current price vs 200-day and 400-day moving averages. Percentile based on ${(closes.length / 252).toFixed(1)} years. Higher = more extended. Not financial advice.`,
    };
  } catch { return null; }
}

function computeTrendBreak(closes: number[]): MetricResult | null {
  if (closes.length < 200) return null;
  try {
    const current = closes[closes.length - 1];
    const ma50 = movingAverage(closes, 50)!;
    const ma100 = movingAverage(closes, 100)!;
    const ma200 = movingAverage(closes, 200)!;

    const belowMA50 = current < ma50;
    const belowMA100 = current < ma100;
    const belowMA200 = current < ma200;

    // Days below MA200
    let daysBelow200 = 0;
    for (let i = closes.length - 1; i >= 200; i--) {
      let s = 0;
      for (let j = i - 200; j < i; j++) s += closes[j];
      if (closes[i] < s / 200) daysBelow200++;
      else break;
    }

    // Death cross watch
    const ma50toMA200 = ((ma50 - ma200) / ma200) * 100;
    const deathCrossActive = ma50 < ma200;

    let value = '';
    let context = '';
    let level: MetricResult['level'] = 'low';

    if (deathCrossActive) {
      value = 'Death Cross Active';
      context = `MA50 ${ma50toMA200.toFixed(1)}% below MA200`;
      level = 'high';
    } else if (belowMA200) {
      value = `Below MA200 (${daysBelow200}d)`;
      context = `Death cross watch: MA50 ${ma50toMA200 >= 0 ? '+' : ''}${ma50toMA200.toFixed(1)}% vs MA200`;
      level = 'high';
    } else if (belowMA100) {
      value = 'Below MA100';
      context = `Above MA200 · MA50 ${ma50toMA200 >= 0 ? '+' : ''}${ma50toMA200.toFixed(1)}% vs MA200`;
      level = 'elevated';
    } else if (belowMA50) {
      value = 'Below MA50';
      context = 'Above MA100 & MA200';
      level = 'elevated';
    } else if (ma50toMA200 < 2) {
      value = 'Death Cross Watch';
      context = `MA50 only +${ma50toMA200.toFixed(1)}% above MA200`;
      level = 'elevated';
    } else {
      value = 'Healthy Uptrend';
      context = `Above all major MAs · MA50 +${ma50toMA200.toFixed(1)}% vs MA200`;
      level = 'low';
    }

    const explanation = level === 'low'
      ? 'Price above MA50, MA100, and MA200. No recent downside breaks.'
      : level === 'elevated'
        ? `Price has broken below a key moving average. Trend structure weakening.`
        : deathCrossActive ? 'MA50 has crossed below MA200 — a historically bearish trend signal.' : `Price trading below MA200 for ${daysBelow200} consecutive days.`;

    return { value, context, level, explanation, detail: 'Price position relative to 50/100/200-day moving averages. Death cross = MA50 crosses below MA200. Not financial advice.' };
  } catch { return null; }
}

function computeVolatility(closes: number[]): MetricResult | null {
  if (closes.length < 200) return null;
  try {
    const ret20 = dailyReturns(closes.slice(-21));
    const vol20 = stdDev(ret20) * Math.sqrt(252) * 100;

    // Historical percentile
    const allRets = dailyReturns(closes);
    const historicalVols: number[] = [];
    for (let i = 20; i < allRets.length; i++) {
      historicalVols.push(stdDev(allRets.slice(i - 20, i)) * Math.sqrt(252) * 100);
    }
    const pctl = percentileRank(vol20, historicalVols);

    const level: MetricResult['level'] = pctl > 80 ? 'high' : pctl > 60 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? `Recent price swings are within normal historical range.`
      : `Daily price swings at ${vol20.toFixed(1)}% annualized — higher than ${pctl.toFixed(0)}% of historical periods.`;

    return {
      value: `${vol20.toFixed(1)}%`,
      context: `20D annualized (${pctl.toFixed(0)}th percentile)`,
      percentile: pctl,
      level,
      explanation,
      detail: `20-day realized volatility, annualized (×√252). Percentile vs ${(closes.length / 252).toFixed(1)} years of history. Not financial advice.`,
    };
  } catch { return null; }
}

function computeCrashCluster(closes: number[]): MetricResult | null {
  if (closes.length < 200) return null;
  try {
    const ret30 = dailyReturns(closes.slice(-31));
    const crashDays = ret30.filter(r => r <= -0.02).length;

    const allRets = dailyReturns(closes);
    const historicalCounts: number[] = [];
    for (let i = 30; i < allRets.length; i++) {
      historicalCounts.push(allRets.slice(i - 30, i).filter(r => r <= -0.02).length);
    }
    const pctl = percentileRank(crashDays, historicalCounts);

    const level: MetricResult['level'] = pctl > 80 ? 'high' : pctl > 60 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? `${crashDays} day${crashDays !== 1 ? 's' : ''} ≤ −2% in last 30 — historically moderate.`
      : `${crashDays} large down days in 30 sessions — more frequent than ${pctl.toFixed(0)}% of historical windows.`;

    return {
      value: `${crashDays}`,
      context: `days ≤ −2% in last 30 (${pctl.toFixed(0)}th pctl)`,
      percentile: pctl,
      level,
      explanation,
      detail: `Count of trading days with ≥2% decline in the last 30 sessions. Percentile vs rolling 30-day windows over full history. Not financial advice.`,
    };
  } catch { return null; }
}

function computeDrawdownPressure(closes: number[]): MetricResult | null {
  if (closes.length < 252) return null;
  try {
    const last252 = closes.slice(-252);
    const high52w = Math.max(...last252);
    const current = closes[closes.length - 1];
    const currentDD = ((current - high52w) / high52w) * 100;

    // Worst drawdown in last 12M
    let peak = last252[0];
    let worstDD = 0;
    for (const c of last252) {
      if (c > peak) peak = c;
      const dd = (peak - c) / peak;
      if (dd > worstDD) worstDD = dd;
    }

    const absDD = Math.abs(currentDD);
    const level: MetricResult['level'] = absDD > 20 ? 'high' : absDD > 10 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? `Price within ${absDD.toFixed(1)}% of 52-week high — minimal drawdown.`
      : `${absDD.toFixed(1)}% decline from 52-week high. Worst 12M drop was ${(worstDD * 100).toFixed(1)}%.`;

    return {
      value: `${currentDD.toFixed(1)}%`,
      context: `from 52w high · worst 12M: −${(worstDD * 100).toFixed(1)}%`,
      level,
      explanation,
      detail: `Current decline from 52-week high, and the maximum peak-to-trough drop in the last 12 months. Not financial advice.`,
    };
  } catch { return null; }
}

function computeGapRisk(closes: number[], opens: number[]): MetricResult | null {
  if (closes.length < 200 || opens.length < 200) return null;
  // Check opens are valid (not all zero)
  const recentOpens = opens.slice(-21);
  if (recentOpens.some(o => o === 0 || o == null)) return null;
  try {
    const recentCloses = closes.slice(-21);
    const gaps: number[] = [];
    for (let i = 0; i < 20; i++) {
      gaps.push(Math.abs((recentOpens[i + 1] - recentCloses[i]) / recentCloses[i]));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    // Historical percentile of 20D avg absolute gap
    const historicalAvgs: number[] = [];
    for (let i = 21; i < closes.length; i++) {
      const g: number[] = [];
      for (let j = i - 20; j < i; j++) {
        if (opens[j + 1] && closes[j]) {
          g.push(Math.abs((opens[j + 1] - closes[j]) / closes[j]));
        }
      }
      if (g.length === 20) historicalAvgs.push(g.reduce((a, b) => a + b, 0) / g.length);
    }
    const pctl = percentileRank(avgGap, historicalAvgs);

    const level: MetricResult['level'] = pctl > 80 ? 'high' : pctl > 60 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? 'Overnight gaps between sessions are within normal range.'
      : `Average overnight gap at ${pctl.toFixed(0)}th percentile — larger than typical.`;

    return {
      value: `${(avgGap * 100).toFixed(2)}%`,
      context: `20D avg gap (${pctl.toFixed(0)}th pctl)`,
      percentile: pctl,
      level,
      explanation,
      detail: `Average absolute overnight gap (open vs prior close) over 20 sessions. Larger gaps = more overnight risk. Not financial advice.`,
    };
  } catch { return null; }
}

function computeDistributionDays(closes: number[], volumes: number[]): MetricResult | null {
  if (closes.length < 200 || volumes.length < 200) return null;
  const recentVols = volumes.slice(-21);
  if (recentVols.some(v => v === 0 || v == null)) return null;
  try {
    const recentCloses = closes.slice(-21);
    const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    let distDays = 0;
    for (let i = 1; i < 21; i++) {
      if (recentCloses[i] < recentCloses[i - 1] && recentVols[i] > avgVol) {
        distDays++;
      }
    }

    const level: MetricResult['level'] = distDays >= 6 ? 'high' : distDays >= 4 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? `${distDays} distribution day${distDays !== 1 ? 's' : ''} — low institutional selling pressure.`
      : `${distDays} high-volume down days in 20 sessions. Clusters have historically preceded increased volatility.`;

    return {
      value: `${distDays}`,
      context: 'down + high-volume days in last 20',
      level,
      explanation,
      detail: `Distribution day = price decline on above-average volume. Clusters of distribution days have historically preceded increased volatility. This is contextual, not predictive. Not financial advice.`,
    };
  } catch { return null; }
}

function computeEuphoriaMeter(closes: number[], volPctl: number | undefined, trendPctl: number | undefined): MetricResult | null {
  if (closes.length < 200) return null;
  try {
    const rsi = calculateRSI(closes);
    if (rsi === null) return null;

    // Normalize RSI to 0-100 scale (already is)
    const rsiComponent = rsi;
    const overextComponent = trendPctl ?? 50;
    const volComponent = volPctl ?? 50;

    // Weighted: RSI 40%, overextension 35%, vol 25%
    const score = rsiComponent * 0.40 + overextComponent * 0.35 + volComponent * 0.25;

    const level: MetricResult['level'] = score > 75 ? 'high' : score > 55 ? 'elevated' : 'low';
    const explanation = level === 'low'
      ? 'Momentum, trend extension, and volatility are within calm ranges.'
      : level === 'elevated'
        ? `Composite reads ${score.toFixed(0)}/100 — above-average momentum and extension.`
        : `RSI at ${rsi.toFixed(0)}, trend at ${overextComponent.toFixed(0)}th percentile — historically stretched.`;

    return {
      value: `${score.toFixed(0)}`,
      context: `RSI ${rsi.toFixed(0)} · trend ${overextComponent.toFixed(0)}p · vol ${volComponent.toFixed(0)}p`,
      percentile: score,
      level,
      explanation,
      detail: `Composite heat score: 40% RSI(14), 35% trend overextension percentile, 25% volatility percentile. Descriptive only — not predictive. Not financial advice.`,
    };
  } catch { return null; }
}

function computeRiskTemperature(metrics: {
  volPctl?: number;
  trendPctl?: number;
  euphoria?: number;
  crashPctl?: number;
  ddPct?: number;
  trendLevel?: MetricResult['level'];
}): MetricResult | null {
  try {
    const {
      volPctl = 50, trendPctl = 50, euphoria = 50,
      crashPctl = 50, ddPct = 0, trendLevel = 'low',
    } = metrics;

    const trendBreakScore = trendLevel === 'high' ? 85 : trendLevel === 'elevated' ? 60 : 30;
    const ddScore = Math.abs(ddPct) > 20 ? 80 : Math.abs(ddPct) > 10 ? 60 : 30;

    const score =
      volPctl * 0.20 +
      trendPctl * 0.15 +
      euphoria * 0.20 +
      crashPctl * 0.15 +
      trendBreakScore * 0.15 +
      ddScore * 0.15;

    let label = 'Low';
    let level: MetricResult['level'] = 'low';
    if (score > 70) { label = 'High'; level = 'high'; }
    else if (score > 45) { label = 'Elevated'; level = 'elevated'; }

    const explanation = level === 'low'
      ? 'Most risk metrics are within normal historical ranges.'
      : level === 'elevated'
        ? 'Several risk metrics are above their historical averages.'
        : 'Multiple risk metrics are at historically elevated levels.';

    return {
      value: `${score.toFixed(0)}`,
      context: label,
      percentile: score,
      explanation,
      level,
      detail: `Composite risk context score (0–100) from volatility, trend, euphoria, crash clustering, and drawdown metrics. Descriptive — not a prediction. Not financial advice.`,
    };
  } catch { return null; }
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const LEVEL_COLORS = {
  low: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'hover:shadow-emerald-500/5' },
  elevated: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'hover:shadow-amber-500/5' },
  high: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', glow: 'hover:shadow-red-500/5' },
};

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tipW = 240;
    // Prefer right side; fall back to left if it would overflow viewport
    let left = rect.right + 8;
    if (left + tipW > window.innerWidth - 8) {
      left = rect.left - tipW - 8;
    }
    if (left < 8) left = 8;
    const top = rect.top + rect.height / 2;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (show) updatePos();
  }, [show, updatePos]);

  return (
    <div
      className="inline-flex"
      ref={ref}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && pos && createPortal(
        <div
          className="fixed z-[9999] px-3 py-2 rounded-lg text-[11px] leading-relaxed text-white/80 pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translateY(-50%)',
            maxWidth: Math.min(300, window.innerWidth * 0.9 - 16),
            width: 260,
            wordBreak: 'break-word' as const,
            whiteSpace: 'normal' as const,
            background: 'rgba(10, 10, 15, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </div>
  );
}

function RiskChip({ label, value, level, tooltip }: { label: string; value: string; level: MetricResult['level']; tooltip?: string }) {
  const c = LEVEL_COLORS[level];
  const chip = (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${c.border} ${c.bg} text-sm cursor-default`}>
      <span className="text-white/50 font-medium">{label}</span>
      <span className={`font-bold ${c.text}`}>{value}</span>
    </div>
  );
  if (tooltip) return <Tooltip text={tooltip}>{chip}</Tooltip>;
  return chip;
}

const ICONS: Record<string, string> = {
  temperature: '🌡️',
  correction: '⏰',
  trend: '📊',
  trendBreak: '⚠️',
  volatility: '📈',
  crash: '💥',
  drawdown: '📉',
  gap: '🌙',
  distribution: '📦',
  euphoria: '🎢',
};

function WarningCard({ id, title, metric }: { id: string; title: string; metric: MetricResult }) {
  const c = LEVEL_COLORS[metric.level];
  const isTemp = id === 'temperature';
  const tempScore = isTemp ? parseFloat(metric.value) : 0;
  return (
    <div
      className={`${c.bg} rounded-xl border ${c.border} p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${c.glow}`}
      title={metric.detail || ''}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl">{ICONS[id] || '📊'}</span>
        <div className={`text-[10px] font-semibold uppercase tracking-wider ${c.text} opacity-80`}>
          {metric.level}
        </div>
      </div>
      <h3 className="text-xs font-medium text-white/50 mb-1">{title}</h3>
      <div className={`text-xl font-bold ${c.text} mb-0.5 leading-tight break-words`} style={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
        {isTemp ? `${metric.value} / 100` : metric.value}
      </div>
      {/* Gradient bar for Risk Temperature */}
      {isTemp && (
        <div className="relative h-1.5 rounded-full bg-white/[0.06] mt-1.5 mb-1.5 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, tempScore))}%`,
              background: tempScore > 70 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : tempScore > 45 ? 'linear-gradient(90deg, #22c55e, #f59e0b)' : 'linear-gradient(90deg, #22c55e, #22c55e)',
            }}
          />
        </div>
      )}
      <p className="text-[11px] text-white/40 leading-snug break-words">{metric.context}</p>
      {/* Explanation — always visible, replaces hover tooltip */}
      {metric.explanation && (
        <p className="text-[10px] text-white/30 mt-1.5 leading-snug italic break-words" style={{ wordBreak: 'break-word' }}>{metric.explanation}</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function WarningPanel({ candles }: WarningPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Gate: need at least 200 days of data
  const hasData = candles && candles.closes.length >= 200;

  const correctionClocks = useMemo(() => {
    if (!hasData) return null;
    return computeCorrectionClocks(candles.closes, candles.dates);
  }, [candles, hasData]);

  const trendDistance = useMemo(() => {
    if (!hasData) return null;
    return computeTrendDistance(candles.closes);
  }, [candles, hasData]);

  const trendBreak = useMemo(() => {
    if (!hasData) return null;
    return computeTrendBreak(candles.closes);
  }, [candles, hasData]);

  const volatility = useMemo(() => {
    if (!hasData) return null;
    return computeVolatility(candles.closes);
  }, [candles, hasData]);

  const crashCluster = useMemo(() => {
    if (!hasData) return null;
    return computeCrashCluster(candles.closes);
  }, [candles, hasData]);

  const drawdownPressure = useMemo(() => {
    if (!hasData) return null;
    return computeDrawdownPressure(candles.closes);
  }, [candles, hasData]);

  const gapRisk = useMemo(() => {
    if (!hasData) return null;
    return computeGapRisk(candles.closes, candles.opens);
  }, [candles, hasData]);

  const distributionDays = useMemo(() => {
    if (!hasData) return null;
    return computeDistributionDays(candles.closes, candles.volumes);
  }, [candles, hasData]);

  const euphoriaMeter = useMemo(() => {
    if (!hasData) return null;
    return computeEuphoriaMeter(candles.closes, volatility?.percentile, trendDistance?.percentile);
  }, [candles, hasData, volatility?.percentile, trendDistance?.percentile]);

  const riskTemperature = useMemo(() => {
    if (!hasData) return null;
    const ddVal = drawdownPressure ? parseFloat(drawdownPressure.value) : 0;
    return computeRiskTemperature({
      volPctl: volatility?.percentile,
      trendPctl: trendDistance?.percentile,
      euphoria: euphoriaMeter?.percentile,
      crashPctl: crashCluster?.percentile,
      ddPct: ddVal,
      trendLevel: trendBreak?.level,
    });
  }, [hasData, volatility, trendDistance, euphoriaMeter, crashCluster, drawdownPressure, trendBreak]);

  if (!hasData) return null;

  // Collect all available cards
  const cards: { id: string; title: string; metric: MetricResult }[] = [];
  if (riskTemperature) cards.push({ id: 'temperature', title: 'Risk Temperature', metric: riskTemperature });
  if (trendDistance) cards.push({ id: 'trend', title: 'Distance to Trend', metric: trendDistance });
  if (trendBreak) cards.push({ id: 'trendBreak', title: 'Trend Break', metric: trendBreak });
  if (volatility) cards.push({ id: 'volatility', title: 'Realized Volatility', metric: volatility });
  if (euphoriaMeter) cards.push({ id: 'euphoria', title: 'Euphoria Meter', metric: euphoriaMeter });
  if (crashCluster) cards.push({ id: 'crash', title: 'Crash Cluster Risk', metric: crashCluster });
  if (drawdownPressure) cards.push({ id: 'drawdown', title: 'Drawdown Pressure', metric: drawdownPressure });
  if (correctionClocks) cards.push({ id: 'correction', title: 'Correction Clocks', metric: correctionClocks });
  if (gapRisk) cards.push({ id: 'gap', title: 'Overnight Gap Risk', metric: gapRisk });
  if (distributionDays) cards.push({ id: 'distribution', title: 'Distribution Days', metric: distributionDays });

  if (cards.length === 0) return null;

  const tempColor = riskTemperature ? LEVEL_COLORS[riskTemperature.level] : LEVEL_COLORS.low;

  // Dynamic header based on risk state
  const elevatedCount = cards.filter(c => c.metric.level === 'elevated').length;
  const highCount = cards.filter(c => c.metric.level === 'high').length;
  let headerIcon = '📊';
  let headerLabel = 'RISK DASHBOARD';
  if (highCount >= 2 || (highCount >= 1 && elevatedCount >= 2)) {
    headerIcon = '🔥';
    headerLabel = 'HIGH RISK CONTEXT';
  } else if (elevatedCount >= 1 || highCount >= 1) {
    headerIcon = '⚠️';
    headerLabel = 'ELEVATED RISK CONTEXT';
  }

  return (
    <div className="mb-6">
      <style>{`
        @keyframes fadeInRight { from { opacity: 0; transform: translateY(-50%) translateX(-4px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between group mb-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{headerIcon}</span>
          <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
            {headerLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && riskTemperature && (
            <div className={`px-2 py-0.5 rounded text-xs font-bold ${tempColor.text} ${tempColor.bg} border ${tempColor.border}`}>
              {riskTemperature.context} · {riskTemperature.value}/100
            </div>
          )}
          <svg
            className={`w-4 h-4 text-white/40 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsed: chips */}
      {!expanded && (
        <div className="flex flex-wrap gap-2 mb-2">
          {trendDistance && <RiskChip label="Trend" value={trendDistance.value} level={trendDistance.level} tooltip={trendDistance.explanation} />}
          {euphoriaMeter && <RiskChip label="Euphoria" value={`${euphoriaMeter.value}/100`} level={euphoriaMeter.level} tooltip={euphoriaMeter.explanation} />}
          {volatility && <RiskChip label="Vol" value={volatility.value} level={volatility.level} tooltip={volatility.explanation} />}
          {drawdownPressure && <RiskChip label="DD" value={drawdownPressure.value} level={drawdownPressure.level} tooltip={drawdownPressure.explanation} />}
        </div>
      )}

      {/* Expanded: card grid */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {cards.map(card => (
            <WarningCard key={card.id} id={card.id} title={card.title} metric={card.metric} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-white/20 leading-relaxed">
        Historical risk context — not a prediction. Not financial advice.
      </p>
    </div>
  );
}
