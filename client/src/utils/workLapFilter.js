/** @typedef {{ intervalType?: string, isRecovery?: boolean, isSelected?: boolean, power?: number|string, watts?: number, average_watts?: number, duration?: number|string, durationSeconds?: number, moving_time?: number, elapsed_time?: number }} LapResult */

function normalizeSportKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (!s) return '';
  if (s.includes('run') || s.includes('běh') || s.includes('beh')) return 'run';
  if (s.includes('swim') || s.includes('plav')) return 'swim';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl') || s.includes('kolo')) return 'bike';
  return s;
}

function parseDurationSecs(r) {
  if (!r || typeof r !== 'object') return 0;
  for (const k of ['moving_time', 'totalTimerTime', 'total_timer_time', 'durationSeconds', 'elapsed_time', 'duration']) {
    const v = r[k];
    if (v == null) continue;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      if (v.includes(':')) {
        const p = v.split(':').map(Number);
        if (p.length === 2) return p[0] * 60 + p[1];
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      }
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

function getMetricValue(result) {
  const p = Number(result?.power ?? result?.watts ?? result?.average_watts);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function isExplicitNonWork(result) {
  if (!result) return true;
  if (result.isRecovery === true) return true;
  if (result.isSelected === false) return true;
  return isTaggedNonWork(result);
}

function isTaggedNonWork(result) {
  const t = String(result?.intervalType || '').toLowerCase();
  return t === 'warmup' || t === 'cooldown' || t === 'recovery' || t === 'rest';
}

/** Bimodal power/pace → interval session with rest laps mixed in. */
function looksLikeIntervalSession(results) {
  const values = results.map(getMetricValue).filter(v => v != null && v > 0);
  if (values.length < 4) return false;
  const sorted = [...values].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  if (p25 <= 0) return false;
  return p75 / p25 > 1.35;
}

/** For bike intervals: keep laps near the high-power cluster. */
function clusterByPower(candidates, sportKey) {
  if (sportKey !== 'bike' || !Array.isArray(candidates) || candidates.length <= 2) return candidates;

  const withPow = candidates.map((r, i) => ({ r, i, pow: getMetricValue(r) })).filter(x => x.pow != null);
  if (withPow.length <= 2) return candidates;

  const maxPow = Math.max(...withPow.map(x => x.pow));
  const threshold = Math.max(maxPow * 0.72, 150);
  const matched = withPow.filter(x => x.pow >= threshold);
  if (matched.length >= 2 && matched.length < withPow.length) {
    return matched.map(x => x.r);
  }
  return candidates;
}

/** Keep laps whose duration is close to the session median (timed repeats). */
function clusterByDuration(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 2) return candidates;

  const withDur = candidates.map((r, i) => ({ r, i, dur: parseDurationSecs(r) }));
  const durValues = withDur.map(x => x.dur).filter(d => d > 0);
  if (durValues.length < 2) return candidates;

  const sorted = [...durValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return candidates;

  const matched = withDur.filter(x => x.dur > 0 && Math.abs(x.dur - median) / median <= 0.35);
  if (matched.length >= 2 && matched.length < candidates.length) {
    return matched.map(x => x.r);
  }
  return candidates;
}

/**
 * Heuristic recovery detection for laps without intervalType (e.g. Strava imports).
 */
function isRecoveryHeuristic(result, index, allResults, sportKey) {
  if (result?.isRecovery === true) return true;
  if (result?.isSelected === false) return true;

  const duration = parseDurationSecs(result);
  if (duration > 0 && duration < 10) return true;

  const isRun = sportKey === 'run';
  const isSwim = sportKey === 'swim';
  const isBike = sportKey === 'bike' || (!isRun && !isSwim);

  const cur = getMetricValue(result);
  const prev = index > 0 ? getMetricValue(allResults[index - 1]) : null;
  const next = index < allResults.length - 1 ? getMetricValue(allResults[index + 1]) : null;

  if (isBike && cur != null) {
    if (prev != null && next != null) {
      const avgNeighbor = (prev + next) / 2;
      const powerDiff = avgNeighbor - cur;
      if (cur > 0 && cur < avgNeighbor * 0.80 && powerDiff >= 50 && avgNeighbor > 150) return true;
    }
    if (prev != null && cur > 0 && prev > cur * 1.2 && (prev - cur) >= 50 && prev > 150) {
      if (next == null || next > cur * 1.2) return true;
    }
    if (next != null && cur > 0 && next > cur * 1.2 && (next - cur) >= 50 && next > 150) {
      if (prev == null || prev > cur * 1.2) return true;
    }

    const powers = allResults.map(getMetricValue).filter(v => v != null && v > 0);
    const avgPower = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : 0;
    if (cur < 50 || (avgPower > 0 && cur < avgPower * 0.3)) return true;
    return false;
  }

  if ((isRun || isSwim) && cur != null) {
    if (prev != null && next != null) {
      const avgNeighbor = (prev + next) / 2;
      if (cur > avgNeighbor * 1.15 && avgNeighbor > 60) return true;
    }
    if (prev != null && cur > prev * 1.15 && prev > 60) {
      if (next == null || cur > next * 1.15) return true;
    }
    if (next != null && cur > next * 1.15 && next > 60) {
      if (prev == null || cur > prev * 1.15) return true;
    }

    const paces = allResults.map(getMetricValue).filter(v => v != null && v > 0);
    const avgPace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 0;
    if (avgPace > 0 && cur > avgPace * 1.4) return true;
  }

  return false;
}

function applyWorkClustering(work, allResults, sportKey) {
  if (!Array.isArray(work) || work.length <= 1) return work;
  const spreadSession = looksLikeIntervalSession(work) || looksLikeIntervalSession(allResults);
  if (work.length >= allResults.length && !spreadSession) return work;

  let clustered = work;
  if (sportKey === 'bike' || !sportKey) {
    const byPow = clusterByPower(clustered, 'bike');
    if (byPow.length >= 2 && byPow.length < clustered.length) clustered = byPow;
  }
  if (spreadSession || clustered.length < allResults.length) {
    const byDur = clusterByDuration(clustered);
    if (byDur.length >= 2 && byDur.length < clustered.length) clustered = byDur;
  }
  return clustered;
}

/**
 * Keep only work intervals for charts and averages.
 *
 * @param {LapResult[]|null|undefined} results
 * @param {string} [sport]
 * @returns {LapResult[]}
 */
function filterWorkResults(results, sport = '') {
  if (!Array.isArray(results) || results.length === 0) return results || [];

  const sportKey = normalizeSportKey(sport);
  const pool = results.filter(r => !isExplicitNonWork(r));
  if (pool.length === 0) return results;

  const hasExplicitWork = pool.some(r => String(r?.intervalType || '').toLowerCase() === 'work');
  const hasAnyTag = results.some(r => r?.intervalType);

  let work;
  if (hasExplicitWork) {
    work = pool.filter(r => String(r?.intervalType || '').toLowerCase() === 'work');
  } else if (hasAnyTag) {
    work = pool.filter((r, i) => {
      const t = String(r?.intervalType || '').toLowerCase();
      if (t === 'work') return true;
      if (t) return false;
      const origIdx = results.indexOf(r);
      return !isRecoveryHeuristic(r, origIdx >= 0 ? origIdx : i, results, sportKey);
    });
  } else {
    work = results.filter((r, i) => !isExplicitNonWork(r) && !isRecoveryHeuristic(r, i, results, sportKey));
  }

  work = applyWorkClustering(work, results, sportKey);

  if (work.length > 0) return work;
  return results;
}

export { filterWorkResults, getMetricValue as getWorkLapMetricValue };
export default filterWorkResults;
