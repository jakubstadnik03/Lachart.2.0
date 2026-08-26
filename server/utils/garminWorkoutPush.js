/**
 * garminWorkoutPush
 * ─────────────────
 * Mirror LaChart planned workouts (steps → watch laps) into the athlete's
 * Garmin Connect calendar via the Garmin Training API:
 *
 *   POST   /training-api/rest/workout            create structured workout
 *   PUT    /training-api/rest/workout/{id}       update it
 *   DELETE /training-api/rest/workout/{id}       remove it
 *   POST   /training-api/rest/schedule           pin workout to a calendar date
 *   DELETE /training-api/rest/schedule/{id}      unpin
 *
 * Requires the Garmin OAuth connection with the WORKOUT_IMPORT permission.
 * Everything here is fire-and-forget from the planner routes: failures are
 * recorded on the PlannedWorkout (garminSyncError) instead of failing the
 * user's save.
 *
 * Grouped repeat blocks are pushed as native WorkoutRepeatStep so the watch
 * shows "5×" instead of a flattened list; power targets resolve through the
 * same helpers the TCX/ZWO exports use, so the watch gets the same watts the
 * athlete sees in the builder.
 */

const {
  resolveTargetRange,
  resolveTargetPaceSecPerKm,
  resolveTargetSwimPaceSecPer100m,
} = require('./workoutExporters');

/** Lazy — keeps the pure builders below testable with plain `node` (no deps). */
function axios() {
  return require('axios');
}

function trainingApiBase() {
  return `${(process.env.GARMIN_API_BASE_URL || 'https://apis.garmin.com').replace(/\/$/, '')}/training-api/rest`;
}

/** Lazy — integrationsRoutes also requires utils, avoid load-order surprises. */
function getValidGarminToken(user) {
  return require('../routes/integrationsRoutes').getValidGarminToken(user);
}

const SPORT_TO_GARMIN = {
  bike: 'CYCLING',
  mtbike: 'CYCLING',
  run: 'RUNNING',
  walk: 'RUNNING',
  swim: 'LAP_SWIMMING',
  strength: 'STRENGTH_TRAINING',
  gym: 'STRENGTH_TRAINING',
  brick: 'CYCLING',
  crosstrain: 'CARDIO_TRAINING',
  rowing: 'GENERIC',
  lactate: 'CYCLING',
  other: 'GENERIC',
};

const STEP_TYPE_TO_INTENSITY = {
  warmup: 'WARMUP',
  work: 'INTERVAL',
  recovery: 'RECOVERY',
  cooldown: 'COOLDOWN',
  rest: 'REST',
};

/** Absolute-bpm HR range from an hrTarget, if one is expressed in plain numbers. */
function resolveHrRange(target) {
  if (!target || target.type === 'open') return null;
  if (target.type !== 'watts') return null; // % targets are power-context only
  if (target.useRange && Number(target.rangeMin) > 0 && Number(target.rangeMax) > 0) {
    return { low: Math.round(Number(target.rangeMin)), high: Math.round(Number(target.rangeMax)) };
  }
  const v = Number(target.override) > 0 ? Number(target.override) : Number(target.value);
  if (!(v > 0)) return null;
  return { low: Math.round(v * 0.95), high: Math.round(v * 1.05) };
}

/** Sports where the primary target on the watch is pace, not power. */
const PACE_SPORTS = new Set(['run', 'walk', 'swim']);
const POWER_SPORTS = new Set(['bike', 'mtbike', 'brick', 'lactate']);

/**
 * Pace target as Garmin wants it: speed in m/s, low = slower, high = faster.
 * ±5 % around the resolved pace — same band as the power exports.
 */
function resolveSpeedRange(step, ctx) {
  const sport = ctx.sport;
  if (!PACE_SPORTS.has(sport)) return null;
  const pace = sport === 'swim'
    ? resolveTargetSwimPaceSecPer100m(step.powerTarget, ctx)
    : resolveTargetPaceSecPerKm(step.powerTarget, ctx);
  if (!(pace > 0)) return null;
  const unitMeters = sport === 'swim' ? 100 : 1000;
  const centre = unitMeters / pace; // m/s
  return {
    low: Math.round(centre * 0.95 * 1000) / 1000,
    high: Math.round(centre * 1.05 * 1000) / 1000,
  };
}

