/**
 * Cross-source dedup for the CLIENT-side calendar merge.
 *
 * The server dedupes Strava-vs-Garmin-vs-Apple inside /activities, but the
 * client then concatenates that feed with FIT uploads and manual Training
 * docs — so the same ride uploaded as a FIT file AND synced from Strava
 * showed twice (and got double-counted in week totals derived from this
 * list). This applies the same fingerprint the server uses: same day,
 * different providers, start within ±5 min, duration within 10% (or 3 min),
 * distance within 5%. Sports must agree only when both are confidently
 * classified — junk/unknown sport acts as a wildcard.
 */

const SOURCE_PRIORITY = { strava: 0, garmin: 1, fit: 2, apple_health: 3, regular: 4 };

function sourceOf(a) {
  if (a?.source) return a.source;
  const id = String(a?.id || '');
  if (id.startsWith('strava-')) return 'strava';
  if (id.startsWith('garmin-')) return 'garmin';
  if (id.startsWith('apple-')) return 'apple_health';
  if (id.startsWith('fit-') || a?.type === 'fit') return 'fit';
  return a?.type || 'regular';
}

function coreSport(sportRaw) {
  const s = String(sportRaw || '').toLowerCase();
  if (/swim/.test(s)) return 'swim';
  if (/rid|bik|cycl/.test(s)) return 'bike';
  if (/run|walk|hik/.test(s)) return 'run';
  return null; // unknown → wildcard
}

function secsOf(a) {
  return Number(
    a?.totalElapsedTime || a?.totalTime || a?.movingTime || a?.moving_time
    || a?.elapsedTime || a?.elapsed_time || a?.totalTimerTime || a?.duration || 0,
  );
}

function distOf(a) {
  return Number(a?.distance || a?.totalDistance || 0);
}

function dayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dedupeMergedCalendarActivities(list) {
  const arr = Array.isArray(list) ? list : [];
  const byDay = new Map();
  const keep = [];

  for (const act of arr) {
    const dk = dayKey(act?.date);
    if (!dk) { keep.push(act); continue; }

    const src = sourceOf(act);
    const sport = coreSport(act?.sport);
    const ms = new Date(act.date).getTime();
    const sec = secsOf(act);
    const dist = distOf(act);

    const bucket = byDay.get(dk) || [];
    let dup = null;
    for (const cand of bucket) {
      if (cand.src === src) continue; // same provider → never fuzzy-merge
      if (sport && cand.sport && sport !== cand.sport) continue;
      if (!Number.isFinite(ms) || !Number.isFinite(cand.ms) || Math.abs(ms - cand.ms) > 5 * 60 * 1000) continue;
      if (sec && cand.sec && Math.abs(sec - cand.sec) > Math.max(180, 0.1 * Math.max(sec, cand.sec))) continue;
      if (dist && cand.dist && Math.abs(dist - cand.dist) > 0.05 * Math.max(dist, cand.dist)) continue;
      dup = cand;
      break;
    }

    if (!dup) {
      const entry = { act, src, sport, ms, sec, dist, keepIdx: keep.length };
      bucket.push(entry);
      byDay.set(dk, bucket);
      keep.push(act);
      continue;
    }

    // Duplicate found — keep the higher-priority provider's copy.
    const exPr = SOURCE_PRIORITY[dup.src] ?? 9;
    const acPr = SOURCE_PRIORITY[src] ?? 9;
    if (acPr < exPr) {
      keep[dup.keepIdx] = act;
      dup.act = act; dup.src = src; dup.sport = sport ?? dup.sport;
      dup.ms = ms; dup.sec = sec; dup.dist = dist;
    }
  }

  return keep;
}

export default dedupeMergedCalendarActivities;
