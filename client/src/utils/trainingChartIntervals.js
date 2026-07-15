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

function mergeResultMetadata(intervals, results) {
  if (!Array.isArray(results) || results.length === 0) return intervals;
  if (!Array.isArray(intervals) || intervals.length === 0) return results;
  if (results.length > intervals.length) return results;
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
export function getChartIntervals(training, stravaLapsCache = {}, sport = '') {
  if (!training) return [];

  const results = Array.isArray(training.results) ? training.results : [];
  const lapsNorm = normalizeLapsToResults(training.laps, sport);

  let fromCache = [];
  if (isStravaBackedTraining(training)) {
    const rawId = resolveStravaNumericId(training);
    const cached = rawId ? stravaLapsCache[rawId] : null;
    if (Array.isArray(cached) && cached.length > 0) {
      const stubLaps = Array.isArray(training.laps) ? training.laps : [];
      fromCache = mergeLapsPreserveLactate(cached, stubLaps);
    }
  }

  const fullest = [fromCache, lapsNorm, results].reduce(
    (best, cur) => (Array.isArray(cur) && cur.length > best.length ? cur : best),
    []
  );

  return mergeResultMetadata(fullest, results);
}

/** Fetch Strava detail laps when list payload is missing or incomplete. */
export function needsStravaLapFetch(training, stravaLapsCache = {}) {
  if (!isStravaBackedTraining(training)) return false;
  const rawId = resolveStravaNumericId(training);
  if (!rawId || rawId in stravaLapsCache) return false;

  const resultsLen = Array.isArray(training.results) ? training.results.length : 0;
  const lapsLen = Array.isArray(training.laps) ? training.laps.length : 0;

  if (hasDetailedLaps(training) && lapsLen > resultsLen) return false;
  if (hasDetailedLaps(training) && resultsLen > 0 && lapsLen <= resultsLen) return false;
  return true;
}
