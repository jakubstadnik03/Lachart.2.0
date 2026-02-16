/**
 * Lactate threshold estimation: segmentovaná regrese + ensemble
 * Vstup: body [ { power, lactate } ], power vzestupně, min. 5 bodů.
 * Výstup: LT1, LT2 (W), volitelně confidence interval a metriky.
 */

import * as math from 'mathjs';

const MIN_POINTS = 5;
const MIN_LT2_LT1_GAP_W = 30;
// Finální hodnota = průměr všech platných kandidátů (segmentovaná, OBLA, D-max)
const OBLA_MMOL = 2.0; // LT1 baseline: target OBLA 2.0 mmol/L
const LT1_MAX_LACTATE_MMOL = 2.5; // pokud by laktát v LT1 byl > 2.5, použít OBLA 2.0
const OBLA_LT2_MMOL = 4.0; // LT2: OBLA 4.0 mmol/L
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
  let y = [...lactate];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n - 1; i++) {
      if (y[i] > y[i + 1]) {
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
 * Baseline LT1: target = OBLA 2.0 mmol/L (lineární interpolace power při L = 2.0).
 */
export function baselineLT1(power, lactate) {
  const targetL = OBLA_MMOL;
  const p = linearInterpolationPower(power, lactate, targetL);
  return p;
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
 * D-max LT2: polynom 3. stupně, přímka první–poslední bod, LT2 = argmax kolmá vzdálenost.
 */
export function dmaxLT2(power, lactate) {
  if (power.length < 4) return null;
  try {
    const coeffs = polyFit(power, lactate, 3);
    const poly = (x) => {
      let v = 0;
      for (let d = 0; d < coeffs.length; d++) v += coeffs[d] * Math.pow(x, d);
      return v;
    };
    const p0 = power[0];
    const p1 = power[power.length - 1];
    const l0 = lactate[0];
    const l1 = lactate[lactate.length - 1];
    const slope = (l1 - l0) / (p1 - p0 || 1);
    const intercept = l0 - slope * p0;
    const denom = Math.sqrt(1 + slope * slope);

    const steps = 100;
    let maxDist = -Infinity;
    let bestP = p0;
    for (let i = 0; i <= steps; i++) {
      const P = p0 + (p1 - p0) * (i / steps);
      const L = poly(P);
      const dist = Math.abs(L - (slope * P + intercept)) / denom;
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
 * Hlavní výpočet: předzpracování → segmentovaná regrese + baseline + D-max → ensemble.
 * points: [ { power, lactate } ], power vzestupně, min. 5 bodů.
 * options: { smooth: boolean, bootstrap: boolean }
 */
export function computeLactateThresholds(points, options = {}) {
  const { smooth = false, bootstrap = false } = options;

  const sorted = [...points]
    .map((p) => ({ power: Number(p.power), lactate: Number(p.lactate) }))
    .filter((p) => Number.isFinite(p.power) && Number.isFinite(p.lactate))
    .sort((a, b) => a.power - b.power);

  const power = sorted.map((p) => p.power);
  const lactateRaw = sorted.map((p) => p.lactate);

  let noisy = false;
  const L_iso = isotonicRegression(power, lactateRaw);
  const lactate = smooth ? movingMedian(L_iso, 3) : L_iso;

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
    metrics: { method: 'ensemble', noisy }
  };

  if (n < MIN_POINTS) {
    result.metrics.method = 'fallback';
    const lt1Base = baselineLT1(power, lactate);
    const lt2Dmax = dmaxLT2(power, lactate);
    const lt2Obla = obla35LT2(power, lactate);
    result.LT1 = lt1Base;
    result.LT2 = mean([lt2Dmax, lt2Obla].filter((x) => x != null));
    return result;
  }

  const seg = segmentedRegression(power, lactate);
  const lt1Base = baselineLT1(power, lactate);
  const lt2Dmax = dmaxLT2(power, lactate);
  const lt2Obla = obla35LT2(power, lactate);

  const LT1_seg = seg.LT1;
  const LT2_seg = seg.LT2;
  const segValid = isValidSegmented(LT1_seg, LT2_seg, power);

  const LT1_candidates = [lt1Base];
  if (segValid && LT1_seg != null) LT1_candidates.push(LT1_seg);

  const LT2_candidates = [lt2Dmax, lt2Obla].filter((x) => x != null);
  if (segValid && LT2_seg != null) LT2_candidates.push(LT2_seg);

  result.LT1 = mean(LT1_candidates.filter((x) => x != null && Number.isFinite(x)));
  result.LT2 = mean(LT2_candidates.filter((x) => x != null && Number.isFinite(x)));

  // LT1 nesmí být nad 2.5 mmol/L – jinak použít OBLA 2.0
  const lactateAtLt1 = result.LT1 != null ? lactateAtPower(power, lactate, result.LT1) : null;
  if (lactateAtLt1 != null && lactateAtLt1 > LT1_MAX_LACTATE_MMOL && lt1Base != null) {
    result.LT1 = lt1Base;
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

  return result;
}
