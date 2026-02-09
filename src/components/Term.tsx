import { useJargon } from '../context/JargonContext';

interface TermProps {
  beginner: string;
  advanced: string;
  className?: string;
}

export function Term({ beginner, advanced, className = '' }: TermProps) {
  const { mode, toggle } = useJargon();
  const text = mode === 'beginner' ? beginner : advanced;

  return (
    <span
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className={`cursor-pointer border-b border-dotted border-current/30 hover:border-current/60 transition-all duration-200 select-none ${className}`}
      title={mode === 'beginner' ? `Also known as: ${advanced}` : `Simplified: ${beginner}`}
    >
      {text}
    </span>
  );
}
