import { API_BASE_URL } from '../config';

/**
 * Check if Web Push is supported in this browser.
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Register the push-only service worker.
 * Returns the registration, or null if unsupported/failed.
 */
export async function registerPushSW(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
  } catch (err) {
    console.error('[Push] Failed to register push-sw.js:', err);
    return null;
  }
}

/**
 * Fetch the VAPID public key from the API.
 */
async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/push/vapid-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.vapidPublicKey || null;
  } catch {
    return null;
  }
}

/**
 * Convert a URL-safe base64 VAPID key to a Uint8Array for the subscribe call.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe the user to push notifications.
 * Requests permission, gets PushSubscription, sends to server.
 * Returns true on success, false on failure/denial.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Get VAPID key from server
    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      console.error('[Push] Could not fetch VAPID key — push may be disabled on server');
      return false;
    }

    // Get the push-sw registration
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      console.error('[Push] No service worker registration found');
      return false;
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // Send subscription to server
    const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return res.ok;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 * Removes server-side subscription and unsubscribes locally.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true; // Already unsubscribed

    // Remove from server
    await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Unsubscribe locally
    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
    return false;
  }
}

/**
 * Check if the user currently has an active push subscription.
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return subscription != null;
  } catch {
    return false;
  }
}

/**
 * Get the current notification permission state.
 */
export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}
