/**
 * lactateBenchmarkService
 * ───────────────────────
 * Population benchmark distributions of LT1/LT2 built from REAL lactate tests
 * (not the manually-set profile zones the old /population-stats used).
 *
 * Sampling rules:
 *  - one sample per athlete per sport — their most recent test that yields a
 *    valid threshold pair (power users with 15 tests must not skew the curve)
 *  - thresholds come from the shared server-side calculateThresholds(), which
 *    already applies coach thresholdOverrides over the auto-calculation
 *  - recovery rows are excluded, tests need ≥4 work stages
 *  - implausible results are dropped (see PLAUSIBLE below), including any test
 *    whose measured lactate at its own LT1/LT2 says they are not thresholds
 *  - athletes with user.excludeFromBenchmarks are left out of the population
 *    (they still see their own values via getAthleteValues)
 *
 * The snapshot over all tests is cached in-memory with a TTL; call
 * invalidateBenchmarkCache() after test mutations for a fresh rebuild.
 */

const mongoose = require('mongoose');
const Test = require('../models/test');
const User = require('../models/UserModel');
const { calculateThresholds } = require('../utils/lactateThresholds');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const MIN_SAMPLE_SIZE = 10; // below this a bucket returns insufficient:true
const HISTOGRAM_BINS = 20;

// ─── sport & load normalization ──────────────────────────────────────────────

function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycl') || v.includes('ride')) return 'bike';
  if (v.includes('run')) return 'run';
  if (v.includes('swim')) return 'swim';
  return null;
}

/**
 * Older run/swim tests store loads either as pace seconds (/km, /100m) or as
 * speed km/h — sometimes without a reliable inputMode flag. Port of the client
 * getEffectiveLactateInputMode heuristic: detect speed-mode loads and convert
 * them to pace seconds, which is what calculateThresholds expects.
 */
