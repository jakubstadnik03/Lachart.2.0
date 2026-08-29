/**
 * HR–power (and HR–pace) profiling: what the heart is doing at a given demand,
 * how that has moved since the last lactate test, and how far the zones on
 * file have drifted from reality.
 *
 * The job of this module is to close the loop between a test and the weeks of
 * training that follow it. A lactate test is a good anchor and a stale one: it
 * pins LT1/LT2 and the heart rates that go with them on one day, and from the
 * next day on the athlete keeps training while those numbers stay frozen.
 * Every steady endurance session since then is a partial re-test nobody reads
 * — known demand, known heart rate, hours of it.
 *
 * The read is deliberately conservative:
 *
 *   · The TEST supplies the shape of the HR–demand line (its slope). Fitting a
 *     slope out of one ride is hopeless — the demand range is too narrow and
 *     the estimate swings by tens of watts on noise. Fitting only the OFFSET
 *     against a slope the test already measured is stable from four points.
 *   · Only steady, plateaued segments count. Intervals, surges, coasting and
 *     the opening minutes are discarded: HR lags demand, so a mean over a
 *     ragged effort is not a point on any curve.
 *   · Within-session cardiac drift gets its own term instead of being smeared
 *     into the offset. That keeps the headline number "HR at LT2 when fresh",
 *     and turns the drift coefficient into a durability read of its own.
 *   · Heat is corrected explicitly and the correction is always reported,
 *     because a 31 °C ride otherwise looks like a fitness collapse.
 *
 * Nothing here overrides a test. The output is evidence that it may be time to
 * do another one.
 */

// ── Tunables ────────────────────────────────────────────────────────────────

/** One steady sample. Long enough for HR to mean out, short enough to exist on a real ride. */
const WINDOW_SEC = 150;
/** Windows overlap; a stride of half the window doubles the yield without inventing data. */
const STRIDE_SEC = 30;
/** HR kinetics plus warm-up. Nothing before this is steady state, whatever the power says. */
const WARMUP_SKIP_SEC = 300;
/** Above this the window is an interval, not a plateau. */
const MAX_HR_SLOPE_BPM_PER_MIN = 1.5;
/** Fraction of samples in a window that must carry both demand and HR. */
const MIN_COVERAGE = 0.85;
/**
 * Demand band to accept. The floor sits just under LT1 rather than at some
 * fraction of LT2, because that is where the HR-demand line stops being a
 * line: below the aerobic threshold HR flattens out, and a recovery spin
 * extrapolated up to LT2 produces a confident number built on curvature.
 * Falls back to a fraction of LT2 only when the test has no LT1.
 */
const DEMAND_FLOOR_OF_LT1 = 0.85;
const DEMAND_FLOOR_OF_LT2 = 0.60;
const DEMAND_CEIL_OF_LT2 = 1.05;
/** How far the steady points may sit below LT2 before the read is a guess. */
const EXTRAPOLATION_MEDIUM = 0.30;
const EXTRAPOLATION_LOW = 0.45;

/**
 * Physiological sanity, applied to the fit's own output.
 *
 * A well-conditioned fit on a bad trace still returns a number, and on real
 * data it does so regularly: a treadmill whose footpod is out of calibration, a
 * chest strap dropping out, a session that is nine points of noise. Those
 * arrive as a threshold that moved a quarter in one session, or a heart rate
 * climbing twenty-odd beats an hour at constant effort. Neither happens to
 * humans, so neither is reported.
 *
 * The far limits reject; the near ones only drop confidence, which is enough to
 * keep a shaky session out of the trend without pretending it never existed.
 */
const DRIFT_SUSPECT_BPM_H = 15;
const DRIFT_REJECT_BPM_H = 25;
const SHIFT_SUSPECT_PCT = 12;
const SHIFT_REJECT_PCT = 25;
/** Free (two-parameter) fits need this much demand range, as a fraction of LT2. */
const FREE_FIT_MIN_RANGE_OF_LT2 = 0.18;

/**
 * Cardiovascular drift from heat. Literature spreads roughly 0.4–1.0 bpm per °C
 * for prolonged submaximal work; the low end is used on purpose, so the
 * correction never manufactures a fitness gain that is really air conditioning.
 */
const TEMP_BPM_PER_C = 0.6;
const TEMP_NEUTRAL_C = 20;

/** HR lag behind demand, searched over this range by cross-correlation. */
const MAX_LAG_SEC = 60;

// ── Small numerics ──────────────────────────────────────────────────────────

function mean(xs) {
  let s = 0;
  let n = 0;
  for (const x of xs) if (Number.isFinite(x)) { s += x; n += 1; }
  return n ? s / n : NaN;
}

/** Gaussian elimination with partial pivoting. Returns null on a singular system. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Least-squares slope of y on x. Used for HR plateau tests and the test-curve slope. */
function linreg(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    sxy += dx * (ys[i] - my);
    sxx += dx * dx;
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  return { slope, intercept, r2: ssTot > 1e-12 ? 1 - ssRes / ssTot : 0, n };
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den > 1e-12 ? sxy / den : 0;
}

function median(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ── Sport / unit handling ───────────────────────────────────────────────────

export function sportKind(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycl') || s.includes('virtual') || s.includes('mtb')) return 'bike';
  if (s.includes('swim')) return 'swim';
  if (s.includes('run')) return 'run';
  return 'other';
}

/**
 * Convert a threshold as the test stores it into the engine's demand unit:
 * watts for the bike, metres per second for running. Everything downstream
 * works in "bigger is harder" so pace never has to be special-cased again.
 */
export function thresholdToDemand(value, { kind, storageMode }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (kind === 'bike') return n;
  if (kind === 'run') return storageMode === 'speed' ? n / 3.6 : 1000 / n;
  if (kind === 'swim') return storageMode === 'speed' ? n : 100 / n;
  return null;
}

/** Inverse of thresholdToDemand — back to the unit the UI already knows how to print. */
export function demandToThreshold(demand, { kind, storageMode }) {
  const n = Number(demand);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (kind === 'bike') return n;
  if (kind === 'run') return storageMode === 'speed' ? n * 3.6 : 1000 / n;
  if (kind === 'swim') return storageMode === 'speed' ? n : 100 / n;
  return null;
}

/**
 * Grade-adjusted running cost. A 6 % climb at 4:30/km is nowhere near the same
 * physiological demand as 4:30/km on the flat, and without this every hilly run
 * reads as a fitness collapse. Quartic fit through the Minetti metabolic-cost
 * curve, clamped to the gradients where that curve was actually measured.
 */
export function gradeFactor(gradeFraction) {
  const g = Math.max(-0.30, Math.min(0.30, Number(gradeFraction) || 0));
  return 1 + 4.72 * g + 18.2 * g * g - 15.1 * g * g * g - 40.4 * g * g * g * g;
}

// ── Step 1: records → a clean 1 Hz demand/HR series ─────────────────────────

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Flatten activity records onto a uniform one-second grid.
 *
 * Records arrive at 1 s (FIT), 5 s (synthesised from laps) or irregularly
 * (Strava streams with pauses). Resampling first means every window below is
 * the same number of real seconds, whatever the source.
 *
 * @returns {{t:Float64Array, demand:Float64Array, hr:Float64Array, n:number, kind:string}|null}
 */
export function toSeries(records, sport) {
  const kind = sportKind(sport);
  if (!Array.isArray(records) || records.length < 30) return null;

  const t0 = new Date(records[0]?.timestamp || 0).getTime();
  if (!Number.isFinite(t0)) return null;

  const raw = [];
  let prevAlt = null;
  let prevDist = null;

  for (const r of records) {
    const ms = new Date(r?.timestamp || 0).getTime();
    if (!Number.isFinite(ms)) continue;
    const t = Math.round((ms - t0) / 1000);
    if (t < 0 || t > 24 * 3600) continue;

    const hr = num(r.heartRate ?? r.heart_rate ?? r.hr);
    let demand = null;

    if (kind === 'bike') {
      demand = num(r.power ?? r.watts);
    } else if (kind === 'run') {
      const speed = num(r.speed ?? r.enhanced_speed ?? r.velocity_smooth);
      if (speed) {
        // Grade from consecutive altitude/distance, when both are present.
        const alt = Number(r.altitude);
        const dist = Number(r.distance);
        let grade = 0;
        if (Number.isFinite(alt) && Number.isFinite(dist) && prevAlt != null && prevDist != null) {
          const dd = dist - prevDist;
          if (dd > 0.5) grade = (alt - prevAlt) / dd;
        }
        if (Number.isFinite(alt)) prevAlt = alt;
        if (Number.isFinite(dist)) prevDist = dist;
        // Equivalent flat speed: the pace that would cost the same.
        demand = speed * gradeFactor(grade);
      }
    }

    raw.push({ t, demand, hr });
  }

  if (raw.length < 30) return null;
  raw.sort((a, b) => a.t - b.t);
  const span = raw[raw.length - 1].t;
  if (span < 600) return null; // under ten minutes there is nothing to say

  const n = span + 1;
  const t = new Float64Array(n);
  const demand = new Float64Array(n).fill(NaN);
  const hr = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i += 1) t[i] = i;

  // Forward-fill each sample across the gap until the next one, but only over
  // short gaps — a ten-minute café stop must not become ten minutes of data.
  for (let i = 0; i < raw.length; i += 1) {
    const cur = raw[i];
    const next = raw[i + 1];
    const gap = next ? Math.min(next.t - cur.t, 10) : 1;
    for (let k = 0; k < Math.max(1, gap); k += 1) {
      const idx = cur.t + k;
      if (idx >= n) break;
      if (cur.demand != null) demand[idx] = cur.demand;
      if (cur.hr != null) hr[idx] = cur.hr;
    }
  }

  return { t, demand, hr, n, kind };
}