function toGarminStep(step, ctx, order) {
  const meters = Math.round(Number(step.distanceMeters) || 0);
  const isDistance = step.durationType === 'distance' && meters > 0;
  const g = {
    type: 'WorkoutStep',
    stepOrder: order,
    intensity: STEP_TYPE_TO_INTENSITY[step.stepType] || 'INTERVAL',
    // Distance steps (10×1 km) go to the watch as metres, so the lap flips on
    // distance — durationSeconds is only the builder's e-pace estimate.
    durationType: isDistance ? 'DISTANCE' : 'TIME',
    durationValue: isDistance ? meters : Math.max(1, Number(step.durationSeconds) || 0),
  };
  const desc = step.label || step.notes;
  if (desc) g.description = String(desc).slice(0, 512);

  // Target priority per sport: pace for run/swim, power for bike, HR fallback.
  const speed = resolveSpeedRange(step, ctx);
  const power = POWER_SPORTS.has(ctx.sport) || !PACE_SPORTS.has(ctx.sport)
    ? resolveTargetRange(step.powerTarget, ctx)
    : null;
  const hr = resolveHrRange(step.hrTarget);
  if (speed) {
    g.targetType = 'PACE';
    g.targetValueLow = speed.low;
    g.targetValueHigh = speed.high;
  } else if (power && power.high > 0) {
    g.targetType = 'POWER';
    g.targetValueLow = power.low;
    g.targetValueHigh = power.high;
  } else if (hr) {
    g.targetType = 'HEART_RATE';
    g.targetValueLow = hr.low;
    g.targetValueHigh = hr.high;
  } else {
    g.targetType = 'OPEN';
  }
  return g;
}

/**
 * Build the Garmin steps array, keeping grouped repeats as WorkoutRepeatStep.
 * Mirrors expandSteps() in workoutExporters: the group HEADER is a real step
 * (the work interval) and carries the repeat count for the whole block.
 */
function buildGarminSteps(steps = [], ctx = {}) {
  const out = [];
  let order = 1;
  let group = null;

  const flushGroup = () => {
    if (!group || !group.members.length) { group = null; return; }
    const repeat = Math.max(1, Number(group.repeat) || 1);
    if (repeat === 1) {
      for (const m of group.members) out.push(toGarminStep(m, ctx, order++));
    } else {
      const repeatStep = {
        type: 'WorkoutRepeatStep',
        stepOrder: order++,
        repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
        repeatValue: repeat,
        steps: [],
      };
      for (const m of group.members) repeatStep.steps.push(toGarminStep(m, ctx, order++));
      out.push(repeatStep);
    }
    group = null;
  };

  for (const s of steps) {
    if (s.isGroupHeader) {
      flushGroup();
      group = { id: s.groupId, repeat: s.groupRepeat || 1, members: [{ ...s }] };
      continue;
    }
    if (group && s.groupId && s.groupId === group.id) {
      group.members.push({ ...s });
    } else {
      flushGroup();
      out.push(toGarminStep(s, ctx, order++));
    }
  }
  flushGroup();
  return out;
}

function totalSeconds(steps = []) {
  let total = 0;
  let group = null;
  for (const s of steps) {
    const dur = Math.max(0, Number(s.durationSeconds) || 0);
    if (s.isGroupHeader) {
      if (group) total += group.sum * group.repeat;
      group = { id: s.groupId, repeat: Math.max(1, Number(s.groupRepeat) || 1), sum: dur };
    } else if (group && s.groupId === group.id) {
      group.sum += dur;
    } else {
      if (group) { total += group.sum * group.repeat; group = null; }
      total += dur;
    }
  }
  if (group) total += group.sum * group.repeat;
  return total;
}

function buildGarminWorkout(pw, ctx = {}) {
  const stepCtx = { ...ctx, sport: pw.sport };
  return {
    workoutName: String(pw.title || 'Workout').slice(0, 80),
    description: [pw.description, pw.coachNotes].filter(Boolean).join('\n\n').slice(0, 1024) || undefined,
    sport: SPORT_TO_GARMIN[pw.sport] || 'GENERIC',
    estimatedDurationInSecs: totalSeconds(pw.steps) || undefined,
    workoutProvider: 'LaChart',
    workoutSourceId: String(pw._id),
    steps: buildGarminSteps(pw.steps, stepCtx),
  };
}

