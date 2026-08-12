/**
 * intervals.icu client — the bridge from a LaChart planned workout to a
 * scheduled workout on the athlete's Garmin watch (and in Zwift).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Garmin Connect has no workout importer (its "Import Data" page ingests
 * completed activities only), and Garmin's Training API — which would let us
 * POST a workout and schedule it directly — is gated behind partner approval
 * that Garmin is not currently granting. intervals.icu IS an approved partner
 * for both Garmin and Zwift, so pushing the calendar there and letting it do
 * the last-mile delivery is the only route available to us.
 *
 * IMPORTANT: onward delivery is USER-CONFIGURED. A 200 from this API means the
 * event reached intervals.icu — NOT that it reached Garmin. The athlete has to
 * connect Garmin under intervals.icu → Settings → Connections and tick
 * "upload planned workout". Surface that in the UI; never claim delivery.
 *
 * Auth: the athlete's personal API key via HTTP Basic, with the username the
 * literal string "API_KEY". Needs no approval or registration from anyone.
 */
const axios = require('axios');

const BASE = 'https://intervals.icu/api/v1';
const TIMEOUT_MS = 15000;

/** LaChart sport → intervals.icu event type. */
const SPORT_TO_TYPE = {
  bike: 'Ride',
  mtbike: 'MountainBikeRide',
  run: 'Run',
  walk: 'Walk',
  swim: 'Swim',
  rowing: 'Rowing',
  strength: 'WeightTraining',
  gym: 'WeightTraining',
  crosstrain: 'Workout',
  brick: 'Ride',
  lactate: 'Ride',
  other: 'Workout',
};

function client(apiKey) {
  return axios.create({
    baseURL: BASE,
    timeout: TIMEOUT_MS,
    auth: { username: 'API_KEY', password: apiKey },
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stable per-workout key so re-pushing updates instead of duplicating. */
function externalIdFor(plannedWorkoutId) {
  return `lachart-${plannedWorkoutId}`;
}

/**
 * `start_date_local` must be a LOCAL naive datetime (no timezone suffix).
 * PlannedWorkout.date is stored as UTC midnight for a date-only entry, so read
 * the calendar day in UTC — using local getters would shift the day for any
 * athlete west of UTC.
 */
function startDateLocal(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const p = (n) => String(n).padStart(2, '0');
  if (isDateOnly) {
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T00:00:00`;
  }
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
    + `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
}

/**
 * Verify a key and resolve the athlete id it belongs to.
 * Athlete id 0 is an alias for "the key's owner".
 */
async function verifyKey(apiKey) {
  const { data } = await client(apiKey).get('/athlete/0/profile');
  const athlete = data?.athlete || data;
  return {
    athleteId: String(athlete?.id || ''),
    name: athlete?.name || null,
  };
}

/**
 * Build the event body for one planned workout.
 *
 * Structured bike sessions go as an attached .zwo, which intervals.icu parses
 * into a real structured workout (and which is what forwards usefully to
 * Garmin and Zwift). Everything else goes as a plain description — better an
 * honest text prescription than a bike-shaped file for a swim.
 */
function buildEvent(pw, { zwo = null } = {}) {
  const start = startDateLocal(pw.date);
  if (!start) return null;

  const event = {
    category: 'WORKOUT',
    type: SPORT_TO_TYPE[String(pw.sport || 'other').toLowerCase()] || 'Workout',
    name: pw.title || 'LaChart workout',
    start_date_local: start,
    external_id: externalIdFor(pw._id),
  };

  const notes = [pw.description, pw.coachNotes].filter(Boolean).join('\n\n');
  if (notes) event.description = notes;
  if (Number(pw.targetTss) > 0) event.icu_training_load = Math.round(Number(pw.targetTss));

  if (zwo) {
    event.filename = 'workout.zwo';
    event.file_contents = zwo;
  }
  return event;
}

/** Create or update one planned workout on the athlete's intervals.icu calendar. */
async function upsertEvent(apiKey, athleteId, event) {
  const id = athleteId || '0';
  const { data } = await client(apiKey).post(
    `/athlete/${id}/events?upsertOnUid=true`,
    event,
  );
  return data;
}

/** Remove a planned workout we previously pushed. */
async function deleteEventByExternalId(apiKey, athleteId, plannedWorkoutId) {
  const id = athleteId || '0';
  const api = client(apiKey);
  // The API deletes by intervals.icu id, so resolve ours first. Scan a wide
  // window because the workout may have been moved before being deleted.
  const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const { data } = await api.get(`/athlete/${id}/events?oldest=${from}&newest=${to}`);
  const wanted = externalIdFor(plannedWorkoutId);
  const hits = (Array.isArray(data) ? data : []).filter((e) => e?.external_id === wanted);
  if (!hits.length) return { deleted: 0 };
  await api.put(`/athlete/${id}/events/bulk-delete`, hits.map((e) => ({ id: e.id })));
  return { deleted: hits.length };
}

/** Normalise an axios failure into something safe to show a user. */
function describeError(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return 'intervals.icu rejected the API key. Paste a fresh key from intervals.icu → Settings → Developer.';
  }
  if (status === 429) return 'intervals.icu is rate-limiting us. Try again shortly.';
  if (status >= 500) return 'intervals.icu is having trouble. Try again later.';
  if (err?.code === 'ECONNABORTED') return 'intervals.icu did not respond in time.';
  return err?.response?.data?.error || err?.message || 'Could not reach intervals.icu.';
}

module.exports = {
  SPORT_TO_TYPE,
  externalIdFor,
  startDateLocal,
  verifyKey,
  buildEvent,
  upsertEvent,
  deleteEventByExternalId,
  describeError,
};
