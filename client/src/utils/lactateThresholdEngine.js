/**
 * Lactate thresholds from a step test.
 *
 * One engine, pure functions, no framework: the calculator, the zones, the
 * report e-mails and the app all ask this. (server/utils/lactateThresholdEngine.js
 * is a generated CommonJS mirror — run `node server/scripts/syncLactateEngine.js`
 * after editing; a test checks the two agree.)
 *
 * How a test is read
 * ──────────────────
 * 1. Every stage becomes (intensity, lactate). Intensity is watts on the
 *    bike and speed for running and swimming — 1/pace — so "higher is
 *    harder" holds for every sport and interpolation is linear in the
 *    quantity that lactate actually responds to. Results go back out in the
 *    units they came in (watts, or seconds per km / mile / 100 m).
 * 2. A stage entered out of order — a pace faster than a later one, a
 *    wattage below an earlier one — is a typo, not a measurement, and is
 *    dropped (only when enough stages remain).
 * 3. The measured lactates are made monotone (pool-adjacent-violators): a
 *    single reading that dips below its neighbours is noise from the strip,
 *    not a recovery mid-test. The curve is a monotone cubic (Fritsch–Carlson)
 *    through those points, so it never overshoots between stages the way a
 *    polynomial does, and every threshold is read off the same curve.
 * 4. Baseline = the lowest of the resting sample and the early stages: lactate
 *    usually dips below rest in the warm-up, and that dip is the true floor.
 * 5. LT1 (aerobic threshold) — where lactate has clearly left the floor.
 *    Seven tenths of the answer is the curve at baseline + 0.8 mmol/L (kept
 *    within 1.5–2.5, or up to 3.0 for an athlete whose floor is high — the
 *    "first significant rise" of Coyle and Mader, and
 *    where coaches put it: on the 46 tests in the database a coach corrected
 *    by hand, their LT1 sits at baseline + 0.9, 1.9 mmol/L, median); the
 *    other three tenths are where the shape of the curve bends — the median
 *    of the log-log breakpoint (Beaver: two lines in log–log space, the knee
 *    where their slopes part) and the first breakpoint of a three-segment
 *    regression. The result is kept between baseline + 0.4 and that ceiling
 *    on the curve. Against those coaches this lands a mean 6.4 % off (median
 *    4 %) — the previous pipeline 6.4 % too, with 43 LT1s over 2.5 mmol/L.
 * 6. LT2 (anaerobic threshold) — the median of three methods that answer
 *    different questions and agree when the test is clean:
 *      · OBLA 4.0 mmol/L (when the test reached it)
 *      · modified D-max: the point furthest below the chord LT1 → last stage
 *        (the stage before it when the last one exploded — a jump of over
 *        2 mmol/L and 45 % — because that stage is VO2max, not the chord's end)
 *      · IAT (Dickhuth): lactate at LT1 + 1.5 mmol/L
 *    A candidate under 2.5 mmol/L, over 5.5, or within 4 % of LT1 is not an
 *    anaerobic threshold and does not vote. With nothing left, LT2 falls back
 *    to OBLA 4.0, then 3.5, then the last stage — and says so. Classic D-max
 *    and the second regression breakpoint are reported for the table but do
 *    not vote: on the coach-corrected tests they pulled the median late.
 *    Error against those coaches: mean 4.6 %, median 2.7 % (previously 6.7 %
 *    and 3.6 %).
 * 7. Confidence 0–100: how much the methods agreed, how many stages there
 *    were, whether the test reached 4 mmol/L, how clean the readings were,
 *    and whether LT2/LT1 is a ratio a human produces.
 *
 * Why not the previous approach: the old pipeline read LT2 as "the middle of
 * the steepest measured step" and pulled LT1 to it with a minimum-gap rule,
 * so a runner whose lactate jumped 1.2 → 2.9 between two stages got LT1 and
 * LT2 0.2 mph apart, both inside that one step, while OBLA 4 and D-max —
 * computed and discarded — agreed on a point a full mph faster. Over the 742
 * tests in the database it produced 20 such collapsed pairs, 27 LT2s under
 * 2.5 mmol/L and 14 over 5.5; this engine produces none.
 */

const PACE_SPORTS = new Set(['run', 'running', 'swim', 'swimming']);