/**
 * Power side mirrors the /planned/:id/export route (latest test → FTP/LT);
 * pace side comes from the profile zones (sec/km run, sec/100m swim) the
 * builder itself resolves against, so the watch target matches the builder.
 */
async function resolveWorkoutContext(athleteId, user = null) {
  const ctx = { ftp: 250, lt1Power: null, lt2Power: null };
  try {
    const Test = require('../models/test');
    const tests = await Test.find({ userId: athleteId }).sort({ date: -1 }).limit(10).lean();
    const latest = tests.find((t) => t.lt2Power || t.ltPower || t.ftp);
    if (latest) {
      ctx.ftp = Number(latest.lt2Power || latest.ltPower || latest.ftp) || 250;
      ctx.lt1Power = latest.ltPower || latest.lt1Power || null;
      ctx.lt2Power = latest.lt2Power || latest.ltPower || null;
    }
  } catch { /* keep defaults */ }
  const running = user?.powerZones?.running;
  if (running) {
    ctx.runningZones = running;
    ctx.lt1Pace = running.lt1 || null;
    ctx.lt2Pace = running.lt2 || null;
  }
  const swimming = user?.powerZones?.swimming;
  if (swimming) {
    ctx.swimmingZones = swimming;
    ctx.lt1Swim = swimming.lt1 || null;
    ctx.lt2Swim = swimming.lt2 || null;
  }
  return ctx;
}

