import { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PostData, CommentData, PostAttachmentData } from '../types';
import { toggleLike, getComments, createComment } from '../api';
import { timeAgo } from '../utils/format';
import { API_BASE_URL } from '../config';

interface PostCardProps {
  post: PostData;
  onUserClick?: (userId: string) => void;
  onTickerClick?: (ticker: string) => void;
  onDelete?: (postId: string) => void;
  currentUserId?: string;
}

function avatarInitial(displayName: string, username: string): string {
  return (displayName || username || '?').charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-emerald-500/20 text-emerald-400',
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-orange-500/20 text-orange-400',
  'bg-indigo-500/20 text-indigo-400',
];
function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function PostCard({ post, onUserClick, onTickerClick, onDelete, currentUserId }: PostCardProps) {
  const [liked, setLiked] = useState(post.viewerLiked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const likePending = useRef(false);

  const handleLike = async () => {
    if (likePending.current) return;
    likePending.current = true;
    // Optimistic update
    setLiked(prev => !prev);
    setLikeCount(prev => liked ? prev - 1 : prev + 1);
    try {
      const result = await toggleLike(post.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (err) {
      // Revert on error
      setLiked(prev => !prev);
      setLikeCount(prev => liked ? prev + 1 : prev - 1);
      console.error('Failed to toggle like:', err);
    } finally {
      likePending.current = false;
    }
  };

  const handleToggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      try {
        const data = await getComments(post.id);
        setComments(data);
      } catch (err) {
        console.error('Failed to load comments:', err);
      } finally {
        setLoadingComments(false);
      }
    }
    setShowComments(!showComments);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const comment = await createComment(post.id, commentText.trim());
      setComments(prev => [...prev, comment]);
      setCommentCount(prev => prev + 1);
      setCommentText('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const isOwner = currentUserId === post.userId;
  const TYPE_LABELS: Record<string, string> = { thought: 'Thought', analysis: 'Analysis', trade_idea: 'Trade Idea' };

  return (
    <div className="px-5 py-4 border-b border-rh-light-border/15 dark:border-white/[0.05]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => onUserClick?.(post.userId)}
          className="flex items-center gap-2.5 group"
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(post.userId)}`}>
            {avatarInitial(post.user.displayName, post.user.username)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-rh-light-text dark:text-white group-hover:text-rh-green transition-colors leading-tight">
                {post.user.displayName}
              </span>
              {post.type !== 'thought' && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-rh-green/10 text-rh-green leading-tight">
                  {TYPE_LABELS[post.type] || post.type}
                </span>
              )}
            </div>
            <span className="text-[11px] text-rh-light-muted/40 dark:text-white/20 leading-tight">
              @{post.user.username} · {timeAgo(post.createdAt)}
            </span>
          </div>
        </button>
        {post.ticker && (
          <button
            onClick={() => onTickerClick?.(post.ticker!)}
            className="ml-auto text-[12px] font-bold text-rh-green hover:underline"
          >
            ${post.ticker}
          </button>
        )}
      </div>

      {/* Content — $TICKER patterns become clickable links */}
      <p className="text-[14px] text-rh-light-text dark:text-white/90 leading-relaxed whitespace-pre-wrap">
        <ContentWithTickers text={post.content} onTickerClick={onTickerClick} />
      </p>

      {/* Attachment */}
      <PostAttachment post={post} onTickerClick={onTickerClick} />

      {/* Actions */}
      <div className="flex items-center gap-1 mt-3 -ml-2">
        <button onClick={handleLike} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${liked ? 'text-rh-red bg-rh-red/[0.06]' : 'text-rh-light-muted/40 dark:text-white/25 hover:text-rh-red hover:bg-rh-red/[0.04]'}`}>
          <svg className="w-[18px] h-[18px]" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{likeCount || ''}</span>
        </button>
        <button onClick={handleToggleComments} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${showComments ? 'text-rh-green bg-rh-green/[0.06]' : 'text-rh-light-muted/40 dark:text-white/25 hover:text-rh-green hover:bg-rh-green/[0.04]'}`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{commentCount || ''}</span>
        </button>
        {isOwner && (
          <button
            onClick={() => { if (window.confirm('Delete this post?')) onDelete?.(post.id); }}
            className="text-[11px] text-rh-light-muted/20 dark:text-white/10 hover:text-rh-red transition-colors ml-auto px-2 py-1"
          >
            Delete
          </button>
        )}
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-rh-light-border/15 dark:border-white/[0.04]">
          {loadingComments ? (
            <div className="flex justify-center py-2">
              <div className="w-4 h-4 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {comments.map(c => (
                <div key={c.id} className="flex gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-rh-green/10 flex items-center justify-center text-[10px] font-bold text-rh-green flex-shrink-0 mt-0.5">
                    {avatarInitial(c.user.displayName, c.user.username)}
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-rh-light-text dark:text-white">{c.user.displayName}</span>
                    <span className="text-[10px] text-rh-light-muted/40 dark:text-white/20 ml-1.5">{timeAgo(c.createdAt)}</span>
                    <p className="text-xs text-rh-light-text/80 dark:text-white/70 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Reply..."
                  maxLength={500}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddComment(); }}
                  className="flex-1 bg-transparent text-xs text-rh-light-text dark:text-white placeholder-rh-light-muted/30 dark:placeholder-white/15
                    border border-rh-light-border/20 dark:border-white/[0.06] rounded-lg px-2.5 py-1.5 outline-none focus:border-rh-green/40"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim()}
                  className="text-xs font-semibold text-rh-green disabled:opacity-30"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Parse $TICKER patterns in text and make them clickable. Only matches $LETTERS (not $123). */
function ContentWithTickers({ text, onTickerClick }: { text: string; onTickerClick?: (ticker: string) => void }) {
  // Match $TICKER where ticker is 1-10 uppercase letters (no numbers-only after $)
  const parts = text.split(/(\$[A-Za-z][A-Za-z0-9.]{0,9})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\$[A-Za-z][A-Za-z0-9.]{0,9}$/.test(part)) {
          const ticker = part.slice(1).toUpperCase();
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onTickerClick?.(ticker); }}
              className="text-rh-green font-semibold hover:underline"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function PostAttachment({ post, onTickerClick }: { post: PostData; onTickerClick?: (ticker: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const attachment = useMemo<PostAttachmentData | null>(() => {
    if (!post.attachmentType || !post.attachmentData) return null;
    try { return JSON.parse(post.attachmentData); } catch { return null; }
  }, [post.attachmentType, post.attachmentData]);

  if (!post.attachmentType || !attachment) return null;

  const cacheBust = `_t=${Math.floor(Date.now() / 60000)}`;
  const stockCardUrl = attachment.ticker
    ? `${API_BASE_URL}/social/stock/${attachment.ticker}/share-card?period=${attachment.period || '1M'}&${cacheBust}`
    : '';
  // Use captured screenshot if available, otherwise fall back to server card
  const portfolioCardUrl = (attachment as Record<string, unknown>).image as string
    || `${API_BASE_URL}/social/${post.userId}/performance-card?period=${attachment.period || '1M'}&${cacheBust}`;

  // Expanded overlay — portal to body
  const portalRoot = typeof document !== 'undefined' ? document.body : null;
  const overlay = expanded && portalRoot && createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={() => setExpanded(false)}
    >
      <div
        className="relative w-[94vw] max-w-3xl mx-4"
        style={{ animation: 'postExpandIn 0.15s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-rh-light-card dark:bg-[#111114]">
          {/* Close */}
          <button
            onClick={() => setExpanded(false)}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/50 hover:text-white hover:bg-black/60 transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Stock chart — full share card image */}
          {post.attachmentType === 'stock_chart' && attachment.ticker && (
            <>
              <img src={stockCardUrl} alt={`${attachment.ticker} chart`} className="w-full h-auto" />
              <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                <button
                  onClick={() => { setExpanded(false); onTickerClick?.(attachment.ticker!); }}
                  className="text-sm font-semibold text-rh-green hover:underline"
                >
                  View {attachment.ticker} →
                </button>
                <span className="text-[11px] text-white/20">Tap chart to explore</span>
              </div>
            </>
          )}

          {/* Portfolio chart — full share card image */}
          {post.attachmentType === 'portfolio_chart' && (
            <img src={portfolioCardUrl} alt="Portfolio performance" className="w-full h-auto" />
          )}

          {/* Trade — expanded detail card */}
          {post.attachmentType === 'trade' && attachment.ticker && (() => {
            const isBuy = attachment.action === 'buy';
            return (
              <div className="p-6 lg:p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isBuy ? 'bg-rh-green/10' : 'bg-rh-red/10'}`}>
                    <svg className={`w-7 h-7 ${isBuy ? 'text-rh-green' : 'text-rh-red'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isBuy
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      }
                    </svg>
                  </div>
                  <div>
                    <span className={`text-lg font-bold uppercase ${isBuy ? 'text-rh-green' : 'text-rh-red'}`}>{attachment.action}</span>
                    <span className="text-2xl font-bold text-rh-light-text dark:text-white ml-3">${attachment.ticker}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {attachment.shares != null && (
                    <div className="bg-rh-light-bg/50 dark:bg-white/[0.04] rounded-2xl px-4 py-3">
                      <div className="text-[11px] text-rh-light-muted/50 dark:text-white/25 uppercase tracking-wide">Shares</div>
                      <div className="text-lg font-bold text-rh-light-text dark:text-white mt-1">{attachment.shares}</div>
                    </div>
                  )}
                  {attachment.price != null && (
                    <div className="bg-rh-light-bg/50 dark:bg-white/[0.04] rounded-2xl px-4 py-3">
                      <div className="text-[11px] text-rh-light-muted/50 dark:text-white/25 uppercase tracking-wide">Price</div>
                      <div className="text-lg font-bold text-rh-light-text dark:text-white mt-1">${attachment.price.toLocaleString()}</div>
                    </div>
                  )}
                  {attachment.shares != null && attachment.price != null && (
                    <div className="bg-rh-light-bg/50 dark:bg-white/[0.04] rounded-2xl px-4 py-3">
                      <div className="text-[11px] text-rh-light-muted/50 dark:text-white/25 uppercase tracking-wide">Total</div>
                      <div className="text-lg font-bold text-rh-light-text dark:text-white mt-1">${(attachment.shares * attachment.price).toLocaleString()}</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setExpanded(false); onTickerClick?.(attachment.ticker!); }}
                  className="mt-5 text-sm font-semibold text-rh-green hover:underline"
                >
                  View {attachment.ticker} →
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    </div>,
    portalRoot
  );

  // ── Inline compact views ──────────────────────────────────

  if (post.attachmentType === 'stock_chart' && attachment.ticker) {
    return (
      <>
        {overlay}
        <div
          className="mt-3 rounded-xl overflow-hidden border border-rh-light-border/15 dark:border-white/[0.06] cursor-pointer hover:border-rh-green/20 transition-colors"
          onClick={() => setExpanded(true)}
        >
          <img src={stockCardUrl} alt={`${attachment.ticker} chart`} className="w-full h-auto" loading="lazy" />
        </div>
      </>
    );
  }

  if (post.attachmentType === 'portfolio_chart') {
    return (
      <>
        {overlay}
        <div className="mt-3 rounded-xl overflow-hidden border border-rh-light-border/15 dark:border-white/[0.06] cursor-pointer hover:border-rh-green/20 transition-colors" onClick={() => setExpanded(true)}>
          <img src={portfolioCardUrl} alt="Portfolio performance" className="w-full h-auto" loading="lazy" />
        </div>
      </>
    );
  }

  if (post.attachmentType === 'trade' && attachment.ticker) {
    const isBuy = attachment.action === 'buy';
    return (
      <>
        {overlay}
        <div
          className={`mt-3 rounded-xl border px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
            isBuy
              ? 'border-rh-green/15 bg-rh-green/[0.03] hover:border-rh-green/30'
              : 'border-rh-red/15 bg-rh-red/[0.03] hover:border-rh-red/30'
          }`}
          onClick={() => setExpanded(true)}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isBuy ? 'bg-rh-green/10' : 'bg-rh-red/10'}`}>
            <svg className={`w-4.5 h-4.5 ${isBuy ? 'text-rh-green' : 'text-rh-red'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isBuy
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              }
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[12px] font-bold uppercase ${isBuy ? 'text-rh-green' : 'text-rh-red'}`}>{attachment.action}</span>
              <span className="text-[14px] font-bold text-rh-light-text dark:text-white">${attachment.ticker}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5">
              {attachment.shares != null && <span className="text-[12px] text-rh-light-muted dark:text-white/50">{attachment.shares} shares</span>}
              {attachment.price != null && <span className="text-[12px] text-rh-light-muted dark:text-white/50">@ ${attachment.price.toLocaleString()}</span>}
              {attachment.shares != null && attachment.price != null && (
                <span className="text-[12px] font-semibold text-rh-light-text dark:text-white/70">${(attachment.shares * attachment.price).toLocaleString()}</span>
              )}
            </div>
          </div>
          <svg className="w-4 h-4 text-rh-light-muted/20 dark:text-white/10 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>
      </>
    );
  }

  return null;
}
