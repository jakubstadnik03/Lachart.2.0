/**
 * lactateCurvePredictor
 * ─────────────────────
 * Sport-science engine that, given an athlete's recent training history
 * (Strava + FIT + manual Training docs over the last 90 days), produces:
 *
 *   1. A power / pace **profile** — best efforts at 5 s, 30 s, 1, 5, 8,
 *      12, 20, 30, 60 minutes (cycling) or 1, 5, 10, 21.1, 42.2 km (run).
 *   2. A **Critical Power** estimate via the 2-parameter hyperbolic
 *      model (P = CP + W'/t).
 *   3. **Training distribution** — % of time in each HR/power zone over
 *      the last 6 weeks. Used to classify the athlete as polarised,
 *      pyramidal, or threshold-heavy.
 *   4. **Fitness state** — CTL (42-d), ATL (7-d), TSB at "now".
 *   5. **Predicted LT1 / LT2** with a confidence score (0-100).
 *   6. A suggested **incremental test protocol** — start power, step
 *      size, stage duration, number of stages — calibrated to the
 *      athlete's predicted thresholds so the test produces a clean
 *      curve (≥ 2 stages below LT1, ≥ 2 stages above LT2).
 *   7. A **predicted lactate curve** — expected lactate value at each
 *      protocol stage, drawn from a piecewise model (flat → gradual
 *      rise to LT1 → steeper to LT2 → exponential post-LT2).
 *
 * When the predictor is called with a `measured` test attached, it also
 * produces an **interpretation** block — measured vs predicted LT1/LT2
 * with deviation analysis (fresh vs fatigued vs taper-peaked).
 *
 * Math references (all classical, no LaChart-specific invention):
 *   • Coggan AR. Training and Racing with a Power Meter, 3rd ed.
 *   • Monod H, Scherrer J. The work capacity of a synergic muscular
 *     group. Ergonomics. 1965 (Critical Power, W').
 *   • Seiler S. What is best practice for training intensity and
 *     duration distribution? Int J Sports Physiol Perform. 2010 (zones).
 *   • Banister EW. Modeling elite athletic performance. 1991 (CTL/ATL).
 */

// ─── Domain constants ──────────────────────────────────────────────────────

// Cycling best-effort durations in seconds — the points the CP model fits.
const CYCLING_DURATIONS = [5, 30, 60, 5 * 60, 8 * 60, 12 * 60, 20 * 60, 30 * 60, 60 * 60];

// Running best-effort distances in meters.
const RUNNING_DISTANCES = [1000, 5000, 10000, 21097, 42195];

// Polarisation thresholds (Seiler).
const POLARISED_LOW_INTENSITY_MIN = 0.80; // ≥80 % low-intensity = polarised
const PYRAMIDAL_LOW_INTENSITY_MIN = 0.60; // 60–80 % = pyramidal; <60 % = threshold-heavy

// LT1 / LT2 ratio by training distribution. Endurance-adapted athletes
// (high polarisation, deep aerobic base) carry LT1 closer to LT2;
// glycolytic / sprint-focused athletes carry it lower.
const LT1_LT2_RATIO_POLARISED = 0.84;
const LT1_LT2_RATIO_PYRAMIDAL = 0.80;
const LT1_LT2_RATIO_THRESHOLD = 0.76;

// FTP ≈ 0.95 × best 20-min effort (Allen-Coggan).
const FTP_FROM_20MIN = 0.95;

// LT2 ≈ 0.93 × FTP for most athletes (Coggan's MLSS approximation).
const LT2_FROM_FTP = 0.93;

// CTL / ATL exponential time constants in days (Banister).
const TAU_CTL = 42;
const TAU_ATL = 7;

// Stage-duration correction factor: a 4-min stage produces ~5–8 % higher
// lactate at the same power than a 6-min stage. Default protocol is 4 min.
const DEFAULT_STAGE_DURATION_S = 4 * 60;

// ─── Pure math helpers ─────────────────────────────────────────────────────

