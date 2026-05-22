import { ReactNode, Suspense } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface LazyPageProps {
  /** Stable identifier for logs — e.g. "InsightsPage", "StockDetailView". Required so error logs are grep-able. */
  name: string;
  /** Override the loading spinner. Defaults to the centered logo spinner. */
  fallback?: ReactNode;
  /** Override the error UI. Passed through to ErrorBoundary. */
  errorFallback?: ReactNode;
  children: ReactNode;
}

function DefaultPageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
    </div>
  );
}

/**
 * Wraps a lazily-loaded page in both an ErrorBoundary AND a Suspense, so it is
 * impossible to render a `React.lazy` page in App.tsx without both safety nets.
 * The ErrorBoundary sits OUTSIDE Suspense so chunk-load failures (which throw
 * on commit, after Suspense unsuspends) are caught with the auto-reload logic.
 */
export function LazyPage({ name, fallback, errorFallback, children }: LazyPageProps) {
  return (
    <ErrorBoundary pageName={name} fallback={errorFallback}>
      <Suspense fallback={fallback ?? <DefaultPageFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
