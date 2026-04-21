/**
 * LaChart Push & Local Notification Service
 *
 * Wraps @capacitor/push-notifications + @capacitor/local-notifications.
 * Works in both the native Capacitor app (iOS/Android) and the web browser
 * (falls back to Web Notification API).
 */

import { Capacitor } from '@capacitor/core';

// Lazy-load Capacitor plugins so the web build doesn't crash when they're absent
const isNative = () => Capacitor.isNativePlatform();

let PushNotifications = null;
let LocalNotifications = null;

const loadPlugins = async () => {
  if (isNative()) {
    if (!PushNotifications) {
      const pn = await import('@capacitor/push-notifications');
      PushNotifications = pn.PushNotifications;
    }
    if (!LocalNotifications) {
      const ln = await import('@capacitor/local-notifications');
      LocalNotifications = ln.LocalNotifications;
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Permission & registration
// ─────────────────────────────────────────────────────────────

/**
 * Request notification permissions and register for push notifications.
 * Returns the APNs/FCM device token (native) or null (web).
 */
export const registerForPushNotifications = async () => {
  await loadPlugins();

  // ── Native (iOS / Android) ────────────────────────────────
  if (isNative() && PushNotifications) {
    // Check / request permission
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Notifications] Permission not granted:', permStatus.receive);
      return null;
    }

    // Register with APNs / FCM
    await PushNotifications.register();

    // Return token via a one-shot promise
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token) => {
        console.log('[Notifications] Device token:', token.value);
        resolve(token.value);
      });
      PushNotifications.addListener('registrationError', (err) => {
        console.error('[Notifications] Registration error:', err);
        resolve(null);
      });
    });
  }

  // ── Web fallback ──────────────────────────────────────────
  if ('Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted' ? 'web-granted' : null;
  }

  return null;
};

/**
 * Check if notifications are currently granted (without prompting).
 */
export const checkNotificationPermission = async () => {
  await loadPlugins();
  if (isNative() && PushNotifications) {
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted';
  }
  return 'Notification' in window && Notification.permission === 'granted';
};

// ─────────────────────────────────────────────────────────────
// Push notification listeners
// ─────────────────────────────────────────────────────────────

/**
 * Set up listeners for incoming push notifications.
 * Call once at app startup (e.g. in App.jsx).
 *
 * @param {object} handlers
 * @param {function} handlers.onMessage    - fired when notification received in foreground
 * @param {function} handlers.onActionPerformed - fired when user taps a notification
 */
export const addPushListeners = async ({ onMessage, onActionPerformed } = {}) => {
  await loadPlugins();
  if (!isNative() || !PushNotifications) return;

  if (onMessage) {
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Notifications] Received:', notification);
      onMessage(notification);
    });
  }

  if (onActionPerformed) {
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Notifications] Action performed:', action);
      onActionPerformed(action);
    });
  }
};

/** Remove all push notification listeners */
export const removePushListeners = async () => {
  await loadPlugins();
  if (isNative() && PushNotifications) {
    await PushNotifications.removeAllListeners();
  }
};

// ─────────────────────────────────────────────────────────────
// Local notifications
// ─────────────────────────────────────────────────────────────

let _localNotifIdCounter = 1;

/**
 * Schedule a local notification.
 *
 * @param {object} options
 * @param {string}  options.title
 * @param {string}  options.body
 * @param {Date}    [options.at]         - exact time to fire (defaults to now + 1s)
 * @param {number}  [options.delayMs]    - fire in N milliseconds from now
 * @param {string}  [options.id]         - optional string id for cancelling later
 * @param {object}  [options.extra]      - arbitrary data attached to notification
 * @returns {number} notification id
 */
export const scheduleLocalNotification = async ({ title, body, at, delayMs, id, extra = {} }) => {
  await loadPlugins();

  const numId = _localNotifIdCounter++;
  const fireAt = at ?? (delayMs != null ? new Date(Date.now() + delayMs) : new Date(Date.now() + 1000));

  // ── Native ────────────────────────────────────────────────
  if (isNative() && LocalNotifications) {
    // Request permission if needed
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt') {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== 'granted') return null;

    await LocalNotifications.schedule({
      notifications: [{
        id:    numId,
        title,
        body,
        schedule: { at: fireAt, allowWhileIdle: true },
        extra,
        sound:  undefined,     // use default system sound
        smallIcon: 'ic_launcher_foreground',
      }],
    });
    return numId;
  }

  // ── Web fallback ──────────────────────────────────────────
  if ('Notification' in window && Notification.permission === 'granted') {
    const delay = fireAt.getTime() - Date.now();
    setTimeout(() => new Notification(title, { body, data: extra }), Math.max(0, delay));
  }
  return numId;
};

/**
 * Cancel a previously scheduled local notification.
 * @param {number|number[]} ids
 */
export const cancelLocalNotification = async (ids) => {
  await loadPlugins();
  if (!isNative() || !LocalNotifications) return;
  const idArr = Array.isArray(ids) ? ids : [ids];
  await LocalNotifications.cancel({ notifications: idArr.map(id => ({ id })) });
};

/** Cancel ALL pending local notifications */
export const cancelAllLocalNotifications = async () => {
  await loadPlugins();
  if (!isNative() || !LocalNotifications) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }
};

// ─────────────────────────────────────────────────────────────
// Convenience helpers for LaChart use-cases
// ─────────────────────────────────────────────────────────────

/**
 * Notify: lactate test recovery is almost over, time to start next interval.
 * @param {number} secondsUntilStart - seconds until the next interval begins
 * @param {number} nextStepPower     - target power for the next step (W)
 */
export const scheduleIntervalStartNotification = (secondsUntilStart, nextStepPower) =>
  scheduleLocalNotification({
    title: '🚴 Next Interval Starting',
    body:  `Recovery complete – get ready for ${nextStepPower}W!`,
    delayMs: Math.max(0, (secondsUntilStart - 5) * 1000),
    extra:   { type: 'interval_start', power: nextStepPower },
  });

/**
 * Notify: time to take a lactate measurement.
 */
export const scheduleLactateMeasurementNotification = () =>
  scheduleLocalNotification({
    title: '🩸 Lactate Measurement',
    body:  'Interval complete – enter your lactate value now.',
    delayMs: 500,
    extra:   { type: 'lactate_measurement' },
  });

/**
 * Notify: daily training reminder.
 * @param {string} time  - "HH:MM" 24-hour time string, e.g. "08:00"
 * @param {string} message
 */
export const scheduleDailyTrainingReminder = async (time = '08:00', message = "Time to train! 💪") => {
  const [h, m] = time.split(':').map(Number);
  const fireAt = new Date();
  fireAt.setHours(h, m, 0, 0);
  if (fireAt <= new Date()) fireAt.setDate(fireAt.getDate() + 1);

  return scheduleLocalNotification({
    title:   '🏃 LaChart Training Reminder',
    body:    message,
    at:      fireAt,
    extra:   { type: 'training_reminder' },
  });
};
