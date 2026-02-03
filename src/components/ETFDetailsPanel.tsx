import { useState, useRef, useEffect } from 'react';
import { DividendEvent, DividendCredit, ETFHoldingsData, Holding } from '../types';

interface Props {
  ticker: string;
  dividendEvents: DividendEvent[];
  dividendCredits: DividendCredit[];
  etfHoldings: ETFHoldingsData | null;
  holding: Holding | null;
  onTickerClick?: (ticker: string) => void;
}

type TabId = 'dividends' | 'holdings';
type DividendView = 'received' | 'ex-dates';

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

// Sector colors - hex values for 3D faces
const SECTOR_COLOR_HEX: Record<string, { main: string; light: string; dark: string }> = {
  'Technology': { main: '#3b82f6', light: '#60a5fa', dark: '#2563eb' },
  'Financial Services': { main: '#a855f7', light: '#c084fc', dark: '#9333ea' },
  'Communication Services': { main: '#f472b6', light: '#f9a8d4', dark: '#ec4899' },
  'Consumer Cyclical': { main: '#fb7185', light: '#fda4af', dark: '#f43f5e' },
  'Healthcare': { main: '#fb923c', light: '#fdba74', dark: '#f97316' },
  'Industrials': { main: '#fbbf24', light: '#fcd34d', dark: '#f59e0b' },
  'Consumer Defensive': { main: '#facc15', light: '#fde047', dark: '#eab308' },
  'Energy': { main: '#a3e635', light: '#bef264', dark: '#84cc16' },
  'Utilities': { main: '#4ade80', light: '#86efac', dark: '#22c55e' },
  'Real Estate': { main: '#34d399', light: '#6ee7b7', dark: '#10b981' },
  'Basic Materials': { main: '#22d3ee', light: '#67e8f9', dark: '#06b6d4' },
};

// Sector descriptions for tooltips
const SECTOR_DESCRIPTIONS: Record<string, string> = {
  'Technology': 'Software, hardware, semiconductors, and IT services companies.',
  'Financial Services': 'Banks, insurance, asset management, and fintech companies.',
  'Communication Services': 'Media, entertainment, telecom, and social platforms.',
  'Consumer Cyclical': 'Retail, automotive, luxury goods, and travel companies.',
  'Healthcare': 'Pharma, biotech, medical devices, and healthcare providers.',
  'Industrials': 'Manufacturing, aerospace, defense, and logistics companies.',
  'Consumer Defensive': 'Food, beverages, household products, and discount stores.',
  'Energy': 'Oil, gas, renewable energy, and energy equipment companies.',
  'Utilities': 'Electric, gas, water utilities, and power producers.',
  'Real Estate': 'REITs, property developers, and real estate services.',
  'Basic Materials': 'Mining, chemicals, metals, and forestry companies.',
};

function getSectorColorHex(sector: string): { main: string; light: string; dark: string } {
  return SECTOR_COLOR_HEX[sector] || { main: '#9ca3af', light: '#d1d5db', dark: '#6b7280' };
}


