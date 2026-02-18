import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkHasPassword } from '../api';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { MfaVerifyStep } from './MfaVerifyStep';
import { PLANS } from '../data/plans';

const EyeIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const EyeOffIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
const Spinner = () => (<svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>);
const CheckIcon = ({ className = '' }: { className?: string }) => (<svg className={`w-4 h-4 text-rh-green shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>);

const sf = { fontFamily: "'DM Serif Display', Georgia, serif" };
const noScroll = { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties;

const FEATURE_SLIDES = [
  { src: '/screenshots/daily-brief.jpg', title: 'Daily AI Brief', desc: 'AI-generated market summary every morning with portfolio analysis and key movers.' },
  { src: '/screenshots/portfolio-main.jpg', title: 'Portfolio Dashboard', desc: 'Live charts, P/L tracking, margin, and performance metrics — everything in one view.' },
  { src: '/screenshots/chart-spy.jpg', title: 'SPY Overlay', desc: 'Compare against SPY, QQQ, or DIA. Measure any range with tap-and-drag.' },
  { src: '/screenshots/watchlist.jpg', title: 'Watchlists', desc: 'Unlimited watchlists with live charts, P/L tracking, and multi-period performance.' },
  { src: '/screenshots/heatmap.jpg', title: 'Market Heatmap', desc: 'Visual market overview by sector and cap. See where the money is moving at a glance.' },
  { src: '/screenshots/insights.jpg', title: 'AI Intelligence', desc: 'Momentum detection, contributor analysis, sector drivers, and portfolio pulse.' },
  { src: '/screenshots/dividends.jpg', title: 'Dividends', desc: 'Income tracking, upcoming payments, DRIP automation, and dividend history.' },
  { src: '/screenshots/leaderboard.jpg', title: 'Leaderboard', desc: 'Compete with thousands of investors for monthly cash prizes.' },
  { src: '/screenshots/activity.jpg', title: 'Activity Feed', desc: 'See what other investors are buying and selling in real time.' },
];

const FAQ_ITEMS = [
  { q: 'What is Nala?', a: 'Nala is a social investing platform with AI-powered portfolio intelligence. Track your holdings, compete on the leaderboard, and win monthly cash prizes — all in one place.' },
  { q: 'How do monthly competitions work?', a: 'Every month, we track portfolio performance across all participants. The top 3 performers win cash prizes ($1,000, $500, $250). Performance is verified and calculated automatically.' },
  { q: 'Is the activity feed public?', a: 'You control your privacy. You can share trades, milestones, and performance — or keep your portfolio completely private. It\'s up to you.' },
  { q: 'Do you store my brokerage credentials?', a: 'Never. Brokerage linking is handled securely through Plaid with AES-256 encryption. We never have access to your login credentials.' },
  { q: 'Is Nala free?', a: 'Yes! The free plan includes portfolio tracking, charts, heatmap, leaderboard access, and the activity feed. Upgrade for AI features, unlimited holdings, and competition entry.' },
];

export function LandingPage() {
  const { login, signup, mfaChallenge } = useAuth();
  const { showToast } = useToast();

  const featuresRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const faqRef = useRef<HTMLElement>(null);
  // scrollToRef is defined in the pull-to-refresh block below

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const openAuth = (mode: 'login' | 'signup') => { setAuthMode(mode); setAuthOpen(true); };

  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [privacyTab, setPrivacyTab] = useState<'privacy' | 'terms'>('privacy');

  const [phoneSlide, setPhoneSlide] = useState(0);
  const phoneRef = useRef<HTMLDivElement>(null);
  const onPhoneScroll = useCallback(() => { const el = phoneRef.current; if (!el) return; setPhoneSlide(Math.round(el.scrollLeft / el.offsetWidth)); }, []);
  useEffect(() => {
    if (phoneSlide >= 4) { openAuth('signup'); setTimeout(() => { const el = phoneRef.current; if (el) el.scrollTo({ left: 0 }); setPhoneSlide(0); }, 300); }
  }, [phoneSlide]);

  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const [activeSlide, setActiveSlide] = useState(1);
  const carouselRef = useRef<HTMLDivElement>(null);
  const handleCarouselScroll = useCallback(() => { const el = carouselRef.current; if (!el) return; setActiveSlide(Math.min(Math.max(Math.round(el.scrollLeft / el.offsetWidth), 0), PLANS.length - 1)); }, []);
  useEffect(() => { const el = carouselRef.current; if (el) el.scrollLeft = el.offsetWidth; }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => { if (!authOpen) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAuthOpen(false); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [authOpen]);
  useEffect(() => { setError(''); setPasswordValue(''); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false); if (authMode === 'login') { setDisplayName(''); setAcceptedTerms(false); } }, [authOpen, authMode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setIsLoading(true);
    try {
      if (authMode === 'signup') {
        if (!username.trim() || !displayName.trim()) { setError('Username and display name are required'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { setError('Password must include uppercase, lowercase, and a number'); return; }
        if (!acceptedTerms) { setError('You must accept the Privacy Policy and Terms of Service'); return; }
        await signup(username, displayName, password, { acceptedPrivacyPolicy: true, acceptedTerms: true });
      } else { await login(username, password); }
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); } finally { setIsLoading(false); }
  };
  const checkAndSwitchMode = async () => { if (!username.trim() || authMode !== 'login') return; try { const r = await checkHasPassword(username); if (!r.hasPassword) showToast('This account needs a password.', 'info'); } catch { /* ignore */ } };

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.4, 80));
    } else {
      pulling.current = false;
      setPullY(0);
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY > 50) {
      setRefreshing(true);
      setPullY(50);
      setTimeout(() => window.location.reload(), 600);
    } else {
      setPullY(0);
    }
  }, [pullY]);

  // Override scrollTo to work with inner scroll container
  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current;
    const container = scrollRef.current;
    if (el && container) {
      const top = el.offsetTop - 70; // offset for nav height
      container.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const ic = "w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/60 focus-visible:border-rh-green transition-all duration-150";

  return (
    <div className="h-screen h-dvh bg-[#050505] text-white overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>

      {/* ═══ NAV — in the non-scrolling shell ═══ */}
      <nav className="relative z-40 bg-[#050505] border-b border-white/[0.04] shrink-0">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5"><img src="/north-signal-logo.png" alt="" className="h-7 w-7" /><span className="text-lg font-bold text-white tracking-tight">Nala</span></div>
          <div className="hidden sm:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            <button onClick={() => scrollToRef(featuresRef)} className="text-[13px] text-white/50 hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollToRef(pricingRef)} className="text-[13px] text-white/50 hover:text-white transition-colors">Pricing</button>
            <button onClick={() => scrollToRef(faqRef)} className="text-[13px] text-white/50 hover:text-white transition-colors">FAQ</button>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <button onClick={() => openAuth('login')} className="text-[13px] text-white/60 hover:text-white transition-colors">Log in</button>
            <button onClick={() => openAuth('signup')} className="px-4 py-1.5 text-[13px] text-white/90 font-medium border border-white/[0.15] rounded-full hover:border-white/30 transition-all">Open Account</button>
          </div>
          <div className="flex sm:hidden items-center gap-3">
            <button onClick={() => openAuth('login')} className="text-[13px] text-white/60">Log in</button>
            <button onClick={() => openAuth('signup')} className="px-3 py-1.5 text-[13px] text-white/90 border border-white/[0.15] rounded-full">Sign Up</button>
          </div>
        </div>
      </nav>

      {/* Pull-to-refresh indicator (between nav and content) */}
      <div
        className="flex items-center justify-center overflow-hidden shrink-0 bg-[#050505]"
        style={{
          height: pullY > 0 ? `${pullY}px` : '0px',
          transition: pulling.current ? 'none' : 'height 0.3s ease',
        }}
      >
        <img
          src="/north-signal-logo.png"
          alt=""
          className={`h-6 w-6 ${refreshing ? 'animate-spin' : ''}`}
          style={{ opacity: pullY > 10 ? Math.min(pullY / 50, 1) : 0, transform: refreshing ? undefined : `rotate(${pullY * 4}deg)` }}
        />
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >

      {/* ═══ HERO ═══ */}
      <section className="pt-6 sm:pt-12 pb-16 sm:pb-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Phone — cut in half, swipeable */}
          <div className="relative mx-auto w-[260px] sm:w-[300px] mb-10 sm:mb-14">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-rh-green/[0.05] rounded-full blur-[100px] pointer-events-none" />
            <div className="relative overflow-hidden rounded-t-[2.5rem]" style={{ height: 'clamp(380px, 40vh, 520px)' }}>
              <div className="rounded-[2.5rem] border border-white/[0.1] bg-[#0a0a0a] p-2 shadow-2xl shadow-black/50">
                <div className="rounded-[2rem] overflow-hidden">
                  <div ref={phoneRef} onScroll={onPhoneScroll} className="flex snap-x snap-mandatory overflow-x-auto" style={noScroll}>
                    {[
                      { src: '/screenshots/chart-spy.jpg', alt: 'Portfolio chart with SPY comparison' },
                      { src: '/screenshots/heatmap.jpg', alt: 'Market Heatmap' },
                      { src: '/screenshots/leaderboard.jpg', alt: 'Monthly competition leaderboard' },
                      { src: '/screenshots/activity.jpg', alt: 'Community activity feed' },
                      { src: '/screenshots/daily-brief.jpg', alt: 'Daily AI Brief' },
                    ].map((s, i) => (
                      <div key={i} className="snap-center shrink-0 w-full bg-[#090909]">
                        <img src={s.src} alt={s.alt} className="w-full block" draggable={false} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none z-10" />
            </div>
            <div className="flex items-center justify-center gap-2 mt-3">{[0,1,2,3,4].map(i=><button key={i} onClick={()=>{const el=phoneRef.current;if(el)el.scrollTo({left:i*el.offsetWidth,behavior:'smooth'});}} className={`rounded-full transition-all duration-300 ${phoneSlide===i?'w-6 h-1.5 bg-white/40':'w-1.5 h-1.5 bg-white/15'}`}/>)}</div>
          </div>

          <div className="text-center">
            <h1 className="text-[clamp(2rem,6vw,3.5rem)] leading-[1.1] mb-5 text-white/95" style={sf}>
              The market is public.<br />Your strategy <em className="italic">should be too.</em>
            </h1>
            <p className="text-sm sm:text-base text-white/30 max-w-lg mx-auto mb-8 leading-relaxed">
              Track your portfolio, compete with thousands of investors, and win monthly cash prizes — powered by AI.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => scrollToRef(featuresRef)} className="px-6 py-2.5 text-[13px] text-white/60 font-medium border border-white/[0.12] rounded-full hover:border-white/25 hover:text-white transition-all">Learn More</button>
              <button onClick={() => openAuth('signup')} className="px-6 py-2.5 text-[13px] text-black font-semibold bg-white rounded-full hover:bg-white/90 transition-colors">Open Account</button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 sm:gap-16 mt-14 sm:mt-28 pt-10 border-t border-white/[0.04]">
            {[{ v: '10,000+', l: 'Investors' }, { v: '$21,000', l: 'Prizes Awarded' }, { v: '5', l: 'AI Models' }].map(s => (
              <div key={s.l} className="text-center"><div className="text-lg sm:text-xl font-bold text-white/80">{s.v}</div><div className="text-[10px] text-white/20 mt-0.5">{s.l}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MONTHLY COMPETITION ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-4 text-white/95" style={sf}>Win <em className="italic">cash & prizes</em> every month</h2>
            <p className="text-sm sm:text-base text-white/30 max-w-lg mx-auto">Track your real portfolio performance. The top performers each month take home real cash prizes.</p>
          </div>

          {/* Prize tiers */}
          <div className="grid grid-cols-3 gap-4 sm:gap-6 max-w-2xl mx-auto mb-16">
            {[
              { place: '2nd Place', prize: '$500', emoji: '🥈', h: 'h-32 sm:h-40', bg: 'from-slate-400/10 to-slate-600/5', border: 'border-slate-400/15' },
              { place: '1st Place', prize: '$1,000', emoji: '🥇', h: 'h-40 sm:h-52', bg: 'from-yellow-400/15 to-amber-600/5', border: 'border-yellow-400/20' },
              { place: '3rd Place', prize: '$250', emoji: '🥉', h: 'from-amber-600/10 to-amber-800/5', bg: 'from-amber-600/10 to-amber-800/5', border: 'border-amber-600/15' },
            ].map((tier, i) => (
              <div key={tier.place} className={`flex flex-col items-center justify-end ${i === 1 ? '' : 'pt-8 sm:pt-12'}`}>
                <div className={`w-full rounded-2xl border ${tier.border} bg-gradient-to-b ${tier.bg} flex flex-col items-center justify-center ${i === 1 ? 'h-40 sm:h-52' : 'h-32 sm:h-40'} transition-all`}>
                  <span className="text-3xl sm:text-4xl mb-2">{tier.emoji}</span>
                  <div className="text-xl sm:text-2xl font-bold text-white/90">{tier.prize}</div>
                  <div className="text-[10px] sm:text-[11px] text-white/30 mt-1">{tier.place}</div>
                </div>
              </div>
            ))}
          </div>

          {/* How it works */}
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { step: '01', title: 'Track your portfolio', desc: 'Add your real holdings or connect your brokerage via Plaid. Your performance is tracked automatically.' },
              { step: '02', title: 'Compete monthly', desc: 'Your portfolio return is calculated each month. Climb the leaderboard and watch your rank in real time.' },
              { step: '03', title: 'Win cash prizes', desc: 'Top 3 performers each month win real cash prizes deposited directly to their account.' },
            ].map(s => (
              <div key={s.step} className="text-center sm:text-left">
                <div className="text-[11px] text-rh-green font-bold mb-2">{s.step}</div>
                <h3 className="text-[15px] font-semibold text-white/70 mb-2">{s.title}</h3>
                <p className="text-[12px] text-white/25 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES — SWIPEABLE CAROUSEL ═══ */}
      <section ref={featuresRef} className="py-20 sm:py-28 bg-[#080808]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-4 text-white/95" style={sf}>A <em className="italic text-rh-green">powerful</em> investing platform</h2>
            <p className="text-sm sm:text-base text-white/30 max-w-lg mx-auto">Everything you need to track, analyze, and grow your investments.</p>
          </div>
        </div>
        <div className="flex gap-4 xl:gap-3 overflow-x-auto snap-x snap-mandatory xl:snap-none pb-4 px-5 sm:px-8" style={noScroll}>
          {FEATURE_SLIDES.map((f, i) => (
            <div key={i} className="snap-start shrink-0 w-[clamp(240px,65vw,300px)] xl:shrink xl:flex-1 xl:min-w-0 xl:w-auto">
              <div className="rounded-[1.5rem] xl:rounded-2xl border border-white/[0.08] bg-[#0a0a0a] overflow-hidden shadow-lg shadow-black/30 h-[clamp(420px,38vw,620px)] xl:h-auto xl:aspect-[9/16]">
                <img src={f.src} alt={f.title} className="w-full block" draggable={false} />
              </div>
              <div className="mt-3 text-center px-1">
                <h3 className="text-[13px] xl:text-[11px] 2xl:text-[13px] font-semibold text-white/60 mb-0.5" style={sf}>{f.title}</h3>
                <p className="text-[11px] xl:text-[10px] 2xl:text-[11px] text-white/20 leading-relaxed xl:line-clamp-2">{f.desc}</p>
              </div>
            </div>
          ))}
          <div className="shrink-0 w-5 sm:w-8 xl:hidden" aria-hidden="true" />
        </div>
      </section>

      {/* ═══ SECURE BY DESIGN ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl sm:text-[2.8rem] leading-[1.1] mb-4 text-white/95" style={sf}><em className="italic">Secure</em> by design</h2>
          <p className="text-center text-sm text-white/30 mb-14 max-w-lg mx-auto">Bank-level security to protect your data and privacy.</p>
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0b] p-8 flex flex-col items-center justify-center">
              <div className="relative mb-5"><div className="absolute inset-0 -m-8 bg-rh-green/[0.03] rounded-full blur-3xl" /><svg viewBox="0 0 80 80" className="w-24 h-24 relative"><rect x="15" y="30" width="50" height="40" rx="4" fill="none" stroke="#00C805" strokeWidth="1.5" opacity="0.3" /><rect x="28" y="15" width="24" height="20" rx="12" fill="none" stroke="#00C805" strokeWidth="1.5" opacity="0.3" /><circle cx="40" cy="48" r="5" fill="#00C805" opacity="0.25" /><line x1="40" y1="53" x2="40" y2="60" stroke="#00C805" strokeWidth="1.5" opacity="0.25" /></svg></div>
              <div className="text-sm text-white/30 text-center font-medium">AES-256 Encryption</div><div className="text-[11px] text-white/15 text-center mt-1">Data encrypted at rest and in transit</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {[{t:'Multi-Factor Auth',d:'TOTP, email OTP, and backup codes'},{t:'Encrypted Storage',d:'AES-256-GCM for all sensitive data'},{t:'Secure Cookies',d:'httpOnly, SameSite, Secure flags'},{t:'Rate Limiting',d:'Per-user API rate limits'},{t:'CORS Protection',d:'Strict origin whitelisting'},{t:'Plaid Security',d:'Tokens encrypted, never exposed'}].map(f=>(
                <div key={f.t} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 mt-0.5 rounded-full bg-rh-green/10 flex items-center justify-center shrink-0"><svg className="w-3 h-3 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                  <div><div className="text-[13px] font-medium text-white/50">{f.t}</div><div className="text-[11px] text-white/20">{f.d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section ref={pricingRef} className="py-20 sm:py-28 px-5 sm:px-8 bg-[#080808]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-4 text-white/95" style={sf}>Transparent <em className="italic">pricing</em></h2>
            <p className="text-sm text-white/25 max-w-sm mx-auto mb-8">Start free. Upgrade when you need more power.</p>
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
              <button onClick={() => setBilling('monthly')} className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${billing === 'monthly' ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'}`}>Monthly</button>
              <button onClick={() => setBilling('yearly')} className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${billing === 'yearly' ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'}`}>Yearly <span className="text-rh-green ml-1">-35%</span></button>
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-3 gap-5 mb-8">
            {PLANS.map(plan => { const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice; return (
              <div key={plan.id} className={`relative rounded-2xl p-6 flex flex-col border transition-all ${plan.highlight ? 'border-rh-green/20 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
                {plan.highlight && <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-rh-green/50 to-transparent" />}
                <div className="mb-5"><div className="flex items-center gap-2 mb-3"><h3 className="text-sm font-semibold text-white/70">{plan.name}</h3>{plan.highlight && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rh-green/15 text-rh-green">Popular</span>}</div><div className="flex items-baseline gap-1"><span className="text-3xl font-bold text-white">${price}</span>{price > 0 && <span className="text-sm text-white/25">/{billing === 'yearly' ? 'yr' : 'mo'}</span>}</div><p className="text-xs text-white/25 mt-2">{plan.description}</p></div>
                <ul className="flex-1 space-y-2.5 mb-6">{plan.features.map(f => <li key={f} className="flex items-start gap-2 text-[13px]"><CheckIcon className="mt-0.5" /><span className="text-white/50">{f}</span></li>)}</ul>
                <button onClick={() => openAuth('signup')} className={`w-full py-2.5 rounded-full text-[13px] font-medium transition-all min-h-[44px] ${plan.highlight ? 'bg-white text-black hover:bg-white/90' : 'border border-white/[0.1] text-white/50 hover:border-white/20'}`}>Get Started</button>
              </div>
            ); })}
          </div>
          <div className="sm:hidden">
            <div ref={carouselRef} onScroll={handleCarouselScroll} className="flex overflow-x-auto snap-x snap-mandatory -mx-5 px-5 gap-3" style={noScroll}>
              {PLANS.map((plan, idx) => { const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice; return (
                <div key={plan.id} className="snap-center shrink-0 w-[calc(100vw-56px)]">
                  <div className={`rounded-2xl p-6 flex flex-col min-h-[380px] border transition-all duration-300 ${plan.highlight ? 'border-rh-green/20 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'} ${activeSlide === idx ? 'opacity-100' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-3"><h3 className="text-sm font-semibold text-white/70">{plan.name}</h3>{plan.highlight && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rh-green/15 text-rh-green">Popular</span>}</div>
                    <div className="flex items-baseline gap-1 mb-1"><span className="text-3xl font-bold text-white">${price}</span>{price > 0 && <span className="text-sm text-white/25">/{billing === 'yearly' ? 'yr' : 'mo'}</span>}</div>
                    <p className="text-xs text-white/25 mb-5">{plan.description}</p>
                    <ul className="flex-1 space-y-2 mb-5">{plan.features.map(f => <li key={f} className="flex items-start gap-2 text-[13px]"><CheckIcon className="mt-0.5" /><span className="text-white/50">{f}</span></li>)}</ul>
                    <button onClick={() => openAuth('signup')} className={`w-full py-2.5 rounded-full text-[13px] font-medium min-h-[44px] ${plan.highlight ? 'bg-white text-black' : 'border border-white/[0.1] text-white/50'}`}>Get Started</button>
                  </div>
                </div>
              ); })}
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">{PLANS.map((_, idx) => <button key={idx} onClick={() => { const el = carouselRef.current; if (el) el.scrollTo({ left: idx * el.offsetWidth, behavior: 'smooth' }); }} className={`rounded-full transition-all duration-300 ${activeSlide === idx ? 'w-6 h-1.5 bg-white/50' : 'w-1.5 h-1.5 bg-white/15'}`} />)}</div>
          </div>
        </div>
      </section>

      {/* ═══ LOGOS ═══ */}
      <section className="border-y border-white/[0.04] py-8"><div className="max-w-5xl mx-auto px-5 sm:px-8"><div className="flex items-center justify-center gap-10 sm:gap-16 opacity-25">{['Finnhub','Polygon','Alpha Vantage','Plaid','Stripe'].map(n=><span key={n} className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white whitespace-nowrap">{n}</span>)}</div></div></section>

      {/* ═══ CTA ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 text-center">
        <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-5 text-white/95" style={sf}>Start competing in less than<br /><span className="text-rh-green italic">10 minutes</span> today</h2>
        <p className="text-sm text-white/25 mb-10 max-w-sm mx-auto">Create your free account, add your holdings, and join this month's competition.</p>
        <div className="flex items-center justify-center gap-3 mb-10">
          {['Sign up','Add holdings','Start competing'].map((step,i)=>(
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${i===2?'bg-rh-green/20 text-rh-green':'bg-white/[0.05] text-white/30'}`}>{i+1}</div><span className="text-[11px] text-white/25">{step}</span></div>
              {i<2&&<div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>
        <button onClick={() => openAuth('signup')} className="px-7 py-2.5 text-[13px] text-black font-semibold bg-white rounded-full hover:bg-white/90 transition-colors">Open Account</button>
      </section>

      {/* ═══ FAQ ═══ */}
      <section ref={faqRef} className="py-20 sm:py-28 px-5 sm:px-8 bg-[#080808]">
        <div className="max-w-5xl mx-auto"><div className="grid md:grid-cols-5 gap-10 md:gap-16">
          <div className="md:col-span-2"><span className="text-rh-green text-[11px] font-semibold uppercase tracking-[0.2em] mb-4 block">Support</span><h2 className="text-2xl sm:text-[2.5rem] leading-[1.1] text-white/90" style={sf}>Frequently<br />asked <em className="italic">questions</em></h2></div>
          <div className="md:col-span-3"><div className="border border-white/[0.06] rounded-2xl overflow-hidden">{FAQ_ITEMS.map((item, i) => (
            <div key={i} className={i > 0 ? 'border-t border-white/[0.04]' : ''}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left group"><span className="text-[13px] font-medium text-white/50 group-hover:text-white/70 transition-colors pr-4">{item.q}</span><svg className={`w-4 h-4 text-white/15 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></button>
              <div className={`overflow-hidden transition-all duration-200 ${openFaq === i ? 'max-h-40 pb-4' : 'max-h-0'}`}><p className="px-5 text-[12px] text-white/25 leading-relaxed">{item.a}</p></div>
            </div>
          ))}</div></div>
        </div></div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/[0.04] py-12 px-5 sm:px-8"><div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1"><div className="flex items-center gap-2 mb-3"><img src="/north-signal-logo.png" alt="" className="h-6 w-6" /><span className="text-sm font-bold text-white/70">Nala</span></div><p className="text-[11px] text-white/15 leading-relaxed">AI-powered social investing platform for the next generation.</p></div>
          <div><h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">Product</h4><div className="space-y-2">{['Portfolio','Heatmap','AI Insights','Leaderboard','Dividends'].map(l=><button key={l} onClick={()=>scrollToRef(featuresRef)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">{l}</button>)}</div></div>
          <div><h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">Company</h4><div className="space-y-2"><button onClick={()=>scrollToRef(pricingRef)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Pricing</button><button onClick={()=>{setPrivacyTab('privacy');setShowPrivacyPolicy(true);}} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Privacy Policy</button><button onClick={()=>{setPrivacyTab('terms');setShowPrivacyPolicy(true);}} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Terms of Service</button></div></div>
          <div><h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">Resources</h4><div className="space-y-2"><button onClick={()=>scrollToRef(faqRef)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">FAQ</button><button onClick={()=>openAuth('signup')} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Get Started</button></div></div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-white/[0.04] gap-3"><div className="text-[10px] text-white/10">&copy; 2026 Piques LLC. All rights reserved.</div><p className="text-[10px] text-white/10 text-center">Past performance does not guarantee future results. Not financial advice.</p></div>
      </div></footer>

      </div>{/* end scrollable content */}

      {/* ═══ AUTH MODAL ═══ */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isLoading && setAuthOpen(false)} />
          <div className="relative w-full max-w-sm bg-[#0e0e0e] rounded-2xl p-6 shadow-2xl border border-white/[0.06]">
            <button onClick={() => setAuthOpen(false)} className="absolute top-3 right-3 p-1.5 text-white/20 hover:text-white/50 transition-colors" aria-label="Close"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div className="text-center mb-6"><div className="inline-flex items-center gap-2"><img src="/north-signal-logo.png" alt="" className="h-7 w-7" /><span className="text-lg font-bold text-white tracking-tight">Nala</span></div></div>
            {mfaChallenge ? <MfaVerifyStep challenge={mfaChallenge} /> : (
              <>
                <h2 className="text-base font-semibold text-white/90 mb-5">{authMode === 'signup' ? 'Create Account' : 'Welcome Back'}</h2>
                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2" role="alert"><svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg><span>{error}</span></div>}
                <form onSubmit={handleSubmit} noValidate><div className="space-y-4">
                  <div><label htmlFor="auth-username" className="block text-[12px] font-medium text-white/30 mb-1.5">Username</label><input id="auth-username" type="text" value={username} onChange={e=>setUsername(e.target.value)} onBlur={checkAndSwitchMode} className={ic} placeholder="e.g. nala_investor" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" required /></div>
                  {authMode==='signup'&&<div><label htmlFor="auth-displayName" className="block text-[12px] font-medium text-white/30 mb-1.5">Display Name</label><input id="auth-displayName" type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} className={ic} placeholder="How others will see you" autoComplete="name" required /></div>}
                  <div><div className="flex items-center justify-between mb-1.5"><label htmlFor="auth-password" className="block text-[12px] font-medium text-white/30">Password</label>{authMode==='login'&&<button type="button" tabIndex={-1} className="text-[11px] text-white/15 hover:text-white/30 transition-colors" onClick={()=>showToast('Password reset coming soon.','info')}>Forgot?</button>}</div><div className="relative"><input id="auth-password" type={showPassword?'text':'password'} value={password} onChange={e=>setPasswordValue(e.target.value)} className={`${ic} pr-11`} placeholder={authMode==='login'?'••••••••':'Min. 8 chars, upper/lower/number'} autoComplete={authMode==='login'?'current-password':'new-password'} required /><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/15 hover:text-white/40 transition-colors" tabIndex={-1}>{showPassword?<EyeOffIcon />:<EyeIcon />}</button></div></div>
                  {authMode==='signup'&&<div><label htmlFor="auth-confirm" className="block text-[12px] font-medium text-white/30 mb-1.5">Confirm Password</label><div className="relative"><input id="auth-confirm" type={showConfirmPassword?'text':'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className={`${ic} pr-11`} placeholder="Re-enter password" autoComplete="new-password" required /><button type="button" onClick={()=>setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/15 hover:text-white/40 transition-colors" tabIndex={-1}>{showConfirmPassword?<EyeOffIcon />:<EyeIcon />}</button></div></div>}
                  {authMode==='signup'&&<label className="flex items-start gap-2.5 cursor-pointer"><input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-white/10 bg-white/5 text-rh-green accent-rh-green" /><span className="text-[12px] text-white/25 leading-tight">I agree to the{' '}<button type="button" onClick={()=>{setPrivacyTab('privacy');setShowPrivacyPolicy(true);}} className="text-white/50 hover:underline">Privacy Policy</button>{' & '}<button type="button" onClick={()=>{setPrivacyTab('terms');setShowPrivacyPolicy(true);}} className="text-white/50 hover:underline">Terms</button></span></label>}
                  <button type="submit" disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Please wait...</span>:authMode==='signup'?'Create Account':'Sign In'}</button>
                </div></form>
                <div className="mt-5 pt-4 border-t border-white/[0.04] text-center text-[12px] text-white/25">{authMode==='login'?<>New to Nala? <button onClick={()=>setAuthMode('signup')} className="text-white/60 hover:text-white">Create an account</button></>:<>Have an account? <button onClick={()=>setAuthMode('login')} className="text-white/60 hover:text-white">Sign in</button></>}</div>
              </>
            )}
          </div>
        </div>
      )}
      <PrivacyPolicyModal isOpen={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} initialTab={privacyTab} />
    </div>
  );
}
