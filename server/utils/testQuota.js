/**
 * Shared test counting for the free-tier quota gate. The "1 test on free"
 * limit must span every test-like model, otherwise a free user could create
 * one of each type (graded step test, VLaMax, CP) and bypass the cap.
 *
 * Excludes FieldLactateMeasurement (a single spot value, not a graded test)
 * and LactateSession (the live guided session, gated separately).
 */
const Test = require('../models/test');

function loadModel(path) {
  try { return require(path); } catch (_) { return null; }
}
const VLamaxTest = loadModel('../models/vlamaxTest');
const CPTest = loadModel('../models/cpTest');

/** Total graded tests an athlete owns across all test models. */
async function countTestsForAthlete(athleteId) {
  const id = String(athleteId);
  const counts = await Promise.all([
    Test.countDocuments({ athleteId: id }).catch(() => 0),
    VLamaxTest ? VLamaxTest.countDocuments({ athleteId: id }).catch(() => 0) : 0,
    CPTest ? CPTest.countDocuments({ athleteId: id }).catch(() => 0) : 0,
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * Resolve whose quota a create counts against: a coach creating for an athlete
 * counts against that athlete; otherwise the requester's own tests.
 */
function targetAthleteId(req, user) {
  const role = String(user?.role || '').toLowerCase();
  const bodyAthleteId = req.body?.athleteId;
  const isCoachLike = ['coach', 'tester', 'testing'].includes(role) || user?.admin === true;
  if (isCoachLike && bodyAthleteId && String(bodyAthleteId) !== String(user._id)) {
    return String(bodyAthleteId);
  }
  return String(user._id);
}

/** requireQuotaSlot('tests', countFn) helper. */
async function countCurrentTests(req, user) {
  return countTestsForAthlete(targetAthleteId(req, user));
}

module.exports = { countTestsForAthlete, targetAthleteId, countCurrentTests };
