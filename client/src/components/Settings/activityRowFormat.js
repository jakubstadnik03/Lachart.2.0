/**
 * Row formatting shared by the Apple Health / Strava / Garmin activity lists in
 * Settings, so the same session reads identically whichever source it came from.
 */

/** "Today 07:12" / "Yesterday 18:42" / "9 Aug 17:59" (year only when it isn't this one). */
export function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - day) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${date} ${time}`;
}

/** @returns {string | null} null when there is nothing worth showing */
export function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Indoor sessions report a few stray metres — below 100 m it is noise, not a distance. */
export function fmtDistance(meters) {
  const m = Number(meters) || 0;
  if (m < 100) return null;
  return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
}
