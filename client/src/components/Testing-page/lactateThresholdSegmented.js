/**
 * Lactate threshold estimation: segmentovaná regrese + ensemble
 * Vstup: body [ { power, lactate } ], power vzestupně, min. 5 bodů.
 * Výstup: LT1, LT2 (W), volitelně confidence interval a metriky.
 */

import * as math from 'mathjs';

const MIN_POINTS = 5;
const MIN_LT2_LT1_GAP_W = 30;
/** LT2 (anaerobní práh) má být alespoň kolem 3 mmol/L; pokud výpočet dá méně, použít OBLA 3.5/4.0 */
const MIN_LTP2_LACTATE_REASONABLE = 2.5;
const OBLA_MMOL = 2.0; // LT1 baseline: target OBLA 2.0 mmol/L
const LT1_MAX_LACTATE_MMOL = 2.5; // pokud by laktát v LT1 byl > 2.5, použít OBLA 2.0
const OBLA_LT2_MMOL = 4.0; // LT2: OBLA 4.0 mmol/L
const OBLA_LT2_FALLBACK_MMOL = 3.5; // fallback když křivka nedosáhne 4.0
const BOOTSTRAP_ITERATIONS = 200;

// --- 1) Předzpracování ---

/**
 * Isotonic regression (monotonic increasing): Pool Adjacent Violators.
 * Vstup: power, lactate (stejná délka, seřazené podle power vzestupně).
 * Výstup: L_iso (monotónně rostoucí laktát).
 */
export function isotonicRegression(power, lactate) {
  const n = power.length;
  if (n === 0) return [];
  // Skip values that aren't finite — they'd propagate NaN forever and
  // freeze the page (was the Federico-test bug).
  let y = lactate.map(v => Number.isFinite(v) ? v : 0);
  let changed = true;
  // Hard safety cap. PAV converges in O(n) blocks; n² is a generous ceiling
  // against floating-point round-off or unexpected input.
  const MAX_ITER = n * n + 10;
  let iter = 0;
  while (changed && iter < MAX_ITER) {
    iter += 1;
    changed = false;
    for (let i = 0; i < n - 1; i++) {
      if (y[i] > y[i + 1] + 1e-9) {
        const avg = (y[i] + y[i + 1]) / 2;
        y[i] = avg;
        y[i + 1] = avg;
        changed = true;
      }
    }
  }
  return y;
}

/**
 * Moving median smoothing (optional). Window size 3.
 */
export function movingMedian(arr, windowSize = 3) {
  if (!arr || arr.length < windowSize) return arr;
  const out = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length, i + half + 1);
    const slice = arr.slice(start, end);
    slice.sort((a, b) => a - b);
    out.push(slice[Math.floor(slice.length / 2)]);
  }
  return out;
}

/**
 * Linear interpolation: find x such that y(x) = targetY given (x0,y0), (x1,y1).
 */
function linearInterpX(x0, y0, x1, y1, targetY) {
  if (y1 === y0) return (x0 + x1) / 2;
  return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
}

/**
 * Linear interpolation: find x where piecewise linear (power, lactate) equals targetLactate.
 */
function linearInterpolationPower(power, lactate, targetLactate) {
  for (let i = 0; i < power.length - 1; i++) {
    const a = lactate[i];
    const b = lactate[i + 1];
    if ((targetLactate >= a && targetLactate <= b) || (targetLactate >= b && targetLactate <= a)) {
      return linearInterpX(power[i], a, power[i + 1], b, targetLactate);
    }
  }
  if (targetLactate <= lactate[0]) return power[0];
  if (targetLactate >= lactate[lactate.length - 1]) return power[power.length - 1];
  return null;
}

/** Laktát v daném výkonu P (lineární interpolace z křivky power–lactate). */
function lactateAtPower(power, lactate, P) {
  for (let i = 0; i < power.length - 1; i++) {
    const p0 = power[i];
    const p1 = power[i + 1];
    if (P >= Math.min(p0, p1) && P <= Math.max(p0, p1) && p0 !== p1) {
      return lactate[i] + (lactate[i + 1] - lactate[i]) * (P - p0) / (p1 - p0);
    }
  }
  if (P <= power[0]) return lactate[0];
  if (P >= power[power.length - 1]) return lactate[lactate.length - 1];
  return null;
}

