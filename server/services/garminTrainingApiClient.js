/**
 * Garmin Training API client — the OFFICIAL, direct route from a LaChart
 * planned workout to a scheduled workout in the athlete's Garmin Connect
 * calendar, which then syncs to their watch.
 *
 * ── STATUS ───────────────────────────────────────────────────────────────
 * LaChart's Garmin Connect Developer Program key HAS the Training toolkit
 * approved and enabled ("Data shared from your app to Garmin Connect →
 * Training"), so this is usable. It stays behind
 * GARMIN_TRAINING_API_ENABLED so it can be switched on deliberately.
 *
 * Garmin derives a user's granted permissions from what is enabled on the
 * developer key, so the OAuth flow does not need a scope parameter — but any
 * athlete who authorised BEFORE the Training toolkit was enabled will not
 * hold the workout permission until they reconnect. Check with
 * GET /api/integrations/garmin/training-status rather than assuming.
 *
 * ── SCHEMA CONFIDENCE ────────────────────────────────────────────────────
 * Field names come from the partner Swagger
 * (/tools/apiDocs/training-api-workouts), so the shape is CONFIRMED.
 *
 * The V1 and V2 schemas differ in a way that matters:
 *   • V1 (`Workout`) puts `steps` DIRECTLY on the workout.
 *   • V2 (`WorkoutV2`) nests them under `segments[].steps`.
 * Only V1 has POST, so creation uses the flat form. Do not "upgrade" this to
 * the segments shape — POST /workout rejects it.
 *
 * ⚠️ KNOWN-UNRESOLVED: how a WorkoutRepeatStep carries the steps it repeats.
 * The expanded schema is
 *     WorkoutRepeatStep { stepOrder, type*, repeatType, repeatValue,
 *                         skipLastRestStep }
 * with NO nested `steps` array — while `Workout` and `Segment` both do declare
 * one, so the omission looks deliberate rather than a rendering quirk. That
 * means the repeat is probably a POSITIONAL marker in the flat step list
 * (FIT-style: loop back over preceding steps), not a container.
 *
 * buildWorkoutPayload still nests, which is very likely WRONG and is the most
 * probable cause of a rejected interval workout. Settle it with
 *     GET /api/integrations/garmin/workout-inspect?workoutId=<id>
 * against a repeating workout built by hand in Garmin Connect, then fix the
 * one branch in buildWorkoutPayload to match what Garmin actually returns.
 *
 * Also unverified: the `type` discriminator's allowed values. We send
 * "WorkoutStep" / "WorkoutRepeatStep" to match the schema names; Swagger types
 * it only as a string.
 *
 * Note this dialect is NOT the same as the unofficial connect.garmin.com
 * /workout-service one (workoutSegments + stepType/endCondition id-key
 * objects). Most examples online are that other dialect — do not mix them.
 */
const axios = require('axios');

const TIMEOUT_MS = 20000;

function apiBase() {
  return process.env.GARMIN_API_BASE_URL || 'https://apis.garmin.com';
}

/** Master switch. Everything in the push path checks this first. */
function isTrainingApiEnabled() {
  return String(process.env.GARMIN_TRAINING_API_ENABLED || '').toLowerCase() === 'true';
}

/** Scope string to request once Garmin issues one. Empty until then. */
function workoutScope() {
  return process.env.GARMIN_WORKOUT_SCOPE || '';
}

/* ── Schema maps — correct these against the partner spec ─────────────── */

const SPORT_TO_GARMIN = {
  bike: 'CYCLING',
  mtbike: 'CYCLING',
  brick: 'CYCLING',
  lactate: 'CYCLING',
  run: 'RUNNING',
  walk: 'RUNNING',
  swim: 'LAP_SWIMMING',
  rowing: 'GENERIC',
  strength: 'GENERIC',
  gym: 'GENERIC',
  crosstrain: 'GENERIC',
  other: 'GENERIC',
};

const STEP_TYPE_TO_INTENSITY = {
  warmup: 'WARMUP',
  work: 'INTERVAL',
  recovery: 'RECOVERY',
  rest: 'REST',
  cooldown: 'COOLDOWN',
};

/* ── Payload construction ─────────────────────────────────────────────── */

/**
 * One executable step. Power targets are absolute watts; a step with no
 * resolvable target becomes OPEN rather than being dropped, so the athlete
 * still gets the structure and the duration on the watch.
 */
