import { useState } from 'react';
import { PrivacyPolicyContent, TermsOfServiceContent } from './PrivacyPolicyModal';

export function PrivacyPage({ initialTab = 'privacy' }: { initialTab?: 'privacy' | 'terms' }) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  return (
    <div className="min-h-screen min-h-dvh bg-[#050505] text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5">
            <img src="/north-signal-logo.png" alt="" className="h-7 w-7" />
            <span className="text-lg font-bold text-white tracking-tight">Nala</span>
          </a>
          <a href="#" className="text-[13px] text-white/50 hover:text-white transition-colors">Back to Nala</a>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
        {/* Tab toggle */}
        <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5 mb-8 max-w-xs">
          <button
            onClick={() => { setActiveTab('privacy'); window.location.hash = 'privacy'; }}
            className={`flex-1 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'privacy'
                ? 'bg-white/[0.1] text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => { setActiveTab('terms'); window.location.hash = 'terms'; }}
            className={`flex-1 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'terms'
                ? 'bg-white/[0.1] text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Terms of Service
          </button>
        </div>

        {/* Policy content — force dark text styles */}
        <div className="[&_h2]:text-white [&_h3]:text-white/90 [&_p]:text-white/40 [&_li]:text-white/40 [&_strong]:text-white/60">
          {activeTab === 'privacy' ? <PrivacyPolicyContent /> : <TermsOfServiceContent />}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-white/[0.04] text-center">
          <p className="text-[11px] text-white/15">
            Effective February 15, 2026 &middot; Version 1.0 &middot; Piques LLC
          </p>
        </div>
      </div>
    </div>
  );
}