// ── Step 2: HR lag ──────────────────────────────────────────────────────────

/**
 * Heart rate trails demand by 20–45 s in most athletes. Left uncorrected, every
 * window that starts on a change of pace pairs the old HR with the new demand,
 * which biases the offset in whichever direction the ride happened to ramp.
 * Cross-correlate and take the best lag.
 */
export function estimateHrLag(series) {
  const { demand, hr, n } = series;
  const d = [];
  const h = [];
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(demand[i]) && Number.isFinite(hr[i])) { d.push(demand[i]); h.push(hr[i]); }
  }
  if (d.length < 300) return 0;

  let best = 0;
  let bestR = -2;
  for (let lag = 0; lag <= MAX_LAG_SEC; lag += 5) {
    const a = [];
    const b = [];
    for (let i = 0; i + lag < n; i += 1) {
      if (Number.isFinite(demand[i]) && Number.isFinite(hr[i + lag])) { a.push(demand[i]); b.push(hr[i + lag]); }
    }
    if (a.length < 300) continue;
    const r = pearson(a, b);
    if (r > bestR) { bestR = r; best = lag; }
  }
  // A flat correlation surface means the ride was too steady to date the lag;
  // 30 s is the population middle and beats a confidently wrong 0.
  return bestR < 0.3 ? 30 : best;
}

function applyLag(series, lagSec) {
  if (!lagSec) return series;
  const { t, demand, hr, n, kind } = series;
  const shifted = new Float64Array(n).fill(NaN);
  for (let i = 0; i + lagSec < n; i += 1) shifted[i] = hr[i + lagSec];
  return { t, demand, hr: shifted, n, kind };
}

// ── Step 3: steady-state segments ───────────────────────────────────────────

/**
 * Pull out the windows where demand held still and HR had stopped climbing.
 * These are the only places where "HR at this demand" means anything.
 *
 * @returns {Array<{tMid:number, durH:number, demand:number, hr:number, cv:number, hrSlope:number}>}
 */
export function steadySegments(series, { lt2Demand, lt1Demand, maxDemandCv }) {
  const { demand, hr, n, kind } = series;
  const floor = lt1Demand > 0
    ? lt1Demand * DEMAND_FLOOR_OF_LT1
    : lt2Demand * DEMAND_FLOOR_OF_LT2;
  const ceil = lt2Demand * DEMAND_CEIL_OF_LT2;
  const cvLimit = maxDemandCv ?? (kind === 'run' ? 0.06 : 0.10);
  const out = [];

  for (let start = WARMUP_SKIP_SEC; start + WINDOW_SEC <= n; start += STRIDE_SEC) {
    const ds = [];
    const hs = [];
    const ts = [];
    for (let i = start; i < start + WINDOW_SEC; i += 1) {
      if (Number.isFinite(demand[i]) && Number.isFinite(hr[i])) {
        ds.push(demand[i]);
        hs.push(hr[i]);
        ts.push(i);
      }
    }
    if (ds.length < WINDOW_SEC * MIN_COVERAGE) continue;

    const dMean = mean(ds);
    if (!(dMean >= floor && dMean <= ceil)) continue;

    const sd = Math.sqrt(mean(ds.map((x) => (x - dMean) ** 2)));
    const cv = dMean > 0 ? sd / dMean : 1;
    if (cv > cvLimit) continue;

    const hrFit = linreg(ts, hs);
    const hrSlope = hrFit ? hrFit.slope * 60 : 0; // bpm per minute
    if (Math.abs(hrSlope) > MAX_HR_SLOPE_BPM_PER_MIN) continue;

    const tMid = start + WINDOW_SEC / 2;
    out.push({
      tMid,
      durH: tMid / 3600,
      demand: dMean,
      hr: mean(hs),
      cv,
      hrSlope,
    });
  }

  // Overlapping windows are near-duplicates. Keep one per non-overlapping slot
  // so the fit is not silently weighted toward whichever stretch was longest.
  const kept = [];
  let lastT = -Infinity;
  for (const p of out) {
    if (p.tMid - lastT >= WINDOW_SEC) { kept.push(p); lastT = p.tMid; }
  }
  return kept;
}

/**
 * The whole session as a cloud of (demand, heart rate), not just the parts
 * steady enough to fit a line through.
 *
 * The drift read is deliberately fussy and throws away most of a training week
 * — intervals, recovery spins, stop-start rides. But "where did today actually
 * sit against the zones this test set" is answerable for any session with a
 * heart rate, and it is the question most athletes are asking when they open a
 * ride. So the same lag-corrected, grade-adjusted series that feeds the fit is
 * also averaged into bins and handed to the chart.
 *
 * Binned rather than raw: a two-hour ride is 7000 samples, which no scatter can
 * draw and no eye can read. Thirty-second means keep the shape of the session —
 * the intervals still separate from the recoveries — at a couple of hundred
 * points.
 *
 * @returns {Array<{t:number, demand:number, hr:number, sec:number}>}
 */
export function sessionCloud(series, { binSec = 30 } = {}) {
  if (!series) return [];
  const { demand, hr, n } = series;
  const out = [];
  for (let start = 0; start < n; start += binSec) {
    const ds = [];
    const hs = [];
    for (let i = start; i < Math.min(start + binSec, n); i += 1) {
      if (Number.isFinite(demand[i]) && Number.isFinite(hr[i])) { ds.push(demand[i]); hs.push(hr[i]); }
    }
    // Half a bin of paired data or it is a gap, not a point.
    if (ds.length < binSec / 2) continue;
    out.push({
      t: start + binSec / 2,
      demand: mean(ds),
      hr: mean(hs),
      sec: ds.length,
    });
  }
  return out;
}

