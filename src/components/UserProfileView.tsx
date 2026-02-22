import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile, MarketSession, PerformanceData, LeaderboardEntry, ActivityEvent, CreatorEntitlement } from '../types';
import { getUserProfile, updateUserRegion, updateHoldingsVisibility, getLeaderboard, getUserIntelligence, getFollowers, getFollowingList, getUserPortfolio, getUserChart, updateUserSettings, getCreatorEntitlement, subscribeToCreator } from '../api';
import { CreatorSubscribeButton, CreatorSubscribeModal } from './CreatorPaywallCard';
import { createPortal } from 'react-dom';
import { FollowButton } from './FollowButton';
import { UserPortfolioView } from './UserPortfolioView';
import { PortfolioImport } from './PortfolioImport';
import { useMutedUsers } from '../hooks/useMutedUsers';
import { ReportModal } from './ReportModal';
import { API_BASE_URL } from '../config';

const REGION_OPTIONS = [
  { value: 'NA', label: 'North America', short: 'NA' },
  { value: 'EU', label: 'Europe', short: 'EU' },
  { value: 'APAC', label: 'Asia-Pacific', short: 'APAC' },
] as const;

function regionShort(region: string | null): string {
  return REGION_OPTIONS.find((r) => r.value === region)?.short ?? '';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Count-up animation hook ───────────────────────────────────────────
function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Animation variants ────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
};

// ── Signal Rating Computation ─────────────────────────────────────────
function computeSignalRating(perf: PerformanceData | null): {
  grade: string;
  score: number;
  reasons: string[];
} {
  if (!perf || perf.snapshotCount < 5) return { grade: '--', score: 0, reasons: ['Insufficient data'] };

  let score = 50;
  const reasons: string[] = [];

  if (perf.twrPct !== null) {
    if (perf.twrPct >= 10) { score += 30; reasons.push('Strong returns'); }
    else if (perf.twrPct >= 5) { score += 20; reasons.push('Above-average returns'); }
    else if (perf.twrPct >= 2) { score += 12; }
    else if (perf.twrPct >= 0) { score += 5; }
    else if (perf.twrPct >= -5) { score -= 5; }
    else { score -= 15; reasons.push('Negative returns'); }
  }

  if (perf.alphaPct !== null) {
    if (perf.alphaPct >= 5) { score += 20; reasons.push('SPY outperformance'); }
    else if (perf.alphaPct >= 2) { score += 12; reasons.push('Beating benchmark'); }
    else if (perf.alphaPct >= 0) { score += 5; }
    else { score -= 8; }
  }

  if (perf.volatilityPct !== null) {
    if (perf.volatilityPct > 40) { score -= 15; reasons.push('High volatility'); }
    else if (perf.volatilityPct > 25) { score -= 8; }
    else if (perf.volatilityPct < 15) { score += 5; reasons.push('Low volatility'); }
  }

  if (perf.maxDrawdownPct !== null) {
    if (perf.maxDrawdownPct > 20) { score -= 20; reasons.push('Large drawdown'); }
    else if (perf.maxDrawdownPct > 10) { score -= 10; }
    else if (perf.maxDrawdownPct < 5) { score += 5; reasons.push('Drawdown control'); }
  }

  if (perf.beta !== null && perf.beta < 0.8 && (perf.twrPct ?? 0) > 0) {
    reasons.push('Low beta');
  }

  score = Math.max(0, Math.min(100, score));

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C+';
  else if (score >= 40) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';

  return { grade, score, reasons: reasons.slice(0, 3) };
}

// ── Auto-generated Tagline ────────────────────────────────────────────
function generateTagline(perf: PerformanceData | null): string {
  if (!perf || perf.snapshotCount < 5) return 'Building track record';

  const phrases: string[] = [];

  if (perf.beta !== null) {
    if (perf.beta < 0.6) phrases.push('market-independent');
    else if (perf.beta < 0.8) phrases.push('low beta');
    else if (perf.beta > 1.4) phrases.push('leveraged exposure');
  }

  if (perf.alphaPct !== null) {
    if (perf.alphaPct > 5) phrases.push('consistent alpha');
    else if (perf.alphaPct > 2) phrases.push('steady outperformance');
    else if (perf.alphaPct > 0 && (perf.twrPct ?? 0) > 0) phrases.push('benchmark-beating');
  }

  if (perf.maxDrawdownPct !== null && perf.maxDrawdownPct < 5) {
    phrases.push('controlled risk');
  } else if (perf.volatilityPct !== null && perf.volatilityPct < 12) {
    phrases.push('steady returns');
  }

  if (perf.correlation !== null && perf.correlation < 0.4) {
    phrases.push('uncorrelated');
  }

  if (perf.volatilityPct !== null && perf.volatilityPct > 30 && (perf.twrPct ?? 0) > 5) {
    phrases.push('high conviction');
  }

  if (phrases.length === 0) {
    if ((perf.twrPct ?? 0) > 0) return 'Positive momentum';
    if ((perf.twrPct ?? 0) < -5) return 'Rebuilding';
    return 'Active portfolio';
  }

  const selected = phrases.slice(0, 2);
  return selected.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(', ');
}

// ── Risk Posture ──────────────────────────────────────────────────────
function getRiskPosture(perf: PerformanceData | null): { level: 'Low' | 'Medium' | 'High'; color: string } {
  if (!perf) return { level: 'Medium', color: 'text-yellow-400' };

  let riskScore = 0;
  if (perf.beta !== null && perf.beta > 1.2) riskScore += 2;
  if (perf.volatilityPct !== null && perf.volatilityPct > 25) riskScore += 2;
  if (perf.maxDrawdownPct !== null && perf.maxDrawdownPct > 15) riskScore += 2;

  if (riskScore >= 4) return { level: 'High', color: 'text-rh-red' };
  if (riskScore >= 2) return { level: 'Medium', color: 'text-yellow-400' };
  return { level: 'Low', color: 'text-rh-green' };
}

