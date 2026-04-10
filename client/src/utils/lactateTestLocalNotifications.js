import { withLocalNotificationsPermission } from './localNotificationsHelper';

/** Stable IDs so we can replace / cancel scheduled lactate reminders. */
const ID_SAVED = 920001;
const ID_FOLLOWUP = 920002;

/** Delay before follow-up local notification (default: 24 h). */
const FOLLOWUP_DELAY_MS = Number(process.env.REACT_APP_LACTATE_FOLLOWUP_MS) || 24 * 60 * 60 * 1000;

/**
 * After a lactate test is saved: short confirmation + one delayed reminder (Capacitor only).
 */
export async function cancelScheduledLactateTestNotifications() {
  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: ID_SAVED }, { id: ID_FOLLOWUP }],
      });
    } catch (_) {}
  });
}

export async function scheduleLactateTestLocalNotifications(userNotifications) {
  if (userNotifications && userNotifications.pushLactateTest === false) return;

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: ID_SAVED }, { id: ID_FOLLOWUP }],
      });
    } catch (_) {
      // ignore if nothing to cancel
    }

    const now = Date.now();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_SAVED,
          title: 'LaChart',
          body: 'Lactate test saved. Open the app to review zones and curves.',
          schedule: { at: new Date(now + 2000) },
        },
        {
          id: ID_FOLLOWUP,
          title: 'LaChart',
          body: 'Revisit your lactate test — check zones or plan your next session.',
          schedule: { at: new Date(now + FOLLOWUP_DELAY_MS) },
        },
      ],
    });
  });
}