/**
 * The test's lactate curve, as a function you can ask about any intensity.
 *
 * Field lactate is the one measurement that speaks directly to the curve the
 * test drew: a sample taken at 265 W is a point that either sits on the line
 * from test day or has moved off it. Comparing them is more useful than either
 * number alone, and unlike the drift fit it needs nothing but one blood value.
 *
 * Piecewise-linear between measured stages, and deliberately **null outside the
 * tested range**. Lactate curves are exponential at the top; extrapolating past
 * the last stage would invent the steepest, most consequential part of the
 * curve, and a sprint lap would come back "8 mmol below expected".
 *
 * @param {object} anchor  extractLactateThresholds() output
 * @returns {null | {at:(demand:number)=>number|null, points:Array, min:number, max:number}}
 */
export function testLactateCurve(anchor) {
  if (!anchor) return null;
  const kind = sportKind(anchor.sport);
  const pts = (anchor.points || [])
    .map((p) => ({
      demand: thresholdToDemand(p.x, { kind, storageMode: anchor.storageMode }),
      lactate: Number(p.y),
    }))
    .filter((p) => Number.isFinite(p.demand) && p.demand > 0 && Number.isFinite(p.lactate) && p.lactate > 0)
    .sort((a, b) => a.demand - b.demand);

  if (pts.length < 3) return null;
  const min = pts[0].demand;
  const max = pts[pts.length - 1].demand;

  return {
    points: pts,
    min,
    max,
    at(demand) {
      const d = Number(demand);
      if (!Number.isFinite(d) || d < min || d > max) return null;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        if (d >= a.demand && d <= b.demand) {
          const span = b.demand - a.demand;
          if (span < 1e-9) return a.lactate;
          return a.lactate + ((d - a.demand) / span) * (b.lactate - a.lactate);
        }
      }
      return null;
    },
  };
}

/**
 * Where a measured lactate sample says the curve now sits.
 *
 * This is the strongest reading in the module and the only one made of blood
 * rather than inference. A sample of 2.6 mmol taken at 265 W is compared with
 * the test's own curve — not "what lactate did the test predict here", which
 * answers in mmol and means little on its own, but the inverse: **at what
 * intensity did the test produce 2.6 mmol?** If the test needed 240 W to reach
 * that value and the athlete now reaches it at 265 W, the curve has moved 25 W
 * to the right, in the unit they train in.
 *
 * Asking it that way round matters. Lactate is steep near threshold and flat
 * below it, so the same vertical error means very different things at different
 * intensities; solving horizontally puts the answer on the axis where a
 * difference is interpretable, and refuses to answer where the curve is too
 * flat to invert.
 *
 * @param {object} anchor   extractLactateThresholds() output
 * @param {Array}  samples  [{demand, lactate, label?}] — demand in engine units
 * @returns {null | {shift:number, shiftPct:number, samples:Array, n:number, confidence:string}}
 */
export function lactateCurveShift(anchor, samples = []) {
  const curve = testLactateCurve(anchor);
  if (!curve) return null;
  const kind = sportKind(anchor.sport);
  const lt2Demand = thresholdToDemand(anchor.lt2, { kind, storageMode: anchor.storageMode });
  if (!(lt2Demand > 0)) return null;

  const pts = curve.points;
  const loLac = Math.min(...pts.map((p) => p.lactate));
  const hiLac = Math.max(...pts.map((p) => p.lactate));

  /** The intensity at which the test produced this lactate. */
  const demandAtLactate = (lactate) => {
    if (!(lactate >= loLac && lactate <= hiLac)) return null;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if ((a.lactate - lactate) * (b.lactate - lactate) <= 0) {
        const rise = b.lactate - a.lactate;
        // A flat rung cannot be inverted: every intensity in it produced the
        // same lactate, so "where was this value" has no single answer.
        if (Math.abs(rise) < 0.05) return null;
        return a.demand + ((lactate - a.lactate) / rise) * (b.demand - a.demand);
      }
    }
    return null;
  };

  const read = [];
  for (const sample of samples) {
    const demand = Number(sample?.demand);
    const lactate = Number(sample?.lactate);
    if (!Number.isFinite(demand) || demand <= 0) continue;
    if (!Number.isFinite(lactate) || lactate <= 0) continue;
    const expectedAt = demandAtLactate(lactate);
    if (expectedAt == null) continue;
    read.push({
      ...sample,
      demand,
      lactate,
      expectedDemand: expectedAt,
      expectedLactate: curve.at(demand),
      shift: demand - expectedAt,
      shiftPct: ((demand - expectedAt) / lt2Demand) * 100,
    });
  }

  if (!read.length) return null;

  const shift = median(read.map((r) => r.shift));
  const shiftPct = (shift / lt2Demand) * 100;
  // One sample is an anecdote — a mistimed finger prick, a gel, a hot day.
  // Three that agree is a curve that moved.
  const spread = read.length > 1
    ? Math.max(...read.map((r) => r.shiftPct)) - Math.min(...read.map((r) => r.shiftPct))
    : Infinity;
  const confidence = read.length >= 3 && spread < 12 ? 'high'
    : read.length >= 2 && spread < 20 ? 'medium'
      : 'low';

  return { shift, shiftPct, samples: read, n: read.length, confidence, lt2Demand };
}

/**
 * Where the session sat in the test's zones — on both axes at once.
 *
 * Time-in-zones is normally computed for one metric and the choice is left to
 * the athlete: power zones OR heart-rate zones. Read separately they agree
 * often enough to look redundant, and the interesting sessions are exactly the
 * ones where they do not. Riding Z2 power at Z3 heart rate is the signature of
 * heat, fatigue, illness or altitude; the reverse — Z4 power at Z2 heart rate —
 * is what short intervals look like before the heart has caught up.
 *
 * Neither shows up in a single-metric breakdown, so both are computed off the
 * same lag-corrected bins and compared bin by bin.
 *
 * @param {Array}  cloud         sessionCloud() output
 * @param {object} o
 * @param {number[]} o.demandBounds  six ascending intensity boundaries
 * @param {number[]} o.hrBounds      six ascending heart-rate boundaries
 * @returns {null | {demandSec:number[], hrSec:number[], totalSec:number,
 *                   agreeSec:number, hrHigherSec:number, hrLowerSec:number,
 *                   verdict:string}}
 */
export function zoneAgreement(cloud, { demandBounds, hrBounds } = {}) {
  if (!Array.isArray(cloud) || !cloud.length) return null;
  if (!Array.isArray(demandBounds) || demandBounds.length !== 6) return null;
  if (!Array.isArray(hrBounds) || hrBounds.length !== 6) return null;

  /** 0-based zone index, clamped: anything under Z1 counts as Z1, over Z5 as Z5. */
  const zoneOf = (value, bounds) => {
    for (let i = 0; i < 5; i += 1) {
      if (value < bounds[i + 1]) return i;
    }
    return 4;
  };

  const demandSec = [0, 0, 0, 0, 0];
  const hrSec = [0, 0, 0, 0, 0];
  let agreeSec = 0;
  let hrHigherSec = 0;
  let hrLowerSec = 0;
  let totalSec = 0;

  for (const bin of cloud) {
    const sec = Number(bin.sec) || 0;
    if (sec <= 0) continue;
    const dz = zoneOf(bin.demand, demandBounds);
    const hz = zoneOf(bin.hr, hrBounds);
    demandSec[dz] += sec;
    hrSec[hz] += sec;
    totalSec += sec;
    if (dz === hz) agreeSec += sec;
    else if (hz > dz) hrHigherSec += sec;
    else hrLowerSec += sec;
  }

  if (!totalSec) return null;

  // Only call a lean when it is big enough to mean something. Below a fifth of
  // the session the difference is bin-boundary noise, not a physiological story.
  const LEAN = 0.2;
  const verdict = hrHigherSec / totalSec > LEAN && hrHigherSec > hrLowerSec * 1.5
    ? 'hr-higher'
    : hrLowerSec / totalSec > LEAN && hrLowerSec > hrHigherSec * 1.5
      ? 'hr-lower'
      : 'aligned';

  return { demandSec, hrSec, totalSec, agreeSec, hrHigherSec, hrLowerSec, verdict };
}