function buildStep(step, stepOrder, { resolveRange, ctx }) {
  const durationValue = Math.max(1, Math.round(Number(step.durationSeconds) || 0));
  const out = {
    type: 'WorkoutStep',
    stepOrder,
    intensity: STEP_TYPE_TO_INTENSITY[step.stepType] || 'ACTIVE',
    durationType: 'TIME',
    durationValue,
    targetType: 'OPEN',
  };
  if (step.label) out.description = String(step.label).slice(0, 512);

  const range = resolveRange(step.powerTarget, ctx);
  if (range && range.low > 0 && range.high >= range.low) {
    out.targetType = 'POWER';
    out.targetValueLow = range.low;
    out.targetValueHigh = range.high;
  }

  // Cadence rides as a SECONDARY target when power already holds the primary
  // slot — the schema supports both at once, so a "hold 280 W at 95 rpm" step
  // keeps its cadence instead of the two competing for one field.
  const cadLow = Number(step.cadenceMin) || 0;
  if (cadLow > 0) {
    const cadHigh = Math.round(Number(step.cadenceMax) || cadLow);
    if (out.targetType === 'OPEN') {
      out.targetType = 'CADENCE';
      out.targetValueLow = Math.round(cadLow);
      out.targetValueHigh = cadHigh;
    } else {
      out.secondaryTargetType = 'CADENCE';
      out.secondaryTargetValueLow = Math.round(cadLow);
      out.secondaryTargetValueHigh = cadHigh;
    }
  }
  return out;
}

/**
 * Convert a LaChart PlannedWorkout into a Training API workout payload.
 *
 * LaChart repeat groups become native WorkoutRepeatStep blocks rather than
 * being flattened — Garmin devices cap a workout around 50 steps and allow
 * only one level of repeat nesting, so a 10 × (work + recovery) set must go
 * as a repeat, not as 20 steps.
 *
 * @param {object} pw PlannedWorkout (lean)
 * @param {object} deps { resolveRange, ctx } — injected so this stays a pure
 *   transform and can be unit-tested without a database or credentials.
 */
function buildWorkoutPayload(pw, { resolveRange, ctx = {} } = {}) {
  const sport = SPORT_TO_GARMIN[String(pw.sport || 'other').toLowerCase()] || 'GENERIC';
  const raw = Array.isArray(pw.steps) ? pw.steps : [];

  const steps = [];
  const seen = new Set();
  let order = 0;
  let totalSecs = 0;

  for (const s of raw) {
    if (!s.groupId) {
      order += 1;
      const built = buildStep(s, order, { resolveRange, ctx });
      steps.push(built);
      totalSecs += built.durationValue;
      continue;
    }
    if (seen.has(s.groupId)) continue;
    seen.add(s.groupId);

    const members = raw.filter((x) => x.groupId === s.groupId);
    const repeatValue = Math.max(1, Number(members.find((x) => x.isGroupHeader)?.groupRepeat) || 1);

    if (repeatValue === 1) {
      for (const m of members) {
        order += 1;
        const built = buildStep(m, order, { resolveRange, ctx });
        steps.push(built);
        totalSecs += built.durationValue;
      }
      continue;
    }

    order += 1;
    const repeatOrder = order;
    const children = members.map((m) => {
      order += 1;
      return buildStep(m, order, { resolveRange, ctx });
    });
    totalSecs += children.reduce((a, c) => a + c.durationValue, 0) * repeatValue;
    steps.push({
      type: 'WorkoutRepeatStep',
      stepOrder: repeatOrder,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue,
      steps: children,
    });
  }

  if (!steps.length) return null;

  // V1 shape: `steps` sits directly on the workout. The nested
  // `segments[].steps` structure belongs to the V2 schema, and V2 exposes only
  // GET/PUT/DELETE — there is no POST /workout/v2 — so creation must use this
  // flat form. Sending `segments` to POST /workout is rejected.
  const payload = {
    workoutName: String(pw.title || 'LaChart workout').slice(0, 80),
    sport,
    estimatedDurationInSecs: totalSecs || undefined,
    workoutProvider: 'LaChart',
    // Our own primary key, so a re-push can be correlated on Garmin's side.
    workoutSourceId: String(pw._id),
    steps,
  };
  // Pool length matters for LAP_SWIMMING to render distances correctly on the
  // watch; Garmin's default is unreliable, so state it explicitly.
  if (sport === 'LAP_SWIMMING') {
    payload.poolLength = 25;
    payload.poolLengthUnit = 'METER';
  }
  if (Number(pw.plannedDistance) > 0) {
    payload.estimatedDistanceInMeters = Math.round(Number(pw.plannedDistance));
  }
  const desc = [pw.description, pw.coachNotes].filter(Boolean).join('\n\n');
  if (desc) payload.description = desc.slice(0, 1024);
  return payload;
}

