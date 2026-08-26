/**
 * Which sport the power/pace radar is showing.
 *
 * The chart has axes for two sports only — watts at 5s…60min for the bike,
 * pace at 400m…half for the run. Swimming has neither, and "all" is not a
 * sport you can plot, so a page that filters by sport has to be able to say
 * "not this one" rather than silently showing the bike radar next to a list of
 * swims.
 */

/** Sports the radar has axes for. */
export const RADAR_SPORTS = ['bike', 'run'];

export function hasRadar(sport) {
  return RADAR_SPORTS.includes(String(sport || '').toLowerCase());
}

/**
 * Resolve which radar to draw.
 *
 * @param {string} [controlled] the sport a host page is filtering by, if any
 * @param {string} [stored] the chart's own last choice (localStorage)
 * @returns {'bike'|'run'} never null — the chart always draws something once
 *   the caller has decided it should be on screen at all
 */
export function resolveRadarSport(controlled, stored) {
  const c = String(controlled || '').toLowerCase();
  if (hasRadar(c)) return c;
  const s = String(stored || '').toLowerCase();
  if (hasRadar(s)) return s;
  return 'bike';
}


/**
 * Which radar to show when the page is not filtering by one sport.
 *
 * "All" still deserves a radar — it is the page's default, and hiding the
 * chart there means most athletes never see it. Picking the sport they train
 * most in the list on screen beats a stored preference nobody set.
 *
 * @param {Array<{sport?: string}>} trainings the sessions currently listed
 * @param {string} [fallback] used when the list has neither bike nor run
 * @returns {'bike'|'run'}
 */
export function dominantRadarSport(trainings, fallback) {
  const counts = { bike: 0, run: 0 };
  for (const t of Array.isArray(trainings) ? trainings : []) {
    const s = String(t?.sport || '').toLowerCase();
    if (s in counts) counts[s] += 1;
  }
  if (counts.bike === 0 && counts.run === 0) return resolveRadarSport(fallback, fallback);
  // Ties go to the bike: it is the sport the power radar was built for.
  return counts.run > counts.bike ? 'run' : 'bike';
}

export default resolveRadarSport;
