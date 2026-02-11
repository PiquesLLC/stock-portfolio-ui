import { useState, useEffect, useRef } from 'react';
import { getDailyReport, regenerateDailyReport, getFastQuote } from '../api';
import { DailyReportResponse } from '../types';

interface DailyReportModalProps {
  onClose: () => void;
  onTickerClick?: (ticker: string) => void;
  hidden?: boolean;
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
  // Economic indicators / non-stock acronyms
  'CPI', 'GDP', 'PCE', 'PPI', 'PMI', 'ISM', 'FOMC', 'FED', 'SEC', 'IPO', 'ETF',
  'NYSE', 'YOY', 'QOQ', 'MOM', 'BPS', 'CEO', 'CFO', 'COO', 'CTO',
]);

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Strip Perplexity citation references like [1], [2], [headlines], [4] from text
function stripCitations(text: string): string {
  return text
    .replace(/\[\d+\]|\[headlines?\]|\[sources?\]|\[provided\]|\[portfolio[^\]]*\]/gi, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\/(?=[A-Z]{2,5}\b)/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Extract ticker symbols from text
function extractTickers(text: string): string[] {
  const matches = stripCitations(text).match(/\b[A-Z]{2,5}\b/g) || [];
  return [...new Set(matches.filter(t => !TICKER_BLACKLIST.has(t)))];
}

// Extract all tickers from the full report
function extractAllTickers(data: DailyReportResponse): string[] {
  const texts = [
    data.marketOverview,
    data.portfolioSummary,
    ...data.topStories.map(s => s.headline + ' ' + s.body),
    ...data.topStories.flatMap(s => s.relatedTickers),
    ...data.watchToday,
  ];
  const all = texts.flatMap(t => extractTickers(t));
  return [...new Set(all)];
}

type LiveQuotes = Record<string, { changePercent: number }>;

// Render text with inline clickable ticker symbols + live badges
function renderWithTickers(text: string, onClick?: (ticker: string) => void, quotes?: LiveQuotes): (string | JSX.Element)[] {
  const cleaned = stripCitations(text);
  const parts = cleaned.split(/\b([A-Z]{1,5})\b/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && !TICKER_BLACKLIST.has(part) && part.length >= 2) {
      const q = quotes?.[part];
      return (
        <span key={i} className="inline-flex items-baseline gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(part); }}
            className="text-white/90 font-medium underline decoration-white/20 underline-offset-2 hover:decoration-rh-green hover:text-rh-green transition-colors"
          >
            {part}
          </button>
          {q && (
            <span className={`text-[12px] font-mono font-medium ${q.changePercent >= 0 ? 'text-rh-green/80' : 'text-rh-red/80'}`}>
              {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(1)}%
            </span>
          )}
        </span>
      );
    }
    return part;
  });
}

