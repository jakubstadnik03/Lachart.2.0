/** Resolve the fullest lap list for Training History / chart widgets. */

function lapHasMetrics(lap) {
  if (!lap || typeof lap !== 'object') return false;
  const dur = Number(lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? lap.duration ?? 0);
  const dist = Number(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
  const pow = Number(lap.average_watts ?? lap.avgPower ?? lap.average_power ?? 0);
  const hr = Number(lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0);
  const speed = Number(lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? 0);
  return dur > 0 || dist > 0 || pow > 0 || hr > 0 || speed > 0.05;
}

export function hasDetailedLaps(activity) {
  const laps = activity?.laps;
  if (!Array.isArray(laps) || laps.length <= 1) return false;
  const sample = laps.slice(0, Math.min(6, laps.length));
  return sample.some(lapHasMetrics);
}

export function resultsHaveContent(results) {
  if (!Array.isArray(results) || results.length === 0) return false;
  return results.some((r) => {
    if (!r) return false;
    if (Number(r.durationSeconds) > 0 || Number(r.distanceMeters) > 0) return true;
    const p = r.power;
    if (p != null && String(p).trim() !== '' && String(p) !== '0') return true;
    if (Number(r.lactate) > 0 || Number(r.mmol) > 0) return true;
    return false;
  });
}

export function resolveStravaNumericId(act) {
  if (!act) return '';
  if (act.sourceStravaActivityId) {
    return String(act.sourceStravaActivityId).replace(/^strava-/i, '');
  }
  if (act.source === 'strava' && act.sourceId) {
    return String(act.sourceId).replace(/^strava-/i, '');
  }
  return String(act.stravaId || act.id || act._id || '').replace(/^strava-/i, '');
}

export function isStravaBackedTraining(act) {
  if (!act) return false;
  if (act.sourceStravaActivityId) return true;
  return isStravaActivityShape(act);
}

export function isStravaActivityShape(act) {
  if (!act) return false;
  const idStr = String(act.id || act._id || '');
  return act.type === 'strava' ||
    act.source === 'strava' ||
    !!act.stravaId ||
    /^strava-/i.test(idStr) ||
    (act.source === 'strava' && !!act.sourceId);
}

/**
 * The Garmin half of the same pair.
 *
 * Garmin ships the same lactate-only lap stubs in the list payload that Strava
 * does, and the rides behind them have real laps. Only Strava had a detail
 * fetch to go and get them, so every Garmin session failed canChartTraining,
 * dropped out of the Training History pool, and could not be selected at all:
 * the picker read "No sessions in this category" over an athlete with a
 * season of Garmin runs, and clicking one in the Field Lactate panel beside it
 * did nothing, because there was nothing in the pool to point at.
 */
export function isGarminActivityShape(act) {
  if (!act) return false;
  const idStr = String(act.id || act._id || '');
  return act.type === 'garmin' ||
    act.source === 'garmin' ||
    !!act.garminId ||
    /^garmin-/i.test(idStr);
}

export function isGarminBackedTraining(act) {
  if (!act) return false;
  if (act.sourceGarminActivityId) return true;
  return isGarminActivityShape(act);
}

export function resolveGarminNumericId(act) {
  if (!act) return '';
  if (act.sourceGarminActivityId) {
    return String(act.sourceGarminActivityId).replace(/^garmin-/i, '');
  }
  if (act.source === 'garmin' && act.sourceId) {
    return String(act.sourceId).replace(/^garmin-/i, '');
  }
  return String(act.garminId || act.id || act._id || '').replace(/^garmin-/i, '');
}

export function mergeLapsPreserveLactate(freshLaps, stubLaps) {
  if (!Array.isArray(stubLaps) || stubLaps.length === 0) return freshLaps;
  const copyIntervalType = stubLaps.length === freshLaps.length;
  return freshLaps.map((lap, i) => {
    const stub = stubLaps[i];
    const lac = lap.lactate ?? stub?.lactate ?? stub?.lactateValue;
    const merged = lac != null && lap.lactate == null ? { ...lap, lactate: lac } : { ...lap };
    if (copyIntervalType && stub?.intervalType && !merged.intervalType) merged.intervalType = stub.intervalType;
    return merged;
  });
}

function mergeResultRow(lap, r, { copyIntervalType = true } = {}) {
  if (!r) return lap;
  const merged = { ...lap };
  if (copyIntervalType && r.intervalType) merged.intervalType = r.intervalType;
  if (r.lactate != null && merged.lactate == null) merged.lactate = r.lactate;
  if (r.mmol != null && merged.lactate == null) merged.lactate = r.mmol;
  if (r.isRecovery != null) merged.isRecovery = r.isRecovery;
  if (r.heartRate && !merged.heartRate) merged.heartRate = r.heartRate;
  if (r.power != null && r.power !== '' && (merged.power == null || merged.power === '')) {
    merged.power = r.power;
  }
  return merged;
}

/**
 * Which lap of the session a result row came from, or null when it cannot say.
 *
 * Only `sourceLapIndex`. `interval` looks like it would do the same job and
 * does not: it numbers the row's place among the *selected* results, so a row
 * can carry `interval: 11` and `sourceLapIndex: 14` at once. Reading `interval`
 * as a lap index is the very mistake this exists to undo.
 */
function resultSourceLap(r) {
  return Number.isInteger(r?.sourceLapIndex) ? r.sourceLapIndex : null;
}

/**
 * Result rows keyed by the lap they came from, or null when none of them says.
 *
 * Null is the caller's signal to fall back to merging by position — which is
 * right whenever the two lists are the same length, and the only option left
 * when the rows carry no lap index at all.
 */
export function resultsByLapIndex(results) {
  if (!Array.isArray(results)) return null;
  const located = results.filter(r => resultSourceLap(r) != null);
  if (!located.length) return null;
  return new Map(located.map(r => [resultSourceLap(r), r]));
}

/**
 * Put each result row's metadata on the lap it actually belongs to.
 *
 * A training's `results` are usually a subset of the session's laps — the
 * recoveries deselected, the warm-up dropped — so the row at position 10 is
 * not the eleventh lap. Merging by position put a blood reading drawn after
 * the eighth rep onto the fifth one, and the history chart said 374 W where
 * the athlete had ridden 370.
 *
 * Once any row says where it came from, the rest are not guessed at:
 * positioning the remainder by index is exactly the guess that misplaces them.
 * A set where no row knows keeps the old positional merge, which is right
 * whenever the two lists are the same length anyway.
 */
function mergeResultMetadata(intervals, results) {
  if (!Array.isArray(results) || results.length === 0) return intervals;
  if (!Array.isArray(intervals) || intervals.length === 0) return results;
  if (results.length > intervals.length) return results;

  const byLap = resultsByLapIndex(results);
  if (byLap) {
    return intervals.map((lap, i) => mergeResultRow(lap, byLap.get(i), { copyIntervalType: true }));
  }

  const copyIntervalType = results.length === intervals.length;
  return intervals.map((lap, i) => mergeResultRow(lap, results[i], { copyIntervalType }));
}

/** Normalize FIT / Strava `laps[]` into chart `results[]` rows (keeps every lap). */
export function normalizeLapsToResults(laps, sport) {
  if (!Array.isArray(laps) || laps.length === 0) return [];
  const s = String(sport || '').toLowerCase();
  const isRun = s.includes('run');
  const isSwim = s.includes('swim');

  return laps.map((lap, i) => {
    const fitHR = lap.avgHeartRate;
    const strHR = lap.average_heartrate;
    const fitPwr = lap.avgPower ?? lap.normalizedPower;
    const strPwr = lap.average_watts;
    const fitSpd = lap.avgSpeed;
    const strSpd = lap.average_speed;

    let power = lap.power ?? null;
    if (isRun || isSwim) {
      const speedMs = fitSpd ?? strSpd;
      if (speedMs && speedMs > 0) {
        power = isSwim ? Math.round(100 / speedMs) : Math.round(1000 / speedMs);
      }
    } else if (power == null) {
      power = fitPwr ?? strPwr ?? null;
    }

    const durationSec = lap.durationSeconds
      ?? lap.totalElapsedTime ?? lap.totalTimerTime
      ?? lap.elapsed_time ?? lap.moving_time ?? lap.duration ?? null;
    const distM = lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? null;

    return {
      interval: lap.interval ?? i + 1,
      power,
      heartRate: fitHR ?? strHR ?? lap.heartRate ?? null,
      lactate: lap.lactate ?? lap.lactateValue ?? null,
      duration: durationSec,
      durationSeconds: typeof durationSec === 'number' ? durationSec : undefined,
      durationType: lap.durationType || 'time',
      distance: distM,
      intervalType: lap.intervalType ?? null,
      isRecovery: lap.isRecovery,
      _fromLaps: true,
    };
  });
}

/**
 * Prefer every lap in the session (work + recovery + warm-up), not only
 * the shorter `results[]` subset that often stores work intervals only.
 */
export function getChartIntervals(training, stravaLapsCache = {}, sport = '', garminLapsCache = {}) {
  if (!training) return [];

  const results = Array.isArray(training.results) ? training.results : [];
  const lapsNorm = normalizeLapsToResults(training.laps, sport);

  // Strava first, then Garmin — a row is one or the other, and asking in this
  // order keeps a training that records both ids reading the copy it was
  // exported from.
  let fromCache = [];
  const cachedLaps = isStravaBackedTraining(training)
    ? stravaLapsCache[resolveStravaNumericId(training)]
    : isGarminBackedTraining(training)
      ? garminLapsCache[resolveGarminNumericId(training)]
      : null;
  if (Array.isArray(cachedLaps) && cachedLaps.length > 0) {
    const stubLaps = Array.isArray(training.laps) ? training.laps : [];
    fromCache = mergeLapsPreserveLactate(cachedLaps, stubLaps);
  }

  const fullest = [fromCache, lapsNorm, results].reduce(
    (best, cur) => (Array.isArray(cur) && cur.length > best.length ? cur : best),
    []
  );

  return mergeResultMetadata(fullest, results);
}

/**
 * Can this session actually draw bars — i.e. is it worth offering in a session
 * picker at all?
 *
 * Built on getChartIntervals so a picker and the chart it feeds can never
 * disagree about what has data. A Strava-linked session whose laps are still in
 * flight is an unknown rather than a no: keep it, and let it fall out once the
 * fetch lands empty and the cache says so.
 */
export function canChartTraining(training, stravaLapsCache = {}, sport = '', garminLapsCache = {}) {
  if (!training) return false;
  // A session whose laps are still in flight is an unknown, not a no — from
  // either service.
  if (needsStravaLapFetch(training, stravaLapsCache)) return true;
  if (needsGarminLapFetch(training, garminLapsCache)) return true;
  return resultsHaveContent(getChartIntervals(training, stravaLapsCache, sport, garminLapsCache));
}

/**
 * Is this row's lap detail worth fetching, or does it already hold enough?
 *
 * The two services answer identically because they ship identically: a list
 * payload of lactate-only stubs over a ride that has real laps behind it.
 */
function needsLapFetch(training, cache, rawId) {
  if (!rawId || rawId in cache) return false;

  const resultsLen = Array.isArray(training.results) ? training.results.length : 0;
  const lapsLen = Array.isArray(training.laps) ? training.laps.length : 0;

  if (hasDetailedLaps(training) && lapsLen > resultsLen) return false;
  if (hasDetailedLaps(training) && resultsLen > 0 && lapsLen <= resultsLen) return false;
  return true;
}

/** Fetch Strava detail laps when list payload is missing or incomplete. */
export function needsStravaLapFetch(training, stravaLapsCache = {}) {
  if (!isStravaBackedTraining(training)) return false;
  return needsLapFetch(training, stravaLapsCache, resolveStravaNumericId(training));
}

/** The same question for Garmin. */
export function needsGarminLapFetch(training, garminLapsCache = {}) {
  if (!training) return false;
  // Strava wins when a row answers to both, so the two fetches cannot both
  // claim the same session and race each other into the cache.
  if (isStravaBackedTraining(training)) return false;
  if (!isGarminBackedTraining(training)) return false;
  return needsLapFetch(training, garminLapsCache, resolveGarminNumericId(training));
}
