import { useMemo } from 'react';
import { RSI_COLOR } from '../utils/stock-chart';

interface Props {
  data: (number | null)[];
  toX: (index: number) => number;
  width: number;
}

const PANEL_H = 80;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;
const PLOT_H = PANEL_H - PAD_TOP - PAD_BOTTOM;

export function RSIPanel({ data, toX, width }: Props) {
  const toY = (val: number) => PAD_TOP + PLOT_H - (val / 100) * PLOT_H;

  const pathD = useMemo(() => {
    const pts: string[] = [];
    data.forEach((v, i) => {
      if (v === null) return;
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
    });
    return pts.join(' ');
  }, [data, toX]);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 mb-0.5 px-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: RSI_COLOR }}>RSI (14)</span>
      </div>
      <svg width="100%" height={PANEL_H} viewBox={`0 0 ${width} ${PANEL_H}`} preserveAspectRatio="none" className="overflow-hidden">
        {/* Overbought/oversold zones */}
        <rect x={0} y={toY(70)} width={width} height={toY(30) - toY(70)} fill={RSI_COLOR} opacity={0.04} />
        {/* Reference lines */}
        <line x1={0} y1={toY(70)} x2={width} y2={toY(70)} stroke={RSI_COLOR} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.3} />
        <line x1={0} y1={toY(50)} x2={width} y2={toY(50)} stroke="#666" strokeWidth={0.5} strokeDasharray="2,4" opacity={0.2} />
        <line x1={0} y1={toY(30)} x2={width} y2={toY(30)} stroke={RSI_COLOR} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.3} />
        {/* RSI line */}
        <path d={pathD} fill="none" stroke={RSI_COLOR} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        {/* Y-axis labels */}
        <text x={width - 2} y={toY(70) - 2} textAnchor="end" fill={RSI_COLOR} fontSize={8} opacity={0.4}>70</text>
        <text x={width - 2} y={toY(30) + 8} textAnchor="end" fill={RSI_COLOR} fontSize={8} opacity={0.4}>30</text>
      </svg>
    </div>
  );
}
