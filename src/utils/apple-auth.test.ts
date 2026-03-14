import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('apple-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as Window & { AppleID?: unknown }).AppleID;
  });

  it('initializes Apple auth when the SDK already exists on the page', async () => {
    vi.stubEnv('VITE_APPLE_CLIENT_ID', 'com.example.web');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', 'https://example.com/auth/apple/callback');

    const init = vi.fn();
    const signIn = vi.fn();
    window.AppleID = { auth: { init, signIn } };

    const script = document.createElement('script');
    script.id = 'apple-signin-sdk';
    document.head.appendChild(script);

    const { ensureAppleAuthReady } = await import('./apple-auth');
    const auth = await ensureAppleAuthReady();

    expect(auth.signIn).toBe(signIn);
    expect(init).toHaveBeenCalledWith({
      clientId: 'com.example.web',
      scope: 'name email',
      redirectURI: 'https://example.com/auth/apple/callback',
      usePopup: true,
    });
  });
});
