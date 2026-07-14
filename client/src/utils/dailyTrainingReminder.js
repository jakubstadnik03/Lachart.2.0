import { withLocalNotificationsPermission } from './localNotificationsHelper';

const REMINDER_ID = 940001;

function tomorrowAt(hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function todayAt(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextFireAt(hour, minute = 0) {
  const t = todayAt(hour, minute);
  if (t.getTime() <= Date.now()) return tomorrowAt(hour, minute);
  return t;
}

function planDateStr(pw) {
  return String(pw?.date || '').slice(0, 10);
}

function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function cancelDailyTrainingReminder() {
  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    } catch (_) {}
  });
}

/**
 * Schedule 8:00 local reminder when user has a planned workout today (or tomorrow if past 8:00).
 */
export async function syncDailyTrainingReminder(plannedWorkouts = [], userNotifications) {
  if (userNotifications && userNotifications.dailyTrainingReminder === false) {
    await cancelDailyTrainingReminder();
    return;
  }

  const today = toLocalDateStr();
  const plannedToday = (plannedWorkouts || []).filter(
    (p) => planDateStr(p) === today && p.status !== 'skipped'
  );

  if (!plannedToday.length) {
    await cancelDailyTrainingReminder();
    return;
  }

  const title = plannedToday.length === 1 ? plannedToday[0].title : `${plannedToday.length} workouts`;
  const at = nextFireAt(8, 0);

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    } catch (_) {}

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: "Today's training",
          body: `On your plan: ${title}. Open LaChart.`,
          schedule: { at, allowWhileIdle: true },
          extra: { type: 'daily_training_reminder' },
        },
      ],
    });
  });
}
