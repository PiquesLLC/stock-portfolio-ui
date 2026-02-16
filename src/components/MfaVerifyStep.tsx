import { useState, useRef, useEffect } from 'react';
import { useAuth, MfaChallenge } from '../context/AuthContext';
import { sendMfaEmailOtp } from '../api';

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface MfaVerifyStepProps {
  challenge: MfaChallenge;
}

export function MfaVerifyStep({ challenge }: MfaVerifyStepProps) {
  const { verifyMfa, clearMfaChallenge } = useAuth();
  const [method, setMethod] = useState<'totp' | 'email' | 'backup'>(() => {
    if (challenge.methods.includes('totp')) return 'totp';
    if (challenge.methods.includes('email')) return 'email';
    return 'backup';
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [method]);

  const handleSubmit = async (submittedCode?: string) => {
    const codeToVerify = submittedCode || code;
    if (!codeToVerify.trim()) return;
    setError('');
    setIsLoading(true);
    try {
      await verifyMfa(codeToVerify.trim(), method);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    // Allow digits for totp/email, alphanumeric+hyphen for backup
    const cleaned = method === 'backup'
      ? value.toLowerCase().replace(/[^a-z0-9-]/g, '')
      : value.replace(/\D/g, '');
    setCode(cleaned);

    // Auto-submit on 6 digits for totp/email
    if (method !== 'backup' && cleaned.length === 6) {
      handleSubmit(cleaned);
    }
  };

  const handleSendEmailOtp = async () => {
    setSendingEmail(true);
    try {
      await sendMfaEmailOtp(challenge.challengeToken);
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSendingEmail(false);
    }
  };

  const getMethodLabel = () => {
    switch (method) {
      case 'totp': return 'Enter the 6-digit code from your authenticator app';
      case 'email': return challenge.maskedEmail
        ? `Enter the 6-digit code sent to ${challenge.maskedEmail}`
        : 'Enter the 6-digit code sent to your email';
      case 'backup': return 'Enter one of your backup codes';
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-rh-dark border border-rh-border rounded-lg text-white placeholder-rh-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/60 focus-visible:border-rh-green transition-all duration-150 text-center text-lg tracking-[0.3em] font-mono";

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rh-green/10 mb-3">
          <svg className="w-6 h-6 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-1">Two-Factor Authentication</h2>
        <p className="text-sm text-rh-muted">{getMethodLabel()}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2.5">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Send email button (email method only) */}
      {method === 'email' && !emailSent && (
        <button
          type="button"
          onClick={handleSendEmailOtp}
          disabled={sendingEmail}
          className="w-full py-2.5 bg-rh-border hover:bg-rh-border/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {sendingEmail ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner />
              Sending...
            </span>
          ) : 'Send Verification Code'}
        </button>
      )}
      {method === 'email' && emailSent && (
        <p className="text-sm text-rh-green text-center">Code sent! Check your email.</p>
      )}

      {/* Code input */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          className={inputClasses}
          placeholder={method === 'backup' ? 'xxxx-xxxx' : '000000'}
          maxLength={method === 'backup' ? 9 : 6}
          autoComplete="one-time-code"
          inputMode={method === 'backup' ? 'text' : 'numeric'}
          autoFocus
        />

        <button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="w-full mt-4 py-3 bg-rh-green hover:bg-rh-green/90 active:bg-rh-green/80 disabled:bg-rh-green/50 disabled:cursor-wait text-white font-semibold rounded-lg transition-all duration-150 shadow-lg shadow-rh-green/25"
        >
          {isLoading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner />
              Verifying...
            </span>
          ) : 'Verify'}
        </button>
      </form>

      {/* Method switcher */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {challenge.methods.includes('totp') && method !== 'totp' && (
          <button
            type="button"
            onClick={() => { setMethod('totp'); setCode(''); setError(''); }}
            className="text-xs text-rh-muted hover:text-rh-green transition-colors"
          >
            Use authenticator app
          </button>
        )}
        {challenge.methods.includes('email') && method !== 'email' && (
          <button
            type="button"
            onClick={() => { setMethod('email'); setCode(''); setError(''); setEmailSent(false); }}
            className="text-xs text-rh-muted hover:text-rh-green transition-colors"
          >
            Use email code
          </button>
        )}
        {method !== 'backup' && (
          <button
            type="button"
            onClick={() => { setMethod('backup'); setCode(''); setError(''); }}
            className="text-xs text-rh-muted hover:text-rh-green transition-colors"
          >
            Use backup code
          </button>
        )}
      </div>

      {/* Back button */}
      <button
        type="button"
        onClick={clearMfaChallenge}
        className="w-full text-sm text-rh-muted/70 hover:text-white transition-colors"
      >
        &larr; Back to Sign In
      </button>
    </div>
  );
}
