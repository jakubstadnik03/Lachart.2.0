/**
 * Is a session you repeat getting better?
 *
 * The Training page groups "the same training" (utils/sessionMatching) and
 * this answers the one question an athlete has about a group: compared with
 * when I started doing it, am I faster, holding, or slipping — and at what
 * heart rate. Pure functions over normalised laps, so the page can feed it
 * whatever Strava, Garmin or a hand-logged training carried.
 *
 * A lap here is { secs, num, hr, la, type }:
 *   secs – how long it lasted
 *   num  – pace in seconds (per km, or per 100 m for swim) or watts for bike
 *   hr   – average heart rate, if known
 *   la   – lactate measured at its end, if any
 *   type – intervalType when the session was marked up ('work', 'warmup', …)
 */

const NOT_WORK = new Set(['warmup', 'cooldown', 'recovery', 'rest']);

/** Lower is better for pace, higher for watts. */
export const lowerIsBetter = (sport) => sport !== 'bike';

const speedOf = (lap, sport) => (lowerIsBetter(sport) ? 1 / lap.num : lap.num);

/**
 * Laps the watch cut by itself — every 1 km, every 5 km, every 10 minutes.
 * They are the same length (the last one aside, where the session ran out),
 * which a real interval session never is: its reps and its rests differ.
 * Such a session is one steady effort, not a set of reps.
 */
export function isAutoLapped(laps) {
  const all = laps || [];
  if (!all.length || !all.every((l) => l && !meaningfulType(all, l))) return false;
  const usable = all;
  if (usable.length < 3) return false;
  const body = usable.slice(0, -1);
  const even = (key) => {
    const vs = body.map((l) => Number(l[key])).filter((v) => v > 0);
    if (vs.length !== body.length) return false;
    return Math.max(...vs) / Math.min(...vs) <= 1.06;
  };
  return even('dist') || even('secs');
}

/**
 * Whether a lap's intervalType tells us anything. Every lap marked "work"
 * says nothing — the lap form marks them all by default — so a session like
 * that is read as unmarked.
 */
function meaningfulType(laps, lap) {
  if (!lap?.type) return false;
  return !laps.every((l) => String(l?.type || '').toLowerCase() === 'work');
}

/**
 * The laps that were the work.
 *
 * A marked-up session says so itself. A raw one does not, so: drop the first
 * and last lap of anything with three or more (warm-up and cool-down, almost
 * always), then keep the laps within 12 % of the fastest of what is left —
 * the reps, not the jogs between them. One steady lap is all work.
 */
export function workLaps(laps, sport) {
  const usable = (laps || []).filter((l) => l && Number.isFinite(l.num) && l.num > 0);
  if (usable.length === 0) return [];
  if (usable.some((l) => meaningfulType(usable, l))) {
    // Marked-up session: the work is what is marked as work. An unmarked lap
    // beside marked ones is a recovery the athlete did not bother to label.
    const work = usable.filter((l) => l.type && !NOT_WORK.has(String(l.type).toLowerCase()) && !l.isRecovery);
    return work.length ? work : usable;
  }
  if (usable.length <= 2 || isAutoLapped(usable)) return usable;
  const inner = usable.slice(1, -1);
  // A sprint is not the work of a threshold session. When the session has
  // laps of a real interval length, only those count: two minutes on the
  // bike or run, thirty seconds in the pool. Otherwise a 30-second effort at
  // 600 W set the "work power" of an LT2 ride.
  const minSecs = sport === 'swim' ? 30 : 120;
  const long = inner.filter((l) => !(l.secs > 0) || l.secs >= minSecs);
  const pool = long.length ? long : inner;
  const fastest = Math.max(...pool.map((l) => speedOf(l, sport)));
  return pool.filter((l) => speedOf(l, sport) >= fastest * 0.88);
}

/** Duration-weighted average of a field over laps (plain mean when durations are missing). */
function weighted(laps, key) {
  const rows = laps.filter((l) => Number.isFinite(l[key]) && l[key] > 0);
  if (!rows.length) return null;
  const w = rows.map((l) => (l.secs > 0 ? l.secs : 1));
  const total = w.reduce((a, b) => a + b, 0);
  return rows.reduce((acc, l, i) => acc + l[key] * w[i], 0) / total;
}

/**
 * What one session says about the work in it: the average work pace or
 * power, the heart rate it took, and the highest lactate measured.
 */
export function summariseSession(laps, sport) {
  const work = workLaps(laps, sport);
  const las = (laps || []).map((l) => l?.la).filter((v) => Number.isFinite(v) && v > 0);
  return {
    value: work.length ? weighted(work, 'num') : null,
    hr: work.length ? weighted(work, 'hr') : null,
    lactate: las.length ? Math.max(...las) : null,
    workCount: work.length,
  };
}

const mean = (ns) => ns.reduce((a, b) => a + b, 0) / ns.length;

/**
 * The trend of a group, oldest session first.
 *
 * Compares the average of the first sessions with the average of the latest
 * ones (two each, or one each for a short group), so a single good or bad day
 * cannot decide it. Thresholds are the smallest change worth telling an
 * athlete about: 2 s/km, 1 s/100 m, 4 W.
 *
 * @param {Array<{value:number|null, hr:number|null}>} points oldest → newest
 * @returns {null|{trend:'better'|'holding'|'worse', delta:number, hrDelta:number|null, first:number, last:number}}
 */
export function groupTrend(points, sport) {
  const pts = (points || []).filter((p) => Number.isFinite(p?.value) && p.value > 0);
  if (pts.length < 2) return null;
  const k = pts.length >= 4 ? 2 : 1;
  const early = pts.slice(0, k);
  const recent = pts.slice(-k);
  const first = mean(early.map((p) => p.value));
  const last = mean(recent.map((p) => p.value));
  const delta = last - first;

  const earlyHr = early.map((p) => p.hr).filter((v) => Number.isFinite(v) && v > 0);
  const recentHr = recent.map((p) => p.hr).filter((v) => Number.isFinite(v) && v > 0);
  const hrDelta = earlyHr.length && recentHr.length ? mean(recentHr) - mean(earlyHr) : null;

  const step = sport === 'bike' ? 4 : sport === 'swim' ? 1 : 2;
  const improvement = lowerIsBetter(sport) ? -delta : delta;
  let trend = 'holding';
  if (improvement >= step) trend = 'better';
  else if (improvement <= -step) trend = 'worse';
  // Same pace for clearly less heart rate is progress too, and a little
  // slower for a lot less heart rate is an easier day, not a decline.
  if (trend === 'holding' && hrDelta != null && hrDelta <= -3) trend = 'better';
  if (trend === 'worse' && hrDelta != null && hrDelta <= -5 && improvement >= -2 * step) trend = 'holding';
  return { trend, delta, hrDelta, first, last };
}
