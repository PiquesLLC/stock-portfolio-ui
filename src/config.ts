// API URL configuration:
// - Web dev default:         "/api" (Vite proxy)
// - Web prod VITE_API_URL:   same-origin or custom web API origin
// - Native VITE_NATIVE_API_URL: dedicated public API origin for Capacitor builds
const envUrl = import.meta.env.VITE_API_URL as string | undefined;
const nativeEnvUrl = import.meta.env.VITE_NATIVE_API_URL as string | undefined;
const PROD_NATIVE_API_URL = 'https://stock-portfolio-api-production.up.railway.app';
const APP_WEB_ORIGIN = 'https://nalaai.com';

function normalizeEnvUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim();
}

function isPrivateApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || host.startsWith('10.')
      || host.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}

function isPublicHttpsApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !isPrivateApiUrl(value);
  } catch {
    return false;
  }
}

function isAppWebOrigin(value: string): boolean {
  try {
    return new URL(value).origin === APP_WEB_ORIGIN;
  } catch {
    return false;
  }
}

function resolveApiBaseUrl(): string {
  const webEnvUrl = normalizeEnvUrl(envUrl);
  const nativeUrl = normalizeEnvUrl(nativeEnvUrl);
  if (import.meta.env.MODE === 'capacitor') {
    if (nativeUrl && isPublicHttpsApiUrl(nativeUrl) && !isAppWebOrigin(nativeUrl)) {
      return nativeUrl;
    }
    return PROD_NATIVE_API_URL;
  }
  return webEnvUrl ?? '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

export const REFRESH_INTERVAL = 5000; // 5 seconds
