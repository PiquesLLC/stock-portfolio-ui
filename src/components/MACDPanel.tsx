import { useMemo } from 'react';
import { MACD_COLORS } from '../utils/stock-chart';

interface Props {
  data: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  toX: (index: number) => number;
  width: number;
  visibleCount: number;
}

const PANEL_H = 80;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;
const PLOT_H = PANEL_H - PAD_TOP - PAD_BOTTOM;

export function MACDPanel({ data, toX, width, visibleCount }: Props) {
  const { toY, macdPath, signalPath } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < data.macd.length; i++) {
      if (data.macd[i] !== null) { mn = Math.min(mn, data.macd[i]!); mx = Math.max(mx, data.macd[i]!); }
      if (data.signal[i] !== null) { mn = Math.min(mn, data.signal[i]!); mx = Math.max(mx, data.signal[i]!); }
      if (data.histogram[i] !== null) { mn = Math.min(mn, data.histogram[i]!); mx = Math.max(mx, data.histogram[i]!); }
    }
    if (!Number.isFinite(mn)) { mn = -1; mx = 1; }
    const range = mx - mn || 2;
    const padded = { min: mn - range * 0.1, max: mx + range * 0.1 };
    const ty = (v: number) => PAD_TOP + PLOT_H - ((v - padded.min) / (padded.max - padded.min)) * PLOT_H;

    const buildPath = (values: (number | null)[]) => {
      const pts: string[] = [];
      values.forEach((v, i) => { if (v !== null) pts.push(`${pts.length === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${ty(v).toFixed(1)}`); });
      return pts.join(' ');
    };

    return { toY: ty, macdPath: buildPath(data.macd), signalPath: buildPath(data.signal) };
  }, [data, toX]);

  const barW = Math.max(1, Math.min(8, width / Math.max(1, visibleCount) * 0.5));
  const zeroY = toY(0);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3 mb-0.5 px-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: MACD_COLORS.macd }}>MACD</span>
        <span className="flex items-center gap-1 text-[8px] text-rh-light-muted/40 dark:text-rh-muted/40">
          <span className="w-2 h-0.5 rounded" style={{ backgroundColor: MACD_COLORS.macd }} /> MACD
          <span className="w-2 h-0.5 rounded ml-1" style={{ backgroundColor: MACD_COLORS.signal }} /> Signal
        </span>
      </div>
      <svg width="100%" height={PANEL_H} viewBox={`0 0 ${width} ${PANEL_H}`} preserveAspectRatio="none" className="overflow-hidden">
        {/* Zero line */}
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#666" strokeWidth={0.5} strokeDasharray="2,4" opacity={0.3} />
        {/* Histogram bars */}
        {data.histogram.map((v, i) => {
          if (v === null) return null;
          const x = toX(i);
          const h = Math.abs(toY(v) - zeroY);
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={v >= 0 ? toY(v) : zeroY}
              width={barW}
              height={Math.max(0.5, h)}
              fill={v >= 0 ? MACD_COLORS.histUp : MACD_COLORS.histDown}
              opacity={0.5}
            />
          );
        })}
        {/* MACD line */}
        <path d={macdPath} fill="none" stroke={MACD_COLORS.macd} strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
        {/* Signal line */}
        <path d={signalPath} fill="none" stroke={MACD_COLORS.signal} strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
      </svg>
    </div>
  );
}
