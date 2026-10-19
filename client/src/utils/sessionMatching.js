/**
 * Deciding that two sessions are "the same training", for the Training history
 * comparison on the native Training page.
 *
 * It used to be an exact match on the raw title, which was wrong both ways.
 * "10x1km LT2" and "10×1km LT2" are the same session typed twice and sat in
 * separate groups; meanwhile every activity Strava had named for you — of 82
 * interval sessions, 73 were untitled by hand — collapsed into one "Evening
 * Run" group, so an easy jog was charted against a tempo as though they were
 * repeats of one workout.
 *
 * So: a name the athlete chose identifies the session, compared loosely enough
 * to survive its own retyping. A name the provider chose identifies nothing,
 * and those sessions are matched on their shape instead.
 */

/** Titles a provider writes by itself. These say nothing about the workout. */
const GENERIC_PATTERNS = [
  // Strava: "<time of day> <sport>", English and Czech.
  /^(morning|midday|lunch|lunchtime|afternoon|evening|night)\s+(run|ride|swim|walk|hike|workout|activity|weight training|e-bike ride|virtual ride|virtual run)$/i,
  /^(ranní|dopolední|polední|odpolední|večerní|noční)\s+(běh|běhání|jízda|plavání|chůze|procházka|trénink|aktivita)$/i,
  // Garmin and friends: the bare sport, or nothing at all.
  /^(run|running|ride|cycling|bike|biking|swim|swimming|walk|walking|hike|hiking|workout|activity|exercise|training|untitled|indoor cycling|treadmill running|pool swim|open water swim|virtual ride|virtual run|weight training|strength training)$/i,
  /^(běh|běhání|jízda|kolo|plavání|chůze|trénink|aktivita)$/i,
];

export function isGenericTitle(title) {
  const t = String(title ?? '').trim();
  if (!t) return true;
  return GENERIC_PATTERNS.some((re) => re.test(t));
}

/**
 * The comparable form of a chosen title: what survives retyping it.
 * Case, spacing, the multiplication sign, diacritics and trailing punctuation
 * all stop mattering; the words and numbers do not.
 */
export function normalizeTitle(title) {
  return String(title ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // diacritics
    .toLowerCase()
    .replace(/[×✕✖]/g, 'x')                            // 10×1km === 10x1km
    .replace(/[_\-–—/\\.,:;!?'"()[\]]+/g, ' ')         // punctuation is noise
    .replace(/\s+/g, ' ')
    .trim();
}

const NON_WORK = new Set(['warmup', 'cooldown', 'rest', 'recovery']);

/** The work intervals, or everything when nothing was tagged. */
function workIntervals(intervals) {
  const all = Array.isArray(intervals) ? intervals : [];
  const work = all.filter((iv) => !NON_WORK.has(String(iv?.intervalType || '').toLowerCase()));
  return work.length > 0 ? work : all;
}

const median = (ns) => {
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const metresOf = (iv) => Number(iv?.distance ?? iv?.distanceMeters ?? iv?.totalDistance ?? 0) || 0;
const secondsOf = (iv) => Number(iv?.durationSec ?? iv?.duration ?? iv?.elapsed_time ?? iv?.moving_time ?? 0) || 0;

/**
 * What the session looks like, for sessions whose name tells us nothing:
 * the sport, how many work intervals, and how long each one was.
 *
 * Measured by distance when every work interval has one — "10×1km" is how the
 * athlete thinks of it — and by time otherwise. Both are bucketed, because two
 * runs of the same session are never metre-for-metre identical, and the median
 * is used rather than the mean so one mis-split lap cannot move it.
 *
 * @returns {{key: string, label: string}|null} null when there is nothing to measure
 */
export function describeStructure(sport, intervals) {
  const work = workIntervals(intervals);
  if (work.length === 0) return null;

  const s = String(sport || 'other').toLowerCase();
  const dists = work.map(metresOf);
  const secs = work.map(secondsOf);

  if (dists.every((d) => d > 0)) {
    const m = median(dists);
    const bucket = Math.round(m / 100) * 100;      // nearest 100 m
    const label = bucket >= 1000
      ? `${Number((bucket / 1000).toFixed(1))}km`
      : `${bucket}m`;
    return { key: `${s}|${work.length}|d${bucket}`, label: `${work.length}×${label}` };
  }

  if (secs.every((v) => v > 0)) {
    const m = median(secs);
    const bucket = Math.round(m / 30) * 30;        // nearest 30 s
    const label = bucket >= 60
      ? `${Number((bucket / 60).toFixed(1))}min`
      : `${bucket}s`;
    return { key: `${s}|${work.length}|t${bucket}`, label: `${work.length}×${label}` };
  }

  // Nothing measurable — the count is all we can honestly claim.
  return { key: `${s}|${work.length}|n`, label: `${work.length} laps` };
}

/**
 * The group a session belongs to.
 *
 * @param {object} session
 * @param {object} o
 * @param {string} o.sport
 * @param {Array}  o.intervals
 * @returns {{key: string, label: string}}
 */
export function sessionGroup(session, { sport, intervals } = {}) {
  const title = String(session?.title || session?.name || '').trim();

  if (!isGenericTitle(title)) {
    return { key: `t:${normalizeTitle(title)}`, label: title };
  }

  const shape = describeStructure(sport, intervals);
  const shown = title || 'Untitled';
  // A session the provider named AND that we cannot measure is not comparable
  // to anything. Key it by its own identity so it stands alone rather than
  // being charted against unrelated work that happens to share a default name.
  if (!shape) {
    const own = session?._id || session?.id || session?.activityId || session?.date || Math.random();
    return { key: `u:${own}`, label: shown };
  }
  return { key: `s:${shape.key}`, label: `${shown} (${shape.label})` };
}