function safeNumber(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function mean(arr) {
  const v = arr.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Critical Power 2-parameter model: P = CP + W'/t.
 *
 * Given best-effort power for at least two durations, returns
 * { cp, wPrime, points } where points are the residuals — used for the
 * confidence score (high residual = low quality fit).
 *
 * Returns null with fewer than 2 valid points, or when the model would
 * produce nonsensical values (negative CP, huge W').
 */
function fitCriticalPower(bestEfforts) {
  const pts = Object.entries(bestEfforts)
    .map(([dur, power]) => ({ t: Number(dur), p: Number(power) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0 && p.t >= 60 && p.t <= 3600);
  if (pts.length < 2) return null;
  // Use the linear form: power × time = CP × time + W'. Least squares.
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const { t, p } of pts) {
    const x = t; // time
    const y = p * t; // work done
    sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
  }
  const n = pts.length;
  const cp = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const wPrime = (sumY - cp * sumX) / n;
  if (!Number.isFinite(cp) || !Number.isFinite(wPrime) || cp <= 0 || cp > 800 || wPrime <= 0 || wPrime > 60000) {
    return null;
  }
  // Compute residual SD as % of CP — quality indicator.
  const residuals = pts.map(({ t, p }) => p - (cp + wPrime / t));
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  return { cp: Math.round(cp), wPrime: Math.round(wPrime), rmsePct: rmse / cp * 100, pointCount: pts.length };
}

// ─── Step 1: Pull + normalise activities ───────────────────────────────────

/**
 * Normalise mixed Strava / FIT / Training docs into a common activity shape.
 * Each output item has: { date, sport, durationS, distanceM, avgPower,
 * normalizedPower, maxPower, avgHr, maxHr, tss, source }.
 */
function normalizeActivities({ stravaActs = [], fitActs = [], trainingActs = [], userProfile = null }) {
  const out = [];
  const ftpProfile = userProfile?.powerZones?.cycling?.lt2 || userProfile?.powerZones?.cycling?.ftp || userProfile?.ftp || 0;
  const maxHr = userProfile?.maxHr || userProfile?.maxHeartRate || 0;
  const restHr = userProfile?.restingHr || 60;

  const tssEstimate = (durS, np, avgHr, sport) => {
    if (durS <= 0) return 0;
    if ((sport === 'bike' || sport.includes('ride') || sport.includes('cycle')) && np > 0 && ftpProfile > 0) {
      return (durS * np * np) / (ftpProfile * ftpProfile * 3600) * 100;
    }
    if (avgHr > 0 && maxHr > restHr) {
      const hrr = Math.max(0, (avgHr - restHr) / (maxHr - restHr));
      return (durS / 3600) * hrr * hrr * 100;
    }
    return 0;
  };

  for (const a of stravaActs) {
    const date = a.startDate ? new Date(a.startDate) : null;
    if (!date) continue;
    const sport = String(a.sport || '').toLowerCase();
    const durS = Number(a.elapsedTime || a.movingTime || 0);
    const dist = Number(a.distance || 0);
    const avgPower = Number(a.averagePower || 0);
    const np = Number(a.weightedAveragePower || avgPower || 0);
    const avgHr = Number(a.averageHeartRate || 0);
    out.push({
      date, sport, durationS: durS, distanceM: dist,
      avgPower, normalizedPower: np, maxPower: 0,
      avgHr, maxHr: 0,
      tss: tssEstimate(durS, np, avgHr, sport),
      source: 'strava',
    });
  }
  for (const a of fitActs) {
    const date = a.startTime ? new Date(a.startTime) : null;
    if (!date) continue;
    const sport = String(a.sport || '').toLowerCase();
    const durS = Number(a.totalElapsedTime || a.totalTimerTime || 0);
    const dist = Number(a.totalDistance || 0);
    const avgPower = Number(a.avgPower || 0);
    const np = Number(a.normalizedPower || avgPower || 0);
    const avgHr = Number(a.avgHeartRate || 0);
    out.push({
      date, sport, durationS: durS, distanceM: dist,
      avgPower, normalizedPower: np, maxPower: Number(a.maxPower || 0),
      avgHr, maxHr: Number(a.maxHeartRate || 0),
      tss: Number(a.trainingStressScore || 0) || tssEstimate(durS, np, avgHr, sport),
      source: 'fit',
    });
  }
  for (const t of trainingActs) {
    const date = t.date ? new Date(t.date) : null;
    if (!date) continue;
    out.push({
      date, sport: String(t.sport || '').toLowerCase(),
      durationS: Number(t.duration || 0), distanceM: Number(t.distance || 0),
      avgPower: 0, normalizedPower: 0, maxPower: 0,
      avgHr: 0, maxHr: 0, tss: 0, source: 'training',
    });
  }
  return out.sort((a, b) => a.date - b.date);
}

// ─── Step 2: Best-effort power / pace profile ──────────────────────────────

/**
 * Approximate best efforts for each canonical duration from average-power
 * fields on the activity records. This is a coarse approximation — true
 * best efforts would require parsing 1 Hz power streams which we don't
 * always have. The avg-power approach systematically UNDER-estimates
 * short efforts (because activity averages dilute peak intervals) and
 * is accurate for ≥ 20 min efforts.
 */
function extractCyclingPowerProfile(activities) {
  const cyclingActs = activities.filter((a) => {
    const s = a.sport;
    return s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling';
  });

  const profile = {};
  for (const dur of CYCLING_DURATIONS) {
    // Pick the highest power across activities that lasted at least `dur`.
    // For NP we use weighted average; for shorter durations (5s, 30s, 1m)
    // there's no good proxy in summary data — fall back to maxPower / avgPower.
    let bestPower = 0;
    for (const a of cyclingActs) {
      if (a.durationS < dur) continue;
      // For < 5min, prefer maxPower if recorded; otherwise avg×1.15 as a
      // very loose proxy. For ≥ 5 min, NP is the better estimator.
      const candidate = dur < 5 * 60
        ? (a.maxPower > 0 ? a.maxPower : a.avgPower * 1.15)
        : (a.normalizedPower > 0 ? a.normalizedPower : a.avgPower);
      if (candidate > bestPower) bestPower = candidate;
    }
    if (bestPower > 0) profile[dur] = Math.round(bestPower);
  }
  return profile;
}

function extractRunningPaceProfile(activities) {
  const runActs = activities.filter((a) => a.sport.includes('run') || a.sport === 'running');

  const profile = {};
  for (const targetDist of RUNNING_DISTANCES) {
    let bestPaceSec = Infinity;
    for (const a of runActs) {
      if (a.distanceM < targetDist || a.durationS <= 0) continue;
      // sec/km extrapolated linearly. Crude — better would be the actual
      // first N km of each activity, but we only have summaries.
      const paceSecPerKm = (a.durationS / a.distanceM) * 1000;
      if (paceSecPerKm < bestPaceSec) bestPaceSec = paceSecPerKm;
    }
    if (Number.isFinite(bestPaceSec)) profile[targetDist] = Math.round(bestPaceSec);
  }
  return profile;
}

// ─── Step 3: Training distribution + fitness state ─────────────────────────

/**
 * Compute the share of TIME spent in each of 5 intensity zones over a
 * window. We use heart-rate fraction-of-max if power isn't broadly
 * available — gives consistent results across mixed power/non-power
 * activities.
 *
 * Returns { z1, z2, z3, z4, z5, totalSec, polarisation }.
 *   polarisation = 'polarised' | 'pyramidal' | 'threshold-heavy'
 */
function computeTrainingDistribution(activities, userProfile) {
  const maxHr = userProfile?.maxHr || userProfile?.maxHeartRate || 0;
  const restHr = userProfile?.restingHr || 60;

  // 5-zone model based on %HRmax (or HR reserve if both maxHr+restHr known).
  // Z1: < 75 %, Z2: 75-85 %, Z3: 85-90 %, Z4: 90-95 %, Z5: ≥ 95 %.
  // These are coarse buckets; finer zones (Coggan 7-zone) need power data
  // we don't reliably have across mixed Strava/FIT/manual sources.
  const zones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let totalSec = 0;
  for (const a of activities) {
    if (!a.durationS || !a.avgHr || !maxHr) continue;
    const frac = a.avgHr / maxHr;
    totalSec += a.durationS;
    if (frac < 0.75) zones.z1 += a.durationS;
    else if (frac < 0.85) zones.z2 += a.durationS;
    else if (frac < 0.90) zones.z3 += a.durationS;
    else if (frac < 0.95) zones.z4 += a.durationS;
    else zones.z5 += a.durationS;
  }
  if (totalSec === 0) return null;
  const lowI = (zones.z1 + zones.z2) / totalSec;
  let polarisation;
  if (lowI >= POLARISED_LOW_INTENSITY_MIN) polarisation = 'polarised';
  else if (lowI >= PYRAMIDAL_LOW_INTENSITY_MIN) polarisation = 'pyramidal';
  else polarisation = 'threshold-heavy';
  return {
    z1Pct: zones.z1 / totalSec * 100,
    z2Pct: zones.z2 / totalSec * 100,
    z3Pct: zones.z3 / totalSec * 100,
    z4Pct: zones.z4 / totalSec * 100,
    z5Pct: zones.z5 / totalSec * 100,
    totalHours: totalSec / 3600,
    polarisation,
  };
}

/**
 * CTL/ATL/TSB at a reference date (default: now).
 * Standard Banister model: exponentially-weighted moving averages of
 * daily TSS, with time constants 42 d (CTL) and 7 d (ATL).
 */
function computeFitnessState(activities, referenceDate = new Date()) {
  // Bucket TSS per day for the last 90 days.
  const byDay = new Map();
  for (const a of activities) {
    if (!a.date || !a.tss) continue;
    const key = a.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + a.tss);
  }
  // Walk days from 90 d ago to reference date.
  const days = [];
  const start = new Date(referenceDate);
  start.setUTCDate(start.getUTCDate() - 90);
  for (let d = new Date(start); d <= referenceDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, tss: byDay.get(key) || 0 });
  }
  let ctl = 0, atl = 0;
  for (const d of days) {
    ctl = ctl + (d.tss - ctl) * (1 - Math.exp(-1 / TAU_CTL));
    atl = atl + (d.tss - atl) * (1 - Math.exp(-1 / TAU_ATL));
  }
  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
  };
}