/**
 * The test's heart rate as a function of intensity, read straight off its
 * stages.
 *
 * The threshold fit elsewhere in this file extrapolates to LT2, which is why it
 * refuses easy sessions: reaching 384 W from a ride held at 250 W multiplies
 * every small error. But the question an athlete actually asks after an easy
 * ride — "I sat at 250 W and my heart was at 120; what was it on test day?" —
 * needs no extrapolation at all. The test measured 250 W. Look it up.
 *
 * Null outside the tested range, for the same reason as the lactate curve: past
 * the last stage there is no measurement, only a guess with a number attached.
 */
export function testHrCurve(anchor) {
  if (!anchor) return null;
  const kind = sportKind(anchor.sport);
  const pts = (anchor.points || [])
    .map((p) => ({
      demand: thresholdToDemand(p.x, { kind, storageMode: anchor.storageMode }),
      hr: Number(p.hr),
    }))
    .filter((p) => Number.isFinite(p.demand) && p.demand > 0 && Number.isFinite(p.hr) && p.hr > 40)
    .sort((a, b) => a.demand - b.demand);

  if (pts.length < 3) return null;
  const min = pts[0].demand;
  const max = pts[pts.length - 1].demand;

  return {
    points: pts,
    min,
    max,
    at(demand) {
      const d = Number(demand);
      if (!Number.isFinite(d) || d < min || d > max) return null;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        if (d >= a.demand && d <= b.demand) {
          const span = b.demand - a.demand;
          if (span < 1e-9) return a.hr;
          return a.hr + ((d - a.demand) / span) * (b.hr - a.hr);
        }
      }
      return null;
    },
  };
}

/** Held-still stretches of a session, however easy — the floor is the test's, not LT1's. */
const BLOCK_MIN_SEC = 300;
const BLOCK_TOLERANCE = 0.08;

/**
 * The session as a handful of "you held X for Y minutes" statements.
 *
 * Deliberately looser than steadySegments(): that one feeds a regression and
 * has to reject anything it cannot fit a line through, this one only has to
 * describe what happened. Easy rides qualify, and so does the work portion of
 * an interval session.
 *
 * Bins are merged while they stay within a tolerance of the running mean, so a
 * ride that drifted from 240 to 260 W reads as one block at 250 rather than
 * forty separate readings.
 *
 * @param {Array} cloud  sessionCloud() output
 * @returns {Array<{sec:number, demand:number, hr:number}>} longest first
 */
export function steadyBlocks(cloud, { minSec = BLOCK_MIN_SEC, tolerance = BLOCK_TOLERANCE } = {}) {
  if (!Array.isArray(cloud) || !cloud.length) return [];
  const blocks = [];
  let run = null;

  const close = () => {
    if (run && run.sec >= minSec) {
      blocks.push({ sec: run.sec, demand: run.dSum / run.n, hr: run.hSum / run.n });
    }
    run = null;
  };

  for (const bin of cloud) {
    const sec = Number(bin.sec) || 0;
    if (sec <= 0) continue;
    const mean_ = run ? run.dSum / run.n : null;
    if (run && Math.abs(bin.demand - mean_) <= mean_ * tolerance) {
      run.dSum += bin.demand; run.hSum += bin.hr; run.n += 1; run.sec += sec;
    } else {
      close();
      run = { dSum: bin.demand, hSum: bin.hr, n: 1, sec };
    }
  }
  close();

  return blocks.sort((a, b) => b.sec - a.sec);
}

/**
 * What the test says about the stretches this session actually rode.
 *
 * The headline the athlete wanted: "20 min at 250 W, 120 bpm — on test day
 * 250 W cost you 140." No model, no extrapolation, no threshold: two measured
 * numbers at the same intensity, subtracted.
 *
 * Falls back to the session average when nothing held still for long enough,
 * because an easy ride that wandered is still a comparison worth making and a
 * blank panel teaches people to stop looking.
 *
 * @returns {null | {blocks:Array, fromAverage:boolean, meanDeltaHr:number}}
 */
export function compareToTestCurve(cloud, anchor, { tempAdjustBpm = 0 } = {}) {
  const curve = testHrCurve(anchor);
  if (!curve || !Array.isArray(cloud) || !cloud.length) return null;

  const describe = (b) => {
    const testHr = curve.at(b.demand);
    if (testHr == null) return null;
    const hr = b.hr - tempAdjustBpm;
    return { ...b, hr, testHr, deltaHr: hr - testHr };
  };

  let blocks = steadyBlocks(cloud).map(describe).filter(Boolean);
  let fromAverage = false;

  if (!blocks.length) {
    const totalSec = cloud.reduce((s, b) => s + (Number(b.sec) || 0), 0);
    const avg = {
      sec: totalSec,
      demand: cloud.reduce((s, b) => s + b.demand * b.sec, 0) / totalSec,
      hr: cloud.reduce((s, b) => s + b.hr * b.sec, 0) / totalSec,
    };
    const described = describe(avg);
    if (!described) return null;
    blocks = [described];
    fromAverage = true;
  }

  const weight = blocks.reduce((s, b) => s + b.sec, 0);
  const meanDeltaHr = blocks.reduce((s, b) => s + b.deltaHr * b.sec, 0) / weight;
  return { blocks: blocks.slice(0, 4), fromAverage, meanDeltaHr };
}

/** How close to a threshold still counts as being at it. */
const AT_THRESHOLD_BAND = 0.03;

/**
 * Time spent at the thresholds themselves, rather than in zones derived from
 * them.
 *
 * Five-zone time-in-zone answers a question the zone model invented. LT1 and
 * LT2 are the two intensities this athlete actually had measured, and the
 * useful question about a session is how much of it was spent at them — which
 * a zone split can hide entirely. One athlete's Z4 came out eleven watts wide
 * because their thresholds sit far apart, so "42 minutes in Z4" meant
 * something different for them than for anyone else, while "42 minutes at
 * LT2" means the same thing for everybody.
 *
 * Five buckets: below LT1, at LT1, between, at LT2, above. The bands are ±3%
 * of the threshold, wide enough that holding an effort steady lands in one
 * rather than flickering across the boundary.
 *
 * @param {Array}  cloud   sessionCloud() output
 * @param {object} o
 * @param {number} o.lt1Demand
 * @param {number} o.lt2Demand
 * @returns {null | {belowLt1, atLt1, between, atLt2, aboveLt2, totalSec}}
 */
export function timeAtThresholds(cloud, { lt1Demand, lt2Demand, band = AT_THRESHOLD_BAND } = {}) {
  if (!Array.isArray(cloud) || !cloud.length) return null;
  if (!(lt2Demand > 0)) return null;

  const lt2Lo = lt2Demand * (1 - band);
  const lt2Hi = lt2Demand * (1 + band);
  const hasLt1 = lt1Demand > 0 && lt1Demand < lt2Lo;
  const lt1Lo = hasLt1 ? lt1Demand * (1 - band) : null;
  const lt1Hi = hasLt1 ? lt1Demand * (1 + band) : null;

  const out = { belowLt1: 0, atLt1: 0, between: 0, atLt2: 0, aboveLt2: 0, totalSec: 0 };

  for (const bin of cloud) {
    const sec = Number(bin.sec) || 0;
    const d = Number(bin.demand);
    if (!(sec > 0) || !Number.isFinite(d)) continue;
    out.totalSec += sec;

    if (d > lt2Hi) out.aboveLt2 += sec;
    else if (d >= lt2Lo) out.atLt2 += sec;
    else if (!hasLt1) out.between += sec;
    else if (d > lt1Hi) out.between += sec;
    else if (d >= lt1Lo) out.atLt1 += sec;
    else out.belowLt1 += sec;
  }

  return out.totalSec > 0 ? out : null;
}

