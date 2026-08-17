import { withLocalNotificationsPermission } from './localNotificationsHelper';
import { getAppleHealthPrefs } from './appleHealthPrefs';

let lastNotifyAt = 0;
const DEDUP_MS = 5000;

/**
 * System notification after the background sync imported Apple Health workouts.
 * Silent on web, and skipped when "Notifications for new workouts" is off in
 * Settings → Integrations → Apple Health.
 *
 * @param {number} importedCount
 */
export async function maybeNotifyAppleHealthWorkoutsImported(importedCount) {
  if (!getAppleHealthPrefs().notifyImports) return;

  const n = Number(importedCount);
  if (!Number.isFinite(n) || n < 1) return;

  const now = Date.now();
  if (now - lastNotifyAt < DEDUP_MS) return;
  lastNotifyAt = now;

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    const id = Math.floor((now % 2147483000) + Math.random() * 1000);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: 'LaChart — Apple Health',
          body: n === 1
            ? '1 new workout imported from Apple Health.'
            : `${n} new workouts imported from Apple Health.`,
          schedule: { at: new Date(now + 800) },
          // No activity id to deep-link into — resolveNotificationTarget falls
          // back to the dashboard, where the new sessions show up.
          extra: { type: 'apple_health_import' },
        },
      ],
    });
  });
}