// ─── Step 4: LT1 / LT2 prediction ──────────────────────────────────────────

/**
 * Predict LT1 + LT2 power for a cyclist.
 *
 * Strategy: pick the highest reasonable LT2 estimate from a few methods
 * (best 20-min × 0.93, CP × 0.95, prior test adjusted by current
 * fitness trend), then derive LT1 from LT2 × training-polarisation
 * factor. Each input contributes a confidence point; the overall
 * confidence is the sum, clipped at 100.
 */
function predictBikeThresholds({ powerProfile, cp, distribution, priorTest, fitnessState, userFtp }) {
  const candidates = [];
  const confidenceBoosters = [];

  // (a) Best 20-min × 0.93 (Allen-Coggan derivation of LT2 from FTP).
  if (powerProfile[20 * 60]) {
    const ftp = powerProfile[20 * 60] * FTP_FROM_20MIN;
    const lt2 = ftp * LT2_FROM_FTP;
    candidates.push({ source: 'best-20min', lt2, weight: 0.4 });
    confidenceBoosters.push({ label: '20-min best effort available', points: 20 });
  }

  // (b) Critical Power × 0.95.
  if (cp?.cp) {
    candidates.push({ source: 'critical-power', lt2: cp.cp * 0.95, weight: 0.3 });
    const fitPoints = cp.rmsePct < 5 ? 20 : cp.rmsePct < 10 ? 12 : 6;
    confidenceBoosters.push({ label: `CP model fits ${cp.pointCount} points (RMSE ${cp.rmsePct.toFixed(1)} %)`, points: fitPoints });
  }

  // (c) User-set FTP × 0.93.
  if (userFtp && userFtp > 0) {
    candidates.push({ source: 'user-ftp', lt2: userFtp * LT2_FROM_FTP, weight: 0.25 });
    confidenceBoosters.push({ label: 'FTP set in athlete profile', points: 10 });
  }

  // (d) Prior test LT2, adjusted by fitness trend.
  // If the prior test is recent (< 8 weeks), trust it heavily; further out,
  // adjust by relative CTL change (rough proxy for fitness shift).
  if (priorTest?.lt2Power) {
    const monthsAgo = priorTest?.date ? (Date.now() - new Date(priorTest.date).getTime()) / (30 * 24 * 60 * 60 * 1000) : 12;
    const recency = clamp(1 - monthsAgo / 6, 0.1, 1); // full weight if same month, decays to 0.1 at 6 months
    const ctlAdjustment = priorTest?.ctlAtTest && fitnessState?.ctl
      ? clamp(fitnessState.ctl / priorTest.ctlAtTest, 0.85, 1.15)
      : 1;
    candidates.push({
      source: 'prior-test',
      lt2: priorTest.lt2Power * ctlAdjustment,
      weight: 0.5 * recency,
    });
    confidenceBoosters.push({ label: `Prior test ${monthsAgo.toFixed(1)} months ago, CTL-adjusted`, points: Math.round(30 * recency) });
  }

  if (candidates.length === 0) {
    return { lt1: null, lt2: null, confidence: 0, sources: [], notes: ['No usable training data — need a power meter or HR data.'] };
  }

  // Weighted average of candidates.
  const wSum = candidates.reduce((s, c) => s + c.weight, 0);
  const lt2 = candidates.reduce((s, c) => s + c.lt2 * c.weight, 0) / wSum;

  // LT1 / LT2 ratio from polarisation.
  let ratio = LT1_LT2_RATIO_PYRAMIDAL;
  if (distribution?.polarisation === 'polarised') ratio = LT1_LT2_RATIO_POLARISED;
  else if (distribution?.polarisation === 'threshold-heavy') ratio = LT1_LT2_RATIO_THRESHOLD;
  const lt1 = lt2 * ratio;

  if (distribution) {
    confidenceBoosters.push({
      label: `Training profile: ${distribution.polarisation} (Z1+Z2 = ${Math.round(distribution.z1Pct + distribution.z2Pct)} %)`,
      points: 15,
    });
  }
  // Quantity-of-data boost.
  if (Object.keys(powerProfile).length >= 6) confidenceBoosters.push({ label: 'Wide power profile (6+ best efforts)', points: 10 });

  const confidence = Math.min(100, confidenceBoosters.reduce((s, b) => s + b.points, 0));

  return {
    lt1: Math.round(lt1),
    lt2: Math.round(lt2),
    confidence,
    ratio: Number(ratio.toFixed(3)),
    candidates: candidates.map((c) => ({ source: c.source, lt2: Math.round(c.lt2), weight: c.weight })),
    confidenceBoosters,
    notes: [],
  };
}

