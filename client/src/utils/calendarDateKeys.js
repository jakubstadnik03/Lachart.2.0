/**
 * Local calendar-day keys — the one place that decides which day an activity
 * belongs to.
 *
 * Split out of formFitnessFromActivities.js so that callers who only need a
 * date key don't drag in the PMC maths and, through the sport filter, a React
 * icon component. The daily coaching card and the notification scheduler both
 * run outside the render tree, and importing JSX there would pull React into
 * paths that have no business rendering anything.
 */

/** YYYY-MM-DD in local time — never UTC, or activities near midnight jump days. */
export function localCalendarDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar day for an activity — same field order everywhere (dashboard, calendar, period stats, native app). */
export function activityCalendarDateKey(act) {
  const raw = act?.date ?? act?.timestamp ?? act?.startDate ?? act?.start_time;
  if (raw == null) return null;
  return localCalendarDateKey(raw);
}

/** True when the activity falls on the given local calendar day. */
export function activityOnLocalDay(act, date) {
  const dk = activityCalendarDateKey(act);
  if (!dk) return false;
  return dk === localCalendarDateKey(date);
}

/** Monday of the activity's local calendar week (YYYY-MM-DD). */
export function localWeekStartKey(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return localCalendarDateKey(d);
}
