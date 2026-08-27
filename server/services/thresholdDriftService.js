/**
 * How far an athlete's threshold has drifted from the test on file, read off
 * the training they have done since.
 *
 * The per-session view runs in the browser off records the page already holds.
 * This is the other half: sixty sessions is far too much stream data to send to
 * a phone, so the walk happens here and only the plotted numbers go back.
 *
 * Two rules keep it honest:
 *
 *   · Only sessions AFTER the governing test count. A ride from before it
 *     describes a different athlete and would drag the trend toward the past.
 *   · Sessions that cannot be read are cached as unreadable. Interval days and
 *     recovery spins are most of a training week, and re-fetching their streams
 *     on every page load to reach the same "no" is the expensive way to learn
 *     nothing.
 */

'use strict';

const StravaActivity = require('../models/StravaActivity');
const StravaStream = require('../models/StravaStream');
const GarminActivity = require('../models/GarminActivity');
const GarminStream = require('../models/GarminStream');
const FitTraining = require('../models/fitTraining');
const Test = require('../models/test');
const ActivityWeather = require('../models/ActivityWeather');
const ThresholdDriftRead = require('../models/ThresholdDriftRead');
const { channel } = require('../utils/streamChannel');
const { analyseSession, compareToTestCurve, sportKind, testHrSlope } = require('../utils/hrPowerProfile');
const { extractAnchor } = require('../utils/lactateAnchor');

/**
 * Bump when a change to the engine could move a cached number. Rows stamped
 * with an older version are recomputed instead of served.
 */
const ENGINE_VERSION = 2;

/**
 * How many sessions back to walk.
 *
 * Eighty was chosen when the only consumer was a threshold fit that read one
 * session in forty. The season chart reads almost all of them, and on an
 * athlete who trains twice a day eighty sessions is a month — which drew a
 * "season" four points wide. Every read is cached per activity and invalidated
 * only by a new test or a new engine, so the cost of a wider walk is paid once.
 */
const DEFAULT_LIMIT = 250;

// ── Turning three storage shapes into one records array ────────────────────

/**
 * Strava and Garmin both store `{ time, watts, heartrate, velocity_smooth,
 * altitude, distance }`, in either the wrapped or the bare shape — channel()
 * knows both. FIT files already hold per-second records and need nothing.
 */
function recordsFromStreams(streams, startDate) {
  const time = channel(streams, 'time');
  if (!time.length) return [];
  const watts = channel(streams, 'watts');
  const hr = channel(streams, 'heartrate');
  const vel = channel(streams, 'velocity_smooth');
  const alt = channel(streams, 'altitude');
  const dist = channel(streams, 'distance');
  const t0 = new Date(startDate).getTime();
  if (!Number.isFinite(t0)) return [];

  return time.map((t, i) => ({
    timestamp: new Date(t0 + Number(t) * 1000).toISOString(),
    power: watts[i] > 0 ? watts[i] : null,
    heartRate: hr[i] > 0 ? hr[i] : null,
    speed: vel[i] > 0 ? vel[i] : null,
    altitude: alt[i] != null ? alt[i] : null,
    distance: dist[i] != null ? dist[i] : undefined,
  }));
}

// ── Gathering candidate sessions across the three sources ──────────────────

async function gatherSessions(userId, kind, since, limit) {
  const matchesKind = (s) => sportKind(s) === kind;
  const sinceDate = new Date(since);

  const [stravas, garmins, fits] = await Promise.all([
    StravaActivity.find({ userId, startDate: { $gt: sinceDate } })
      .select('stravaId sport name titleManual startDate movingTime elapsedTime')
      .sort({ startDate: -1 }).limit(limit * 3).lean(),
    // startDate, not startTime — startTime exists on GarminActivity, but only
    // inside the lap sub-schema. Querying it silently matched nothing, which
    // dropped Garmin from the walk entirely; for an athlete whose Strava copy
    // carries no heart rate that is the difference between a feature and a
    // blank panel.
    GarminActivity.find({ userId, startDate: { $gt: sinceDate } })
      .select('garminId sport name titleManual startDate')
      .sort({ startDate: -1 }).limit(limit * 3).lean(),
    FitTraining.find({ athleteId: String(userId), timestamp: { $gt: sinceDate } })
      .select('_id sport originalFileName titleManual timestamp')
      .sort({ timestamp: -1 }).limit(limit * 3).lean(),
  ]);

  const all = [
    ...stravas.filter((a) => matchesKind(a.sport)).map((a) => ({
      key: `strava-${a.stravaId}`,
      source: 'strava',
      id: a.stravaId,
      date: a.startDate,
      sport: a.sport,
      title: a.titleManual || a.name || 'Ride',
    })),
    ...garmins.filter((a) => matchesKind(a.sport)).map((a) => ({
      key: `garmin-${a.garminId}`,
      source: 'garmin',
      id: a.garminId,
      date: a.startDate,
      sport: a.sport,
      title: a.titleManual || a.name || 'Activity',
    })),
    ...fits.filter((a) => matchesKind(a.sport)).map((a) => ({
      key: `fit-${a._id}`,
      source: 'fit',
      id: String(a._id),
      date: a.timestamp,
      sport: a.sport,
      title: a.titleManual || a.originalFileName || 'Activity',
    })),
  ];

  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  return dedupeAcrossProviders(all).slice(0, limit);
}

