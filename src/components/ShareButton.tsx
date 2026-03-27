import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config';

type ShareCardType = 'stock' | 'performance';

interface ShareButtonProps {
  /** What kind of share card to generate */
  type: ShareCardType;
  /** userId for performance cards */
  userId?: string;
  /** username for file naming and profile URL */
  username?: string;
  /** displayName for share title */
  displayName?: string;
  /** ticker for stock cards */
  ticker?: string;
  /** period for performance cards (default 1M) */
  period?: string;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show label text */
  showLabel?: boolean;
}

const SHARE_ICON = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

function getShareOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function getCardUrl(type: ShareCardType, props: ShareButtonProps): string {
  const cacheBust = `&_t=${Date.now()}`;
  const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  switch (type) {
    case 'stock':
      return `${API_BASE_URL}/social/stock/${props.ticker}/share-card?period=${props.period || '1W'}&tz=${tz}${cacheBust}`;
    case 'performance':
      return `${API_BASE_URL}/social/${props.userId}/performance-card?period=${props.period || '1M'}&tz=${tz}${cacheBust}`;
  }
}

function getFileName(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'stock':
      return `nala-${props.ticker || 'stock'}.png`;
    case 'performance':
      return `nala-performance-${props.period || '1M'}.png`;
  }
}

function getShareTitle(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'stock':
      return `${props.ticker} on Nala`;
    case 'performance':
      return `My portfolio performance on Nala`;
  }
}

function getShareUrl(type: ShareCardType, props: ShareButtonProps): string {
  const origin = getShareOrigin();
  switch (type) {
    case 'stock':
      return `${origin}/#tab=portfolio&stock=${props.ticker}`;
    case 'performance':
      return `${origin}/${props.username || ''}`;
  }
}

function getShareText(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'stock':
      return `Check out $${props.ticker} on Nala`;
    case 'performance':
      return `Check out my portfolio performance on Nala`;
  }
}

export function ShareButton(props: ShareButtonProps) {
  const { type, className, size = 'sm', showLabel = false } = props;
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<React.CSSProperties>({});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  // Position dropdown relative to button when menu opens
  useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [menuOpen]);

  // Close menu on click/tap outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  const isMobile = isMobileDevice();

  const handleClick = useCallback(() => {
    // On mobile with native share, go directly to native share
    if (isMobile && typeof navigator.share === 'function') {
      handleNativeShare();
    } else {
      setMenuOpen(o => !o);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const handleNativeShare = useCallback(async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      const res = await fetch(getCardUrl(type, props), { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const file = new File([blob], getFileName(type, props), { type: 'image/png' });
      const shareUrl = getShareUrl(type, props);

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: getShareTitle(type, props),
          url: shareUrl,
        });
      } else {
        await navigator.share({
          title: getShareTitle(type, props),
          text: getShareText(type, props),
          url: shareUrl,
        });
      }
    } catch (err: unknown) {
      // User cancelled share — don't show error for AbortError (user dismissed share sheet)
      if (err instanceof Error && err.name !== 'AbortError') {
        showToast('Share failed');
      }
    } finally {
      setLoading(false);
    }
  }, [type, props]);

  const handleCopyLink = useCallback(async () => {
    setMenuOpen(false);
    const shareUrl = getShareUrl(type, props);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied!');
    } catch {
      showToast('Failed');
    }
  }, [type, props, showToast]);

  const handleShareX = useCallback(() => {
    setMenuOpen(false);
    const shareUrl = getShareUrl(type, props);
    const text = getShareText(type, props);
    const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    if (typeof window !== 'undefined') {
      window.open(xUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    }
  }, [type, props]);

  const handleDownloadImage = useCallback(() => {
    setMenuOpen(false);

    const download = async () => {
      try {
        const res = await fetch(getCardUrl(type, props), { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch failed');

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = getFileName(type, props);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        showToast('Saved!');
      } catch {
        showToast('Failed');
      }
    };

    void download();
  }, [type, props, showToast]);

  const handleShareInstagram = useCallback(() => {
    setMenuOpen(false);
    // Instagram doesn't have a direct web share URL for Stories.
    // Best approach: download the image, then prompt user to share via Stories.
    // On mobile, the native share sheet includes Instagram if installed.
    if (isMobile && typeof navigator.share === 'function') {
      handleNativeShare();
      return;
    }
    // Desktop fallback: download the image and show instructions
    const download = async () => {
      try {
        const res = await fetch(getCardUrl(type, props), { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = getFileName(type, props);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        showToast('Image saved — share to Instagram Stories');
      } catch {
        showToast('Failed');
      }
    };
    void download();
  }, [type, props, isMobile, handleNativeShare, showToast]);

  const handleShareMore = useCallback(async () => {
    setMenuOpen(false);
    if (typeof navigator.share === 'function') {
      await handleNativeShare();
    } else {
      await handleCopyLink();
    }
  }, [handleNativeShare, handleCopyLink]);

  const sizeClasses = size === 'sm'
    ? 'p-1.5 rounded-lg'
    : 'px-2.5 py-1 rounded-lg text-[11px] font-medium';

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`inline-flex items-center gap-1 text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-green hover:bg-rh-green/[0.06] transition-all ${sizeClasses} ${loading ? 'opacity-50' : ''} ${className || ''}`}
        title="Share"
      >
        {loading ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : SHARE_ICON}
        {showLabel && <span>Share</span>}
      </button>

      {/* Toast */}
      {toast && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-rh-green font-medium animate-pulse">
          {toast}
        </span>
      )}

      {/* Dropdown menu — portaled to body to escape parent backdrop-blur */}
      {menuOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[160px] py-1 rounded-lg border border-gray-200/60 dark:border-white/[0.08] bg-white dark:bg-[#111113] shadow-2xl"
          style={dropdownPos}
        >
          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rh-light-text dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-rh-light-muted/50 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copy Link
          </button>

          {/* Share to X */}
          <button
            onClick={handleShareX}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rh-light-text dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-rh-light-muted/50 dark:text-white/30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share to X
          </button>

          {/* Instagram Stories */}
          <button
            onClick={handleShareInstagram}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rh-light-text dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-rh-light-muted/50 dark:text-white/30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
            Instagram Stories
          </button>

          {/* Download Image */}
          <button
            onClick={handleDownloadImage}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rh-light-text dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-rh-light-muted/50 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Image
          </button>

          {/* More sharing options (native share sheet on supported platforms) */}
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <>
              <div className="mx-3 my-1 border-t border-gray-200/30 dark:border-white/[0.06]" />
              <button
                onClick={handleShareMore}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rh-light-text dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0 text-rh-light-muted/50 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
                More...
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