export const LT1_RISE_MMOL = 0.8;
export const LT1_TARGET_MIN_MMOL = 1.5;
export const LT1_MIN_ABOVE_BASE = 0.4;
/** LT1 lactate ceiling: 2.5 mmol/L, up to 3.0 for an athlete whose floor is high. */
export const LT1_CAP_MIN_MMOL = 2.5;
export const LT1_CAP_MAX_MMOL = 3.0;
/** How much of LT1 is the baseline crossing; the rest is where the curve bends. */
export const LT1_CROSSING_WEIGHT = 0.7;
export const LT2_MIN_MMOL = 2.5;
export const LT2_MAX_MMOL = 5.5;
export const OBLA_MMOL = 4.0;
export const OBLA_FALLBACK_MMOL = 3.5;
export const IAT_RISE_MMOL = 1.5;
export const MIN_LT2_OVER_LT1 = 1.04;
const CURVE_SAMPLES = 400;

export function isPaceSport(sport) {
  return PACE_SPORTS.has(String(sport || '').toLowerCase());
}

/** Stage value → intensity where higher is harder (watts, or 1/pace). */
export function toIntensity(power, sport) {
  const p = Number(power);
  if (!Number.isFinite(p) || p <= 0) return null;
  return isPaceSport(sport) ? 1000 / p : p;
}

/** Intensity → the stage's own units (watts, or pace seconds). */
export function fromIntensity(u, sport) {
  if (u == null || !Number.isFinite(u) || u <= 0) return null;
  return isPaceSport(sport) ? 1000 / u : u;
}

/** Pool-adjacent-violators: the closest non-decreasing sequence to y. */
export function isotonic(y) {
  const blocks = y.map((v) => ({ sum: v, n: 1 }));
  let i = 0;
  while (i < blocks.length - 1) {
    const a = blocks[i];
    const b = blocks[i + 1];
    if (a.sum / a.n > b.sum / b.n + 1e-12) {
      blocks.splice(i, 2, { sum: a.sum + b.sum, n: a.n + b.n });
      i = Math.max(0, i - 1);
    } else {
      i += 1;
    }
  }
  const out = [];
  blocks.forEach((blk) => { for (let k = 0; k < blk.n; k++) out.push(blk.sum / blk.n); });
  return out;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson). xs strictly increasing,
 * ys non-decreasing → the interpolant is non-decreasing and never overshoots.
 */
export function monotoneCubic(xs, ys) {
  const n = xs.length;
  if (n === 0) return () => NaN;
  if (n === 1) return () => ys[0];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]) / h[lo];
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[lo] + h10 * h[lo] * m[lo] + h01 * ys[lo + 1] + h11 * h[lo] * m[lo + 1];
  };
}

