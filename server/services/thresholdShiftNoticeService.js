/**
 * "Your threshold has moved" — told once, when it is actually true.
 *
 * The drift engine has always been able to say that an athlete's LT2 now reads
 * fifteen watts above the test on file. It only ever said it to someone
 * already looking at the page, which is the one person who did not need
 * telling. This notices on their behalf.
 *
 * The bar for speaking is deliberately the one zoneAdviceFor() already sets,
 * because that function exists to answer a strictly harder question — should
 * this athlete's zones be rewritten? — and anything that clears it is a real
 * move:
 *
 *   · at least 3% off the tested value,
 *   · on at least eight readable sessions and four hours near a threshold,
 *   · with the estimate not flagged as a hint,
 *   · and the test old enough that the athlete plausibly changed.
 *
 * On top of that: one notice per sport per three weeks, and only when the
 * number has moved materially since the last thing we told them. A threshold
 * that creeps steadily upward must not produce the same sentence every three
 * weeks — the athlete stops reading it, and then stops reading the ones that
 * matter.
 */

'use strict';

const User = require('../models/UserModel');
const { readSessionsSinceTest } = require('./thresholdDriftService');
const { projectThresholdShift, zoneAdviceFor, demandToThreshold } = require('../utils/hrPowerProfile');
const { sendNotification } = require('../utils/notificationHelper');

const MS_DAY = 24 * 60 * 60 * 1000;

/** Never two notices about the same sport inside this. */
const COOLDOWN_DAYS = 21;
/**
 * How much further it has to have moved before saying so again.
 *
 * Without this, an athlete improving steadily gets "your LT2 is up 3.1%",
 * then "up 3.4%", then "up 3.6%" — three notifications carrying one fact.
 */
const RESTATE_MIN_PCT_DELTA = 2.5;

const SPORTS = ['bike', 'run'];
const SPORT_WORD = { bike: 'cycling', run: 'running' };

