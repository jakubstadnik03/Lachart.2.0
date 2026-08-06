/**
 * healthBaselineService.js - what "normal" looked like before an episode.
 *
 * Captured once, when the episode is created, and then frozen. Everything the
 * return protocol says is a percentage of these numbers ("40% of pre-injury
 * running volume"), so they must not drift as the athlete's rolling averages
 * collapse during the layoff - which is exactly what would happen if we
 * recomputed them live.
 *
 * Sources are the same five the calendar and CTL use, deduped the same way, so
 * the baseline agrees with the numbers shown everywhere else in the app.
 */

'use strict';

const mongoose = require('mongoose');
const User = require('../models/UserModel');
const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');
const GarminActivity = require('../models/GarminActivity');
const AppleHealthActivity = require('../models/AppleHealthActivity');
const {
  buildUserProfile,
  resolveActivityTss,
  dedupeActivitiesForLoad,
  normalizeSportBucket,
} = require('../utils/activityTss');
const { calculateFormFitnessData } = require('../controllers/fitnessMetricsController');

/** Weeks of history behind a baseline. Long enough to smooth a taper week. */
const BASELINE_WEEKS = 8;

function objectIdOrNull(id) {
  return mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null;
}

async function findByUserIdBothFormats(Model, idStr, idObj, filter, select, sortField) {
  let rows = await Model.find({ userId: idStr, ...filter }).select(select).sort({ [sortField]: 1 }).lean();
  if (!rows.length && idObj) {
    rows = await Model.find({ userId: idObj, ...filter }).select(select).sort({ [sortField]: 1 }).lean();
  }
  return rows;
}

function speedOf(activity) {
  const stored = Number(activity.averageSpeed || activity.avgSpeed || 0);
  if (stored > 0) return stored;
  const dist = Number(activity.distance || 0);
  const dur = Number(activity.movingTime || activity.totalElapsedTime || activity.elapsedTime || 0);
  return dist > 0 && dur > 0 ? dist / dur : 0;
}

/**
 * Sport the caps and the baseline are expressed in: running for anything below
 * the waist, swimming for a shoulder. Lives here rather than in the route
 * because the progress series has to bucket activities the same way the gate
 * does; two copies of this rule would let the two views disagree.
 */
function primarySportFor(entry) {
  if (!entry) return 'run';
  if ((entry.sports || []).includes('run')) return 'run';
  if ((entry.sports || []).includes('swim')) return 'swim';
  if ((entry.sports || []).includes('bike')) return 'bike';
  return 'run';
}

/**
 * Collect activities in [from, to) from every source, normalised to one shape.
 * Device max speed is deliberately ignored: a single GPS spike would inflate
 * the reference that muscle-strain speed caps are a percentage of. The fastest
 * *average* speed of any single session is a stable proxy for best sustained
 * effort, and erring low here errs safe.
 */
