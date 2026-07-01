/**
 * APNs device token: cache locally, upload after login / on foreground.
 */
import { resolveNotificationTarget, applyNotificationNavigation } from './notificationNavigation';

const PENDING_KEY = 'lachart_pending_push_token';
let listenersAttached = false;

export function cachePushToken(token) {
  if (!token) return;
  try { localStorage.setItem(PENDING_KEY, String(token)); } catch { /* ignore */ }
}

export async function syncPushTokenToServer(token) {
  const value = (token || localStorage.getItem(PENDING_KEY) || '').trim();
  if (!value) return false;

  const auth = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!auth) return false;

  try {
    const { registerPushToken } = await import('../services/api');
    const { getMobileAppMetaForPush } = await import('./mobileAppSync');
    const meta = await getMobileAppMetaForPush();
    await registerPushToken(value, meta || {});
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.warn('[Push] syncPushTokenToServer failed:', e?.message || e);
    return false;
  }
}

function navigateFromPushData(data = {}) {
  const target = resolveNotificationTarget(data);
  applyNotificationNavigation(target, { replace: true });
}

async function showForegroundBanner(notification) {
  const title = notification?.title || notification?.data?.title || 'LaChart';
  const body = notification?.body || notification?.data?.body || '';
  if (!title && !body) return;
  try {
    const { withLocalNotificationsPermission } = await import('./localNotificationsHelper');
    await withLocalNotificationsPermission(async (LocalNotifications) => {
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 1e9),
          title,
          body,
          sound: 'default',
          extra: notification?.data || {},
        }],
      });
    });
  } catch { /* ignore */ }
}

/**
 * Request permission, register with APNs, attach listeners once, sync token.
 */
export async function ensurePushNotificationsSetup() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { PushNotifications } = await import('@capacitor/push-notifications');

    if (!listenersAttached) {
      listenersAttached = true;

      await PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] Device token received');
        cachePushToken(token.value);
        await syncPushTokenToServer(token.value);
      });

      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err);
      });

      await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('[Push] Foreground notification:', notification);
        window.dispatchEvent(new CustomEvent('pushNotificationReceived', { detail: notification }));
        await showForegroundBanner(notification);
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        navigateFromPushData(action.notification?.data || {});
      });
    }

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Push] Permission not granted:', permStatus.receive);
      return;
    }

    await PushNotifications.register();
    await syncPushTokenToServer();
  } catch (e) {
    console.warn('[Push] ensurePushNotificationsSetup failed:', e?.message || e);
  }
}