// ── Signal grade colors ───────────────────────────────────────────────
function getSignalColors(grade: string) {
  if (grade.startsWith('A')) return { ring: 'ring-rh-green/40', bg: 'bg-rh-green/15', text: 'text-rh-green', badgeBg: 'bg-rh-green', badgeText: 'text-black', pulse: grade === 'A+' };
  if (grade.startsWith('B')) return { ring: 'ring-blue-500/40', bg: 'bg-blue-500/15', text: 'text-blue-400', badgeBg: 'bg-blue-500', badgeText: 'text-white', pulse: false };
  if (grade.startsWith('C')) return { ring: 'ring-yellow-500/40', bg: 'bg-yellow-500/15', text: 'text-yellow-400', badgeBg: 'bg-yellow-500', badgeText: 'text-black', pulse: false };
  if (grade === '--') return { ring: 'ring-rh-border', bg: 'bg-rh-dark/50', text: 'text-rh-muted', badgeBg: 'bg-rh-border', badgeText: 'text-rh-muted', pulse: false };
  return { ring: 'ring-rh-red/40', bg: 'bg-rh-red/15', text: 'text-rh-red', badgeBg: 'bg-rh-red', badgeText: 'text-white', pulse: false };
}

// ── Premium tenure badge (Twitch-style) ──────────────────────────────
function getPremiumBadge(plan: string | undefined, planStartedAt: string | undefined): { label: string; icon: string; color: string } | null {
  if (!plan || plan === 'free' || !planStartedAt) return null;
  const months = Math.floor((Date.now() - new Date(planStartedAt).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months >= 24) return { label: 'Legend', icon: '\u{1F3C6}', color: 'text-amber-300 border-amber-300/30 bg-amber-300/[0.08]' };
  if (months >= 12) return { label: 'Veteran', icon: '\u{1F451}', color: 'text-amber-400 border-amber-400/30 bg-amber-400/[0.08]' };
  if (months >= 6) return { label: 'Champion', icon: '\u{1F48E}', color: 'text-purple-400 border-purple-400/30 bg-purple-400/[0.08]' };
  if (months >= 3) return { label: 'Patron', icon: '\u{1F6E1}\u{FE0F}', color: 'text-blue-400 border-blue-400/30 bg-blue-400/[0.08]' };
  return { label: 'Supporter', icon: '\u{2B50}', color: 'text-rh-green border-rh-green/30 bg-rh-green/[0.08]' };
}

// ── Achievement badges ───────────────────────────────────────────────
const DEVELOPER_USER_ID = '237198da-612e-411c-9ef8-f267c887a9f1';

function computeBadges(perf: PerformanceData | null, createdAt: string, plan?: string, planStartedAt?: string, profileUserId?: string): { label: string; icon: string; color: string }[] {
  const badges: { label: string; icon: string; color: string }[] = [];

  // Developer badge — exclusive to the app creator
  if (profileUserId === DEVELOPER_USER_ID) {
    badges.push({ label: 'Developer', icon: '\u{1F6E0}\u{FE0F}', color: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/[0.08]' });
  }

  // Premium tenure badge
  const premiumBadge = getPremiumBadge(plan, planStartedAt);
  if (premiumBadge) badges.push(premiumBadge);

  if (!perf || perf.snapshotCount < 5) return badges;

  if ((perf.alphaPct ?? 0) > 5) badges.push({ label: 'Alpha Hunter', icon: '\u{1F3AF}', color: 'text-rh-green border-rh-green/20 bg-rh-green/[0.06]' });
  else if ((perf.alphaPct ?? 0) > 0) badges.push({ label: 'Benchmark Beater', icon: '\u{1F4C8}', color: 'text-rh-green border-rh-green/20 bg-rh-green/[0.06]' });

  if ((perf.volatilityPct ?? 100) < 12) badges.push({ label: 'Steady Hand', icon: '\u{1F9CA}', color: 'text-blue-400 border-blue-400/20 bg-blue-400/[0.06]' });

  if ((perf.maxDrawdownPct ?? 0) > 15 && (perf.twrPct ?? 0) > 0) badges.push({ label: 'Diamond Hands', icon: '\u{1F48E}', color: 'text-cyan-400 border-cyan-400/20 bg-cyan-400/[0.06]' });

  if ((perf.beta ?? 1) < 0.7 && (perf.twrPct ?? 0) > 0) badges.push({ label: 'Uncorrelated', icon: '\u{1F30A}', color: 'text-purple-400 border-purple-400/20 bg-purple-400/[0.06]' });

  const joinDate = new Date(createdAt);
  if (joinDate < new Date('2026-03-01')) badges.push({ label: 'Early Adopter', icon: '\u{1F680}', color: 'text-amber-400 border-amber-400/20 bg-amber-400/[0.06]' });

  return badges.slice(0, 6);
}

// ── Mini sparkline SVG ───────────────────────────────────────────────
function MiniSparkline({ points, isPositive, id }: { points: { time: number; value: number }[]; isPositive: boolean; id: string }) {
  if (points.length < 3) return null;

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 320, h = 28, pad = 1;
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((p.value - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const color = isPositive ? '#00C805' : '#E8544E';
  const lastX = w - pad;
  const firstX = pad;
  const lastPoint = points[points.length - 1];
  const endX = lastX;
  const endY = h - pad - ((lastPoint.value - min) / range) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sf-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${lastX},${h} L${firstX},${h} Z`} fill={`url(#sf-${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Endpoint pulse dot */}
      <circle cx={endX} cy={endY} r="3" fill={color} opacity="0.9">
        <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={endX} cy={endY} r="1.5" fill={color} />
    </svg>
  );
}

// ── Group events by date ─────────────────────────────────────────────
function groupByDate(events: ActivityEvent[]): { date: string; events: ActivityEvent[] }[] {
  const groups: Map<string, ActivityEvent[]> = new Map();
  for (const event of events) {
    const date = new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(event);
  }
  return Array.from(groups.entries()).map(([date, evts]) => ({ date, events: evts }));
}

function getAvatarGradient(grade: string): string {
  if (grade.startsWith('A')) return 'conic-gradient(from 0deg, #00C805, rgba(0,200,5,0.1), #00C805)';
  if (grade.startsWith('B')) return 'conic-gradient(from 0deg, #3B82F6, rgba(59,130,246,0.1), #3B82F6)';
  if (grade.startsWith('C')) return 'conic-gradient(from 0deg, #EAB308, rgba(234,179,8,0.1), #EAB308)';
  if (grade === '--') return 'conic-gradient(from 0deg, #6B7280, rgba(107,114,128,0.1), #6B7280)';
  return 'conic-gradient(from 0deg, #E8544E, rgba(232,84,78,0.1), #E8544E)';
}

/** Lock overlay — minimal text + icon floating over blurred content */
function LockedOverlay({ onClick }: { onClick?: () => void }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 transition-opacity hover:opacity-70">
        <svg className="w-4 h-4 text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-sm font-semibold text-rh-light-muted dark:text-white/40">
          Subscribe to unlock
        </span>
      </div>
    </div>
  );
}

interface UserProfileViewProps {
  userId: string;
  currentUserId: string;
  session?: MarketSession;
  onBack: () => void;
  onStockClick?: (ticker: string) => void;
  onUserClick?: (userId: string) => void;
  onPortfolioUpdate?: () => void;
}

export function UserProfileView({ userId, currentUserId, session, onBack, onStockClick, onUserClick, onPortfolioUpdate }: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [rankPercentile, setRankPercentile] = useState<number | null>(null);
  const [rankPosition, setRankPosition] = useState<number | null>(null);
  const [showSignalTooltip, setShowSignalTooltip] = useState(false);
  const [intelligence, setIntelligence] = useState<{
    topContributor: { ticker: string; pct: number } | null;
    largestDrag: { ticker: string; pct: number } | null;
    topHoldingWeight: number | null;
    topHoldingTicker: string | null;
  } | null>(null);

  const [socialTab, setSocialTab] = useState<'followers' | 'following' | null>(null);
  const [socialList, setSocialList] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);

  const isOwner = userId === currentUserId;
  const { isMuted, toggleMute } = useMutedUsers();
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSocialTab(null);
    getUserProfile(userId, currentUserId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, currentUserId]);

  const handleSocialTab = async (tab: 'followers' | 'following') => {
    if (socialTab === tab) { setSocialTab(null); return; }
    setSocialTab(tab);
    setSocialLoading(true);
    try {
      const data = tab === 'followers' ? await getFollowers(userId) : await getFollowingList(userId);
      setSocialList(data);
    } catch { setSocialList([]); }
    finally { setSocialLoading(false); }
  };

  useEffect(() => {
    getLeaderboard('1M', 'world')
      .then((data) => {
        const entries = data.entries;
        const idx = entries.findIndex((e: LeaderboardEntry) => e.userId === userId);
        if (idx >= 0 && entries.length > 0) {
          const percentile = Math.round(((entries.length - idx) / entries.length) * 100);
          setRankPercentile(percentile);
          setRankPosition(idx + 1);
        }
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    getUserIntelligence(userId, '1m')
      .then((data) => {
        const topContributor = data.contributors?.[0]
          ? { ticker: data.contributors[0].ticker, pct: data.contributors[0].percentReturn ?? 0, contributionDollar: data.contributors[0].contributionDollar ?? 0 }
          : null;
        const largestDrag = data.detractors?.[0]
          ? { ticker: data.detractors[0].ticker, pct: data.detractors[0].percentReturn ?? 0, contributionDollar: data.detractors[0].contributionDollar ?? 0 }
          : null;
        const topWeight = data.sectorExposure?.[0]?.exposurePercent ?? null;
        const topTicker = data.contributors?.[0]?.ticker ?? null;
        setIntelligence({ topContributor, largestDrag, topHoldingWeight: topWeight, topHoldingTicker: topTicker });
      })
      .catch(() => {});
  }, [userId]);

  // Top holdings preview
  const [topHoldings, setTopHoldings] = useState<{ ticker: string; weight: number; returnPct: number }[]>([]);
  const [chartPoints, setChartPoints] = useState<{ time: number; value: number }[]>([]);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');

  useEffect(() => {
    if (!profile?.profilePublic) return;
    getUserPortfolio(userId)
      .then((p) => {
        const sorted = [...p.holdings].sort((a, b) => b.profitLossPercent - a.profitLossPercent).slice(0, 5);
        const total = p.holdingsValue || sorted.reduce((s, h) => s + h.currentValue, 0);
        setTopHoldings(sorted.map(h => ({
          ticker: h.ticker,
          weight: total > 0 ? (h.currentValue / total) * 100 : 0,
          returnPct: h.profitLossPercent,
        })));
      })
      .catch(() => setTopHoldings([]));
  }, [userId, profile?.profilePublic]);

  const [chartReturnPct, setChartReturnPct] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.profilePublic) return;
    getUserChart(userId, '1M')
      .then((data) => {
        setChartPoints(data.points);
        // Compute return from chart data (matches what user sees on portfolio chart)
        if (data.points.length >= 2 && data.periodStartValue > 0) {
          const lastVal = data.points[data.points.length - 1].value;
          setChartReturnPct(Math.round(((lastVal - data.periodStartValue) / data.periodStartValue) * 10000) / 100);
        }
      })
      .catch(() => setChartPoints([]));
  }, [userId, profile?.profilePublic]);

  // Sync bio text when profile loads
  useEffect(() => {
    if (profile) setBioText(profile.bio ?? '');
  }, [profile]);

  const signalRating = useMemo(() => computeSignalRating(profile?.performance ?? null), [profile?.performance]);
  const tagline = useMemo(() => generateTagline(profile?.performance ?? null), [profile?.performance]);
  const riskPosture = useMemo(() => getRiskPosture(profile?.performance ?? null), [profile?.performance]);
  const signalColors = useMemo(() => getSignalColors(signalRating.grade), [signalRating.grade]);
  const badges = useMemo(() => {
    if (!profile) return [];
    const b = computeBadges(profile.performance, profile.createdAt, profile.plan, profile.planStartedAt, userId);
    if (profile.creator?.status === 'active') {
      b.unshift({ label: 'Creator', icon: '\u{2728}', color: 'text-rh-green border-rh-green/20 bg-rh-green/[0.06]' });
    }
    return b;
  }, [profile?.performance, profile?.createdAt, profile?.plan, profile?.planStartedAt, profile?.creator?.status, userId]);

  // Creator entitlement for current viewer
  const [entitlement, setEntitlement] = useState<CreatorEntitlement | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (profile?.creator?.status === 'active' && !isOwner) {
      getCreatorEntitlement(userId).then(setEntitlement).catch(() => setEntitlement(null));
    }
  }, [profile?.creator?.status, userId, isOwner]);

  // Creator paywall: determine which sections are locked for non-subscribers
  const isCreatorProfile = profile?.creator?.status === 'active' && !isOwner;
  const viewerHasAccess = entitlement?.level === 'paid';
  const creatorVis = profile?.creator?.visibility;
  const lockHoldings = isCreatorProfile && !viewerHasAccess && !!creatorVis?.showHoldings;
  const lockSignal = isCreatorProfile && !viewerHasAccess && !!creatorVis?.showRiskMetrics;
  const lockActivity = isCreatorProfile && !viewerHasAccess && !!creatorVis?.showTradeHistory;

  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setSubscribing(true);
    setSubscribeError(null);
    try {
      const { url } = await subscribeToCreator(userId);
      window.location.href = url;
    } catch (err) {
      setSubscribing(false);
      setSubscribeError(err instanceof Error ? err.message : 'Failed to start subscription');
    }
  };

  if (showPortfolio && profile) {
    return (
      <UserPortfolioView
        userId={userId}
        displayName={profile.displayName}
        returnPct={profile.performance?.twrPct ?? null}
        window="1M"
        session={session}
        currentUserId={currentUserId}
        onBack={() => setShowPortfolio(false)}
        backLabel="Back to Profile"
        onStockClick={onStockClick}
      />
    );
  }

  // ── Loading Skeleton ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-3">
          <div className="bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-[52px] h-[52px] bg-gray-200/50 dark:bg-rh-dark/50 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="h-6 w-36 bg-gray-200/50 dark:bg-rh-dark/50 rounded" />
                <div className="h-3 w-20 bg-gray-200/30 dark:bg-rh-dark/30 rounded" />
              </div>
            </div>
            <div className="flex gap-4 mt-5 pt-4 border-t border-gray-200/20 dark:border-white/[0.06]">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 text-center space-y-1">
                  <div className="h-6 w-16 mx-auto bg-gray-200/40 dark:bg-rh-dark/40 rounded" />
                  <div className="h-2 w-10 mx-auto bg-gray-200/20 dark:bg-rh-dark/20 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-7 w-20 bg-gray-200/30 dark:bg-rh-dark/30 rounded-full" />
            ))}
          </div>
          <div className="h-32 bg-white/80 dark:bg-white/[0.04] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-rh-light-muted dark:text-rh-muted text-sm">User not found.</p>
        <button onClick={onBack} className="mt-2 text-rh-green text-sm hover:underline">Go back</button>
      </div>
    );
  }

  const perf = profile.performance;
  const hasPerformance = perf && perf.snapshotCount >= 2;
  const isNewAccount = profile.followerCount === 0 && profile.followingCount === 0;
  const isPositive = (perf?.twrPct ?? 0) >= 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto px-4 pt-2 pb-6"
    >
      {/* Back button */}
      <motion.button
        variants={itemVariants}
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4 transition-colors group"
      >
        <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </motion.button>

      {/* ═══════════════════════════════════════════════════════════════
          1. UNIFIED HERO — profile + performance + social
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-6 mb-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]"
      >
        {/* Ambient glow */}
        {hasPerformance && (
          <div className={`absolute inset-0 rounded-xl pointer-events-none ${isPositive ? 'profile-hero-glow-green' : 'profile-hero-glow-red'}`} />
        )}

        {/* Profile identity row */}
        <div className="relative flex items-start gap-3.5">
          {/* Avatar with signal badge */}
          <div
            className="relative shrink-0 cursor-help"
            onMouseEnter={() => setShowSignalTooltip(true)}
            onMouseLeave={() => setShowSignalTooltip(false)}
          >
            <div className="relative w-[52px] h-[52px]">
              {/* Animated gradient ring */}
              <div
                className="absolute inset-0 rounded-full avatar-ring-spin"
                style={{ background: getAvatarGradient(signalRating.grade) }}
              />
              {/* Ring gap */}
              <div className="absolute inset-[3px] rounded-full bg-white dark:bg-rh-card" />
              {/* Avatar face */}
              <div className={`absolute inset-[4px] rounded-full flex items-center justify-center text-sm font-bold ${signalColors.bg} ${signalColors.text}`}>
                {getInitials(profile.displayName)}
              </div>
            </div>
            {/* Signal grade badge overlay */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white dark:border-rh-card ${signalColors.badgeBg} ${signalColors.badgeText} ${signalColors.pulse ? 'signal-pulse-green' : ''} hover:scale-110 transition-transform duration-200`}>
              {signalRating.grade}
            </div>

            {/* Signal tooltip */}
            <AnimatePresence>
              {showSignalTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-2 left-0 z-20 w-52 p-3 bg-white dark:bg-rh-dark border border-gray-200/60 dark:border-rh-border rounded-lg shadow-xl"
                >
                  <p className="text-[10px] text-rh-light-text/80 dark:text-rh-text/80 leading-relaxed mb-2">
                    Signal grade based on:
                  </p>
                  <ul className="space-y-1.5 text-[10px] text-rh-light-muted/70 dark:text-rh-muted/70">
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rh-light-muted/40 dark:bg-rh-muted/40 mt-1.5 shrink-0" />
                      Risk-adjusted return
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rh-light-muted/40 dark:bg-rh-muted/40 mt-1.5 shrink-0" />
                      Drawdown control
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rh-light-muted/40 dark:bg-rh-muted/40 mt-1.5 shrink-0" />
                      Market correlation
                    </li>
                  </ul>
                  <p className="text-[9px] text-rh-light-muted/50 dark:text-rh-muted/50 mt-2.5 pt-2 border-t border-gray-200/30 dark:border-rh-border/30">
                    Stable signal (30d)
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Name + username + tagline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text truncate">
                {profile.displayName}
              </h1>
              {profile.showRegion && profile.region && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-100 dark:bg-rh-dark/50 text-rh-light-muted/60 dark:text-rh-muted/60">
                  {regionShort(profile.region)}
                </span>
              )}
              {/* Share button */}
              <button
                onClick={async () => {
                  const toast = document.getElementById('share-toast');
                  const showToast = (msg: string) => {
                    if (toast) { toast.textContent = msg; setTimeout(() => { toast.textContent = ''; }, 2000); }
                  };
                  try {
                    const res = await fetch(`${API_BASE_URL}/social/${userId}/share-card`);
                    if (!res.ok) throw new Error('fetch failed');
                    const blob = await res.blob();
                    const file = new File([blob], `nala-${profile?.username ?? 'profile'}.png`, { type: 'image/png' });
                    const profileUrl = `${window.location.origin}?profile=${userId}`;
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
                      await navigator.share({ files: [file], title: `${profile?.displayName ?? 'Portfolio'} on Nala`, url: profileUrl });
                    } else {
                      // Desktop: download image + copy link
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = file.name;
                      a.click();
                      URL.revokeObjectURL(a.href);
                      await navigator.clipboard.writeText(profileUrl);
                      showToast('Saved + Copied!');
                    }
                  } catch {
                    // Final fallback: just copy URL
                    navigator.clipboard.writeText(`${window.location.origin}?profile=${userId}`);
                    showToast('Link copied!');
                  }
                }}
                className="shrink-0 ml-auto p-1.5 rounded-lg text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-green hover:bg-rh-green/[0.06] transition-all"
                title="Share profile"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <span id="share-toast" className="absolute -top-1 right-0 text-[9px] text-rh-green font-medium" />
            </div>
            <p className="text-sm text-rh-light-muted dark:text-rh-muted">
              @{profile.username}
              <span className="mx-1.5 text-rh-light-muted/30 dark:text-rh-muted/30">&middot;</span>
              <span className="text-rh-light-muted/40 dark:text-rh-muted/40">
                {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </p>
            {/* Bio / Tagline */}
            {isOwner && editingBio ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  autoFocus
                  value={bioText}
                  onChange={(e) => setBioText(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingBio(false);
                      updateUserSettings(userId, { bio: bioText }).catch(() => {});
                    }
                    if (e.key === 'Escape') setEditingBio(false);
                  }}
                  onBlur={() => {
                    setEditingBio(false);
                    updateUserSettings(userId, { bio: bioText }).catch(() => {});
                  }}
                  placeholder={tagline}
                  className="flex-1 text-xs bg-transparent border-b border-rh-green/30 text-rh-light-text dark:text-rh-text focus:outline-none focus:border-rh-green py-0.5 italic"
                  maxLength={80}
                />
                <span className="text-[8px] text-rh-light-muted/40 dark:text-rh-muted/40">{bioText.length}/80</span>
              </div>
            ) : (
              <p
                className={`text-xs text-rh-light-muted/80 dark:text-rh-muted/80 mt-2 font-medium tracking-wide italic ${isOwner ? 'cursor-pointer hover:text-rh-green/60 transition-colors' : ''}`}
                onClick={() => isOwner && setEditingBio(true)}
                title={isOwner ? 'Click to edit bio' : undefined}
              >
                {bioText || tagline}
              </p>
            )}

            {/* Achievement badges */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {badges.map((badge) => (
                  <span key={badge.label} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded-full border ${badge.color}`}>
                    <span className="text-[10px]">{badge.icon}</span>
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Performance identity row ────────────────────────────── */}
        {profile.profilePublic && hasPerformance && (
          <div className="relative mt-5 pt-4 border-t border-gray-200/30 dark:border-white/[0.06]">
            <div className="flex items-center justify-center gap-2 mb-3">
              <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider text-center">Performance</h3>
              {rankPosition !== null && rankPosition <= 20 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rh-green/[0.08] border border-rh-green/20">
                  <span className="text-[9px] text-rh-green/60">#</span>
                  <span className="text-[10px] font-bold text-rh-green tabular-nums">{rankPosition}</span>
                  <span className="text-[8px] text-rh-green/50 uppercase">this month</span>
                </div>
              )}
            </div>
          <div className="flex items-center gap-0">
            <PerformanceStat
              value={chartReturnPct ?? perf?.twrPct ?? null}
              label="Return (1mo)"
              isPercent
              primary
            />
            <div className="w-px h-8 bg-gray-200/30 dark:bg-white/[0.06]" />
            <PerformanceStat
              value={chartReturnPct != null && perf?.benchmarkReturnPct != null
                ? Math.round((chartReturnPct - perf.benchmarkReturnPct) * 100) / 100
                : perf?.alphaPct ?? null}
              label={`vs ${perf?.benchmarkTicker ?? 'SPY'}`}
              isPercent
            />
            {/* Third stat: Rank if available, otherwise Beta */}
            <div className="w-px h-8 bg-gray-200/30 dark:bg-white/[0.06]" />
            {rankPercentile !== null && rankPercentile <= 80 ? (
              <div className="flex-1 text-center">
                <p className="text-lg font-bold text-rh-green tabular-nums">
                  Top {100 - rankPercentile}%
                </p>
                <p className="text-[9px] text-rh-light-muted/50 dark:text-rh-muted/50 uppercase tracking-wider mt-0.5">Rank</p>
              </div>
            ) : (
              <PerformanceStat
                value={perf?.beta ?? null}
                label="Beta"
                formatFn={(v) => v.toFixed(2)}
              />
            )}
            {/* Fourth stat: Nala Signal Score */}
            {signalRating.grade !== '--' && (
              <>
                <div className="w-px h-8 bg-gray-200/30 dark:bg-white/[0.06]" />
                <div className="flex-1 flex flex-col items-center">
                  <div className="relative w-9 h-9">
                    <svg className="w-9 h-9 -rotate-90" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" className="text-gray-200/20 dark:text-white/[0.06]" strokeWidth="1.5" />
                      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" className={signalColors.text} strokeWidth="1.5" strokeLinecap="round"
                        strokeDasharray={`${(signalRating.score / 100) * 50.27} 50.27`} />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums ${signalColors.text}`}>{signalRating.score}</span>
                  </div>
                  <p className="text-[9px] text-rh-light-muted/50 dark:text-rh-muted/50 uppercase tracking-wider mt-0.5">Nala Score</p>
                </div>
              </>
            )}
          </div>
          </div>
        )}

        {/* ── Mini sparkline ───────────────────────────────────── */}
        {profile.profilePublic && hasPerformance && chartPoints.length > 3 && (
          <div className="mt-3 -mx-1 opacity-70">
            <MiniSparkline points={chartPoints} isPositive={isPositive} id={userId} />
          </div>
        )}

        {/* ── Social strip ────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-200/30 dark:border-white/[0.06]">
          {isNewAccount ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs text-rh-light-muted/60 dark:text-rh-muted/60">
                <span className="w-1.5 h-1.5 rounded-full bg-rh-green/50 animate-pulse" />
                <span>Performance tracking started — be the first to follow</span>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => handleSocialTab('followers')}
                className={`group flex items-baseline gap-1.5 transition-opacity ${socialTab === 'followers' ? 'opacity-100' : 'hover:opacity-80'}`}
              >
                <span className={`text-sm font-bold transition-colors ${socialTab === 'followers' ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text group-hover:text-rh-green'}`}>
                  {profile.followerCount}
                </span>
                <span className={`text-xs transition-colors ${socialTab === 'followers' ? 'text-rh-green/70' : 'text-rh-light-muted dark:text-rh-muted'}`}>Followers</span>
              </button>
              <button
                onClick={() => handleSocialTab('following')}
                className={`group flex items-baseline gap-1.5 transition-opacity ${socialTab === 'following' ? 'opacity-100' : 'hover:opacity-80'}`}
              >
                <span className={`text-sm font-bold transition-colors ${socialTab === 'following' ? 'text-rh-green' : 'text-rh-light-text dark:text-rh-text group-hover:text-rh-green'}`}>
                  {profile.followingCount}
                </span>
                <span className={`text-xs transition-colors ${socialTab === 'following' ? 'text-rh-green/70' : 'text-rh-light-muted dark:text-rh-muted'}`}>Following</span>
              </button>
            </>
          )}
          {profile.creator?.status === 'active' && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-rh-light-text dark:text-rh-text">{profile.creator.subscriberCount ?? 0}</span>
              <span className="text-xs text-rh-light-muted dark:text-rh-muted">Subscribers</span>
            </div>
          )}

          {/* Action buttons - pushed to right */}
          {!isOwner && (
            <div className="ml-auto flex items-center gap-2">
              {profile.creator?.status === 'active' && entitlement?.level !== 'paid' && (
                <CreatorSubscribeButton
                  creator={profile.creator}
                  performance={perf}
                  onSubscribe={handleSubscribe}
                  loading={subscribing}
                />
              )}
              <FollowButton
                targetUserId={userId}
                currentUserId={currentUserId}
                initialFollowing={profile.viewerIsFollowing}
                onToggle={(nowFollowing) => {
                  setProfile((p) =>
                    p ? {
                      ...p,
                      viewerIsFollowing: nowFollowing,
                      followerCount: p.followerCount + (nowFollowing ? 1 : -1),
                    } : p
                  );
                }}
              />
              <button
                onClick={() => setShowPortfolio(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-white/[0.12]
                  text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Portfolio
                <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => toggleMute(userId, profile.displayName)}
                title={isMuted(userId) ? 'Unmute activity' : 'Mute activity'}
                className={`p-1.5 rounded-lg transition-all ${
                  isMuted(userId)
                    ? 'bg-rh-red/10 text-rh-red hover:bg-rh-red/20'
                    : 'text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted dark:hover:text-white/40'
                }`}
              >
                {isMuted(userId) ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                title="Report user"
                className="p-1.5 rounded-lg text-rh-light-muted/40 dark:text-white/20 hover:text-rh-light-muted dark:hover:text-white/40 transition-all"
              >
                <svg className="w-3.5 h-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-18m0 0l9 4 9-4v12l-9 4-9-4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          1b. SOCIAL LIST — expandable followers/following
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {socialTab && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
            className="overflow-hidden mb-2"
          >
            <div className="bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-4 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider">
                  {socialTab === 'followers' ? 'Followers' : 'Following'}
                </h3>
                <button
                  onClick={() => setSocialTab(null)}
                  className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-rh-light-text dark:hover:text-rh-text transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {socialLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <div className="w-4 h-4 border-2 border-rh-green/30 border-t-rh-green rounded-full animate-spin" />
                  <span className="text-xs text-rh-light-muted dark:text-rh-muted">Loading…</span>
                </div>
              ) : socialList.length === 0 ? (
                <p className="text-xs text-rh-light-muted dark:text-rh-muted text-center py-6">
                  {socialTab === 'followers' ? 'No followers yet' : 'Not following anyone'}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar">
                  {socialList.map((user, i) => (
                    <motion.button
                      key={user.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      onClick={() => onUserClick?.(user.id)}
                      className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-rh-green/10 flex items-center justify-center text-[10px] font-bold text-rh-green shrink-0">
                        {getInitials(user.displayName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">{user.displayName}</p>
                        <p className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">@{user.username}</p>
                      </div>
                      <svg className="w-3.5 h-3.5 text-rh-light-muted/30 dark:text-rh-muted/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {subscribeError && (
        <p className="mb-2 text-xs text-red-500 dark:text-red-400">{subscribeError}</p>
      )}

      {/* Subscribe modal — opened from locked section overlays */}
      {showSubscribeModal && profile.creator && createPortal(
        <CreatorSubscribeModal
          creator={profile.creator}
          performance={perf}
          onSubscribe={() => { handleSubscribe(); setShowSubscribeModal(false); }}
          onClose={() => setShowSubscribeModal(false)}
          loading={subscribing}
        />,
        document.body
      )}

      {/* Subscriber badge */}
      {profile.creator?.status === 'active' && !isOwner && entitlement?.level === 'paid' && (
        <motion.div variants={itemVariants}
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2
            bg-rh-green/[0.06] border border-rh-green/20">
          <svg className="w-4 h-4 text-rh-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-medium text-rh-green">
            Subscribed — you have full access to {profile.displayName}'s insights
          </span>
        </motion.div>
      )}

      {/* Creator pitch */}
      {isCreatorProfile && profile.creator?.pitch && (
        <motion.div variants={itemVariants}
          className="px-3 py-2.5 rounded-xl mb-2 bg-white/80 dark:bg-white/[0.04] border border-gray-200/40 dark:border-white/[0.08]">
          <p className="text-xs text-rh-light-muted dark:text-rh-muted italic">&ldquo;{profile.creator.pitch}&rdquo;</p>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          2b. TOP HOLDINGS PREVIEW
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && topHoldings.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="relative bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-4 mb-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)] overflow-hidden"
        >
          <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider mb-2.5">Top Holdings</h3>
          {lockHoldings && <LockedOverlay onClick={() => setShowSubscribeModal(true)} />}
          <div className={lockHoldings ? 'blur-[8px] select-none pointer-events-none' : ''}>
          <div className="flex items-center gap-3 px-1.5 mb-1">
            <span className="w-16 shrink-0"></span>
            <div className="flex-1"></div>
            <span className="text-[9px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider w-11 text-right shrink-0">Weight</span>
            <span className="text-[9px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider w-12 text-right shrink-0">Return</span>
          </div>
          <div className="space-y-1.5">
            {topHoldings.map((h) => (
              <button
                key={h.ticker}
                onClick={() => onStockClick?.(h.ticker)}
                className="w-full flex items-center gap-3 py-1.5 px-1.5 -mx-1.5 hover:bg-gray-100/50 dark:hover:bg-white/[0.04] rounded-lg transition-colors text-left group"
              >
                <span className="text-sm font-bold text-rh-light-text dark:text-rh-text group-hover:text-rh-green transition-colors w-16 shrink-0 tabular-nums">{h.ticker}</span>
                <div className="flex-1 h-2 bg-gray-200/40 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${h.returnPct >= 0 ? 'bg-rh-green/70' : 'bg-rh-red/60'}`}
                    style={{ width: `${Math.max(Math.min(Math.abs(h.returnPct) / Math.max(...topHoldings.map(t => Math.abs(t.returnPct)), 1) * 100, 100), 2)}%` }}
                  />
                </div>
                <span className="text-[10px] text-rh-light-muted dark:text-rh-muted tabular-nums w-11 text-right shrink-0">{h.weight.toFixed(1)}%</span>
                <span className={`text-[10px] tabular-nums w-12 text-right font-medium shrink-0 ${h.returnPct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {h.returnPct >= 0 ? '+' : ''}{h.returnPct.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          3. SIGNAL PANEL — 2-col grid + reason chips
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && hasPerformance && (
        <motion.div
          variants={itemVariants}
          className={`relative bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-4 mb-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)] border-l-2 overflow-hidden ${
            riskPosture.level === 'Low' ? 'border-l-rh-green/30' :
            riskPosture.level === 'High' ? 'border-l-rh-red/30' :
            'border-l-yellow-500/30'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider">Signal Summary</h3>
            <span className="text-[9px] font-medium text-rh-light-muted/80 dark:text-rh-muted/70 px-1.5 py-0.5 rounded bg-gray-100/60 dark:bg-white/[0.06]">1M</span>
          </div>
          {lockSignal && <LockedOverlay onClick={() => setShowSubscribeModal(true)} />}
          <div className={lockSignal ? 'blur-[8px] select-none pointer-events-none' : ''}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {intelligence?.topContributor && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-rh-light-muted dark:text-rh-muted">Top contributor</span>
                <span className="text-rh-green font-medium whitespace-nowrap">
                  <button onClick={() => onStockClick?.(intelligence.topContributor!.ticker)} className="hover:underline">{intelligence.topContributor.ticker}</button>{' '}
                  <span className="text-rh-green/70">+{(topHoldings.find(h => h.ticker === intelligence.topContributor!.ticker)?.returnPct ?? intelligence.topContributor.pct).toFixed(1)}%</span>
                </span>
              </div>
            )}
            {intelligence?.largestDrag && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-rh-light-muted dark:text-rh-muted">Largest drag</span>
                <span className="text-rh-red font-medium whitespace-nowrap">
                  <button onClick={() => onStockClick?.(intelligence.largestDrag!.ticker)} className="hover:underline">{intelligence.largestDrag.ticker}</button>{' '}
                  <span className="text-rh-red/70">{intelligence.largestDrag.pct.toFixed(1)}%</span>
                </span>
              </div>
            )}
            {intelligence?.topHoldingWeight && (
              <div className="flex justify-between items-center">
                <span className="text-rh-light-muted dark:text-rh-muted">Largest position</span>
                <span className="text-rh-light-text dark:text-rh-text font-medium">{intelligence.topHoldingWeight.toFixed(1)}%</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-rh-light-muted dark:text-rh-muted">Risk posture</span>
              <span className={`font-medium ${riskPosture.color}`}>{riskPosture.level}</span>
            </div>
            {perf?.correlation !== null && (
              <div className="flex justify-between items-center">
                <span className="text-rh-light-muted dark:text-rh-muted">SPY correlation</span>
                <span className="text-rh-light-text dark:text-rh-text font-medium">{perf!.correlation!.toFixed(2)}</span>
              </div>
            )}
            {intelligence?.topContributor && perf?.twrPct && Math.abs(perf.twrPct) > 0 && (() => {
              const ratio = Math.abs(intelligence.topContributor!.pct / perf!.twrPct!);
              const level = ratio > 0.6 ? 'High' : ratio > 0.3 ? 'Medium' : 'Low';
              const color = level === 'High' ? 'text-amber-400' : level === 'Medium' ? 'text-yellow-400' : 'text-rh-green';
              return (
                <div className="flex justify-between items-center">
                  <span className="text-rh-light-muted dark:text-rh-muted">Concentration</span>
                  <span className={`font-medium ${color}`}>{level}</span>
                </div>
              );
            })()}
          </div>

          {/* Signal reason chips */}
          {signalRating.reasons.length > 0 && signalRating.grade !== '--' && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-200/20 dark:border-white/[0.06]">
              {signalRating.reasons.map((reason) => (
                <span key={reason} className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-rh-green/[0.08] text-rh-green/70 border border-rh-green/15">
                  {reason}
                </span>
              ))}
            </div>
          )}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          4. ACTIVITY TIMELINE — latest moves with spine + dots
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && profile.recentActivity && profile.recentActivity.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="relative bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-4 mb-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)] overflow-hidden"
        >
          <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider mb-3">
            Latest Moves
          </h3>
          {lockActivity && <LockedOverlay onClick={() => setShowSubscribeModal(true)} />}
          <div className={lockActivity ? 'blur-[8px] select-none pointer-events-none' : ''}>
          <div className="relative">
            {/* Timeline spine */}
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-gray-300 dark:from-white/[0.12] via-gray-200 dark:via-white/[0.06] to-transparent" />
            <div className="space-y-4 pl-6">
              {groupByDate(profile.recentActivity.slice(0, 4)).map((group) => (
                <div key={group.date}>
                  <p className="text-[9px] text-rh-light-muted/40 dark:text-rh-muted/40 uppercase tracking-wider mb-1.5 -ml-1">{group.date}</p>
                  <div className="space-y-2.5">
                    {group.events.map((event, i) => {
                      const { verb, isSell } = getActionInfo(event.type, event.payload);
                      const notionalValue = event.payload.shares && event.payload.averageCost
                        ? event.payload.shares * event.payload.averageCost
                        : null;

                      let details = '';
                      if (event.type === 'holding_added' && event.payload.shares) {
                        details = `${event.payload.shares} shares`;
                      } else if (event.type === 'holding_updated' && event.payload.previousShares && event.payload.shares) {
                        const diff = event.payload.shares - event.payload.previousShares;
                        details = diff > 0
                          ? `+${diff} → ${event.payload.shares} total`
                          : `−${Math.abs(diff)} → ${event.payload.shares} total`;
                      } else if (event.type === 'holding_removed') {
                        details = 'closed';
                      }

                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25, delay: 0.35 + i * 0.06 }}
                          className="relative"
                        >
                          <div className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 ${
                            isSell ? 'bg-rh-red/40 border-rh-red/60' : 'bg-rh-green/40 border-rh-green/60'
                          }`} />

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-xs font-semibold ${isSell ? 'text-rh-red' : 'text-rh-green'}`}>{verb}</span>
                              <button
                                onClick={() => onStockClick?.(event.payload.ticker)}
                                className="text-sm font-bold text-rh-light-text dark:text-rh-text hover:text-rh-green transition-colors"
                              >
                                {event.payload.ticker}
                              </button>
                              {details && <span className="text-xs text-rh-light-muted dark:text-rh-muted">{details}</span>}
                            </div>
                            <div className="flex items-center gap-2.5 flex-shrink-0">
                              {notionalValue && notionalValue >= 1000 && (
                                <span className="text-xs text-rh-light-text/70 dark:text-rh-text/70 tabular-nums font-medium">
                                  {formatValue(notionalValue)}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          5. VIEW PORTFOLIO CTA
          ═══════════════════════════════════════════════════════════════ */}
      {/* View Full Portfolio removed — now in header button row */}

      {/* ═══════════════════════════════════════════════════════════════
          6. PROFILE SETTINGS — merged (owner only)
          ═══════════════════════════════════════════════════════════════ */}
      {isOwner && (
        <motion.div
          variants={itemVariants}
          className="bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/40 dark:border-white/[0.08] rounded-xl p-4 mb-2 opacity-80 hover:opacity-100 transition-opacity shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]"
        >
          <h3 className="text-[10px] font-semibold text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider mb-3">Profile Settings</h3>

          {/* Holdings visibility */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">Holdings</span>
            <HoldingsVisibilityToggle
              value={profile.holdingsVisibility ?? 'all'}
              onChange={async (val) => {
                setProfile((p) => p ? { ...p, holdingsVisibility: val } : p);
                await updateHoldingsVisibility(userId, val);
              }}
            />
          </div>

          <div className="border-t border-gray-200/20 dark:border-white/[0.06] mb-3" />

          {/* Region */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">Region</span>
            <select
              value={`${profile.region ?? ''}|${profile.showRegion ? '1' : '0'}`}
              onChange={async (e) => {
                const [region, show] = e.target.value.split('|');
                const newRegion = region || null;
                const newShow = show === '1';
                setProfile((p) => p ? { ...p, region: newRegion, showRegion: newShow } : p);
                await updateUserRegion(userId, newRegion, newShow);
              }}
              className="text-xs text-rh-light-text dark:text-rh-text bg-white dark:bg-rh-dark border border-gray-200/60 dark:border-rh-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-rh-green/50 cursor-pointer hover:border-rh-light-muted dark:hover:border-rh-muted transition-colors"
            >
              <option value="|0">Not set</option>
              {REGION_OPTIONS.map((r) => (
                <option key={`${r.value}-hidden`} value={`${r.value}|0`}>{r.short} (private)</option>
              ))}
              {REGION_OPTIONS.map((r) => (
                <option key={`${r.value}-shown`} value={`${r.value}|1`}>{r.short} (public)</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-200/20 dark:border-white/[0.06] mt-3 pt-3" />

          {/* Portfolio management */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">Portfolio</span>
            <button
              onClick={() => setShowImport(true)}
              className="text-xs text-rh-green hover:text-green-600 font-medium transition-colors"
            >
              Import / Update
            </button>
          </div>
        </motion.div>
      )}

      {/* Portfolio Import Modal */}
      {showImport && (
        <PortfolioImport
          onClose={() => setShowImport(false)}
          onImportComplete={() => { setShowImport(false); onPortfolioUpdate?.(); }}
        />
      )}

      {/* Private Profile */}
      {!profile.profilePublic && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-rh-dark border border-gray-200/60 dark:border-rh-border flex items-center justify-center">
            <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">This profile is private</p>
        </motion.div>
      )}

      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetUserId={userId}
        targetUsername={profile.username}
        context="profile"
      />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PERFORMANCE STAT — used in hero identity row
// ═══════════════════════════════════════════════════════════════════════
function PerformanceStat({ value, label, isPercent, primary, formatFn }: {
  value: number | null;
  label: string;
  isPercent?: boolean;
  primary?: boolean;
  formatFn?: (v: number) => string;
}) {
  const animatedValue = useCountUp(value ?? 0, 900);
  const displayValue = value !== null
    ? formatFn
      ? formatFn(animatedValue)
      : `${value >= 0 ? '+' : ''}${animatedValue.toFixed(2)}${isPercent ? '%' : ''}`
    : '--';
  const color = value === null
    ? 'text-rh-light-muted dark:text-rh-muted'
    : formatFn
      ? 'text-rh-light-text dark:text-rh-text'
      : value >= 0 ? 'text-rh-green' : 'text-rh-red';

  return (
    <div className="flex-1 text-center">
      <p className={`${primary ? 'text-2xl' : 'text-lg'} font-bold tabular-nums ${color} ${primary && value !== null && value >= 0 ? 'profit-glow' : ''}`}>
        {displayValue}
      </p>
      <p className="text-[9px] text-rh-light-muted/50 dark:text-rh-muted/50 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HOLDINGS VISIBILITY TOGGLE (compact version)
// ═══════════════════════════════════════════════════════════════════════
function HoldingsVisibilityToggle({ value, onChange }: {
  value: string;
  onChange: (val: string) => void;
}) {
  const options = [
    { val: 'all', label: 'Public' },
    { val: 'top5', label: 'Partial' },
    { val: 'hidden', label: 'Private' },
  ];

  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        const isActive = value === opt.val || (opt.val === 'top5' && value === 'sectors');
        return (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            className={`px-3 py-1 text-[10px] font-medium rounded-full transition-all ${
              isActive
                ? 'bg-rh-green/10 text-rh-green border border-rh-green/40 shadow-[0_0_10px_-3px_rgba(0,200,5,0.3)]'
                : 'bg-gray-50 dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted border border-gray-200/60 dark:border-rh-border hover:border-gray-300 dark:hover:border-rh-muted/50'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════
function getActionInfo(type: string, payload: { shares?: number; previousShares?: number }): {
  verb: string;
  isSell: boolean;
} {
  if (type === 'holding_added') return { verb: 'Bought', isSell: false };
  if (type === 'holding_removed') return { verb: 'Sold', isSell: true };
  if (type === 'holding_updated' && payload.previousShares && payload.shares) {
    return payload.shares > payload.previousShares
      ? { verb: 'Added', isSell: false }
      : { verb: 'Sold', isSell: true };
  }
  return { verb: 'Updated', isSell: false };
}

function formatValue(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

