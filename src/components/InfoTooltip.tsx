import { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [show]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold
          border border-gray-300/60 dark:border-white/[0.12]
          text-rh-light-muted/70 dark:text-rh-muted/70
          hover:text-rh-light-text dark:hover:text-rh-text
          hover:border-gray-400/60 dark:hover:border-white/20
          transition-all cursor-help"
        aria-label="Info"
      >
        i
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-64 max-w-[90vw]
          bg-gray-800/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md
          border border-gray-700/50 dark:border-white/[0.1]
          text-gray-100 text-[11px] leading-relaxed rounded-xl shadow-xl
          px-3.5 py-2.5
          animate-in fade-in duration-150"
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-[5px] border-r-[5px] border-t-[5px] border-transparent
            border-t-gray-800/95 dark:border-t-[#1e1e1e]/95" />
        </div>
      )}
    </span>
  );
}