/**
 * What intensity this session was meant to hit.
 *
 * Time below LT1 is a miss on a threshold day and exactly right on a recovery
 * ride, so the split above can only be judged against an intention. Read from
 * the plan when there is one, and otherwise from the title, which in practice
 * is where athletes record what a session was for ("Bike LT2", "5x30 LT1").
 *
 * Returns null rather than guessing. A verdict invented from no evidence is
 * worse than no verdict, and most rides are not aimed at a threshold at all.
 *
 * @returns {'lt1'|'lt2'|'easy'|null}
 */
export function sessionIntent({ title = '', plannedTarget = null } = {}) {
  const t = String(plannedTarget || '').toLowerCase();
  if (t.includes('lt2') || t.includes('threshold') || t === 'zone4') return 'lt2';
  if (t.includes('lt1') || t === 'zone2') return 'lt1';

  const s = String(title || '').toLowerCase();
  // Order matters: "LT2" must not be caught by a looser LT1 rule.
  if (/\blt\s*2\b|\bthreshold\b|\banaerob/.test(s)) return 'lt2';
  if (/\blt\s*1\b|\baerob\b/.test(s)) return 'lt1';
  if (/\brege\b|\brecovery\b|\beasy\b|\bregener/.test(s)) return 'easy';
  return null;
}

/**
 * Judge a threshold split against what the session was for.
 *
 * Green is time spent where the session was aimed — and for a threshold day
 * that includes the range between LT1 and LT2, not only the narrow band at the
 * threshold itself, because real interval work lives in that range. Red is
 * time that fell short of it. Everything else stays neutral: harder than
 * intended is not automatically a failure, and without an intent nothing is
 * judged at all.
 *
 * @returns {Object} bucket key → 'good' | 'short' | 'neutral'
 */
export function judgeThresholdSplit(intent) {
  const neutral = {
    belowLt1: 'neutral', atLt1: 'neutral', between: 'neutral',
    atLt2: 'neutral', aboveLt2: 'neutral',
  };
  if (intent === 'lt2') {
    return { ...neutral, belowLt1: 'short', atLt1: 'short', between: 'good', atLt2: 'good' };
  }
  if (intent === 'lt1') {
    return { ...neutral, belowLt1: 'short', atLt1: 'good', between: 'good' };
  }
  if (intent === 'easy') {
    // The miss on an easy day is the other direction.
    return { ...neutral, belowLt1: 'good', atLt1: 'good', atLt2: 'short', aboveLt2: 'short' };
  }
  return neutral;
}

// ── Step 4: the fit ─────────────────────────────────────────────────────────

/**
 * HR–demand slope measured from the test's own stages. This is the shape prior
 * that makes single-session offsets trustworthy, and it is the one place the
 * slope is estimated over a demand range wide enough to identify it.
 *
 * @param {object} anchor  output of extractLactateThresholds()
 * @returns {{slope:number, intercept:number, r2:number, n:number}|null}
 */
export function testHrSlope(anchor) {
  if (!anchor) return null;
  const kind = sportKind(anchor.sport);
  const pts = (anchor.points || [])
    .map((p) => ({
      d: thresholdToDemand(p.x, { kind, storageMode: anchor.storageMode }),
      hr: Number(p.hr),
    }))
    .filter((p) => Number.isFinite(p.d) && p.d > 0 && Number.isFinite(p.hr) && p.hr > 40);

  if (pts.length < 3) return null;
  const fit = linreg(pts.map((p) => p.d), pts.map((p) => p.hr));
  if (!fit || !(fit.slope > 0) || fit.r2 < 0.75) return null;
  return fit;
}

/**
 * Fit HR = a + b·demand + c·hours.
 *
 * Two modes. `anchored` fixes b at the test's slope and solves for the offset
 * and the drift term — stable from four points, and the mode almost every real
 * endurance session lands in. `free` solves all three, and is only allowed when
 * the session itself spanned enough demand to identify a slope.
 */
export function fitSession(points, { slopePrior, lt2Demand }) {
  if (points.length < 4) return null;

  const ds = points.map((p) => p.demand);
  const range = Math.max(...ds) - Math.min(...ds);
  const canFree = lt2Demand > 0 && range / lt2Demand >= FREE_FIT_MIN_RANGE_OF_LT2 && points.length >= 6;

  const residualR2 = (predict) => {
    const ys = points.map((p) => p.hr);
    const my = mean(ys);
    let ssRes = 0;
    let ssTot = 0;
    points.forEach((p, i) => {
      ssRes += (ys[i] - predict(p)) ** 2;
      ssTot += (ys[i] - my) ** 2;
    });
    return ssTot > 1e-12 ? 1 - ssRes / ssTot : 0;
  };

  if (canFree) {
    // Normal equations for [1, demand, hours].
    const cols = [(p) => 1, (p) => p.demand, (p) => p.durH];
    const A = cols.map((ci) => cols.map((cj) => points.reduce((s, p) => s + ci(p) * cj(p), 0)));
    const b = cols.map((ci) => points.reduce((s, p) => s + ci(p) * p.hr, 0));
    const x = solve(A, b);
    if (x && x[1] > 0) {
      const [a, slope, drift] = x;
      const predict = (p) => a + slope * p.demand + drift * p.durH;
      return { a, slope, drift, r2: residualR2(predict), n: points.length, mode: 'free' };
    }
  }

  if (!(slopePrior > 0)) return null;

  // Anchored: subtract the known slope term, then fit offset + drift on what is left.
  const cols = [(p) => 1, (p) => p.durH];
  const resid = points.map((p) => p.hr - slopePrior * p.demand);
  const A = cols.map((ci) => cols.map((cj) => points.reduce((s, p) => s + ci(p) * cj(p), 0)));
  const b = cols.map((ci) => points.reduce((s, p, i) => s + ci(p) * resid[i], 0));
  const x = solve(A, b);
  if (!x) return null;
  const [a, drift] = x;
  const predict = (p) => a + slopePrior * p.demand + drift * p.durH;
  return { a, slope: slopePrior, drift, r2: residualR2(predict), n: points.length, mode: 'anchored' };
}

// ── Step 5: classic session metrics, for context ────────────────────────────

/**
 * Aerobic decoupling (Pw:Hr): how much the demand-per-beat fell across the
 * session. The industry number, kept because coaches read it — but it answers
 * a different question from the drift fit, which is about level, not fade.
 */
export function decoupling(series) {
  const { demand, hr, n } = series;
  const idx = [];
  for (let i = 0; i < n; i += 1) if (Number.isFinite(demand[i]) && Number.isFinite(hr[i])) idx.push(i);
  if (idx.length < 1200) return null; // under 20 min of paired data it is noise

  const half = Math.floor(idx.length / 2);
  const ef = (slice) => {
    const d = mean(slice.map((i) => demand[i]));
    const h = mean(slice.map((i) => hr[i]));
    return h > 0 ? d / h : NaN;
  };
  const first = ef(idx.slice(0, half));
  const second = ef(idx.slice(half));
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0) return null;
  return ((first - second) / first) * 100;
}

// ── The public entry point ──────────────────────────────────────────────────

/**
 * Read one session against the test on file.
 *
 * @param {object}   o
 * @param {Array}    o.records   activity records ({timestamp, power, heartRate, speed, altitude, distance})
 * @param {string}   o.sport
 * @param {object}   o.anchor    extractLactateThresholds() output for the governing test
 * @param {number}  [o.tempC]    ambient temperature, from ActivityWeather
 * @param {object}  [o.slopeFit] pre-computed testHrSlope(anchor), to avoid refitting per session
 *
 * @returns {{ok:boolean, reason?:string, ...}}
 */