/**
 * Predict LT1 + LT2 pace for a runner.
 *
 * Uses the best 5–21 km pace from training, plus prior tests if any.
 * The "FTP-equivalent" for runners is threshold pace ≈ best ~60-min
 * race effort, with LT2 ≈ threshold pace × 1.02 (slightly slower).
 */
function predictRunThresholds({ paceProfile, distribution, priorTest, fitnessState }) {
  const candidates = [];
  const confidenceBoosters = [];

  // Best 10 km × 1.05 — a 10 km PB ≈ vVO2max × 0.95; LT2 ≈ vVO2max × 0.90,
  // so LT2 ≈ 10k pace × 1.06 (slower per km).
  if (paceProfile[10000]) {
    candidates.push({ source: 'best-10km', lt2: paceProfile[10000] * 1.06, weight: 0.4 });
    confidenceBoosters.push({ label: '10 km effort in training data', points: 25 });
  }
  if (paceProfile[5000]) {
    candidates.push({ source: 'best-5km', lt2: paceProfile[5000] * 1.10, weight: 0.3 });
    confidenceBoosters.push({ label: '5 km effort in training data', points: 15 });
  }
  if (paceProfile[21097]) {
    candidates.push({ source: 'best-half', lt2: paceProfile[21097] * 1.01, weight: 0.5 });
    confidenceBoosters.push({ label: 'Half-marathon effort available (most reliable)', points: 30 });
  }
  if (priorTest?.lt2Pace) {
    const monthsAgo = priorTest?.date ? (Date.now() - new Date(priorTest.date).getTime()) / (30 * 24 * 60 * 60 * 1000) : 12;
    const recency = clamp(1 - monthsAgo / 6, 0.1, 1);
    candidates.push({ source: 'prior-test', lt2: priorTest.lt2Pace, weight: 0.5 * recency });
    confidenceBoosters.push({ label: `Prior test ${monthsAgo.toFixed(1)} months ago`, points: Math.round(25 * recency) });
  }

  if (candidates.length === 0) {
    return { lt1: null, lt2: null, confidence: 0, sources: [], notes: ['Need at least one 5 km+ run in the last 90 days.'] };
  }

  const wSum = candidates.reduce((s, c) => s + c.weight, 0);
  const lt2Pace = candidates.reduce((s, c) => s + c.lt2 * c.weight, 0) / wSum;

  // LT1 is SLOWER than LT2 for pace (higher seconds/km). The ratio
  // multiplier is the inverse of the bike case.
  let inverseRatio = 1 / LT1_LT2_RATIO_PYRAMIDAL;
  if (distribution?.polarisation === 'polarised') inverseRatio = 1 / LT1_LT2_RATIO_POLARISED;
  else if (distribution?.polarisation === 'threshold-heavy') inverseRatio = 1 / LT1_LT2_RATIO_THRESHOLD;
  const lt1Pace = lt2Pace * inverseRatio;

  if (distribution) {
    confidenceBoosters.push({
      label: `Training profile: ${distribution.polarisation} (Z1+Z2 = ${Math.round(distribution.z1Pct + distribution.z2Pct)} %)`,
      points: 15,
    });
  }
  const confidence = Math.min(100, confidenceBoosters.reduce((s, b) => s + b.points, 0));

  return {
    lt1: Math.round(lt1Pace),
    lt2: Math.round(lt2Pace),
    confidence,
    ratio: Number((1 / inverseRatio).toFixed(3)),
    candidates: candidates.map((c) => ({ source: c.source, lt2: Math.round(c.lt2), weight: c.weight })),
    confidenceBoosters,
    notes: [],
  };
}

