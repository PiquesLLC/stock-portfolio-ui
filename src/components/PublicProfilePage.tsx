import { useState, useEffect, lazy, Suspense } from 'react';
import { getUserByUsername } from '../api';
import { LandingPage } from './LandingPage';
import Starfield from './Starfield';

const UserProfileView = lazy(() =>
  import('./UserProfileView').then(m => ({ default: m.UserProfileView }))
);

const WAITLIST_ENABLED = import.meta.env.VITE_WAITLIST_ENABLED !== 'false';

interface PublicProfilePageProps {
  username: string;
}

export default function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'not-found' }
    | { status: 'private' }
    | { status: 'ready'; userId: string; displayName: string }
  >({ status: 'loading' });

  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getUserByUsername(username);
      if (cancelled) return;
      if (!user) {
        setState({ status: 'not-found' });
      } else if (!user.profilePublic) {
        setState({ status: 'private' });
      } else {
        setState({ status: 'ready', userId: user.id, displayName: user.displayName });
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  // Not found or private → landing page
  if (state.status === 'not-found' || state.status === 'private') {
    return <LandingPage />;
  }

  // Loading
  if (state.status === 'loading') {
    return (
      <div className="h-screen h-dvh bg-[#050505] flex items-center justify-center">
        <Starfield />
        <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin relative z-10" />
      </div>
    );
  }

  // If user clicked Sign Up / Log in → show LandingPage with auth modal
  if (showAuth) {
    return <LandingPage />;
  }

  const { userId, displayName } = state;

  return (
    <div className="h-screen h-dvh bg-[#050505] text-white overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <Starfield />

      {/* ═══ NAV ═══ */}
      <nav className="relative z-40 bg-[#050505] border-b border-white/[0.04] shrink-0">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => { window.history.pushState({}, '', '/'); window.location.reload(); }}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <img src="/north-signal-logo.png" alt="" className="h-7 w-7" />
            <span className="text-lg font-bold text-white tracking-tight">Nala</span>
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAuth(true)}
              className="text-[13px] text-white/60 hover:text-white transition-colors"
            >
              Log in
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className="px-4 py-1.5 text-[13px] text-white/90 font-medium border border-white/[0.15] rounded-full hover:border-white/30 transition-all"
            >
              {WAITLIST_ENABLED ? 'Join Waitlist' : 'Open Account'}
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto relative z-10">

        {/* ── Hero headline ── */}
        <div className="max-w-2xl mx-auto text-center pt-8 pb-2 px-4">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
            See how real investors are performing
          </h1>
          <p className="text-sm text-white/35 mt-2">
            Track portfolios. Compare returns. Follow the smartest money.
          </p>
        </div>

        {/* ── Profile card ── */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <img src="/north-signal-logo-transparent.png" alt="" className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <UserProfileView
            userId={userId}
            currentUserId={undefined}
            onBack={() => { window.history.pushState({}, '', '/'); window.location.reload(); }}
          />
        </Suspense>

        {/* Bottom spacer so content doesn't hide behind floating CTA */}
        <div className="h-44" />
      </div>

      {/* ═══ FLOATING CTA BAR ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent pt-8 pb-6 px-4 pointer-events-none">
        <div className="max-w-md mx-auto text-center pointer-events-auto">
          <p className="text-sm text-white/50 mb-3">
            Join Nala to follow <span className="text-white/80 font-medium">{displayName}</span> and thousands of investors sharing real performance.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="px-8 py-3 bg-rh-green text-black text-sm font-bold rounded-full hover:bg-rh-green/90 transition-all shadow-[0_0_24px_rgba(0,200,5,0.3),0_4px_12px_rgba(0,0,0,0.4)]"
          >
            {WAITLIST_ENABLED ? 'Join the Waitlist' : 'Sign Up — It\'s Free'}
          </button>
          <p className="text-[11px] text-white/25 mt-2.5">
            Free to join. Upgrade when you're ready for full tracking and AI research.
          </p>
        </div>
      </div>
    </div>
  );
}