export function analyseSession({ records, sport, anchor, tempC = null, slopeFit = null }) {
  const kind = sportKind(sport || anchor?.sport);
  if (kind === 'swim') return { ok: false, reason: 'swim-unsupported' };
  if (kind === 'other') return { ok: false, reason: 'sport-unsupported' };
  if (!anchor) return { ok: false, reason: 'no-test' };

  const storageMode = anchor.storageMode;
  const lt2Demand = thresholdToDemand(anchor.lt2, { kind, storageMode });
  const lt1Demand = thresholdToDemand(anchor.lt1, { kind, storageMode });
  const lt2Hr = Number(anchor.lt2Hr);
  if (!(lt2Demand > 0)) return { ok: false, reason: 'no-lt2' };
  if (!(lt2Hr > 40)) return { ok: false, reason: 'no-lt2-hr' };

  const rawSeries = toSeries(records, kind);
  if (!rawSeries) return { ok: false, reason: 'no-usable-stream' };

  const lagSec = estimateHrLag(rawSeries);
  const series = applyLag(rawSeries, lagSec);

  // Built even when the fit below fails: a session that cannot yield a
  // threshold can still be shown against the athlete's zones, and that is the
  // common case rather than the exception.
  const cloud = sessionCloud(series);

  const points = steadySegments(series, { lt2Demand, lt1Demand });
  if (points.length < 4) {
    return {
      ok: false,
      reason: 'not-enough-steady-state',
      pointsFound: points.length,
      lagSec,
      cloud,
      decoupling: decoupling(series),
    };
  }

  const prior = slopeFit || testHrSlope(anchor);
  const fit = fitSession(points, { slopePrior: prior?.slope, lt2Demand });
  if (!fit) return { ok: false, reason: 'fit-failed', pointsFound: points.length, lagSec, cloud };

  // Heat correction lands on the offset: the whole HR–demand line sits higher
  // when it is hot, it does not tilt.
  const tempAdjustBpm = Number.isFinite(tempC) && tempC > TEMP_NEUTRAL_C
    ? TEMP_BPM_PER_C * (tempC - TEMP_NEUTRAL_C)
    : 0;
  const aFresh = fit.a - tempAdjustBpm;

  // Headline pair. Both say the same thing; athletes read one, coaches the other.
  const hrAtLt2 = aFresh + fit.slope * lt2Demand;
  const demandAtLt2Hr = (lt2Hr - aFresh) / fit.slope;
  const hrAtLt1 = lt1Demand > 0 ? aFresh + fit.slope * lt1Demand : null;

  const deltaHr = hrAtLt2 - lt2Hr;
  const deltaDemand = demandAtLt2Hr - lt2Demand;
  const deltaPct = (deltaDemand / lt2Demand) * 100;

  // Reject before reporting: an impossible number with a caveat attached is
  // still an impossible number, and it lands in the trend either way.
  if (Math.abs(deltaPct) > SHIFT_REJECT_PCT) {
    return {
      ok: false,
      reason: 'implausible-shift',
      deltaPct,
      pointsFound: points.length,
      lagSec,
      cloud,
    };
  }
  if (Math.abs(fit.drift) > DRIFT_REJECT_BPM_H) {
    return {
      ok: false,
      reason: 'implausible-drift',
      driftBpmPerHour: fit.drift,
      pointsFound: points.length,
      lagSec,
      cloud,
    };
  }

  const ds = points.map((p) => p.demand);
  const rangeOfLt2 = (Math.max(...ds) - Math.min(...ds)) / lt2Demand;
  const durationH = points[points.length - 1].durH;

  // Every reported number is the line evaluated AT LT2. If the session never
  // went near LT2, that value is extrapolated, and the further the reach the
  // more a small offset error is levered into watts.
  const centroid = mean(ds);
  const extrapolation = (lt2Demand - centroid) / lt2Demand;

  let confidence = 'low';
  if (fit.n >= 6 && fit.r2 >= 0.6 && rangeOfLt2 >= 0.12) confidence = 'high';
  else if (fit.n >= 4 && fit.r2 >= 0.35) confidence = 'medium';
  // A slope borrowed from a test that itself fitted badly can only ever be a hint.
  if (fit.mode === 'anchored' && !(prior?.r2 >= 0.85) && confidence === 'high') confidence = 'medium';
  if (extrapolation > EXTRAPOLATION_LOW) confidence = 'low';
  else if (extrapolation > EXTRAPOLATION_MEDIUM && confidence === 'high') confidence = 'medium';
  // A large shift or a steep drift is not impossible, but it is far more often
  // a bad trace than a real change, so it never carries weight on its own.
  if (Math.abs(fit.drift) > DRIFT_SUSPECT_BPM_H || Math.abs(deltaPct) > SHIFT_SUSPECT_PCT) {
    confidence = 'low';
  }

  return {
    ok: true,
    kind,
    storageMode,
    lagSec,
    points,
    cloud,
    fit,
    slopeSource: fit.mode === 'free' ? 'session' : 'test',
    slopeR2: prior?.r2 ?? null,

    // Test anchor, echoed so the UI never has to re-derive it
    lt2: anchor.lt2,
    lt2Demand,
    lt2Hr,
    lt1: anchor.lt1,
    lt1Demand,
    lt1Hr: Number(anchor.lt1Hr) || null,

    // What this session says
    hrAtLt2,
    hrAtLt1,
    deltaHr,
    demandAtLt2Hr,
    thresholdAtLt2Hr: demandToThreshold(demandAtLt2Hr, { kind, storageMode }),
    deltaDemand,
    deltaPct,

    driftBpmPerHour: fit.drift,
    decoupling: decoupling(series),
    durationH,
    rangeOfLt2,
    extrapolation,
    tempC: Number.isFinite(tempC) ? tempC : null,
    tempAdjustBpm,
    confidence,
  };
}

// ── Where the thresholds have moved to ─────────────────────────────────────

/**
 * The test curve's steepness at one intensity, in bpm per unit of demand.
 *
 * Not a single slope for the whole curve: heart rate climbs more slowly per
 * watt down in Z1 than it does near threshold, so converting a heart-rate
 * difference into watts with one average slope over-reads easy rides and
 * under-reads hard ones. Read locally, from the two stages either side.
 */
export function localSlopeAt(curve, demand) {
  const pts = curve?.points;
  if (!pts || pts.length < 2) return null;
  const d = Number(demand);
  if (!Number.isFinite(d) || d < curve.min || d > curve.max) return null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (d >= a.demand && d <= b.demand) {
      const run = b.demand - a.demand;
      if (run < 1e-9) return null;
      const slope = (b.hr - a.hr) / run;
      return slope > 0 ? slope : null;
    }
  }
  return null;
}

/** Sessions closer to today say more about today. Half-life in days. */
const RECENCY_HALF_LIFE_DAYS = 21;
/** How near a threshold a block must sit to speak for it, as a fraction of LT2. */
const NEAR_THRESHOLD = 0.18;
/** Below this much evidence the projection is a hint, not a number. */
const MIN_MINUTES_FOR_HIGH = 180;
const MIN_SESSIONS_FOR_HIGH = 6;

/**
 * How far a threshold may be said to have moved before the reading is more
 * likely to be measurement than fitness.
 *
 * Running is why this exists. Demand there is pace from a footpod or GPS,
 * carrying a few percent of error before the grade adjustment adds its own,
 * and the test's heart-rate slope per metre-per-second is shallow — so
 * dividing by it multiplies that error into an implausible number of seconds
 * per kilometre. A real athlete can move a threshold 20% over a season; a
 * single reading claiming it is nearly always a bad one.
 */
const SHIFT_SUSPECT_PCT_OF_THRESHOLD = 10;
const SHIFT_REJECT_PCT_OF_THRESHOLD = 20;

