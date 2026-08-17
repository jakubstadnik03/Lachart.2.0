/**
 * Cross-source dedup for the CLIENT-side calendar merge.
 *
 * The server dedupes Strava-vs-Garmin-vs-Apple inside /activities, but the
 * client then concatenates that feed with FIT uploads and manual Training
 * docs — so the same ride uploaded as a FIT file AND synced from Strava showed
 * twice, and got double-counted in every week total derived from this list.
 *
 * This used to be a second, independent implementation of "are these two
 * records one session", with its own tolerances. That is what made the
 * calendar and the dashboard disagree: the same seven days, the same
 * activities, two different answers for how many sessions the week held,
 * because two functions were deciding it. There is now one — the calendar's,
 * in calendarDayOrdering — and this is the name the dashboard, the training
 * load chart and the PMC import it by.
 */
import { dedupeCalendarActivities } from './calendarDayOrdering';

export function dedupeMergedCalendarActivities(list) {
  return dedupeCalendarActivities(Array.isArray(list) ? list : []);
}

export default dedupeMergedCalendarActivities;
