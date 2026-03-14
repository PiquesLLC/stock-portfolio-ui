import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config api base url', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses production domain for capacitor production builds when env points to a private IP', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_API_URL', 'http://192.168.1.191:3001');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://nalaai.com');
  });

  it('keeps explicit public api urls for capacitor production builds', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://api.example.com');
  });
});
