/**
 * The colour that identifies an activity on a calendar.
 *
 * The two calendars answered this differently. The dashboard's week strip
 * preferred the category colour and fell back to the sport; the calendar page
 * coloured by sport alone in most places and by category in one. So the same
 * ride — "Bike heat", a category the athlete made and coloured red — was red on
 * one screen and blue on the other, and a category could not be recognised at a
 * glance where it mattered most.
 *
 * The rule: a category is a deliberate statement about what a session was for,
 * so it wins. Sport is the fallback for anything untagged.
 *
 * Even the two places that already preferred the category disagreed on shade —
 * one used the flat colour, the other a 35%-alpha version — so the colour
 * itself is returned here and callers decide the opacity.
 */

/** Fallback when a session carries no category. */
export function sportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return '#f97316';
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  if (s.includes('elliptical') || s.includes('cross-trainer') || s.includes('crosstrainer')) return '#a855f7';
  return '#8b5cf6';
}

/**
 * @param {object} activity     anything with `category` and `sport`
 * @param {(id: string) => ({color?: string}|null)} [getCategory] from useCategories()
 * @returns {string} a hex colour
 */
export function activityAccentColor(activity, getCategory) {
  const fallback = sportColor(activity?.sport || activity?.type);
  if (!activity?.category || typeof getCategory !== 'function') return fallback;
  const cat = getCategory(activity.category);
  return cat?.color || fallback;
}
