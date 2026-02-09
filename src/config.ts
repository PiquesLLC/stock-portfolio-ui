// API URL configuration:
// - Not set (default):     "/api" (Vite proxy in dev)
// - VITE_API_URL="":       "" (same-origin production, no prefix)
// - VITE_API_URL="http://...": direct API URL (Capacitor/remote)
const envUrl = import.meta.env.VITE_API_URL;
export const API_BASE_URL = envUrl !== undefined ? envUrl : '/api';

export const REFRESH_INTERVAL = 5000; // 5 seconds
