import { useState, useRef } from 'react';
import { createPost } from '../api';
import { PostAttachmentData, SymbolSearchResult } from '../types';
import { MiniSparkline } from './MiniSparkline';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';

interface PostComposerProps {
  onPostCreated?: () => void;
}

type AttachmentMode = 'stock_chart' | 'portfolio_chart' | 'trade' | null;

export function PostComposer({ onPostCreated }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [ticker, setTicker] = useState('');
  const [type, setType] = useState<'thought' | 'analysis' | 'trade_idea'>('thought');
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Attachment state
  const [attachMode, setAttachMode] = useState<AttachmentMode>(null);
  const [attachTicker, setAttachTicker] = useState('');
  const [attachPeriod, setAttachPeriod] = useState('1M');
  const [attachAction, setAttachAction] = useState<'buy' | 'sell'>('buy');
  const [attachShares, setAttachShares] = useState('');
  const [attachPrice, setAttachPrice] = useState('');

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      let attachmentType: string | undefined;
      let attachmentData: PostAttachmentData | undefined;

      if (attachMode === 'stock_chart' && attachTicker.trim()) {
        attachmentType = 'stock_chart';
        attachmentData = { ticker: attachTicker.trim().toUpperCase(), period: attachPeriod };
      } else if (attachMode === 'portfolio_chart') {
        attachmentType = 'portfolio_chart';
        attachmentData = { period: attachPeriod };
      } else if (attachMode === 'trade' && attachTicker.trim()) {
        attachmentType = 'trade';
        attachmentData = {
          ticker: attachTicker.trim().toUpperCase(),
          action: attachAction,
          shares: parseFloat(attachShares) || undefined,
          price: parseFloat(attachPrice) || undefined,
        };
      }

      // Auto-set ticker from attachment if not manually set
      const postTicker = ticker.trim() || (attachmentData?.ticker) || undefined;

      await createPost(content.trim(), postTicker, type, attachmentType, attachmentData);
      setContent('');
      setTicker('');
      setType('thought');
      clearAttachment();
      onPostCreated?.();
    } catch (err) {
      console.error('Failed to create post:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const clearAttachment = () => {
    setAttachMode(null);
    setAttachTicker('');
    setAttachPeriod('1M');
    setAttachAction('buy');
    setAttachShares('');
    setAttachPrice('');
  };

  const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y'];

  const isExpanded = focused || content.length > 0 || attachMode !== null;

  return (
    <div ref={containerRef} className="px-5 py-3 border-b border-gray-200/20 dark:border-white/[0.06]"
      onBlur={(e) => {
        // Only collapse if focus left the entire composer container
        if (!containerRef.current?.contains(e.relatedTarget as Node) && !content.trim() && !attachMode) {
          setFocused(false);
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.currentTarget.blur();
            if (!content.trim() && !attachMode) { setFocused(false); clearAttachment(); }
          }
        }}
        placeholder="Share a thought..."
        maxLength={1000}
        rows={isExpanded ? 3 : 1}
        className={`w-full bg-rh-light-bg/50 dark:bg-white/[0.03] text-sm text-rh-light-text dark:text-white placeholder-rh-light-muted/40 dark:placeholder-white/20
          resize-none outline-none border rounded-xl px-4 py-2.5 transition-all duration-200 ${
          isExpanded
            ? 'border-rh-green/30 bg-transparent dark:bg-transparent'
            : 'border-rh-light-border/20 dark:border-white/[0.06] cursor-text'
        }`}
      />

      {/* Attachment preview */}
      {isExpanded && attachMode === 'stock_chart' && attachTicker.trim() && (
        <div className="mt-2 relative rounded-xl overflow-hidden border border-rh-light-border/20 dark:border-white/[0.08] bg-rh-light-bg/50 dark:bg-white/[0.03]">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-rh-light-text dark:text-white">${attachTicker.toUpperCase()}</span>
            <span className="text-[10px] text-rh-light-muted/50 dark:text-white/25">{attachPeriod}</span>
          </div>
          <div className="h-14 px-2">
            <MiniSparkline ticker={attachTicker.toUpperCase()} positive={true} period={attachPeriod as any} />
          </div>
          <button onClick={clearAttachment} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gray-200/80 dark:bg-white/10 flex items-center justify-center text-rh-light-muted dark:text-white/40 hover:text-rh-red text-xs">&times;</button>
        </div>
      )}

      {isExpanded && attachMode === 'portfolio_chart' && (
        <div className="mt-2 rounded-xl border border-rh-light-border/20 dark:border-white/[0.08] bg-rh-light-bg/50 dark:bg-white/[0.03] px-3 py-2 relative">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            <span className="text-[11px] font-bold text-rh-light-text dark:text-white">My Portfolio</span>
            <span className="text-[10px] text-rh-light-muted/50 dark:text-white/25">{attachPeriod}</span>
          </div>
          <button onClick={clearAttachment} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gray-200/80 dark:bg-white/10 flex items-center justify-center text-rh-light-muted dark:text-white/40 hover:text-rh-red text-xs">&times;</button>
        </div>
      )}

      {isExpanded && attachMode === 'trade' && attachTicker.trim() && (
        <div className="mt-2 rounded-xl border border-rh-light-border/20 dark:border-white/[0.08] bg-rh-light-bg/50 dark:bg-white/[0.03] px-3 py-2 relative">
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-bold uppercase ${attachAction === 'buy' ? 'text-rh-green' : 'text-rh-red'}`}>{attachAction}</span>
            <span className="text-[11px] font-bold text-rh-light-text dark:text-white">${attachTicker.toUpperCase()}</span>
            {attachShares && <span className="text-[11px] text-rh-light-muted dark:text-white/50">{attachShares} shares</span>}
            {attachPrice && <span className="text-[11px] text-rh-light-muted dark:text-white/50">@ ${attachPrice}</span>}
          </div>
          <button onClick={clearAttachment} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gray-200/80 dark:bg-white/10 flex items-center justify-center text-rh-light-muted dark:text-white/40 hover:text-rh-red text-xs">&times;</button>
        </div>
      )}

      {/* Attachment input forms */}
      {isExpanded && attachMode && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(attachMode === 'stock_chart' || attachMode === 'trade') && (
            <div className="w-32">
              <TickerAutocompleteInput
                value={attachTicker}
                onChange={setAttachTicker}
                onSelect={(r: SymbolSearchResult) => setAttachTicker(r.symbol)}
                placeholder="Search ticker..."
                compact
                className="!text-xs !py-1 !px-2 !rounded-lg !border-rh-light-border/20 dark:!border-white/[0.06] !bg-white dark:!bg-[#1a1a1e]"
              />
            </div>
          )}
          {(attachMode === 'stock_chart' || attachMode === 'portfolio_chart') && (
            <div className="flex gap-0.5">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setAttachPeriod(p)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${attachPeriod === p ? 'bg-rh-green/15 text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted dark:hover:text-white/40'}`}
                >{p}</button>
              ))}
            </div>
          )}
          {attachMode === 'trade' && (
            <>
              <div className="flex gap-0.5">
                <button onClick={() => setAttachAction('buy')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${attachAction === 'buy' ? 'bg-rh-green/15 text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20'}`}>Buy</button>
                <button onClick={() => setAttachAction('sell')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${attachAction === 'sell' ? 'bg-rh-red/15 text-rh-red' : 'text-rh-light-muted/40 dark:text-white/20'}`}>Sell</button>
              </div>
              <input value={attachShares} onChange={e => setAttachShares(e.target.value)} placeholder="Shares" type="number"
                className="w-16 bg-white dark:bg-[#1a1a1e] text-xs text-rh-light-text dark:text-white placeholder-rh-light-muted/30 dark:placeholder-white/15 border border-rh-light-border/20 dark:border-white/[0.06] rounded-lg px-2 py-1 outline-none" />
              <input value={attachPrice} onChange={e => setAttachPrice(e.target.value)} placeholder="Price" type="number"
                className="w-16 bg-white dark:bg-[#1a1a1e] text-xs text-rh-light-text dark:text-white placeholder-rh-light-muted/30 dark:placeholder-white/15 border border-rh-light-border/20 dark:border-white/[0.06] rounded-lg px-2 py-1 outline-none" />
            </>
          )}
        </div>
      )}

      {isExpanded && <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {/* Attachment buttons */}
          <button onClick={() => setAttachMode(attachMode === 'stock_chart' ? null : 'stock_chart')}
            title="Attach stock chart"
            className={`p-1.5 rounded-lg transition-colors ${attachMode === 'stock_chart' ? 'bg-rh-green/15 text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20 hover:text-rh-green hover:bg-rh-green/5'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </button>
          <button onClick={() => setAttachMode(attachMode === 'portfolio_chart' ? null : 'portfolio_chart')}
            title="Attach portfolio chart"
            className={`p-1.5 rounded-lg transition-colors ${attachMode === 'portfolio_chart' ? 'bg-rh-green/15 text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20 hover:text-rh-green hover:bg-rh-green/5'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18M7 16l4-4 4 4 5-5" /></svg>
          </button>
          <button onClick={() => setAttachMode(attachMode === 'trade' ? null : 'trade')}
            title="Share a trade"
            className={`p-1.5 rounded-lg transition-colors ${attachMode === 'trade' ? 'bg-rh-green/15 text-rh-green' : 'text-rh-light-muted/40 dark:text-white/20 hover:text-rh-green hover:bg-rh-green/5'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          </button>

          <div className="w-px h-4 bg-rh-light-border/20 dark:bg-white/[0.06] mx-0.5" />

          <div className="w-24">
            <TickerAutocompleteInput
              value={ticker}
              onChange={setTicker}
              onSelect={(r: SymbolSearchResult) => setTicker(r.symbol)}
              placeholder="$TICKER"
              compact
              className="!text-xs !py-1 !px-2 !rounded-lg !border-rh-light-border/20 dark:!border-white/[0.06] !bg-transparent"
            />
          </div>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'thought' | 'analysis' | 'trade_idea')}
            className="text-xs bg-white dark:bg-[#1a1a1e] text-rh-light-muted dark:text-white/50
              border border-rh-light-border/20 dark:border-white/[0.06] rounded-lg px-2 py-1 outline-none appearance-none"
          >
            <option value="thought" className="bg-white dark:bg-[#1a1a1e]">Thought</option>
            <option value="analysis" className="bg-white dark:bg-[#1a1a1e]">Analysis</option>
            <option value="trade_idea" className="bg-white dark:bg-[#1a1a1e]">Trade Idea</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-rh-light-muted/40 dark:text-white/20">{content.length}/1000</span>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-rh-green text-white
              disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rh-green/90 transition-colors"
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>}
    </div>
  );
}

