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

// Sector Visualization Component - Interactive expanding sectors like Robinhood
interface SectorVisualizationProps {
  sectors: Array<{ sector: string; weight: number }>;
}

function Sector3DVisualization({ sectors }: SectorVisualizationProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const selectedData = sectors.find(s => s.sector === selectedSector);
  const activeData = selectedData || sectors.find(s => s.sector === hoveredSector);

  const handleSectorClick = (sector: string) => {
    setSelectedSector(prev => prev === sector ? null : sector);
  };

  // Find selected index for calculating spread
  const selectedIndex = selectedSector ? sectors.findIndex(s => s.sector === selectedSector) : -1;

  return (
    <div className="mb-4">
      {/* Container with extra space for floating sector */}
      <div
        className="relative"
        style={{
          paddingTop: selectedSector ? '28px' : '0',
          transition: 'padding-top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >

        {/* Shadow/ghost of selected sector in original position */}
        {selectedSector && (
          <div
            className="absolute bottom-0 left-0 right-0 flex h-10 rounded-lg overflow-hidden pointer-events-none"
          >
            {sectors.map((s, index) => {
              const isSelected = selectedSector === s.sector;
              return (
                <div
                  key={`ghost-${s.sector}`}
                  style={{
                    width: `${s.weight}%`,
                    height: '100%',
                    background: isSelected ? 'rgba(0,0,0,0.1)' : 'transparent',
                    borderRadius: isSelected ? '8px' : undefined,
                    transition: 'all 0.3s ease-out',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Main stacked bar */}
        <div className="relative flex h-10 rounded-lg bg-rh-light-bg/50 dark:bg-rh-dark/50">
          {sectors.map((s, index) => {
            const colors = getSectorColorHex(s.sector);
            const isHovered = hoveredSector === s.sector;
            const isSelected = selectedSector === s.sector;
            const isActive = isSelected || (isHovered && !selectedSector);

            // Calculate horizontal spread when a sector is selected
            // Only spread sectors INWARD (toward selected), don't spread outward to avoid clipping
            let spreadX = 0;
            if (selectedSector && !isSelected) {
              const distance = index - selectedIndex;
              const baseSpread = 6;

              // Only spread the immediate neighbors, and only inward
              if (distance === -1) {
                // Immediate left neighbor - push slightly left
                spreadX = -baseSpread;
              } else if (distance === 1) {
                // Immediate right neighbor - push slightly right
                spreadX = baseSpread;
              }
              // Sectors further away don't spread (prevents edge clipping)
            }

            // Calculate lift for selected sector
            const liftY = isSelected ? -24 : 0;
            const scale = isSelected ? 1.08 : isActive ? 1.02 : 1;

            return (
              <div
                key={s.sector}
                className="relative cursor-pointer"
                style={{
                  width: `${s.weight}%`,
                  height: '40px',
                  zIndex: isSelected ? 30 : isActive ? 10 : 1,
                }}
                onClick={() => handleSectorClick(s.sector)}
                onMouseEnter={() => setHoveredSector(s.sector)}
                onMouseLeave={() => setHoveredSector(null)}
              >
                {/* Animated sector block */}
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translateX(${spreadX}px) translateY(${liftY}px) scale(${scale})`,
                    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transformOrigin: 'center center',
                  }}
                >
                  {/* Main colored block */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: isSelected
                        ? `linear-gradient(135deg, ${colors.light} 0%, ${colors.main} 50%, ${colors.dark} 100%)`
                        : isActive
                        ? `linear-gradient(180deg, ${colors.light} 0%, ${colors.main} 60%, ${colors.dark} 100%)`
                        : `linear-gradient(180deg, ${colors.light}90 0%, ${colors.main} 100%)`,
                      borderRadius: isSelected
                        ? '12px'
                        : index === 0
                        ? '8px 0 0 8px'
                        : index === sectors.length - 1
                        ? '0 8px 8px 0'
                        : '0',
                      boxShadow: isSelected
                        ? `0 16px 32px ${colors.main}40, 0 8px 16px ${colors.dark}30, 0 0 0 2px ${colors.light}40, inset 0 2px 4px ${colors.light}60`
                        : isActive
                        ? `0 4px 12px ${colors.main}40, inset 0 1px 2px ${colors.light}`
                        : 'none',
                      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    {/* Shine effect on selected */}
                    {isSelected && (
                      <div
                        className="absolute inset-0 rounded-xl overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${colors.light}50 0%, transparent 50%)`,
                        }}
                      />
                    )}

                    {/* Floating percentage badge */}
                    {isSelected && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          animation: 'fadeInUp 0.3s ease-out forwards',
                        }}
                      >
                        <div
                          className="px-3 py-1 rounded-full text-white text-sm font-bold"
                          style={{
                            background: `linear-gradient(135deg, ${colors.dark}90, ${colors.main})`,
                            boxShadow: `0 2px 8px ${colors.dark}60`,
                          }}
                        >
                          {s.weight.toFixed(1)}%
                        </div>
                      </div>
                    )}

                    {/* Pulse ring animation on selection */}
                    {isSelected && (
                      <div
                        className="absolute inset-0 rounded-xl"
                        style={{
                          border: `2px solid ${colors.light}`,
                          animation: 'pulseRing 1s ease-out',
                        }}
                      />
                    )}
                  </div>

                  {/* Connection line to original position */}
                  {isSelected && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full h-4"
                      style={{
                        width: '2px',
                        background: `linear-gradient(180deg, ${colors.main}60, transparent)`,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Info card - shows when sector is selected or hovered */}
        <div
          className={`
            absolute left-1/2 -translate-x-1/2 w-72 max-w-[calc(100%-1rem)]
            bg-rh-light-card dark:bg-rh-card rounded-xl px-4 py-3
            border border-rh-light-border dark:border-rh-border
            shadow-xl z-40
            transition-all duration-400 ease-out
            ${activeData ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
          style={{
            top: selectedSector ? 'calc(100% + 16px)' : 'calc(100% + 8px)',
            transform: `translateX(-50%) translateY(${activeData ? '0' : '-8px'})`,
          }}
        >
          {activeData && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-5 h-5 rounded-lg flex-shrink-0 transition-all duration-300"
                  style={{
                    backgroundColor: getSectorColorHex(activeData.sector).main,
                    boxShadow: `0 4px 12px ${getSectorColorHex(activeData.sector).main}50`,
                    transform: selectedSector === activeData.sector ? 'scale(1.15) rotate(-3deg)' : 'scale(1)',
                  }}
                />
                <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text flex-1">
                  {activeData.sector}
                </span>
                <span
                  className="text-xl font-bold transition-all duration-300"
                  style={{
                    color: getSectorColorHex(activeData.sector).main,
                    transform: selectedSector === activeData.sector ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {activeData.weight.toFixed(2)}%
                </span>
              </div>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted leading-relaxed">
                {SECTOR_DESCRIPTIONS[activeData.sector] || 'Sector allocation in the fund.'}
              </p>
              {selectedSector === activeData.sector && (
                <div className="mt-3 pt-2 border-t border-rh-light-border/30 dark:border-rh-border/30 flex items-center justify-between">
                  <p className="text-[10px] text-rh-light-muted/70 dark:text-rh-muted/70">
                    Click again to collapse
                  </p>
                  <div
                    className="w-6 h-1 rounded-full"
                    style={{ backgroundColor: getSectorColorHex(activeData.sector).main + '40' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Legend - all sectors, clickable */}
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-1.5 mt-6">
        {sectors.map(s => {
          const colors = getSectorColorHex(s.sector);
          const isSelected = selectedSector === s.sector;
          const isHovered = hoveredSector === s.sector;
          const isActive = isSelected || isHovered;

          return (
            <button
              key={s.sector}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]
                transition-all duration-300 border
                ${isSelected
                  ? 'border-current scale-110 shadow-lg'
                  : isHovered
                  ? 'border-current scale-105 shadow-sm'
                  : 'border-transparent hover:bg-rh-light-bg/50 dark:hover:bg-rh-dark/50'
                }
              `}
              style={{
                color: isActive ? colors.main : undefined,
                backgroundColor: isActive ? `${colors.main}20` : undefined,
                boxShadow: isSelected ? `0 4px 12px ${colors.main}30` : undefined,
              }}
              onClick={() => handleSectorClick(s.sector)}
              onMouseEnter={() => setHoveredSector(s.sector)}
              onMouseLeave={() => setHoveredSector(null)}
            >
              <div
                className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: colors.main,
                  transform: isSelected ? 'scale(1.4)' : isActive ? 'scale(1.2)' : 'scale(1)',
                  boxShadow: isActive ? `0 0 8px ${colors.main}` : 'none',
                }}
              />
              <span className={isActive ? 'font-semibold' : 'text-rh-light-text dark:text-rh-text'}>
                {s.sector}
              </span>
              <span className={isActive ? 'font-bold' : 'text-rh-light-muted dark:text-rh-muted'}>
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
