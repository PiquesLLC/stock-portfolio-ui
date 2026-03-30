import { useMemo } from 'react';
import type { CandleDataPoint } from '../utils/stock-chart';

interface Props {
  candles: CandleDataPoint[];
  toX: (index: number) => number;
  toY: (price: number) => number;
  plotW: number;
  visibleCount: number;
  hoverIndex: number | null;
}

const UP_COLOR = '#00C805';
const DOWN_COLOR = '#E8544E';
const MAX_VISIBLE_CANDLES = 400;

export function CandlestickRenderer({ candles, toX, toY, plotW, visibleCount, hoverIndex }: Props) {
  // Decimation: if too many candles, sample evenly
  const indices = useMemo(() => {
    const count = candles.length;
    if (count <= MAX_VISIBLE_CANDLES) return candles.map((_, i) => i);
    const step = count / MAX_VISIBLE_CANDLES;
    const result: number[] = [];
    for (let i = 0; i < MAX_VISIBLE_CANDLES; i++) {
      result.push(Math.round(i * step));
    }
    // Always include last candle
    if (result[result.length - 1] !== count - 1) result.push(count - 1);
    return result;
  }, [candles]);

  const bodyW = Math.max(1, Math.min(20, (plotW / Math.max(1, visibleCount)) * 0.65));
  const wickW = Math.max(0.5, bodyW > 4 ? 1 : 0.5);

  return (
    <g className="candlesticks">
      {indices.map(i => {
        const c = candles[i];
        if (!c) return null;
        const x = toX(i);
        const isUp = c.close >= c.open;
        const color = isUp ? UP_COLOR : DOWN_COLOR;
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBottom = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyBottom - bodyTop);
        const wickTop = toY(c.high);
        const wickBottom = toY(c.low);
        const isHovered = hoverIndex === i;
        const opacity = isHovered ? 1 : 0.85;

        return (
          <g key={i} opacity={opacity}>
            {/* Wick */}
            <line
              x1={x}
              y1={wickTop}
              x2={x}
              y2={wickBottom}
              stroke={color}
              strokeWidth={wickW}
            />
            {/* Body */}
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={isUp ? color : color}
              stroke={color}
              strokeWidth={0.3}
              rx={bodyW > 3 ? 0.5 : 0}
            />
          </g>
        );
      })}
    </g>
  );
}
