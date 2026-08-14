import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Step 2 of a brand-new Google/Apple signup: the date-of-birth age gate.
 * Mounted on the unauthenticated surfaces (LoginPage, LandingPage) and shows
 * itself whenever AuthContext holds a pending OAuth signup. The server
 * persists nothing until this step passes — cancelling leaves no account.
 */
/** Map the server's machine error codes to human copy; pass friendly strings through. */
function friendlyDobError(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (raw === 'ACCOUNT_ALREADY_EXISTS') return 'You already have an account — please sign in instead.';
  if (raw === 'WAITLIST_NOT_APPROVED') return "You're on the waitlist — we'll email you when a spot opens.";
  if (!raw) return 'Something went wrong — please try again';
  return raw;
}

export default function OAuthDobModal() {
  const { pendingOAuthDob, completeOAuthSignup, cancelOAuthSignup } = useAuth();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!pendingOAuthDob) return null;

  const submit = async () => {
    setError('');
    if (!dateOfBirth) {
      setError('Please enter your date of birth');
      return;
    }
    // Client-side age check for immediate feedback; the server enforces it authoritatively.
    const dob = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const mo = now.getMonth() - dob.getMonth();
    if (mo < 0 || (mo === 0 && now.getDate() < dob.getDate())) age--;
    if (Number.isNaN(dob.getTime()) || age < 13) {
      setError('You must be at least 13 years old to use Nala.');
      return;
    }
    setSaving(true);
    try {
      await completeOAuthSignup(dateOfBirth);
      // Success: AuthContext sets the user and the app renders — this modal unmounts with the page.
    } catch (err) {
      setError(friendlyDobError(err));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-white/[0.1] bg-black/95 backdrop-blur-md shadow-xl">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-base font-semibold text-white">One last step</h2>
          <p className="mt-1.5 text-xs text-white leading-relaxed">
            Nala requires you to be at least 13 years old. Your date of birth is used only for this check and is not stored.
          </p>
        </div>
        <div className="px-5 py-4">
          <label htmlFor="oauthDateOfBirth" className="block text-sm font-medium text-white mb-2">Date of Birth</label>
          <input
            id="oauthDateOfBirth"
            type="date"
            value={dateOfBirth}
            onChange={e => setDateOfBirth(e.target.value)}
            autoComplete="bday"
            className="w-full px-4 py-3 bg-rh-dark border border-rh-border rounded-lg text-white placeholder-rh-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/60 focus-visible:border-rh-green transition-all duration-150"
          />
          {error && <p className="mt-2 text-xs text-rh-red">{error}</p>}
        </div>
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={cancelOAuthSignup}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-white/[0.08] text-white hover:text-white hover:border-white/[0.15] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-rh-green text-black hover:bg-rh-green/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating account…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
