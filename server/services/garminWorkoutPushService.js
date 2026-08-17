/**
 * Pushes LaChart planned workouts into Garmin Connect via the official
 * Training API, and schedules them on the athlete's calendar so they sync to
 * the watch.
 *
 * INACTIVE until Garmin grants Training API access — every entry point
 * returns `{ skipped: 'training_api_disabled' }` while
 * GARMIN_TRAINING_API_ENABLED is unset. See garminTrainingApiClient.js.
 *
 * Fire-and-forget from the planner routes: a Garmin problem must never fail
 * the athlete's save. Failures are recorded on the user document so Settings
 * can show that delivery is broken instead of pretending it worked.
 */
const User = require('../models/UserModel');
const PlannedWorkout = require('../models/PlannedWorkout');
const Test = require('../models/test');
const { resolveTargetRange } = require('../utils/workoutExporters');
const client = require('./garminTrainingApiClient');

/** Power context, mirroring the export route's resolution order. */
async function resolveCtx(athleteId) {
  const ctx = { ftp: 250, lt1Power: null, lt2Power: null, cyclingZones: null };
  try {
    const user = await User.findById(athleteId).select('powerZones').lean();
    ctx.cyclingZones = user?.powerZones?.cycling || null;
    const tests = await Test.find({ userId: athleteId }).sort({ date: -1 }).limit(10).lean();
    const latest = tests.find((t) => t.lt2Power || t.ltPower || t.ftp);
    if (latest) {
      ctx.ftp = Number(latest.lt2Power || latest.ltPower || latest.ftp) || 250;
      ctx.lt1Power = latest.ltPower || latest.lt1Power || null;
      ctx.lt2Power = latest.lt2Power || latest.ltPower || null;
    }
    ctx.lt1Power = ctx.cyclingZones?.lt1 || ctx.lt1Power;
    ctx.lt2Power = ctx.cyclingZones?.lt2 || ctx.lt2Power;
    if (ctx.lt2Power) ctx.ftp = Number(ctx.lt2Power);
  } catch (_) { /* defaults */ }
  return ctx;
}

/** Load the athlete and a currently-valid Garmin token, or null. */
async function tokenFor(athleteId) {
  const user = await User.findById(athleteId);
  if (!user?.garmin?.accessToken) return null;
  try {
    // Reuse the single refresh path in integrationsRoutes rather than
    // duplicating expiry handling.
    const { getValidGarminToken } = require('../routes/integrationsRoutes');
    const tokenData = await getValidGarminToken(user);
    return { user, tokenData };
  } catch (_) {
    return null;
  }
}

async function recordResult(athleteId, error) {
  try {
    await User.findByIdAndUpdate(athleteId, {
      $set: {
        'garmin.lastWorkoutPushAt': new Date(),
        'garmin.lastWorkoutPushError': error || null,
      },
    });
  } catch (_) { /* status bookkeeping only */ }
}

/**
 * Create-or-update one planned workout in Garmin Connect and schedule it.
 * Idempotent: we remember Garmin's ids on the PlannedWorkout, so a re-push
 * updates the same workout rather than adding a duplicate.
 */
async function pushPlannedWorkout(plannedWorkoutId) {
  if (!client.isTrainingApiEnabled()) return { skipped: 'training_api_disabled' };

  const pw = await PlannedWorkout.findById(plannedWorkoutId).lean().catch(() => null);
  if (!pw) return { skipped: 'not_found' };
  if (!Array.isArray(pw.steps) || !pw.steps.length) return { skipped: 'no_steps' };
  if (pw.status && pw.status !== 'planned') return { skipped: 'not_planned' };

  const auth = await tokenFor(pw.athleteId);
  if (!auth) return { skipped: 'not_connected' };

  try {
    const ctx = await resolveCtx(pw.athleteId);
    const payload = client.buildWorkoutPayload(pw, { resolveRange: resolveTargetRange, ctx });
    if (!payload) return { skipped: 'no_steps' };

    let workoutId = pw.garminWorkoutId || null;
    if (workoutId) {
      try {
        await client.updateWorkout(auth.tokenData, workoutId, payload);
      } catch (err) {
        // The athlete may have deleted it in Garmin Connect — fall back to
        // creating a fresh one rather than failing the sync forever.
        if (err?.response?.status === 404) workoutId = null;
        else throw err;
      }
    }
    if (!workoutId) {
      workoutId = await client.createWorkout(auth.tokenData, payload);
    }
    if (!workoutId) throw new Error('Garmin did not return a workout id');

    // Creating only fills the library — scheduling is what puts it on the
    // calendar and gets it onto the watch.
    const date = client.scheduleDate(pw.date);
    let scheduleId = pw.garminScheduleId || null;
    if (date) {
      if (scheduleId) {
        await client.unscheduleWorkout(auth.tokenData, scheduleId).catch(() => {});
      }
      scheduleId = await client.scheduleWorkout(auth.tokenData, workoutId, date);
    }

    await PlannedWorkout.findByIdAndUpdate(pw._id, {
      $set: { garminWorkoutId: workoutId, garminScheduleId: scheduleId || null },
    });
    await recordResult(pw.athleteId, null);
    return { pushed: true, workoutId, scheduleId };
  } catch (err) {
    const message = client.describeError(err);
    await recordResult(pw.athleteId, message);
    return { error: message };
  }
}

/** Remove a workout from Garmin after it is deleted in LaChart. */
async function removePlannedWorkout(athleteId, pw) {
  if (!client.isTrainingApiEnabled()) return { skipped: 'training_api_disabled' };
  if (!pw?.garminWorkoutId && !pw?.garminScheduleId) return { skipped: 'never_pushed' };

  const auth = await tokenFor(athleteId);
  if (!auth) return { skipped: 'not_connected' };

  try {
    if (pw.garminScheduleId) {
      await client.unscheduleWorkout(auth.tokenData, pw.garminScheduleId).catch(() => {});
    }
    if (pw.garminWorkoutId) {
      await client.deleteWorkout(auth.tokenData, pw.garminWorkoutId);
    }
    return { removed: true };
  } catch (err) {
    return { error: client.describeError(err) };
  }
}

/** Backfill a date window — used by a manual "Send to Garmin now" action. */
async function pushWindow(athleteId, { from, to } = {}) {
  if (!client.isTrainingApiEnabled()) return { skipped: 'training_api_disabled' };
  const auth = await tokenFor(athleteId);
  if (!auth) return { skipped: 'not_connected' };

  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(Date.now() + 56 * 86400000);
  const list = await PlannedWorkout.find({
    athleteId: String(athleteId),
    date: { $gte: start, $lte: end },
    status: 'planned',
  }).select('_id').lean();

  let pushed = 0;
  let failed = 0;
  let lastError = null;
  for (const { _id } of list) {
    const res = await pushPlannedWorkout(_id);
    if (res.pushed) pushed += 1;
    else if (res.error) { failed += 1; lastError = res.error; }
  }
  return { pushed, failed, total: list.length, error: lastError };
}

module.exports = { pushPlannedWorkout, removePlannedWorkout, pushWindow };