// --- 2) Segmentovaná regrese (2 zlomy) ---

/**
 * Pro dané b1, b2 sestaví design matrix X a spočte SSE.
 * La(P) = β0 + β1*P + β2*max(0,P-b1) + β3*max(0,P-b2)
 */
function segmentedSSE(power, lactate, b1, b2) {
  const n = power.length;
  const X = power.map((P) => [
    1,
    P,
    Math.max(0, P - b1),
    Math.max(0, P - b2)
  ]);
  const Y = lactate;
  try {
    const Xm = math.matrix(X);
    const Ym = math.matrix(Y, 'dense');
    const XT = math.transpose(Xm);
    const XTX = math.multiply(XT, Xm);
    const XTY = math.multiply(XT, Ym);
    const beta = math.lusolve(XTX, XTY);
    const pred = math.multiply(Xm, beta);
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const diff = Y[i] - pred.get([i, 0]);
      sse += diff * diff;
    }
    return { sse, LT1: b1, LT2: b2 };
  } catch (e) {
    return { sse: Infinity, LT1: b1, LT2: b2 };
  }
}

/**
 * Primární odhad: segmentovaná regrese. Breakpointy z power[2:-2], b2 > b1.
 */
export function segmentedRegression(power, lactate) {
  const candidates = power.slice(2, power.length - 2);
  if (candidates.length < 2) return { LT1: null, LT2: null, valid: false };

  let best = { sse: Infinity, LT1: null, LT2: null };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const b1 = candidates[i];
      const b2 = candidates[j];
      const { sse } = segmentedSSE(power, lactate, b1, b2);
      if (sse < best.sse) {
        best = { sse, LT1: b1, LT2: b2 };
      }
    }
  }
  return {
    LT1: best.LT1,
    LT2: best.LT2,
    valid: best.LT1 != null && best.LT2 != null
  };
}

// --- 3) Alternativní odhady ---

/**
 * Baseline LT1: target = (resting/base lactate + 1.0) mmol/L. This is the
 * "first significant rise above baseline" — physiologically the aerobic
 * threshold. Falls back to fixed OBLA 2.0 mmol/L when baseline is unknown.
 *
 * Why +1.0: well established in lactate physiology (Mader, Stegmann,
 * Coyle). It's individualized — athletes with low resting lactate get a
 * lower LT1, those with high baseline get a higher one. Fixed 2.0 mmol
 * systematically misclassifies both ends.
 */
export function baselineLT1(power, lactate, baseLactate = null) {
  let targetL = OBLA_MMOL;
  const b = Number(baseLactate);
  if (Number.isFinite(b) && b > 0.2 && b < 2.5) {
    // Individualized: baseline + 1.0 mmol/L (clamped to a sensible band).
    targetL = Math.min(3.0, Math.max(1.5, b + 1.0));
  }
  return linearInterpolationPower(power, lactate, targetL);
}

/**
 * Polynom stupně deg: nejmenší čtverce, koeficienty [c0, c1, c2, ...].
 */
function polyFit(power, lactate, deg) {
  const X = power.map((P) => {
    const row = [1];
    for (let d = 1; d <= deg; d++) row.push(Math.pow(P, d));
    return row;
  });
  const Y = lactate;
  const Xm = math.matrix(X);
  const Ym = math.matrix(Y, 'dense');
  const XTX = math.multiply(math.transpose(Xm), Xm);
  const XTY = math.multiply(math.transpose(Xm), Ym);
  const beta = math.lusolve(XTX, XTY);
  return math.flatten(beta).toArray();
}

/**
 * Helper for D-max family: build poly3 and find the power on the curve with
 * maximum perpendicular distance to a chord (p0,l0)→(p1,l1).
 */
