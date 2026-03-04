import { isNative, platform } from './platform';
import { API_BASE_URL } from '../config';

/**
 * Native push notification registration for iOS/Android.
 * Uses @capacitor/push-notifications to get APNs device tokens.
 * No-ops on web — web continues using existing VAPID-based push.ts.
 */

// Lazy-load the plugin to avoid import errors on web
async function getPushPlugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

let registered = false;

/**
 * Register for native push notifications.
 * Requests permission, gets device token, sends to server.
 */
export async function registerNativePush(): Promise<boolean> {
  if (!isNative || registered) return false;

  try {
    const PushNotifications = await getPushPlugin();

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('[Push Native] Permission not granted:', permResult.receive);
      return false;
    }

    // Listen for registration success — sends device token to server
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[Push Native] Device token received:', token.value.substring(0, 8) + '...');
      try {
        await fetch(`${API_BASE_URL}/push/device`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Nala-Native': '1' },
          body: JSON.stringify({
            token: token.value,
            platform: platform, // 'ios' or 'android'
          }),
        });
        console.log('[Push Native] Device token registered with server');
      } catch (err) {
        console.error('[Push Native] Failed to send token to server:', err);
      }
    });

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push Native] Registration failed:', err.error);
    });

    // Listen for notifications received while app is in foreground
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push Native] Notification received in foreground:', notification.title);
      // Could show an in-app toast here
    });

    // Listen for notification tap (app opened from notification)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.url) {
        // Navigate to the specified URL
        window.location.hash = data.url;
      }
    });

    // Register with APNs/FCM
    await PushNotifications.register();
    registered = true;
    console.log('[Push Native] Registration initiated');
    return true;
  } catch (err) {
    console.error('[Push Native] Setup failed:', err);
    return false;
  }
}

/**
 * Unregister native push — remove device token from server.
 */
export async function unregisterNativePush(): Promise<boolean> {
  if (!isNative) return false;

  try {
    // We don't have the token cached locally, so just tell the server
    // to remove all tokens for this user (handled by logout flow)
    await fetch(`${API_BASE_URL}/push/device`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Nala-Native': '1' },
      body: JSON.stringify({ token: '__all__' }), // Server can handle this
    });
    registered = false;
    return true;
  } catch (err) {
    console.error('[Push Native] Unregister failed:', err);
    return false;
  }
}
