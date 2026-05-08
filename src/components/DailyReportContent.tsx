// DailyReportContent — the canonical "Today's Brief" body, extracted from
// DailyReportModal so it can be reused inline (Insights tab) and inside the
// auto-popup modal. No modal chrome here: no fixed positioning, no backdrop,
// no portal, no close button. The wrapper provides all of that.
//
// Modes:
//   - Pass `report` to render given data (no fetch).
//   - Omit `report` to fetch + retry internally (canonical use).
//
// Slots:
//   - `headerSlot` — rendered above the title bar; modal uses this for the
//     sticky top bar (Back / Share / Refresh / Don't show again).
//   - `dismissSlot` — rendered at the bottom (e.g. modal's "Continue to
//     Portfolio" button). Inline usage omits this.
//
// Imperative handle exposes `regenerate()` so external chrome (modal top bar)
// can trigger the regenerate action without duplicating fetch state.

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  getDailyReport,
  regenerateDailyReport,
  getFastQuote,
  getSectorPerformance,
  getEarningsSummary,
  getUpcomingDividends,
  getMarketSentiment,
  getPortfolio,
  getEconomicCalendar,
  getPortfolioNews,
  EarningsSummaryItem,
  MarketSentiment,
  EconomicCalendarEvent,
  PortfolioNewsResponse,
} from '../api';
import { DailyReportResponse, Portfolio, HeatmapSector, DividendEvent } from '../types';
import { timeAgo } from '../utils/format';
import { useLocalStorage } from '../hooks/useLocalStorage';

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
  'SK', 'AI', 'EV', 'IV', 'PE', 'PB', 'PS', 'ET', 'AM', 'PM',
  'VIX', 'DXY', 'TNX', 'TLT', 'USD', 'EUR', 'GBP', 'JPY', 'CNY',
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
    ...(data.positionMoves || []).map(m => m.ticker),
    ...(data.positionMoves || []).map(m => m.reason),
    ...(data.questionsOfTheDay || []).map(q => q.answer),
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

function TickerPill({ ticker, onClick }: { ticker: string; quote?: { changePercent: number }; onClick?: (t: string) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(ticker); }}
      className="text-rh-light-text dark:text-white font-semibold hover:text-rh-green transition-colors"
    >
      {ticker}
    </button>
  );
}

function renderWithPills(text: string, onClick?: (ticker: string) => void, quotes?: LiveQuotes): (string | JSX.Element)[] {
  const cleaned = stripCitations(text);
  const parts = cleaned.split(/\b([A-Z]{1,5})\b/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && !TICKER_BLACKLIST.has(part) && part.length >= 2 && quotes?.[part]) {
      return <TickerPill key={i} ticker={part} quote={quotes?.[part]} onClick={onClick} />;
    }
    return part;
  });
}

const LOADING_STEPS = [
  { label: 'Scanning market data', icon: '1' },
  { label: 'Analyzing your portfolio', icon: '2' },
  { label: 'Reviewing top headlines', icon: '3' },
  { label: 'Writing your briefing', icon: '4' },
];

const MAX_RETRIES = 2;

function isValidReport(result: DailyReportResponse): boolean {
  // Accept any payload with a generatedAt timestamp. The v2 layout has many
  // independent sections (movers, sectors, earnings, F&G, position moves)
  // that render fine even when the AI editorial body is empty/sparse — better
  // to show the chrome with whatever loaded than to retry into a blank stub.
  return Boolean(result?.generatedAt);
}

