/**
 * Daily coaching card push — the "proactive" half of the card.
 *
 * Scheduled locally rather than server-side on purpose: the body has to reflect
 * the athlete's *local* morning and the plan as it stands when they wake up, and
 * a local notification survives a server outage, a dead push token and a phone
 * that spent the night in airplane mode.
 *
 * The card content is built by the same buildDailyCard() the UI uses, so the
 * notification can never promise a different day than the app shows.
 */
import { withLocalNotificationsPermission } from './localNotificationsHelper';
import { buildDailyCard, dailyCardPushTitle } from './dailyCoachCard';

/** Distinct from REMINDER_ID in dailyTrainingReminder.js (940001). */
const DAILY_CARD_ID = 940101;

export async function cancelDailyCoachCardNotification() {
  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_CARD_ID }] });
    } catch { /* nothing scheduled */ }
  });
}

/**
 * (Re)schedule the daily card notification.
 *
 * Repeats every day at the chosen local time. The body is a snapshot of today's
 * card — one day stale by the time tomorrow fires, which is why the app also
 * reschedules on every dashboard load. Tomorrow's plan is the honest thing to
 * show for a notification that will land tomorrow morning anyway.
 */
export async function syncDailyCoachCardNotification({
  prefs,
  todayMetrics,
  plannedWorkouts = [],
  activities = [],
  userProfile = null,
  user = null,
} = {}) {
  if (!prefs?.enabled) {
    await cancelDailyCoachCardNotification();
    return;
  }

  // Build the card as it will read tomorrow morning, since that is when the
  // next fire lands. Same builder, shifted "now".
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(prefs.hour ?? 7, prefs.minute ?? 0, 0, 0);

  const card = buildDailyCard({
    todayMetrics,
    plannedWorkouts,
    activities,
    userProfile,
    user,
    styleId: prefs.style,
    now: tomorrow,
  });

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_CARD_ID }] });
    } catch { /* nothing scheduled */ }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_CARD_ID,
          title: dailyCardPushTitle(card),
          body: card.directive,
          schedule: {
            on: { hour: prefs.hour ?? 7, minute: prefs.minute ?? 0 },
            allowWhileIdle: true,
          },
          extra: { type: 'daily_coach_card' },
        },
      ],
    });
  });
}
