/**
 * lactateAnalytics.js
 * ───────────────────
 * Algorithms for detecting training adaptations via lactate trends.
 *
 * Four core analyses:
 *  1. Session lactate drift     — is lactate accumulating within a session?
 *  2. Pace/power-to-lactate trend — at the same intensity, is lactate going down?
 *  3. Anomaly detection         — is today's lactate unusually high for this intensity?
 *  4. Clearance index           — how fast does lactate drop between work intervals?
 *
 * All functions are pure (no DB calls) — the route passes pre-fetched data.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Simple linear regression: y = slope * x + intercept
 * @param {Array<{x: number, y: number}>} points
 * @returns {{ slope: number, intercept: number, r2: number }}
 */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let ssXY = 0, ssXX = 0, ssTot = 0;
  for (const p of points) {
    ssXY += (p.x - meanX) * (p.y - meanY);
    ssXX += (p.x - meanX) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

/**
 * Convert pace string "M:SS/km" or "M:SS/mi" → seconds per km.
 * Returns null if unparseable.
 */
function paceToSecPerKm(paceStr) {
  if (!paceStr || typeof paceStr !== 'string') return null;
  const m = paceStr.match(/^(\d+):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Get numeric intensity from a lap/result — prefers avgPower (watts) for
 * cycling, falls back to avgSpeed (m/s) or pace string for running.
 * Returns { value: number, unit: 'watts' | 'secPerKm' | 'ms' } or null.
 */
function extractIntensity(interval, sport) {
  const sportL = (sport || '').toLowerCase();
  const isRun = sportL.includes('run') || sportL === 'walk' || sportL === 'hike';

  // Cycling / generic — power first
  const power =
    interval.power ?? interval.avgPower ?? interval.avg_power ??
    interval.average_watts ?? interval.averageWatts ?? null;
  if (!isRun && power != null && Number.isFinite(Number(power)) && Number(power) > 0) {
    return { value: Number(power), unit: 'watts' };
  }

  // Speed m/s (FIT laps)
  const speed =
    interval.avgSpeed ?? interval.avg_speed ?? interval.average_speed ??
    interval.enhancedAvgSpeed ?? interval.enhanced_avg_speed ?? null;
  if (speed != null && Number.isFinite(Number(speed)) && Number(speed) > 0.1) {
    const mps = Number(speed);
    return isRun
      ? { value: 1000 / mps, unit: 'secPerKm' }  // convert to sec/km for runs
      : { value: mps, unit: 'ms' };
  }

  // Pace string (manual Training results)
  const paceStr = interval.intensity ?? null;
  const secPerKm = paceToSecPerKm(paceStr);
  if (secPerKm != null) return { value: secPerKm, unit: 'secPerKm' };

  return null;
}

/**
 * Bin a numeric intensity value into a human-readable label.
 * For watts: 50W buckets. For secPerKm: 15s buckets. For m/s: 0.5 buckets.
 */
function intensityBin(value, unit) {
  if (unit === 'watts') {
    const low = Math.floor(value / 25) * 25;
    return `${low}-${low + 25}W`;
  }
  if (unit === 'secPerKm') {
    // 15-second pace buckets
    const low = Math.floor(value / 15) * 15;
    const hi = low + 15;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return `${fmt(low)}-${fmt(hi)}/km`;
  }
  // m/s — 0.5 buckets
  const low = Math.floor(value / 0.5) * 0.5;
  return `${low.toFixed(1)}-${(low + 0.5).toFixed(1)} m/s`;
}

// ─── 1. Session lactate drift ────────────────────────────────────────────────

/**
 * Compute lactate drift for a single session.
 * Compares the average lactate in the first third of work intervals
 * vs the last third. Positive drift = accumulation, negative = clearance.
 *
 * @param {Array} intervals  - array of lap/result objects with `.lactate`
 * @returns {{ drift: number|null, firstAvg: number|null, lastAvg: number|null,
 *             label: 'accumulating'|'stable'|'clearing'|'insufficient_data' }}
 */
function computeSessionLactateDrift(intervals) {
  const work = intervals.filter(
    (iv) => iv.lactate != null && Number.isFinite(Number(iv.lactate)) &&
             Number(iv.lactate) > 0 && iv.isRecovery !== true &&
             iv.intervalType !== 'recovery' && iv.intervalType !== 'warmup' &&
             iv.intervalType !== 'cooldown'
  ).map((iv) => Number(iv.lactate));

  if (work.length < 3) {
    return { drift: null, firstAvg: null, lastAvg: null, label: 'insufficient_data' };
  }

  const third = Math.max(1, Math.floor(work.length / 3));
  const firstAvg = work.slice(0, third).reduce((s, v) => s + v, 0) / third;
  const lastAvg  = work.slice(-third).reduce((s, v) => s + v, 0) / third;
  const drift = lastAvg - firstAvg;

  let label;
  if (Math.abs(drift) < 0.2) label = 'stable';
  else if (drift > 0) label = 'accumulating';
  else label = 'clearing';

  return {
    drift: Math.round(drift * 100) / 100,
    firstAvg: Math.round(firstAvg * 100) / 100,
    lastAvg: Math.round(lastAvg * 100) / 100,
    label,
  };
}

// ─── 2. Pace/power-to-lactate trend ─────────────────────────────────────────

/**
 * Aggregate all lactate data points from multiple sessions into intensity bins,
 * then compute a linear trend (slope) over time for each bin.
 *
 * @param {Array<{ date: Date|string, sport: string, intervals: Array }>} sessions
 * @returns {Object} binKey → { points, trend, label }
 */
function computeLactateTrend(sessions) {
  // Collect all data points grouped by intensity bin
  const bins = {}; // binKey → [{ dateMs, lactate }]

  for (const session of sessions) {
    const dateMs = new Date(session.date).getTime();
    if (isNaN(dateMs)) continue;

    for (const iv of (session.intervals || [])) {
      if (iv.lactate == null || !Number.isFinite(Number(iv.lactate))) continue;
      if (Number(iv.lactate) <= 0) continue;
      if (iv.isRecovery === true || iv.intervalType === 'recovery') continue;

      const intensity = extractIntensity(iv, session.sport);
      if (!intensity) continue;

      const bin = intensityBin(intensity.value, intensity.unit);
      if (!bins[bin]) bins[bin] = [];
      bins[bin].push({
        dateMs,
        lactate: Number(iv.lactate),
        unit: intensity.unit,
        intensity: intensity.value,
        sport: session.sport || 'unknown',
        sessionId: String(session._id || session.id || ''),
        source: session.source || 'training',
      });
    }
  }

  const result = {};
  for (const [bin, points] of Object.entries(bins)) {
    if (points.length < 2) continue; // need at least 2 points for a trend

    // Sort by date
    points.sort((a, b) => a.dateMs - b.dateMs);

    // Normalise x to days since first point (avoids huge epoch numbers in regression)
    const t0 = points[0].dateMs;
    const regPoints = points.map((p) => ({
      x: (p.dateMs - t0) / (1000 * 60 * 60 * 24), // days
      y: p.lactate,
    }));

    const reg = linearRegression(regPoints);

    // Interpret trend: slope in mmol/day
    // < -0.005 mmol/day → improving, > +0.005 → declining, else stable
    let label;
    if (reg.slope < -0.005) label = 'improving';
    else if (reg.slope > 0.005) label = 'declining';
    else label = 'stable';

    result[bin] = {
      points: points.map((p) => ({
        date: new Date(p.dateMs).toISOString().slice(0, 10),
        lactate: p.lactate,
        intensity: p.intensity,
        sport: p.sport,
        sessionId: p.sessionId,
        source: p.source,
      })),
      slope: Math.round(reg.slope * 10000) / 10000,  // mmol/day, 4 decimals
      r2: Math.round(reg.r2 * 1000) / 1000,
      label,
      unit: points[0].unit,
      count: points.length,
    };
  }

  return result;
}

// ─── 3. Anomaly detection ────────────────────────────────────────────────────

/**
 * Flag sessions where lactate is unusually high vs recent history.
 * Uses a rolling window (last N sessions) to compute mean ± SD.
 *
 * @param {Array<{ date: Date|string, avgLactate: number }>} sessionSummaries
 *   - sorted oldest → newest; each item has a representative lactate for the session
 * @param {number} windowSize  rolling window (default 8 sessions)
 * @returns {Array<{ date, avgLactate, zScore, isAnomaly, percentile }>}
 */
function detectLactateAnomalies(sessionSummaries, windowSize = 8) {
  if (!sessionSummaries?.length) return [];

  return sessionSummaries.map((session, i) => {
    // Use the sessions BEFORE this one as historical baseline
    const window = sessionSummaries
      .slice(Math.max(0, i - windowSize), i)
      .map((s) => s.avgLactate)
      .filter((v) => Number.isFinite(v));

    if (window.length < 3) {
      return { ...session, zScore: null, isAnomaly: false, percentile: null };
    }

    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
    const zScore = sd === 0 ? 0 : (session.avgLactate - mean) / sd;

    // Simple percentile: count how many historical values are below current
    const below = window.filter((v) => v < session.avgLactate).length;
    const percentile = Math.round((below / window.length) * 100);

    return {
      date: session.date,
      avgLactate: Math.round(session.avgLactate * 100) / 100,
      zScore: Math.round(zScore * 100) / 100,
      isAnomaly: zScore > 1.5,     // > 1.5 SD above rolling mean → flag
      percentile,
    };
  });
}

// ─── 4. Clearance index ──────────────────────────────────────────────────────

/**
 * Compute lactate clearance index from alternating work/recovery intervals.
 * For each work→recovery pair, ratio = lactate_after_recovery / lactate_end_work.
 * Lower ratio = better clearance.
 *
 * @param {Array} intervals  - full lap/result array (work + recovery mixed)
 * @returns {{ pairs: Array, avgClearanceRatio: number|null,
 *             label: 'excellent'|'good'|'moderate'|'poor'|'insufficient_data' }}
 */
function computeClearanceIndex(intervals) {
  const pairs = [];

  for (let i = 0; i < intervals.length - 1; i++) {
    const curr = intervals[i];
    const next = intervals[i + 1];

    // Current is a work interval, next is a recovery
    const currIsWork =
      curr.lactate != null && Number(curr.lactate) > 0 &&
      curr.isRecovery !== true &&
      curr.intervalType !== 'recovery' && curr.intervalType !== 'warmup';

    const nextIsRecovery =
      next.lactate != null && Number(next.lactate) > 0 &&
      (next.isRecovery === true || next.intervalType === 'recovery');

    if (currIsWork && nextIsRecovery) {
      const workLactate     = Number(curr.lactate);
      const recoveryLactate = Number(next.lactate);
      const ratio           = recoveryLactate / workLactate;
      const drop            = workLactate - recoveryLactate;

      pairs.push({
        workLactate:     Math.round(workLactate * 100) / 100,
        recoveryLactate: Math.round(recoveryLactate * 100) / 100,
        ratio:           Math.round(ratio * 100) / 100,
        drop:            Math.round(drop * 100) / 100,
      });
    }
  }

  if (pairs.length === 0) {
    return { pairs: [], avgClearanceRatio: null, label: 'insufficient_data' };
  }

  const avgRatio = pairs.reduce((s, p) => s + p.ratio, 0) / pairs.length;

  let label;
  if (avgRatio < 0.50)      label = 'excellent';  // drops >50% during recovery
  else if (avgRatio < 0.65) label = 'good';
  else if (avgRatio < 0.80) label = 'moderate';
  else                       label = 'poor';

  return {
    pairs,
    avgClearanceRatio: Math.round(avgRatio * 100) / 100,
    label,
  };
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

/**
 * Run all four analyses on a set of sessions and return a combined report.
 *
 * @param {Array<{ _id, date, sport, intervals: Array }>} sessions
 *   Each session must have `intervals` — the array of lap/result objects.
 * @returns {Object}
 */
function analyzeLactateProgression(sessions) {
  if (!sessions?.length) {
    return { trend: {}, sessionAnalyses: [], anomalies: [] };
  }

  // Sort sessions oldest → newest
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Per-session analyses
  const sessionAnalyses = sorted.map((session) => {
    const drift    = computeSessionLactateDrift(session.intervals || []);
    const clearance = computeClearanceIndex(session.intervals || []);

    // Representative lactate for this session: mean of work interval lactates
    const workLactates = (session.intervals || [])
      .filter((iv) =>
        iv.lactate != null && Number.isFinite(Number(iv.lactate)) &&
        Number(iv.lactate) > 0 && iv.isRecovery !== true &&
        iv.intervalType !== 'recovery'
      )
      .map((iv) => Number(iv.lactate));

    const avgLactate =
      workLactates.length > 0
        ? workLactates.reduce((s, v) => s + v, 0) / workLactates.length
        : null;

    return {
      id:          String(session._id || session.id || ''),
      date:        new Date(session.date).toISOString().slice(0, 10),
      sport:       session.sport || 'unknown',
      source:      session.source || 'training',
      avgLactate:  avgLactate != null ? Math.round(avgLactate * 100) / 100 : null,
      drift,
      clearance,
    };
  });

  // Pace/power trend across all sessions
  const trend = computeLactateTrend(sorted);

  // Anomaly detection on session-level averages
  const anomalyInput = sessionAnalyses
    .filter((s) => s.avgLactate != null)
    .map((s) => ({ date: s.date, avgLactate: s.avgLactate }));
  const anomalyResults = detectLactateAnomalies(anomalyInput);

  // Merge anomaly flags back into sessionAnalyses
  const anomalyMap = new Map(anomalyResults.map((a) => [a.date, a]));
  const enriched = sessionAnalyses.map((s) => ({
    ...s,
    anomaly: anomalyMap.get(s.date) ?? null,
  }));

  return {
    trend,           // per intensity-bin trend data
    sessionAnalyses: enriched,
    anomalies: anomalyResults.filter((a) => a.isAnomaly),
  };
}

module.exports = {
  analyzeLactateProgression,
  computeSessionLactateDrift,
  computeLactateTrend,
  detectLactateAnomalies,
  computeClearanceIndex,
  // exported for testing
  linearRegression,
  extractIntensity,
  intensityBin,
};