/** Minutes within which two activities of the same sport are the same session. */
const DUPLICATE_WINDOW_MIN = 20;

/**
 * One ride syncs from both Garmin and Strava, and the two copies are not
 * equivalent here: Strava can be missing the heart-rate channel entirely — for
 * privacy settings, or because the upload never carried it — while the Garmin
 * copy of the same session has it at full resolution. Analysing the Strava
 * twin then reports "not enough steady state" for a session that was perfectly
 * readable.
 *
 * So duplicates collapse to one entry that remembers its alternates, and the
 * reader tries them in turn until one yields a trace with heart rate in it.
 * Nothing here assumes which provider is better — only that a copy carrying HR
 * beats a copy that does not.
 */
function dedupeAcrossProviders(sessions) {
  const windowMs = DUPLICATE_WINDOW_MIN * 60000;
  const groups = [];

  for (const s of sessions) {
    const ms = new Date(s.date).getTime();
    const kind = sportKind(s.sport);
    const group = groups.find(
      (g) => g.kind === kind && Math.abs(g.ms - ms) <= windowMs,
    );
    if (group) group.members.push(s);
    else groups.push({ kind, ms, members: [s] });
  }

  return groups.map((g) => {
    const [primary, ...alternates] = g.members;
    return { ...primary, alternates };
  });
}

/**
 * The best trace available for one session: the first copy that actually
 * carries heart rate, falling back to the primary when none of them do (so the
 * cached row still records *why* nothing could be read).
 */
async function recordsWithHeartRate(session, userId) {
  const candidates = [session, ...(session.alternates || [])];
  let fallback = [];
  for (const candidate of candidates) {
    const records = await recordsFor(candidate, userId);
    if (!fallback.length) fallback = records;
    if (records.some((r) => Number(r.heartRate) > 0)) return records;
  }
  return fallback;
}

/** Pull the per-second trace for one session, whichever source it came from. */
async function recordsFor(session, userId) {
  if (session.source === 'strava') {
    const doc = await StravaStream.findOne({ userId, stravaId: session.id }).select('streams').lean();
    return doc ? recordsFromStreams(doc.streams, session.date) : [];
  }
  if (session.source === 'garmin') {
    const doc = await GarminStream.findOne({ userId, garminId: String(session.id) }).select('streams').lean();
    return doc ? recordsFromStreams(doc.streams, session.date) : [];
  }
  const doc = await FitTraining.findById(session.id).select('records').lean();
  return Array.isArray(doc?.records) ? doc.records : [];
}

// ── The walk ───────────────────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.sport   'bike' | 'run'
 * @param {number} [o.limit]
 * @returns {Promise<{test:object|null, reads:Array, skipped:object}>}
 */