// ─── Step 5: Test protocol generator ───────────────────────────────────────

/**
 * Build an incremental test protocol calibrated to the predicted
 * thresholds, with predicted lactate / HR / RPE at each stage.
 *
 * For bike: stages in watts. For run/swim: stages in seconds-per-km.
 * Defaults: 8 stages of 4 min each. Range = LT1 − 0.6 × span … LT2 +
 * 0.4 × span, where span = LT2 − LT1.
 */
function generateProtocol({ sport, lt1, lt2, baseLactate = 1.0, stageDurationS = DEFAULT_STAGE_DURATION_S, stages = 8 }) {
  if (!lt1 || !lt2 || lt1 === lt2) return null;
  const isPace = sport === 'run' || sport === 'swim';
  // For bike: LT2 > LT1 (watts ascending). For pace: LT2 < LT1 (seconds
  // descending; harder = lower). We work in an "intensity" axis where
  // ascending always means harder.
  const span = isPace ? (lt1 - lt2) : (lt2 - lt1);
  if (span <= 0) return null;

  const startIntensity = isPace
    ? lt1 + span * 0.6     // slower than LT1 by 60 % of LT1→LT2 span
    : lt1 - span * 0.6;    // easier than LT1 by 60 % of LT1→LT2 span
  const endIntensity = isPace
    ? lt2 - span * 0.4     // faster than LT2 by 40 %
    : lt2 + span * 0.4;    // harder than LT2 by 40 %
  const step = (endIntensity - startIntensity) / (stages - 1);

  const stagesList = [];
  for (let i = 0; i < stages; i++) {
    const intensity = startIntensity + step * i;
    // Predicted lactate via piecewise model:
    //   • below LT1: baseLactate + a small linear rise
    //   • LT1 → LT2: quadratic rise from ~2 mmol/L to ~4 mmol/L
    //   • above LT2: exponential rise (steeper)
    let laPredicted;
    if (isPace) {
      // For pace: harder = lower seconds. Normalise to a 0→1 "intensity
      // fraction" where 0 = LT1, 1 = LT2.
      const frac = (lt1 - intensity) / span; // > 0 = harder than LT1
      if (frac < 0) {
        // Below LT1 (slower than LT1)
        laPredicted = baseLactate + 0.6 * (1 + frac); // approaches LT1 lactate slowly
      } else if (frac <= 1) {
        // Between LT1 and LT2
        laPredicted = 2.0 + (4.0 - 2.0) * frac * frac;
      } else {
        // Above LT2 (faster than LT2)
        laPredicted = 4.0 * Math.exp(0.7 * (frac - 1));
      }
    } else {
      const frac = (intensity - lt1) / span;
      if (frac < 0) {
        laPredicted = baseLactate + Math.max(0, 0.5 * (1 + frac));
      } else if (frac <= 1) {
        laPredicted = 2.0 + (4.0 - 2.0) * frac * frac;
      } else {
        laPredicted = 4.0 * Math.exp(0.7 * (frac - 1));
      }
    }

    stagesList.push({
      stage: i + 1,
      intensity: Math.round(intensity),
      intensityLabel: isPace
        ? `${Math.floor(intensity / 60)}:${String(Math.round(intensity % 60)).padStart(2, '0')}/km`
        : `${Math.round(intensity)} W`,
      lactatePredicted: Number(laPredicted.toFixed(2)),
      rpePredicted: clamp(Math.round(3 + 7 * Math.max(0, (intensity - startIntensity) / (endIntensity - startIntensity))), 1, 10),
      durationS: stageDurationS,
    });
  }

  return {
    sport,
    stageDurationS,
    stages: stagesList,
    summary: {
      start: stagesList[0].intensityLabel,
      end: stagesList[stagesList.length - 1].intensityLabel,
      step: isPace
        ? `−${Math.abs(Math.round(step))} s/km per stage`
        : `+${Math.round(step)} W per stage`,
      totalDurationMin: Math.round(stages * stageDurationS / 60),
    },
  };
}

