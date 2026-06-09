import { Capacitor } from '@capacitor/core';

let backListenerHandle;

/**
 * One-time setup for Capacitor iOS/Android WebView: splash, status bar, hardware back, push notifications.
 */
export async function initCapacitorShell() {
  if (!Capacitor.isNativePlatform()) return;

  // ── Apple Watch sync ────────────────────────────────────────────────
  // Wire the LaChart Watch app → iPhone WebView bridge so workouts
  // recorded on the watch flow into the user's training log automatically.
  // No-op on Android (no Watch counterpart).
  try {
    const { initWatchWorkoutSync } = await import('../utils/watchWorkoutSync');
    await initWatchWorkoutSync();
  } catch (err) {
    console.warn('[Init] watch sync setup failed:', err?.message || err);
  }

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

    // ── Deep-link handler for OAuth callbacks ─────────────────────────
    // Strava OAuth on iOS opens in external Safari. After authorize,
    // the server redirects to com.lachart.app://strava-connected. iOS
    // asks the user "Open in LaChart?" — when they tap yes, Capacitor
    // fires `appUrlOpen` with the full URL. We pull out the result and
    // signal the React tree (via window event) so the Settings card
    // refreshes integration status and the Strava banner flips to
    // "Connected" without the user having to relaunch the app.
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        if (!url) return;
        // Accept any scheme like com.lachart.app://strava-connected[?ok=1]
        if (/strava-connected/i.test(url)) {
          window.dispatchEvent(new CustomEvent('strava:connected', { detail: { url } }));
          // Bring the user to the Settings page if they're not already there
          // so they see the now-Connected card immediately.
          if (!window.location.hash.includes('/settings') && !/settings/.test(window.location.pathname)) {
            window.location.replace(`${window.location.origin}/settings`);
          }
        } else if (/strava-error/i.test(url)) {
          window.dispatchEvent(new CustomEvent('strava:error', { detail: { url } }));
        } else if (/open-training/i.test(url)) {
          // Home-screen widget tapped a specific training:
          // com.lachart.app://open-training?id=<prefixed-id>. Route to the
          // dashboard's openActivity flow, which resolves the id and opens the
          // full training (same mechanism used by notification taps).
          let id = null;
          try { id = new URL(url).searchParams.get('id'); }
          catch { const m = url.match(/[?&]id=([^&]+)/); id = m ? decodeURIComponent(m[1]) : null; }
          if (id) {
            window.location.replace(
              `${window.location.origin}/?openActivity=${encodeURIComponent(id)}`
            );
          }
        } else if (/open-planned/i.test(url)) {
          // Widget tapped a PLANNED workout:
          // com.lachart.app://open-planned?id=<plannedId>. Route to the
          // dashboard's openPlanned flow (opens the planned-workout editor).
          let id = null;
          try { id = new URL(url).searchParams.get('id'); }
          catch { const m = url.match(/[?&]id=([^&]+)/); id = m ? decodeURIComponent(m[1]) : null; }
          if (id) {
            window.location.replace(
              `${window.location.origin}/?openPlanned=${encodeURIComponent(id)}`
            );
          }
        }
      } catch (e) {
        console.warn('[deeplink] appUrlOpen handler failed:', e?.message || e);
      }
    });

    // Apple Health: connect + sync from Settings → Integrations (AppleHealthCard).
    // Requires HealthKit capability on the App ID and a native rebuild after cap sync.
  } catch {
    // ignore
  }

  // ── Local notifications (client-scheduled, e.g. Strava sync result) ───────
  // Same deep-link behaviour as server-pushed notifications so the user lands
  // on the imported activity with the ActivityFullModal open.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = event?.notification?.extra || {};
      const type = extra.type;
      const latestActivityId = extra.latestActivityId;
      let path = '/';
      if (type === 'strava_import' && latestActivityId) {
        path = `/?openActivity=${encodeURIComponent(`strava-${latestActivityId}`)}`;
      }
      window.location.replace(`${window.location.origin}${path}`);
    });
  } catch (err) {
    console.warn('[LocalNotifications] init failed:', err?.message || err);
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