async function collectActivities(athleteId, from, to, profile) {
  const idStr = String(athleteId);
  const idObj = objectIdOrNull(athleteId);
  const range = { $gte: from, $lt: to };

  const [fit, strava, garmin, apple] = await Promise.all([
    FitTraining.find({ athleteId: idStr, timestamp: range })
      .select('timestamp sport distance totalElapsedTime avgSpeed avgPower normalizedPower avgHeartRate maxHeartRate trainingStressScore manualTss tssDisplayMode')
      .lean(),
    findByUserIdBothFormats(
      StravaActivity, idStr, idObj, { startDate: range },
      'startDate sport distance movingTime elapsedTime averageSpeed averagePower weighted_average_watts average_heartrate max_heartrate manualTss tssDisplayMode',
      'startDate',
    ),
    findByUserIdBothFormats(
      GarminActivity, idStr, idObj, { startDate: range },
      'startDate sport distance movingTime elapsedTime averageSpeed averagePower averageHeartRate manualTss tssDisplayMode',
      'startDate',
    ),
    findByUserIdBothFormats(
      AppleHealthActivity, idStr, idObj, { startDate: range },
      'startDate sport type distanceMeters durationSeconds avgHeartRate',
      'startDate',
    ),
  ]);

  const rows = [
    ...fit.map((t) => ({
      date: t.timestamp,
      sport: t.sport,
      distance: Number(t.distance) || 0,
      movingTime: Number(t.totalElapsedTime) || 0,
      averageSpeed: Number(t.avgSpeed) || 0,
      tss: resolveActivityTss({
        sport: t.sport,
        movingTime: t.totalElapsedTime,
        totalElapsedTime: t.totalElapsedTime,
        distance: t.distance,
        avgPower: t.avgPower,
        normalizedPower: t.normalizedPower,
        avgHeartRate: t.avgHeartRate,
        averageHeartRate: t.avgHeartRate,
        maxHeartRate: t.maxHeartRate,
        avgSpeed: t.avgSpeed,
        tss: t.trainingStressScore,
        trainingStressScore: t.trainingStressScore,
        manualTss: t.manualTss,
        tssDisplayMode: t.tssDisplayMode,
      }, profile),
    })),
    ...strava.map((a) => ({
      date: a.startDate,
      sport: a.sport,
      distance: Number(a.distance) || 0,
      movingTime: Number(a.movingTime || a.elapsedTime) || 0,
      averageSpeed: Number(a.averageSpeed) || 0,
      tss: resolveActivityTss({
        sport: a.sport,
        movingTime: a.movingTime,
        elapsedTime: a.elapsedTime,
        distance: a.distance,
        averagePower: a.averagePower,
        weighted_average_watts: a.weighted_average_watts,
        averageSpeed: a.averageSpeed,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        manualTss: a.manualTss,
        tssDisplayMode: a.tssDisplayMode,
      }, profile),
    })),
    ...garmin.map((a) => ({
      date: a.startDate,
      sport: a.sport,
      distance: Number(a.distance) || 0,
      movingTime: Number(a.movingTime || a.elapsedTime) || 0,
      averageSpeed: Number(a.averageSpeed) || 0,
      tss: resolveActivityTss({
        sport: a.sport,
        movingTime: a.movingTime,
        elapsedTime: a.elapsedTime,
        distance: a.distance,
        averageSpeed: a.averageSpeed,
        averagePower: a.averagePower,
        average_heartrate: a.averageHeartRate,
        avgHeartRate: a.averageHeartRate,
        manualTss: a.manualTss,
        tssDisplayMode: a.tssDisplayMode,
      }, profile),
    })),
    ...apple.map((a) => ({
      date: a.startDate,
      sport: a.sport || a.type,
      distance: Number(a.distanceMeters) || 0,
      movingTime: Number(a.durationSeconds) || 0,
      averageSpeed: 0,
      tss: resolveActivityTss({
        sport: a.sport || a.type,
        movingTime: a.durationSeconds,
        distance: a.distanceMeters,
        avgHeartRate: a.avgHeartRate,
        average_heartrate: a.avgHeartRate,
      }, profile),
    })),
  ].filter((a) => a.date);

  return dedupeActivitiesForLoad(rows);
}

/**
 * Weekly means per sport bucket over the window, plus the fastest single
 * session. Returns metres, seconds and m/s - the client formats.
 */
function aggregate(activities, weeks) {
  const totals = {};
  const peak = {};

  for (const a of activities) {
    const sport = normalizeSportBucket(a.sport);
    if (!totals[sport]) totals[sport] = { tss: 0, distance: 0, duration: 0, sessions: 0 };
    totals[sport].tss += Number(a.tss) || 0;
    totals[sport].distance += Number(a.distance) || 0;
    totals[sport].duration += Number(a.movingTime) || 0;
    totals[sport].sessions += 1;

    const speed = speedOf(a);
    // Ignore very short efforts - a 4-minute activity is usually a bad upload,
    // and it should not become the reference a speed cap is derived from.
    if (speed > 0 && (Number(a.movingTime) || 0) >= 300) {
      peak[sport] = Math.max(peak[sport] || 0, speed);
    }
  }

  const weeklyTssBySport = {};
  const weeklyDistanceBySport = {};
  const weeklyDurationBySport = {};
  const weeklySessionsBySport = {};
  for (const [sport, t] of Object.entries(totals)) {
    weeklyTssBySport[sport] = Math.round(t.tss / weeks);
    weeklyDistanceBySport[sport] = Math.round(t.distance / weeks);
    weeklyDurationBySport[sport] = Math.round(t.duration / weeks);
    weeklySessionsBySport[sport] = Math.round((t.sessions / weeks) * 10) / 10;
  }

  const peakSpeedBySport = {};
  for (const [sport, v] of Object.entries(peak)) {
    peakSpeedBySport[sport] = Math.round(v * 1000) / 1000;
  }

  return {
    weeklyTssBySport,
    weeklyDistanceBySport,
    weeklyDurationBySport,
    weeklySessionsBySport,
    peakSpeedBySport,
  };
}

/**
 * Build the frozen baseline for an episode starting on `startDate`.
 * Never throws - a baseline we could not compute is better stored as nulls than
 * blocking episode creation, and the UI degrades to "no baseline yet".
 */