/**
 * Project where LT1 and LT2 sit now, from heart rate measured at intensities
 * the test actually covered.
 *
 * The arithmetic is one step. If the whole curve has shifted right by ΔP, then
 * at any intensity d the heart rate today is what the test recorded at d − ΔP,
 * so a measured difference converts as ΔP ≈ −Δhr / slope(d). Every steady block
 * of every session since the test is one such estimate, at whatever intensity
 * it happened to be ridden.
 *
 * LT1 and LT2 are estimated separately, from the blocks ridden near each. They
 * genuinely move apart — a winter of easy volume lifts LT1 while LT2 sits still,
 * and reporting one number for both would hide the thing base training is for.
 * When too little was ridden near one of them, that one is left null rather
 * than borrowed from the other.
 *
 * What this is NOT: a test. Heart rate carries heat, fatigue, illness, caffeine
 * and altitude along with fitness, and no weighting removes them — it only
 * stops any single session deciding the answer. The output says "retest" when
 * it moves; it never claims to have replaced one.
 *
 * @param {Array} sessions  [{date, blocks:[{demand, deltaHr, sec}]}]
 * @param {object} anchor   extractLactateThresholds() output
 * @param {object} [o]
 * @param {Date}   [o.now]        the moment being asked about
 * @param {number} [o.windowDays] only look this far back from it
 * @returns {null | {lt1:object|null, lt2:object|null, sessions:number, minutes:number}}
 */
export function projectThresholdShift(sessions, anchor, { now = null, windowDays = null } = {}) {
  const curve = testHrCurve(anchor);
  if (!curve || !Array.isArray(sessions) || !sessions.length) return null;
  const kind = sportKind(anchor.sport);
  const storageMode = anchor.storageMode;
  const lt1Demand = thresholdToDemand(anchor.lt1, { kind, storageMode });
  const lt2Demand = thresholdToDemand(anchor.lt2, { kind, storageMode });
  if (!(lt2Demand > 0)) return null;

  const nowMs = now ? new Date(now).getTime() : Date.now();
  const band = lt2Demand * NEAR_THRESHOLD;
  const near = { lt1: [], lt2: [] };
  let totalSec = 0;
  let used = 0;

  for (const session of sessions) {
    const ms = new Date(session?.date).getTime();
    if (!Number.isFinite(ms)) continue;
    // Nothing after the moment being asked about — a timeline point in April
    // must not know what happened in July.
    if (ms > nowMs) continue;
    const ageDays = Math.max(0, (nowMs - ms) / 86400000);
    if (windowDays && ageDays > windowDays) continue;
    const recency = 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
    let contributed = false;

    for (const b of session.blocks || []) {
      const slope = localSlopeAt(curve, b.demand);
      if (!slope) continue;
      const shift = -Number(b.deltaHr) / slope;
      if (!Number.isFinite(shift)) continue;
      const sec = Number(b.sec) || 0;
      if (sec <= 0) continue;
      // Minutes and recency together: a long block on a recent ride is worth
      // more than a five-minute one from six weeks ago, and both are worth
      // something.
      const weight = (sec / 60) * recency;
      totalSec += sec;
      contributed = true;
      if (lt1Demand > 0 && Math.abs(b.demand - lt1Demand) <= band) near.lt1.push({ shift, weight });
      if (Math.abs(b.demand - lt2Demand) <= band) near.lt2.push({ shift, weight });
    }
    if (contributed) used += 1;
  }

  /** Weighted median — one bad session should move it, not decide it. */
  const weightedMedian = (rows) => {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => a.shift - b.shift);
    const half = sorted.reduce((s, r) => s + r.weight, 0) / 2;
    let run = 0;
    for (const r of sorted) {
      run += r.weight;
      if (run >= half) return r.shift;
    }
    return sorted[sorted.length - 1].shift;
  };

  const estimate = (rows, baseDemand) => {
    if (rows.length < 3 || !(baseDemand > 0)) return null;
    const shift = weightedMedian(rows);
    if (shift == null) return null;
    const projected = baseDemand + shift;
    if (!(projected > 0)) return null;
    const shiftPct = (shift / baseDemand) * 100;
    // Beyond this the reading says more about the sensor than the athlete, and
    // a projected threshold nobody can train to is worse than none.
    if (Math.abs(shiftPct) > SHIFT_REJECT_PCT_OF_THRESHOLD) return null;
    const minutes = rows.reduce((s, r) => s + r.weight, 0);
    const spread = Math.max(...rows.map((r) => r.shift)) - Math.min(...rows.map((r) => r.shift));
    let confidence = rows.length >= 8 && spread < baseDemand * 0.25 ? 'high'
      : rows.length >= 5 ? 'medium' : 'low';
    if (Math.abs(shiftPct) > SHIFT_SUSPECT_PCT_OF_THRESHOLD) confidence = 'low';
    return {
      shift,
      shiftPct,
      from: demandToThreshold(baseDemand, { kind, storageMode }),
      to: demandToThreshold(projected, { kind, storageMode }),
      fromDemand: baseDemand,
      toDemand: projected,
      blocks: rows.length,
      minutes: Math.round(minutes),
      confidence,
    };
  };

  const lt1 = estimate(near.lt1, lt1Demand);
  const lt2 = estimate(near.lt2, lt2Demand);
  if (!lt1 && !lt2) return null;

  const minutes = Math.round(totalSec / 60);
  const overall = used >= MIN_SESSIONS_FOR_HIGH && minutes >= MIN_MINUTES_FOR_HIGH ? 'high'
    : used >= 3 ? 'medium' : 'low';

  return { lt1, lt2, sessions: used, minutes, confidence: overall, kind, storageMode };
}

/**
 * The same projection, asked once a week across the season.
 *
 * A single number says where the athlete is; a line says whether they are
 * going anywhere, which is the question a training block is trying to answer.
 * Each point re-estimates from a trailing window, using only sessions that had
 * happened by then — so the line is what the app would have told you on that
 * date, not a curve fitted with hindsight.
 *
 * The window is wider than the recency half-life on purpose. Six weeks of
 * training either side of a point is enough for a threshold to be visible
 * above the day-to-day noise, while the half-life inside it still leans the
 * answer toward the recent end.
 *
 * @param {Array}  sessions  [{date, blocks:[…]}]
 * @param {object} anchor
 * @param {object} [o]
 * @param {number} [o.stepDays=7]
 * @param {number} [o.windowDays=42]
 * @param {Date}   [o.now]
 * @returns {Array<{date:string, lt1:number|null, lt2:number|null, lt1Confidence, lt2Confidence, sessions:number}>}
 */
