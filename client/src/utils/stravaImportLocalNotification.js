import { withLocalNotificationsPermission } from './localNotificationsHelper';

let lastNotifyAt = 0;
const DEDUP_MS = 5000;

/**
 * On Capacitor iOS/Android, show a system notification when new Strava activities were imported.
 * Skips web; respects user.notifications.pushStravaImport when `userNotifications` is passed.
 */
export async function maybeNotifyStravaActivitiesImported(importedCount, userNotifications) {
  if (userNotifications && userNotifications.pushStravaImport === false) return;

  const n = Number(importedCount);
  if (!Number.isFinite(n) || n < 1) return;

  const now = Date.now();
  if (now - lastNotifyAt < DEDUP_MS) return;
  lastNotifyAt = now;

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    const id = Math.floor((now % 2147483000) + Math.random() * 1000);
    const body =
      n === 1
        ? '1 new activity imported from Strava.'
        : `${n} new activities imported from Strava.`;
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
