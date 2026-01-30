import { useState, useEffect, useRef, useCallback } from 'react';
import { searchSymbols } from '../api';
import { SymbolSearchResult } from '../types';

// LocalStorage key for recent selections
const RECENT_TICKERS_KEY = 'recentTickerSelections';
const MAX_RECENT_TICKERS = 20;

interface TickerAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (result: SymbolSearchResult) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  heldTickers?: string[]; // Tickers currently in portfolio
  compact?: boolean; // Compact mode for header search bar
}

/**
 * Get recent ticker selections from localStorage
 */
function getRecentTickers(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_TICKERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add a ticker to recent selections
 */
function addRecentTicker(ticker: string): void {
  try {
    const recent = getRecentTickers();
    const upperTicker = ticker.toUpperCase();

    // Remove if already exists, then add to front
    const filtered = recent.filter(t => t !== upperTicker);
    filtered.unshift(upperTicker);

    // Keep only the most recent
    const trimmed = filtered.slice(0, MAX_RECENT_TICKERS);
    localStorage.setItem(RECENT_TICKERS_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Apply local popularity boosts to results
 * Returns new array sorted with local boosts applied
 */
function applyLocalBoosts(
  results: SymbolSearchResult[],
  heldTickers: string[],
  recentTickers: string[]
): SymbolSearchResult[] {
  const heldSet = new Set(heldTickers.map(t => t.toUpperCase()));

  // Create boosted scores
  const boosted = results.map(r => {
    let boost = 0;
    const symbol = r.symbol.toUpperCase();

    // Held ticker boost (small, additive)
    if (heldSet.has(symbol)) {
      boost += 15;
    }

    // Recent selection boost (recency-weighted)
    const recentIndex = recentTickers.indexOf(symbol);
    if (recentIndex !== -1) {
      // More recent = more boost (max 20 for most recent, decreasing)
      boost += Math.max(5, 20 - recentIndex);
    }

    return {
      ...r,
      // Note: Server already applies isHeld, but we might have newer info
      isHeld: heldSet.has(symbol) || r.isHeld,
      localBoostedScore: r.popularityScore + boost,
    };
  });

  // Sort by boosted score
  boosted.sort((a, b) => b.localBoostedScore - a.localBoostedScore);

  // Return without the localBoostedScore (it was just for sorting)
  return boosted.map(({ localBoostedScore: _, ...rest }) => rest);
}

/**
 * Format volume number for display
 */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(1)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(0)}K`;
  }
  return volume.toFixed(0);
}

export function TickerAutocompleteInput({
  value,
  onChange,
  onSelect,
  disabled = false,
  placeholder = 'e.g. AAPL',
  className = '',
  autoFocus = false,
  heldTickers = [],
  compact = false,
}: TickerAutocompleteInputProps) {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search function
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await searchSymbols(query, heldTickers);

      // Apply local boosts for recent selections
      const recentTickers = getRecentTickers();
      const boostedResults = applyLocalBoosts(response.results, heldTickers, recentTickers);

      setResults(boostedResults);
      setIsOpen(boostedResults.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [heldTickers]);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    onChange(newValue);
    setSelectedCompany(null);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search (300ms)
    debounceRef.current = setTimeout(() => {
      performSearch(newValue);
    }, 300);
  };

  // Handle selection
  const handleSelect = (result: SymbolSearchResult) => {
    onChange(result.symbol);
    setSelectedCompany(result.description);
    setIsOpen(false);
    setResults([]);
    setSelectedIndex(-1);

    // Save to recent selections
    addRecentTicker(result.symbol);

    onSelect?.(result);
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        // Close dropdown but don't prevent the event from bubbling
        // This allows the modal's Escape handler to work
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        // Close dropdown on tab
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-index]');
      const selectedItem = items[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        {compact && (
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          disabled={disabled}
          placeholder={compact ? 'Search stocks...' : placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={compact
            ? `w-full pl-8 pr-3 py-1.5 rounded-lg border border-rh-light-border dark:border-rh-border
              bg-rh-light-bg dark:bg-rh-dark text-sm text-rh-light-text dark:text-rh-text
              focus:outline-none focus:ring-2 focus:ring-rh-green/50
              placeholder:text-rh-light-muted dark:placeholder:text-rh-muted ${className}`
            : `w-full px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border
              bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text
              focus:outline-none focus:ring-2 focus:ring-rh-green/50
              disabled:opacity-50 disabled:cursor-not-allowed ${className}`
          }
        />
        {isLoading && (
          <div className={`absolute ${compact ? 'right-2.5' : 'right-3'} top-1/2 -translate-y-1/2`}>
            <div className="w-4 h-4 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Company name hint (not in compact mode) */}
      {!compact && selectedCompany && !isOpen && (
        <p className="mt-1 text-xs text-rh-light-muted dark:text-rh-muted truncate">
          {selectedCompany}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 mt-1 bg-rh-light-card dark:bg-rh-card
            border border-rh-light-border dark:border-rh-border rounded-lg shadow-lg
            max-h-64 overflow-y-auto ${compact ? 'w-80 right-0' : 'w-full'}`}
          role="listbox"
        >
          {results.map((result, index) => (
            <div
              key={`${result.symbol}-${index}`}
              data-index={index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(result);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={selectedIndex === index}
              className={`px-3 py-2 cursor-pointer transition-colors
                ${selectedIndex === index
                  ? 'bg-rh-green/10 dark:bg-rh-green/20'
                  : 'hover:bg-gray-100 dark:hover:bg-rh-dark/50'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-rh-light-text dark:text-rh-text">
                  {result.symbol}
                </span>

                {/* Popular tag - only for known popular tickers */}
                {result.isPopular && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rh-green/20 text-rh-green rounded">
                    Popular
                  </span>
                )}

                {/* Held indicator */}
                {result.isHeld && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded">
                    Held
                  </span>
                )}

                <span className="flex-1 text-sm text-rh-light-muted dark:text-rh-muted truncate">
                  {result.description}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
                {result.primaryExchange && (
                  <span>{result.primaryExchange}</span>
                )}
                {result.primaryExchange && result.type && <span>·</span>}
                {result.type && <span>{result.type}</span>}
                {result.marketCapB && (
                  <>
                    <span>·</span>
                    <span className="text-rh-green">${result.marketCapB >= 1000 ? `${(result.marketCapB / 1000).toFixed(1)}T` : `${result.marketCapB.toFixed(0)}B`}</span>
                  </>
                )}
                {!result.marketCapB && result.avgVolume && (
                  <>
                    <span>·</span>
                    <span className="text-rh-light-muted dark:text-rh-muted">Vol: {formatVolume(result.avgVolume)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && results.length === 0 && !isLoading && value.length >= 1 && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 mt-1 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg shadow-lg px-3 py-3 text-center text-sm text-rh-light-muted dark:text-rh-muted ${compact ? 'w-80 right-0' : 'w-full'}`}
        >
          No matches
        </div>
      )}
    </div>
  );
}
