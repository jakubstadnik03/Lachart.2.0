/**
 * Pushes LaChart planned workouts onto the athlete's intervals.icu calendar,
 * from where intervals.icu forwards them to Garmin Connect and Zwift.
 *
 * Fire-and-forget from the planner routes: a failure here must never fail the
 * athlete's save. Errors are recorded on the user document so the Settings
 * card can show that delivery is broken instead of pretending it worked.
 */
const User = require('../models/UserModel');
const PlannedWorkout = require('../models/PlannedWorkout');
const Test = require('../models/test');
const { decryptSecret } = require('../utils/secretBox');
const { buildZwo } = require('../utils/workoutExporters');
const {
  buildEvent, upsertEvent, deleteEventByExternalId, describeError,
} = require('./intervalsIcuClient');

const ZWO_SPORTS = new Set(['bike', 'mtbike', 'brick', 'lactate']);

/** Resolve the athlete's intervals.icu credentials, or null when not connected. */
async function credentialsFor(athleteId) {
  const user = await User.findById(athleteId).select('intervalsIcu').lean();
  const cfg = user?.intervalsIcu;
  if (!cfg?.apiKey) return null;
  const apiKey = decryptSecret(cfg.apiKey);
  if (!apiKey) return null;
  return { apiKey, icuAthleteId: cfg.athleteId, autoPush: cfg.autoPush !== false };
}

/** Power context for the ZWO, mirroring the export route's resolution order. */
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

async function recordResult(athleteId, error) {
  try {
    await User.findByIdAndUpdate(athleteId, {
      $set: {
        'intervalsIcu.lastPushAt': new Date(),
        'intervalsIcu.lastPushError': error || null,
      },
    });
  } catch (_) { /* status bookkeeping only */ }
}

/**
 * Push one planned workout. Safe to call repeatedly — events are upserted on
 * our own external_id, so an edit updates rather than duplicating.
 * @returns {Promise<{skipped?:string, pushed?:boolean, error?:string}>}
 */
async function pushPlannedWorkout(plannedWorkoutId, { force = false } = {}) {
  let pw;
  try {
    pw = await PlannedWorkout.findById(plannedWorkoutId).lean();
  } catch (_) { return { skipped: 'not_found' }; }
  if (!pw) return { skipped: 'not_found' };

  const creds = await credentialsFor(pw.athleteId);
  if (!creds) return { skipped: 'not_connected' };
  if (!creds.autoPush && !force) return { skipped: 'auto_push_off' };

  try {
    let zwo = null;
    const sport = String(pw.sport || '').toLowerCase();
    if (ZWO_SPORTS.has(sport) && Array.isArray(pw.steps) && pw.steps.length) {
      const ctx = await resolveCtx(pw.athleteId);
      zwo = buildZwo(pw, ctx);
    }
    const event = buildEvent(pw, { zwo });
    if (!event) return { skipped: 'bad_date' };

    await upsertEvent(creds.apiKey, creds.icuAthleteId, event);
    await recordResult(pw.athleteId, null);
    return { pushed: true };
  } catch (err) {
    const message = describeError(err);
    await recordResult(pw.athleteId, message);
    return { error: message };
  }
}

/** Remove a planned workout from intervals.icu after it is deleted in LaChart. */
async function removePlannedWorkout(athleteId, plannedWorkoutId) {
  const creds = await credentialsFor(athleteId);
  if (!creds) return { skipped: 'not_connected' };
  try {
    const res = await deleteEventByExternalId(creds.apiKey, creds.icuAthleteId, plannedWorkoutId);
    return { removed: res.deleted };
  } catch (err) {
    return { error: describeError(err) };
  }
}

/** Backfill: push every structured planned workout in a date window. */
async function pushWindow(athleteId, { from, to } = {}) {
  const creds = await credentialsFor(athleteId);
  if (!creds) return { skipped: 'not_connected' };

  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(Date.now() + 56 * 86400000);
  const list = await PlannedWorkout.find({
    athleteId: String(athleteId),
    date: { $gte: start, $lte: end },
    status: 'planned',
  }).lean();

  const ctx = await resolveCtx(athleteId);
  let pushed = 0;
  let failed = 0;
  let lastError = null;

  for (const pw of list) {
    try {
      let zwo = null;
      const sport = String(pw.sport || '').toLowerCase();
      if (ZWO_SPORTS.has(sport) && Array.isArray(pw.steps) && pw.steps.length) {
        zwo = buildZwo(pw, ctx);
      }
      const event = buildEvent(pw, { zwo });
      if (!event) continue;
      await upsertEvent(creds.apiKey, creds.icuAthleteId, event);
      pushed += 1;
    } catch (err) {
      failed += 1;
      lastError = describeError(err);
      // A bad key or a rate limit will fail every remaining workout too.
      const status = err?.response?.status;
      if (status === 401 || status === 403 || status === 429) break;
    }
  }

  await recordResult(athleteId, failed ? lastError : null);
  return { pushed, failed, total: list.length, error: lastError };
}

module.exports = {
  pushPlannedWorkout,
  removePlannedWorkout,
  pushWindow,
  credentialsFor,
};
