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

export default resolveRadarSport;
