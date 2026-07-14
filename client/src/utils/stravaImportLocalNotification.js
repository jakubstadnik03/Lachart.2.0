import { withLocalNotificationsPermission } from './localNotificationsHelper';
import { isCapacitorNative } from './isNativeApp';

let lastNotifyAt = 0;
const DEDUP_MS = 5000;

/**
 * On Capacitor iOS/Android, show a system notification when new Strava activities were imported.
 * Skips web; respects user.notifications.pushStravaImport when `userNotifications` is passed.
 * When native, appends hint about adding field lactate if any recent activities are still missing lap lactate.
 * `latestActivityId` (Strava numeric id) is embedded in the notification's `extra` so the tap handler
 * in initCapacitorShell can deep-link directly into the activity for one-tap lactate entry.
 */
export async function maybeNotifyStravaActivitiesImported(importedCount, userNotifications, latestActivityId = null) {
  if (userNotifications && userNotifications.pushStravaImport === false) return;

  const n = Number(importedCount);
  if (!Number.isFinite(n) || n < 1) return;

  const now = Date.now();
  if (now - lastNotifyAt < DEDUP_MS) return;
  lastNotifyAt = now;

  let lactateHint = '';
  if (isCapacitorNative()) {
    try {
      const { getPendingLactateActivities } = await import('../services/api');
      const pending = await getPendingLactateActivities(null, { days: 14 });
      const c = Array.isArray(pending?.activities) ? pending.activities.length : 0;
      if (c > 0) {
        lactateHint =
          c === 1
            ? ' You can add lap lactate for 1 activity (Training → Field lactate).'
            : ` You can add lap lactate for ${c} activities (Training → Field lactate).`;
      }
    } catch {
      // ignore — notification still useful without pending count
    }
  }

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    const id = Math.floor((now % 2147483000) + Math.random() * 1000);
    const base =
      n === 1
        ? '1 new activity imported from Strava.'
        : `${n} new activities imported from Strava.`;
    const body = `${base}${lactateHint}`;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: 'LaChart — Strava',
          body,
          schedule: { at: new Date(now + 800) },
          // Picked up by `localNotificationActionPerformed` listener in initCapacitorShell.
          // `type: 'strava_import'` routes to the dashboard; when a single activity is known,
          // `latestActivityId` opens its ActivityFullModal directly.
          extra: {
            type: 'strava_import',
            latestActivityId: latestActivityId ? String(latestActivityId) : null,
            count: n,
          },
        },
      ],
    });
  });
}
