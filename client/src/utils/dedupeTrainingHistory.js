/**
 * One row per session in the dashboard's Training History.
 *
 * Adding lactate to a Strava ride writes a Training document that points back
 * at the activity — but the pointer was not always written in the same form.
 * Observed on production: one ride from 30 June 2026 produced two Trainings
 * 0.3 s apart, one linked by the StravaActivity's Mongo _id
 * (6a43cb97…) and one by Strava's numeric id (19124087286). Those are the same
 * activity, so the session appeared twice in the picker and twice in the chart,
 * with different interval sets — and the dates disagreed by two hours, because
 * one side stored the local wall clock and the other the instant.
 *
 * Nothing here deletes anything: the widget just stops offering the same
 * session more than once, and picks the record that carries the most of what
 * this widget exists to show.
 */

function startMs(t) {
  const d = new Date(t?.date || t?.startDate || t?.timestamp || 0);
  const ms = d.getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function normTitle(t) {
  return String(t?.titleManual || t?.title || t?.name || '').trim().toLowerCase();
}

function results(t) {
  return Array.isArray(t?.results) ? t.results : [];
}

function lactateCount(t) {
  return results(t).filter((r) => {
    const v = r?.lactate;
    return v != null && v !== '' && Number.isFinite(Number(v));
  }).length;
}

/**
 * Which of two records for one session to keep.
 *
 * Measured lactate decides it — that is the reading the athlete came for, and
 * the one that cannot be recovered from anywhere else. Only when both carry
 * the same number of readings does size break the tie, and then the fuller
 * record wins so nothing on screen is quietly narrower than the data.
 */
function historyScore(t) {
  return [
    lactateCount(t),
    results(t).length,
    startMs(t) || 0,
  ];
}

function betterThan(a, b) {
  const sa = historyScore(a);
  const sb = historyScore(b);
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i];
  }
  return false;
}

/** Two records of one session can be hours apart when one stored a wall clock. */
const SAME_SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * @param {Array<object>} trainings Training-collection records, any order
 * @param {Array<object>} [activities] the merged activity feed, used only to
 *   translate a StravaActivity Mongo _id into its numeric Strava id so both
 *   link forms resolve to one key
 * @returns {Array<object>} input order, one record per session
 */
export function dedupeTrainingHistory(trainings, activities = []) {
  const list = Array.isArray(trainings) ? trainings : [];
  if (list.length < 2) return list;

  // Mongo _id → numeric Strava id, so the two ways of writing the same link
  // stop looking like two different sessions.
  const numericByMongoId = new Map();
  for (const a of Array.isArray(activities) ? activities : []) {
    if (a?._id != null && a?.stravaId != null) {
      numericByMongoId.set(String(a._id), String(a.stravaId));
    }
  }

  const linkKey = (t) => {
    const raw = t?.sourceStravaActivityId;
    if (raw == null || raw === '') return null;
    const s = String(raw);
    return `strava:${numericByMongoId.get(s) || s}`;
  };

  const kept = [];
  const byLink = new Map();      // link key -> index in kept
  const byTitle = new Map();     // title|sport -> [{ idx, at }]

  for (const t of list) {
    if (!t) continue;

    const link = linkKey(t);
    if (link) {
      const prev = byLink.get(link);
      if (prev != null) {
        if (betterThan(t, kept[prev])) kept[prev] = t;
        continue;
      }
    }

    // No link, or a link seen for the first time: fall back to "same title,
    // same sport, within a few hours", which is what catches the pair whose
    // clocks disagree.
    const title = normTitle(t);
    const at = startMs(t);
    const bucketKey = title ? `${title}|${String(t.sport || '').toLowerCase()}` : null;
    let twin = null;
    if (bucketKey && at != null) {
      const bucket = byTitle.get(bucketKey) || [];
      twin = bucket.find((e) => e.at != null && Math.abs(e.at - at) <= SAME_SESSION_WINDOW_MS) || null;
    }

    if (twin) {
      if (betterThan(t, kept[twin.idx])) kept[twin.idx] = t;
      // Remember this link too, so a third copy keyed the other way collapses.
      if (link) byLink.set(link, twin.idx);
      continue;
    }

    const idx = kept.length;
    kept.push(t);
    if (link) byLink.set(link, idx);
    if (bucketKey) {
      const bucket = byTitle.get(bucketKey) || [];
      bucket.push({ idx, at });
      byTitle.set(bucketKey, bucket);
    }
  }

  return kept;
}

export default dedupeTrainingHistory;
