import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkHasPassword, forgotUsername, resetPassword, joinWaitlist } from '../api';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { MfaVerifyStep } from './MfaVerifyStep';
import { PLANS } from '../data/plans';
import { isValidEmail, validatePassword } from '../utils/validation';
import { ensureAppleAuthReady, isAppleOAuthEnabled } from '../utils/apple-auth';
import { getGoogleClientId } from '../utils/oauth-config';
import { isNative } from '../utils/platform';
import { generateUuid } from '../utils/uuid';
const GOOGLE_CLIENT_ID = getGoogleClientId();
const GOOGLE_ENABLED = !!GOOGLE_CLIENT_ID;
const APPLE_ENABLED = isAppleOAuthEnabled();
const OAUTH_ENABLED = GOOGLE_ENABLED || APPLE_ENABLED;
const WAITLIST_ENABLED = import.meta.env.VITE_WAITLIST_ENABLED !== 'false';
const DIRECT_SIGNUP_ENABLED = !WAITLIST_ENABLED || isNative;
const EMAIL_INPUT_TYPE = isNative ? 'text' : 'email';
const NATIVE_PUBLIC_API_URL = 'https://stock-portfolio-api-production.up.railway.app';

function isNativeRecoveryShell(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'capacitor:'
    || window.location.protocol === 'ionic:'
    || window.location.hostname === 'localhost';
}

function xhrPost(url: string, body: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Request timed out'));
    xhr.timeout = 15000;
    xhr.send(JSON.stringify(body));
  });
}

/** Map raw API error codes to user-friendly messages */
function friendlyError(msg: string): string {
  if (msg === 'WAITLIST_NOT_APPROVED') return 'Login failed — your waitlist application has not been approved yet. For support, email support@nalaai.com';
  return msg;
}

const EyeIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const EyeOffIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
const Spinner = () => (<svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>);
const CheckIcon = ({ className = '' }: { className?: string }) => (<svg className={`w-4 h-4 text-rh-green shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>);

const sf = { fontFamily: "'DM Serif Display', Georgia, serif" };
const noScroll = { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties;

const FEATURES = [
  { id: 0, src: '/screenshots/creator-profile.png', label: '01 — Follow', title: 'Follow the smartest investors', desc: 'See their holdings, track their performance, and subscribe to unlock their full strategy. Social investing, built for the next generation.' },
  { id: 1, src: '/screenshots/creator-dashboard.png', label: '02 — Monetize', title: 'Monetize your strategy', desc: 'Built for finfluencers. Track subscribers, revenue, and payouts — 80% goes to you.' },
  { id: 2, src: '/screenshots/creators-marketplace.png', preview: '/screenshots/creators-marketplace-preview.png', label: '03 — Discover', title: 'Discover top creators', desc: 'Browse verified creators ranked by real performance. Free or paid — you choose who to follow.' },
  { id: 3, src: '/screenshots/activity.jpg', label: '04 — Activity', title: 'Real-time activity feed', desc: 'See what the community is buying, selling, and watching — in real time. Stay connected to the market pulse.' },
  { id: 4, src: '/screenshots/deep-research.png', preview: '/screenshots/deep-research-preview.png', label: '05 — Research', title: 'Institutional-grade AI research', desc: 'Ask any investment question. NALA AI delivers comprehensive research reports — in minutes, not hours.' },
  { id: 5, src: '/screenshots/heatmap-new.png', label: '06 — Heatmap', title: 'See where the money moves', desc: 'Visual sector and market-cap breakdown. Spot rotations at a glance.' },
];
const ALL_FEATURES = FEATURES;

const FAQ_ITEMS = [
  { q: 'What is Nala?', a: 'Nala is a social investing platform with AI-powered portfolio intelligence. Track your holdings, follow top creators, and get deep research — all in one place.' },
  { q: 'Is the activity feed public?', a: 'You control your privacy. You can share trades, milestones, and performance — or keep your portfolio completely private. It\'s up to you.' },
  { q: 'Do you store my brokerage credentials?', a: 'Never. Brokerage linking is handled securely through Plaid with AES-256 encryption. We never have access to your login credentials.' },
  { q: 'Is Nala free?', a: 'Yes! The free plan includes portfolio tracking, charts, heatmap, leaderboard access, and the activity feed. Upgrade for AI features, unlimited holdings, and creator subscriptions.' },
];

export function LandingPage() {
  const { login, signup, loginWithGoogle, loginWithApple, mfaChallenge } = useAuth();
  const { showToast } = useToast();
  const [oauthLoading, setOauthLoading] = useState(false);

  const featuresRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const faqRef = useRef<HTMLElement>(null);
  // scrollToRef is defined in the pull-to-refresh block below

  const [lightbox, setLightbox] = useState<number | null>(null);

  // Lock body scroll when lightbox is open (prevents scroll bleed-through on mobile)
  useEffect(() => {
    if (lightbox !== null) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [lightbox]);

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'waitlist' | 'forgot-password' | 'forgot-username' | 'reset-password'>('signup');
  const openAuth = (mode: 'login' | 'signup' | 'waitlist') => { setAuthMode(mode); setAuthOpen(true); };
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const ctaMode = DIRECT_SIGNUP_ENABLED ? 'signup' as const : 'waitlist' as const;
  const ctaLabel = DIRECT_SIGNUP_ENABLED ? 'Open Account' : 'Join the Waitlist Now';
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [resetCooldown, setResetCooldown] = useState(0);

  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [landingEmail, setLandingEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [privacyTab, setPrivacyTab] = useState<'privacy' | 'terms'>('privacy');
  const [referralCode, setReferralCode] = useState('');

  // Capture referral code from URL (?ref=username) and auto-open signup
  // Detect ?approved=1 (waitlist approval emails) or legacy #signup hash to bypass waitlist gate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref);
      setAuthOpen(true);
      setAuthMode(DIRECT_SIGNUP_ENABLED ? 'signup' : 'waitlist');
    }
    if (params.get('approved') === '1' || window.location.hash === '#signup') {
      setAuthOpen(true);
      setAuthMode('signup');
    }
  }, []);

  const [phoneSlide, setPhoneSlide] = useState(0);
  const phoneRef = useRef<HTMLDivElement>(null);
  const onPhoneScroll = useCallback(() => { const el = phoneRef.current; if (!el) return; setPhoneSlide(Math.round(el.scrollLeft / el.offsetWidth)); }, []);
  useEffect(() => {
    if (phoneSlide >= 4) { openAuth(ctaMode); setTimeout(() => { const el = phoneRef.current; if (el) el.scrollTo({ left: 0 }); setPhoneSlide(0); }, 300); }
    // openAuth is a non-memoized handler — including it would re-run every render; ctaMode is a module-level constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneSlide]);

  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const [activeSlide, setActiveSlide] = useState(1);
  const carouselRef = useRef<HTMLDivElement>(null);
  const handleCarouselScroll = useCallback(() => { const el = carouselRef.current; if (!el) return; setActiveSlide(Math.min(Math.max(Math.round(el.scrollLeft / el.offsetWidth), 0), PLANS.length - 1)); }, []);
  useEffect(() => { const el = carouselRef.current; if (el) el.scrollLeft = el.offsetWidth; }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const syncHashRoute = () => {
      const raw = window.location.hash.slice(1);
      if (!raw) return;
      const params = new URLSearchParams(raw);
      const tab = params.get('tab') || raw;
      if (tab !== 'pricing') return;
      requestAnimationFrame(() => {
        pricingRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    };

    syncHashRoute();
    window.addEventListener('hashchange', syncHashRoute);
    return () => window.removeEventListener('hashchange', syncHashRoute);
  }, []);

  useEffect(() => { if (!authOpen) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAuthOpen(false); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [authOpen]);
  useEffect(() => { setError(''); setPasswordValue(''); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false); if (authMode === 'login') { setDisplayName(''); setLandingEmail(''); setAcceptedTerms(false); } if (authMode !== 'forgot-password' && authMode !== 'forgot-username' && authMode !== 'reset-password') { setResetEmail(''); setResetCode(''); setNewPassword(''); setNewPasswordConfirm(''); } if (authMode === 'waitlist') { setWaitlistSuccess(false); } setResetCooldown(0); }, [authOpen, authMode]);
  const resetCooldownActive = resetCooldown > 0;
  useEffect(() => { if (!resetCooldownActive) return; const t = setInterval(() => setResetCooldown(p => p <= 1 ? (clearInterval(t), 0) : p - 1), 1000); return () => clearInterval(t); }, [resetCooldownActive]);
  const sendResetCodeDirect = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const url = `${NATIVE_PUBLIC_API_URL}/auth/forgot-password`;
    const useNativeTransport = isNativeRecoveryShell();

    console.log('[sendResetCodeDirect] START native=', useNativeTransport, 'url=', url, 'email=', normalizedEmail);
    try {
      if (!useNativeTransport) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ email: normalizedEmail }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { message: 'If this email is registered, a reset code was sent.' };
      }

      console.log('[sendResetCodeDirect] calling XHR...');
      await xhrPost(url, { email: normalizedEmail });
      return { message: 'If this email is registered, a reset code was sent.' };
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error('[sendResetCodeDirect] ERROR:', e.name, e.message, e.stack?.slice(0, 300));
      throw new Error(`${e.name}: ${e.message}` || 'Unable to send reset code');
    }
  }, []);

  const submitAuth = async () => {
    setError(''); setIsLoading(true);
    try {
      if (authMode === 'waitlist') {
        if (!waitlistEmail.trim() || !isValidEmail(waitlistEmail)) { setError('Please enter a valid email address'); return; }
        await joinWaitlist(waitlistEmail);
        setWaitlistSuccess(true);
        return;
      } else if (authMode === 'forgot-username') {
        if (!resetEmail.trim() || !isValidEmail(resetEmail)) { setError('Please enter a valid email address'); return; }
        await forgotUsername(resetEmail);
        showToast('If this email is registered, your username was sent.', 'success');
        setAuthMode('login'); setError('');
        return;
      } else if (authMode === 'forgot-password') {
        if (!resetEmail.trim() || !isValidEmail(resetEmail)) { setError('Please enter a valid email address'); return; }
        try {
          console.log('[forgot-password] sending reset request', 'nativeShell=', isNativeRecoveryShell());
          await sendResetCodeDirect(resetEmail);
          console.log('[forgot-password] success');
          setAuthMode('reset-password'); setError('');
          return;
        } catch (fpErr) {
          const e = fpErr instanceof Error ? fpErr : new Error(String(fpErr));
          console.error('[forgot-password] FAILED:', e.name, e.message, e.stack?.slice(0, 500));
          throw new Error('Unable to send reset code');
        }
      } else if (authMode === 'reset-password') {
        if (resetCode.length !== 6) { setError('Please enter the 6-digit reset code'); return; }
        const pwErr = validatePassword(newPassword);
        if (pwErr) { setError(pwErr); return; }
        if (newPassword !== newPasswordConfirm) { setError('Passwords do not match'); return; }
        await resetPassword(resetEmail, resetCode, newPassword);
        showToast('Password reset! You can now sign in.', 'success');
        setAuthMode('login'); setResetEmail(''); setResetCode(''); setNewPassword(''); setNewPasswordConfirm('');
        return;
      } else if (authMode === 'signup') {
        if (!username.trim() || !displayName.trim()) { setError('Username and display name are required'); return; }
        if (!landingEmail.trim() || !isValidEmail(landingEmail)) { setError('Please enter a valid email address'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }
        const pwErr2 = validatePassword(password);
        if (pwErr2) { setError(pwErr2); return; }
        if (!acceptedTerms) { setError('You must accept the Privacy Policy and Terms of Service'); return; }
        const result = await signup(username, displayName, password, landingEmail, { acceptedPrivacyPolicy: true, acceptedTerms: true }, referralCode || undefined);
        if (result.emailVerificationRequired) {
          showToast('Account created! Check your email for a verification code.', 'success');
          window.location.href = '/';
          return;
        }
      } else { await login(username, password); }
    } catch (err) { setError(friendlyError(err instanceof Error ? err.message : 'An error occurred')); } finally { setIsLoading(false); }
  };
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitAuth();
  };
  const checkAndSwitchMode = async () => { if (!username.trim() || authMode !== 'login') return; try { const r = await checkHasPassword(username); if (!r.hasPassword) showToast('This account needs a password.', 'info'); } catch { /* ignore */ } };

  // ─── OAuth Handlers ─────────────────────────────────────
  const handleGoogleLogin = useCallback(async () => {
    if (!GOOGLE_ENABLED) return;
    const { google } = window as any;
    if (!google?.accounts?.oauth2) {
      setError('Google Sign-In is still loading — please try again in a moment');
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error) {
          setError('Google sign-in was cancelled');
          return;
        }
        setOauthLoading(true);
        setError('');
        try {
          const result = await loginWithGoogle(tokenResponse.access_token);
          if (result.isNewUser) showToast('Welcome to Nala!', 'success');
        } catch (err) {
          setError(friendlyError(err instanceof Error ? err.message : 'Google sign-in failed'));
        } finally {
          setOauthLoading(false);
        }
      },
    });
    client.requestAccessToken();
  }, [loginWithGoogle, showToast]);

  // Load Google Identity Services SDK dynamically
  useEffect(() => {
    if (!GOOGLE_ENABLED) return;
    if ((window as any).google?.accounts?.oauth2) return;
    if (document.getElementById('google-gsi-sdk')) return;
    const script = document.createElement('script');
    script.id = 'google-gsi-sdk';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Load Apple JS SDK dynamically
  useEffect(() => {
    if (!APPLE_ENABLED) return;
    ensureAppleAuthReady().catch(() => {
      // Ignore preload failures here; click handler reports actionable errors.
    });
  }, []);

  const handleAppleLogin = useCallback(async () => {
    if (!APPLE_ENABLED) return;
    setOauthLoading(true);
    setError('');
    try {
      const auth = await ensureAppleAuthReady();
      const nonce = generateUuid();
      const response = await auth.signIn({ nonce });
      const idToken = response.authorization?.id_token;
      if (!idToken) throw new Error('No Apple ID token received');
      const name = response.user ? { firstName: response.user.name?.firstName, lastName: response.user.name?.lastName } : undefined;
      const result = await loginWithApple(idToken, name, nonce);
      if (result.isNewUser) showToast('Welcome to Nala!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Apple sign-in failed';
      if (!msg.includes('popup_closed') && !msg.includes('cancelled')) {
        setError(friendlyError(msg));
      }
    } finally {
      setOauthLoading(false);
    }
  }, [loginWithApple, showToast]);

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
            <button onClick={() => openAuth(ctaMode)} className="px-4 py-1.5 text-[13px] text-white/90 font-medium border border-white/[0.15] rounded-full hover:border-white/30 transition-all">{ctaLabel}</button>
          </div>
          <div className="flex sm:hidden items-center gap-3">
            <button onClick={() => openAuth('login')} className="text-[13px] text-white/60">Log in</button>
            <button onClick={() => openAuth(ctaMode)} className="px-3 py-1.5 text-[13px] text-white/90 border border-white/[0.15] rounded-full">{DIRECT_SIGNUP_ENABLED ? 'Sign Up' : 'Join the Waitlist Now'}</button>
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
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-glass"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >

      {/* ═══ REFERRAL BANNER ═══ */}
      {referralCode && (
        <div className="text-center py-3 px-4 bg-rh-green/[0.08] border-b border-rh-green/20">
          <p className="text-sm text-rh-green font-medium">@{referralCode} invited you to join Nala</p>
          <button onClick={() => openAuth('signup')} className="text-xs text-rh-green/70 underline mt-0.5">Create your free account</button>
        </div>
      )}

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
                      { src: '/screenshots/leaderboard.jpg', alt: 'Investor leaderboard' },
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
              Track your portfolio, follow top investors, and get AI-powered insights — all in one place.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => scrollToRef(featuresRef)} className="px-6 py-2.5 text-[13px] text-white/60 font-medium border border-white/[0.12] rounded-full hover:border-white/25 hover:text-white transition-all">Learn More</button>
              <button onClick={() => openAuth(ctaMode)} className="px-6 py-2.5 text-[13px] text-black font-semibold bg-white rounded-full hover:bg-white/90 transition-colors">{ctaLabel}</button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES — NARRATIVE PRODUCT SHOWCASE ═══ */}
      <section ref={featuresRef} className="py-20 sm:py-28 bg-[#080808]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          {/* Headline */}
          <div className="text-center mb-16 sm:mb-20">
            <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-4 text-white/95" style={sf}>Invest smarter. <em className="italic text-rh-green">Together.</em></h2>
            <p className="text-sm sm:text-base text-white/30 max-w-xl mx-auto">Follow top-performing investors, run AI-powered research, and see what Wall Street won't show you.</p>
          </div>

          {/* Feature cards — alternating layout */}
          {FEATURES.map((f, i) => {
            const flipped = i % 2 === 1;
            return (
              <div key={f.id} className="mb-16 sm:mb-20">
                <div className="text-[11px] font-bold text-rh-green tracking-wider mb-4 text-center lg:text-left">{f.label}</div>
                <div className="relative group cursor-pointer" onClick={() => setLightbox(f.id)}>
                  <div className="absolute -inset-4 bg-rh-green/[0.02] rounded-3xl blur-[60px] pointer-events-none" />
                  <div className="relative rounded-2xl border border-white/[0.08] bg-[#0a0a0a] overflow-hidden transition-colors duration-500 group-hover:border-white/[0.12]">
                    <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <div className="grid lg:grid-cols-2">
                      {/* Copy */}
                      <div className={`flex flex-col justify-center p-8 sm:p-10 lg:p-12 order-2 ${!flipped ? 'lg:order-1' : ''}`}>
                        <h3 className="text-xl sm:text-2xl font-semibold text-white/90 mb-3" style={sf}>{f.title}</h3>
                        <p className="text-sm sm:text-[15px] text-white/35 leading-relaxed">{f.desc}</p>
                      </div>
                      {/* Screenshot */}
                      <div className={`relative overflow-hidden order-1 ${!flipped ? 'lg:order-2' : ''}`}>
                        <img src={'preview' in f && f.preview ? f.preview : f.src} alt={f.title} className="w-full h-full max-h-[400px] object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" draggable={false} />
                        <div className={`absolute inset-y-0 ${flipped ? 'right-0 w-16 bg-gradient-to-l' : 'left-0 w-16 bg-gradient-to-r'} from-[#0a0a0a] to-transparent hidden lg:block pointer-events-none`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Section CTA */}
          <div className="mt-16 text-center">
            <button onClick={() => openAuth(ctaMode)} className="px-7 py-2.5 text-[13px] font-medium rounded-full bg-white text-black hover:bg-white/90 transition-all min-h-[44px]">
              {DIRECT_SIGNUP_ENABLED ? 'Start Free' : 'Join the Waitlist Now'}
            </button>
            <p className="text-[11px] text-white/20 mt-3">Free forever. Upgrade anytime.</p>
          </div>
        </div>
      </section>

      {/* ═══ FEATURE LIGHTBOX ═══ */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center pt-16 sm:pt-8 sm:justify-center px-4 sm:px-8 pb-4 sm:pb-8"
          style={{ overscrollBehavior: 'contain', touchAction: 'none' }}
          onClick={() => setLightbox(null)}
        >
          {/* Card container — constrained to viewport, starts below nav on mobile */}
          <div
            className="relative w-full max-w-2xl sm:w-[80vw] flex flex-col"
            style={{ maxHeight: 'calc(100dvh - 5rem)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close X — overlays top-right of image, transparent */}
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center text-white/90"
            >
              <svg className="w-6 h-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            {/* Nav arrows — desktop only */}
            <button onClick={() => setLightbox((lightbox - 1 + ALL_FEATURES.length) % ALL_FEATURES.length)} className="absolute left-[-3rem] top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors hidden sm:block">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setLightbox((lightbox + 1) % ALL_FEATURES.length)} className="absolute right-[-3rem] top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors hidden sm:block">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            {/* Image — scrollable within card */}
            <div
              className="rounded-2xl border border-white/[0.12] bg-[#0a0a0a] overflow-y-auto overflow-x-hidden shadow-2xl shadow-black/60"
              style={{ overscrollBehavior: 'contain', maxHeight: 'calc(100dvh - 8rem)' }}
            >
              <img src={ALL_FEATURES[lightbox].src} alt={ALL_FEATURES[lightbox].title} className="w-full block" draggable={false} />
            </div>
            {/* Title + desc */}
            <div className="mt-3 sm:mt-4 text-center px-4 shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-white/80" style={sf}>{ALL_FEATURES[lightbox].title}</h3>
              <p className="text-xs sm:text-sm text-white/30 mt-1">{ALL_FEATURES[lightbox].desc}</p>
            </div>
          </div>
        </div>
      )}

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
          <div className="hidden sm:grid grid-cols-4 gap-4 mb-8">
            {PLANS.map(plan => { const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice; const isElite = plan.id === 'elite'; return (
              <div key={plan.id} className={`relative rounded-2xl p-6 flex flex-col border transition-all ${plan.highlight ? 'border-rh-green/20 bg-white/[0.03]' : isElite ? 'border-purple-500/20 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
                {plan.highlight && <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-rh-green/50 to-transparent" />}
                {isElite && <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />}
                <div className="mb-5"><div className="flex items-center gap-2 mb-3"><h3 className={`text-sm font-semibold ${isElite ? 'text-purple-400/80' : 'text-white/70'}`}>{plan.name}</h3>{plan.highlight && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rh-green/15 text-rh-green">Popular</span>}{isElite && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-400">Research</span>}</div><div className="flex items-baseline gap-1"><span className="text-3xl font-bold text-white">${price}</span>{price > 0 && <span className="text-sm text-white/25">/{billing === 'yearly' ? 'yr' : 'mo'}</span>}</div><p className="text-xs text-white/25 mt-2">{plan.description}</p></div>
                <ul className="flex-1 space-y-2.5 mb-6">{plan.features.map(f => <li key={f} className="flex items-start gap-2 text-[13px]"><CheckIcon className="mt-0.5" /><span className="text-white/50">{f}</span></li>)}</ul>
                <button onClick={() => openAuth(ctaMode)} className={`w-full py-2.5 rounded-full text-[13px] font-medium transition-all min-h-[44px] ${plan.highlight ? 'bg-white text-black hover:bg-white/90' : isElite ? 'bg-gradient-to-r from-purple-500/80 to-purple-600/80 text-white hover:from-purple-500 hover:to-purple-600' : 'border border-white/[0.1] text-white/50 hover:border-white/20'}`}>Get Started</button>
              </div>
            ); })}
          </div>
          <div className="sm:hidden">
            <div ref={carouselRef} onScroll={handleCarouselScroll} className="flex overflow-x-auto snap-x snap-mandatory -mx-5 px-5 gap-3" style={noScroll}>
              {PLANS.map((plan, idx) => { const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice; const isElite = plan.id === 'elite'; return (
                <div key={plan.id} className="snap-center shrink-0 w-[calc(100vw-56px)]">
                  <div className={`rounded-2xl p-6 flex flex-col min-h-[380px] border transition-all duration-300 ${plan.highlight ? 'border-rh-green/20 bg-white/[0.03]' : isElite ? 'border-purple-500/20 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'} ${activeSlide === idx ? 'opacity-100' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-3"><h3 className={`text-sm font-semibold ${isElite ? 'text-purple-400/80' : 'text-white/70'}`}>{plan.name}</h3>{plan.highlight && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rh-green/15 text-rh-green">Popular</span>}{isElite && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-400">Research</span>}</div>
                    <div className="flex items-baseline gap-1 mb-1"><span className="text-3xl font-bold text-white">${price}</span>{price > 0 && <span className="text-sm text-white/25">/{billing === 'yearly' ? 'yr' : 'mo'}</span>}</div>
                    <p className="text-xs text-white/25 mb-5">{plan.description}</p>
                    <ul className="flex-1 space-y-2 mb-5">{plan.features.map(f => <li key={f} className="flex items-start gap-2 text-[13px]"><CheckIcon className="mt-0.5" /><span className="text-white/50">{f}</span></li>)}</ul>
                    <button onClick={() => openAuth(ctaMode)} className={`w-full py-2.5 rounded-full text-[13px] font-medium min-h-[44px] ${plan.highlight ? 'bg-white text-black' : isElite ? 'bg-gradient-to-r from-purple-500/80 to-purple-600/80 text-white' : 'border border-white/[0.1] text-white/50'}`}>Get Started</button>
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
        <h2 className="text-2xl sm:text-[2.8rem] leading-[1.1] mb-5 text-white/95" style={sf}>{DIRECT_SIGNUP_ENABLED ? <>Start investing smarter in<br /><span className="text-rh-green italic">10 minutes</span> today</> : <>Get early access to<br /><span className="text-rh-green italic">Nala</span> today</>}</h2>
        <p className="text-sm text-white/25 mb-10 max-w-sm mx-auto">{DIRECT_SIGNUP_ENABLED ? 'Create your free account, add your holdings, and follow top investors.' : 'Join the waitlist, get approved, and start tracking your portfolio.'}</p>
        <div className="flex items-center justify-center gap-3 mb-10">
          {(DIRECT_SIGNUP_ENABLED ? ['Sign up','Add holdings','Start earning'] : ['Join waitlist','Get approved','Start earning']).map((step,i)=>(
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${i===2?'bg-rh-green/20 text-rh-green':'bg-white/[0.05] text-white/30'}`}>{i+1}</div><span className="text-[11px] text-white/25">{step}</span></div>
              {i<2&&<div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>
        <button onClick={() => openAuth(ctaMode)} className="px-7 py-2.5 text-[13px] text-black font-semibold bg-white rounded-full hover:bg-white/90 transition-colors">{ctaLabel}</button>
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
          <div><h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">Company</h4><div className="space-y-2"><button onClick={()=>scrollToRef(pricingRef)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Pricing</button><a href="/support" className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Support</a><button onClick={()=>{setPrivacyTab('privacy');setShowPrivacyPolicy(true);}} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Privacy Policy</button><button onClick={()=>{setPrivacyTab('terms');setShowPrivacyPolicy(true);}} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Terms of Service</button></div></div>
          <div><h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">Resources</h4><div className="space-y-2"><button onClick={()=>scrollToRef(faqRef)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">FAQ</button><button onClick={()=>openAuth(ctaMode)} className="block text-[12px] text-white/20 hover:text-white/40 transition-colors">Get Started</button></div></div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-white/[0.04] gap-3"><div className="text-[10px] text-white/10">&copy; 2026 Nala AI. All rights reserved.</div><p className="text-[10px] text-white/10 text-center">Past performance does not guarantee future results. Not financial advice.</p></div>
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
                <h2 className="text-base font-semibold text-white/90 mb-5">{authMode === 'waitlist' ? 'Join the Waitlist' : authMode === 'signup' ? 'Create Account' : authMode === 'forgot-username' ? 'Recover Username' : authMode === 'forgot-password' ? 'Reset Password' : authMode === 'reset-password' ? 'Enter Reset Code' : 'Welcome Back'}</h2>
                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2" role="alert"><svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg><span>{error}</span></div>}
                <form onSubmit={handleSubmit} noValidate><div className="space-y-4">
                  {authMode === 'waitlist' ? (waitlistSuccess ? (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 rounded-full bg-rh-green/15 flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>
                      <p className="text-white/80 text-sm font-medium mb-2">You're on the list.</p>
                      <p className="text-white/30 text-[12px] leading-relaxed">We'll email you when access opens.</p>
                      <div className="mt-5"><button type="button" onClick={() => setAuthOpen(false)} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Close</button></div>
                    </div>
                  ) : (<>
                    <p className="text-[12px] text-white/30 leading-relaxed">Enter your email to join the waitlist. We'll notify you when your spot opens.</p>
                    <div><label htmlFor="auth-waitlist-email" className="block text-[12px] font-medium text-white/30 mb-1.5">Email</label><input id="auth-waitlist-email" type={EMAIL_INPUT_TYPE} inputMode="email" value={waitlistEmail} onChange={e=>setWaitlistEmail(e.target.value)} className={ic} placeholder="you@example.com" autoComplete="email" autoFocus required /></div>
                    <button type="submit" disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Joining...</span>:'Join Waitlist'}</button>
                    <div className="text-center"><button type="button" onClick={()=>setAuthMode('login')} className="text-[12px] text-white/25">Have an account? <span className="text-white/60 hover:text-white">Sign in</span></button></div>
                  </>)) : authMode === 'forgot-username' ? (<>
                    <p className="text-[12px] text-white/30 leading-relaxed">Enter the email on your account and we'll send your username.</p>
                    <div><label htmlFor="auth-username-email" className="block text-[12px] font-medium text-white/30 mb-1.5">Email</label><input id="auth-username-email" type={EMAIL_INPUT_TYPE} inputMode="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} className={ic} placeholder="you@example.com" autoComplete="email" autoFocus required /></div>
                    <button type="button" onClick={()=>{ void submitAuth(); }} disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Sending...</span>:'Email My Username'}</button>
                    <div className="text-center"><button type="button" onClick={()=>{setAuthMode('login');setError('');}} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Back to sign in</button></div>
                  </>) : authMode === 'forgot-password' ? (<>
                    <p className="text-[12px] text-white/30 leading-relaxed">Enter the email on your account and we'll send a reset code.</p>
                    <div><label htmlFor="auth-reset-email" className="block text-[12px] font-medium text-white/30 mb-1.5">Email</label><input id="auth-reset-email" type="text" inputMode="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} className={ic} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" autoCorrect="off" autoFocus required /></div>
                    <button type="button" onClick={()=>{ void submitAuth(); }} disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Sending...</span>:'Send Reset Code'}</button>
                    <div className="text-center"><button type="button" onClick={()=>{setAuthMode('login');setError('');}} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Back to sign in</button></div>
                  </>) : authMode === 'reset-password' ? (<>
                    <p className="text-[12px] text-white/30 leading-relaxed">Enter the 6-digit code sent to <span className="text-white/60 font-medium">{resetEmail}</span>.</p>
                    <div><label htmlFor="auth-reset-code" className="block text-[12px] font-medium text-white/30 mb-1.5">Reset Code</label><input id="auth-reset-code" type="text" inputMode="numeric" maxLength={6} value={resetCode} onChange={e=>setResetCode(e.target.value.replace(/\D/g,'').slice(0,6))} className={`${ic} text-center text-xl tracking-[0.3em] font-mono`} placeholder="000000" autoComplete="one-time-code" autoFocus required /></div>
                    <div><label htmlFor="auth-new-pw" className="block text-[12px] font-medium text-white/30 mb-1.5">New Password</label><input id="auth-new-pw" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className={ic} placeholder="Min. 8 chars, upper/lower/number" autoComplete="new-password" required /></div>
                    <div><label htmlFor="auth-new-pw-confirm" className="block text-[12px] font-medium text-white/30 mb-1.5">Confirm Password</label><input id="auth-new-pw-confirm" type="password" value={newPasswordConfirm} onChange={e=>setNewPasswordConfirm(e.target.value)} className={ic} placeholder="Re-enter new password" autoComplete="new-password" required /></div>
                    <button type="button" onClick={()=>{ void submitAuth(); }} disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Resetting...</span>:'Reset Password'}</button>
                    <div className="flex items-center justify-between"><button type="button" onClick={async()=>{if(resetCooldown>0)return;try{await sendResetCodeDirect(resetEmail);showToast('Code resent','success');setResetCooldown(60);}catch(err){setError(err instanceof Error?err.message:'Failed');}}} disabled={resetCooldown>0} className="text-[12px] text-rh-green hover:text-rh-green/80 disabled:text-white/15 transition-colors">{resetCooldown>0?`Resend in ${resetCooldown}s`:'Resend code'}</button><button type="button" onClick={()=>{setAuthMode('login');setError('');setResetEmail('');setResetCode('');setNewPassword('');setNewPasswordConfirm('');}} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Back to sign in</button></div>
                  </>) : (<>
                  <div><label htmlFor="auth-username" className="block text-[12px] font-medium text-white/30 mb-1.5">Username</label><input id="auth-username" type="text" value={username} onChange={e=>setUsername(e.target.value)} onBlur={checkAndSwitchMode} className={ic} placeholder="e.g. nala_investor" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" required /></div>
                  {authMode==='signup'&&<div><label htmlFor="auth-displayName" className="block text-[12px] font-medium text-white/30 mb-1.5">Display Name</label><input id="auth-displayName" type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} className={ic} placeholder="How others will see you" autoComplete="name" required /></div>}
                  {authMode==='signup'&&<div><label htmlFor="auth-email" className="block text-[12px] font-medium text-white/30 mb-1.5">Email</label><input id="auth-email" type={EMAIL_INPUT_TYPE} inputMode="email" value={landingEmail} onChange={e=>setLandingEmail(e.target.value)} className={ic} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" required /></div>}
                  <div><div className="flex items-center justify-between mb-1.5"><label htmlFor="auth-password" className="block text-[12px] font-medium text-white/30">Password</label>{authMode==='login'&&<div className="flex items-center gap-3"><button type="button" tabIndex={-1} className="text-[11px] text-white/15 hover:text-white/30 transition-colors" onClick={()=>{setAuthMode('forgot-username');setError('');}}>Forgot username?</button><button type="button" tabIndex={-1} className="text-[11px] text-white/15 hover:text-white/30 transition-colors" onClick={()=>{setAuthMode('forgot-password');setError('');}}>Forgot password?</button></div>}</div><div className="relative"><input id="auth-password" type={showPassword?'text':'password'} value={password} onChange={e=>setPasswordValue(e.target.value)} className={`${ic} pr-11`} placeholder={authMode==='login'?'••••••••':'Min. 8 chars, upper/lower/number'} autoComplete={authMode==='login'?'current-password':'new-password'} required /><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/15 hover:text-white/40 transition-colors" tabIndex={-1}>{showPassword?<EyeOffIcon />:<EyeIcon />}</button></div></div>
                  {authMode==='signup'&&<div><label htmlFor="auth-confirm" className="block text-[12px] font-medium text-white/30 mb-1.5">Confirm Password</label><div className="relative"><input id="auth-confirm" type={showConfirmPassword?'text':'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className={`${ic} pr-11`} placeholder="Re-enter password" autoComplete="new-password" required /><button type="button" onClick={()=>setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/15 hover:text-white/40 transition-colors" tabIndex={-1}>{showConfirmPassword?<EyeOffIcon />:<EyeIcon />}</button></div></div>}
                  {authMode==='signup'&&referralCode&&<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rh-green/10 border border-rh-green/20"><span className="text-rh-green text-sm font-medium">Invited by @{referralCode}</span></div>}
                  {authMode==='signup'&&<label className="flex items-start gap-2.5 cursor-pointer"><input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-white/10 bg-white/5 text-rh-green accent-rh-green" /><span className="text-[12px] text-white/25 leading-tight">I agree to the{' '}<button type="button" onClick={()=>{setPrivacyTab('privacy');setShowPrivacyPolicy(true);}} className="text-white/50 hover:underline">Privacy Policy</button>{' & '}<button type="button" onClick={()=>{setPrivacyTab('terms');setShowPrivacyPolicy(true);}} className="text-white/50 hover:underline">Terms</button></span></label>}
                  <button type="submit" disabled={isLoading} className="w-full py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 disabled:bg-white/50 disabled:cursor-wait transition-all min-h-[44px]">{isLoading?<span className="inline-flex items-center gap-2"><Spinner />Please wait...</span>:authMode==='signup'?'Create Account':'Sign In'}</button>
                  </>)}
                </div></form>
                {(authMode==='login'||authMode==='signup') && OAUTH_ENABLED && (
                  <div className="mt-5 pt-4 border-t border-white/[0.04]">
                    <p className="text-[11px] text-white/20 text-center mb-3">Or continue with</p>
                    <div className="flex gap-2">
                      {GOOGLE_ENABLED && (
                        <button
                          type="button"
                          onClick={handleGoogleLogin}
                          disabled={oauthLoading || isLoading}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.08] disabled:opacity-40 transition-all text-[12px] font-medium text-white/60 min-h-[44px]"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                          Google
                        </button>
                      )}
                      {APPLE_ENABLED && (
                        <button
                          type="button"
                          onClick={handleAppleLogin}
                          disabled={oauthLoading || isLoading}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.08] disabled:opacity-40 transition-all text-[12px] font-medium text-white/60 min-h-[44px]"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                          Apple
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {(authMode==='login'||authMode==='signup')&&<div className={`${OAUTH_ENABLED ? 'mt-3' : 'mt-5'} pt-4 border-t border-white/[0.04] text-center text-[12px] text-white/25`}>{authMode==='login'?<>New to Nala? <button onClick={()=>setAuthMode(DIRECT_SIGNUP_ENABLED ? 'signup' : 'waitlist')} className="text-white/60 hover:text-white">{DIRECT_SIGNUP_ENABLED ? 'Create an account' : 'Join the waitlist'}</button></>:<>Have an account? <button onClick={()=>setAuthMode('login')} className="text-white/60 hover:text-white">Sign in</button></>}</div>}
              </>
            )}
          </div>
        </div>
      )}
      <PrivacyPolicyModal isOpen={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} initialTab={privacyTab} />
    </div>
  );
}
