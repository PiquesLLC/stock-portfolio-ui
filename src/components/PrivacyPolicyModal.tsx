import { useState } from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-rh-light-text dark:text-rh-text mt-6 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed mb-3">{children}</p>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 text-sm text-rh-light-muted dark:text-rh-muted leading-relaxed mb-3 ml-1">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function PrivacyPolicyContent() {
  return (
    <div>
      <h2 className="text-lg font-bold text-rh-light-text dark:text-rh-text mb-1">Privacy Policy</h2>
      <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mb-4">Last updated: February 15, 2026</p>

      <SectionTitle>1. Introduction</SectionTitle>
      <P>
        Nala is a portfolio tracking and analytics platform built by Piques LLC. We help investors visualize,
        analyze, and understand their investment portfolios. Nala is not a brokerage — we do not execute trades,
        hold funds, or provide financial advice. This Privacy Policy explains how we collect, use, and protect
        your information when you use our service.
      </P>

      <SectionTitle>2. Information We Collect</SectionTitle>
      <P><strong>Account Information</strong></P>
      <BulletList items={[
        'Username and display name (chosen by you during signup)',
        'Password (stored as a one-way cryptographic hash — we cannot see your actual password)',
      ]} />
      <P><strong>Portfolio Data</strong></P>
      <BulletList items={[
        'Holdings you add (ticker symbols, number of shares, average cost basis)',
        'Watchlists and tracked stocks',
        'Cash balance and DRIP settings',
      ]} />
      <P><strong>Generated Data</strong></P>
      <BulletList items={[
        'Portfolio performance snapshots and historical chart data',
        'Calculated metrics (returns, allocation percentages, dividend projections)',
      ]} />
      <P><strong>Technical Data</strong></P>
      <BulletList items={[
        'Browser type and operating system (from standard HTTP headers)',
        'Session timestamps',
        'IP address (recorded at signup for consent verification)',
      ]} />

      <SectionTitle>3. How We Use Your Information</SectionTitle>
      <BulletList items={[
        'Display your portfolio, charts, and performance metrics',
        'Generate AI-powered insights including portfolio briefings, behavior coaching, and stock Q&A',
        'Calculate leaderboard rankings and enable social features (if you opt in)',
        'Send price alerts and earnings notifications (if enabled)',
        'Improve and maintain the Nala platform',
      ]} />

      <SectionTitle>4. Third-Party Services</SectionTitle>
      <P>We use the following services to provide Nala's features. We are intentional about what data we share with each:</P>
      <BulletList items={[
        <><strong>Polygon.io, Finnhub, Yahoo Finance</strong> — Market data providers. We send only stock ticker symbols to retrieve prices and financial data. No personal information is shared.</>,
        <><strong>Perplexity AI</strong> — Powers AI insights (briefings, stock Q&A, behavior coaching). We send ticker symbols and portfolio composition context. We never send your username, password, or personally identifying information.</>,
        <><strong>Plaid</strong> — Optional read-only brokerage account linking to import your holdings automatically. Plaid receives your brokerage credentials directly (we never see them) and returns your holdings data. Plaid's use of your data is governed by their own privacy policy.</>,
        <><strong>Railway</strong> — Our hosting infrastructure provider. Your data is stored on Railway's servers with encryption in transit (TLS) and industry-standard security practices.</>,
      ]} />

      <SectionTitle>5. Cookies & Authentication</SectionTitle>
      <BulletList items={[
        <><strong>Authentication cookies</strong> — We use secure, httpOnly cookies to maintain your login session. These cookies cannot be accessed by JavaScript and are transmitted only over HTTPS.</>,
        <><strong>No advertising or tracking cookies</strong> — We do not use cookies for advertising, cross-site tracking, or analytics.</>,
        <><strong>Local storage</strong> — We store UI preferences (theme, extended hours display) in your browser's local storage. This data stays on your device and contains no personal information.</>,
      ]} />

      <SectionTitle>6. Data Retention</SectionTitle>
      <BulletList items={[
        'Your account data and portfolio information are retained for as long as your account is active.',
        'Portfolio snapshots are retained to provide historical performance charts.',
        'You can delete your account and all associated data at any time from Settings.',
        'Upon account deletion, all your data is permanently removed from our systems.',
      ]} />

      <SectionTitle>7. Your Rights</SectionTitle>
      <BulletList items={[
        <><strong>Access</strong> — View all your data directly in the app (holdings, charts, performance, settings).</>,
        <><strong>Export</strong> — Download your portfolio data as a CSV file from Settings.</>,
        <><strong>Correction</strong> — Edit your holdings, display name, and preferences at any time.</>,
        <><strong>Deletion</strong> — Permanently delete your account and all data from Settings {'>'} Danger Zone.</>,
      ]} />

      <SectionTitle>8. Data Security</SectionTitle>
      <BulletList items={[
        'Passwords are hashed using bcrypt with salt rounds — we never store or see your plaintext password',
        'Authentication uses short-lived JWT tokens in httpOnly secure cookies with automatic refresh token rotation',
        'All connections use HTTPS (TLS encryption in transit)',
        'API access is restricted via CORS to authorized origins only',
        'Rate limiting protects against brute-force attacks on login and signup',
      ]} />

      <SectionTitle>9. Children's Privacy</SectionTitle>
      <P>
        Nala is not intended for users under the age of 13. We do not knowingly collect personal information
        from children under 13. If we learn that we have collected data from a child under 13, we will
        promptly delete it.
      </P>

      <SectionTitle>10. Changes to This Policy</SectionTitle>
      <P>
        We may update this Privacy Policy from time to time. When we make material changes, we will notify
        you within the app and update the version number. Your continued use of Nala after changes take
        effect constitutes acceptance of the updated policy.
      </P>

      <SectionTitle>11. Contact</SectionTitle>
      <P>
        If you have questions about this Privacy Policy or your data, contact us at:
      </P>
      <P>
        <strong>Piques LLC</strong><br />
        Email: privacy@piques.io
      </P>
    </div>
  );
}

