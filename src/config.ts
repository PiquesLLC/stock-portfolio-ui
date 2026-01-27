// API URL: uses environment variable or defaults to localhost:3001
// Set VITE_API_URL environment variable to override
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const REFRESH_INTERVAL = 5000; // 5 seconds