export function projectThresholdTimeline(sessions, anchor, {
  stepDays = 7, windowDays = 42, now = null,
} = {}) {
  if (!Array.isArray(sessions) || !sessions.length) return [];
  const stamps = sessions
    .map((s) => new Date(s?.date).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  if (!stamps.length) return [];

  const endMs = now ? new Date(now).getTime() : Math.max(stamps[stamps.length - 1], Date.now());
  // Start a window in, so the first point is as well-supported as the rest
  // rather than a spike drawn from three days of training.
  const firstMs = stamps[0] + windowDays * 0.5 * 86400000;
  if (firstMs > endMs) return [];

  const out = [];
  const stepMs = stepDays * 86400000;
  for (let ms = firstMs; ms <= endMs + 1; ms += stepMs) {
    const at = Math.min(ms, endMs);
    const p = projectThresholdShift(sessions, anchor, { now: at, windowDays });
    if (!p) continue;
    out.push({
      date: new Date(at).toISOString(),
      lt1: p.lt1 ? p.lt1.toDemand : null,
      lt2: p.lt2 ? p.lt2.toDemand : null,
      lt1Confidence: p.lt1?.confidence || null,
      lt2Confidence: p.lt2?.confidence || null,
      sessions: p.sessions,
    });
  }
  return out;
}

/**
 * The test's lactate curve, redrawn where the training says it sits now.
 *
 * A projection expressed as "LT2 is 22 W lower" is a fact about one point. The
 * curve is the thing an athlete recognises, and what they want to see is it
 * moving — so each measured stage is slid along the intensity axis and the same
 * shape redrawn at its new place.
 *
 * The slide is not uniform. LT1 and LT2 move by different amounts — that is the
 * whole reason they are estimated separately — so the shift is interpolated
 * between them and held flat beyond, which lets the curve tilt as well as
 * translate. A winter of base work slides the bottom of the curve right while
 * the top stays put, and a flat translation would draw that as something it
 * is not.
 *
 * Lactate values are carried across untouched. What moves is the intensity at
 * which each one appears, which is what a shifted curve means.
 *
 * @returns {null | {points:Array<{demand:number, lactate:number}>, shiftAt:Function}}
 */
export function shiftedLactateCurve(anchor, projection) {
  const curve = testLactateCurve(anchor);
  if (!curve || !projection) return null;
  const lo = projection.lt1;
  const hi = projection.lt2;
  if (!lo && !hi) return null;

  const loD = lo?.fromDemand;
  const hiD = hi?.fromDemand;

  /** How far the curve has moved at this intensity. */
  const shiftAt = (demand) => {
    if (lo && hi && Number.isFinite(loD) && Number.isFinite(hiD) && hiD > loD) {
      const t = (demand - loD) / (hiD - loD);
      // Clamped: beyond the thresholds there is no evidence of further tilt,
      // and extending the trend outward would invent it.
      const clamped = Math.max(0, Math.min(1, t));
      return lo.shift + (hi.shift - lo.shift) * clamped;
    }
    return (hi || lo).shift;
  };

  const points = curve.points
    .map((p) => ({ demand: p.demand + shiftAt(p.demand), lactate: p.lactate }))
    .filter((p) => p.demand > 0)
    .sort((a, b) => a.demand - b.demand);

  return { points, shiftAt };
}

/** A zone edit has to be worth the disruption: below this, leave them alone. */
const ADVICE_MIN_PCT = 3;
/** And it has to be supported: a hint is not grounds for rewriting how someone trains. */
const ADVICE_MIN_SESSIONS = 8;
const ADVICE_MIN_MINUTES = 240;
/** Past this the test is old enough that a real change is the likely explanation. */
const ADVICE_TEST_AGE_DAYS = 42;

/**
 * Should the athlete's zones be rewritten, and to what?
 *
 * Deliberately reluctant. Zones are the thing every session is prescribed
 * against, so changing them changes what the athlete does tomorrow — and this
 * estimate is made of heart rate, which carries heat, fatigue and illness
 * along with fitness. A number that moves for a fortnight of hot weather must
 * not quietly rewrite a training plan.
 *
 * So all four have to hold: the move is big enough to matter, it rests on
 * enough training to be believed, the estimate itself is not flagged as a
 * hint, and the test is old enough that the athlete plausibly changed. Failing
 * any of them, the honest advice is to leave the zones and go and test.
 *
 * @returns {null | {thresholds:{lt1, lt2}, reason:string, direction, biggestPct:number}}
 */
export function zoneAdviceFor(projection, { testDate = null, now = null } = {}) {
  if (!projection) return null;
  const { lt1, lt2 } = projection;
  const usable = [lt1, lt2].filter((e) => e && e.confidence !== 'low');
  if (!usable.length) return null;

  const biggest = usable.reduce((a, b) => (Math.abs(a.shiftPct) > Math.abs(b.shiftPct) ? a : b));
  if (Math.abs(biggest.shiftPct) < ADVICE_MIN_PCT) return null;
  if (projection.sessions < ADVICE_MIN_SESSIONS) return null;
  if (projection.minutes < ADVICE_MIN_MINUTES) return null;

  const testMs = testDate ? new Date(testDate).getTime() : NaN;
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const ageDays = Number.isFinite(testMs) ? (nowMs - testMs) / 86400000 : null;
  if (ageDays != null && ageDays < ADVICE_TEST_AGE_DAYS) return null;

  // Only thresholds that carry their own evidence are proposed; the other is
  // left at its tested value rather than dragged along by its neighbour.
  const thresholds = {
    lt1: lt1 && lt1.confidence !== 'low' ? lt1.toDemand : null,
    lt2: lt2 && lt2.confidence !== 'low' ? lt2.toDemand : null,
  };
  if (!thresholds.lt1 && !thresholds.lt2) return null;

  return {
    thresholds,
    direction: biggest.shift > 0 ? 'up' : 'down',
    biggestPct: biggest.shiftPct,
    sessions: projection.sessions,
    minutes: projection.minutes,
    testAgeDays: ageDays == null ? null : Math.round(ageDays),
    reason: biggest.shift > 0
      ? 'Your zones are set below where you are training.'
      : 'Your zones are set above where you are training.',
  };
}

// ── History: many sessions against one test ─────────────────────────────────

const CONFIDENCE_WEIGHT = { high: 1, medium: 0.55, low: 0.2 };

/**
 * Roll a run of analysed sessions into a drift trend.
 *
 * A single session moves on sleep, caffeine, glycogen and mood, so nothing here
 * reacts to one ride: the trend is a confidence-weighted rolling median, which
 * ignores the outlier ride instead of averaging it in.
 *
 * @param {Array} sessions  [{ date, result }] where result is analyseSession() output
 * @param {object} o
 * @param {Date|string} o.testDate
 * @param {number} [o.windowDays=28]
 * @returns {{series:Array, latest:object|null, retest:object|null}}
 */
export function buildDriftHistory(sessions, { testDate, windowDays = 28 } = {}) {
  const usable = (sessions || [])
    .filter((s) => s?.result?.ok && Number.isFinite(s.result.deltaDemand))
    .map((s) => ({
      date: new Date(s.date),
      ms: new Date(s.date).getTime(),
      deltaDemand: s.result.deltaDemand,
      deltaPct: s.result.deltaPct,
      lt2Demand: s.result.lt2Demand,
      deltaHr: s.result.deltaHr,
      hrAtLt2: s.result.hrAtLt2,
      thresholdAtLt2Hr: s.result.thresholdAtLt2Hr,
      drift: s.result.driftBpmPerHour,
      weight: CONFIDENCE_WEIGHT[s.result.confidence] ?? 0.2,
      confidence: s.result.confidence,
      title: s.title || null,
      id: s.id || null,
    }))
    .filter((s) => Number.isFinite(s.ms))
    .sort((a, b) => a.ms - b.ms);

  if (!usable.length) return { series: [], latest: null, retest: null };

  const windowMs = windowDays * 86400000;
  const series = usable.map((s, i) => {
    const from = s.ms - windowMs;
    const win = usable.slice(0, i + 1).filter((w) => w.ms >= from);
    // Weight by repeating each point in proportion to its confidence, so the
    // median genuinely leans on the good sessions without discarding the rest.
    const pool = [];
    for (const w of win) {
      const reps = Math.max(1, Math.round(w.weight * 4));
      for (let k = 0; k < reps; k += 1) pool.push(w.deltaDemand);
    }
    const trendDelta = median(pool);
    return {
      ...s,
      trendDelta,
      trendPct: s.lt2Demand > 0 ? (trendDelta / s.lt2Demand) * 100 : 0,
      sampleCount: win.length,
    };
  });

  const latest = series[series.length - 1];

  // Retest prompt. Three conditions, all required: the trend has to be large,
  // it has to be backed by more than one session, and the test has to be old
  // enough that a real change is plausible. Any one of them alone is noise.
  const testMs = testDate ? new Date(testDate).getTime() : NaN;
  const testAgeDays = Number.isFinite(testMs) ? (Date.now() - testMs) / 86400000 : null;
  const recent = series.filter((s) => s.ms >= Date.now() - 21 * 86400000 && s.confidence !== 'low');
  const trendPct = latest?.trendPct || 0;

  let retest = null;
  if (Math.abs(trendPct) >= 3 && recent.length >= 3 && (testAgeDays == null || testAgeDays >= 42)) {
    retest = {
      direction: trendPct > 0 ? 'up' : 'down',
      trendPct,
      trendDelta: latest.trendDelta,
      sessions: recent.length,
      testAgeDays: testAgeDays == null ? null : Math.round(testAgeDays),
    };
  }

  return { series, latest, retest };
}
