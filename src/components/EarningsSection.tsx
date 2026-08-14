import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EarningsResponse, ParsedQuarterlyEarning } from '../types';
import { getEarnings } from '../api';
import { MetricGrid, Metric } from './MetricGrid';
import { ChartLegend } from './ChartLegend';
import {
  CHART_W, CHART_H, CHART_PAD as PAD,
  SERIES_BLUE, SERIES_GREEN, SERIES_RED, SERIES_NEUTRAL,
  GRID_STROKE, ZERO_STROKE, CROSSHAIR_STROKE, TOOLTIP_FILL,
  AXIS_FONT_SIZE, TOOLTIP_FONT_SIZE, AXIS_FONT_FAMILY, AXIS_TEXT_CLASS,
  BAR_REST_OPACITY, BAR_BACKING_CLASS,
} from './chart-style';

/** EPS pairs estimate against reported; Surprise plots the gap on its own. */
type ChartMode = 'eps' | 'surprise';
type RangeToggle = 4 | 8;

/** Sign outside the currency symbol: -$0.42, never $-0.42. */
function formatEPS(v: number | null): string {
  if (v == null) return '-';
  // Axis ticks and summed TTM figures carry float dust; without this a tick at
  // -1e-17 prints as "-$0.00".
  const n = Math.abs(v) < 0.005 ? 0 : v;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
}