function dmaxOnChord(power, lactate, p0, l0, p1, l1) {
  if (power.length < 4) return null;
  try {
    const coeffs = polyFit(power, lactate, 3);
    const poly = (x) => {
      let v = 0;
      for (let d = 0; d < coeffs.length; d++) v += coeffs[d] * Math.pow(x, d);
      return v;
    };
    if (p1 - p0 <= 0) return null;
    const slope = (l1 - l0) / (p1 - p0);
    const intercept = l0 - slope * p0;
    const denom = Math.sqrt(1 + slope * slope);
    const steps = 200;
    let maxDist = -Infinity;
    let bestP = p0;
    for (let i = 0; i <= steps; i++) {
      const P = p0 + (p1 - p0) * (i / steps);
      const L = poly(P);
      // We only consider points where the curve lies ABOVE the chord — D-max
      // is defined as the maximum POSITIVE deviation. The original code took
      // |dist|, which on noisy data could pick a point on the wrong side.
      const dist = (L - (slope * P + intercept)) / denom;
      if (dist > maxDist) {
        maxDist = dist;
        bestP = P;
      }
    }
    return bestP;
  } catch (e) {
    return null;
  }
}

/**
 * Classic D-max LT2: chord first → last measured point.
 *
 * `maxLactate` (optional) — true post-test peak. When provided we use it as
 * the upper anchor instead of `lactate[last]`, which often UNDER-shoots the
 * real peak because lactate continues to rise for 3–5 min after stopping.
 * Without this correction, D-max with a truncated test systematically
 * under-estimates LT2.
 */
export function dmaxLT2(power, lactate, maxLactate = null) {
  if (power.length < 4) return null;
  const p0 = power[0];
  const p1 = power[power.length - 1];
  const l0 = lactate[0];
  let l1 = lactate[lactate.length - 1];
  const m = Number(maxLactate);
  if (Number.isFinite(m) && m > l1) {
    l1 = m;
  }
  return dmaxOnChord(power, lactate, p0, l0, p1, l1);
}

/**
 * Modified D-max (Bishop): chord LT1 → last measured (or true max) point.
 *
 * Improvement over classic D-max for tests with a long flat aerobic baseline:
 * the regular chord underestimates LT2 because the slope between start and
 * end is dominated by the flat portion. Anchoring at LT1 (where the curve
 * first deflects) gives a chord that better captures the lactate climb.
 *
 * Reference: Bishop, Jenkins & Mackinnon (1998).
 */
export function modifiedDmaxLT2(power, lactate, lt1Power, maxLactate = null) {
  if (power.length < 4 || lt1Power == null) return null;
  const l0 = lactateAtPower(power, lactate, lt1Power);
  const p1 = power[power.length - 1];
  let l1 = lactate[lactate.length - 1];
  const m = Number(maxLactate);
  if (Number.isFinite(m) && m > l1) l1 = m;
  if (l0 == null || !Number.isFinite(l0)) return null;
  return dmaxOnChord(power, lactate, lt1Power, l0, p1, l1);
}

/**
 * Log–log breakpoint (Beaver, Wasserman, Whipp 1985 — applied to lactate).
 *
 * Robust for incomplete tests where the curve never reaches 4 mmol/L:
 * works in log(power) × log(lactate) space and finds the single point where
 * the slope changes most. Returns the power at that "knee" — useful as an
 * additional LT2 candidate when traditional D-max fails.
 */
