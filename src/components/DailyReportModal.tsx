import { useState, useEffect, useRef, useCallback } from 'react';
import { getDailyReport, regenerateDailyReport, getFastQuote, getSectorPerformance, getEarningsSummary, getUpcomingDividends, getMarketSentiment, getPortfolio, getEconomicCalendar, getPortfolioNews, EarningsSummaryItem, MarketSentiment, EconomicCalendarEvent, PortfolioNewsResponse } from '../api';
import { DailyReportResponse, Portfolio, HeatmapSector, DividendEvent } from '../types';
import { timeAgo } from '../utils/format';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { toPng } from 'html-to-image';

interface DailyReportModalProps {
  onClose: () => void;
  onTickerClick?: (ticker: string) => void;
  hidden?: boolean;
  portfolio?: Portfolio | null;
}

type SectorBarItem = Pick<HeatmapSector, 'name' | 'avgChangePercent'>;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

// Common English words that look like tickers but aren't
const TICKER_BLACKLIST = new Set([
  'I', 'A', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN', 'IS', 'IT', 'ME',
  'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'OX', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ANY', 'ARE', 'BIG', 'BUT', 'CAN', 'DAY', 'DID', 'END', 'FEW', 'FOR',
  'GET', 'GOT', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'NEW',
  'NOT', 'NOW', 'OLD', 'ONE', 'OUR', 'OUT', 'OWN', 'PUT', 'RAN', 'RUN', 'SAY', 'SET',
  'SHE', 'THE', 'TOO', 'TOP', 'TWO', 'USE', 'WAS', 'WAY', 'WHO', 'WHY', 'WIN', 'WON',
  'YET', 'YOU', 'YOUR', 'ALSO', 'BACK', 'BEEN', 'BOTH', 'CAME', 'COME', 'DOWN', 'EACH',
  'EVEN', 'FIND', 'FIVE', 'FROM', 'FULL', 'GAVE', 'GOOD', 'GREW', 'GROW', 'HALF', 'HAVE',
  'HEAD', 'HERE', 'HIGH', 'HOLD', 'INTO', 'JUST', 'KEEP', 'KEPT', 'KNOW', 'LAST', 'LEFT',
  'LIKE', 'LINE', 'LIST', 'LONG', 'LOOK', 'LOSE', 'LOSS', 'LOST', 'MADE', 'MAKE', 'MANY',
  'MORE', 'MOST', 'MOVE', 'MUCH', 'MUST', 'NAME', 'NEAR', 'NEED', 'NEXT', 'NOTE', 'ONLY',
  'OPEN', 'OVER', 'PAID', 'PART', 'PAST', 'PICK', 'PLAN', 'PULL', 'PUSH', 'RATE', 'READ',
  'RISE', 'ROSE', 'SAID', 'SAME', 'SEEN', 'SHOW', 'SIDE', 'SIGN', 'SLOW', 'SOLD', 'SOME',
  'STAY', 'SUCH', 'TAKE', 'TELL', 'THAN', 'THAT', 'THEM', 'THEN', 'THEY', 'THIS', 'TOOK',
  'TURN', 'VERY', 'WANT', 'WEEK', 'WELL', 'WENT', 'WERE', 'WHAT', 'WHEN', 'WILL', 'WITH',
  'WORD', 'YEAR', 'ABOVE', 'AFTER', 'AGAIN', 'BELOW', 'COULD', 'EVERY', 'FIRST',
  'GIVEN', 'GOING', 'GREAT', 'KNOWN', 'LARGE', 'LOWER', 'MIGHT', 'NEVER', 'OTHER',
  'POINT', 'PRICE', 'RALLY', 'RIGHT', 'SHALL', 'SHARE', 'SHARP', 'SHORT', 'SINCE',
  'SMALL', 'STACK', 'STILL', 'STOCK', 'THEIR', 'THERE', 'THESE', 'THINK', 'THOSE',
  'THREE', 'TODAY', 'TOTAL', 'TRADE', 'UNDER', 'UNTIL', 'UPPER', 'VALUE', 'WATCH',
  'WHERE', 'WHICH', 'WHILE', 'WHOLE', 'WHOSE', 'WORTH', 'WOULD', 'YIELD',
  'CPI', 'GDP', 'PCE', 'PPI', 'PMI', 'ISM', 'FOMC', 'FED', 'SEC', 'IPO', 'ETF',
  'NYSE', 'YOY', 'QOQ', 'MOM', 'BPS', 'CEO', 'CFO', 'COO', 'CTO',
  'YTD', 'QTD', 'MTD', 'ATH', 'ATL', 'EPS', 'ROE', 'ROA', 'ROI', 'NAV', 'AUM',
  'DCF', 'FCF', 'EBIT', 'WACC', 'CAGR', 'GAAP', 'IFRS',
  'SK', 'AI', 'EV', 'IV', 'PE', 'PB', 'PS',
]);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function stripCitations(text: string): string {
  return text
    .replace(/\[\d+\]|\[headlines?\]|\[sources?\]|\[provided\]|\[portfolio[^\]]*\]/gi, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\/(?=[A-Z]{2,5}\b)/g, ', ')
    // Strip static percentages near tickers — live quotes replace these
    .replace(/\s*\([+-]?\d+\.?\d*%\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractTickers(text: string): string[] {
  const matches = stripCitations(text).match(/\b[A-Z]{2,5}\b/g) || [];
  return [...new Set(matches.filter(t => !TICKER_BLACKLIST.has(t)))];
}

function extractAllTickers(data: DailyReportResponse): string[] {
  const texts = [
    data.marketOverview, data.portfolioSummary,
    ...data.topStories.map(s => s.headline + ' ' + s.body),
    ...data.topStories.flatMap(s => s.relatedTickers),
    ...data.watchToday,
  ];
  return [...new Set(texts.flatMap(t => extractTickers(t)))];
}

function estimateReadingTime(data: DailyReportResponse): number {
  const text = [
    data.greeting, data.marketOverview, data.portfolioSummary,
    ...data.topStories.map(s => s.headline + ' ' + s.body),
    ...data.watchToday,
  ].join(' ');
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

type LiveQuotes = Record<string, { changePercent: number; currentPrice?: number; previousClose?: number }>;

// Subtle inline ticker with small change% suffix
function TickerPill({ ticker, quote, onClick }: { ticker: string; quote?: { changePercent: number }; onClick?: (t: string) => void }) {
  const pct = quote?.changePercent ?? 0;
  const isUp = pct >= 0;
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); onClick?.(ticker); }}
        className="text-white/90 font-semibold underline decoration-white/15 underline-offset-2 hover:decoration-rh-green hover:text-rh-green transition-colors"
      >
        {ticker}
      </button>
      {quote && (
        <span className={`text-[11px] font-mono font-medium ${isUp ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
          {isUp ? '+' : ''}{pct.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

// Render text with pill badges for tickers
function renderWithPills(text: string, onClick?: (ticker: string) => void, quotes?: LiveQuotes): (string | JSX.Element)[] {
  const cleaned = stripCitations(text);
  const parts = cleaned.split(/\b([A-Z]{1,5})\b/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && !TICKER_BLACKLIST.has(part) && part.length >= 2) {
      return <TickerPill key={i} ticker={part} quote={quotes?.[part]} onClick={onClick} />;
    }
    return part;
  });
}

// Animated loading screen — shows NALA "writing" the brief
const LOADING_STEPS = [
  { label: 'Scanning market data', icon: '1' },
  { label: 'Analyzing your portfolio', icon: '2' },
  { label: 'Reviewing top headlines', icon: '3' },
  { label: 'Writing your briefing', icon: '4' },
];

const MAX_RETRIES = 2;

/** Returns true if the response looks like a real, complete report */
function isValidReport(result: DailyReportResponse): boolean {
  // Sample reports for new users are always valid
  if (result.sample) return true;
  // A valid report has at least one top story with content
  if (!result.topStories || result.topStories.length === 0) return false;
  // If it's cached, trust it
  if (result.cached) return true;
  // Non-cached: check that stories have actual content (not placeholder text)
  const hasContent = result.topStories.some(s => s.headline.length > 5 && s.body.length > 10);
  return hasContent;
}

function BriefingLoader({ retryAttempt }: { retryAttempt: number }) {
  const [activeStep, setActiveStep] = useState(0);
  const [typedText, setTypedText] = useState('');
  const fullText = LOADING_STEPS[activeStep]?.label || '';

  // Reset steps when retry attempt changes
  useEffect(() => {
    setActiveStep(0);
  }, [retryAttempt]);

  // Cycle through steps
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Typewriter effect for current step
  useEffect(() => {
    setTypedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
      } else {
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [activeStep, fullText]);

  const retryMessage = retryAttempt > 0
    ? `Still preparing... (attempt ${retryAttempt + 1} of ${MAX_RETRIES + 1})`
    : 'Preparing your daily brief...';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      {/* NALA logo / title */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rh-green/10 border border-rh-green/20 mb-5">
          <svg className="w-8 h-8 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Preparing Your Brief</h2>
        <p className="text-sm text-white/30">{retryMessage}</p>
      </div>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-3 mb-10">
        {LOADING_STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-15'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-500 ${
                isDone ? 'bg-rh-green/20 text-rh-green' : isActive ? 'bg-rh-green text-black' : 'bg-white/[0.06] text-white/30'
              }`}>
                {isDone ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.icon}
              </div>
              <span className={`text-sm transition-all duration-500 ${isActive ? 'text-white font-medium' : isDone ? 'text-white/50' : 'text-white/30'}`}>
                {isActive ? typedText : step.label}
                {isActive && <span className="inline-block w-[2px] h-[14px] bg-rh-green ml-0.5 align-middle animate-pulse" />}
              </span>
            </div>
          );
        })}
      </div>

      {/* Animated progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rh-green/60 to-rh-green rounded-full transition-all duration-[3000ms] ease-linear"
            style={{ width: `${Math.min(95, ((activeStep + 1) / LOADING_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Collapsible section
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-10">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 w-full text-left group mb-5">
        <div className="w-1 h-4 rounded-full bg-rh-green flex-shrink-0" />
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">
          {title}
        </h3>
        <svg className={`w-3 h-3 text-white/20 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

function isEffectivelyZero(pct: number): boolean {
  return Math.abs(pct) < 0.005;
}

// Sector → ETF ticker mapping
const SECTOR_ETF_MAP: Record<string, string> = {
  'Technology': 'XLK', 'Tech': 'XLK',
  'Financial': 'XLF', 'Finance': 'XLF', 'Financials': 'XLF',
  'Healthcare': 'XLV', 'Health Care': 'XLV',
  'Consumer': 'XLY', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP',
  'Industrial': 'XLI', 'Industrials': 'XLI',
  'Energy': 'XLE',
  'Communication': 'XLC', 'Communication Services': 'XLC',
  'Materials': 'XLB', 'Basic Materials': 'XLB',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
};

// Horizontal sector bars (matches Discover page style)
function SectorBars({ sectors, onTickerClick }: { sectors: SectorBarItem[]; onTickerClick?: (ticker: string) => void }) {
  const sorted = [...sectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent);
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.avgChangePercent)), 1);
  return (
    <div className="space-y-1.5">
      {sorted.map(s => {
        const pct = s.avgChangePercent;
        const barWidth = (Math.abs(pct) / maxAbs) * 50;
        const isPositive = pct >= 0;
        const zero = isEffectivelyZero(pct);
        const etf = SECTOR_ETF_MAP[s.name];
        return (
          <div key={s.name} className={`flex items-center gap-3 ${etf ? 'cursor-pointer hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors' : ''}`}
            onClick={() => etf && onTickerClick?.(etf)}>
            <span className="text-xs w-24 text-right shrink-0 font-medium text-white/40">{s.name}</span>
            <div className="flex-1 flex items-center h-5">
              <div className="relative w-full h-full flex items-center">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.08]" />
                <div
                  className="absolute h-4 rounded-sm transition-all duration-500"
                  style={{
                    left: isPositive ? '50%' : `${50 - barWidth}%`,
                    width: `${barWidth}%`,
                    background: zero ? '#888' : isPositive ? '#00C805' : '#E8544E',
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
            <span className={`text-xs font-semibold min-w-[50px] text-right font-mono ${zero ? 'text-white/40' : isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
              {isPositive ? '+' : ''}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

type IndexQuote = { price: number; changePct: number; change: number };

// Sentiment gauge — Fear & Greed speedometer
// Top semicircle: score 0 (fear/left) to 100 (greed/right).
// SVG negative angles: -180° (left) through -90° (top) to 0° (right).
function SentimentGauge({ sentiment }: { sentiment: MarketSentiment }) {
  const { score, label } = sentiment;

  const labelColor =
    score <= 25 ? '#ef4444' :
    score < 42 ? '#f97316' :
    score <= 58 ? '#a3a3a3' :
    score <= 75 ? '#84cc16' : '#22c55e';

  const cx = 150, cy = 140, r = 105;
  const arcWidth = 24;

  function scoreToRad(s: number): number {
    return ((-180 + (s / 100) * 180) * Math.PI) / 180;
  }

  function wedgePath(s0: number, s1: number): string {
    const rOuter = r + arcWidth / 2;
    const rInner = r - arcWidth / 2;
    const a0 = scoreToRad(s0);
    const a1 = scoreToRad(s1);
    const ox0 = cx + rOuter * Math.cos(a0);
    const oy0 = cy + rOuter * Math.sin(a0);
    const ox1 = cx + rOuter * Math.cos(a1);
    const oy1 = cy + rOuter * Math.sin(a1);
    const ix0 = cx + rInner * Math.cos(a1);
    const iy0 = cy + rInner * Math.sin(a1);
    const ix1 = cx + rInner * Math.cos(a0);
    const iy1 = cy + rInner * Math.sin(a0);
    return `M ${ox0} ${oy0} A ${rOuter} ${rOuter} 0 0 1 ${ox1} ${oy1} L ${ix0} ${iy0} A ${rInner} ${rInner} 0 0 0 ${ix1} ${iy1} Z`;
  }

  const segments = [
    { s0: 0, s1: 25, color: '#ef4444' },   // extreme fear
    { s0: 25, s1: 42, color: '#f97316' },   // fear
    { s0: 42, s1: 58, color: '#737373' },   // neutral
    { s0: 58, s1: 75, color: '#84cc16' },   // greed
    { s0: 75, s1: 100, color: '#22c55e' },  // extreme greed
  ];

  // Needle
  const needleRad = scoreToRad(score);
  const needleLen = r - arcWidth / 2 - 6;
  const tipX = cx + needleLen * Math.cos(needleRad);
  const tipY = cy + needleLen * Math.sin(needleRad);
  const baseW = 3.5;
  const perpRad = needleRad + Math.PI / 2;
  const b1x = cx + baseW * Math.cos(perpRad);
  const b1y = cy + baseW * Math.sin(perpRad);
  const b2x = cx - baseW * Math.cos(perpRad);
  const b2y = cy - baseW * Math.sin(perpRad);
  const tailLen = 12;
  const tailX = cx - tailLen * Math.cos(needleRad);
  const tailY = cy - tailLen * Math.sin(needleRad);

  // Zone labels inside the arc
  const zoneLabels = [
    { score: 12.5, text: 'EXTREME', text2: 'FEAR' },
    { score: 33.5, text: 'FEAR' },
    { score: 50, text: 'NEUTRAL' },
    { score: 66.5, text: 'GREED' },
    { score: 87.5, text: 'EXTREME', text2: 'GREED' },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Fear & Greed Index</h3>
      </div>

      {/* Score number above the gauge */}
      <div className="text-center">
        <span className="text-5xl font-extrabold tabular-nums" style={{ color: labelColor }}>{score}</span>
      </div>

      <div className="flex justify-center -mt-2">
        <svg viewBox="0 0 300 160" className="w-full max-w-[340px]">
          <defs>
            <filter id="needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={labelColor} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Arc segments */}
          {segments.map((seg, i) => (
            <path key={i} d={wedgePath(seg.s0, seg.s1)} fill={seg.color} opacity={0.9} />
          ))}

          {/* Zone labels inside the arc */}
          {zoneLabels.map((z, i) => {
            const a = scoreToRad(z.score);
            const labelR = r;
            const lx = cx + labelR * Math.cos(a);
            const ly = cy + labelR * Math.sin(a);
            const rotDeg = (z.score / 100) * 180 - 180 + 90;
            return (
              <g key={i} transform={`translate(${lx},${ly}) rotate(${rotDeg})`}>
                {z.text2 ? (
                  <>
                    <text textAnchor="middle" y={-3} fill="black" stroke="black" strokeWidth="1.4" fontSize="6.5" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text}</text>
                    <text textAnchor="middle" y={-3} fill="white" fontSize="6.5" fontWeight="800" letterSpacing="0.5">{z.text}</text>
                    <text textAnchor="middle" y={4.5} fill="black" stroke="black" strokeWidth="1.4" fontSize="6.5" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text2}</text>
                    <text textAnchor="middle" y={4.5} fill="white" fontSize="6.5" fontWeight="800" letterSpacing="0.5">{z.text2}</text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" y={1.5} fill="black" stroke="black" strokeWidth="1.4" fontSize="8" fontWeight="800" letterSpacing="0.5" paintOrder="stroke">{z.text}</text>
                    <text textAnchor="middle" y={1.5} fill="white" fontSize="8" fontWeight="800" letterSpacing="0.5">{z.text}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* Needle */}
          <polygon
            points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
            fill={labelColor} filter="url(#needle-shadow)"
          />
          {/* Center hub */}
          <circle cx={cx} cy={cy} r={7} fill="#111" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={3.5} fill={labelColor} opacity={0.8} />
        </svg>
      </div>

      <div className="text-center -mt-3">
        <p className="text-sm font-bold tracking-wide" style={{ color: labelColor }}>{label}</p>
      </div>

      {/* Signal breakdown */}
      <div className="mt-5 space-y-2 px-2">
        {([
          { key: 'vix', label: 'Market Volatility' },
          { key: 'momentum', label: 'Market Momentum' },
          { key: 'breadth', label: 'Stock Price Breadth' },
          { key: 'priceStrength', label: 'Stock Price Strength' },
          { key: 'putCall', label: 'Put/Call Options' },
          { key: 'safeHaven', label: 'Safe Haven Demand' },
          { key: 'junkBond', label: 'Junk Bond Demand' },
        ] as const).map(({ key, label: sigLabel }) => {
          const sig = sentiment.signals[key];
          if (!sig || (sig.signal === 0 && sig.value === 0)) return null;
          const sigColor = sig.signal <= 25 ? '#ef4444' : sig.signal < 42 ? '#f97316' : sig.signal <= 58 ? '#a3a3a3' : sig.signal <= 75 ? '#84cc16' : '#22c55e';
          const sigText = sig.signal <= 25 ? 'Extreme Fear' : sig.signal < 42 ? 'Fear' : sig.signal <= 58 ? 'Neutral' : sig.signal <= 75 ? 'Greed' : 'Extreme Greed';
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[11px] text-white/50 w-36 shrink-0">{sigLabel}</span>
              <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${sig.signal}%`, backgroundColor: sigColor }} />
              </div>
              <span className="text-[11px] font-medium w-20 text-right shrink-0" style={{ color: sigColor }}>{sigText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DailyReportModal({ onClose, onTickerClick, hidden }: DailyReportModalProps) {
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useLocalStorage('dailyReportDisabled', false);
  const [liveQuotes, setLiveQuotes] = useState<LiveQuotes>({});
  const [regenerating, setRegenerating] = useState(false);
  const [indexQuotes, setIndexQuotes] = useState<Record<string, IndexQuote>>({});
  const [cachedSectors, setCachedSectors] = useLocalStorage<SectorBarItem[]>('dailyReportSectors', []);
  const [cachedSentiment, setCachedSentiment] = useLocalStorage<MarketSentiment | null>('dailyReportSentiment', null);
  const [heatmapSectors, setHeatmapSectors] = useState<SectorBarItem[]>(cachedSectors);
  const [earnings, setEarnings] = useState<EarningsSummaryItem[]>([]);
  const [economicEvents, setEconomicEvents] = useState<EconomicCalendarEvent[]>([]);
  const [portfolioNewsData, setPortfolioNewsData] = useState<PortfolioNewsResponse | null>(null);
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(cachedSentiment);
  const [livePortfolio, setLivePortfolio] = useState<Portfolio | null>(null);
  const [sharing, setSharing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Lock body + html scroll (prevents double scrollbar on Windows)
  useEffect(() => {
    if (hidden) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; };
  }, [hidden]);

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Fetch daily report with auto-retry logic
  const fetchReport = useCallback(async (attempt = 0) => {
    setLoading(true);
    setError(false);
    setRetriesExhausted(false);
    setRetryAttempt(attempt);
    try {
      const result = await withTimeout(getDailyReport(), 15000, 'daily report');
      // Check if the response is a valid, complete report
      if (isValidReport(result)) {
        setData(result);
        setLoading(false);
        return;
      }
      // Got a quick fallback / incomplete response — auto-retry if attempts remain
      if (attempt < MAX_RETRIES) {
        retryTimerRef.current = setTimeout(() => {
          fetchReport(attempt + 1);
        }, 3000);
        return; // Stay in loading state while waiting for retry
      }
      // All retries exhausted with incomplete data
      setLoading(false);
      setRetriesExhausted(true);
    } catch {
      // Network/timeout error — auto-retry if attempts remain
      if (attempt < MAX_RETRIES) {
        retryTimerRef.current = setTimeout(() => {
          fetchReport(attempt + 1);
        }, 3000);
        return; // Stay in loading state while waiting for retry
      }
      // All retries exhausted with error
      setLoading(false);
      setRetriesExhausted(true);
    }
  }, []);

  // Manual refresh resets everything and starts fresh
  const handleManualRefresh = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setData(null);
    setRetriesExhausted(false);
    fetchReport(0);
  }, [fetchReport]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Fetch supplementary data (one-time)
  useEffect(() => {
    if (hidden) return;
    // Earnings this week
    getEarningsSummary().then(r => {
      setEarnings(r.results.filter(e => e.daysUntil >= 0 && e.daysUntil <= 7));
    }).catch(() => {});
    // Upcoming dividends — only show if ex-date is today
    getUpcomingDividends().then(divs => {
      const today = new Date().toDateString();
      setDividends(divs.filter(d => new Date(d.exDate).toDateString() === today));
    }).catch(() => {});
    // Economic calendar — upcoming high/medium impact events
    getEconomicCalendar().then(r => setEconomicEvents(r.events || [])).catch(() => {});
    // Portfolio news — macro summary + news tracker (same data as old Macro tab)
    getPortfolioNews(40).then(setPortfolioNewsData).catch(() => {});
  }, [hidden]);

  // Live quotes — index quotes + portfolio refresh every 30s
  useEffect(() => {
    if (hidden) return;
    const fetchLiveQuotes = () => {
      ['SPY', 'QQQ', 'DIA'].forEach(ticker => {
        getFastQuote(ticker).then(q => {
          setIndexQuotes(prev => ({ ...prev, [ticker]: { price: q.currentPrice, changePct: q.changePercent, change: q.change } }));
        }).catch(() => {});
      });
      getPortfolio().then(setLivePortfolio).catch(() => {});
    };
    fetchLiveQuotes();
    const interval = setInterval(fetchLiveQuotes, 30000);
    return () => clearInterval(interval);
  }, [hidden]);

  // Heavy data — sectors, sentiment: fetch once on mount (cached on API side)
  useEffect(() => {
    if (hidden) return;
    withTimeout(getSectorPerformance('1D'), 12000, 'sector performance')
      .then((r) => {
        const sectorBars = r.sectors.map((s) => ({ name: s.name, avgChangePercent: s.changePercent }));
        setHeatmapSectors(sectorBars);
        setCachedSectors(sectorBars);
      })
      .catch(() => {});
    withTimeout(getMarketSentiment(), 12000, 'market sentiment')
      .then((value) => {
        setSentiment(value);
        setCachedSentiment(value);
      })
      .catch(() => {});
  }, [hidden, setCachedSectors, setCachedSentiment]);

  // Fetch live quotes for mentioned tickers — every 30s
  useEffect(() => {
    if (!data || hidden) return;
    const tickers = extractAllTickers(data);
    if (tickers.length === 0) return;
    const fetchQuotes = () => {
      tickers.forEach(ticker => {
        getFastQuote(ticker).then(q => {
          setLiveQuotes(prev => ({ ...prev, [ticker]: { changePercent: q.changePercent, currentPrice: q.currentPrice, previousClose: q.previousClose } }));
        }).catch(() => {});
      });
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [data, hidden]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setLiveQuotes({});
    try { setData(await regenerateDailyReport()); }
    catch { /* keep existing data */ }
    finally { setRegenerating(false); }
  };

  const handleShare = async () => {
    if (!contentRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await toPng(contentRef.current, {
        backgroundColor: '#000000',
        pixelRatio: 2,
        filter: (node) => {
          // Exclude share/refresh buttons from the image
          if (node instanceof HTMLElement && node.dataset.excludeShare) return false;
          return true;
        },
      });
      // Try native share, fall back to download
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'nala-daily-brief.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Nala - Today's Brief" });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'nala-daily-brief.png';
        a.click();
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  // Compute top movers from portfolio
  const movers = (() => {
    if (!livePortfolio?.holdings || livePortfolio.holdings.length === 0) return { gainers: [], losers: [] };
    const sorted = [...livePortfolio.holdings]
      .filter(h => h.shares > 0 && h.dayChangePercent != null)
      .sort((a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0));
    return {
      gainers: sorted.filter(h => (h.dayChangePercent ?? 0) > 0).slice(0, 3),
      losers: sorted.filter(h => (h.dayChangePercent ?? 0) < 0).slice(-3).reverse().map(h => h),
    };
  })();
  // Re-sort losers worst first
  movers.losers.sort((a, b) => (a.dayChangePercent ?? 0) - (b.dayChangePercent ?? 0));

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto"
      role="dialog" aria-modal="true"
      style={{ display: hidden ? 'none' : undefined, WebkitOverflowScrolling: 'touch' }}
    >
      {/* Sticky top bar — safe-area padding lives here so content never leaks above */}
      <div className="sticky z-20 flex items-center justify-between px-6 py-3 bg-black" style={{ top: 0, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <div className="flex items-center gap-3" data-exclude-share="true">
          <button onClick={handleShare} disabled={sharing || loading} className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-rh-green transition-colors disabled:opacity-50">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            {sharing ? 'Saving...' : 'Share'}
          </button>
          <button onClick={handleRegenerate} disabled={regenerating} className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-rh-green transition-colors disabled:opacity-50">
            <svg className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {regenerating ? 'Generating...' : 'Refresh'}
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} className="w-3 h-3 accent-rh-green" />
            <span className="text-[11px] text-white/30">Don't show on startup</span>
          </label>
        </div>
      </div>

      <div ref={contentRef} className="max-w-[clamp(800px,60vw,1200px)] mx-auto px-6 pt-10 pb-10">
        {/* Loading state */}
        {loading && <BriefingLoader retryAttempt={retryAttempt} />}

        {/* Retries exhausted — friendly fallback */}
        {!loading && retriesExhausted && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rh-green/10 border border-rh-green/20 mb-6">
              <svg className="w-8 h-8 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2 text-center">Your daily brief is being prepared in the background</h2>
            <p className="text-sm text-white/40 mb-8 text-center max-w-sm">
              It'll be ready in a moment — try refreshing.
            </p>
            <button
              onClick={handleManualRefresh}
              className="px-8 py-3 bg-rh-green text-white font-semibold rounded-full hover:bg-rh-green/90 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        )}

        {/* Error state (should rarely hit — most errors auto-retry first) */}
        {!loading && error && !retriesExhausted && (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-3">Unable to load your daily report</h2>
            <p className="text-white/40 mb-6">Something went wrong fetching today's briefing.</p>
            <button onClick={handleManualRefresh} className="px-6 py-2.5 bg-rh-green text-white font-semibold rounded-full hover:bg-rh-green/90 transition-colors">Retry</button>
          </div>
        )}

        {/* Loaded state */}
        {!loading && !error && !retriesExhausted && data && (
          <>
            {/* Sample banner for new users */}
            {data.sample && (
              <div className="mb-6 px-5 py-4 rounded-xl bg-rh-green/10 border border-rh-green/20 text-center">
                <p className="text-sm font-semibold text-rh-green mb-1">Sample Brief</p>
                <p className="text-xs text-white/50">This is a preview of your daily brief. Add holdings to your portfolio to get a personalized report each morning.</p>
              </div>
            )}

            {/* Title + reading time */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Today's Brief</h1>
              <p className="text-sm text-rh-green mb-1">{formatDate(data.generatedAt)}</p>
              {!data.sample && <p className="text-[11px] text-white/30">{estimateReadingTime(data)} min read</p>}
            </div>

            {/* Key Market Metrics — glass: no borders, no background */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              {[
                { label: 'S&P 500', ticker: 'SPY' },
                { label: 'Nasdaq', ticker: 'QQQ' },
                { label: 'Dow', ticker: 'DIA' },
              ].map(({ label, ticker }) => {
                const q = indexQuotes[ticker];
                return (
                  <div key={ticker} className="cursor-pointer hover:bg-white/[0.02] transition-colors py-2 -mx-2 px-2 rounded-lg"
                    onClick={() => onTickerClick?.(ticker)}>
                    <p className="text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50 uppercase tracking-wider mb-1">{label}</p>
                    {q ? (
                      <>
                        <p className="text-xl font-bold text-rh-light-text dark:text-rh-text tabular-nums">${q.price.toFixed(2)}</p>
                        <p className={`text-sm font-semibold tabular-nums ${q.changePct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                          {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                        </p>
                      </>
                    ) : (
                      <div className="h-10 bg-white/[0.04] rounded animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>


            {/* Portfolio Snapshot — glass: no card, content floats */}
            {livePortfolio && (
              <div className="mb-10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/50 uppercase tracking-wider mb-1">Your Portfolio</p>
                    <p className="text-3xl font-bold text-rh-light-text dark:text-rh-text tabular-nums">{formatCurrency(livePortfolio.netEquity ?? livePortfolio.totalValue)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-extrabold tabular-nums ${livePortfolio.dayChange >= 0 ? 'text-rh-green profit-glow' : 'text-rh-red loss-glow'}`}>
                      {livePortfolio.dayChange >= 0 ? '+' : ''}{formatCurrency(livePortfolio.dayChange)}
                    </p>
                    <p className={`text-sm tabular-nums ${livePortfolio.dayChangePercent >= 0 ? 'text-rh-green/70' : 'text-rh-red/70'}`}>
                      {formatPct(livePortfolio.dayChangePercent)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-[12px]">
                  <span className="text-rh-light-muted/40 dark:text-rh-muted/40">Total Return</span>
                  <span className={`tabular-nums ${livePortfolio.totalPLPercent >= 0 ? 'text-rh-green/60' : 'text-rh-red/60'}`}>
                    {formatPct(livePortfolio.totalPLPercent)} ({livePortfolio.totalPL >= 0 ? '+' : ''}{formatCurrency(livePortfolio.totalPL)})
                  </span>
                </div>
              </div>
            )}

            {/* Top Movers — glass: no card backgrounds */}
            {(movers.gainers.length > 0 || movers.losers.length > 0) && (
              <div className="mb-10">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-1 h-4 rounded-full bg-rh-green flex-shrink-0" />
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-rh-light-text dark:text-rh-text">Top Movers</h3>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  {/* Gainers */}
                  <div className="space-y-0">
                    {movers.gainers.map(h => (
                      <button key={h.ticker} onClick={() => onTickerClick?.(h.ticker)}
                        className="w-full flex items-center justify-between py-2.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                        <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{h.ticker}</span>
                        <span className="text-sm font-bold tabular-nums text-rh-green">+{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                      </button>
                    ))}
                    {movers.gainers.length === 0 && <p className="text-[12px] text-rh-light-muted/40 dark:text-rh-muted/40 py-2">No gainers</p>}
                  </div>
                  {/* Losers */}
                  <div className="space-y-0">
                    {movers.losers.map(h => (
                      <button key={h.ticker} onClick={() => onTickerClick?.(h.ticker)}
                        className="w-full flex items-center justify-between py-2.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                        <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{h.ticker}</span>
                        <span className="text-sm font-bold tabular-nums text-rh-red">{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                      </button>
                    ))}
                    {movers.losers.length === 0 && <p className="text-[12px] text-rh-light-muted/40 dark:text-rh-muted/40 py-2">No losers</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Market Sentiment Gauge */}
            {sentiment && <SentimentGauge sentiment={sentiment} />}

            {/* Greeting / AI headline */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white leading-snug">{stripCitations(data.greeting)}</h2>
            </div>

            {/* Market Overview */}
            <Section title="Market Overview">
              <p className="text-[15px] text-white/80 leading-[1.8]">
                {renderWithPills(data.marketOverview, onTickerClick, liveQuotes)}
              </p>
            </Section>

            {/* Your Portfolio AI summary */}
            <Section title="Portfolio Analysis">
              <p className="text-[15px] text-white/80 leading-[1.8]">
                {renderWithPills(data.portfolioSummary, onTickerClick, liveQuotes)}
              </p>
            </Section>

            {/* S&P 500 Sector Performance Bars */}
            {heatmapSectors.length > 0 && (
              <Section title="S&P 500 Sectors">
                <SectorBars sectors={heatmapSectors} onTickerClick={onTickerClick} />
              </Section>
            )}

            {/* Economic Calendar */}
            {economicEvents.length > 0 && (
              <Section title="Economic Calendar">
                <div className="space-y-1">
                  {(() => {
                    // Group by date
                    const groups = new Map<string, EconomicCalendarEvent[]>();
                    for (const ev of economicEvents) {
                      const existing = groups.get(ev.date) || [];
                      existing.push(ev);
                      groups.set(ev.date, existing);
                    }
                    const today = new Date().toISOString().split('T')[0];
                    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                    return Array.from(groups.entries()).map(([date, events]) => {
                      const label = date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <div key={date} className="mb-3">
                          <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">{label}</div>
                          {events.map((ev, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 px-1">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.impact === 'high' ? 'bg-rh-red' : 'bg-amber-500/60'}`} />
                              <span className="text-[11px] text-white/40 w-16 flex-shrink-0">{ev.time || '--:--'}</span>
                              <span className="text-sm text-white/80 flex-1">{ev.event}</span>
                              {ev.estimate != null && (
                                <span className="text-[10px] text-white/30 flex-shrink-0">est: {ev.estimate}</span>
                              )}
                              {ev.previous != null && (
                                <span className="text-[10px] text-white/20 flex-shrink-0">prev: {ev.previous}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              </Section>
            )}

            {/* Top Stories */}
            <Section title="Top Stories">
              <div className="space-y-5">
                {data.topStories.map((story, i) => (
                  <div key={i}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        story.sentiment === 'positive' ? 'bg-rh-green'
                          : story.sentiment === 'negative' ? 'bg-rh-red' : 'bg-white/20'
                      }`} />
                      <div className="flex-1">
                        <h4 className="text-[15px] font-semibold text-white mb-1 leading-snug">
                          {renderWithPills(story.headline, onTickerClick, liveQuotes)}
                        </h4>
                        <p className="text-sm text-white/50 leading-relaxed">
                          {renderWithPills(story.body, onTickerClick, liveQuotes)}
                        </p>
                        {story.relatedTickers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {story.relatedTickers.map(ticker => (
                              <TickerPill key={ticker} ticker={ticker} quote={liveQuotes[ticker]} onClick={onTickerClick} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {i < data.topStories.length - 1 && <div className="border-t border-white/[0.03] mt-5" />}
                  </div>
                ))}
              </div>
            </Section>

            {/* Macro — same content as the old Macro tab */}
            {portfolioNewsData?.summary && (
              <Section title="Market Analysis">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[11px] font-semibold ${
                      portfolioNewsData.summary.sentiment === 'bullish' ? 'text-rh-green' :
                      portfolioNewsData.summary.sentiment === 'bearish' ? 'text-rh-red' :
                      portfolioNewsData.summary.sentiment === 'mixed' ? 'text-amber-500' :
                      'text-white/50'
                    }`}>
                      {portfolioNewsData.summary.sentiment === 'bullish' ? 'Bullish' :
                       portfolioNewsData.summary.sentiment === 'bearish' ? 'Bearish' :
                       portfolioNewsData.summary.sentiment === 'mixed' ? 'Mixed' : 'Neutral'}
                    </span>
                    <span className="text-[10px] text-white/20">Powered by NALA AI</span>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed mb-3">{portfolioNewsData.summary.overview}</p>
                  <p className="text-xs text-white/50 leading-relaxed mb-3">{portfolioNewsData.summary.portfolioImpact}</p>
                  <p className="text-xs text-white/40 leading-relaxed italic">{portfolioNewsData.summary.outlook}</p>
                </div>
              </Section>
            )}

            {/* In The News — same tracker as old Macro tab */}
            {portfolioNewsData && portfolioNewsData.items.length > 0 && (() => {
              const counts = new Map<string, number>();
              for (const item of portfolioNewsData.items) {
                for (const t of item.matchedTickers) counts.set(t, (counts.get(t) ?? 0) + 1);
              }
              const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
              if (sorted.length === 0) return null;
              const maxCount = sorted[0][1];
              return (
                <Section title="In The News">
                  <div className="space-y-2">
                    {sorted.map(([ticker, count]) => (
                      <button key={ticker} onClick={() => onTickerClick?.(ticker)} className="w-full flex items-center gap-3 group">
                        <span className="text-xs font-semibold text-white group-hover:text-rh-green transition-colors w-14 text-left tabular-nums">{ticker}</span>
                        <div className="flex-1 h-4 bg-white/[0.03] rounded-full overflow-hidden">
                          <div className="h-full bg-rh-green/40 rounded-full transition-all duration-500" style={{ width: `${Math.max((count / maxCount) * 100, 4)}%` }} />
                        </div>
                        <span className="text-[10px] font-medium tabular-nums text-white/30 w-6 text-right">{count}</span>
                      </button>
                    ))}
                  </div>
                </Section>
              );
            })()}

            {/* Earnings This Week — only if there are upcoming earnings */}
            {earnings.length > 0 && (
              <Section title="Earnings This Week">
                <div className="space-y-2">
                  {earnings.map(e => (
                    <button key={e.ticker} onClick={() => onTickerClick?.(e.ticker)}
                      className="w-full flex items-center justify-between py-3 hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span className="text-sm font-medium text-white">{e.ticker}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] text-white/50">
                          {e.daysUntil === 0 ? 'Today' : e.daysUntil === 1 ? 'Tomorrow' : `In ${e.daysUntil} days`}
                        </p>
                        {e.estimatedEPS != null && (
                          <p className="text-[11px] text-white/30 font-mono">Est. EPS ${e.estimatedEPS.toFixed(2)}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Dividends — only if ex-date is today */}
            {dividends.length > 0 && (
              <Section title="Ex-Dividend Today">
                <div className="space-y-2">
                  {dividends.map(d => (
                    <button key={d.id} onClick={() => onTickerClick?.(d.ticker)}
                      className="w-full flex items-center justify-between py-3 hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-rh-green" />
                        <span className="text-sm font-medium text-white">{d.ticker}</span>
                      </div>
                      <p className="text-[11px] text-white/30 font-mono">${d.amountPerShare.toFixed(4)}/share</p>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Watch Today */}
            <Section title="Watch Today">
              <div className="space-y-3">
                {data.watchToday.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-rh-green text-xs mt-1">-</span>
                    <p className="text-[15px] text-white/70 leading-relaxed">{renderWithPills(item, onTickerClick, liveQuotes)}</p>
                  </div>
                ))}
              </div>
            </Section>


            {/* Dismiss */}
            <div className="text-center pt-4 pb-10">
              <button onClick={onClose} className="px-10 py-3 bg-white/[0.06] text-white font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]">
                Continue to Portfolio
              </button>
              <p className="text-[11px] text-white/20 mt-3">Generated {timeAgo(new Date(data.generatedAt))}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