export function DailyReportModal({ onClose, onTickerClick, hidden }: DailyReportModalProps) {
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(
    () => localStorage.getItem('dailyReportDisabled') === 'true'
  );
  const [liveQuotes, setLiveQuotes] = useState<LiveQuotes>({});
  const [regenerating, setRegenerating] = useState(false);
  const quotesFetchedRef = useRef(false);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Lock body scroll when modal is visible
  useEffect(() => {
    if (hidden) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [hidden]);

  // Fetch on mount
  const fetchReport = async () => {
    setLoading(true);
    setError(false);
    try {
      const report = await getDailyReport();
      setData(report);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setLiveQuotes({});
    quotesFetchedRef.current = false;
    try {
      const report = await regenerateDailyReport();
      setData(report);
    } catch {
      // fall back to existing data
    } finally {
      setRegenerating(false);
    }
  };

  // Fetch live quotes for all tickers mentioned in the article, refresh every 30s
  useEffect(() => {
    if (!data || hidden) return;
    const tickers = extractAllTickers(data);
    if (tickers.length === 0) return;

    const fetchQuotes = () => {
      tickers.forEach(ticker => {
        getFastQuote(ticker)
          .then(q => {
            setLiveQuotes(prev => ({ ...prev, [ticker]: { changePercent: q.changePercent } }));
          })
          .catch(() => {});
      });
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [data, hidden]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', display: hidden ? 'none' : undefined }}
    >
      <div className="h-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Top bar */}
        <div className="sticky z-10 flex items-center justify-between px-6 py-4 bg-black border-b border-white/[0.06]" style={{ top: 0 }}>
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-rh-green transition-colors disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {regenerating ? 'Generating...' : 'Refresh'}
            </button>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => {
                  setDontShowAgain(e.target.checked);
                  localStorage.setItem('dailyReportDisabled', e.target.checked ? 'true' : 'false');
                }}
                className="w-3 h-3 accent-rh-green"
              />
              <span className="text-[11px] text-white/30">Don't show on startup</span>
            </label>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 pt-16 pb-10">
          {/* Loading state */}
          {loading && (
            <div className="animate-pulse space-y-10">
              <div className="text-center">
                <div className="h-10 w-80 bg-white/[0.06] rounded mx-auto mb-3" />
                <div className="h-4 w-48 bg-white/[0.06] rounded mx-auto" />
              </div>
              <div className="border-t border-white/[0.06] pt-8">
                <div className="h-5 w-32 bg-white/[0.06] rounded mb-4" />
                <div className="space-y-3">
                  <div className="h-4 bg-white/[0.04] rounded w-full" />
                  <div className="h-4 bg-white/[0.04] rounded w-5/6" />
                  <div className="h-4 bg-white/[0.04] rounded w-4/6" />
                </div>
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="border-t border-white/[0.06] pt-8">
                  <div className="h-5 w-40 bg-white/[0.06] rounded mb-4" />
                  <div className="space-y-3">
                    <div className="h-4 bg-white/[0.04] rounded w-full" />
                    <div className="h-4 bg-white/[0.04] rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold text-white mb-3">
                Unable to load your daily report
              </h2>
              <p className="text-white/40 mb-6">
                Something went wrong fetching today's briefing.
              </p>
              <button
                onClick={fetchReport}
                className="px-6 py-2.5 bg-rh-green text-white font-semibold rounded-full hover:bg-rh-green/90 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loaded state */}
          {!loading && !error && data && (
            <>
              {/* Title */}
              <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
                  Today's Brief
                </h1>
                <p className="text-sm text-rh-green">
                  {formatDate(data.generatedAt)}
                </p>
              </div>

              {/* Greeting / headline */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold text-white leading-snug mb-6">
                  {stripCitations(data.greeting)}
                </h2>
                <div className="border-t border-white/[0.08]" />
              </div>

              {/* Market Overview */}
              <div className="mb-10">
                <p className="text-[15px] text-white/80 leading-[1.8]">
                  {renderWithTickers(data.marketOverview, onTickerClick, liveQuotes)}
                </p>
              </div>

              <div className="border-t border-white/[0.08] mb-10" />

              {/* Your Portfolio */}
              <div className="mb-10">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-green mb-4">
                  Your Portfolio
                </h3>
                <p className="text-[15px] text-white/80 leading-[1.8]">
                  {renderWithTickers(data.portfolioSummary, onTickerClick, liveQuotes)}
                </p>
              </div>

              <div className="border-t border-white/[0.08] mb-10" />

              {/* Top Stories */}
              <div className="mb-10">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 mb-6">
                  Top Stories
                </h3>
                <div className="space-y-6">
                  {data.topStories.map((story, i) => (
                    <div key={i} className="group">
                      <div className="flex items-start gap-4">
                        {/* Sentiment indicator */}
                        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          story.sentiment === 'positive'
                            ? 'bg-rh-green'
                            : story.sentiment === 'negative'
                              ? 'bg-rh-red'
                              : 'bg-white/20'
                        }`} />
                        <div className="flex-1">
                          <h4 className="text-[15px] font-semibold text-white mb-1 leading-snug">
                            {renderWithTickers(story.headline, onTickerClick, liveQuotes)}
                          </h4>
                          <p className="text-sm text-white/50 leading-relaxed">
                            {renderWithTickers(story.body, onTickerClick, liveQuotes)}
                          </p>
                          {story.relatedTickers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {story.relatedTickers.map(ticker => (
                                <button
                                  key={ticker}
                                  onClick={() => onTickerClick?.(ticker)}
                                  className="text-[11px] font-medium text-rh-green/80 hover:text-rh-green transition-colors"
                                >
                                  {ticker}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {i < data.topStories.length - 1 && (
                        <div className="border-t border-white/[0.04] mt-6" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/[0.08] mb-10" />

              {/* Watch Today */}
              <div className="mb-16">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 mb-6">
                  Watch Today
                </h3>
                <div className="space-y-4">
                  {data.watchToday.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-rh-green text-xs mt-1">{'–'}</span>
                      <p className="text-[15px] text-white/70 leading-relaxed">{renderWithTickers(item, onTickerClick, liveQuotes)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dismiss */}
              <div className="text-center pb-10">
                <button
                  onClick={onClose}
                  className="px-10 py-3 bg-white/[0.06] text-white font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
                >
                  Continue to Portfolio
                </button>
                <p className="text-[11px] text-white/20 mt-3">
                  Generated {getTimeAgo(new Date(data.generatedAt))}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
