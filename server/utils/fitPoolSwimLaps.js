'use strict';

/**
 * Per-lap distances for a pool swim, read from its FIT file.
 *
 * Garmin's Health API does not carry them. Its activity details are samples,
 * and a pool swim has no GPS to sample: one measured swim of 2700 m arrived as
 * 2569 samples holding exactly one distance value, a zero at the start. Every
 * lap therefore came back empty, and so did every pace beside it.
 *
 * The FIT file the watch wrote does have them, because a pool counts lengths
 * rather than metres. Three answers live in it, and they are tried in the order
 * of how directly they were measured:
 *
 *   1. The lap's own `totalDistance`, which is what the device concluded.
 *   2. Its `numActiveLengths` × the pool, when the lap counts its lengths but
 *      records no distance.
 *   3. The lengths whose start falls inside the lap, counted and multiplied.
 *
 * A lap that is a rest gets zero rather than null: no lengths swum is a fact
 * about the lap, not a gap in what we know.
 */

/** First present numeric field, in either spelling the two parsers produce. */
function num(obj, ...names) {
  for (const n of names) {
    const v = obj?.[n];
    if (v == null) continue;
    const x = Number(v);
    if (Number.isFinite(x)) return x;
  }
  return null;
}

/** FIT timestamps arrive as Date, epoch seconds, or ms depending on the parser. */
function toSeconds(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime() / 1000;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Anything past the year 5138 in seconds is milliseconds.
  return n > 1e11 ? n / 1000 : n;
}

/**
 * Did this length count as swimming?
 *
 * The enum decodes as the string 'active' from the Garmin SDK and as 1 from
 * the raw profile; an absent type means the file only recorded the ones that
 * counted, so it is active by default.
 */
function isActiveLength(len) {
  const t = len?.lengthType ?? len?.length_type;
  if (t == null) return true;
  if (typeof t === 'string') return t.toLowerCase() === 'active';
  return Number(t) === 1;
}

/**
 * The pool's length in metres.
 *
 * Stated by the session on any file worth reading. Derived from the totals
 * when it is not: a session of 2700 m over 108 active lengths is a 25 m pool,
 * and that arithmetic is exact rather than a guess.
 */
function resolvePoolLength(session, lengths) {
  const stated = num(session, 'poolLength', 'pool_length');
  if (stated > 0) return stated;

  const total = num(session, 'totalDistance', 'total_distance');
  const active = (lengths || []).filter(isActiveLength).length;
  if (total > 0 && active > 0) return total / active;
  return null;
}

/**
 * @param {object} fit decoded FIT messages, as either parser names them
 * @returns {Array<{lapNumber: number, distance: number|null, activeLengths: number|null}>}
 */
function poolSwimLapDistances(fit) {
  const session = (fit?.sessionMesgs || fit?.sessions || [])[0] || {};
  const laps = fit?.lapMesgs || fit?.laps || [];
  const lengths = fit?.lengthMesgs || fit?.lengths || [];
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const poolLength = resolvePoolLength(session, lengths);

  // Lengths in the order the file lists them, with the start time each one
  // needs for the fallback that has to match them to a lap by time.
  const ordered = (Array.isArray(lengths) ? lengths : []).map((l, i) => ({
    index: num(l, 'messageIndex', 'message_index') ?? i,
    start: toSeconds(l?.startTime ?? l?.start_time ?? l?.timestamp),
    active: isActiveLength(l),
  }));

  return laps.map((lap, i) => {
    const lapNumber = i + 1;

    const own = num(lap, 'totalDistance', 'total_distance');
    if (own > 0) {
      return {
        lapNumber,
        distance: Math.round(own),
        activeLengths: num(lap, 'numActiveLengths', 'num_active_lengths'),
      };
    }

    const counted = num(lap, 'numActiveLengths', 'num_active_lengths');
    if (counted != null && poolLength > 0) {
      return { lapNumber, distance: Math.round(counted * poolLength), activeLengths: counted };
    }

    // The lap names a run of lengths by index rather than counting the active
    // ones — count them here.
    const first = num(lap, 'firstLengthIndex', 'first_length_index');
    const span = num(lap, 'numLengths', 'num_lengths');
    if (first != null && span != null && poolLength > 0 && ordered.length) {
      const inRange = ordered.filter(l => l.index >= first && l.index < first + span);
      const active = inRange.filter(l => l.active).length;
      return { lapNumber, distance: Math.round(active * poolLength), activeLengths: active };
    }

    // Nothing on the lap says: fall back to the lengths that started inside it.
    const start = toSeconds(lap?.startTime ?? lap?.start_time);
    const dur = num(lap, 'totalElapsedTime', 'total_elapsed_time', 'totalTimerTime', 'total_timer_time');
    if (start != null && dur != null && poolLength > 0 && ordered.length) {
      const end = start + dur;
      const active = ordered.filter(l => l.start != null && l.start >= start && l.start < end && l.active).length;
      return { lapNumber, distance: Math.round(active * poolLength), activeLengths: active };
    }

    // A rest lap that counted no lengths is zero; a lap we cannot place at all
    // is unknown, and saying so is better than printing a number we invented.
    return { lapNumber, distance: counted === 0 ? 0 : null, activeLengths: counted };
  });
}

module.exports = { poolSwimLapDistances, resolvePoolLength, isActiveLength };