// ─── Step 6: Measured-vs-predicted interpretation ──────────────────────────

/**
 * When the predictor is called with a real test's measured LT1/LT2,
 * compute the deviation and produce a one-sentence interpretation.
 * Adds context from CTL/ATL/TSB so a low LT2 isn't blindly called
 * "decline" if the athlete was clearly fatigued.
 */
function interpretMeasured({ predicted, measured, fitnessState, sport }) {
  if (!predicted?.lt2 || !measured?.lt2) return null;
  const isPace = sport === 'run' || sport === 'swim';

  const lt2Delta = isPace
    ? (predicted.lt2 - measured.lt2)     // positive = measured was faster (better)
    : (measured.lt2 - predicted.lt2);    // positive = measured was higher watts (better)
  const lt2PctDev = (lt2Delta / Math.max(1, predicted.lt2)) * 100;

  const lt1Delta = predicted.lt1 && measured.lt1
    ? (isPace ? predicted.lt1 - measured.lt1 : measured.lt1 - predicted.lt1)
    : null;
  const lt1PctDev = lt1Delta != null ? (lt1Delta / Math.max(1, predicted.lt1)) * 100 : null;

  let verdict = 'on-target';
  let summary;
  if (lt2PctDev >= 5) {
    verdict = 'over-performed';
    summary = `Measured LT2 outperformed the training-data prediction by ${lt2PctDev.toFixed(1)} %.`;
    if (fitnessState?.tsb > 10) summary += ' Athlete arrived fresh / tapered — peak performance is expected.';
    else summary += ' Either training data understated true fitness, or the athlete had an unusually good day.';
  } else if (lt2PctDev <= -5) {
    verdict = 'under-performed';
    summary = `Measured LT2 came in ${Math.abs(lt2PctDev).toFixed(1)} % below prediction.`;
    if (fitnessState?.tsb < -10) summary += ` Athlete arrived fatigued (TSB ${fitnessState.tsb}) — consider re-testing after recovery.`;
    else summary += ' Possible illness, under-recovery, or training data overstated fitness (e.g. PB efforts in less specific conditions).';
  } else {
    summary = `Measured LT2 matched the prediction within ±5 % — the model and the day agreed.`;
  }

  return {
    verdict,
    lt2Delta,
    lt2PctDev: Number(lt2PctDev.toFixed(1)),
    lt1Delta,
    lt1PctDev: lt1PctDev != null ? Number(lt1PctDev.toFixed(1)) : null,
    summary,
  };
}

