/**
 * healthProgressService.js - the week-by-week return-to-training series.
 *
 * The daily gate answers "may I run today?". This answers the other question an
 * injured athlete actually asks, which is "am I getting anywhere?" - and it has
 * to answer it honestly, against two references at once:
 *
 *   1. the frozen pre-injury baseline (am I back to what I used to do?), and
 *   2. the ceiling the protocol allowed me AT THAT TIME (was I over it?).
 *
 * The second reference is the reason episode.stageHistory exists. The episode
 * only ever knew its current stage, so judging a week from six weeks ago
 * against today's cap would flatter the athlete exactly when it matters least.
 * The history log lets each week be scored against the stage that was actually
 * in force, and legacy episodes with no history fall back to attributing the
 * whole episode to their current stage rather than inventing one.
 *
 * The series starts 8 weeks BEFORE onset so the chart carries its own control
 * group: the same athlete, same sources, doing what they normally did.
 *
 * buildWeeklyProgress is pure - it takes activity rows and check-ins and does no
 * I/O, so scripts/checkHealthProgress.js can exercise every rule without Mongo.
 * weeklyProgress is the thin wrapper that fetches those two inputs.
 */

'use strict';

const HealthCheckIn = require('../models/HealthCheckIn');
const User = require('../models/UserModel');
const { buildUserProfile, normalizeSportBucket } = require('../utils/activityTss');
const {
  collectActivities, primarySportFor, speedOf, BASELINE_WEEKS,
} = require('./healthBaselineService');

const DAY_MS = 86400000;

/**
 * Sessions shorter than this do not contribute a speed reading. The baseline
 * peak speed was built with the same guard, so comparing a 4-minute bad upload
 * against it would flag a speed breach that never happened.
 */
const MIN_SPEED_SECONDS = 300;

