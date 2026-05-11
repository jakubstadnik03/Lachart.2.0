import { Capacitor } from '@capacitor/core';

let backListenerHandle;

/**
 * One-time setup for Capacitor iOS/Android WebView: splash, status bar, hardware back, push notifications.
 */
export async function initCapacitorShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // plugin missing or already hidden
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    // iOS: @capacitor/status-bar implements setOverlaysWebView as unimplemented() — do not call.
    // Android: optional overlay so layout matches CSS safe-area (see Layout + index.css).
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch {
    // ignore
  }

  try {
    const { App } = await import('@capacitor/app');
    if (!backListenerHandle) {
      backListenerHandle = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        void App.exitApp();
      });
    }

    // Apple Health auto-sync — runs once on cold-start, then again whenever
    // the app comes back to foreground (throttled to 1× / 24h via localStorage
    // inside healthKitSync.maybeSyncOnAppOpen).
    const { maybeSyncOnAppOpen } = await import('../services/healthKitSync');
    void maybeSyncOnAppOpen();
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void maybeSyncOnAppOpen();
    });
  } catch {
    // ignore
  }

  // ── Push notifications ─────────────────────────────────────────────────────
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { registerPushToken } = await import('../services/api');

    // Check current permission (no prompt)
    let permStatus = await PushNotifications.checkPermissions();

    // Only request permission if not yet decided
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive === 'granted') {
      // Register with APNs (iOS) / FCM (Android)
      await PushNotifications.register();

      // Send token to our backend once received
      await PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] Device token:', token.value);
        try {
          await registerPushToken(token.value);
          console.log('[Push] Token registered on server');
        } catch (err) {
          console.warn('[Push] Failed to register token on server:', err);
        }
      });

      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err);
      });

      // Foreground notification — show in-app via NotificationContext is not available here,
      // so we dispatch a custom event that NotificationBell can listen for
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Received in foreground:', notification);
        window.dispatchEvent(new CustomEvent('pushNotificationReceived', {
          detail: notification,
        }));
      });

      // Notification tap — navigate to the relevant screen.
      // Strava imports + activity-type pushes route to the dashboard with
      // `?openActivity=<prefix>-<id>` so the dashboard auto-opens the
      // ActivityFullModal (Lactate button included) for one-tap annotation.
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Tapped:', action);
        const data = action.notification?.data || {};

        const resourceId   = data.resourceId   || data.resource_id;
        const resourceType = data.resourceType || data.resource_type || 'training';
        const pushType     = data.type;
        const activityId   = data.activityId   || data.activity_id;
        const activityType = data.activityType || data.activity_type;

        // Activity deep-link → dashboard with auto-opened ActivityFullModal
        const isActivityDeepLink =
          (activityId && activityType) ||
          (pushType === 'strava_import' && (activityId || resourceId));

        let path;
        if (isActivityDeepLink) {
          const id     = activityId || resourceId;
          const prefix = activityType || (pushType === 'strava_import' ? 'strava' : resourceType);
          path = `/?openActivity=${encodeURIComponent(`${prefix}-${id}`)}`;
        } else if (resourceId) {
          path = resourceType === 'training'
            ? `/training-calendar/training-${resourceId}`
            : `/training-calendar/${resourceId}`;
        } else {
          path = '/';
        }

        window.location.replace(`${window.location.origin}${path}`);
      });
    }
  } catch (err) {
    console.warn('[Push] Plugin init failed:', err);
  }
}
