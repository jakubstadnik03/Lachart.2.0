import { withLocalNotificationsPermission } from './localNotificationsHelper';
import { isCapacitorNative } from './isNativeApp';

let lastNotifyAt = 0;
const DEDUP_MS = 5000;

/**
 * On Capacitor iOS/Android, show a system notification when new Strava activities were imported.
 * Skips web; respects user.notifications.pushStravaImport when `userNotifications` is passed.
 * When native, appends hint about adding field lactate if any recent activities are still missing lap lactate.
 */
export async function maybeNotifyStravaActivitiesImported(importedCount, userNotifications) {
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
        ? 'Nová aktivita ze Stravy.'
        : `${n} nových aktivit ze Stravy.`;
    const body = `${base}${lactateHint}`;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: 'LaChart — Strava',
          body,
          schedule: { at: new Date(now + 800) },
        },
      ],
    });
  });
}
