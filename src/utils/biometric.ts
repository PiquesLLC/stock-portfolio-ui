import { isNative } from './platform';

/**
 * Biometric authentication utilities for native iOS/Android.
 * Uses iOS Keychain with biometric gate (Face ID / Touch ID).
 * All functions are no-ops on web — safe to call unconditionally.
 */

// Lazy-load the plugin to avoid import errors on web
async function getBiometricPlugin() {
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  return NativeBiometric;
}

const BIOMETRIC_SERVER = 'com.nala.portfolio';
const BIOMETRIC_PREF_KEY = 'nala_biometric_enabled';

export type BiometricType = 'face' | 'fingerprint' | 'none';

/**
 * Check if biometric authentication is available on this device.
 * Returns the type of biometric available (face, fingerprint, or none).
 */
export async function isBiometricAvailable(): Promise<BiometricType> {
  if (!isNative) return 'none';
  try {
    const NativeBiometric = await getBiometricPlugin();
    const result = await NativeBiometric.isAvailable();
    if (!result.isAvailable) return 'none';
    // biometryType: 1 = Touch ID/Fingerprint, 2 = Face ID/Face
    if (result.biometryType === 2) return 'face';
    if (result.biometryType === 1) return 'fingerprint';
    return 'fingerprint'; // default fallback
  } catch {
    return 'none';
  }
}

/**
 * Store a refresh token in the Keychain behind a biometric gate.
 */
export async function saveBiometricToken(refreshToken: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    const NativeBiometric = await getBiometricPlugin();
    await NativeBiometric.setCredentials({
      username: 'nala_refresh_token',
      password: refreshToken,
      server: BIOMETRIC_SERVER,
    });
    localStorage.setItem(BIOMETRIC_PREF_KEY, 'true');
    return true;
  } catch (err) {
    console.error('[Biometric] Failed to save token:', err);
    return false;
  }
}

/**
 * Prompt biometric auth and retrieve the stored refresh token.
 * Returns null if biometric fails, is cancelled, or no token stored.
 */
export async function getBiometricToken(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const NativeBiometric = await getBiometricPlugin();

    // Prompt biometric verification
    await NativeBiometric.verifyIdentity({
      reason: 'Unlock Nala',
      title: 'Unlock Nala',
      subtitle: 'Verify your identity to access your portfolio',
      useFallback: false,
    });

    // If verification passed, retrieve the stored credentials
    const credentials = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });

    return credentials.password || null;
  } catch {
    // User cancelled or biometric failed
    return null;
  }
}

/**
 * Clear the biometric token (on logout).
 */
export async function clearBiometricToken(): Promise<void> {
  if (!isNative) return;
  try {
    const NativeBiometric = await getBiometricPlugin();
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {
    // Ignore — may not exist
  }
  localStorage.removeItem(BIOMETRIC_PREF_KEY);
}

/**
 * Check if the user has opted into biometric unlock.
 */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_PREF_KEY) === 'true';
}