function formatSurprise(v: number | null): string {
  if (v == null) return '-';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function formatSurpriseAxis(v: number): string {
  return `${Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)}%`;
}

/**
 * The ISO calendar date at the head of a string, or null if it isn't one.
 * Guards against the bare `"Q2"` the provider can emit in place of a date.
 */
function isoDate(s: string | null | undefined): string | null {
  const head = (s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** Today in the *viewer's* calendar, for comparing against ISO date strings. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "Aug 1" for a published report date, null when the provider left it blank.
 * Shares `isoDate`'s validity rule so display and admission can't disagree —
 * bare `Date.parse` would happily render "2025" as "Jan 1".
 */
function formatReportDate(dateStr: string): string | null {
  const iso = isoDate(dateStr);
  if (iso == null) return null;
  // Pinned to UTC at both ends: local parsing shifts a calendar date by a day.
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth();
  const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
  return `${q} '${String(d.getFullYear()).slice(2)}`;
}

type Verdict = 'beat' | 'met' | 'miss' | null;

/**
 * One verdict per quarter, read the same way by the bars, the surprise column,
 * the Result cell and the streak dots — otherwise a quarter that lands exactly
 * on the estimate paints green in one place and red in another.
 *
 * The API grades `beat` as `surprise > 0`, so an exactly-met estimate arrives
 * as `beat: false`. That is a "Met", not a miss, and it earns no colour.
 */
function getVerdict(q: ParsedQuarterlyEarning): Verdict {
  if (q.surprisePercentage != null) {
    if (q.surprisePercentage > 0) return 'beat';
    if (q.surprisePercentage < 0) return 'miss';
    return 'met';
  }
  if (q.beat == null) return null;
  return q.beat ? 'beat' : 'miss';
}

function verdictColor(verdict: Verdict): string {
  if (verdict === 'beat') return SERIES_GREEN;
  if (verdict === 'miss') return SERIES_RED;
  return SERIES_NEUTRAL;
}

/** Tailwind text colour for the same verdict. */
function verdictTextClass(verdict: Verdict): string {
  if (verdict === 'beat') return 'text-rh-green';
  if (verdict === 'miss') return 'text-rh-red';
  return 'text-rh-light-text dark:text-white';
}

/* ─── Chart ─────────────────────────────────────────────────────────── */

interface ChartBar {
  kind: 'est' | 'actual' | 'surprise';
  value: number;
  color: string;
}

/**
 * Same frame as the Financials chart — shared geometry, gridlines, axis type
 * and tooltip chrome — carrying earnings marks: a translucent estimate bar
 * paired with a reported bar coloured by the verdict.
 *
 * `hoveredIdx` is a *table* index (0 = newest) because the table and the chart
 * highlight each other; the chart runs oldest → newest, so it flips.
 */
function EarningsChart({ quarters, mode, legend, hoveredIdx, setHoveredIdx }: {
  quarters: ParsedQuarterlyEarning[];
  mode: ChartMode;
  legend: { label: string; color: string }[];
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
}) {
  const display = useMemo(() => [...quarters].reverse(), [quarters]);
  const count = display.length;
  // Clamp rather than trust: a touch sets the hover but never clears it, so a
  // range switch can leave an index past the new end. Unclamped, that reads as
  // "some other group is hovered" and dims every bar and row at once.
  const hovered = hoveredIdx != null && hoveredIdx >= 0 && hoveredIdx < count
    ? count - 1 - hoveredIdx
    : null;

  const groups: ChartBar[][] = useMemo(() => display.map(q => {
    const bars: ChartBar[] = [];
    const color = verdictColor(getVerdict(q));
    if (mode === 'eps') {
      if (q.estimatedEPS != null) bars.push({ kind: 'est', value: q.estimatedEPS, color: SERIES_BLUE });
      if (q.reportedEPS != null) bars.push({ kind: 'actual', value: q.reportedEPS, color });
    } else if (q.surprisePercentage != null) {
      bars.push({ kind: 'surprise', value: q.surprisePercentage, color });
    }
    return bars;
  }), [display, mode]);

  const { yMin, yMax } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const bars of groups) {
      for (const b of bars) {
        if (b.value < min) min = b.value;
        if (b.value > max) max = b.value;
      }
    }
    // A floor on the padding keeps a flat series (every quarter within a cent,
    // or a single 0% surprise) off the very top of the plot.
    const padding = Math.max((max - min) * 0.1, mode === 'eps' ? 0.05 : 1);
    return { yMin: min < 0 ? min - padding : 0, yMax: max + padding };
  }, [groups, mode]);

  // The legend lives inside the chart so it can never outlive it — a floating
  // "Above estimate / Below estimate" chip row above empty space is worse than
  // no chart at all.
  if (count === 0 || groups.every(bars => bars.length === 0)) {
    return (
      // Match the chart's aspect rather than a fixed height, so the panel
      // doesn't jump when the empty state comes and goes.
      <div className="aspect-[600/180] flex items-center justify-center text-[10px] text-rh-light-text dark:text-white/80">
        No {mode === 'eps' ? 'EPS' : 'surprise'} data for these quarters
      </div>
    );
  }

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const yRange = yMax - yMin || 1;
  const groupW = plotW / count;
  const barW = Math.min(groupW * 0.7 / (mode === 'eps' ? 2 : 1), 28);
  const zeroY = PAD.top + plotH - ((0 - yMin) / yRange) * plotH;
  const formatValue = mode === 'eps' ? (v: number) => formatEPS(v) : formatSurpriseAxis;

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + ((yMax - yMin) / 4) * i);

  return (
    <>
    <ChartLegend items={legend} />
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Y gridlines + labels */}
      {yTicks.map((v, i) => {
        const y = PAD.top + plotH - ((v - yMin) / yRange) * plotH;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y}
              stroke={GRID_STROKE} strokeWidth={0.5} />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end"
              className={AXIS_TEXT_CLASS} fontSize={AXIS_FONT_SIZE} fontFamily={AXIS_FONT_FAMILY}>
              {formatValue(v)}
            </text>
          </g>
        );
      })}

      {/* Zero line */}
      {yMin < 0 && (
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={zeroY} y2={zeroY}
          stroke={ZERO_STROKE} strokeWidth={0.5} strokeDasharray="3,3" />
      )}

      {/* Bars */}
      {groups.map((bars, gi) => {
        const groupX = PAD.left + gi * groupW + groupW / 2;
        const totalW = bars.length * barW + Math.max(bars.length - 1, 0) * 1;
        const startX = groupX - totalW / 2;
        // The trailing four quarters are the current story; older ones stay
        // readable but recede — the same recency fade the streak dots use.
        const isRecent = gi >= count - 4;
        const resting = isRecent ? BAR_REST_OPACITY : BAR_REST_OPACITY * 0.5;
        const groupOpacity = hovered == null ? resting : hovered === gi ? 1 : 0.22;

        return (
          <g key={gi}>
            {/* Hover zone */}
            <rect x={PAD.left + gi * groupW} y={PAD.top} width={groupW} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(count - 1 - gi)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }}
            />
            {bars.map((b, bi) => {
              const x = startX + bi * (barW + 1);
              const top = PAD.top + plotH - ((Math.max(b.value, 0) - yMin) / yRange) * plotH;
              const bottom = PAD.top + plotH - ((Math.min(b.value, 0) - yMin) / yRange) * plotH;
              const h = Math.max(bottom - top, 1);
              return (
                <g key={bi} style={{ pointerEvents: 'none' }}>
                  {/* Opaque backing — keeps the gridlines from reading through */}
                  <rect x={x} y={top} width={barW} height={h} rx={1.5} className={BAR_BACKING_CLASS} />
                  <rect x={x} y={top} width={barW} height={h} rx={1.5}
                    fill={b.color}
                    // The estimate is what was expected, not what happened — it
                    // sits behind the reported bar rather than competing with it.
                    opacity={groupOpacity * (b.kind === 'est' ? 0.45 : 1)}
                    style={{ transition: 'opacity 0.15s' }} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* X labels */}
      {display.map((q, gi) => (
        <text key={gi} x={PAD.left + gi * groupW + groupW / 2} y={CHART_H - 5} textAnchor="middle"
          className={hovered === gi ? 'fill-gray-600 dark:fill-white/70' : AXIS_TEXT_CLASS}
          fontSize={AXIS_FONT_SIZE} fontFamily={AXIS_FONT_FAMILY}>
          {formatQuarter(q.fiscalDateEnding)}
        </text>
      ))}

      {/* Hover tooltip — driven by the chart or by the table below it */}
      {hovered != null && display[hovered] && (() => {
        const q = display[hovered];
        const gx = PAD.left + hovered * groupW + groupW / 2;
        const color = verdictColor(getVerdict(q));
        const rows: { color: string; text: string }[] = [];
        if (q.estimatedEPS != null) rows.push({ color: SERIES_BLUE, text: `Est ${formatEPS(q.estimatedEPS)}` });
        if (q.reportedEPS != null) rows.push({ color, text: `EPS ${formatEPS(q.reportedEPS)}` });
        if (q.surprisePercentage != null) rows.push({
          color,
          text: `Surprise ${formatSurprise(q.surprisePercentage)}`,
        });
        if (q.reportedEPS == null) rows.push({ color: SERIES_NEUTRAL, text: 'Not yet reported' });

        const tooltipW = 84;
        const tooltipX = gx > CHART_W * 0.72 ? gx - tooltipW - 4 : gx + 8;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={gx} x2={gx} y1={PAD.top} y2={PAD.top + plotH}
              stroke={CROSSHAIR_STROKE} strokeWidth={0.5} />
            <rect x={tooltipX - 4} y={PAD.top + 2} width={tooltipW} height={8 + rows.length * 11}
              rx={3} fill={TOOLTIP_FILL} />
            <text x={tooltipX} y={PAD.top + 10} fontSize={TOOLTIP_FONT_SIZE} fill="rgba(255,255,255,0.5)"
              fontFamily={AXIS_FONT_FAMILY}>{formatQuarter(q.fiscalDateEnding)}</text>
            {rows.map((r, i) => (
              <g key={i}>
                <rect x={tooltipX} y={PAD.top + 14 + i * 11} width={5} height={5} rx={1} fill={r.color} />
                <text x={tooltipX + 8} y={PAD.top + 18.5 + i * 11} fontSize={TOOLTIP_FONT_SIZE} fill="white"
                  fontFamily={AXIS_FONT_FAMILY}>{r.text}</text>
              </g>
            ))}
          </g>
        );
      })()}
    </svg>
    </>
  );
}

/* ─── Collapsed streak ──────────────────────────────────────────────── */

/** Spans, not divs — this renders inside the header <button>. */
function StreakDots({ quarters }: { quarters: ParsedQuarterlyEarning[] }) {
  const display = quarters.slice(0, 8).reverse();
  const total = display.length;
  return (
    <span className="flex items-center gap-1.5">
      {display.map((q, i) => {
        // Rightmost four (the trailing year) read at full strength.
        const isRecent = total - 1 - i < 4;
        const verdict = getVerdict(q);
        return (
          <span
            key={i}
            style={{ opacity: isRecent ? 1 : 0.35 }}
            className={`block w-[5px] h-[5px] rounded-full ${
              verdict === 'beat' ? 'bg-rh-green' :
              verdict === 'miss' ? 'bg-rh-red' :
              'bg-gray-400/40 dark:bg-white/[0.15]'
            }`}
          />
        );
      })}
    </span>
  );
}

/* ─── Table ─────────────────────────────────────────────────────────── */

const TH_CLASS = 'py-2 font-medium text-rh-light-text/70 dark:text-white/80 text-[10px] uppercase tracking-wider';

function EarningsTable({ quarters, hoveredIdx, setHoveredIdx }: {
  quarters: ParsedQuarterlyEarning[];
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
}) {
  return (
    <div className="overflow-x-auto">
      {/* Fixed layout: with auto widths each column sizes to its own content,
          so the gaps between the figures come out irregular. */}
      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
            <th className={`text-left pr-3 w-1/5 ${TH_CLASS}`}>Quarter</th>
            <th className={`text-right px-2 w-1/5 ${TH_CLASS}`}>Est.</th>
            <th className={`text-right px-2 w-1/5 ${TH_CLASS}`}>EPS</th>
            <th className={`text-right px-2 w-1/5 ${TH_CLASS}`}>Surprise</th>
            <th className={`text-right pl-2 w-1/5 ${TH_CLASS}`}>Result</th>
          </tr>
        </thead>
        <tbody>
          {quarters.map((q, i) => {
            const isHovered = hoveredIdx === i;
            const anyHovered = hoveredIdx != null;
            const verdict = getVerdict(q);
            return (
              <motion.tr
                // The provider can leave the date empty or fall back to a bare
                // fiscal period, so it isn't unique on its own.
                key={`${q.fiscalDateEnding}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: anyHovered ? (isHovered ? 1 : 0.4) : i < 4 ? 1 : 0.6 }}
                transition={{ duration: 0.15, delay: anyHovered ? 0 : i * 0.025 }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0 cursor-default ${
                  isHovered ? 'bg-gray-50/60 dark:bg-white/[0.02]' : ''
                }`}
              >
                <td className="py-2 pr-3 tabular-nums font-medium text-rh-light-text/90 dark:text-white">
                  {formatQuarter(q.fiscalDateEnding)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-rh-light-text dark:text-white">
                  {formatEPS(q.estimatedEPS)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-rh-light-text/90 dark:text-white">
                  {formatEPS(q.reportedEPS)}
                </td>
                <td className={`py-2 px-2 text-right tabular-nums ${
                  q.surprisePercentage == null
                    ? 'text-rh-light-text dark:text-white/80'
                    : verdictTextClass(verdict)
                }`}>
                  {formatSurprise(q.surprisePercentage)}
                </td>
                <td className="py-2 pl-2 text-right">
                  {verdict == null ? (
                    <span className="text-[10px] text-rh-light-text dark:text-white/80">
                      {q.reportedEPS == null ? 'Upcoming' : '—'}
                    </span>
                  ) : (
                    // Status reads through a dot + colored text, never a wash.
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        verdict === 'beat' ? 'bg-rh-green' :
                        verdict === 'miss' ? 'bg-rh-red' :
                        'bg-gray-400/40 dark:bg-white/[0.15]'
                      }`} />
                      <span className={`text-[10px] ${verdictTextClass(verdict)}`}>
                        {verdict === 'beat' ? 'Beat' : verdict === 'miss' ? 'Miss' : 'Met'}
                      </span>
                    </span>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Voice ─────────────────────────────────────────────────────────── */

function getEarningsTagline(beats: number, total: number): string {
  if (total === 0) return '';
  const ratio = beats / total;
  if (ratio >= 0.9) return 'Reliable earnings execution';
  if (ratio >= 0.75) return 'Consistent beat track record';
  if (ratio >= 0.5) return 'Mixed earnings history';
  if (ratio >= 0.25) return 'Frequently misses estimates';
  return 'Struggles to meet expectations';
}

/* ─── Main Component ────────────────────────────────────────────────── */

const earningsCache = new Map<string, { data: EarningsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function EarningsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EarningsResponse | null>(earningsCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!earningsCache.has(ticker));
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<ChartMode>('eps');
  const [range, setRange] = useState<RangeToggle>(8);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cached = earningsCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    // An expired entry is still the right answer until a fresher one lands —
    // blanking it would flash an empty panel on every revisit.
    setData(cached?.data ?? null);
    setLoading(!cached);
    getEarnings(ticker)
      .then(resp => {
        if (requestIdRef.current === requestId) {
          setData(resp);
          earningsCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (requestIdRef.current === requestId) {
          // A failed refresh must not erase a panel we can still populate:
          // without this the whole section unmounts and its scroll anchor dies.
          if (cached) setData(cached.data);
          setLoading(false);
        }
      });
  }, [ticker]);

  useEffect(() => {
    setCollapsed(false);
    setMode('eps');
    setRange(8);
  }, [ticker]);

  // Mode and range switches swap the dataset under a live hover. A carried-over
  // index would light a table row that is no longer on screen, or paint a
  // tooltip for a quarter the chart has dropped.
  useEffect(() => { setHoveredIdx(null); }, [mode, range, ticker]);

  // Everything below indexes by recency, so order it here rather than trusting
  // the provider to have sorted it. A mis-ordered response would otherwise put
  // the wrong quarters in the trailing-year figures and mislabel the chart.
  const sorted = useMemo(
    () => [...(data?.quarterly ?? [])].sort((a, b) => b.fiscalDateEnding.localeCompare(a.fiscalDateEnding)),
    [data],
  );

  if (loading) {
    return (
      <div className="pt-4 pb-5 mb-6 border-b border-gray-200/10 dark:border-white/[0.04] animate-pulse">
        <div className="h-4 bg-gray-200/50 dark:bg-white/[0.06] rounded w-20 mb-4" />
        <div className="h-[160px] bg-gray-200/30 dark:bg-white/[0.03] rounded" />
      </div>
    );
  }

  if (!data || data.quarterly.length === 0) return null;

  const verdicts = sorted.map(getVerdict);
  const beats = verdicts.filter(v => v === 'beat').length;
  const graded = verdicts.filter(v => v != null).length;
  const tagline = getEarningsTagline(beats, graded);

  const reported = sorted.filter(q => q.reportedEPS != null);
  const surprises = sorted
    .map(q => q.surprisePercentage)
    .filter((v): v is number => v != null);
  const avgSurprise = surprises.length > 0
    ? surprises.reduce((sum, v) => sum + v, 0) / surprises.length
    : null;
  // Trailing twelve months only counts when four *consecutive* quarters are in.
  // Three summed would read as a year and understate it; four with a gap in the
  // middle would silently sum fifteen months. ~273 days separates the ends of
  // four consecutive quarters — allow a wide band for fiscal-calendar drift.
  const ttm = reported.slice(0, 4);
  const ttmSpanDays = ttm.length === 4
    ? (Date.parse(ttm[0].fiscalDateEnding) - Date.parse(ttm[3].fiscalDateEnding)) / 86_400_000
    : null;
  const epsTTM = ttmSpanDays != null && ttmSpanDays > 240 && ttmSpanDays < 310
    ? ttm.reduce((sum, q) => sum + (q.reportedEPS as number), 0)
    : null;
  // "Next Report" has to be a quarter that genuinely still lies ahead. Position
  // in the list can't establish that: for the days-to-weeks after a company
  // reports, the provider often still carries that quarter with a null result,
  // so the leading unreported run holds a quarter that has already happened.
  // Require a future date, and fail closed — showing nothing beats naming a
  // quarter that reported last month.
  // Compare calendar date to calendar date as plain ISO strings. `Date.parse`
  // reads a date-only string as UTC midnight, which for a Pacific viewer puts
  // "tomorrow" in the past from 5pm — blanking the tile the evening before the
  // one day it matters most. String comparison has no timezone to get wrong.
  const today = localToday();
  const stillAhead = sorted.filter(q => {
    if (q.reportedEPS != null) return false;
    // Fall back to the period end when no report date is published: a fiscal
    // quarter that hasn't closed yet certainly hasn't reported.
    const at = isoDate(q.reportedDate) ?? isoDate(q.fiscalDateEnding);
    return at != null && at >= today;
  });
  // `sorted` runs newest-first, so the soonest of those is the last one.
  const pending = stillAhead.length > 0 ? stillAhead[stillAhead.length - 1] : null;
  // With no surprise data at all there is nothing for that view to draw.
  const hasSurprise = surprises.length > 0;

  const metrics: Metric[] = [
    {
      label: 'Beat Rate',
      value: graded > 0 ? `${Math.round((beats / graded) * 100)}%` : '—',
      detail: graded > 0 ? `${beats} of ${graded} quarters` : undefined,
      // No sign colour: a 60% beat rate is neither good news nor bad, and the
      // streak dots already carry the shape of it.
    },
    {
      label: 'Avg Surprise',
      value: avgSurprise == null ? '—' : formatSurprise(avgSurprise),
      detail: surprises.length > 0 ? `across ${surprises.length} quarters` : undefined,
      signed: avgSurprise,
    },
    {
      label: 'EPS (TTM)',
      value: epsTTM == null ? '—' : formatEPS(epsTTM),
      detail: epsTTM == null
        ? undefined
        : `${formatQuarter(ttm[3].fiscalDateEnding)} – ${formatQuarter(ttm[0].fiscalDateEnding)}`,
    },
    {
      label: 'Next Report',
      value: pending ? formatQuarter(pending.fiscalDateEnding) : '—',
      // A tile called "Next Report" should say when, where the provider gives
      // a date; the estimate alone leaves the useful half unanswered.
      detail: pending
        ? [
            pending.estimatedEPS != null ? `est. ${formatEPS(pending.estimatedEPS)}` : null,
            formatReportDate(pending.reportedDate),
          ].filter(Boolean).join(' · ') || undefined
        : undefined,
    },
  ].filter(m => m.value !== '—');

  const visible = sorted.slice(0, range);
  // Clamped once, here, because the chart and the table have to agree on it: a
  // touch sets the hover and never clears it, so shrinking the range leaves an
  // index past the end. Unclamped, "no row matches but something is hovered"
  // dims every bar and every row at once.
  const safeHovered = hoveredIdx != null && hoveredIdx >= 0 && hoveredIdx < visible.length
    ? hoveredIdx
    : null;
  // A ticker with no analyst coverage has no surprise view to switch to.
  const effectiveMode: ChartMode = hasSurprise ? mode : 'eps';
  const legend = [
    ...(effectiveMode === 'eps'
      ? [
          { label: 'Estimate', color: SERIES_BLUE },
          { label: 'Beat', color: SERIES_GREEN },
          { label: 'Miss', color: SERIES_RED },
        ]
      : [
          { label: 'Above estimate', color: SERIES_GREEN },
          { label: 'Below estimate', color: SERIES_RED },
        ]),
    // Grey only earns a chip when a quarter actually landed on its estimate.
    ...(visible.some(q => getVerdict(q) === 'met')
      ? [{ label: 'Met', color: SERIES_NEUTRAL }]
      : []),
  ];

  return (
    <div className="pt-4 pb-5 mb-6 border-b border-gray-200/10 dark:border-white/[0.04]">
      {/* Header — the APG accordion shape: heading wraps the toggle, and the
          toggle holds only phrasing content so the markup stays valid. <h2> to
          sit level with its sibling sections (Key Statistics et al). */}
      <h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          // Pinning the name keeps the editorial tagline out of it, but the
          // name replaces the whole subtree — so the stale-data warning has to
          // be carried here or a screen reader never hears it.
          aria-label={data.dataAge === 'stale' ? 'Earnings — stale data' : 'Earnings'}
          onClick={() => setCollapsed(c => !c)}
          className="group w-full flex items-center justify-between text-left select-none"
        >
          <span className="flex-1 min-w-0">
            {/* Section-header recipe, matching Key Statistics */}
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-text dark:text-white">
              <span className="w-0.5 h-3.5 bg-rh-green rounded-full" />
              Earnings
            </span>
            {tagline && (
              // Indented past the green bar so it aligns with the label text.
              <span className="block pl-2.5 text-[11px] text-rh-light-text dark:text-white/80 mt-1 truncate italic">{tagline}</span>
            )}
          </span>
          <span className="flex items-center gap-2.5">
            {/* The streak stands in for the chart while the panel is shut */}
            <AnimatePresence>
              {collapsed && (
                <motion.span
                  className="block"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <StreakDots quarters={sorted} />
                </motion.span>
              )}
            </AnimatePresence>
            {data.dataAge === 'stale' && (
              <span className="text-[10px] text-rh-light-text dark:text-white/80">stale data</span>
            )}
            <svg
              aria-hidden="true"
              className={`w-4 h-4 flex-shrink-0 text-rh-light-text dark:text-white/80 transition-transform duration-200 group-hover:text-rh-light-text dark:group-hover:text-white/80 ${collapsed ? '' : 'rotate-180'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
      </h2>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              {/* Key figures — everything here comes out of the same response */}
              {metrics.length > 0 && (
                <div className="mb-4 pb-4 border-b border-gray-200/40 dark:border-white/[0.06]">
                  <MetricGrid metrics={metrics} />
                </div>
              )}

              {/* Controls row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                  {(([['eps', 'EPS'], ['surprise', 'Surprise']] as [ChartMode, string][])
                    .filter(([id]) => id === 'eps' || hasSurprise)
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={effectiveMode === id}
                      onClick={() => setMode(id)}
                      className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors
                        ${effectiveMode === id
                          ? 'bg-white dark:bg-white/[0.08] text-rh-green shadow-sm'
                          : 'text-rh-light-text dark:text-white/80 hover:text-rh-light-text dark:hover:text-rh-text'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {sorted.length > 4 && (
                  <div className="flex gap-0.5 bg-gray-50/40 dark:bg-white/[0.02] rounded-lg p-0.5">
                    {([4, 8] as RangeToggle[]).map(r => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={range === r}
                        aria-label={`Show ${r} quarters`}
                        onClick={() => setRange(r)}
                        className={`px-2.5 py-0.5 text-[10px] font-medium rounded-md transition-colors
                          ${range === r
                            ? 'bg-white dark:bg-white/[0.06] text-rh-green shadow-sm'
                            : 'text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-rh-text'
                          }`}
                      >
                        {r}Q
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chart — owns its legend, so an empty window drops both */}
              <div className="mb-3">
                <EarningsChart
                  quarters={visible}
                  mode={effectiveMode}
                  legend={legend}
                  hoveredIdx={safeHovered}
                  setHoveredIdx={setHoveredIdx}
                />
              </div>

              {/* Quarter ledger — the substance of the section, so it stays open */}
              <EarningsTable
                quarters={visible}
                hoveredIdx={safeHovered}
                setHoveredIdx={setHoveredIdx}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
