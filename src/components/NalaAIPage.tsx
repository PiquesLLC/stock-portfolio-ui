import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { askNala, getNalaSuggestions, NalaResearchResponse, NalaSuggestion } from '../api';
import NalaStockCard from './NalaStockCard';

interface NalaAIPageProps {
  onTickerClick?: (ticker: string) => void;
}

const RISK_BADGE: Record<string, string> = {
  conservative: 'from-green-400/20 to-emerald-400/20 text-green-400 border-green-400/20',
  moderate: 'from-yellow-400/20 to-amber-400/20 text-yellow-400 border-yellow-400/20',
  aggressive: 'from-orange-400/20 to-red-400/20 text-orange-400 border-orange-400/20',
};

export default function NalaAIPage({ onTickerClick }: NalaAIPageProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<NalaResearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<NalaSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getNalaSuggestions()
      .then(data => setSuggestions(data.suggestions))
      .catch(() => {});
  }, []);

  const handleAsk = async (q?: string) => {
    const query = (q || question).trim();
    if (!query || query.length < 5 || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setQuestion(query);

    try {
      const data = await askNala(query, controller.signal);
      setResponse(data);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to get research results');
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleReset = () => {
    setResponse(null);
    setQuestion('');
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-4"
      >
        <motion.div
          whileHover={{
            scale: 1.18,
            rotate: -10,
            transition: { type: 'spring', stiffness: 400, damping: 12 },
          }}
          whileTap={{ scale: 0.92 }}
          className="w-11 h-11 rounded-2xl overflow-hidden cursor-pointer
            shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-400/50
            transition-shadow duration-300"
        >
          <img src="/north-signal-logo.png" alt="Nala" className="w-full h-full object-cover" />
        </motion.div>
        <div>
          <h1 className="text-xl font-bold tracking-tighter text-rh-light-text dark:text-white">Ask Nala AI</h1>
          <p className="text-xs text-rh-light-muted/60 dark:text-white/30 tracking-wide">AI-powered stock research using real financial data</p>
        </div>
      </motion.div>

      {/* Search bar with orbital hub */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex items-center gap-3 max-w-3xl"
      >
        {/* Orbital hub — always visible, reacts to loading state */}
        <div className="relative w-8 h-8 flex-shrink-0">
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`rounded-full transition-all duration-500 ${
              loading
                ? 'w-2 h-2 bg-rh-green/40'
                : 'w-1 h-1 bg-rh-green/15 twinkle-glow'
            }`} />
          </div>
          {/* 3 orbiting stars */}
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                animation: loading
                  ? 'nala-orbit-fast 1.6s linear infinite'
                  : 'nala-orbit-idle 8s linear infinite',
                animationDelay: `${-i * (loading ? 0.53 : 2.67)}s`,
                transition: 'animation-duration 0.6s ease',
              }}
            >
              <span
                className="block rounded-full transition-all duration-500"
                style={{
                  width: loading ? '5px' : '3px',
                  height: loading ? '5px' : '3px',
                  backgroundColor: '#00C805',
                  opacity: loading ? 1 - i * 0.25 : 0.3 - i * 0.08,
                  boxShadow: loading
                    ? `0 0 10px 3px rgba(0, 200, 5, ${0.4 - i * 0.12})`
                    : `0 0 4px 1px rgba(0, 200, 5, ${0.15 - i * 0.04})`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Input line */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about investing..."
            disabled={loading}
            maxLength={500}
            className="w-full px-1 py-3 text-lg bg-transparent
              text-rh-light-text dark:text-white
              placeholder:text-rh-light-muted/30 dark:placeholder:text-white/15
              border-b border-white/[0.12]
              focus:border-b-2 focus:border-rh-green focus:shadow-[0_2px_15px_-3px_rgba(0,200,5,0.4)]
              focus:outline-none
              disabled:opacity-50
              transition-all duration-300"
          />
        </div>

        {/* Submit — glow border button */}
        <button
          onClick={() => handleAsk()}
          disabled={loading || question.trim().length < 5}
          className="px-4 py-3 rounded-xl font-medium
            bg-transparent border border-rh-green/50
            text-rh-green
            hover:border-rh-green hover:text-white
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-rh-green/50
            active:scale-[0.96]
            transition-all duration-200"
          style={{
            animation: !loading && question.trim().length >= 5
              ? 'nala-glow-pulse 2.5s ease-in-out infinite'
              : 'none',
          }}
        >
          {loading ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      </motion.div>

      {/* Suggestion chips */}
      {!response && !loading && suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-wrap gap-2"
        >
          {suggestions.map((s, i) => (
            <motion.button
              key={s.text}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.04 }}
              whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleAsk(s.text)}
              className="px-3.5 py-2 text-xs rounded-xl
                bg-white/[0.03] dark:bg-white/[0.03] bg-gray-50/60
                backdrop-blur-md
                text-rh-light-muted/80 dark:text-white/40 hover:text-rh-light-text dark:hover:text-white/70
                border border-white/[0.06] dark:border-white/[0.06] border-gray-200/40
                hover:border-rh-green/30 hover:shadow-md hover:shadow-green-500/10
                transition-all duration-200"
            >
              <span className="mr-1.5">{s.icon}</span>
              {s.text}
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Loading state */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/[0.03] dark:bg-white/[0.03] bg-gray-50/60 backdrop-blur-[30px] rounded-[20px] border border-white/[0.08] dark:border-white/[0.08] border-gray-200/40 p-10 text-center"
          >
            {/* Orbital data trails */}
            <div className="relative w-16 h-16 mx-auto mb-4">
              {/* Center glow */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-rh-green/20 twinkle-glow" />
              </div>
              {/* Orbiting stars */}
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="absolute inset-0"
                  style={{
                    animation: 'nala-orbit 2.4s linear infinite',
                    animationDelay: `${-i * 0.8}s`,
                  }}
                >
                  <span
                    className="block w-2 h-2 rounded-full bg-rh-green"
                    style={{
                      opacity: 1 - i * 0.3,
                      boxShadow: `0 0 8px 2px rgba(0, 200, 5, ${0.3 - i * 0.1})`,
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="font-mono text-sm font-medium text-rh-green">
              Researching...
            </p>
            <p className="font-mono text-[11px] text-rh-light-muted/40 dark:text-white/20 mt-1">This may take 15-30 seconds</p>
            <button
              onClick={handleStop}
              className="mt-4 text-[11px] font-medium px-3 py-1 rounded-lg
                bg-transparent border border-white/[0.1]
                text-rh-light-muted/50 dark:text-white/30
                hover:text-rh-red hover:border-rh-red/40
                transition-all duration-200"
            >
              Stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/[0.05] backdrop-blur-[30px] rounded-[20px] border border-red-500/20 p-6"
          >
            <p className="text-sm text-red-400 mb-2">{error}</p>
            <button onClick={() => handleAsk()} className="text-xs text-rh-green hover:text-rh-green/80 transition-colors">
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {response && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Strategy banner */}
            {response.strategy && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="bg-white/[0.03] dark:bg-white/[0.03] bg-gray-50/60 backdrop-blur-[30px] rounded-[20px] border border-white/[0.08] dark:border-white/[0.08] border-gray-200/40 p-5 flex items-center gap-4"
              >
                <span className="text-3xl">{response.strategy.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white">
                      {response.strategy.name}
                    </h3>
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-gradient-to-r border ${RISK_BADGE[response.strategy.riskLevel] || ''}`}>
                      {response.strategy.riskLevel}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-rh-light-muted/60 dark:text-white/35 leading-relaxed">
                    {response.strategy.description}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Strategy explanation */}
            {response.strategyExplanation && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="font-mono text-sm text-rh-light-muted/70 dark:text-white/35 px-1 leading-relaxed"
              >
                {response.strategyExplanation}
              </motion.p>
            )}

            {/* Stock cards grid */}
            {response.stocks.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {response.stocks.map((stock, i) => (
                  <NalaStockCard
                    key={stock.ticker}
                    stock={stock}
                    rank={i + 1}
                    index={i}
                    onTickerClick={onTickerClick}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.03] dark:bg-white/[0.03] bg-gray-50/60 backdrop-blur-[30px] rounded-[20px] border border-white/[0.08] dark:border-white/[0.08] border-gray-200/40 p-10 text-center">
                <p className="text-sm text-rh-light-muted/60 dark:text-white/30">
                  No matching stocks found. Try rephrasing your question.
                </p>
              </div>
            )}

            {/* Citations — pill style */}
            {response.citations.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap items-center gap-2 px-1"
              >
                <span className="font-mono text-[10px] text-rh-light-muted/30 dark:text-white/15 uppercase tracking-widest font-medium">Sources</span>
                {response.citations.slice(0, 6).map((url, i) => {
                  let domain = '';
                  try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = 'source'; }
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] px-2.5 py-1 rounded-lg
                        bg-white/[0.03] dark:bg-white/[0.03] bg-gray-50/60
                        border border-white/[0.06] dark:border-white/[0.06] border-gray-200/40
                        text-rh-green/60 hover:text-rh-green hover:border-rh-green/30
                        transition-all duration-200"
                    >
                      {domain}
                    </a>
                  );
                })}
              </motion.div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] text-rh-light-muted/30 dark:text-white/15">
                Powered by AI {response.cached ? '(cached)' : ''}
              </span>
              <button
                onClick={handleReset}
                className="text-[11px] font-medium px-3 py-1 rounded-lg
                  bg-transparent border border-rh-green/30
                  text-rh-green/60 hover:text-rh-green hover:border-rh-green/60
                  transition-all duration-200"
                style={{ animation: 'nala-glow-pulse 3s ease-in-out infinite' }}
              >
                Ask another question
              </button>
            </div>

            {/* Disclaimer */}
            <p className="font-mono text-[9px] text-rh-light-muted/25 dark:text-white/10 px-1 leading-relaxed">
              For informational and educational purposes only. Not financial advice.
              All data sourced from public financial databases. Past performance does not guarantee future results.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
