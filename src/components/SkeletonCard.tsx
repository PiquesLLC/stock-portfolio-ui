interface SkeletonCardProps {
  lines?: number;
  height?: string;
}

export function SkeletonCard({ lines = 3, height }: SkeletonCardProps) {
  return (
    <div
      className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-6 shadow-sm dark:shadow-none animate-pulse"
      style={height ? { minHeight: height } : undefined}
    >
      <div className="h-4 bg-gray-200 dark:bg-rh-border rounded w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-gray-200 dark:bg-rh-border rounded mb-3"
          style={{ width: `${80 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 shadow-sm dark:shadow-none animate-pulse"
        >
          <div className="h-3 bg-gray-200 dark:bg-rh-border rounded w-1/2 mb-3" />
          <div className="h-6 bg-gray-200 dark:bg-rh-border rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}
