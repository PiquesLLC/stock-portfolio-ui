import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createPost } from '../api';
import { API_BASE_URL } from '../config';
import html2canvas from 'html2canvas';

interface PostToFeedButtonProps {
  type: 'stock' | 'portfolio';
  ticker?: string;
  period?: string;
  userId?: string;
  className?: string;
}

export function PostToFeedButton({ type, ticker, period = '1M', userId, className }: PostToFeedButtonProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const cacheBust = `_t=${Date.now()}`;
  const stockCardUrl = type === 'stock' && ticker
    ? `${API_BASE_URL}/social/stock/${ticker}/share-card?period=${period}&${cacheBust}`
    : '';

  const handleOpen = async () => {
    if (type === 'portfolio') {
      const el = document.querySelector('[data-capture-id="portfolio-chart"]') as HTMLElement | null;
      if (el) {
        setCapturing(true);
        setOpen(true);
        try {
          // Temporarily adjust styles for a cleaner capture
          const brand = el.querySelector('[data-capture-brand]') as HTMLElement | null;
          if (brand) brand.style.opacity = '0.4';

          // Add extra padding to hero so the value/change text doesn't look cramped
          const hero = el.querySelector('[data-capture-hero]') as HTMLElement | null;
          const origPad = hero?.style.padding || '';
          const origMin = hero?.style.minHeight || '';
          if (hero) {
            hero.style.padding = '28px 24px 16px 24px';
            hero.style.minHeight = '180px';
          }
          // Add spacing between hero value and change text for capture
          const changeLine = hero?.querySelector('p') as HTMLElement | null;
          const origMargin = changeLine?.style.marginTop || '';
          if (changeLine) changeLine.style.marginTop = '16px';

          const canvas = await html2canvas(el, {
            backgroundColor: '#000000',
            scale: 2,
            width: el.scrollWidth,
            height: el.scrollHeight,
            useCORS: true,
            logging: false,
            ignoreElements: (node: Element) => {
              if (node.classList?.contains('z-20')) return true;
              if (node.getAttribute?.('data-capture-skip') === 'true') return true;
              return false;
            },
          });
          // Restore styles
          if (brand) brand.style.opacity = '0';
          if (hero) { hero.style.padding = origPad; hero.style.minHeight = origMin; }
          if (changeLine) changeLine.style.marginTop = origMargin;

          setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
        } catch (err) {
          console.error('Chart capture failed:', err);
          // Ensure styles are restored even on error
          const brand2 = el.querySelector('[data-capture-brand]') as HTMLElement | null;
          if (brand2) brand2.style.opacity = '0';
          const hero2 = el.querySelector('[data-capture-hero]') as HTMLElement | null;
          if (hero2) hero2.style.padding = '';
        } finally {
          setCapturing(false);
        }
      } else {
        setOpen(true);
      }
    } else {
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setCapturedImage(null);
    setContent('');
    setDone(false);
  };

  const handlePost = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const attachmentType = type === 'stock' ? 'stock_chart' : 'portfolio_chart';
      const attachmentData: Record<string, unknown> = type === 'stock'
        ? { ticker: ticker?.toUpperCase(), period }
        : { period };
      if (type === 'portfolio' && capturedImage) {
        attachmentData.image = capturedImage;
      }
      await createPost(
        content.trim() || (type === 'stock' ? `$${ticker} ${period} chart` : `My portfolio — ${period}`),
        type === 'stock' ? ticker : undefined,
        'analysis',
        attachmentType,
        attachmentData,
      );
      setDone(true);
      setTimeout(handleClose, 1200);
    } catch (err) {
      console.error('Failed to post:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const previewImage = type === 'stock' ? stockCardUrl : capturedImage;
  const fallbackCardUrl = type === 'portfolio' && userId
    ? `${API_BASE_URL}/social/${userId}/performance-card?period=${period}&${cacheBust}`
    : '';

  return (
    <>
      <button
        onClick={handleOpen}
        className={`flex items-center gap-1.5 text-rh-light-muted dark:text-rh-muted hover:text-rh-green transition-colors ${className || ''}`}
        title="Post to Feed"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span className="text-[11px] font-semibold">Post</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={handleClose}>
          <div
            className="relative w-[94vw] max-w-2xl mx-4 rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-rh-light-card dark:bg-[#111114]"
            style={{ animation: 'postExpandIn 0.15s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/50 hover:text-white hover:bg-black/60 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Preview */}
            {capturing ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
                <span className="ml-3 text-sm text-white/40">Capturing chart...</span>
              </div>
            ) : previewImage ? (
              <img src={previewImage} alt="Chart preview" className="w-full h-auto" />
            ) : fallbackCardUrl ? (
              <img src={fallbackCardUrl} alt="Chart preview" className="w-full h-auto" />
            ) : null}

            {/* Composer */}
            <div className="px-5 py-4 border-t border-white/[0.06]">
              {done ? (
                <div className="flex items-center gap-2 text-rh-green">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm font-semibold">Posted to Feed!</span>
                </div>
              ) : (
                <>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={type === 'stock' ? `What do you think about $${ticker}?` : 'Say something about your portfolio...'}
                    maxLength={1000}
                    rows={2}
                    className="w-full bg-transparent text-sm text-rh-light-text dark:text-white placeholder-rh-light-muted/40 dark:placeholder-white/20
                      resize-none outline-none mb-3"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-rh-light-muted/30 dark:text-white/15">
                      {capturedImage ? 'Screenshot of your chart' : 'Chart will be shared with your post'}
                    </span>
                    <button
                      onClick={handlePost}
                      disabled={submitting}
                      className="px-5 py-1.5 rounded-full text-xs font-bold bg-rh-green text-white disabled:opacity-40 hover:bg-rh-green/90 transition-colors"
                    >
                      {submitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