function normalizeLoadsToPace(test, sport) {
  if (sport === 'bike') return test;

  const loads = (test.results || [])
    .map((r) => Number(String(r?.power ?? '').replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!loads.length) return test;

  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const maxPlausibleKmh = sport === 'swim' ? 14 : 48;
  const looksLikeSpeed = sport === 'swim'
    ? (min >= 1 && max <= maxPlausibleKmh)
    : (min >= 3 && max <= maxPlausibleKmh);
  const looksLikePace = sport === 'swim' ? min >= 45 : min >= 120;

  const raw = String(test.inputMode || '').toLowerCase();
  const isSpeed = raw === 'speed'
    ? !loads.some((v) => v > maxPlausibleKmh)
    : (looksLikeSpeed && !looksLikePace);
  if (!isSpeed) return test;

  const toPace = sport === 'swim'
    ? (kmh) => 360 / kmh // sec per 100 m
    : (kmh) => 3600 / kmh; // sec per km

  return {
    ...test,
    results: (test.results || []).map((r) => {
      const v = Number(String(r?.power ?? '').replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? { ...r, power: toPace(v) } : r;
    }),
  };
}

// ─── entry extraction ────────────────────────────────────────────────────────

// [min, max] windows per sport; anything outside is a bad test or bad units.
// bike in watts; run in sec/km; swim in sec/100m. For pace sports LT1 is the
// SLOWER pace, i.e. the larger number.
const PLAUSIBLE = {
  bike: { lt1: [50, 480], lt2: [90, 550] },
  run: { lt1: [180, 720], lt2: [150, 540] },
  swim: { lt1: [58, 240], lt2: [55, 200] },
};

/**
 * @returns {null | { lt1, lt2, lt1Wkg, lt2Wkg, ratio, testId, testDate, testWeight }}
 * ratio is always "LT1 intensity as a fraction of LT2 intensity" (< 1):
 * watts lt1/lt2 for bike, pace lt2/lt1 for run & swim (speed ∝ 1/pace).
 */
/**
 * Plausible measured lactate at each threshold.
 *
 * Deliberately wide — real curves vary and a baseline can sit high — so this
 * rejects only what no protocol would call a threshold, not everything outside
 * a textbook.
 */
const LT1_LACTATE_RANGE = [0.7, 3.2];
const LT2_LACTATE_RANGE = [2.5, 6.5];

/**
 * Measured lactate at an intensity, interpolated between the stages either
 * side. Raw values on purpose: the question is what the athlete's blood did at
 * that intensity, not what a fitted curve says it should have done.
 */
function measuredLactateAt(rows, sport) {
  const isPace = sport !== 'bike';
  const pairs = (rows || [])
    .map((r) => ({ p: Number(r.power), l: Number(r.lactate) }))
    .filter((x) => Number.isFinite(x.p) && x.p > 0 && Number.isFinite(x.l) && x.l > 0)
    // Ascending in effort: watts up, pace down.
    .sort((a, b) => (isPace ? b.p - a.p : a.p - b.p));

  return (target) => {
    if (!Number.isFinite(target) || pairs.length < 2) return null;
    for (let i = 0; i < pairs.length - 1; i += 1) {
      const a = pairs[i];
      const b = pairs[i + 1];
      const lo = Math.min(a.p, b.p);
      const hi = Math.max(a.p, b.p);
      if (target >= lo && target <= hi) {
        if (a.p === b.p) return (a.l + b.l) / 2;
        return a.l + ((b.l - a.l) * (target - a.p)) / (b.p - a.p);
      }
    }
    return null; // outside the tested range — not this filter's business
  };
}

function extractEntry(testRaw, sport) {
  const workRows = (testRaw.results || []).filter(
    (r) => (r?.intervalType || 'work') !== 'recovery'
  );
  if (workRows.length < 4) return null;

  const normalized = normalizeLoadsToPace(
    { ...testRaw, sport, results: workRows },
    sport
  );

  let thr;
  try {
    thr = calculateThresholds(normalized);
  } catch {
    return null;
  }

  const lt1 = Number(thr?.LTP1);
  const lt2 = Number(thr?.LTP2);
  if (!Number.isFinite(lt1) || lt1 <= 0 || !Number.isFinite(lt2) || lt2 <= 0) return null;

  const lim = PLAUSIBLE[sport];
  if (lt1 < lim.lt1[0] || lt1 > lim.lt1[1]) return null;
  if (lt2 < lim.lt2[0] || lt2 > lim.lt2[1]) return null;

  const isPace = sport !== 'bike';
  if (isPace ? lt1 <= lt2 : lt1 >= lt2) return null; // thresholds out of order

  // The measured lactate at each threshold has to agree that it IS one.
  //
  // The order and ratio checks above catch a threshold pair that is obviously
  // broken, but not one that is merely in the wrong place: on one real test the
  // server put LT2 at a stage measuring 1.5 mmol — an easy aerobic effort — and
  // it passed every check here, because 1.5 mmol says nothing about the gap
  // between two numbers. It went into the population as somebody's anaerobic
  // threshold.
  //
  // That matters more here than anywhere else in the app. A benchmark is the
  // one place an athlete's own value is judged against other people's, so a
  // wrong entry does not just misinform its owner — it moves the curve everyone
  // is measured against. Excluding a test we cannot vouch for costs one sample;
  // including it costs the distribution.
  const laAt = measuredLactateAt(workRows, sport);
  const lt1La = laAt(lt1);
  const lt2La = laAt(lt2);
  if (lt1La != null && (lt1La < LT1_LACTATE_RANGE[0] || lt1La > LT1_LACTATE_RANGE[1])) return null;
  if (lt2La != null && (lt2La < LT2_LACTATE_RANGE[0] || lt2La > LT2_LACTATE_RANGE[1])) return null;

  const ratio = isPace ? lt2 / lt1 : lt1 / lt2;
  if (!Number.isFinite(ratio) || ratio < 0.5 || ratio > 0.99) return null;

  const testWeight = Number(testRaw.weight) > 0 ? Number(testRaw.weight) : null;

  return {
    lt1,
    lt2,
    ratio,
    testWeight,
    testId: String(testRaw._id),
    testDate: testRaw.date || null,
  };
}

// ─── snapshot build & cache ──────────────────────────────────────────────────

let cache = { snapshot: null, builtAt: 0, building: null };

async function buildSnapshot() {
  const tests = await Test.find({})
    .select('athleteId sport date results baseLactate weight thresholdOverrides inputMode')
    .lean();

  // group tests per athlete+sport, newest first
  const grouped = new Map();
  for (const t of tests) {
    const sport = normSport(t.sport);
    if (!sport || !t.athleteId) continue;
    const key = `${t.athleteId}|${sport}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  const athleteIds = [...new Set(tests.map((t) => String(t.athleteId)))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  const users = await User.find({ _id: { $in: athleteIds } })
    .select('gender weight excludeFromBenchmarks')
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const sports = { bike: [], run: [], swim: [] };

  for (const [key, list] of grouped) {
    const [athleteId, sport] = key.split('|');
    const user = userById.get(athleteId);
    if (user?.excludeFromBenchmarks === true) continue;

    list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    let entry = null;
    for (const t of list) {
      entry = extractEntry(t, sport);
      if (entry) break; // most recent VALID test wins
    }
    if (!entry) continue;

    const weight = entry.testWeight || (Number(user?.weight) > 0 ? Number(user.weight) : null);
    sports[sport].push({
      athleteId,
      gender: user?.gender === 'female' ? 'female' : user?.gender === 'male' ? 'male' : null,
      lt1: entry.lt1,
      lt2: entry.lt2,
      ratio: entry.ratio,
      lt1Wkg: sport === 'bike' && weight ? entry.lt1 / weight : null,
      lt2Wkg: sport === 'bike' && weight ? entry.lt2 / weight : null,
    });
  }

  return { builtAt: new Date().toISOString(), totalTests: tests.length, sports };
}

async function getSnapshot() {
  const fresh = cache.snapshot && Date.now() - cache.builtAt < CACHE_TTL_MS;
  if (fresh) return cache.snapshot;
  if (!cache.building) {
    cache.building = buildSnapshot()
      .then((snap) => {
        cache = { snapshot: snap, builtAt: Date.now(), building: null };
        return snap;
      })
      .catch((err) => {
        cache.building = null;
        throw err;
      });
  }
  return cache.building;
}

function invalidateBenchmarkCache() {
  cache = { snapshot: null, builtAt: 0, building: null };
}

// ─── stats ───────────────────────────────────────────────────────────────────

/** Same output shape the old zones-based endpoint used, so the UI keeps working. */
function calcStats(values) {
  const vals = (values || []).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;

  const sorted = [...vals].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / count;
  const sd = Math.sqrt(
    sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count
  );

  const pct = (p) => {
    const idx = (p / 100) * (count - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const w = idx - lo;
    return lo === hi ? sorted[lo] : sorted[lo] * (1 - w) + sorted[hi] * w;
  };

  const min = sorted[0];
  const max = sorted[count - 1];
  const binWidth = (max - min) / HISTOGRAM_BINS || 1;
  const distribution = Array(HISTOGRAM_BINS).fill(0);
  for (const v of sorted) {
    distribution[Math.min(Math.floor((v - min) / binWidth), HISTOGRAM_BINS - 1)]++;
  }

  return {
    count,
    mean: Number(mean.toFixed(2)),
    median: Number(pct(50).toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    p25: Number(pct(25).toFixed(2)),
    p75: Number(pct(75).toFixed(2)),
    distribution: distribution.map((c) => Number(((c / count) * 100).toFixed(1))),
  };
}

/**
 * @param {{sport: 'bike'|'run'|'swim', gender: 'male'|'female'|'all'}} opts
 */
async function getPopulationStats({ sport, gender = 'all' }) {
  const snap = await getSnapshot();
  let entries = snap.sports[sport] || [];
  if (gender === 'male' || gender === 'female') {
    entries = entries.filter((e) => e.gender === gender);
  }

  const sampleSize = entries.length;
  if (sampleSize < MIN_SAMPLE_SIZE) {
    return { insufficient: true, sampleSize, builtAt: snap.builtAt };
  }

  const out = {
    sampleSize,
    builtAt: snap.builtAt,
    lt1: calcStats(entries.map((e) => e.lt1)),
    lt2: calcStats(entries.map((e) => e.lt2)),
    lt1Lt2Ratio: calcStats(entries.map((e) => e.ratio)),
  };
  if (sport === 'bike') {
    out.lt1Wkg = calcStats(entries.map((e) => e.lt1Wkg).filter((v) => v != null));
    out.lt2Wkg = calcStats(entries.map((e) => e.lt2Wkg).filter((v) => v != null));
  }
  return out;
}

/**
 * The athlete's own values from the SAME pipeline the population uses, so the
 * "You" marker is guaranteed consistent with the distribution. Computed fresh
 * (not from the snapshot) so a just-saved test shows up immediately, and it
 * works even for athletes who opted out of the population.
 */
async function getAthleteValues(athleteId, sport) {
  const tests = await Test.find({ athleteId: String(athleteId), sport })
    .select('athleteId sport date results baseLactate weight thresholdOverrides inputMode')
    .sort({ date: -1 })
    .limit(10)
    .lean();

  let entry = null;
  for (const t of tests) {
    entry = extractEntry(t, normSport(t.sport) || sport);
    if (entry) break;
  }
  if (!entry) return null;

  let weight = entry.testWeight;
  if (!weight && mongoose.Types.ObjectId.isValid(String(athleteId))) {
    const user = await User.findById(athleteId).select('weight').lean();
    if (Number(user?.weight) > 0) weight = Number(user.weight);
  }

  return {
    sport,
    lt1: entry.lt1,
    lt2: entry.lt2,
    ratio: entry.ratio,
    lt1Wkg: sport === 'bike' && weight ? entry.lt1 / weight : null,
    lt2Wkg: sport === 'bike' && weight ? entry.lt2 / weight : null,
    testId: entry.testId,
    testDate: entry.testDate,
  };
}

module.exports = {
  getPopulationStats,
  getAthleteValues,
  invalidateBenchmarkCache,
  buildSnapshot,
  calcStats,
  MIN_SAMPLE_SIZE,
  _internals: { extractEntry, normalizeLoadsToPace, normSport },
};