// ─── Public orchestrator ──────────────────────────────────────────────────

/**
 * Run the full pipeline.
 *
 * Inputs:
 *   activities      — array of {date, sport, durationS, distanceM, …}
 *                     (already normalised — caller pulls from Mongo)
 *   userProfile     — User doc selected for ftp/zones/maxHr/restingHr
 *   sport           — 'bike' | 'run' | 'swim'
 *   priorTest       — optional { date, lt2Power|lt2Pace, lt1Power|lt1Pace, ctlAtTest }
 *   measured        — optional { lt1, lt2, baseLactate } from the current test
 *                     (when present we compute measured-vs-predicted)
 *   stages          — protocol stage count (default 8)
 *   stageDurationS  — protocol per-stage duration (default 240 s = 4 min)
 *
 * Output: see PredictedCurveResult schema (large object).
 */
function predictLactateCurve({
  activities,
  userProfile,
  sport,
  priorTest = null,
  measured = null,
  stages = 8,
  stageDurationS = DEFAULT_STAGE_DURATION_S,
}) {
  const s = String(sport || 'bike').toLowerCase();
  const sportKey = s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling' ? 'bike'
    : s.includes('run') ? 'run'
    : s.includes('swim') ? 'swim'
    : 'bike';
  const isPace = sportKey === 'run' || sportKey === 'swim';

  // Filter to last 90 days.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recent = activities.filter((a) => a.date >= cutoff);

  // Profile extraction is sport-specific.
  const powerProfile = sportKey === 'bike' ? extractCyclingPowerProfile(recent) : {};
  const paceProfile = sportKey !== 'bike' ? extractRunningPaceProfile(recent) : {};
  const cp = sportKey === 'bike' ? fitCriticalPower(powerProfile) : null;
  const distribution = computeTrainingDistribution(recent, userProfile);
  const fitnessState = computeFitnessState(recent);

  const userFtp = userProfile?.powerZones?.cycling?.lt2 || userProfile?.powerZones?.cycling?.ftp || userProfile?.ftp || 0;

  const prediction = sportKey === 'bike'
    ? predictBikeThresholds({ powerProfile, cp, distribution, priorTest, fitnessState, userFtp })
    : predictRunThresholds({ paceProfile, distribution, priorTest, fitnessState });

  const protocol = generateProtocol({
    sport: sportKey,
    lt1: prediction.lt1,
    lt2: prediction.lt2,
    baseLactate: safeNumber(measured?.baseLactate) || 1.0,
    stageDurationS,
    stages,
  });

  const interpretation = measured ? interpretMeasured({
    predicted: prediction,
    measured,
    fitnessState,
    sport: sportKey,
  }) : null;

  return {
    sport: sportKey,
    isPace,
    windowDays: 90,
    activitiesCount: recent.length,
    fitnessState,
    distribution,
    powerProfile,
    paceProfile,
    criticalPower: cp,
    prediction,
    protocol,
    interpretation,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  predictLactateCurve,
  normalizeActivities,
  // Exposed for testing / fine-tuning from the route handler.
  extractCyclingPowerProfile,
  extractRunningPaceProfile,
  computeTrainingDistribution,
  computeFitnessState,
  fitCriticalPower,
  generateProtocol,
  interpretMeasured,
};
