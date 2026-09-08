/**
 * Normalise a client-supplied "Smart detect" laps payload into the stored
 * shape. Returns a clean array (empty array clears any saved laps). Non-array
 * input or garbage entries are dropped so a bad request can't poison the doc.
 */
const MAX_LAPS = 500;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lactateOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeSavedAutoLaps(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((l) => l && typeof l === 'object')
    .slice(0, MAX_LAPS)
    .map((l, i) => ({
      lapNumber: Number.isFinite(Number(l.lapNumber)) ? Number(l.lapNumber) : i + 1,
      elapsed_time: num(l.elapsed_time),
      moving_time: num(l.moving_time ?? l.elapsed_time),
      distance: num(l.distance),
      average_watts: num(l.average_watts),
      average_heartrate: num(l.average_heartrate),
      average_speed: num(l.average_speed),
      // Null rather than 0, and deliberately not num(): a lap nobody pricked
      // has no reading, while 0 mmol is one. num(undefined) is 0, which would
      // have written a measurement onto every unmeasured lap in the set.
      lactate: lactateOrNull(l.lactate),
    }));
}

module.exports = { sanitizeSavedAutoLaps };
