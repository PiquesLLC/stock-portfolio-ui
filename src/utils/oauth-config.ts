const NATIVE_GOOGLE_CLIENT_ID = '7470155005-n9ptctaid4bkijpdiro1p4sk341nf8ei.apps.googleusercontent.com';
const NATIVE_APPLE_CLIENT_ID = 'com.nalaai.web';
const NATIVE_APPLE_REDIRECT_URI = 'https://nalaai.com';

function isCapacitorBuild(): boolean {
  return import.meta.env.MODE === 'capacitor';
}

export function getGoogleClientId(): string | undefined {
  const explicit = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return explicit || (isCapacitorBuild() ? NATIVE_GOOGLE_CLIENT_ID : undefined);
}

export function getAppleConfig(): { clientId?: string; redirectURI: string } {
  const clientId = (import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined)
    || (isCapacitorBuild() ? NATIVE_APPLE_CLIENT_ID : undefined);
  const redirectURI = (import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined)
    || (isCapacitorBuild() ? NATIVE_APPLE_REDIRECT_URI : window.location.origin);
  return { clientId, redirectURI };
}