/** Linear interpolation of y at x on a polyline; clamps outside. */
export function interpolateAt(xs, ys, x) {
  const n = xs.length;
  if (!n) return null;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = xs[i + 1] === xs[i] ? 0 : (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[n - 1];
}

/** First x in [x0, x1] where f(x) reaches target (f non-decreasing); null if never. */
export function firstCrossing(f, x0, x1, target) {
  if (!(x1 > x0)) return null;
  if (f(x0) >= target) return x0;
  if (f(x1) < target) return null;
  let lo = x0;
  let hi = x1;
  const step = (x1 - x0) / CURVE_SAMPLES;
  for (let x = x0 + step; x <= x1 + 1e-12; x += step) {
    if (f(x) >= target) { hi = Math.min(x, x1); lo = x - step; break; }
  }
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= target) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * x in (xa, xb) where the curve is furthest below the chord (xa,f(xa))→(xb,f(xb)).
 * Both axes are normalised to the chord first; otherwise a chord in watts
 * against mmol is all x and "perpendicular" means nothing.
 */
export function dmaxOnCurve(f, xa, xb) {
  if (!(xb > xa)) return null;
  const ya = f(xa);
  const yb = f(xb);
  if (!(yb > ya)) return null;
  let best = 0;
  let bestX = null;
  for (let i = 1; i < CURVE_SAMPLES; i++) {
    const x = xa + ((xb - xa) * i) / CURVE_SAMPLES;
    const xn = (x - xa) / (xb - xa);
    const yn = (f(x) - ya) / (yb - ya);
    const dist = xn - yn; // ∝ distance below the diagonal chord
    if (dist > best) { best = dist; bestX = x; }
  }
  return bestX;
}

function fitLine(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const mx = sx / n;
  const my = sy / n;
  const denom = sxx - n * mx * mx;
  if (Math.abs(denom) < 1e-12) return null;
  const slope = (sxy - n * mx * my) / denom;
  const intercept = my - slope * mx;
  let rss = 0;
  for (const [x, y] of pts) { const r = y - (slope * x + intercept); rss += r * r; }
  return { slope, intercept, rss };
}

/**
 * Log-log breakpoint (Beaver 1985): fit two lines in log–log space with the
 * split that minimises the residual, and return the intensity where they
 * meet. Needs five stages; the split leaves at least two on each side.
 */
export function logLogBreakpoint(u, la) {
  const pts = [];
  for (let i = 0; i < u.length; i++) if (u[i] > 0 && la[i] > 0) pts.push([Math.log(u[i]), Math.log(la[i])]);
  if (pts.length < 5) return null;
  let best = null;
  for (let k = 2; k <= pts.length - 2; k++) {
    const left = fitLine(pts.slice(0, k));
    const right = fitLine(pts.slice(k - 1));
    if (!left || !right) continue;
    if (right.slope <= left.slope) continue; // the knee must bend upward
    const rss = left.rss + right.rss;
    if (!best || rss < best.rss) best = { rss, left, right, k };
  }
  if (!best) return null;
  const { left, right } = best;
  const denom = left.slope - right.slope;
  const xLog = Math.abs(denom) < 1e-12 ? pts[best.k - 1][0] : (right.intercept - left.intercept) / denom;
  const x = Math.exp(xLog);
  if (!Number.isFinite(x) || x < u[0] || x > u[u.length - 1]) return Math.exp(pts[best.k - 1][0]);
  return x;
}

/** Solve A·x = b for a small dense system (Gaussian elimination with pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function segmentedSSE(u, la, b1, b2) {
  const X = u.map((x) => [1, x, Math.max(0, x - b1), Math.max(0, x - b2)]);
  const p = 4;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * la[i];
      for (let c = 0; c < p; c++) XtX[a][c] += X[i][a] * X[i][c];
    }
  }
  const beta = solve(XtX, Xty);
  if (!beta) return Infinity;
  let sse = 0;
  for (let i = 0; i < X.length; i++) {
    const pred = X[i].reduce((s, v, k) => s + v * beta[k], 0);
    sse += (la[i] - pred) ** 2;
  }
  return sse;
}

/**
 * Three-segment linear regression: the two breakpoints (from the interior
 * stages) whose piecewise fit leaves the smallest residual.
 */
export function segmentedBreakpoints(u, la) {
  const n = u.length;
  if (n < 5) return { lt1: null, lt2: null };
  const cands = u.slice(1, n - 1);
  let best = { sse: Infinity, lt1: null, lt2: null };
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const sse = segmentedSSE(u, la, cands[i], cands[j]);
      if (sse < best.sse) best = { sse, lt1: cands[i], lt2: cands[j] };
    }
  }
  return { lt1: best.lt1, lt2: best.lt2 };
}

