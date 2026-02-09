import { useState } from 'react';

interface StockLogoProps {
  ticker: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { container: 'w-6 h-6', text: 'text-[8px]', img: 'w-4 h-4' },
  md: { container: 'w-8 h-8', text: 'text-[10px]', img: 'w-5 h-5' },
  lg: { container: 'w-10 h-10', text: 'text-xs', img: 'w-6 h-6' },
};

export function StockLogo({ ticker, size = 'sm', className = '' }: StockLogoProps) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];
  const url = `https://financialmodelingprep.com/image-stock/${ticker.toUpperCase()}.png`;

  const glassClasses = 'rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]';

  if (failed) {
    return (
      <div className={`${s.container} ${glassClasses} flex items-center justify-center shrink-0 ${className}`}>
        <span className={`${s.text} font-bold text-white/50`}>{ticker.slice(0, 2)}</span>
      </div>
    );
  }

  return (
    <div className={`${s.container} ${glassClasses} flex items-center justify-center shrink-0 overflow-hidden ${className}`}>
      <img
        src={url}
        alt={`${ticker} logo`}
        className={`${s.img} object-contain opacity-80`}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    </div>
  );
}
