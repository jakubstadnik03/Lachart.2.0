import { withLocalNotificationsPermission } from './localNotificationsHelper';

const ID_MIN = 931000;
const ID_MAX = 939999;

function stableRaceNotifId(raceId, slot) {
  let h = 0;
  const s = `${raceId}:${slot}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return ID_MIN + (Math.abs(h) % (ID_MAX - ID_MIN - 10)) + slot;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysUntilLocal(dateStr) {
  const d = startOfLocalDay(new Date(dateStr));
  const today = startOfLocalDay(new Date());
  return Math.round((d - today) / 86400000);
}

function atLocalHour(dateStr, hour, minute = 0) {
  const d = startOfLocalDay(new Date(dateStr));
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Cancel all race-related local notification slots. */
export async function cancelRaceLocalNotifications() {
  await withLocalNotificationsPermission(async (LocalNotifications) => {
    try {
      const pending = await LocalNotifications.getPending();
      const toCancel = (pending?.notifications || []).filter((n) => n.id >= ID_MIN && n.id <= ID_MAX);
      if (toCancel.length) {
        await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) });
      }
    } catch (_) {}
  });
}

/**
 * Schedule day-before checklist (7:00) and race-day morning (6:00) for upcoming races.
 * @param {Array} races — from getRaceEvents
 * @param {object} [userNotifications]
 */
export async function syncRaceLocalNotifications(races, userNotifications) {
  if (userNotifications && userNotifications.pushRaceReminders === false) {
    await cancelRaceLocalNotifications();
    return;
  }

  const upcoming = (races || []).filter((r) => daysUntilLocal(r.date) >= 0 && daysUntilLocal(r.date) <= 21);
  if (!upcoming.length) {
    await cancelRaceLocalNotifications();
    return;
  }

  await withLocalNotificationsPermission(async (LocalNotifications) => {
    await cancelRaceLocalNotifications();

    const notifications = [];
    const now = Date.now();

    for (const race of upcoming) {
      const days = daysUntilLocal(race.date);
      const raceId = race._id || race.id;

      // Day before — checklist at 7:00 (only if race is tomorrow or further in future window)
      if (days >= 1 && days <= 14) {
        const eve = new Date(atLocalHour(race.date, 7, 0));
        eve.setDate(eve.getDate() - 1);
        if (eve.getTime() > now) {
          notifications.push({
            id: stableRaceNotifId(raceId, 1),
            title: 'Race tomorrow — checklist',
            body: `${race.name}: sleep, hydration, light shake-out, no extra TSS.`,
            schedule: { at: eve, allowWhileIdle: true },
            extra: { type: 'race_checklist', raceId: String(raceId) },
          });
        }
      }

      // Race morning 6:00
      if (days >= 0 && days <= 14) {
        const morning = atLocalHour(race.date, 6, 0);
        if (morning.getTime() > now) {
          notifications.push({
            id: stableRaceNotifId(raceId, 2),
            title: 'Race day — good luck!',
            body: `${race.name} — open today's plan in LaChart.`,
            schedule: { at: morning, allowWhileIdle: true },
            extra: { type: 'race_day', raceId: String(raceId) },
          });
        }
      }
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }
  });
}

export { daysUntilLocal, startOfLocalDay };