function median(arr) {
  const a = arr.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Stages in entry order whose intensity falls below an earlier one are typos. */
export function dropOutOfOrderStages(stages) {
  if (stages.length < 5) return stages;
  let maxSoFar = -Infinity;
  const keep = [];
  for (const s of stages) {
    if (s.u < maxSoFar) continue;
    maxSoFar = s.u;
    keep.push(s);
  }
  return keep.length >= 4 ? keep : stages;
}

/**
 * @param {object} test
 * @param {string} test.sport   'bike' | 'run' | 'swim' (aliases accepted)
 * @param {Array}  test.stages  [{ power, lactate, heartRate }] — power is watts, or pace seconds for run/swim
 * @param {number} [test.baseLactate]  resting sample before the test
 * @returns {object|null} thresholds in the stages' units, or null when there is nothing to read
 */
export function analyzeLactateTest({ sport = 'bike', stages = [], baseLactate = null } = {}) {
  const notes = [];
  const raw = (stages || [])
    .map((s) => ({
      u: toIntensity(s.power, sport),
      la: Number(String(s.lactate ?? '').replace(',', '.')),
      hr: s.heartRate != null && Number.isFinite(Number(s.heartRate)) ? Number(s.heartRate) : null,
    }))
    .filter((s) => s.u != null && Number.isFinite(s.la) && s.la > 0);
  if (raw.length < 3) return null;

  const ordered = dropOutOfOrderStages(raw);
  if (ordered.length !== raw.length) notes.push(`${raw.length - ordered.length} stage(s) entered out of order were left out`);
  const pts = [...ordered].sort((a, b) => a.u - b.u);
  // A first stage a full mmol above the second is the warm-up still in the
  // blood, not the start of the curve.
  while (pts.length >= 5 && pts[0].la >= pts[1].la + 1.0) {
    pts.shift();
    notes.push('first stage read a warm-up spike and was left out');
  }
  // Lactate falling as intensity rises is not a step test — most often the
  // paces were typed as speeds or the other way round.
  if (pts.length >= 4) {
    const third = Math.max(1, Math.floor(pts.length / 3));
    const head = pts.slice(0, third).reduce((a, p) => a + p.la, 0) / third;
    const tail = pts.slice(-third).reduce((a, p) => a + p.la, 0) / third;
    if (tail < head) return null;
  }
  // Two stages at one intensity: keep the later reading's mean.
  const merged = [];
  for (const p of pts) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.u - p.u) < 1e-9) { last.la = (last.la + p.la) / 2; last.hr = last.hr ?? p.hr; }
    else merged.push({ ...p });
  }
  const n = merged.length;
  if (n < 3) return null;
  const u = merged.map((p) => p.u);
  const laRaw = merged.map((p) => p.la);
  const laIso = isotonic(laRaw);
  const violations = laRaw.reduce((c, v, i) => (i > 0 && v < laRaw[i - 1] - 1e-9 ? c + 1 : c), 0);
  const curve = monotoneCubic(u, laIso);
  const uMin = u[0];
  const uMax = u[n - 1];
  const laMax = laIso[n - 1];

  const base = Number(baseLactate);
  const earlyMin = Math.min(...laRaw.slice(0, Math.max(2, Math.ceil(n / 2))));
  const baseline = Number.isFinite(base) && base > 0 ? Math.min(base, earlyMin) : earlyMin;

  // ── LT1 ──────────────────────────────────────────────────────────────────
  const seg = segmentedBreakpoints(u, laIso);
  const lt1Cap = Math.min(LT1_CAP_MAX_MMOL, Math.max(LT1_CAP_MIN_MMOL, baseline + 1.0));
  const lt1Target = Math.min(lt1Cap, Math.max(LT1_TARGET_MIN_MMOL, baseline + LT1_RISE_MMOL));
  const lt1Candidates = {
    baseline: firstCrossing(curve, uMin, uMax, lt1Target),
    loglog: logLogBreakpoint(u, laIso),
    segmented: seg.lt1,
  };
  const shape = median([lt1Candidates.loglog, lt1Candidates.segmented]);
  let lt1 = lt1Candidates.baseline != null && shape != null
    ? LT1_CROSSING_WEIGHT * lt1Candidates.baseline + (1 - LT1_CROSSING_WEIGHT) * shape
    : (lt1Candidates.baseline ?? shape);
  let lt1Clamped = null;
  if (laIso[0] >= lt1Target) {
    // Nothing below the aerobic threshold was measured.
    lt1 = uMin;
    lt1Clamped = 'first stage — the test started above the aerobic threshold';
  } else if (lt1 == null) {
    lt1 = firstCrossing(curve, uMin, uMax, baseline + LT1_MIN_ABOVE_BASE) ?? uMin;
    notes.push('LT1: no method could read a rise; set where lactate first leaves the baseline');
  } else {
    const laAtLt1 = curve(lt1);
    if (laAtLt1 < baseline + LT1_MIN_ABOVE_BASE) {
      const moved = firstCrossing(curve, uMin, uMax, baseline + LT1_MIN_ABOVE_BASE);
      if (moved != null) { lt1 = moved; lt1Clamped = 'raised to baseline + 0.4'; }
    } else if (laAtLt1 > lt1Cap) {
      const moved = firstCrossing(curve, uMin, uMax, lt1Cap);
      if (moved != null) { lt1 = moved; lt1Clamped = `lowered to ${lt1Cap.toFixed(1)} mmol/L`; }
    }
  }
  if (lt1Clamped) notes.push(`LT1 ${lt1Clamped}`);
  const lt1La = curve(lt1);

  // ── LT2 ──────────────────────────────────────────────────────────────────
  // The chord for D-max ends at the last stage — unless that stage exploded,
  // in which case it is the athlete past VO2max, not the end of the curve.
  const lastJump = n >= 3 ? laIso[n - 1] - laIso[n - 2] : 0;
  const explosiveFinish = n >= 5 && lastJump > 2.0 && lastJump > 0.45 * laIso[n - 2];
  const chordEnd = explosiveFinish ? u[n - 2] : uMax;
  if (explosiveFinish) notes.push('last stage exploded; D-max chord ends at the stage before it');
  const lt2Candidates = {
    obla4: laMax >= OBLA_MMOL ? firstCrossing(curve, uMin, uMax, OBLA_MMOL) : null,
    modifiedDmax: dmaxOnCurve(curve, lt1, chordEnd),
    iat: firstCrossing(curve, uMin, uMax, lt1La + IAT_RISE_MMOL),
    dmax: dmaxOnCurve(curve, uMin, chordEnd),
    segmented: seg.lt2,
  };
  const VOTING = ['obla4', 'modifiedDmax', 'iat'];
  const lt2Floor = lt1 * MIN_LT2_OVER_LT1;
  const plausible = (x) => x != null && Number.isFinite(x) && curve(x) >= LT2_MIN_MMOL && curve(x) <= LT2_MAX_MMOL;
  const voters = VOTING.filter((k) => plausible(lt2Candidates[k]));
  let lt2 = median(voters.map((k) => lt2Candidates[k]));
  let lt2Fallback = null;
  if (lt2 == null) {
    const at4 = lt2Candidates.obla4;
    const at35 = laMax >= OBLA_FALLBACK_MMOL ? firstCrossing(curve, uMin, uMax, OBLA_FALLBACK_MMOL) : null;
    if (at4 != null) { lt2 = at4; lt2Fallback = 'OBLA 4.0'; }
    else if (at35 != null) { lt2 = at35; lt2Fallback = 'OBLA 3.5'; }
    else { lt2 = uMax; lt2Fallback = 'last stage'; }
    notes.push(lt2Fallback === 'last stage'
      ? 'LT2: the test ended before the anaerobic threshold (lactate never reached 2.5 mmol/L) — the last stage is a lower bound'
      : `LT2: no method agreed; ${lt2Fallback} used`);
  }
  let lt2Raised = false;
  if (lt2 < lt2Floor) {
    // Coarse stages can put both thresholds inside one step; the anaerobic
    // one is still the later of the two.
    lt2 = Math.min(lt2Floor, uMax);
    lt2Raised = true;
    notes.push('LT2 kept 4 % above LT1 — the stages were too coarse to separate the two');
  }
  const lt2La = curve(lt2);

  // ── Confidence ───────────────────────────────────────────────────────────
  let confidence = 100;
  const votes = voters.map((k) => lt2Candidates[k]);
  const spread = votes.length >= 2
    ? (Math.max(...votes) - Math.min(...votes)) / Math.max(1e-9, lt2 - lt1)
    : 1;
  confidence -= Math.min(35, Math.round(spread * 35));
  if (voters.length < 3) confidence -= 10;
  if (n < 6) confidence -= 10;
  if (n < 5) confidence -= 10;
  if (laMax < OBLA_MMOL) confidence -= 15;
  confidence -= Math.min(20, Math.max(0, violations - 1) * 8);
  if (lt1Clamped) confidence -= lt1Clamped.startsWith('first stage') ? 20 : 10;
  if (lt2Fallback) confidence -= lt2Fallback === 'last stage' ? 35 : 20;
  if (lt2Raised) confidence -= 15;
  const ratio = lt2 / lt1;
  if (ratio != null && (ratio < 1.06 || ratio > 1.45)) confidence -= 15;
  confidence = Math.max(5, Math.min(100, confidence));

  const hrAt = (x) => {
    const known = merged.filter((p) => p.hr != null);
    if (known.length < 2) return null;
    return Math.round(interpolateAt(known.map((p) => p.u), known.map((p) => p.hr), x));
  };
  const out = (x) => fromIntensity(x, sport);
  const outCandidates = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, out(v)]));

  return {
    sport,
    baseline,
    stagesUsed: n,
    lt1: {
      value: out(lt1),
      lactate: Number(lt1La.toFixed(2)),
      lactateRaw: Number(interpolateAt(u, laRaw, lt1).toFixed(2)),
      heartRate: hrAt(lt1),
      candidates: outCandidates(lt1Candidates),
      clamped: lt1Clamped,
    },
    lt2: {
      value: out(lt2),
      lactate: Number(lt2La.toFixed(2)),
      lactateRaw: Number(interpolateAt(u, laRaw, lt2).toFixed(2)),
      heartRate: hrAt(lt2),
      candidates: outCandidates(lt2Candidates),
      voters,
      fallback: lt2Fallback,
    },
    ratio: Number(ratio.toFixed(3)),
    confidence,
    violations,
    notes,
  };
}
