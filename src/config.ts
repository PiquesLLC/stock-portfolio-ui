// API URL configuration:
// - Not set (default):     "/api" (Vite proxy in dev)
// - VITE_API_URL="":       "" (same-origin production, no prefix)
// - VITE_API_URL="http://...": direct API URL (Capacitor/remote)
// For shipped Capacitor builds, only allow public HTTPS origins.
const envUrl = import.meta.env.VITE_API_URL as string | undefined;
const PROD_NATIVE_API_URL = 'https://nalaai.com';

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

function resolveApiBaseUrl(): string {
  if (import.meta.env.MODE === 'capacitor') {
    return envUrl && isPublicHttpsApiUrl(envUrl) ? envUrl : PROD_NATIVE_API_URL;
  }
  return envUrl !== undefined ? envUrl : '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

export const REFRESH_INTERVAL = 5000; // 5 seconds