async function captureBaseline(athleteId, startDate) {
  const onset = new Date(`${String(startDate).slice(0, 10)}T00:00:00.000Z`);
  const from = new Date(onset.getTime() - BASELINE_WEEKS * 7 * 86400000);

  const empty = {
    ctl: null,
    atl: null,
    form: null,
    weeklyTssBySport: null,
    weeklyDistanceBySport: null,
    weeklyDurationBySport: null,
    peakSpeedBySport: null,
    lt1: null,
    lt2: null,
    ftp: null,
    capturedAt: new Date(),
  };

  let user = null;
  try {
    user = await User.findById(athleteId).lean();
  } catch {
    user = null;
  }
  if (!user) return empty;

  const profile = buildUserProfile(user);

  let activities = [];
  try {
    activities = await collectActivities(athleteId, from, onset, profile);
  } catch (e) {
    console.error('[HealthBaseline] activity collection failed:', e.message);
  }
  const agg = aggregate(activities, BASELINE_WEEKS);

  let ctl = null;
  let atl = null;
  let form = null;
  try {
    const series = await calculateFormFitnessData(athleteId, 7);
    const latest = Array.isArray(series) && series.length ? series[series.length - 1] : null;
    if (latest) {
      ctl = latest.Fitness != null ? Math.round(Number(latest.Fitness)) : null;
      atl = latest.Fatigue != null ? Math.round(Number(latest.Fatigue)) : null;
      form = latest.Form != null ? Math.round(Number(latest.Form)) : null;
    }
  } catch (e) {
    console.error('[HealthBaseline] form/fitness failed:', e.message);
  }

  return {
    ...empty,
    ...agg,
    ctl,
    atl,
    form,
    lt1: Number(profile?.powerZones?.running?.lt1) || Number(profile?.lt1) || null,
    lt2: Number(profile?.powerZones?.running?.lt2) || Number(profile?.lt2) || null,
    ftp: Number(profile?.powerZones?.cycling?.ftp) || Number(profile?.ftp) || null,
    capturedAt: new Date(),
  };
}

/**
 * Where the athlete actually is right now, against the frozen baseline -
 * the input to the "you are at 38% of pre-injury volume" readout and to the
 * over-the-ceiling caution.
 */
async function currentWeekLoad(athleteId, sport = 'run') {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);

  let user = null;
  try {
    user = await User.findById(athleteId).lean();
  } catch {
    user = null;
  }
  const profile = buildUserProfile(user || {});

  let activities = [];
  try {
    activities = await collectActivities(athleteId, weekStart, now, profile);
  } catch (e) {
    console.error('[HealthBaseline] current week failed:', e.message);
    return null;
  }

  const bucket = normalizeSportBucket(sport);
  const mine = activities.filter((a) => normalizeSportBucket(a.sport) === bucket);
  return {
    sport: bucket,
    distanceM: Math.round(mine.reduce((s, a) => s + (Number(a.distance) || 0), 0)),
    durationS: Math.round(mine.reduce((s, a) => s + (Number(a.movingTime) || 0), 0)),
    tss: Math.round(mine.reduce((s, a) => s + (Number(a.tss) || 0), 0)),
    sessions: mine.length,
    fastestSpeedMps: mine.reduce((m, a) => Math.max(m, speedOf(a)), 0) || null,
  };
}

/**
 * Compare the last 7 days against the current stage ceiling. Produces the
 * `loadSummary` healthGate.cautions consumes.
 */
function buildLoadSummary(caps, actual) {
  if (!caps || !actual) return null;
  const capM = caps.weeklyDistanceCapM;
  const capS = caps.weeklyDurationCapS;

  // Prefer distance where we have it - runners think in kilometres.
  let overCapPct = 0;
  let capLabel = null;
  let actualLabel = null;
  if (capM != null && capM > 0) {
    overCapPct = ((actual.distanceM - capM) / capM) * 100;
    capLabel = `${(capM / 1000).toFixed(1)} km`;
    actualLabel = `${(actual.distanceM / 1000).toFixed(1)} km`;
  } else if (capS != null && capS > 0) {
    overCapPct = ((actual.durationS - capS) / capS) * 100;
    capLabel = `${Math.round(capS / 60)} min`;
    actualLabel = `${Math.round(actual.durationS / 60)} min`;
  } else {
    return null;
  }

  return {
    overCapPct: Math.max(0, Math.round(overCapPct)),
    capLabel,
    actualLabel,
    sessionsOverCap: caps.maxSessionsPerWeek != null
      ? Math.max(0, actual.sessions - caps.maxSessionsPerWeek)
      : 0,
    /** Set when a session went faster than the stage's speed ceiling - the
        muscle-strain gate that verifies itself from activity data. */
    speedBreach: caps.speedCapMps != null && actual.fastestSpeedMps != null
      && actual.fastestSpeedMps > caps.speedCapMps
      ? {
        capMps: caps.speedCapMps,
        actualMps: Math.round(actual.fastestSpeedMps * 1000) / 1000,
        capPct: caps.speedCapPct,
      }
      : null,
  };
}

module.exports = {
  captureBaseline,
  currentWeekLoad,
  buildLoadSummary,
  collectActivities,
  primarySportFor,
  speedOf,
  BASELINE_WEEKS,
};
