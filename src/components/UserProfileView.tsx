import { useState, useEffect, useMemo } from 'react';
import { UserProfile, MarketSession, PerformanceData, LeaderboardEntry, ActivityEvent } from '../types';
import { getUserProfile, updateUserRegion, updateHoldingsVisibility, getLeaderboard, getUserIntelligence } from '../api';
import { FollowButton } from './FollowButton';
import { UserPortfolioView } from './UserPortfolioView';

const REGION_OPTIONS = [
  { value: 'NA', label: 'North America', short: 'NA' },
  { value: 'EU', label: 'Europe', short: 'EU' },
  { value: 'APAC', label: 'Asia-Pacific', short: 'APAC' },
] as const;

function regionShort(region: string | null): string {
  return REGION_OPTIONS.find((r) => r.value === region)?.short ?? '';
}

// ── Signal Rating Computation ─────────────────────────────────────────
// Returns grade + score + reasons explaining the rating
function computeSignalRating(perf: PerformanceData | null): {
  grade: string;
  score: number;
  reasons: string[];
} {
  if (!perf || perf.snapshotCount < 5) return { grade: '--', score: 0, reasons: ['Insufficient data'] };

  let score = 50;
  const reasons: string[] = [];

  // TWR contribution
  if (perf.twrPct !== null) {
    if (perf.twrPct >= 10) { score += 30; reasons.push('Strong returns'); }
    else if (perf.twrPct >= 5) { score += 20; reasons.push('Above-average returns'); }
    else if (perf.twrPct >= 2) { score += 12; }
    else if (perf.twrPct >= 0) { score += 5; }
    else if (perf.twrPct >= -5) { score -= 5; }
    else { score -= 15; reasons.push('Negative returns'); }
  }

  // Alpha contribution
  if (perf.alphaPct !== null) {
    if (perf.alphaPct >= 5) { score += 20; reasons.push('SPY outperformance'); }
    else if (perf.alphaPct >= 2) { score += 12; reasons.push('Beating benchmark'); }
    else if (perf.alphaPct >= 0) { score += 5; }
    else { score -= 8; }
  }

  // Volatility
  if (perf.volatilityPct !== null) {
    if (perf.volatilityPct > 40) { score -= 15; reasons.push('High volatility'); }
    else if (perf.volatilityPct > 25) { score -= 8; }
    else if (perf.volatilityPct < 15) { score += 5; reasons.push('Low volatility'); }
  }

  // Max drawdown
  if (perf.maxDrawdownPct !== null) {
    if (perf.maxDrawdownPct > 20) { score -= 20; reasons.push('Large drawdown'); }
    else if (perf.maxDrawdownPct > 10) { score -= 10; }
    else if (perf.maxDrawdownPct < 5) { score += 5; reasons.push('Drawdown control'); }
  }

  // Beta bonus
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
// Algorithmic tagline from actual metrics
function generateTagline(perf: PerformanceData | null): string {
  if (!perf || perf.snapshotCount < 5) return 'Building track record';

  const phrases: string[] = [];

  // Beta-based
  if (perf.beta !== null) {
    if (perf.beta < 0.6) phrases.push('market-independent');
    else if (perf.beta < 0.8) phrases.push('low beta');
    else if (perf.beta > 1.4) phrases.push('leveraged exposure');
  }

  // Alpha-based
  if (perf.alphaPct !== null) {
    if (perf.alphaPct > 5) phrases.push('consistent alpha');
    else if (perf.alphaPct > 2) phrases.push('steady outperformance');
    else if (perf.alphaPct > 0 && (perf.twrPct ?? 0) > 0) phrases.push('benchmark-beating');
  }

  // Risk-based
  if (perf.maxDrawdownPct !== null && perf.maxDrawdownPct < 5) {
    phrases.push('controlled risk');
  } else if (perf.volatilityPct !== null && perf.volatilityPct < 12) {
    phrases.push('steady returns');
  }

  // Correlation-based
  if (perf.correlation !== null && perf.correlation < 0.4) {
    phrases.push('uncorrelated');
  }

  // Conviction-based
  if (perf.volatilityPct !== null && perf.volatilityPct > 30 && (perf.twrPct ?? 0) > 5) {
    phrases.push('high conviction');
  }

  if (phrases.length === 0) {
    if ((perf.twrPct ?? 0) > 0) return 'Positive momentum';
    if ((perf.twrPct ?? 0) < -5) return 'Rebuilding';
    return 'Active portfolio';
  }

  // Combine 2 phrases max, capitalize first
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

interface UserProfileViewProps {
  userId: string;
  currentUserId: string;
  session?: MarketSession;
  onBack: () => void;
  onStockClick?: (ticker: string) => void;
}

export function UserProfileView({ userId, currentUserId, session, onBack, onStockClick }: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [rankPercentile, setRankPercentile] = useState<number | null>(null);
  const [showSignalTooltip, setShowSignalTooltip] = useState(false);
  const [intelligence, setIntelligence] = useState<{
    topContributor: { ticker: string; pct: number } | null;
    largestDrag: { ticker: string; pct: number } | null;
    topHoldingWeight: number | null;
    topHoldingTicker: string | null;
  } | null>(null);

  const isOwner = userId === currentUserId;

  // Fetch profile
  useEffect(() => {
    setLoading(true);
    getUserProfile(userId, currentUserId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, currentUserId]);

  // Fetch rank percentile from leaderboard
  useEffect(() => {
    getLeaderboard('1M', 'world')
      .then((data) => {
        const entries = data.entries;
        const idx = entries.findIndex((e: LeaderboardEntry) => e.userId === userId);
        if (idx >= 0 && entries.length > 0) {
          const percentile = Math.round(((entries.length - idx) / entries.length) * 100);
          setRankPercentile(percentile);
        }
      })
      .catch(() => {});
  }, [userId]);

  // Fetch intelligence for signal summary
  useEffect(() => {
    getUserIntelligence(userId, '1m')
      .then((data) => {
        const topContributor = data.contributors?.[0]
          ? { ticker: data.contributors[0].ticker, pct: data.contributors[0].percentReturn ?? 0 }
          : null;
        const largestDrag = data.detractors?.[0]
          ? { ticker: data.detractors[0].ticker, pct: data.detractors[0].percentReturn ?? 0 }
          : null;
        // Calculate top holding weight from sector exposure or contributors
        const topWeight = data.sectorExposure?.[0]?.exposurePercent ?? null;
        const topTicker = data.contributors?.[0]?.ticker ?? null;
        setIntelligence({
          topContributor,
          largestDrag,
          topHoldingWeight: topWeight,
          topHoldingTicker: topTicker,
        });
      })
      .catch(() => {});
  }, [userId]);

  // Computed values
  const signalRating = useMemo(() => computeSignalRating(profile?.performance ?? null), [profile?.performance]);
  const tagline = useMemo(() => generateTagline(profile?.performance ?? null), [profile?.performance]);
  const riskPosture = useMemo(() => getRiskPosture(profile?.performance ?? null), [profile?.performance]);

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
        onStockClick={onStockClick}
      />
    );
  }

  // ── Loading Skeleton ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-16 bg-rh-dark/50 rounded" />
          <div className="bg-rh-card border border-rh-border rounded-xl p-6">
            <div className="flex justify-between">
              <div className="space-y-2">
                <div className="h-7 w-40 bg-rh-dark/50 rounded" />
                <div className="h-4 w-24 bg-rh-dark/30 rounded" />
              </div>
              <div className="h-14 w-14 bg-rh-dark/50 rounded-xl" />
            </div>
            <div className="flex gap-6 mt-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 w-20 bg-rh-dark/30 rounded" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="h-20 bg-rh-card border border-rh-border rounded-xl col-span-2 md:col-span-1" />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-rh-card border border-rh-border rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-rh-muted text-sm">User not found.</p>
        <button onClick={onBack} className="mt-2 text-rh-green text-sm hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const perf = profile.performance;
  const hasPerformance = perf && perf.snapshotCount >= 2;
  const isNewAccount = profile.followerCount === 0 && profile.followingCount === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-rh-muted hover:text-rh-text mb-4 transition-colors group"
      >
        <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* ═══════════════════════════════════════════════════════════════
          1. PROFILE HEADER
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-rh-card border border-rh-border rounded-xl p-6 mb-3">
        <div className="flex items-start justify-between">
          {/* Left: Name, handle, join date, tagline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-rh-text truncate">
                {profile.displayName}
              </h1>
              {/* Region badge - secondary, muted */}
              {profile.showRegion && profile.region && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-rh-dark/50 text-rh-muted/60">
                  {regionShort(profile.region)}
                </span>
              )}
            </div>
            <p className="text-sm text-rh-muted">@{profile.username}</p>
            {/* Join date - heavily de-emphasized */}
            <p className="text-[10px] text-rh-muted/40 mt-0.5">
              {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
            {/* Algorithmic tagline */}
            <p className="text-xs text-rh-muted/70 mt-2.5 font-medium tracking-wide">
              {tagline}
            </p>
          </div>

          {/* Right: Signal Rating with tooltip */}
          <div
            className="shrink-0 flex flex-col items-center ml-4 relative"
            onMouseEnter={() => setShowSignalTooltip(true)}
            onMouseLeave={() => setShowSignalTooltip(false)}
          >
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold border-2 cursor-help transition-all duration-200 ${
              signalRating.grade.startsWith('A') ? 'border-rh-green/50 text-rh-green bg-rh-green/5 shadow-[inset_0_0_12px_-4px_rgba(0,200,5,0.15)] hover:shadow-[inset_0_0_16px_-4px_rgba(0,200,5,0.25)] hover:scale-[1.03]' :
              signalRating.grade.startsWith('B') ? 'border-blue-500/50 text-blue-400 bg-blue-500/5 shadow-[inset_0_0_12px_-4px_rgba(59,130,246,0.15)] hover:shadow-[inset_0_0_16px_-4px_rgba(59,130,246,0.25)] hover:scale-[1.03]' :
              signalRating.grade.startsWith('C') ? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/5 shadow-[inset_0_0_12px_-4px_rgba(234,179,8,0.15)] hover:shadow-[inset_0_0_16px_-4px_rgba(234,179,8,0.25)] hover:scale-[1.03]' :
              signalRating.grade === '--' ? 'border-rh-border text-rh-muted bg-rh-dark' :
              'border-rh-red/50 text-rh-red bg-rh-red/5 shadow-[inset_0_0_12px_-4px_rgba(232,84,78,0.15)] hover:shadow-[inset_0_0_16px_-4px_rgba(232,84,78,0.25)] hover:scale-[1.03]'
            }`}>
              {signalRating.grade}
            </div>
            <span className="text-[9px] text-rh-muted/50 mt-1 uppercase tracking-wider">Signal</span>

            {/* Signal tooltip - authoritative explanation */}
            {showSignalTooltip && (
              <div className="absolute top-full mt-2 right-0 z-20 w-52 p-3 bg-rh-dark border border-rh-border rounded-lg shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
                <p className="text-[10px] text-rh-text/80 leading-relaxed mb-2">
                  Signal grade based on:
                </p>
                <ul className="space-y-1.5 text-[10px] text-rh-muted/70">
                  <li className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-rh-muted/40 mt-1.5 shrink-0" />
                    Risk-adjusted return
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-rh-muted/40 mt-1.5 shrink-0" />
                    Drawdown control
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-rh-muted/40 mt-1.5 shrink-0" />
                    Market correlation
                  </li>
                </ul>
                <p className="text-[9px] text-rh-muted/50 mt-2.5 pt-2 border-t border-rh-border/30">
                  Stable signal (30d)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            2. SOCIAL PROOF STRIP
            ═══════════════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-rh-border/50">
          {isNewAccount ? (
            // Empty state for new accounts
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs text-rh-muted/60">
                <span className="w-1.5 h-1.5 rounded-full bg-rh-green/50 animate-pulse" />
                <span>Performance tracking started — be the first to follow</span>
              </div>
              <p className="text-[10px] text-rh-muted/40 pl-3.5">
                Followers get notified when risk posture or signal changes
              </p>
            </div>
          ) : (
            <>
              <button className="group flex items-baseline gap-1.5 hover:opacity-80 transition-opacity">
                <span className="text-base font-semibold text-rh-text group-hover:text-rh-green transition-colors">
                  {profile.followerCount}
                </span>
                <span className="text-xs text-rh-muted group-hover:underline decoration-rh-muted/30">Followers</span>
              </button>
              <button className="group flex items-baseline gap-1.5 hover:opacity-80 transition-opacity">
                <span className="text-base font-semibold text-rh-text group-hover:text-rh-green transition-colors">
                  {profile.followingCount}
                </span>
                <span className="text-xs text-rh-muted group-hover:underline decoration-rh-muted/30">Following</span>
              </button>
            </>
          )}

          {rankPercentile !== null && rankPercentile <= 80 && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-rh-green/10 text-rh-green border border-rh-green/20">
              Top {100 - rankPercentile}%
            </span>
          )}

          {/* Follow button - pushed to right */}
          {!isOwner && (
            <div className="ml-auto">
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
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          3. PERFORMANCE CARDS (with hierarchy)
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && hasPerformance && (
        <div className="mb-3 space-y-2">
          {/* Primary row: TWR (large) + SPY badge - visually connected */}
          <div className={`flex flex-col sm:flex-row rounded-xl overflow-hidden ${
            (perf?.twrPct ?? 0) >= 0
              ? 'bg-gradient-to-r from-rh-green/[0.03] to-transparent'
              : 'bg-gradient-to-r from-rh-red/[0.03] to-transparent'
          }`}>
            {/* TWR - Hero card */}
            <div className={`flex-1 bg-rh-card border rounded-xl sm:rounded-r-none p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
              (perf?.twrPct ?? 0) >= 0
                ? 'border-rh-green/30 shadow-[0_0_20px_-5px_rgba(0,200,5,0.2)]'
                : 'border-rh-red/30 shadow-[0_0_20px_-5px_rgba(232,84,78,0.2)]'
            }`}>
              <p className="text-[10px] text-rh-muted uppercase tracking-wider mb-1">Time-Weighted Return</p>
              <p className={`text-2xl font-bold ${(perf?.twrPct ?? 0) >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {perf?.twrPct !== null ? `${perf.twrPct >= 0 ? '+' : ''}${perf.twrPct.toFixed(2)}%` : '--'}
              </p>
              <p className="text-[10px] text-rh-muted/50 mt-1">1 month</p>
            </div>

            {/* SPY Comparison - connected to TWR */}
            {perf?.alphaPct !== null && (
              <div className={`w-full sm:w-32 flex flex-col items-center justify-center rounded-xl sm:rounded-l-none sm:-ml-px p-3 border ${
                perf.alphaPct >= 0
                  ? 'border-rh-green/30 bg-rh-card'
                  : 'border-rh-red/30 bg-rh-card'
              }`}>
                <span className={`text-lg font-bold ${perf.alphaPct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {perf.alphaPct >= 0 ? '+' : ''}{perf.alphaPct.toFixed(2)}%
                </span>
                <span className="text-[9px] text-rh-muted/60 uppercase tracking-wider mt-0.5">
                  vs {perf.benchmarkTicker}
                </span>
              </div>
            )}
          </div>

          {/* Secondary row: analytical metrics (muted) */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <MetricCard label="Volatility" value={perf?.volatilityPct !== null ? `${perf.volatilityPct.toFixed(1)}%` : '--'} />
            <MetricCard label="Max DD" value={perf?.maxDrawdownPct !== null ? `-${perf.maxDrawdownPct.toFixed(1)}%` : '--'} />
            <MetricCard label="Beta" value={perf?.beta !== null ? perf.beta.toFixed(2) : '--'} />
            <MetricCard label="Best" value={perf?.bestDay ? `+${perf.bestDay.returnPct.toFixed(1)}%` : '--'} accent="green" />
            <MetricCard label="Worst" value={perf?.worstDay ? `${perf.worstDay.returnPct.toFixed(1)}%` : '--'} accent="red" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          4. SIGNAL SUMMARY (enhanced)
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && hasPerformance && (
        <div className="bg-rh-card border border-rh-border rounded-xl p-4 mb-3">
          <h3 className="text-[10px] font-semibold text-rh-muted/60 uppercase tracking-wider mb-3">Signal Summary</h3>
          <div className="space-y-2.5 text-xs">
            {intelligence?.topContributor && (
              <div className="flex justify-between items-center group">
                <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">Top contributor</span>
                <span className="text-rh-green font-medium">
                  {intelligence.topContributor.ticker} <span className="text-rh-green/70">+{intelligence.topContributor.pct.toFixed(1)}%</span>
                </span>
              </div>
            )}
            {intelligence?.largestDrag && (
              <div className="flex justify-between items-center group">
                <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">Largest drag</span>
                <span className="text-rh-red font-medium">
                  {intelligence.largestDrag.ticker} <span className="text-rh-red/70">{intelligence.largestDrag.pct.toFixed(1)}%</span>
                </span>
              </div>
            )}
            {intelligence?.topHoldingWeight && (
              <div className="flex justify-between items-center group">
                <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">Largest position</span>
                <span className="text-rh-text font-medium">{intelligence.topHoldingWeight.toFixed(1)}%</span>
              </div>
            )}
            <div className="flex justify-between items-center group">
              <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">Risk posture</span>
              <span className={`font-medium ${riskPosture.color}`}>{riskPosture.level}</span>
            </div>
            {perf?.correlation !== null && (
              <div className="flex justify-between items-center group">
                <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">SPY correlation</span>
                <span className="text-rh-text font-medium">{perf.correlation.toFixed(2)}</span>
              </div>
            )}
            {intelligence?.topContributor && perf?.twrPct && Math.abs(perf.twrPct) > 0 && (
              <div className="flex justify-between items-center group">
                <span className="text-rh-muted group-hover:text-rh-muted/80 transition-colors">Return concentration</span>
                <span className="text-rh-text/70 font-medium">
                  {Math.abs(intelligence.topContributor.pct / perf.twrPct) > 0.6 ? 'High' :
                   Math.abs(intelligence.topContributor.pct / perf.twrPct) > 0.3 ? 'Medium' : 'Low'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          5. LATEST MOVES
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && profile.recentActivity && profile.recentActivity.length > 0 && (
        <LatestMovesSection
          events={profile.recentActivity.slice(0, 5)}
          onTickerClick={onStockClick}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          6. HOLDINGS VISIBILITY (Owner only)
          ═══════════════════════════════════════════════════════════════ */}
      {isOwner && (
        <div className="bg-rh-card border border-rh-border rounded-xl p-4 mb-3">
          <h3 className="text-[10px] font-semibold text-rh-muted/60 uppercase tracking-wider mb-3">Holdings Visibility</h3>
          <HoldingsVisibilityToggle
            value={profile.holdingsVisibility ?? 'all'}
            onChange={async (val) => {
              setProfile((p) => p ? { ...p, holdingsVisibility: val } : p);
              await updateHoldingsVisibility(userId, val);
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          6. REGION (Owner only - passive metadata)
          ═══════════════════════════════════════════════════════════════ */}
      {isOwner && (
        <div className="bg-rh-card border border-rh-border rounded-xl p-4 mb-3">
          <h3 className="text-[10px] font-semibold text-rh-muted/60 uppercase tracking-wider mb-3">Region</h3>
          <div className="flex items-center justify-between">
            <span className="text-xs text-rh-muted">
              {profile.region ? (profile.showRegion ? regionShort(profile.region) : 'Not disclosed') : 'Not set'}
            </span>
            <select
              value={`${profile.region ?? ''}|${profile.showRegion ? '1' : '0'}`}
              onChange={async (e) => {
                const [region, show] = e.target.value.split('|');
                const newRegion = region || null;
                const newShow = show === '1';
                setProfile((p) => p ? { ...p, region: newRegion, showRegion: newShow } : p);
                await updateUserRegion(userId, newRegion, newShow);
              }}
              className="text-xs text-rh-text bg-rh-dark border border-rh-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-rh-green/50 cursor-pointer hover:border-rh-muted transition-colors"
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          7. VIEW PORTFOLIO CTA
          ═══════════════════════════════════════════════════════════════ */}
      {profile.profilePublic && (
        <button
          onClick={() => setShowPortfolio(true)}
          className="w-full py-3.5 text-sm font-semibold rounded-xl bg-rh-dark border border-rh-border
            text-rh-text hover:bg-rh-green/5 hover:border-rh-green/30 hover:text-rh-green transition-all group"
        >
          <span className="flex items-center justify-center gap-2">
            View Full Portfolio
            <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>
      )}

      {/* Private Profile */}
      {!profile.profilePublic && (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-rh-dark border border-rh-border flex items-center justify-center">
            <svg className="w-5 h-5 text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-sm text-rh-muted">This profile is private</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// METRIC CARD (Secondary - muted, analytical)
// ═══════════════════════════════════════════════════════════════════════
function MetricCard({ label, value, accent }: {
  label: string;
  value: string;
  accent?: 'green' | 'red';
}) {
  const valueColor = accent === 'green' ? 'text-rh-green/80' :
                     accent === 'red' ? 'text-rh-red/80' :
                     'text-rh-text/80';

  return (
    <div className="bg-rh-card border border-rh-border/50 rounded-lg p-2.5 hover:border-rh-border transition-colors">
      <p className="text-[9px] text-rh-muted/35 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs font-medium ${valueColor}`}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HOLDINGS VISIBILITY TOGGLE (with descriptions)
// ═══════════════════════════════════════════════════════════════════════
function HoldingsVisibilityToggle({ value, onChange }: {
  value: string;
  onChange: (val: string) => void;
}) {
  const options = [
    { val: 'all', label: 'Public', desc: 'All holdings visible to others' },
    { val: 'top5', label: 'Partial', desc: 'Top 5 positions visible' },
    { val: 'hidden', label: 'Private', desc: 'Holdings hidden from viewers' },
  ];

  const selected = options.find(o => o.val === value || (o.val === 'top5' && value === 'sectors')) ?? options[0];

  return (
    <div>
      <div className="flex gap-1">
        {options.map((opt) => {
          const isActive = value === opt.val || (opt.val === 'top5' && value === 'sectors');
          return (
            <button
              key={opt.val}
              onClick={() => onChange(opt.val)}
              className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all ${
                isActive
                  ? 'bg-rh-green/10 text-rh-green border border-rh-green/40 shadow-[0_0_10px_-3px_rgba(0,200,5,0.3)]'
                  : 'bg-rh-dark text-rh-muted border border-rh-border hover:border-rh-muted/50 hover:text-rh-text'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-rh-muted/50 mt-2 pl-1">{selected.desc}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LATEST MOVES SECTION
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

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function LatestMovesSection({ events, onTickerClick }: {
  events: ActivityEvent[];
  onTickerClick?: (ticker: string) => void;
}) {
  return (
    <div className="bg-rh-card border border-rh-border rounded-xl p-4 mb-3">
      <h3 className="text-xs font-semibold text-rh-muted uppercase tracking-wider mb-3">
        Latest Moves
      </h3>
      <div className="space-y-2.5">
        {events.map((event) => {
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
            <div key={event.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-semibold ${isSell ? 'text-rh-red' : 'text-rh-green'}`}>
                  {verb}
                </span>
                <button
                  onClick={() => onTickerClick?.(event.payload.ticker)}
                  className="text-sm font-bold text-rh-text hover:text-rh-green transition-colors"
                >
                  {event.payload.ticker}
                </button>
                {details && (
                  <span className="text-sm text-rh-muted">{details}</span>
                )}
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {notionalValue && notionalValue >= 1000 && (
                  <span className="text-sm text-rh-text/70 tabular-nums font-medium">
                    {formatValue(notionalValue)}
                  </span>
                )}
                <span className="text-xs text-rh-muted tabular-nums">
                  {formatRelativeTime(event.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
