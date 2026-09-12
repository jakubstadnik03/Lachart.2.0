'use strict';

/**
 * The shapes behind GET /integrations/activities/similar — the sessions the
 * Compare tab lines up next to the one that is open.
 *
 * Each provider stores the same numbers under its own names. The Strava
 * document is camelCase at the top level (elapsedTime, averageHeartRate,
 * averagePower); its snake_case twins live only inside `raw`. The query used
 * to select the snake_case names, so every Strava result came back with a
 * duration, heart rate and power of zero — the compared cards showed only a
 * distance, the structure search could never match a Strava ride on length,
 * and opening a compared session showed dashes where its numbers should be.
 *
 * One place for the field names, so the query, the filter and the result
 * agree.
 */

/** What each collection is asked for. */
const SIMILAR_SELECT = {
  strava: 'stravaId titleManual name category lactate sport startDate distance elapsedTime movingTime averageHeartRate averagePower weightedAveragePower averageSpeed total_elevation_gain laps',
  garmin: 'garminId titleManual name category lactate sport startDate distance elapsedTime movingTime averageHeartRate averagePower averageSpeed laps',
  fit: '_id titleManual titleAuto category lactate sport timestamp totalDistance totalElapsedTime totalTimerTime avgHeartRate avgPower avgSpeed laps',
  regular: '_id title category sport date duration movingTime results',
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** "H:MM:SS" / "MM:SS" / seconds → seconds. Training stores duration as text. */
function durationSeconds(raw) {
  if (typeof raw === 'number') return num(raw);
  if (typeof raw !== 'string') return 0;
  if (!raw.includes(':')) return num(raw);
  const parts = raw.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Sessions of about the same length and distance as the open one. Which
 * fields carry those depends on the collection; a provider that stores both
 * a moving and an elapsed clock matches on either.
 */
function buildStructureFilter(base, duration, distance, lapCount, source) {
  const f = { ...base };
  const dur = parseFloat(duration);
  const dist = parseFloat(distance);
  const laps = parseInt(lapCount, 10);

  if (dur > 0) {
    const range = { $gte: dur * 0.72, $lte: dur * 1.28 };
    if (source === 'strava' || source === 'garmin') f.$or = [{ movingTime: range }, { elapsedTime: range }];
    else if (source === 'fit') f.totalElapsedTime = range;
  }
  if (dist > 0) {
    const range = { $gte: dist * 0.78, $lte: dist * 1.22 };
    if (source === 'strava' || source === 'garmin') f.distance = range;
    else if (source === 'fit') f.totalDistance = range;
  }
  if (laps > 2) {
    f['laps.0'] = { $exists: true };
  }
  return f;
}

/** Keep the open session out of its own comparison. */
function applySimilarExcludeId(filter, excludeId, source) {
  if (!excludeId) return;
  const id = String(excludeId);
  if (source === 'strava') {
    const numId = parseInt(id.replace(/^strava-/i, ''), 10);
    if (/^(strava-)?\d+$/i.test(id) && !isNaN(numId)) filter.stravaId = { $ne: numId };
  } else if (source === 'garmin' && /^garmin-/i.test(id)) {
    filter.garminId = { $ne: id.replace(/^garmin-/i, '') };
  } else if (source === 'fit' && id.startsWith('fit-')) {
    filter._id = { $ne: id.replace(/^fit-/, '') };
  } else if (source === 'regular' && id.startsWith('regular-')) {
    filter._id = { $ne: id.replace(/^regular-/, '') };
  }
}

/** One shape for the client, whichever collection the session came from. */
function normalizeSimilarActivity(a, source) {
  if (source === 'strava') {
    return {
      id: `strava-${a.stravaId}`,
      type: 'strava',
      source: 'strava',
      date: a.startDate,
      title: a.titleManual || a.name || 'Activity',
      category: a.category || null,
      lactate: a.lactate != null ? Number(a.lactate) : null,
      sport: a.sport || null,
      distance: num(a.distance),
      // Moving time first: it is what the open session's duration means too.
      duration: num(a.movingTime) || num(a.elapsedTime),
      elapsedTime: num(a.elapsedTime),
      avgHr: num(a.averageHeartRate),
      avgPower: num(a.averagePower),
      normalizedPower: num(a.weightedAveragePower),
      avgSpeed: num(a.averageSpeed),
      elevation: num(a.total_elevation_gain),
      laps: Array.isArray(a.laps) ? a.laps : [],
    };
  }
  if (source === 'garmin') {
    return {
      id: `garmin-${a.garminId}`,
      type: 'garmin',
      source: 'garmin',
      date: a.startDate,
      title: a.titleManual || a.name || 'Activity',
      category: a.category || null,
      lactate: a.lactate != null ? Number(a.lactate) : null,
      sport: a.sport || null,
      distance: num(a.distance),
      duration: num(a.movingTime) || num(a.elapsedTime),
      elapsedTime: num(a.elapsedTime),
      avgHr: num(a.averageHeartRate),
      avgPower: num(a.averagePower),
      normalizedPower: 0,
      avgSpeed: num(a.averageSpeed),
      elevation: 0,
      laps: Array.isArray(a.laps) ? a.laps : [],
    };
  }
  if (source === 'fit') {
    return {
      id: `fit-${a._id}`,
      type: 'fit',
      source: 'fit',
      date: a.timestamp,
      title: a.titleManual || a.titleAuto || 'FIT Activity',
      category: a.category || null,
      lactate: a.lactate != null ? Number(a.lactate) : null,
      sport: a.sport || null,
      distance: num(a.totalDistance),
      duration: num(a.totalTimerTime) || num(a.totalElapsedTime),
      elapsedTime: num(a.totalElapsedTime),
      avgHr: num(a.avgHeartRate),
      avgPower: num(a.avgPower),
      normalizedPower: 0,
      avgSpeed: num(a.avgSpeed),
      elevation: 0,
      laps: Array.isArray(a.laps) ? a.laps : [],
    };
  }
  return {
    id: `regular-${a._id}`,
    type: 'regular',
    source: 'regular',
    date: a.date,
    title: a.title || 'Training',
    category: a.category || null,
    lactate: null,
    sport: a.sport || null,
    distance: 0,
    duration: num(a.movingTime) || durationSeconds(a.duration),
    elapsedTime: 0,
    avgHr: 0,
    avgPower: 0,
    normalizedPower: 0,
    avgSpeed: 0,
    elevation: 0,
    laps: [],
  };
}

module.exports = {
  SIMILAR_SELECT,
  durationSeconds,
  buildStructureFilter,
  applySimilarExcludeId,
  normalizeSimilarActivity,
};