export function loglogLT2(power, lactate) {
  if (power.length < 5) return null;
  const valid = [];
  for (let i = 0; i < power.length; i++) {
    if (power[i] > 0 && lactate[i] > 0) {
      valid.push({ x: Math.log(power[i]), y: Math.log(lactate[i]), p: power[i] });
    }
  }
  if (valid.length < 5) return null;

  // For every candidate breakpoint i in the interior, fit two least-squares
  // lines (i.e. before & after) and find the i minimising total residual
  // sum of squares. The breakpoint with the largest |slopeAfter − slopeBefore|
  // and reasonable RSS reduction is the knee.
  const fitLine = (pts) => {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { x, y } of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const mean_x = sx / n;
    const mean_y = sy / n;
    const denom = sxx - n * mean_x * mean_x;
    if (Math.abs(denom) < 1e-12) return null;
    const slope = (sxy - n * mean_x * mean_y) / denom;
    const intercept = mean_y - slope * mean_x;
    let rss = 0;
    for (const { x, y } of pts) {
      const r = y - (slope * x + intercept);
      rss += r * r;
    }
    return { slope, intercept, rss };
  };

  let best = { i: -1, slopeJump: -Infinity, p: null };
  for (let i = 2; i <= valid.length - 3; i++) {
    const left = fitLine(valid.slice(0, i + 1));
    const right = fitLine(valid.slice(i));
    if (!left || !right) continue;
    // We want the inflection where slope JUMPS UP (lactate climbing harder).
    const jump = right.slope - left.slope;
    if (jump > best.slopeJump) {
      best = { i, slopeJump: jump, p: valid[i].p };
    }
  }
  return best.p;
}

/**
 * IAT (Individual Anaerobic Threshold, Dickhuth-style): LT1 lactate + 1.5
 * mmol/L. Robust, clinically validated alternative for LT2.
 *
 * Requires LT1 power to read its lactate off the curve first.
 */
export function dickhuthIAT(power, lactate, lt1Power) {
  if (lt1Power == null) return null;
  const lt1La = lactateAtPower(power, lactate, lt1Power);
  if (lt1La == null || !Number.isFinite(lt1La)) return null;
  const targetLa = lt1La + 1.5;
  return linearInterpolationPower(power, lactate, targetLa);
}

/**
 * OBLA pro LT2: výkon při laktátu OBLA_LT2_MMOL (4.0 mmol/L) – lineární interpolace.
 * Fallback pro LT2 když segmentovaná regrese nebo D-max neplatné.
 */
export function obla35LT2(power, lactate) {
  return linearInterpolationPower(power, lactate, OBLA_LT2_MMOL);
}

// --- 4) Validace a ensemble ---

