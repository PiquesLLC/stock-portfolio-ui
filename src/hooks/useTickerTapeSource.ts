import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type TickerTapeSource = 'portfolio' | 'watchlist' | 'sp500' | 'dow' | 'nasdaq';

export const TICKER_TAPE_SOURCE_CYCLE: TickerTapeSource[] = [
  'portfolio',
  'watchlist',
  'sp500',
  'dow',
  'nasdaq',
];

export const TICKER_TAPE_SOURCE_LABELS: Record<TickerTapeSource, string> = {
  portfolio: 'Portfolio',
  watchlist: 'Watchlist',
  sp500: 'S&P 500',
  dow: 'Dow 30',
  nasdaq: 'Nasdaq 100',
};

const STORAGE_KEY = 'nala:tickerTapeSource';

const VALID_SOURCES: ReadonlySet<string> = new Set(TICKER_TAPE_SOURCE_CYCLE);

// Reject unknown stored values (e.g. from an older build that used different keys,
// or hand-edited storage). Falls back to 'portfolio'.
function deserializeSource(raw: string): TickerTapeSource {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string' && VALID_SOURCES.has(parsed)) {
      return parsed as TickerTapeSource;
    }
  } catch { /* fall through */ }
  return 'portfolio';
}

type Availability = Record<TickerTapeSource, boolean>;

export function useTickerTapeSource() {
  const [source, setSource] = useLocalStorage<TickerTapeSource>(
    STORAGE_KEY,
    'portfolio',
    { deserialize: deserializeSource },
  );

  const cycleSource = useCallback(
    (availability: Availability): TickerTapeSource | null => {
      let result: TickerTapeSource | null = null;
      setSource(prev => {
        const currentIdx = TICKER_TAPE_SOURCE_CYCLE.indexOf(prev);
        for (let i = 1; i <= TICKER_TAPE_SOURCE_CYCLE.length; i++) {
          const next = TICKER_TAPE_SOURCE_CYCLE[(currentIdx + i) % TICKER_TAPE_SOURCE_CYCLE.length];
          if (availability[next]) {
            result = next;
            return next;
          }
        }
        return prev;
      });
      return result;
    },
    [setSource],
  );

  return {
    source,
    setSource,
    cycleSource,
    label: TICKER_TAPE_SOURCE_LABELS[source],
  };
}
