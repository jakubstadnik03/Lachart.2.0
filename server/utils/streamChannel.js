/**
 * Read one channel out of a stored Strava stream, whichever shape it is in.
 *
 * StravaStream.streams is Mixed, and two shapes are in the database:
 *
 *   { heartrate: { data: [...], series_type, resolution } }   ← the sync path,
 *       which stores Strava's key_by_type response verbatim
 *   { heartrate: [...] }                                      ← streamBackfill,
 *       which unwraps to the bare series
 *
 * Both are legitimate and neither is worth a migration — activities are
 * immutable, so a rewrite would touch every stored stream to change nothing an
 * athlete can see. What is not acceptable is a reader that knows only one:
 *
 *   - activityWeather did `(streams.latlng || []).find(...)` and threw
 *     "find is not a function" on every wrapped stream, 500ing the weather
 *     endpoint for the activities most likely to have a location.
 *   - dailyZoneDistribution read `s.heartrate` and got an object, so a wrapped
 *     stream contributed no time at all. The day then fell back to the
 *     session-average estimate — which is exactly the "97% easy, 0% hard"
 *     reading the Balance chart exists to disprove.
 *
 * Neither failed loudly. One crashed a request nobody was watching and the
 * other quietly produced a plausible wrong answer, which is worse.
 *
 * integrationsRoutes has known about both shapes all along (its `hasArr`
 * checks `obj[key].data` then `obj[key]`); this is that knowledge, shared.
 */

'use strict';

/**
 * @param {object} streams  the stored `streams` object
 * @param {string} key      'heartrate' | 'watts' | 'velocity_smooth' | 'latlng' | 'time' | …
 * @returns {Array} the series, or [] — never null, never an object
 */
function channel(streams, key) {
  const raw = streams ? streams[key] : null;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

/** True when the channel carries at least one sample. */
function hasChannel(streams, key) {
  return channel(streams, key).length > 0;
}

module.exports = { channel, hasChannel };
