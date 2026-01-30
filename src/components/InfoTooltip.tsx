import { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold
          bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted
          hover:text-rh-light-text dark:hover:text-rh-text transition-colors cursor-help"
        aria-label="Info"
      >
        i
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 max-w-[90vw]
          bg-gray-900 dark:bg-gray-800 text-white text-xs leading-relaxed rounded-lg shadow-lg p-3
          pointer-events-none"
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800" />
        </div>
      )}
    </span>
  );
}
