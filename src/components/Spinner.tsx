interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-3 w-3 border',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-2',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-rh-green border-t-transparent ${sizes[size]} ${className}`}
    />
  );
}