/** Local calendar day for either a 'YYYY-MM-DD' string or a Date. */
function dateKeyOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(key, n) {
  const t = Date.parse(`${String(key).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromKey, toKey) {
  const a = Date.parse(`${String(fromKey).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toKey).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Monday of the week containing `key`. Weeks are Monday-based like the calendar. */
function mondayOf(key) {
  const t = Date.parse(`${String(key).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return new Date(t - ((dow + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function num(v) {
  return v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
}

function round3(v) {
  return v == null ? null : Math.round(v * 1000) / 1000;
}

/**
 * The stage log, oldest first, with a fallback for episodes created before
 * stageHistory existed: one open entry covering the whole episode at whatever
 * stage it is in now. That is a guess, but it is the only non-fabricated one -
 * it never claims a transition that we have no record of.
 */
function stageTimeline(episode) {
  const raw = Array.isArray(episode?.stageHistory) ? episode.stageHistory : [];
  const rows = raw
    .filter((h) => h && h.from)
    .map((h) => ({
      stageId: h.stageId || null,
      stageIndex: Number(h.stageIndex) || 0,
      from: dateKeyOf(h.from),
      to: h.to ? dateKeyOf(h.to) : null,
      legacy: false,
    }))
    .filter((h) => h.from)
    .sort((a, b) => (a.from < b.from ? -1 : 1));

  if (rows.length) return rows;

  const start = dateKeyOf(episode?.startDate);
  if (!start) return [];
  return [{
    stageId: episode?.currentStageId || null,
    stageIndex: Number(episode?.currentStageIndex) || 0,
    from: start,
    to: null,
    legacy: true,
  }];
}

function stageObject(entry, row) {
  const stages = entry?.stages || [];
  if (!row || !stages.length) return null;
  const byId = row.stageId ? stages.find((s) => s.id === row.stageId) : null;
  if (byId) return byId;
  const idx = Math.min(Math.max(row.stageIndex, 0), stages.length - 1);
  return stages[idx];
}

/**
 * Which stage governed a given week. A week can straddle a transition, so the
 * stage that covered the most days of it wins; ties go to the later stage,
 * which is the one the athlete finished the week under.
 *
 * Ranges are half-open: a row runs from `from` up to but not including `to`.
 */
function stageRowForWeek(timeline, weekStart, weekEnd) {
  const weekEndExclusive = addDays(weekEnd, 1);
  let best = null;
  let bestDays = 0;
  for (const row of timeline) {
    const lo = row.from > weekStart ? row.from : weekStart;
    const hi = row.to == null || row.to > weekEndExclusive ? weekEndExclusive : row.to;
    const days = daysBetween(lo, hi);
    if (days > 0 && days >= bestDays) {
      bestDays = days;
      best = row;
    }
  }
  return best;
}

/**
 * The stage's speed ceiling as a percentage of pre-injury peak speed.
 *
 * stageHistory records stages, not each rung of a speed ladder that was
 * cleared, so a stage that is already closed is judged against the rung it
 * started on. Only the open stage can use what the athlete has actually cleared.
 */
function speedCapPctFor(stage, episode, isOpenRow) {
  const explicit = num(stage?.speedCapPct);
  if (explicit != null) return explicit;
  const ladder = stage?.speedProgression;
  if (!Array.isArray(ladder) || !ladder.length) return null;
  if (!isOpenRow) return Number(ladder[0]);
  return Math.max(Number(episode?.speedPctReached) || 0, Number(ladder[0]));
}

/**
 * Build the series from already-fetched inputs.
 *
 * @param {object} episode     HealthEpisode (lean or plain object)
 * @param {object} entry       catalogue entry for episode.catalogId
 * @param {Array}  activities  rows shaped like collectActivities output
 * @param {Array}  checkIns    HealthCheckIn docs, any order
 * @param {string} [sport]     override the sport bucket
 * @param {string} [today]     'YYYY-MM-DD', for deterministic tests
 * @param {number} [weeks]     weeks of pre-injury context, default BASELINE_WEEKS
 */
function buildWeeklyProgress({
  episode, entry, activities = [], checkIns = [], sport, today, weeks,
} = {}) {
  const bucket = normalizeSportBucket(sport || primarySportFor(entry));
  const startDate = dateKeyOf(episode?.startDate);
  const todayKey = dateKeyOf(today) || new Date().toISOString().slice(0, 10);

  const preWeeks = Math.min(26, Math.max(0, weeks == null ? BASELINE_WEEKS : Number(weeks) || 0));

  const base = episode?.baseline || {};
  const baseline = {
    weeklyDistanceM: num(base.weeklyDistanceBySport?.[bucket]),
    weeklyDurationS: num(base.weeklyDurationBySport?.[bucket]),
    weeklyTss: num(base.weeklyTssBySport?.[bucket]),
    peakSpeedMps: num(base.peakSpeedBySport?.[bucket]),
  };

  const empty = { sport: bucket, baseline, weeks: [] };
  if (!startDate) return empty;

  const firstMonday = addDays(mondayOf(startDate), -7 * preWeeks);
  // The episode can outlive `today` only if the clock is wrong; guard anyway so
  // the loop always terminates.
  const lastMonday = mondayOf(todayKey > startDate ? todayKey : startDate);
  if (!firstMonday || !lastMonday) return empty;

  const timeline = stageTimeline(episode);
  const openRow = timeline.find((r) => r.to == null) || null;
  const hallmarkBetterIsLower = entry?.hallmark?.betterIsLower !== false;

  // Bucket the two inputs by week once, rather than re-scanning per week.
  const mine = activities.filter((a) => normalizeSportBucket(a?.sport) === bucket);
  const actByWeek = new Map();
  for (const a of mine) {
    const key = dateKeyOf(a?.date);
    const wk = key ? mondayOf(key) : null;
    if (!wk) continue;
    if (!actByWeek.has(wk)) actByWeek.set(wk, []);
    actByWeek.get(wk).push(a);
  }
  const ciByWeek = new Map();
  for (const c of checkIns) {
    const key = dateKeyOf(c?.date);
    const wk = key ? mondayOf(key) : null;
    if (!wk) continue;
    if (!ciByWeek.has(wk)) ciByWeek.set(wk, []);
    ciByWeek.get(wk).push(c);
  }

  const out = [];
  for (let wk = firstMonday; wk <= lastMonday; wk = addDays(wk, 7)) {
    const weekEnd = addDays(wk, 6);
    const rows = actByWeek.get(wk) || [];

    let distanceM = 0;
    let durationS = 0;
    let tss = 0;
    let weightedSpeed = 0;
    let weightedDistance = 0;
    let fastest = 0;
    for (const a of rows) {
      const dist = Number(a.distance) || 0;
      const dur = Number(a.movingTime) || 0;
      distanceM += dist;
      durationS += dur;
      tss += Number(a.tss) || 0;
      const speed = speedOf(a);
      if (speed > 0 && dur >= MIN_SPEED_SECONDS) {
        fastest = Math.max(fastest, speed);
        if (dist > 0) {
          weightedSpeed += speed * dist;
          weightedDistance += dist;
        }
      }
    }

    const stageRow = stageRowForWeek(timeline, wk, weekEnd);
    const stage = stageObject(entry, stageRow);
    const ceilingPct = num(stage?.volumePctOfBaseline);
    const ceilingDistanceM = ceilingPct != null && baseline.weeklyDistanceM != null
      ? Math.round((baseline.weeklyDistanceM * ceilingPct) / 100)
      : null;

    const speedCapPct = speedCapPctFor(stage, episode, Boolean(stageRow) && stageRow === openRow);
    const speedCapMps = speedCapPct != null && baseline.peakSpeedMps != null
      ? round3((baseline.peakSpeedMps * speedCapPct) / 100)
      : null;

    const cis = ciByWeek.get(wk) || [];
    const pains = cis.flatMap((c) => [
      num(c.painNow), num(c.painDuringSession), num(c.painNextMorning),
    ]).filter((v) => v != null);
    const hallmarks = cis.map((c) => num(c.hallmarkValue)).filter((v) => v != null);

    const fastestSpeedMps = fastest > 0 ? round3(fastest) : null;

    out.push({
      weekStart: wk,
      isPreInjury: weekEnd < startDate,
      distanceM: Math.round(distanceM),
      durationS: Math.round(durationS),
      tss: Math.round(tss),
      sessions: rows.length,
      avgSpeedMps: weightedDistance > 0 ? round3(weightedSpeed / weightedDistance) : null,
      fastestSpeedMps,
      pctOfBaseline: baseline.weeklyDistanceM > 0
        ? Math.round((distanceM / baseline.weeklyDistanceM) * 100)
        : null,
      ceilingDistanceM,
      ceilingPct,
      stageId: stage?.id || stageRow?.stageId || null,
      stageName: stage?.name || null,
      runningAllowed: stage ? stage.runningAllowed !== false : null,
      speedCapMps,
      breachedVolume: ceilingDistanceM != null && Math.round(distanceM) > ceilingDistanceM,
      breachedSpeed: speedCapMps != null && fastestSpeedMps != null
        && fastestSpeedMps > speedCapMps,
      painMax: pains.length ? Math.max(...pains) : null,
      hallmarkValue: hallmarks.length
        ? (hallmarkBetterIsLower ? Math.max(...hallmarks) : Math.min(...hallmarks))
        : null,
      checkInCount: cis.length,
    });
  }

  return { sport: bucket, baseline, weeks: out };
}

/**
 * Fetch the activities and check-ins the series needs, then build it.
 * Never throws on a missing athlete or an unreadable source - a chart with no
 * bars is a better answer than a 500.
 */
async function weeklyProgress(episode, entry, { weeks } = {}) {
  const sport = primarySportFor(entry);
  const startDate = dateKeyOf(episode?.startDate);
  if (!startDate) return buildWeeklyProgress({ episode, entry, sport, weeks });

  const preWeeks = Math.min(26, Math.max(0, weeks == null ? BASELINE_WEEKS : Number(weeks) || 0));
  const from = new Date(`${addDays(mondayOf(startDate), -7 * preWeeks)}T00:00:00.000Z`);
  const to = new Date(Date.now() + DAY_MS);

  let user = null;
  try {
    user = await User.findById(episode.athleteId).lean();
  } catch {
    user = null;
  }
  const profile = buildUserProfile(user || {});

  let activities = [];
  try {
    activities = await collectActivities(episode.athleteId, from, to, profile);
  } catch (e) {
    console.error('[HealthProgress] activity collection failed:', e.message);
  }

  let checkIns = [];
  try {
    checkIns = await HealthCheckIn.find({ episodeId: episode._id }).sort({ date: 1 }).lean();
  } catch (e) {
    console.error('[HealthProgress] check-in load failed:', e.message);
  }

  return buildWeeklyProgress({ episode, entry, activities, checkIns, sport, weeks });
}

module.exports = {
  weeklyProgress,
  buildWeeklyProgress,
  stageTimeline,
  mondayOf,
  MIN_SPEED_SECONDS,
};
