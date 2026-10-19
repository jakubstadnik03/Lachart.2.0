/**
 * Which workout lists a widget write should actually send.
 *
 * Two writers push to the App Group cache. The dashboard sends the full
 * payload including today's workouts, but only while the Home tab is mounted.
 * syncWidgetFromApi is the cheap insurance writer that runs on launch and
 * after every Strava sync, from the always-mounted shell, and it does not
 * fetch the calendar — so it used to send `todayPlanned: []`.
 *
 * The native side overwrites the whole blob, so that empty array was not
 * "nothing new to say", it was "there is nothing planned today". Finish a ride,
 * let the background sync land while you are on any tab other than Home, and
 * the widget lost its workouts until you opened Home again.
 *
 * An omitted list now means "I did not look", and the last list that was
 * looked up is sent again. An explicitly empty array still means empty.
 *
 * The remembered lists are stamped with the day they describe, because
 * "today's planned workouts" stops being true at midnight, and a phone that
 * sat in a pocket overnight would otherwise re-send yesterday's plan.
 */

const KEYS = ['todayCompleted', 'todayPlanned', 'tomorrowPlanned'];

/** Local calendar day, not UTC — the lists are built from the user's own day. */
export function dayStamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {object|null} remembered  the previous return value's `remembered`
 * @param {object} incoming         the metrics object a caller passed
 * @param {Date} [now]
 * @returns {{lists: object, remembered: object}}
 */
export function resolveWidgetWorkoutLists(remembered, incoming, now = new Date()) {
  const today = dayStamp(now);
  const carried = remembered && remembered.day === today ? remembered : null;

  const lists = {};
  const nextRemembered = { day: today };

  KEYS.forEach((key) => {
    const given = incoming ? incoming[key] : undefined;
    if (Array.isArray(given)) {
      lists[key] = given;
      nextRemembered[key] = given;
      return;
    }
    // Not looked up by this caller — say again whatever was last looked up
    // today, and nothing at all if that was never or was yesterday.
    const previous = carried && Array.isArray(carried[key]) ? carried[key] : [];
    lists[key] = previous;
    nextRemembered[key] = previous;
  });

  return { lists, remembered: nextRemembered };
}
