export function SupportPage() {
  return (
    <div className="min-h-screen min-h-dvh bg-[#050505] text-white">
      <nav className="border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/north-signal-logo.png" alt="" className="h-7 w-7" />
            <span className="text-lg font-bold text-white tracking-tight">Nala</span>
          </a>
          <a href="/" className="text-[13px] text-white/50 hover:text-white transition-colors">Back to Nala</a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
        <div className="mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rh-green mb-3">Support</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">Need help with Nala?</h1>
          <p className="text-sm sm:text-base text-white/50 max-w-2xl leading-7">
            For account access, billing, portfolio imports, watchlists, alerts, or app issues,
            contact support and include as much detail as possible so we can respond quickly.
          </p>
        </div>

        <div className="rounded-2xl border border-rh-green/20 bg-rh-green/[0.04] p-5 mb-10">
          <div className="flex items-start gap-3">
            <span className="text-rh-green text-lg leading-none mt-0.5">Beta</span>
            <div>
              <p className="text-sm text-white/70 leading-6">
                Nala is currently in beta. You may encounter bugs or incomplete features as we
                actively build and improve the platform. Your feedback is incredibly valuable
                — please report anything that feels off and we'll address it quickly.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/25 mb-2">Email</div>
          <a href="mailto:support@nalaai.com" className="text-rh-green hover:text-rh-green/80 transition-colors text-base font-semibold">
            support@nalaai.com
          </a>
          <p className="text-sm text-white/40 mt-3 leading-6">
            Use this for general support, account issues, bug reports, billing questions,
            and privacy or account-deletion requests.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">What to include in your message</h2>
          <ul className="space-y-3 text-sm text-white/45 leading-6 list-disc pl-5">
            <li>Your Nala account email</li>
            <li>Your device model and iOS version if the issue is on mobile</li>
            <li>A short description of what happened</li>
            <li>Screenshots if the issue is visual</li>
            <li>The ticker, portfolio, or screen involved if relevant</li>
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Account & Login</h3>
            <p className="text-sm text-white/40 leading-6">
              Login issues, email verification, password reset, or profile access.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Billing & Plans</h3>
            <p className="text-sm text-white/40 leading-6">
              Subscription questions, upgrades, downgrades, or purchase issues.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Portfolio Data</h3>
            <p className="text-sm text-white/40 leading-6">
              Brokerage linking, CSV imports, holdings mismatches, or watchlist problems.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
