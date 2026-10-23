'use strict';

/**
 * Who may read, write and moderate the comments under a training.
 *
 * A training comment points at its activity by id only, and that id may name
 * a manual training, a FIT upload, a planned workout, a race or a Strava
 * activity (by Mongo _id or by Strava's numeric id). The GET route is not
 * even told which. So the owner is looked up in every collection the id can
 * belong to, and the comment thread is open to whoever may act for that
 * owner: the athlete, a linked coach or an admin (mayActForAthlete).
 */

const mongoose = require('mongoose');
const { mayActForAthlete } = require('./athleteCoachAccess');

// Same paths commentRoutes requires, so each model is the one already compiled.
function model(_name, path) {
  return require(path);
}

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(v);

/**
 * Athlete ids that own the activity this trainingId names (usually one).
 * The calendar sends its own ids for some activities — `regular-<oid>`,
 * `garmin-<garminId>`, `apple-<healthKitId>`, `polar-<watchId>`,
 * `coros-<watchId>` — and comments are stored under that exact string, so the
 * prefix is read here rather than stripped by the client.
 */
async function ownersOfTrainingTarget(trainingId) {
  const id = String(trainingId || '').trim();
  if (!id) return [];
  const owners = new Set();
  const add = (doc, field) => { if (doc && doc[field]) owners.add(String(doc[field])); };

  const m = /^(regular|training|fit|strava|garmin|apple|polar|coros)-(.+)$/i.exec(id);
  const prefix = m ? m[1].toLowerCase() : null;
  const rest = m ? m[2] : id;

  if (isObjectId(rest) && (!prefix || ['regular', 'training', 'fit', 'strava'].includes(prefix))) {
    const [training, fit, planned, race, strava] = await Promise.all([
      model('Training', '../models/training').findById(rest).select('athleteId').lean(),
      model('FitTraining', '../models/fitTraining').findById(rest).select('athleteId').lean(),
      model('PlannedWorkout', '../models/PlannedWorkout').findById(rest).select('athleteId').lean(),
      model('RaceEvent', '../models/RaceEvent').findById(rest).select('athleteId').lean(),
      model('StravaActivity', '../models/StravaActivity').findById(rest).select('userId').lean(),
    ]);
    add(training, 'athleteId');
    add(fit, 'athleteId');
    add(planned, 'athleteId');
    add(race, 'athleteId');
    add(strava, 'userId');
  }

  if ((!prefix || prefix === 'strava') && /^\d+$/.test(rest)) {
    const rows = await model('StravaActivity', '../models/StravaActivity')
      .find({ stravaId: Number(rest) }).select('userId').limit(5).lean();
    rows.forEach((r) => add(r, 'userId'));
  }

  // Watch and health sources: by their own id, or (a calendar fallback) by _id.
  const bySource = {
    garmin: () => [model('GarminActivity', '../models/GarminActivity'), { garminId: rest }],
    apple: () => [model('AppleHealthActivity', '../models/AppleHealthActivity'), { healthKitId: rest }],
    polar: () => [model('WatchActivity', '../models/WatchActivity'), { source: 'polar', watchId: rest }],
    coros: () => [model('WatchActivity', '../models/WatchActivity'), { source: 'coros', watchId: rest }],
  };
  if (prefix && bySource[prefix]) {
    const [Model, query] = bySource[prefix]();
    const rows = await Model.find(query).select('userId').limit(5).lean();
    rows.forEach((r) => add(r, 'userId'));
    if (isObjectId(rest)) add(await Model.findById(rest).select('userId').lean(), 'userId');
  }
  return Array.from(owners);
}

/**
 * Pure rule, given the owners already looked up. Admins may always; nobody
 * else may when the owner is unknown (a deleted activity has nothing to show).
 */
function mayUseTrainingComments(requester, owners, ownerDocs) {
  if (!requester) return false;
  if (requester.admin === true || String(requester.role || '').toLowerCase() === 'admin') return true;
  if (!Array.isArray(owners) || owners.length === 0) return false;
  return owners.some((ownerId) => {
    const athlete = (ownerDocs || []).find((d) => String(d._id) === String(ownerId)) || { _id: ownerId };
    return mayActForAthlete(requester, athlete);
  });
}

/** Load what mayUseTrainingComments needs and answer it. */
async function canUseTrainingComments(requester, trainingId) {
  if (!requester) return false;
  const owners = await ownersOfTrainingTarget(trainingId);
  const User = model('User', '../models/UserModel');
  const ownerDocs = owners.length
    ? await User.find({ _id: { $in: owners.filter((o) => mongoose.Types.ObjectId.isValid(o)) } })
      .select('coachId coachIds').lean()
    : [];
  return mayUseTrainingComments(requester, owners, ownerDocs);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  ownersOfTrainingTarget,
  mayUseTrainingComments,
  canUseTrainingComments,
  escapeHtml,
};
