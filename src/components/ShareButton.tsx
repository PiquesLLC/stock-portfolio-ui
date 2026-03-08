import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';

type ShareCardType = 'profile' | 'stock' | 'performance';

interface ShareButtonProps {
  /** What kind of share card to generate */
  type: ShareCardType;
  /** userId for profile/performance cards */
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

function getCardUrl(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'profile':
      return `${API_BASE_URL}/social/${props.userId}/share-card`;
    case 'stock':
      return `${API_BASE_URL}/social/stock/${props.ticker}/share-card`;
    case 'performance':
      return `${API_BASE_URL}/social/${props.userId}/performance-card?period=${props.period || '1M'}`;
  }
}

function getFileName(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'profile':
      return `nala-${props.username || 'profile'}.png`;
    case 'stock':
      return `nala-${props.ticker || 'stock'}.png`;
    case 'performance':
      return `nala-performance-${props.period || '1M'}.png`;
  }
}

function getShareTitle(type: ShareCardType, props: ShareButtonProps): string {
  switch (type) {
    case 'profile':
      return `${props.displayName || 'Portfolio'} on Nala`;
    case 'stock':
      return `${props.ticker} on Nala`;
    case 'performance':
      return `My portfolio performance on Nala`;
  }
}

function getShareUrl(type: ShareCardType, props: ShareButtonProps): string {
  const origin = window.location.origin;
  switch (type) {
    case 'profile':
      return `${origin}/${props.username || ''}`;
    case 'stock':
      return `${origin}/#tab=portfolio&stock=${props.ticker}`;
    case 'performance':
      return `${origin}/${props.username || ''}`;
  }
}

export function ShareButton(props: ShareButtonProps) {
  const { type, className, size = 'sm', showLabel = false } = props;
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const handleShare = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getCardUrl(type, props));
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const file = new File([blob], getFileName(type, props), { type: 'image/png' });
      const shareUrl = getShareUrl(type, props);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: getShareTitle(type, props),
          url: shareUrl,
        });
      } else {
        // Desktop: download image + copy link
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        await navigator.clipboard.writeText(shareUrl);
        showToast('Saved + Copied!');
      }
    } catch {
      // Fallback: just copy URL
      const shareUrl = getShareUrl(type, props);
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied!');
      } catch {
        showToast('Failed');
      }
    } finally {
      setLoading(false);
    }
  }, [type, props, showToast]);

  const sizeClasses = size === 'sm'
    ? 'p-1.5 rounded-lg'
    : 'px-2.5 py-1 rounded-lg text-[11px] font-medium';

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={handleShare}
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
      {toast && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-rh-green font-medium animate-pulse">
          {toast}
        </span>
      )}
    </span>
  );
}
