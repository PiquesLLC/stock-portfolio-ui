import { useState, useRef, useEffect } from 'react';
import { askStockQuestion, StockQAResponse } from '../api';

const SUGGESTIONS = [
  'What are the biggest risks?',
  'How are earnings trending?',
  'Bull vs bear case',
  'Who are the main competitors?',
];

interface StockQAPanelProps {
  ticker: string;
}

export default function StockQAPanel({ ticker }: StockQAPanelProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<StockQAResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when ticker changes
  useEffect(() => {
    setQuestion('');
    setResponse(null);
    setError(null);
  }, [ticker]);

  const handleAsk = async (q?: string) => {
    const query = (q || question).trim();
    if (!query || loading) return;

    setLoading(true);
    setError(null);
    setQuestion(query);

    try {
      const data = await askStockQuestion(ticker, query);
      setResponse(data);
    } catch (err: any) {
      setError(err.message || 'Failed to get answer');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rh-green opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rh-green" />
        </span>
        <h3 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">
          Ask about {ticker}
        </h3>
      </div>

      {/* Suggestion chips */}
      {!response && !loading && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleAsk(s)}
              className="px-3 py-1.5 text-[11px] rounded-full
                bg-gray-50/60 dark:bg-white/[0.03]
                text-rh-light-muted/70 dark:text-white/30
                hover:text-rh-light-text dark:hover:text-white/60
                border border-gray-200/40 dark:border-white/[0.06]
                hover:border-rh-green/30 hover:shadow-md hover:shadow-green-500/5
                transition-all duration-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask anything about ${ticker}...`}
          disabled={loading}
          maxLength={500}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl
            bg-gray-50/80 dark:bg-white/[0.04]
            backdrop-blur-xl
            text-rh-light-text dark:text-white
            placeholder:text-rh-light-muted/40 dark:placeholder:text-white/20
            border border-gray-200/60 dark:border-white/[0.08]
            focus:border-rh-green/50 focus:shadow-lg focus:shadow-green-500/10
            focus:outline-none
            disabled:opacity-50
            transition-all duration-300"
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading || !question.trim()}
          className="px-4 py-2.5 rounded-xl font-medium
            bg-rh-green text-white
            shadow-lg shadow-green-500/25
            hover:shadow-xl hover:shadow-green-500/30 hover:scale-[1.02]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
            active:scale-[0.98]
            transition-all duration-200"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-rh-light-muted/60 dark:text-white/30">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-rh-green rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-rh-green rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-rh-green rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          Researching...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        (error.includes('upgrade_required') || error.includes('limit_reached')) ? (
          <div className="mt-4 p-4 rounded-xl bg-gray-50/80 dark:bg-white/[0.04] text-center">
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-2">Upgrade to Premium to ask AI questions about stocks.</p>
            <a
              href="#pricing"
              onClick={(e) => { e.preventDefault(); window.location.hash = '#pricing'; window.dispatchEvent(new HashChangeEvent('hashchange')); }}
              className="inline-block px-4 py-1.5 rounded-lg text-xs font-semibold bg-rh-green text-white hover:bg-rh-green/90 transition-colors"
            >
              Upgrade to Premium
            </a>
          </div>
        ) : (
          <div className="mt-4 text-sm text-rh-red">
            {error}
          </div>
        )
      )}

      {/* Answer */}
      {response && !loading && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50/60 dark:bg-white/[0.03] backdrop-blur-md rounded-xl border border-gray-200/30 dark:border-white/[0.05] p-4">
            <p className="text-[12px] leading-[1.6] text-rh-light-text/80 dark:text-white/60 whitespace-pre-wrap">
              {response.answer}
            </p>
          </div>

          {/* Citations */}
          {response.citations.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-rh-light-muted/40 dark:text-white/30 uppercase tracking-widest font-medium">Sources</span>
              {response.citations.slice(0, 5).map((url, i) => {
                let domain = '';
                try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = 'source'; }
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] px-2.5 py-1 rounded-lg
                      bg-gray-50/60 dark:bg-white/[0.03]
                      border border-gray-200/40 dark:border-white/[0.06]
                      text-rh-green/60 hover:text-rh-green hover:border-rh-green/30
                      transition-all duration-200"
                  >
                    {domain}
                  </a>
                );
              })}
            </div>
          )}

          {/* Clear / ask another */}
          <button
            onClick={() => { setResponse(null); setQuestion(''); inputRef.current?.focus(); }}
            className="text-[11px] font-medium text-rh-green/50 hover:text-rh-green transition-colors"
          >
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
