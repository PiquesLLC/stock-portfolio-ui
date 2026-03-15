import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config api base url', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses production domain for capacitor production builds when env points to a private IP', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_NATIVE_API_URL', 'http://192.168.1.191:3001');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://stock-portfolio-api-production.up.railway.app');
  });

  it('keeps explicit public native api urls for capacitor production builds', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_NATIVE_API_URL', 'https://api.example.com');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://api.example.com');
  });

  it('falls back to production domain for non-https capacitor api urls', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_NATIVE_API_URL', 'http://api.example.com');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://stock-portfolio-api-production.up.railway.app');
  });

  it('ignores the app web origin for capacitor builds and uses the production api origin instead', async () => {
    vi.stubEnv('MODE', 'capacitor');
    vi.stubEnv('VITE_API_URL', 'https://nalaai.com');
    vi.stubEnv('VITE_NATIVE_API_URL', 'https://nalaai.com');

    const config = await import('./config');

    expect(config.API_BASE_URL).toBe('https://stock-portfolio-api-production.up.railway.app');
  });
});
