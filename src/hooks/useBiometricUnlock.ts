import { useEffect, useRef } from 'react';
import { isNative } from '../utils/platform';
import { isBiometricEnabled, getBiometricToken, saveBiometricToken } from '../utils/biometric';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

/**
 * Hook that auto-unlocks the app with biometric auth when resuming from background.
 * Only active on native when biometric unlock is enabled and user is logged out.
 */
export function useBiometricUnlock() {
  const { user, refreshUser } = useAuth();
  const attemptingRef = useRef(false);

  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    async function setupListener() {
      const { App } = await import('@capacitor/app');

      const listener = await App.addListener('appStateChange', async ({ isActive }) => {
        // Only attempt on resume when user is NOT logged in and biometric is enabled
        if (!isActive || user || attemptingRef.current || !isBiometricEnabled()) return;

        attemptingRef.current = true;
        try {
          const refreshToken = await getBiometricToken();
          if (!refreshToken) return; // User cancelled or biometric failed

          // Use the refresh token to get a new session
          // Send via body (the refresh endpoint reads from req.body.refreshToken)
          const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Nala-Native': '1' },
            body: JSON.stringify({ refreshToken }),
          });

          if (res.ok) {
            // The refresh endpoint rotates the token — update Keychain with the new one
            const data = await res.json().catch(() => ({}));
            if (data.refreshToken) {
              await saveBiometricToken(data.refreshToken);
            }
            // Session cookie is set — refresh the user state
            await refreshUser();
          }
        } catch (err) {
          console.error('[Biometric] Auto-unlock failed:', err);
        } finally {
          attemptingRef.current = false;
        }
      });

      cleanup = () => listener.remove();
    }

    setupListener();

    return () => {
      cleanup?.();
    };
  }, [user, refreshUser]);
}