function TermsOfServiceContent() {
  return (
    <div>
      <h2 className="text-lg font-bold text-rh-light-text dark:text-rh-text mb-1">Terms of Service</h2>
      <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mb-4">Last updated: February 15, 2026</p>

      <SectionTitle>1. Acceptance of Terms</SectionTitle>
      <P>
        By creating an account or using Nala, you agree to these Terms of Service and our Privacy Policy.
        If you do not agree, do not use our service.
      </P>

      <SectionTitle>2. Description of Service</SectionTitle>
      <P>
        Nala is a portfolio tracking and analytics platform that helps you visualize and understand your
        investments. Nala is <strong>not a brokerage</strong>. We do not execute trades, hold your funds,
        manage investments, or have custody of any securities on your behalf.
      </P>

      <SectionTitle>3. Not Financial Advice</SectionTitle>
      <P>
        All information provided by Nala — including AI-generated insights, performance metrics, dividend
        projections, and market data — is for <strong>informational purposes only</strong> and does not
        constitute investment advice, financial advice, trading advice, or any other kind of professional advice.
        You should consult a qualified financial advisor before making investment decisions. Past performance
        does not guarantee future results.
      </P>

      <SectionTitle>4. Account Responsibilities</SectionTitle>
      <BulletList items={[
        'You are responsible for maintaining the security of your account credentials.',
        'You must provide accurate information when creating your account.',
        'One account per person. Do not create multiple accounts.',
        'You must be at least 13 years old to use Nala.',
      ]} />

      <SectionTitle>5. Acceptable Use</SectionTitle>
      <P>You agree not to:</P>
      <BulletList items={[
        'Scrape, crawl, or automatically extract data from Nala',
        'Attempt to access other users\' accounts or data',
        'Use Nala to distribute malware or conduct attacks',
        'Impersonate other users or misrepresent your identity',
        'Use Nala for any illegal purpose',
        'Reverse engineer, decompile, or disassemble any part of the service',
      ]} />

      <SectionTitle>6. Intellectual Property</SectionTitle>
      <P>
        The Nala name, branding, design, and underlying software are the property of Piques LLC. Your
        portfolio data belongs to you. We do not claim ownership of the financial data you input into Nala.
      </P>

      <SectionTitle>7. Third-Party Data</SectionTitle>
      <P>
        Market data, stock prices, and financial information displayed in Nala are sourced from third-party
        providers. While we strive for accuracy, we do not guarantee the completeness, timeliness, or accuracy
        of this data. Third-party data is subject to the respective provider's terms of use.
      </P>

      <SectionTitle>8. Limitation of Liability</SectionTitle>
      <P>
        To the maximum extent permitted by law, Piques LLC shall not be liable for any indirect, incidental,
        special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred
        directly or indirectly, or any loss of data arising from your use of Nala. We do not guarantee the
        accuracy of any data displayed in the application, including but not limited to stock prices,
        portfolio values, and performance calculations.
      </P>

      <SectionTitle>9. Termination</SectionTitle>
      <P>
        You may delete your account at any time from Settings. We reserve the right to suspend or terminate
        accounts that violate these Terms. Upon termination, your data will be permanently deleted in
        accordance with our Privacy Policy.
      </P>

      <SectionTitle>10. Changes to Terms</SectionTitle>
      <P>
        We may update these Terms from time to time. When we make material changes, we will notify you
        within the app. Your continued use of Nala after changes take effect constitutes acceptance of the
        updated terms.
      </P>

      <SectionTitle>11. Governing Law</SectionTitle>
      <P>
        These Terms shall be governed by and construed in accordance with the laws of the State of
        California, without regard to its conflict of law provisions.
      </P>

      <SectionTitle>12. Contact</SectionTitle>
      <P>
        If you have questions about these Terms, contact us at:
      </P>
      <P>
        <strong>Piques LLC</strong><br />
        Email: legal@piques.io
      </P>
    </div>
  );
}

export function PrivacyPolicyModal({ isOpen, onClose, initialTab = 'privacy' }: PrivacyPolicyModalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 max-h-[85vh] bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/20 dark:border-white/[0.1] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200/40 dark:border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Legal</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-rh-border transition-colors"
            >
              <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Tab toggle */}
          <div className="flex gap-1 bg-gray-100 dark:bg-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'privacy'
                  ? 'bg-white dark:bg-white/[0.12] text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'terms'
                  ? 'bg-white dark:bg-white/[0.12] text-rh-light-text dark:text-rh-text shadow-sm'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
            >
              Terms of Service
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'privacy' ? <PrivacyPolicyContent /> : <TermsOfServiceContent />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200/40 dark:border-white/[0.08] text-center">
          <p className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/60">
            Effective February 15, 2026 · Version 1.0 · Piques LLC
          </p>
        </div>
      </div>
    </div>
  );
}