function dayKey(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Is this planned workout something we can and should mirror to Garmin?
 * OAuth connection only (the credentials path has no Training API), steps
 * required (an unstructured note has no laps to push), and — when we know the
 * granted permissions — WORKOUT_IMPORT must be among them.
 */
function garminPushEligible(user, pw) {
  if (!user?.garmin?.accessToken || !user?.garmin?.refreshToken) return false;
  const perms = user.garmin.permissions;
  if (Array.isArray(perms) && perms.length > 0 && !perms.includes('WORKOUT_IMPORT')) return false;
  if (!Array.isArray(pw?.steps) || pw.steps.length === 0) return false;
  if (pw.status && pw.status !== 'planned') return false;
  if (!dayKey(pw.date)) return false;
  return true;
}

async function authHeaders(user) {
  const tokenData = await getValidGarminToken(user);
  return { Authorization: `${tokenData.tokenType} ${tokenData.accessToken}` };
}

const is404 = (e) => e?.response?.status === 404;

/**
 * Create/update the Garmin workout and (re)pin it to the planned date.
 * Mutates nothing — returns { workoutId, scheduleId, scheduledDate }.
 */
async function pushToGarminCalendar(user, pw, ctx) {
  const base = trainingApiBase();
  const headers = await authHeaders(user);
  const payload = buildGarminWorkout(pw, ctx);

  let workoutId = pw.garminWorkoutId || null;
  if (workoutId) {
    try {
      await axios().put(`${base}/workout/${workoutId}`, payload, { headers, timeout: 20000 });
    } catch (e) {
      if (!is404(e)) throw e;
      workoutId = null; // deleted on Garmin's side — recreate below
    }
  }
  if (!workoutId) {
    const r = await axios().post(`${base}/workout`, payload, { headers, timeout: 20000 });
    workoutId = r.data?.workoutId || r.data?.id || null;
    if (!workoutId) throw new Error('Garmin did not return a workoutId');
  }

  const scheduledDate = dayKey(pw.date);
  let scheduleId = pw.garminScheduleId || null;
  if (scheduleId && pw.garminScheduledDate !== scheduledDate) {
    await axios().delete(`${base}/schedule/${scheduleId}`, { headers, timeout: 20000 })
      .catch((e) => { if (!is404(e)) throw e; });
    scheduleId = null;
  }
  if (!scheduleId) {
    const r = await axios().post(`${base}/schedule`, { workoutId, date: scheduledDate }, { headers, timeout: 20000 });
    scheduleId = r.data?.workoutScheduleId || r.data?.scheduleId || r.data?.id || null;
  }

  return { workoutId, scheduleId, scheduledDate };
}

/**
 * Fire-and-forget entry point for the planner routes: (re)mirror one planned
 * workout to the athlete's Garmin calendar and record the outcome on the doc.
 */
async function syncPlannedWorkoutToGarmin(plannedWorkoutId) {
  const PlannedWorkout = require('../models/PlannedWorkout');
  const User = require('../models/UserModel');

  const pw = await PlannedWorkout.findById(plannedWorkoutId);
  if (!pw) return { synced: false, reason: 'not_found' };
  const user = await User.findById(pw.athleteId).select('garmin powerZones').lean();
  if (!garminPushEligible(user, pw)) return { synced: false, reason: 'not_eligible' };

  try {
    const ctx = await resolveWorkoutContext(pw.athleteId, user);
    const r = await pushToGarminCalendar(user, pw, ctx);
    pw.garminWorkoutId = r.workoutId;
    pw.garminScheduleId = r.scheduleId;
    pw.garminScheduledDate = r.scheduledDate;
    pw.garminSyncedAt = new Date();
    pw.garminSyncError = null;
    await pw.save();
    console.log(`[Garmin push] "${pw.title}" → Garmin calendar ${r.scheduledDate} (workout ${r.workoutId})`);
    return { synced: true, ...r };
  } catch (e) {
    const msg = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : (e.message || 'unknown');
    // 403 = app has no Training API / WORKOUT_IMPORT — expected for some
    // accounts, log quietly and remember so the UI could surface it.
    console.warn(`[Garmin push] "${pw.title}" failed:`, e?.response?.status || '', msg);
    await PlannedWorkout.updateOne({ _id: pw._id }, { $set: { garminSyncError: msg } }).catch(() => {});
    return { synced: false, reason: 'api_error', error: msg };
  }
}

/**
 * Remove the mirrored workout + calendar pin. Takes a plain snapshot (call
 * BEFORE deleting the doc). Ignores 404s — already gone is fine.
 */
async function removePlannedWorkoutFromGarmin(pwSnapshot) {
  if (!pwSnapshot?.garminWorkoutId && !pwSnapshot?.garminScheduleId) return;
  const User = require('../models/UserModel');
  const user = await User.findById(pwSnapshot.athleteId).select('garmin').lean();
  if (!user?.garmin?.refreshToken) return;
  try {
    const base = trainingApiBase();
    const headers = await authHeaders(user);
    if (pwSnapshot.garminScheduleId) {
      await axios().delete(`${base}/schedule/${pwSnapshot.garminScheduleId}`, { headers, timeout: 20000 })
        .catch((e) => { if (!is404(e)) throw e; });
    }
    if (pwSnapshot.garminWorkoutId) {
      await axios().delete(`${base}/workout/${pwSnapshot.garminWorkoutId}`, { headers, timeout: 20000 })
        .catch((e) => { if (!is404(e)) throw e; });
    }
  } catch (e) {
    console.warn('[Garmin push] remove failed:', e?.response?.status || '', e?.message);
  }
}

/**
 * Mirror every upcoming planned workout for a user — run after a fresh Garmin
 * OAuth connect so plans made before the connection appear on the watch too.
 */
async function syncAllUpcomingPlannedWorkouts(athleteId, limit = 30) {
  const PlannedWorkout = require('../models/PlannedWorkout');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = await PlannedWorkout.find({
    athleteId: String(athleteId),
    status: 'planned',
    date: { $gte: today },
    'steps.0': { $exists: true },
  }).sort({ date: 1 }).limit(limit).select('_id').lean();
  for (const { _id } of upcoming) {
    // Sequential on purpose — Garmin rate-limits bursts.
    await syncPlannedWorkoutToGarmin(_id).catch(() => {});
  }
  return { attempted: upcoming.length };
}

module.exports = {
  buildGarminWorkout,
  buildGarminSteps,
  garminPushEligible,
  syncPlannedWorkoutToGarmin,
  removePlannedWorkoutFromGarmin,
  syncAllUpcomingPlannedWorkouts,
};