function BriefingLoader({ retryAttempt }: { retryAttempt: number }) {
  const [activeStep, setActiveStep] = useState(0);
  const [typedText, setTypedText] = useState('');
  const fullText = LOADING_STEPS[activeStep]?.label || '';

  useEffect(() => { setActiveStep(0); }, [retryAttempt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTypedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i <= fullText.length) setTypedText(fullText.slice(0, i));
      else clearInterval(interval);
    }, 35);
    return () => clearInterval(interval);
  }, [activeStep, fullText]);

  const retryMessage = retryAttempt > 0
    ? `Still preparing... (attempt ${retryAttempt + 1} of ${MAX_RETRIES + 1})`
    : 'Preparing your daily brief...';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rh-green/10 border border-rh-green/20 mb-5">
          <svg className="w-8 h-8 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-rh-light-text dark:text-white mb-1">Preparing Your Brief</h2>
        <p className="text-sm text-rh-light-muted dark:text-white/30">{retryMessage}</p>
      </div>

      <div className="w-full max-w-xs space-y-3 mb-10">
        {LOADING_STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-15'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-500 ${
                isDone ? 'bg-rh-green/20 text-rh-green' : isActive ? 'bg-rh-green text-white dark:text-black' : 'bg-gray-200 dark:bg-white/[0.06] text-rh-light-muted dark:text-white/30'
              }`}>
                {isDone ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.icon}
              </div>
              <span className={`text-sm transition-all duration-500 ${isActive ? 'text-rh-light-text dark:text-white font-medium' : isDone ? 'text-rh-light-muted dark:text-white/50' : 'text-rh-light-muted/50 dark:text-white/30'}`}>
                {isActive ? typedText : step.label}
                {isActive && <span className="inline-block w-[2px] h-[14px] bg-rh-green ml-0.5 align-middle animate-pulse" />}
              </span>
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-xs">
        <div className="h-1 bg-gray-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rh-green/60 to-rh-green rounded-full transition-all duration-[3000ms] ease-linear"
            style={{ width: `${Math.min(95, ((activeStep + 1) / LOADING_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-[3px] h-[14px] rounded-sm bg-rh-green flex-shrink-0" />
        <h3 className="text-[11px] font-bold uppercase tracking-[1.2px] text-rh-light-muted dark:text-white/35">{title}</h3>
      </div>
      {children}
    </div>
  );
}

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

type IndexQuote = { price: number; changePct: number; change: number };

export interface DailyReportContentHandle {
  /** Trigger a regenerate of the brief from external chrome (e.g. modal top bar). */
  regenerate: () => Promise<void>;
  /** Manually refresh: clears state and re-fetches with retries. */
  refresh: () => void;
  /** True while a regenerate request is in flight. */
  isRegenerating: () => boolean;
}

export interface DailyReportContentProps {
  /** If passed, the component renders this report directly and skips fetching. */
  report?: DailyReportResponse | null;
  /** Optional click handler for ticker pills. */
  onTickerClick?: (ticker: string) => void;
  /** Optional dismiss button at the bottom (modal use). When omitted, no dismiss CTA. */
  dismissSlot?: React.ReactNode;
  /** Pause network activity while parent overlay is hidden. */
  paused?: boolean;
  /** Element to render above the title bar (sticky chrome in modal). */
  headerSlot?: React.ReactNode;
  /** Element to render below the dashboard strip but above the editorial sections. Used for nothing today; reserved. */
  beforeBodySlot?: React.ReactNode;
  /** Outer container className override. Defaults to centered max-width column. */
  className?: string;
}

export const DailyReportContent = forwardRef<DailyReportContentHandle, DailyReportContentProps>(function DailyReportContent(
  { report, onTickerClick, dismissSlot, paused = false, headerSlot, beforeBodySlot, className }: DailyReportContentProps,
  ref
) {
  const [data, setData] = useState<DailyReportResponse | null>(report ?? null);
  const [loading, setLoading] = useState(report ? false : true);
  const [error, setError] = useState(false);
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Treat external `report` prop changes as authoritative.
  useEffect(() => {
    if (report) {
      setData(report);
      setLoading(false);
      setError(false);
      setRetriesExhausted(false);
    }
  }, [report]);

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Fetch with auto-retry. Skipped when `report` is passed externally.
  const fetchReport = useCallback(async (attempt = 0) => {
    if (report) return;
    setLoading(true);
    setError(false);
    setRetriesExhausted(false);
    setRetryAttempt(attempt);
    try {
      const result = await withTimeout(getDailyReport(), 15000, 'daily report');
      if (isValidReport(result)) {
        setData(result);
        setLoading(false);
        return;
      }
      if (attempt < MAX_RETRIES) {
        retryTimerRef.current = setTimeout(() => fetchReport(attempt + 1), 3000);
        return;
      }
      setLoading(false);
      setRetriesExhausted(true);
    } catch {
      if (attempt < MAX_RETRIES) {
        retryTimerRef.current = setTimeout(() => fetchReport(attempt + 1), 3000);
        return;
      }
      setLoading(false);
      setRetriesExhausted(true);
    }
  }, [report]);

  const handleManualRefresh = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setData(null);
    setRetriesExhausted(false);
    fetchReport(0);
  }, [fetchReport]);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    setLiveQuotes({});
    try { setData(await regenerateDailyReport()); }
    catch { /* keep existing data */ }
    finally { setRegenerating(false); }
  }, []);

  useImperativeHandle(ref, () => ({
    regenerate: handleRegenerate,
    refresh: handleManualRefresh,
    isRegenerating: () => regenerating,
  }), [handleRegenerate, handleManualRefresh, regenerating]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Supplementary data
  useEffect(() => {
    if (paused) return;
    getEarningsSummary().then(r => {
      setEarnings(r.results.filter(e => e.daysUntil >= 0 && e.daysUntil <= 7));
    }).catch(() => {});
    getUpcomingDividends().then(divs => {
      const today = new Date().toDateString();
      setDividends(divs.filter(d => new Date(d.exDate).toDateString() === today));
    }).catch(() => {});
    getEconomicCalendar().then(r => setEconomicEvents(r.events || [])).catch(() => {});
    getPortfolioNews(40).then(setPortfolioNewsData).catch(() => {});
  }, [paused]);

  // Index quotes + portfolio refresh every 30s
  useEffect(() => {
    if (paused) return;
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
  }, [paused]);

  // Heavy data: sectors, sentiment
  useEffect(() => {
    if (paused) return;
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
  }, [paused, setCachedSectors, setCachedSentiment]);

  // Live quotes for mentioned tickers, every 30s
  useEffect(() => {
    if (!data || paused) return;
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
  }, [data, paused]);

  type HoldingArr = NonNullable<Portfolio['holdings']>;
  const movers = (() => {
    if (!livePortfolio?.holdings || livePortfolio.holdings.length === 0) return { gainers: [] as HoldingArr, losers: [] as HoldingArr };
    const sorted = [...livePortfolio.holdings]
      .filter(h => h.shares > 0 && h.dayChangePercent != null)
      .sort((a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0));
    return {
      gainers: sorted.filter(h => (h.dayChangePercent ?? 0) > 0).slice(0, 3),
      losers: sorted.filter(h => (h.dayChangePercent ?? 0) < 0).slice(-3).reverse().map(h => h),
    };
  })();
  movers.losers.sort((a, b) => (a.dayChangePercent ?? 0) - (b.dayChangePercent ?? 0));

  const containerClass = className ?? 'max-w-[clamp(800px,60vw,1200px)] mx-auto px-6 pt-10 pb-10';

  return (
    <>
      {headerSlot}
      <div className={containerClass}>
        {loading && <BriefingLoader retryAttempt={retryAttempt} />}

        {!loading && retriesExhausted && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rh-green/10 border border-rh-green/20 mb-6">
              <svg className="w-8 h-8 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-rh-light-text dark:text-white mb-2 text-center">Your daily brief is being prepared in the background</h2>
            <p className="text-sm text-rh-light-muted dark:text-white/40 mb-8 text-center max-w-sm">
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

        {!loading && error && !retriesExhausted && (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-rh-light-text dark:text-white mb-3">Unable to load your daily report</h2>
            <p className="text-rh-light-muted dark:text-white/40 mb-6">Something went wrong fetching today's briefing.</p>
            <button onClick={handleManualRefresh} className="px-6 py-2.5 bg-rh-green text-white font-semibold rounded-full hover:bg-rh-green/90 transition-colors">Retry</button>
          </div>
        )}

        {!loading && !error && !retriesExhausted && data && (
          <>
            {data.sample && (
              <div className="mb-6 px-5 py-4 rounded-xl bg-rh-green/10 border border-rh-green/20 text-center">
                <p className="text-sm font-semibold text-rh-green mb-1">Sample Brief</p>
                <p className="text-xs text-rh-light-muted dark:text-white/50">This is a preview of your daily brief. Add holdings to your portfolio to get a personalized report each morning.</p>
              </div>
            )}

            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-rh-light-text dark:text-white tracking-tight mb-1">Today's Brief</h1>
              <p className="text-sm text-rh-green mb-1">{formatDate(data.generatedAt)}</p>
              {!data.sample && <p className="text-[11px] text-rh-light-muted dark:text-white/30">{estimateReadingTime(data)} min read</p>}
            </div>

            {beforeBodySlot}

            {/* Dashboard Strip */}
            <div className="border-b border-gray-200/60 dark:border-white/[0.06] pb-4 mb-6">
              <div className="hidden md:flex items-center">
                {livePortfolio && (
                  <div className="flex-[1.6] text-center border-r border-gray-200/60 dark:border-white/[0.06] px-3 py-2">
                    <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">Your Portfolio</p>
                    <p className="text-2xl font-bold text-rh-light-text dark:text-white tabular-nums">{formatCurrency(livePortfolio.netEquity ?? livePortfolio.totalValue)}</p>
                    <p className={`text-sm font-semibold tabular-nums ${livePortfolio.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {livePortfolio.dayChange >= 0 ? '+' : ''}{formatCurrency(livePortfolio.dayChange)} ({formatPct(livePortfolio.dayChangePercent)})
                    </p>
                    <p className="text-[10px] tabular-nums mt-0.5 text-rh-light-muted dark:text-white/30">
                      Total Return: {formatPct(livePortfolio.totalPLPercent)} ({livePortfolio.totalPL >= 0 ? '+' : ''}{formatCurrency(livePortfolio.totalPL)})
                    </p>
                  </div>
                )}
                {[
                  { label: 'S&P 500', ticker: 'SPY' },
                  { label: 'Nasdaq', ticker: 'QQQ' },
                  { label: 'Dow', ticker: 'DIA' },
                ].map(({ label, ticker }) => {
                  const q = indexQuotes[ticker];
                  return (
                    <div key={ticker} className="flex-1 text-center border-r border-gray-200/60 dark:border-white/[0.06] last:border-r-0 px-3 py-2 cursor-pointer hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
                      onClick={() => onTickerClick?.(ticker)}>
                      <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">{label}</p>
                      {q ? (
                        <>
                          <p className="text-lg font-bold text-rh-light-text dark:text-white tabular-nums">${q.price.toFixed(2)}</p>
                          <p className={`text-xs font-semibold tabular-nums ${q.changePct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                            {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                          </p>
                        </>
                      ) : (
                        <div className="h-10 bg-gray-100 dark:bg-white/[0.04] rounded animate-pulse" />
                      )}
                    </div>
                  );
                })}
                {sentiment && (
                  <div className="flex-1 text-center border-l border-gray-200/60 dark:border-white/[0.06] px-3 py-2">
                    <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">Fear & Greed</p>
                    <p className="text-2xl font-extrabold tabular-nums" style={{ color: sentiment.score <= 25 ? '#ef4444' : sentiment.score < 42 ? '#f97316' : sentiment.score <= 58 ? '#a3a3a3' : sentiment.score <= 75 ? '#84cc16' : '#22c55e' }}>{sentiment.score}</p>
                    <p className="text-[10px] font-semibold" style={{ color: sentiment.score <= 25 ? '#ef4444' : sentiment.score < 42 ? '#f97316' : sentiment.score <= 58 ? '#a3a3a3' : sentiment.score <= 75 ? '#84cc16' : '#22c55e' }}>{sentiment.label}</p>
                  </div>
                )}
              </div>
              <div className="md:hidden">
                {livePortfolio && (
                  <div className="text-center pb-3 mb-3 border-b border-gray-200/60 dark:border-white/[0.06]">
                    <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">Your Portfolio</p>
                    <p className="text-2xl font-bold text-rh-light-text dark:text-white tabular-nums">{formatCurrency(livePortfolio.netEquity ?? livePortfolio.totalValue)}</p>
                    <p className={`text-sm font-semibold tabular-nums ${livePortfolio.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {livePortfolio.dayChange >= 0 ? '+' : ''}{formatCurrency(livePortfolio.dayChange)} ({formatPct(livePortfolio.dayChangePercent)})
                    </p>
                    <p className="text-[10px] tabular-nums mt-0.5 text-rh-light-muted dark:text-white/30">
                      Total Return: {formatPct(livePortfolio.totalPLPercent)} ({livePortfolio.totalPL >= 0 ? '+' : ''}{formatCurrency(livePortfolio.totalPL)})
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-0">
                  {[
                    { label: 'S&P 500', ticker: 'SPY' },
                    { label: 'Nasdaq', ticker: 'QQQ' },
                    { label: 'Dow', ticker: 'DIA' },
                  ].map(({ label, ticker }) => {
                    const q = indexQuotes[ticker];
                    return (
                      <div key={ticker} className="text-center py-2 px-2 cursor-pointer hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
                        onClick={() => onTickerClick?.(ticker)}>
                        <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">{label}</p>
                        {q ? (
                          <>
                            <p className="text-base font-bold text-rh-light-text dark:text-white tabular-nums">${q.price.toFixed(2)}</p>
                            <p className={`text-xs font-semibold tabular-nums ${q.changePct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                              {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                            </p>
                          </>
                        ) : (
                          <div className="h-8 bg-gray-100 dark:bg-white/[0.04] rounded animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>
                {sentiment && (
                  <div className="text-center pt-3 mt-3 border-t border-gray-200/60 dark:border-white/[0.04]">
                    <p className="text-[10px] font-medium text-rh-light-muted dark:text-white/35 uppercase tracking-wider mb-1">Fear & Greed</p>
                    <p className="text-xl font-extrabold tabular-nums" style={{ color: sentiment.score <= 25 ? '#ef4444' : sentiment.score < 42 ? '#f97316' : sentiment.score <= 58 ? '#a3a3a3' : sentiment.score <= 75 ? '#84cc16' : '#22c55e' }}>{sentiment.score}</p>
                    <p className="text-[10px] font-semibold" style={{ color: sentiment.score <= 25 ? '#ef4444' : sentiment.score < 42 ? '#f97316' : sentiment.score <= 58 ? '#a3a3a3' : sentiment.score <= 75 ? '#84cc16' : '#22c55e' }}>{sentiment.label}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-4 md:gap-8">
              <div>
                {data.greeting && data.greeting.trim().length > 0 && (
                  <div className="mb-6">
                    <h2 className="text-[22px] font-bold text-rh-light-text dark:text-white leading-snug">{stripCitations(data.greeting)}</h2>
                  </div>
                )}

                {data.marketOverview && data.marketOverview.trim().length > 0 && (
                  <Section title="Market Overview">
                    <p className="text-[14px] text-rh-light-text/80 dark:text-white/75 leading-[1.8]">
                      {renderWithPills(data.marketOverview, onTickerClick, liveQuotes)}
                    </p>
                  </Section>
                )}

                {data.portfolioSummary && data.portfolioSummary.trim().length > 0 && (
                  <Section title="Portfolio Analysis">
                    <p className="text-[14px] text-rh-light-text/80 dark:text-white/75 leading-[1.8]">
                      {renderWithPills(data.portfolioSummary, onTickerClick, liveQuotes)}
                    </p>
                  </Section>
                )}

                {portfolioNewsData?.summary && (
                  <Section title="Market Analysis">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[11px] font-semibold ${
                          portfolioNewsData.summary.sentiment === 'bullish' ? 'text-rh-green' :
                          portfolioNewsData.summary.sentiment === 'bearish' ? 'text-rh-red' :
                          portfolioNewsData.summary.sentiment === 'mixed' ? 'text-amber-500' :
                          'text-rh-light-muted dark:text-white/50'
                        }`}>
                          {portfolioNewsData.summary.sentiment === 'bullish' ? 'Bullish' :
                           portfolioNewsData.summary.sentiment === 'bearish' ? 'Bearish' :
                           portfolioNewsData.summary.sentiment === 'mixed' ? 'Mixed' : 'Neutral'}
                        </span>
                        <span className="text-[10px] text-rh-light-muted/70 dark:text-white/20">Powered by NALA AI</span>
                      </div>
                      <p className="text-sm text-rh-light-text dark:text-white/80 leading-relaxed mb-3">{stripCitations(portfolioNewsData.summary.overview)}</p>
                      <p className="text-xs text-rh-light-muted dark:text-white/50 leading-relaxed mb-3">{stripCitations(portfolioNewsData.summary.portfolioImpact)}</p>
                      <p className="text-xs text-rh-light-muted/70 dark:text-white/40 leading-relaxed italic">{stripCitations(portfolioNewsData.summary.outlook)}</p>
                    </div>
                  </Section>
                )}

                {data.topStories && data.topStories.length > 0 && (
                  <Section title="Top Stories">
                    <div className="space-y-5">
                      {data.topStories.map((story, i) => (
                      <div key={i}>
                        <div className="flex items-start gap-3">
                          <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                            story.sentiment === 'positive' ? 'bg-rh-green'
                              : story.sentiment === 'negative' ? 'bg-rh-red' : 'bg-gray-300 dark:bg-white/20'
                          }`} />
                          <div className="flex-1">
                            <h4 className="text-[15px] font-semibold text-rh-light-text dark:text-white mb-1 leading-snug">
                              {renderWithPills(story.headline, onTickerClick, liveQuotes)}
                            </h4>
                            <p className="text-sm text-rh-light-muted dark:text-white/50 leading-relaxed">
                              {renderWithPills(story.body, onTickerClick, liveQuotes)}
                            </p>
                          </div>
                        </div>
                          {i < data.topStories.length - 1 && <div className="border-t border-gray-200/60 dark:border-white/[0.03] mt-5" />}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              <div className="-mt-2 md:mt-0">
                {(movers.gainers.length > 0 || movers.losers.length > 0) && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">Top Movers</div>
                    {movers.gainers.map(h => (
                      <button key={h.ticker} onClick={() => onTickerClick?.(h.ticker)}
                        className="w-full flex items-center justify-between py-1.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-semibold text-rh-light-text dark:text-white">{h.ticker}</span>
                        <span className="text-[13px] font-bold tabular-nums text-rh-green">+{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                      </button>
                    ))}
                    {movers.gainers.length > 0 && movers.losers.length > 0 && <div className="h-2" />}
                    {movers.losers.map(h => (
                      <button key={h.ticker} onClick={() => onTickerClick?.(h.ticker)}
                        className="w-full flex items-center justify-between py-1.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-semibold text-rh-light-text dark:text-white">{h.ticker}</span>
                        <span className="text-[13px] font-bold tabular-nums text-rh-red">{(h.dayChangePercent ?? 0).toFixed(1)}%</span>
                      </button>
                    ))}
                  </div>
                )}

                {heatmapSectors.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">S&P 500 Sectors</div>
                    {[...heatmapSectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent).map(s => {
                      const pct = s.avgChangePercent;
                      const isPositive = pct >= 0;
                      const etf = SECTOR_ETF_MAP[s.name];
                      return (
                        <button key={s.name} className="w-full flex items-center justify-between py-1.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors"
                          onClick={() => etf && onTickerClick?.(etf)}>
                          <span className="text-[13px] font-semibold text-rh-light-text dark:text-white">{s.name}</span>
                          <span className={`text-[13px] font-bold tabular-nums ${isPositive ? 'text-rh-green' : 'text-rh-red'}`}>
                            {isPositive ? '+' : ''}{pct.toFixed(2)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {data.positionMoves && data.positionMoves.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">Why Positions Moved</div>
                    {data.positionMoves.map((move, i) => (
                      <div key={i} className="py-2 border-b border-gray-200/60 dark:border-white/[0.04] last:border-b-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button onClick={() => onTickerClick?.(move.ticker)} className="text-[13px] font-bold text-rh-light-text dark:text-white hover:text-rh-green transition-colors">{move.ticker}</button>
                          <span className={`text-[12px] font-bold tabular-nums ${move.changePercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                            {move.changePercent >= 0 ? '+' : ''}{move.changePercent.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-rh-light-muted dark:text-white/45 leading-snug">{renderWithPills(move.reason, onTickerClick, liveQuotes)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {data.watchToday.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">Watch Today</div>
                    {data.watchToday.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1.5">
                        <span className="text-rh-green text-sm mt-0 shrink-0">›</span>
                        <p className="text-[12px] text-rh-light-text/80 dark:text-white/60 leading-relaxed">{renderWithPills(item, onTickerClick, liveQuotes)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {earnings.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">Earnings This Week</div>
                    {earnings.map(e => (
                      <button key={e.ticker} onClick={() => onTickerClick?.(e.ticker)}
                        className="w-full flex items-center justify-between py-1.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-semibold text-rh-light-text dark:text-white">{e.ticker}</span>
                        <span className="text-[11px] text-rh-light-muted dark:text-white/35">
                          {e.daysUntil === 0 ? 'Today' : e.daysUntil === 1 ? 'Tomorrow' : `In ${e.daysUntil}d`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {dividends.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rh-light-muted dark:text-white/30 pb-2 mb-2 border-b border-gray-200/60 dark:border-white/[0.06]">Ex-Dividend Today</div>
                    {dividends.map(d => (
                      <button key={d.id} onClick={() => onTickerClick?.(d.ticker)}
                        className="w-full flex items-center justify-between py-1.5 hover:bg-gray-100/40 dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-semibold text-rh-light-text dark:text-white">{d.ticker}</span>
                        <span className="text-[11px] text-rh-light-muted dark:text-white/30 font-mono">${d.amountPerShare.toFixed(4)}/share</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {data.questionsOfTheDay && data.questionsOfTheDay.length > 0 && (
              <Section title="Questions of the Day">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.questionsOfTheDay.map((q, i) => (
                    <div key={i}>
                      <h4 className="text-[14px] font-semibold text-rh-light-text dark:text-white mb-2 leading-snug">{q.question}</h4>
                      <p className="text-[13px] text-rh-light-muted dark:text-white/50 leading-relaxed">{renderWithPills(q.answer, onTickerClick, liveQuotes)}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {economicEvents.length > 0 && (() => {
              const now = new Date();
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
              const dayOfWeek = now.getDay();
              const daysUntilFri = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
              const friday = new Date(now); friday.setDate(friday.getDate() + daysUntilFri);
              const endOfWeekStr = `${friday.getFullYear()}-${String(friday.getMonth() + 1).padStart(2, '0')}-${String(friday.getDate()).padStart(2, '0')}`;
              const futureEvents = economicEvents.filter(ev => ev.date >= todayStr && ev.date <= endOfWeekStr);
              if (futureEvents.length === 0) return null;
              const groups = new Map<string, EconomicCalendarEvent[]>();
              for (const ev of futureEvents) {
                const existing = groups.get(ev.date) || [];
                existing.push(ev);
                groups.set(ev.date, existing);
              }
              return (
                <Section title="Economic Calendar">
                  <div className="space-y-1">
                    {Array.from(groups.entries()).map(([date, events]) => {
                      const label = date === todayStr ? 'Today' : date === tomorrowStr ? 'Tomorrow' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <div key={date} className="mb-3">
                          <div className="text-[10px] font-semibold text-rh-light-muted dark:text-white/30 uppercase tracking-wider mb-1.5">{label}</div>
                          {events.map((ev, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 px-1">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.impact === 'high' ? 'bg-rh-red' : 'bg-amber-500/60'}`} />
                              <span className="text-[11px] text-rh-light-muted dark:text-white/40 w-16 flex-shrink-0">{ev.time || '--:--'}</span>
                              <span className="text-sm text-rh-light-text dark:text-white/80 flex-1">{ev.event}</span>
                              {ev.estimate != null && (
                                <span className="text-[10px] text-rh-light-muted dark:text-white/30 flex-shrink-0">est: {ev.estimate}</span>
                              )}
                              {ev.previous != null && (
                                <span className="text-[10px] text-rh-light-muted/70 dark:text-white/20 flex-shrink-0">prev: {ev.previous}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              );
            })()}

            {dismissSlot && (
              <div className="text-center pt-4 pb-10">
                {dismissSlot}
                <p className="text-[11px] text-rh-light-muted/70 dark:text-white/20 mt-3">Generated {timeAgo(new Date(data.generatedAt))}</p>
              </div>
            )}
            {!dismissSlot && (
              <div className="text-center pt-4 pb-2">
                <p className="text-[11px] text-rh-light-muted/70 dark:text-white/20">Generated {timeAgo(new Date(data.generatedAt))}</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
});