// Interactive Sector List for Drawer
function SectorDrawerList({ sectors }: { sectors: Array<{ sector: string; weight: number }> }) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxWeight = Math.max(...sectors.map(s => s.weight));

  const handleMouseEnter = (sector: string, e: React.MouseEvent) => {
    setHoveredSector(sector);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setTooltipPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.bottom - containerRect.top + 8,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredSector(null);
    setTooltipPos(null);
  };

  const hoveredData = sectors.find(s => s.sector === hoveredSector);

  return (
    <div className="mb-6 relative" ref={containerRef}>
      <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-4">Sectors</h3>

      {/* Stacked bar chart with animation */}
      <div className="space-y-2">
        {sectors.map((s, i) => {
          const colors = getSectorColorHex(s.sector);
          const isHovered = hoveredSector === s.sector;
          const barWidth = (s.weight / maxWeight) * 100;

          return (
            <div
              key={s.sector}
              className={`
                group relative rounded-lg p-3 cursor-pointer
                transition-all duration-200 ease-out
                ${isHovered ? 'bg-rh-light-bg dark:bg-rh-dark scale-[1.02]' : 'hover:bg-rh-light-bg/50 dark:hover:bg-rh-dark/50'}
              `}
              style={{
                animationDelay: `${i * 50}ms`,
              }}
              onMouseEnter={(e) => handleMouseEnter(s.sector, e)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm transition-transform duration-200"
                    style={{
                      backgroundColor: colors.main,
                      transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                      boxShadow: isHovered ? `0 0 8px ${colors.main}60` : 'none',
                    }}
                  />
                  <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                    {s.sector}
                  </span>
                </div>
                <span
                  className={`text-sm font-bold transition-colors duration-200 ${
                    isHovered ? 'text-rh-green' : 'text-rh-light-muted dark:text-rh-muted'
                  }`}
                >
                  {s.weight.toFixed(2)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-rh-light-border/30 dark:bg-rh-border/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    background: isHovered
                      ? `linear-gradient(90deg, ${colors.main}, ${colors.light})`
                      : colors.main,
                    boxShadow: isHovered ? `0 0 10px ${colors.main}40` : 'none',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip overlay - absolute positioned, no layout shift */}
      {hoveredData && tooltipPos && (
        <div
          className="absolute z-50 w-56 bg-rh-light-card dark:bg-rh-card rounded-lg px-3 py-2
            border border-rh-light-border dark:border-rh-border shadow-lg
            pointer-events-none transition-opacity duration-150"
          style={{
            left: Math.min(Math.max(tooltipPos.x - 112, 8), (containerRef.current?.offsetWidth || 300) - 232),
            top: tooltipPos.y,
          }}
        >
          <p className="text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed">
            {SECTOR_DESCRIPTIONS[hoveredData.sector] || 'Sector allocation in the fund.'}
          </p>
        </div>
      )}
    </div>
  );
}

// Sector Visualization Component - Clean stacked bar with hover effects
interface SectorVisualizationProps {
  sectors: Array<{ sector: string; weight: number }>;
}

function Sector3DVisualization({ sectors }: SectorVisualizationProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const hoveredData = sectors.find(s => s.sector === hoveredSector);

  return (
    <div className="mb-4">
      {/* Stacked horizontal bar */}
      <div className="relative mb-4">
        <div className="flex h-10 rounded-lg overflow-hidden shadow-inner bg-rh-light-bg/50 dark:bg-rh-dark/50">
          {sectors.map((s) => {
            const colors = getSectorColorHex(s.sector);
            const isHovered = hoveredSector === s.sector;

            return (
              <div
                key={s.sector}
                className="relative h-full cursor-pointer transition-all duration-200"
                style={{
                  width: `${s.weight}%`,
                  background: isHovered
                    ? `linear-gradient(180deg, ${colors.light} 0%, ${colors.main} 50%, ${colors.dark} 100%)`
                    : `linear-gradient(180deg, ${colors.light}90 0%, ${colors.main} 100%)`,
                  transform: isHovered ? 'scaleY(1.1)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                  zIndex: isHovered ? 10 : 1,
                  boxShadow: isHovered ? `0 -4px 12px ${colors.main}60, inset 0 1px 0 ${colors.light}` : 'none',
                }}
                onMouseEnter={() => setHoveredSector(s.sector)}
                onMouseLeave={() => setHoveredSector(null)}
              >
                {/* Highlight line on top when hovered */}
                {isHovered && (
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: colors.light }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Tooltip - absolute positioned */}
        <div
          className={`
            absolute left-1/2 -translate-x-1/2 top-full mt-2
            w-64 max-w-[calc(100%-1rem)] bg-rh-light-card dark:bg-rh-card rounded-lg px-4 py-3
            border border-rh-light-border dark:border-rh-border
            shadow-xl pointer-events-none z-50
            transition-all duration-150
            ${hoveredSector ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}
          `}
        >
          {hoveredData && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getSectorColorHex(hoveredData.sector).main }}
                />
                <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                  {hoveredData.sector}
                </span>
                <span className="text-sm font-bold text-rh-green ml-auto">
                  {hoveredData.weight.toFixed(2)}%
                </span>
              </div>
              <p className="text-[11px] text-rh-light-muted dark:text-rh-muted leading-relaxed">
                {SECTOR_DESCRIPTIONS[hoveredData.sector] || 'Sector allocation in the fund.'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Legend - top 4 sectors */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {sectors.slice(0, 4).map(s => {
          const colors = getSectorColorHex(s.sector);
          const isHovered = hoveredSector === s.sector;

          return (
            <button
              key={s.sector}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]
                transition-all duration-200 border
                ${isHovered
                  ? 'border-current scale-105 shadow-sm'
                  : 'border-transparent hover:bg-rh-light-bg/50 dark:hover:bg-rh-dark/50'
                }
              `}
              style={{
                color: isHovered ? colors.main : undefined,
                backgroundColor: isHovered ? `${colors.main}15` : undefined,
              }}
              onMouseEnter={() => setHoveredSector(s.sector)}
              onMouseLeave={() => setHoveredSector(null)}
            >
              <div
                className="w-2 h-2 rounded-full transition-transform duration-200"
                style={{
                  backgroundColor: colors.main,
                  transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                  boxShadow: isHovered ? `0 0 6px ${colors.main}` : 'none',
                }}
              />
              <span className={isHovered ? 'font-medium' : 'text-rh-light-text dark:text-rh-text'}>
                {s.sector}
              </span>
              <span className={isHovered ? 'font-semibold' : 'text-rh-light-muted dark:text-rh-muted'}>
                {s.weight.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Drawer component
function Drawer({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className="fixed top-0 right-0 h-full w-full max-w-md bg-rh-light-card dark:bg-rh-card border-l border-rh-light-border dark:border-rh-border
          shadow-xl z-50 overflow-y-auto outline-none animate-slide-in-right"
      >
        <div className="sticky top-0 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rh-light-muted dark:text-rh-muted
              hover:bg-rh-light-bg dark:hover:bg-rh-dark transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </>
  );
}

export function ETFDetailsPanel({ ticker, dividendEvents, dividendCredits, etfHoldings, holding, onTickerClick }: Props) {
  // Default to 'holdings' tab if holdings data is available, otherwise 'dividends'
  const hasHoldingsData = etfHoldings && (etfHoldings.topHoldings.length > 0 || etfHoldings.sectorWeightings.length > 0);
  const [activeTab, setActiveTab] = useState<TabId>(hasHoldingsData ? 'holdings' : 'dividends');
  const [dividendView, setDividendView] = useState<DividendView>('received');
  const [showDividendDrawer, setShowDividendDrawer] = useState(false);
  const [showHoldingsDrawer, setShowHoldingsDrawer] = useState(false);

  // Don't render if not an ETF
  if (!etfHoldings?.isETF) {
    return null;
  }

  // Calculate TTM (trailing twelve months) dividend total
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const ttmEvents = dividendEvents.filter(d => new Date(d.exDate) >= oneYearAgo);
  const ttmPerShare = ttmEvents.reduce((sum, d) => sum + d.amountPerShare, 0);
  const ttmTotal = holding ? ttmPerShare * holding.shares : ttmPerShare;

  // Last dividend
  const lastDividend = dividendEvents.length > 0 ? dividendEvents[0] : null;

  // Determine frequency
  const determineFrequency = (): string => {
    if (dividendEvents.length < 2) return 'N/A';
    const events = dividendEvents.slice(0, 8);
    if (events.length < 2) return 'N/A';
    const avgGapDays = events.slice(0, -1).reduce((sum, d, i) => {
      const curr = new Date(d.exDate);
      const next = new Date(events[i + 1].exDate);
      return sum + (curr.getTime() - next.getTime()) / (1000 * 60 * 60 * 24);
    }, 0) / (events.length - 1);
    if (avgGapDays < 45) return 'Monthly';
    if (avgGapDays < 120) return 'Quarterly';
    if (avgGapDays < 200) return 'Semi-Annual';
    return 'Annual';
  };

  const frequency = determineFrequency();

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dividends', label: 'Dividends' },
    { id: 'holdings', label: 'Holdings' },
  ];

  const displayEvents = dividendView === 'received' ? dividendCredits : dividendEvents;
  const hasHoldings = etfHoldings && (etfHoldings.topHoldings.length > 0 || etfHoldings.sectorWeightings.length > 0);

  return (
    <>
      <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border p-5 mb-6">
        {/* Header with tabs */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text">ETF Details</h2>
          <div className="flex gap-1 bg-rh-light-bg dark:bg-rh-dark rounded-lg p-0.5">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === t.id
                    ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dividends Tab */}
        {activeTab === 'dividends' && (
          <div>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-3 py-2">
                <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">TTM Total</div>
                <div className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
                  {holding ? formatCurrency(ttmTotal) : `$${ttmPerShare.toFixed(4)}/sh`}
                </div>
              </div>
              <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-3 py-2">
                <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">Last Div</div>
                <div className="text-sm font-semibold text-rh-green">
                  {lastDividend ? `$${lastDividend.amountPerShare.toFixed(4)}` : 'N/A'}
                </div>
              </div>
              <div className="bg-rh-light-bg dark:bg-rh-dark rounded-lg px-3 py-2">
                <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider">Frequency</div>
                <div className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{frequency}</div>
              </div>
            </div>

            {/* Toggle chips */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setDividendView('received')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  dividendView === 'received'
                    ? 'bg-rh-green/10 text-rh-green'
                    : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                Received
              </button>
              <button
                onClick={() => setDividendView('ex-dates')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  dividendView === 'ex-dates'
                    ? 'bg-rh-green/10 text-rh-green'
                    : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
              >
                Ex-Dates
              </button>
            </div>

            {/* Dividend list - last 5 */}
            <div className="space-y-1.5">
              {dividendView === 'received' ? (
                dividendCredits.length > 0 ? (
                  dividendCredits.slice(0, 5).map(c => {
                    const isReinvested = c.reinvestment != null;
                    return (
                      <div key={c.id} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                            {new Date(c.creditedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                          </span>
                          {isReinvested && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">DRIP</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-rh-green">+{formatCurrency(c.amountGross)}</span>
                          {isReinvested && c.reinvestment && (
                            <span className="text-[10px] text-rh-green/70">+{c.reinvestment.sharesPurchased.toFixed(4)}sh</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted py-2">No dividends received yet.</p>
                )
              ) : (
                dividendEvents.length > 0 ? (
                  dividendEvents.slice(0, 5).map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1">
                      <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                        Ex: {new Date(d.exDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </span>
                      <span className="text-xs font-semibold text-rh-green">${d.amountPerShare.toFixed(4)}/sh</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted py-2">No dividend history available.</p>
                )
              )}
            </div>

            {/* Show all button + source footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-rh-light-border/30 dark:border-rh-border/30">
              {displayEvents.length > 5 && (
                <button
                  onClick={() => setShowDividendDrawer(true)}
                  className="text-xs text-rh-green hover:underline font-medium"
                >
                  Show all ({displayEvents.length})
                </button>
              )}
              <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 ml-auto">
                Source: Yahoo Finance
              </span>
            </div>
          </div>
        )}

        {/* Holdings Tab */}
        {activeTab === 'holdings' && hasHoldings && (
          <div>
            {/* 3D Sector Visualization */}
            {etfHoldings.sectorWeightings.length > 0 && (
              <Sector3DVisualization sectors={etfHoldings.sectorWeightings} />
            )}

            {/* Top 3 holdings */}
            {etfHoldings.topHoldings.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-rh-light-muted dark:text-rh-muted uppercase tracking-wider mb-2">
                  Top Holdings ({etfHoldings.totalHoldingsPercent.toFixed(1)}% of fund)
                </div>
                <div className="space-y-2">
                  {etfHoldings.topHoldings.slice(0, 3).map((h, i) => (
                    <div key={h.symbol} className="flex items-center gap-2">
                      <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 w-4">{i + 1}</span>
                      <button
                        onClick={() => onTickerClick?.(h.symbol)}
                        className="text-xs font-mono font-semibold text-rh-green hover:underline w-14"
                      >
                        {h.symbol}
                      </button>
                      <div className="flex-1 h-1.5 bg-rh-light-bg dark:bg-rh-dark rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rh-green/60 rounded-full"
                          style={{ width: `${(h.holdingPercent / etfHoldings.topHoldings[0].holdingPercent) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-rh-light-text dark:text-rh-text w-12 text-right">
                        {h.holdingPercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View full breakdown link */}
            <button
              onClick={() => setShowHoldingsDrawer(true)}
              className="text-xs text-rh-green hover:underline font-medium"
            >
              View full ETF breakdown
            </button>
          </div>
        )}

        {activeTab === 'holdings' && !hasHoldings && (
          <p className="text-xs text-rh-light-muted dark:text-rh-muted py-4">Holdings data not available for this ETF.</p>
        )}
      </div>

      {/* Dividend Drawer */}
      <Drawer
        open={showDividendDrawer}
        onClose={() => setShowDividendDrawer(false)}
        title={`${ticker} Dividends`}
      >
        {/* Toggle in drawer too */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setDividendView('received')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dividendView === 'received'
                ? 'bg-rh-green/10 text-rh-green'
                : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted'
            }`}
          >
            Received
          </button>
          <button
            onClick={() => setDividendView('ex-dates')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dividendView === 'ex-dates'
                ? 'bg-rh-green/10 text-rh-green'
                : 'bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted'
            }`}
          >
            Ex-Dates
          </button>
        </div>

        <div className="space-y-2">
          {dividendView === 'received' ? (
            dividendCredits.map(c => {
              const isReinvested = c.reinvestment != null;
              return (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-rh-light-border/20 dark:border-rh-border/20">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-rh-light-muted dark:text-rh-muted">
                      {new Date(c.creditedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isReinvested && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rh-green/10 text-rh-green font-medium">DRIP</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-rh-green">+{formatCurrency(c.amountGross)}</span>
                    {isReinvested && c.reinvestment && (
                      <div className="text-[10px] text-rh-green/70">
                        +{c.reinvestment.sharesPurchased.toFixed(4)} sh @ {formatCurrency(c.reinvestment.pricePerShare)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            dividendEvents.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-rh-light-border/20 dark:border-rh-border/20">
                <div>
                  <div className="text-sm text-rh-light-text dark:text-rh-text">
                    Ex: {new Date(d.exDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">
                    Pay: {new Date(d.payDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <span className="text-sm font-semibold text-rh-green">${d.amountPerShare.toFixed(4)}/sh</span>
              </div>
            ))
          )}
        </div>

        <p className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 mt-4">Source: Yahoo Finance</p>
      </Drawer>

      {/* Holdings Drawer */}
      <Drawer
        open={showHoldingsDrawer}
        onClose={() => setShowHoldingsDrawer(false)}
        title={`${ticker} Breakdown`}
      >
        {etfHoldings && (
          <>
            {/* Full sector list with interactive bars */}
            {etfHoldings.sectorWeightings.length > 0 && (
              <SectorDrawerList sectors={etfHoldings.sectorWeightings} />
            )}

            {/* Full holdings table */}
            {etfHoldings.topHoldings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text mb-3">
                  Top {etfHoldings.topHoldings.length} Holdings
                  <span className="font-normal text-rh-light-muted dark:text-rh-muted ml-1">
                    ({etfHoldings.totalHoldingsPercent.toFixed(2)}% of assets)
                  </span>
                </h3>
                <div className="space-y-2">
                  {etfHoldings.topHoldings.map((h, i) => (
                    <div key={h.symbol} className="flex items-center gap-2 py-1 border-b border-rh-light-border/20 dark:border-rh-border/20">
                      <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-rh-light-text dark:text-rh-text truncate">{h.holdingName}</div>
                        <button
                          onClick={() => {
                            onTickerClick?.(h.symbol);
                            setShowHoldingsDrawer(false);
                          }}
                          className="text-[10px] font-mono text-rh-green hover:underline"
                        >
                          {h.symbol}
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-rh-light-text dark:text-rh-text w-14 text-right">
                        {h.holdingPercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {etfHoldings.asOfDate && (
              <p className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/50 mt-4">
                As of {new Date(etfHoldings.asOfDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
