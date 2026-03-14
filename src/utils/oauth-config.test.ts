import { afterEach, describe, expect, it, vi } from 'vitest';

describe('oauth config', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses tracked native fallback values for capacitor builds', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('VITE_APPLE_CLIENT_ID', '');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', '');

    const oauth = await import('./oauth-config');

    expect(oauth.getGoogleClientId()).toBe('7470155005-n9ptctaid4bkijpdiro1p4sk341nf8ei.apps.googleusercontent.com');
    expect(oauth.getAppleConfig()).toEqual({
      clientId: 'com.nalaai.web',
      redirectURI: 'https://nalaai.com',
    });
  });

  it('prefers explicit env vars when present', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-explicit');
    vi.stubEnv('VITE_APPLE_CLIENT_ID', 'apple-explicit');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', 'https://example.com/apple');

    const oauth = await import('./oauth-config');

    expect(oauth.getGoogleClientId()).toBe('google-explicit');
    expect(oauth.getAppleConfig()).toEqual({
      clientId: 'apple-explicit',
      redirectURI: 'https://example.com/apple',
    });
  });
});