/**
 * The calendar day to schedule on, as `YYYY-MM-DD`.
 * PlannedWorkout.date is UTC midnight for a date-only entry, so read the day
 * in UTC — local getters shift it a day for any athlete west of UTC.
 */
function scheduleDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/* ── HTTP ─────────────────────────────────────────────────────────────── */

function authHeaders(tokenData) {
  return {
    Authorization: `${tokenData.tokenType || 'Bearer'} ${tokenData.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function createWorkout(tokenData, payload) {
  // Responds 200 with the full created workout, including the assigned id.
  const { data } = await axios.post(`${apiBase()}/training-api/workout`, payload, {
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
  return data?.workoutId ?? data?.id ?? null;
}

/**
 * Read one workout back exactly as Garmin stores it.
 *
 * This is how we settle the repeat-encoding question empirically: build a
 * repeating interval workout by hand in Garmin Connect, then GET it here and
 * look at how Garmin itself lays out the WorkoutRepeatStep. Cheaper and more
 * reliable than guessing from the schema, which does not show the nesting.
 */
async function getWorkout(tokenData, workoutId) {
  const { data } = await axios.get(`${apiBase()}/training-api/workout/${workoutId}`, {
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
  return data;
}

/** Workout schedules in a date range — `[{ scheduleId, workoutId, date }]`. */
async function listSchedules(tokenData, startDate, endDate) {
  const { data } = await axios.get(`${apiBase()}/training-api/schedule`, {
    params: { startDate, endDate },
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
  return Array.isArray(data) ? data : [];
}

async function updateWorkout(tokenData, workoutId, payload) {
  await axios.put(`${apiBase()}/training-api/workout/${workoutId}`, payload, {
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
  return workoutId;
}

async function deleteWorkout(tokenData, workoutId) {
  await axios.delete(`${apiBase()}/training-api/workout/${workoutId}`, {
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
}

/**
 * Put an existing workout on a date. Creating a workout only adds it to the
 * athlete's library — without this it never lands on the calendar, and
 * unscheduled workouts reach fewer devices.
 */
async function scheduleWorkout(tokenData, workoutId, date) {
  const { data } = await axios.post(`${apiBase()}/training-api/schedule`,
    { workoutId, date },
    { headers: authHeaders(tokenData), timeout: TIMEOUT_MS });
  // POST /schedule responds with the bare schedule id as a number, not an
  // object — reading `data.id` here would silently yield null and we would
  // lose the ability to reschedule or withdraw the workout later.
  if (typeof data === 'number') return data;
  if (typeof data === 'string' && /^\d+$/.test(data.trim())) return Number(data.trim());
  return data?.scheduleId ?? data?.workoutScheduleId ?? data?.id ?? null;
}

async function unscheduleWorkout(tokenData, scheduleId) {
  await axios.delete(`${apiBase()}/training-api/schedule/${scheduleId}`, {
    headers: authHeaders(tokenData), timeout: TIMEOUT_MS,
  });
}

function describeError(err) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  // Garmin returns two different error bodies: ConnectErrorBody
  // { message, error } and ServiceFailure { errorType, message, errorMessage,
  // errorId }. Surface whichever fields are present — errorMessage/errorId are
  // what actually name the offending field on a 400, and losing them turns a
  // fixable schema mismatch into "something went wrong".
  const detail = body && typeof body === 'object'
    ? [body.errorMessage, body.message, body.error, body.errorType]
      .filter(Boolean).join(' — ') + (body.errorId ? ` (errorId: ${body.errorId})` : '')
    : null;

  if (status === 401) return 'Garmin rejected the access token. Reconnect Garmin in Settings.';
  if (status === 403) {
    return 'Garmin refused the request — the Training API permission is not granted on this account or key.'
      + (detail ? ` ${detail}` : '');
  }
  if (status === 400) return `Garmin rejected the workout payload. ${detail || 'No detail returned.'}`;
  if (status === 429) return 'Garmin is rate-limiting us. Try again shortly.';
  if (status >= 500) return 'Garmin is having trouble. Try again later.' + (detail ? ` ${detail}` : '');
  return detail || err?.message || 'Could not reach Garmin.';
}

module.exports = {
  isTrainingApiEnabled,
  workoutScope,
  SPORT_TO_GARMIN,
  STEP_TYPE_TO_INTENSITY,
  buildWorkoutPayload,
  scheduleDate,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  getWorkout,
  scheduleWorkout,
  listSchedules,
  unscheduleWorkout,
  describeError,
};