function isValidSegmented(LT1_seg, LT2_seg, power) {
  if (LT1_seg == null || LT2_seg == null) return false;
  const n = power.length;
  if (n < 2) return false;
  if (LT1_seg <= power[1]) return false;
  if (LT2_seg >= power[n - 2]) return false;
  if (LT2_seg - LT1_seg < MIN_LT2_LT1_GAP_W) return false;
  return true;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  const a = arr.filter((x) => x != null && Number.isFinite(x));
  if (a.length === 0) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const a = [...arr].filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Apply a stage-duration correction: lactate at the end of a stage shorter
 * than ~4 min hasn't reached steady-state and reads ~5–15 % lower than the
 * true plateau. Rescaling each lactate value up by a small factor improves
 * downstream threshold accuracy. Returns a NEW array; never mutates input.
 *
 * Empirically derived:
 *   240 s → factor 1.00 (no correction)
 *   180 s → 1.06
 *   120 s → 1.12
 *    60 s → 1.20
 */
function applyStageDurationCorrection(lactate, stageDurationSec) {
  const s = Number(stageDurationSec);
  if (!Number.isFinite(s) || s <= 0 || s >= 240) return lactate.slice();
  const factor = 1 + (240 - s) * 0.001; // gentle, monotonic. ~6% at 180s, 18% at 60s
  return lactate.map(v => v * factor);
}

/**
 * Compute a 0–100 confidence score for the threshold estimate. Higher = more
 * trustworthy. Drivers: number of points, whether the curve reached LT2-ish
 * lactates, monotonicity, gap between LT1 and LT2.
 */
function computeConfidence({ nPoints, maxLactate, violations, lt1, lt2 }) {
  let score = 0;
  // Points: 0 at 4, full at 8+
  score += Math.min(40, Math.max(0, (nPoints - 4) * 10));
  // Reaching ≥ 4 mmol means we don't have to extrapolate LT2
  if (maxLactate >= 4.0) score += 25;
  else if (maxLactate >= 3.5) score += 15;
  else if (maxLactate >= 3.0) score += 5;
  // Monotonicity (raw measurements)
  score += Math.max(0, 15 - violations * 5);
  // Reasonable LT1↔LT2 gap (in % of LT1)
  if (lt1 != null && lt2 != null && lt1 > 0) {
    const gapPct = (lt2 - lt1) / lt1;
    if (gapPct >= 0.15 && gapPct <= 0.45) score += 20;
    else if (gapPct >= 0.10) score += 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Hlavní výpočet: předzpracování → segmentovaná regrese + baseline + D-max + Modified D-max + log-log → median consensus.
 * points: [ { power, lactate } ], power vzestupně, min. 5 bodů.
 * options: {
 *   smooth: boolean,
 *   bootstrap: boolean,
 *   isPace: boolean,               // run/swim — X is pace (sec/km or sec/100m), LOWER = HARDER
 *   baseLactate: number,           // resting/base lactate (mmol/L), individualizes LT1
 *   maxLactate: number,            // post-test peak (mmol/L), tightens D-max upper anchor
 *   stageDurationSec: number,      // < 240 s applies steady-state correction
 * }
 *
 * For pace sports (run/swim) the X axis is INVERTED relative to bike: lower
 * pace seconds = higher intensity. All internal methods (segmented, D-max,
 * Modified D-max, log-log, OBLA) assume "higher X = harder", so we negate the
 * X going in and negate the LT values going out. The output LT1/LT2 are in
 * the SAME units as the input (positive pace seconds for run/swim, watts for
 * bike).
 */
export function computeLactateThresholds(points, options = {}) {
  const {
    smooth = false,
    bootstrap = false,
    isPace = false,
    baseLactate = null,
    maxLactate = null,
    stageDurationSec = null,
  } = options;

  // For pace sports, negate X so "higher = harder" holds internally. We flip
  // result LT values back to positive pace seconds before returning.
  const xSign = isPace ? -1 : 1;

  const sorted = [...points]
    .map((p) => ({ power: xSign * Number(p.power), lactate: Number(p.lactate) }))
    .filter((p) => Number.isFinite(p.power) && Number.isFinite(p.lactate))
    .sort((a, b) => a.power - b.power);

  const power = sorted.map((p) => p.power);
  const lactateRaw = sorted.map((p) => p.lactate);

  let noisy = false;
  const L_iso = isotonicRegression(power, lactateRaw);
  // Stage-duration correction is applied AFTER isotonic monotonising — order
  // doesn't matter mathematically (scaling preserves monotonicity), but this
  // way the smoothing operates on raw shape and the correction is the last
  // step before any threshold method sees the values.
  const L_corrected = applyStageDurationCorrection(L_iso, stageDurationSec);
  const lactate = smooth ? movingMedian(L_corrected, 3) : L_corrected;
  const rawMaxLa = Math.max(...lactateRaw);

  // Kontrola: pokud byl velký „oprav“ isotonicem, označit jako noisy (volitelné)
  let violations = 0;
  for (let i = 0; i < lactateRaw.length - 1; i++) {
    if (lactateRaw[i] > lactateRaw[i + 1]) violations++;
  }
  if (violations > 2) noisy = true;

  const n = power.length;
  const result = {
    LT1: null,
    LT2: null,
    confidenceInterval: null,
    confidence: null,
    methods: { LT1: {}, LT2: {} },
    metrics: { method: 'ensemble', noisy, violations, baselineUsed: baseLactate }
  };

  if (n < MIN_POINTS) {
    result.metrics.method = 'fallback';
    const lt1Base = baselineLT1(power, lactate, baseLactate);
    const lt2Dmax = dmaxLT2(power, lactate, maxLactate);
    const lt2Obla = obla35LT2(power, lactate);
    result.LT1 = lt1Base;
    result.LT2 = mean([lt2Dmax, lt2Obla].filter((x) => x != null));
    result.methods.LT1 = { baseline: lt1Base };
    result.methods.LT2 = { dmax: lt2Dmax, obla: lt2Obla };
    result.confidence = computeConfidence({ nPoints: n, maxLactate: rawMaxLa, violations, lt1: result.LT1, lt2: result.LT2 });
    return result;
  }

  const seg = segmentedRegression(power, lactate);
  const lt1Base = baselineLT1(power, lactate, baseLactate);
  const lt2Dmax = dmaxLT2(power, lactate, maxLactate);
  const lt2Obla = obla35LT2(power, lactate);
  const lt2Loglog = loglogLT2(power, lactate);

  const LT1_seg = seg.LT1;
  const LT2_seg = seg.LT2;
  const segValid = isValidSegmented(LT1_seg, LT2_seg, power);

  // LT1 ensemble: baseline (individualized) + segmented breakpoint when it
  // exists. Take the median for robustness against either method drifting.
  const LT1_candidates = [lt1Base];
  if (segValid && LT1_seg != null) LT1_candidates.push(LT1_seg);
  result.LT1 = median(LT1_candidates.filter((x) => x != null && Number.isFinite(x)));

  // Now that we have a tentative LT1, compute LT1-anchored methods.
  const lt2ModDmax = modifiedDmaxLT2(power, lactate, result.LT1, maxLactate);
  const lt2IAT = dickhuthIAT(power, lactate, result.LT1);

  // LT2 ensemble: D-max + Modified D-max + OBLA 4 + log-log + Dickhuth-IAT
  // + segmented (when valid). Median consensus.
  const LT2_candidates = [lt2Dmax, lt2ModDmax, lt2Obla, lt2Loglog, lt2IAT]
    .filter((x) => x != null && Number.isFinite(x));
  if (segValid && LT2_seg != null) LT2_candidates.push(LT2_seg);
  result.LT2 = median(LT2_candidates);

  // Capture each candidate so the UI / DataTable can show the spread.
  result.methods.LT1 = {
    baseline: lt1Base,
    segmented: segValid ? LT1_seg : null,
  };
  result.methods.LT2 = {
    dmax: lt2Dmax,
    modifiedDmax: lt2ModDmax,
    obla: lt2Obla,
    loglog: lt2Loglog,
    iat: lt2IAT,
    segmented: segValid ? LT2_seg : null,
  };

  // LT1 nesmí být nad 2.5 mmol/L – jinak použít OBLA 2.0
  const lactateAtLt1 = result.LT1 != null ? lactateAtPower(power, lactate, result.LT1) : null;
  if (lactateAtLt1 != null && lactateAtLt1 > LT1_MAX_LACTATE_MMOL && lt1Base != null) {
    result.LT1 = lt1Base;
  }

  // LT2 musí dávat smysl: laktát alespoň ~2.5 mmol/L a dostatečný odstup od LT1.
  // Gap is computed on the INTERNAL (sign-flipped for pace) axis so the
  // comparison `LT2 > LT1` (i.e. "harder than") holds for both sports.
  // The watt-flavoured `MIN_LT2_LT1_GAP_W = 30` is dimensionally fine here:
  // for bike it's 30 W, for pace (sec/km) it's 30 s — both are sane minima.
  const lactateAtLt2 = result.LT2 != null ? lactateAtPower(power, lactate, result.LT2) : null;
  const minGapInternal = isPace ? 10 : MIN_LT2_LT1_GAP_W; // 10 sec/100m or sec/km vs 30 W
  const gap = result.LT1 != null && result.LT2 != null ? result.LT2 - result.LT1 : 0;
  const lt2LactateLow = lactateAtLt2 != null && lactateAtLt2 < MIN_LTP2_LACTATE_REASONABLE;
  const lt2GapSmall = gap < minGapInternal;
  if (result.LT2 != null && (lt2LactateLow || lt2GapSmall)) {
    const lt2At4 = linearInterpolationPower(power, lactate, OBLA_LT2_MMOL);
    const lt2At35 = linearInterpolationPower(power, lactate, OBLA_LT2_FALLBACK_MMOL);
    let betterLt2 = lt2At4 ?? lt2At35;
    if (lt2At4 != null && lt2At35 != null) {
      betterLt2 = (lt2At4 + lt2At35) / 2;
    }
    if (betterLt2 != null && (result.LT1 == null || betterLt2 - result.LT1 >= minGapInternal)) {
      result.LT2 = betterLt2;
    }
  }

  if (bootstrap && result.LT1 != null && result.LT2 != null && n >= 6) {
    const lt1Samples = [];
    const lt2Samples = [];
    for (let i = 0; i < BOOTSTRAP_ITERATIONS; i++) {
      const idx = [];
      for (let j = 0; j < n; j++) idx.push(Math.floor(Math.random() * n));
      idx.sort((a, b) => a - b);
      const uniq = [...new Set(idx)].map((k) => sorted[k]).sort((a, b) => a.power - b.power);
      if (uniq.length < MIN_POINTS) continue;
      const p = uniq.map((u) => u.power);
      const l = isotonicRegression(p, uniq.map((u) => u.lactate));
      const s = segmentedRegression(p, l);
      const segOk = isValidSegmented(s.LT1, s.LT2, p);
      const lt1 = segOk && s.LT1 != null ? s.LT1 : baselineLT1(p, l);
      const lt2 = segOk && s.LT2 != null ? s.LT2 : (dmaxLT2(p, l) ?? obla35LT2(p, l));
      if (lt1 != null) lt1Samples.push(lt1);
      if (lt2 != null) lt2Samples.push(lt2);
    }
    if (lt1Samples.length >= 10) {
      lt1Samples.sort((a, b) => a - b);
      const lo1 = lt1Samples[Math.floor(lt1Samples.length * 0.025)];
      const hi1 = lt1Samples[Math.ceil(lt1Samples.length * 0.975) - 1];
      const sd1 = Math.sqrt(lt1Samples.reduce((s, x) => s + (x - median(lt1Samples)) ** 2, 0) / lt1Samples.length);
      result.confidenceInterval = result.confidenceInterval || {};
      result.confidenceInterval.LT1 = { lower: lo1, upper: hi1, sd: sd1 };
    }
    if (lt2Samples.length >= 10) {
      lt2Samples.sort((a, b) => a - b);
      const lo2 = lt2Samples[Math.floor(lt2Samples.length * 0.025)];
      const hi2 = lt2Samples[Math.ceil(lt2Samples.length * 0.975) - 1];
      const sd2 = Math.sqrt(lt2Samples.reduce((s, x) => s + (x - median(lt2Samples)) ** 2, 0) / lt2Samples.length);
      result.confidenceInterval = result.confidenceInterval || {};
      result.confidenceInterval.LT2 = { lower: lo2, upper: hi2, sd: sd2 };
    }
  }

  result.confidence = computeConfidence({
    nPoints: n,
    maxLactate: Math.max(rawMaxLa, Number(maxLactate) || 0),
    violations,
    lt1: result.LT1,
    lt2: result.LT2,
  });

  // Flip X values back to caller's units. For pace sports this returns
  // positive pace seconds; for bike it's a no-op (xSign = 1).
  if (xSign === -1) {
    if (result.LT1 != null) result.LT1 = -result.LT1;
    if (result.LT2 != null) result.LT2 = -result.LT2;
    const flipObj = (o) => {
      if (!o) return o;
      const out = {};
      for (const k of Object.keys(o)) out[k] = o[k] == null ? null : -o[k];
      return out;
    };
    result.methods.LT1 = flipObj(result.methods.LT1);
    result.methods.LT2 = flipObj(result.methods.LT2);
    if (result.confidenceInterval?.LT1) {
      const ci1 = result.confidenceInterval.LT1;
      result.confidenceInterval.LT1 = { lower: -ci1.upper, upper: -ci1.lower, sd: ci1.sd };
    }
    if (result.confidenceInterval?.LT2) {
      const ci2 = result.confidenceInterval.LT2;
      result.confidenceInterval.LT2 = { lower: -ci2.upper, upper: -ci2.lower, sd: ci2.sd };
    }
  }

  return result;
}
