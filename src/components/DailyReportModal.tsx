import { useState, useEffect } from 'react';
import { getDailyReport } from '../api';
import { DailyReportResponse } from '../types';

interface DailyReportModalProps {
  onClose: () => void;
  onTickerClick?: (ticker: string) => void;
}

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
  return text.replace(/\[\d+\]|\[headlines?\]|\[sources?\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function DailyReportModal({ onClose, onTickerClick }: DailyReportModalProps) {
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(
    () => localStorage.getItem('dailyReportDisabled') === 'true'
  );

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

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Hide webkit scrollbar */}
      <style>{`.daily-report-scroll::-webkit-scrollbar { display: none; }`}</style>

      <div className="daily-report-scroll min-h-full">
        {/* Top bar */}
        <div className="sticky z-10 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-sm border-b border-white/[0.06]" style={{ top: 'env(safe-area-inset-top)' }}>
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-3">
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

        <div className="max-w-3xl mx-auto px-6 py-10">
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
                  {stripCitations(data.marketOverview)}
                </p>
              </div>

              <div className="border-t border-white/[0.08] mb-10" />

              {/* Your Portfolio */}
              <div className="mb-10">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rh-green mb-4">
                  Your Portfolio
                </h3>
                <p className="text-[15px] text-white/80 leading-[1.8]">
                  {stripCitations(data.portfolioSummary)}
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
                            {stripCitations(story.headline)}
                          </h4>
                          <p className="text-sm text-white/50 leading-relaxed">
                            {stripCitations(story.body)}
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
                      <span className="text-rh-green text-xs mt-1">{'--'}</span>
                      <p className="text-[15px] text-white/70 leading-relaxed">{stripCitations(item)}</p>
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