async function readSessionsSinceTest({ userId, sport, limit = DEFAULT_LIMIT }) {
  const kind = sportKind(sport);
  if (kind !== 'bike' && kind !== 'run') {
    return { test: null, reads: [], skipped: { reason: 'sport-unsupported' } };
  }

  // The governing test: the most recent one for this sport. Everything is read
  // against it, and a newer test invalidates every cached read after its date.
  const tests = await Test.find({ athleteId: String(userId) }).sort({ date: -1 }).lean();
  const sportTests = tests.filter((t) => sportKind(t.sport) === kind);
  const test = sportTests[0] || null;
  if (!test) return { test: null, reads: [], skipped: { reason: 'no-test' } };

  const anchor = extractAnchor(test);
  if (!anchor || !(anchor.lt2 > 0)) return { test, reads: [], skipped: { reason: 'no-lt2' } };
  if (!(Number(anchor.lt2Hr) > 40)) return { test, reads: [], skipped: { reason: 'no-lt2-hr' } };

  const slopeFit = testHrSlope(anchor);
  const sessions = await gatherSessions(userId, kind, test.date, limit);
  if (!sessions.length) return { test, reads: [], skipped: { reason: 'no-sessions-since-test' } };

  const testStamp = {
    testId: String(test._id),
    testUpdatedAt: test.updatedAt || test.date,
    engineVersion: ENGINE_VERSION,
  };

  const cached = await ThresholdDriftRead.find({
    userId,
    activityKey: { $in: sessions.map((s) => s.key) },
  }).lean();
  const cacheByKey = new Map(cached.map((c) => [c.activityKey, c]));

  const isFresh = (row) => row
    && row.engineVersion === testStamp.engineVersion
    && String(row.testId) === testStamp.testId
    && new Date(row.testUpdatedAt).getTime() === new Date(testStamp.testUpdatedAt).getTime();

  const reads = [];
  /** Every session that could be placed against the test, however easy. */
  const compared = [];
  const unreadable = {};

  for (const session of sessions) {
    const hit = cacheByKey.get(session.key);
    if (isFresh(hit)) {
      if (hit.ok) reads.push({ ...hit, date: hit.activityDate });
      else unreadable[hit.reason] = (unreadable[hit.reason] || 0) + 1;
      if (hit.blocks?.length) {
        compared.push({
          date: hit.activityDate, blocks: hit.blocks,
          id: hit.activityKey, title: hit.title, sport: hit.sport,
        });
      }
      continue;
    }

    const records = await recordsWithHeartRate(session, userId);
    let result = { ok: false, reason: 'no-usable-stream' };
    let tempC = null;

    if (records.length > 300) {
      const weather = await ActivityWeather.findOne({ userId, activityKey: session.key })
        .select('tempC').lean();
      tempC = Number.isFinite(weather?.tempC) ? weather.tempC : null;
      result = analyseSession({ records, sport: session.sport, anchor, tempC, slopeFit });
    }

    // Deliberately outside the `ok` check. The threshold fit refuses most of a
    // training week — intervals, recovery spins, anything held below LT1 — but
    // those sessions still measured a heart rate at an intensity the test
    // covered, and that is all the projection needs.
    const comparison = compareToTestCurve(result.cloud, anchor, {
      tempAdjustBpm: result.tempAdjustBpm || 0,
    });

    const row = {
      userId,
      activityKey: session.key,
      activityDate: session.date,
      sport: session.sport,
      title: session.title,
      ...testStamp,
      ok: !!result.ok,
      reason: result.ok ? null : result.reason,
      deltaDemand: result.deltaDemand,
      deltaPct: result.deltaPct,
      deltaHr: result.deltaHr,
      hrAtLt2: result.hrAtLt2,
      thresholdAtLt2Hr: result.thresholdAtLt2Hr,
      lt2Demand: result.lt2Demand,
      driftBpmPerHour: result.fit?.drift,
      decoupling: Number.isFinite(result.decoupling) ? result.decoupling : null,
      confidence: result.confidence,
      blocks: (comparison?.blocks || []).map((b) => ({
        demand: b.demand, hr: b.hr, testHr: b.testHr, deltaHr: b.deltaHr, sec: b.sec,
      })),
      tempC,
      tempAdjustBpm: result.tempAdjustBpm,
      pointCount: result.points?.length || result.pointsFound || 0,
    };

    await ThresholdDriftRead.updateOne(
      { userId, activityKey: session.key },
      { $set: row },
      { upsert: true },
    );

    if (row.ok) reads.push({ ...row, date: session.date });
    else unreadable[row.reason] = (unreadable[row.reason] || 0) + 1;
    if (row.blocks.length) {
      compared.push({
        date: session.date, blocks: row.blocks,
        id: session.key, title: session.title, sport: session.sport,
      });
    }
  }

  reads.sort((a, b) => new Date(a.date) - new Date(b.date));
  compared.sort((a, b) => new Date(a.date) - new Date(b.date));
  // Every test of this sport, oldest first — the measured points the estimated
  // line is drawn between.
  const history = [...sportTests].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { test, anchor, reads, compared, unreadable, sportTests: history, considered: sessions.length };
}

module.exports = {
  ENGINE_VERSION,
  readSessionsSinceTest,
  recordsFromStreams,
};