function fmtPaceSec(sec) {
  const total = Math.round(Number(sec) || 0);
  if (total <= 0) return '—';
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A threshold in the unit its sport is spoken in. Mirrors thresholdFormat.js. */
function fmtThreshold(demand, kind, storageMode) {
  const v = demandToThreshold(demand, { kind, storageMode });
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (kind === 'bike') return `${Math.round(v)} W`;
  if (storageMode === 'speed') return `${(v).toFixed(1)} km/h`;
  return `${fmtPaceSec(v)}/km`;
}

/** The size of the move, said the way the sport says it. */
function fmtDelta(est, kind, storageMode) {
  if (kind === 'bike') return `${Math.abs(Math.round(est.shift))} W`;
  const before = demandToThreshold(est.fromDemand, { kind, storageMode });
  const after = demandToThreshold(est.toDemand, { kind, storageMode });
  if (storageMode === 'speed') return `${Math.abs(after - before).toFixed(1)} km/h`;
  return `${Math.abs(Math.round(before - after))} s/km`;
}

function daysSince(d) { return d ? (Date.now() - new Date(d).getTime()) / MS_DAY : Infinity; }

/**
 * Has this sport's threshold moved enough, recently enough, and differently
 * enough from the last thing we said?
 *
 * @returns {Promise<null | {sport, projection, advice, anchor, test, est, which}>}
 */
async function evaluateSport(user, sport) {
  const prior = user.thresholdShiftNotice?.[sport] || {};
  if (daysSince(prior.sentAt) < COOLDOWN_DAYS) return null;

  const { test, anchor, compared } = await readSessionsSinceTest({ userId: user._id, sport });
  if (!test || !anchor?.lt2) return null;

  const projection = projectThresholdShift(compared || [], anchor);
  if (!projection) return null;

  // Borrowed wholesale: the question "are these zones wrong?" is strictly
  // harder than "has this moved?", so anything that clears it has moved.
  const advice = zoneAdviceFor(projection, { testDate: test.date });
  if (!advice) return null;

  const which = projection.lt2 && projection.lt2.confidence !== 'low' ? 'lt2' : 'lt1';
  const est = projection[which];
  if (!est) return null;

  // A new test resets the conversation; otherwise it has to have moved on.
  const sameTest = String(prior.testId || '') === String(test._id);
  if (sameTest && Number.isFinite(prior.shiftPct)) {
    if (Math.abs(est.shiftPct - prior.shiftPct) < RESTATE_MIN_PCT_DELTA) return null;
  }

  return { sport, projection, advice, anchor, test, est, which };
}

/** The notification itself, deep-linked at the curve. */
async function notifyShift(user, found) {
  const { sport, anchor, test, est, which } = found;
  const kind = sport;
  const storageMode = anchor.storageMode;
  const up = est.shift > 0;
  const label = which.toUpperCase();

  const title = `Your ${SPORT_WORD[sport]} ${label} has moved`;
  const body = `${label} now reads ${fmtThreshold(est.toDemand, kind, storageMode)} — `
    + `${fmtDelta(est, kind, storageMode)} ${up ? 'above' : 'below'} your test. `
    + `${up ? 'Your zones are probably too easy.' : 'Worth checking before you change anything.'} `
    + 'Tap to see the curve.';

  await sendNotification([String(user._id)], {
    type: 'threshold_shift',
    title,
    body,
    resourceId: String(test._id),
    resourceType: 'test',
    sport,
    pushData: { screen: 'testing', sport, testId: String(test._id) },
  });
}

/**
 * Check one athlete across both sports and tell them about anything that has
 * moved. Stamps `lastCheckedAt` whatever the outcome, so the walker rotates
 * rather than re-reading the same person.
 */
async function checkUser(user, { dryRun = false } = {}) {
  const told = [];
  for (const sport of SPORTS) {
    let found = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      found = await evaluateSport(user, sport);
    } catch (e) {
      console.warn('[thresholdShift]', user._id, sport, e?.message || e);
      continue;
    }
    if (!found) continue;
    if (dryRun) { told.push({ sport, shiftPct: found.est.shiftPct, dryRun: true }); continue; }

    // eslint-disable-next-line no-await-in-loop
    await notifyShift(user, found);
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne({ _id: user._id }, {
      $set: {
        [`thresholdShiftNotice.${sport}.sentAt`]: new Date(),
        [`thresholdShiftNotice.${sport}.shiftPct`]: found.est.shiftPct,
        [`thresholdShiftNotice.${sport}.testId`]: String(found.test._id),
      },
    });
    told.push({ sport, shiftPct: found.est.shiftPct, to: fmtThreshold(found.est.toDemand, sport, found.anchor.storageMode) });
  }

  if (!dryRun) {
    await User.updateOne({ _id: user._id },
      { $set: { 'thresholdShiftNotice.lastCheckedAt': new Date() } });
  }
  return told;
}

/**
 * Athletes worth reading, least-recently-checked first.
 *
 * Only people with a test — everything here is measured against one — and only
 * those with somewhere for sessions to come from. Reading a season of streams
 * for an account with no integration finds nothing, slowly.
 */
async function findUsersToCheck(limit = 5) {
  const Test = require('../models/test');
  const cutoff = new Date(Date.now() - 3 * MS_DAY);

  const athleteIds = await Test.distinct('athleteId').catch(() => []);
  if (!athleteIds.length) return [];

  return User.find({
    _id: { $in: athleteIds },
    isActive: { $ne: false },
    $or: [
      { 'thresholdShiftNotice.lastCheckedAt': { $exists: false } },
      { 'thresholdShiftNotice.lastCheckedAt': null },
      { 'thresholdShiftNotice.lastCheckedAt': { $lt: cutoff } },
    ],
  })
    .select('_id name thresholdShiftNotice notifications expoPushTokens')
    .sort({ 'thresholdShiftNotice.lastCheckedAt': 1 })
    .limit(limit)
    .lean();
}

module.exports = {
  checkUser,
  evaluateSport,
  findUsersToCheck,
  COOLDOWN_DAYS,
  RESTATE_MIN_PCT_DELTA,
};
