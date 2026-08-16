import { resolveSportKey } from '../components/shared/SportIcon';
import { getActivityAppId } from './activityEventPatches';

const INTEGRATION_ACTIVITY_TYPES = new Set([
  'strava', 'garmin', 'fit', 'regular', 'training', 'apple_health',
]);

/** Map granular sport keys to calendar filter chips (All / Bike / Run / Swim / Other). */
export function sportFilterChip(sportKey) {
  if (sportKey === 'bike') return 'bike';
  if (sportKey === 'swim') return 'swim';
  if (sportKey === 'run' || sportKey === 'walk' || sportKey === 'hike') return 'run';
  return 'other';
}

export function activitySportBucket(act) {
  const typeRaw = String(act?.type ?? '').toLowerCase();
  const typeAsSport = INTEGRATION_ACTIVITY_TYPES.has(typeRaw) ? '' : act?.type;
  const raw = act?.sport ?? act?.sport_type ?? act?.sportType ?? typeAsSport ?? '';
  return resolveSportKey(raw);
}

export function plannedSportBucket(pw) {
  return resolveSportKey(pw?.sport ?? '');
}

export function matchesCalendarSportFilter(sportOrAct, filter) {
  if (!filter || filter === 'all') return true;
  const bucket = typeof sportOrAct === 'object' && sportOrAct !== null
    ? activitySportBucket(sportOrAct)
    : resolveSportKey(sportOrAct ?? '');
  return sportFilterChip(bucket) === filter;
}

/** Start timestamp for sorting activities within a calendar day (earliest first). */
export function activitySortTime(act) {
  if (!act) return 0;
  const raw =
    act.start_date_local
    ?? act.start_date
    ?? act.startDate
    ?? act.start_time
    ?? act.startTime
    ?? act.timestamp
    ?? act.date;
  const t = raw != null ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function plannedStackSortTime(pw, fallbackIndex = 0) {
  const order = Number(pw?.dayOrder);
  const stack = Number.isFinite(order) ? order : fallbackIndex;
  return 1e15 + stack;
}

/**
 * Display order within a calendar day: earliest completed activity first.
 * Unpaired plans sort after all activities, by manual dayOrder.
 */
export function dayItemDisplaySortTime(item, fallbackIndex = 0) {
  if (item?.act) return activitySortTime(item.act);
  if (item?.pw) return plannedStackSortTime(item.pw, fallbackIndex);
  return 1e15 + fallbackIndex;
}

export function compareDayItemsChronologically(a, b) {
  const ta = dayItemDisplaySortTime(a, a._sortIdx ?? 0);
  const tb = dayItemDisplaySortTime(b, b._sortIdx ?? 0);
  if (ta !== tb) return ta - tb;
  const rank = { pair: 0, planned: 1, activity: 2 };
  return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
}

/** Sort planned workouts for one calendar day (manual stack order). */
export function sortPlannedWorkoutsForDay(planned = []) {
  return [...(planned || [])].sort((a, b) => {
    const oa = Number(a?.dayOrder ?? 0);
    const ob = Number(b?.dayOrder ?? 0);
    if (oa !== ob) return oa - ob;
    const ca = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
  });
}

/** Insert dragged planned workout before/after target; returns full id list for the day. */
export function reorderPlannedWorkoutIds(plannedForDay, draggedId, targetId, position = 'before') {
  const sorted = sortPlannedWorkoutsForDay(plannedForDay);
  const dragId = String(draggedId);
  const tgtId = String(targetId);
  if (dragId === tgtId) return sorted.map((p) => String(p._id));
  const dragged = sorted.find((p) => String(p._id) === dragId);
  if (!dragged) return sorted.map((p) => String(p._id));
  const without = sorted.filter((p) => String(p._id) !== dragId);
  let insertAt = without.findIndex((p) => String(p._id) === tgtId);
  if (insertAt === -1) return sorted.map((p) => String(p._id));
  if (position === 'after') insertAt += 1;
  without.splice(insertAt, 0, dragged);
  return without.map((p) => String(p._id));
}

/** Compare two activities chronologically (earliest first). */
export function compareActivitiesChronologically(a, b) {
  const ta = activitySortTime(a);
  const tb = activitySortTime(b);
  if (ta !== tb) return ta - tb;
  const ida = String(a?.id ?? a?._id ?? '');
  const idb = String(b?.id ?? b?._id ?? '');
  return ida.localeCompare(idb);
}

export function sortActivitiesChronologically(acts) {
  return [...(acts || [])].sort(compareActivitiesChronologically);
}

/** All ids that may refer to the same completed activity (id, _id, strava-*, etc.). */
export function activityClaimKeys(act) {
  const keys = new Set();
  if (!act) return keys;
  const appId = getActivityAppId(act);
  if (appId) keys.add(appId);
  if (act.id != null && String(act.id)) keys.add(String(act.id));
  if (act._id != null && String(act._id)) keys.add(String(act._id));
  if (act.stravaId != null) {
    keys.add(String(act.stravaId));
    keys.add(`strava-${act.stravaId}`);
  }
  if (act.sourceStravaActivityId != null) {
    keys.add(String(act.sourceStravaActivityId));
    keys.add(`strava-${act.sourceStravaActivityId}`);
  }
  return keys;
}

export function claimActivity(claimed, act) {
  activityClaimKeys(act).forEach((k) => claimed.add(k));
}

export function isActivityClaimed(claimed, act) {
  for (const k of activityClaimKeys(act)) {
    if (claimed.has(k)) return true;
  }
  return false;
}

export function activityMatchesClaimId(act, claimId) {
  if (!claimId) return false;
  const target = String(claimId);
  for (const k of activityClaimKeys(act)) {
    if (k === target) return true;
  }
  return getActivityAppId(act) === target;
}

/** Prefer calendar entries with stable prefixed ids (strava-*) over raw Mongo duplicates. */
function activityDedupeScore(act) {
  let score = 0;
  const id = String(act?.id ?? '');
  if (act?.stravaId != null) score += 20;
  if (id.startsWith('strava-')) score += 15;
  if (id.startsWith('fit-')) score += 12;
  if (act?.title || act?.titleManual || act?.name) score += 3;
  if (act?.manualTss != null || act?.tss != null) score += 2;
  return score;
}

/** Drop duplicate rows for the same Strava/FIT session before pairing. */
/** Seconds a session lasted, for comparison only. */
function dupSecs(a) {
  return Number(
    a?.totalTime || a?.duration || a?.movingTime || a?.moving_time
    || a?.elapsedTime || a?.elapsed_time || a?.totalElapsedTime || 0,
  ) || 0;
}

function dupMetres(a) {
  return Number(a?.distance || a?.totalDistance || a?.total_distance || 0) || 0;
}

function dupHr(a) {
  return Number(a?.avgHeartRate || a?.averageHeartRate || a?.average_heartrate || 0) || 0;
}

function dupWatts(a) {
  return Number(a?.avgPower || a?.averagePower || a?.average_watts || a?.weighted_average_watts || 0) || 0;
}

function dupDayKey(a) {
  const raw = a?.date || a?.startDate || a?.start_date || a?.timestamp;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Are these two records the same session, arriving from two places?
 *
 * The case this exists for: a ride that reached the app from both Garmin and
 * Strava. Nothing joins them — different ids, different names, no shared
 * reference — so the only evidence is that they describe the same effort.
 *
 * Every available signal has to agree, and a disagreement anywhere is a veto.
 * That asymmetry is deliberate: showing a duplicate is a visible annoyance,
 * but merging two genuinely different sessions makes one disappear, and the
 * athlete has no way to notice what is gone. So the rule errs toward leaving
 * both.
 *
 * Distance is required on both. Without it — a gym session, a treadmill hour —
 * two 45-minute entries on one day are as likely to be two real sessions as
 * one duplicated, and there is nothing left to tell them apart.
 */
export function looksLikeSameSession(a, b) {
  const dayA = dupDayKey(a);
  if (!dayA || dayA !== dupDayKey(b)) return false;
  if (activitySportBucket(a) !== activitySportBucket(b)) return false;

  const mA = dupMetres(a);
  const mB = dupMetres(b);
  if (mA <= 0 || mB <= 0) return false;
  // 1%: two laps of the same loop in one day differ by far more than this.
  if (Math.abs(mA - mB) > Math.max(mA, mB) * 0.01) return false;

  const sA = dupSecs(a);
  const sB = dupSecs(b);
  if (sA <= 0 || sB <= 0) return false;
  // 3 minutes, because the two devices rarely start and stop together — the
  // real pair that prompted this was 2h14m against 2h15m.
  if (Math.abs(sA - sB) > 180) return false;

  // Heart rate and power only vote when both records carry them. A missing
  // value is not evidence either way, so it abstains rather than blocking.
  const hrA = dupHr(a);
  const hrB = dupHr(b);
  if (hrA > 0 && hrB > 0 && Math.abs(hrA - hrB) > 3) return false;

  const wA = dupWatts(a);
  const wB = dupWatts(b);
  if (wA > 0 && wB > 0 && Math.abs(wA - wB) > Math.max(wA, wB) * 0.03) return false;

  return true;
}

export function dedupeCalendarActivities(acts) {
  const list = Array.isArray(acts) ? acts : [];
  const kept = [];
  const indexByKey = new Map();

  for (const act of list) {
    // Follow the link back to the source activity.
    //
    // Adding lactate to a Strava ride creates a Training that carries
    // sourceStravaActivityId. Its app id is `regular-<_id>` while the original
    // is `strava-<id>`, so keying on the app id alone kept both and the day
    // listed one ride twice — with two different TSS values, because the two
    // records are scored differently. The link is the evidence that they are
    // one session, so it decides the key.
    const linkedStravaId = act?.sourceStravaActivityId != null
      ? String(act.sourceStravaActivityId)
      : null;
    const stravaId = act?.stravaId != null ? String(act.stravaId) : linkedStravaId;
    const dedupeKey = stravaId
      ? `strava:${stravaId}`
      : (getActivityAppId(act) || String(act?.id ?? act?._id ?? ''));
    if (!dedupeKey) {
      kept.push(act);
      continue;
    }
    const prevIdx = indexByKey.get(dedupeKey);
    if (prevIdx == null) {
      indexByKey.set(dedupeKey, kept.length);
      kept.push(act);
      continue;
    }
    if (activityDedupeScore(act) > activityDedupeScore(kept[prevIdx])) {
      kept[prevIdx] = act;
    }
  }

  // Second pass, for records with no id in common — the same ride synced from
  // both Garmin and Strava. Nothing above can catch those, because there is
  // nothing to key on; only the numbers say they are one session. Runs after
  // the id pass so it only ever sees records already known to be distinct.
  const merged = [];
  for (const act of kept) {
    const twinIdx = merged.findIndex((m) => looksLikeSameSession(m, act));
    if (twinIdx === -1) {
      merged.push(act);
      continue;
    }
    if (activityDedupeScore(act) > activityDedupeScore(merged[twinIdx])) {
      merged[twinIdx] = act;
    }
  }
  return merged;
}

/** TrainingPeaks-style plan ↔ activity pairing for one calendar day. */
export function planSportMatchesActivity(pwSport, actSport) {
  const p = resolveSportKey(pwSport);
  const a = resolveSportKey(actSport);
  if (p === 'bike' && a === 'bike') return true;
  if (p === 'swim' && a === 'swim') return true;
  if (p === 'run' && a === 'run') return true;
  // Planner stores hikes as walk (normalizePlannedSportForApi); Strava/Garmin use Hike.
  if ((p === 'walk' || p === 'hike') && (a === 'walk' || a === 'hike')) return true;
  if (p === 'gym' && a === 'gym') return true;
  if (p === 'ski' && a === 'ski') return true;
  if (p === 'elliptical' && a === 'elliptical') return true;

  const pr = String(pwSport || '').toLowerCase();
  const ar = String(actSport || '').toLowerCase();
  if (pr === 'brick' && (a === 'bike' || a === 'run')) return true;
  if ((pr === 'mtbike' || pr === 'mtb') && (a === 'bike' || ar.includes('mtb'))) return true;
  if (pr === 'strength' && a === 'gym') return true;
  if (pr === 'crosstrain' && (a === 'elliptical' || a === 'gym')) return true;

  return p === a && p !== 'other';
}

export function pairPlannedWithActivities(plannedForDay, acts, sportMatchesFn = planSportMatchesActivity) {
  const pwToAct = new Map();
  const claimed = new Set();
  if (!plannedForDay?.length || !acts?.length) return { pwToAct, claimed };

  for (const pw of plannedForDay) {
    if (!pw?._id) continue;
    const prelinked = pw.completedTrainingId
      ? acts.find((a) => activityMatchesClaimId(a, pw.completedTrainingId))
      : null;
    const match = prelinked
      || acts.find((a) => !isActivityClaimed(claimed, a)
        && sportMatchesFn(pw.sport, a.sport || a.type || ''));
    if (match) {
      pwToAct.set(String(pw._id), match);
      claimActivity(claimed, match);
    }
  }
  return { pwToAct, claimed };
}

/**
 * Merge planned workouts + activities into one chronologically sorted list.
 * pairFn: (planned, acts) => { pwToAct, claimed | claimedKeys }
 */
export function buildChronologicalDayItems(plannedForDay, acts, pairFn) {
  const sortedPlanned = sortPlannedWorkoutsForDay(plannedForDay);
  const dedupedActs = sortActivitiesChronologically(dedupeCalendarActivities(acts));
  const pairing = pairFn(sortedPlanned, dedupedActs);
  const pwToAct = pairing.pwToAct;
  const claimed = pairing.claimed || pairing.claimedKeys || new Set();

  const items = [];

  sortedPlanned.forEach((pw, idx) => {
    const act = pw?._id ? pwToAct.get(String(pw._id)) || null : null;
    items.push({
      kind: act ? 'pair' : 'planned',
      pw,
      act,
      _sortIdx: idx,
    });
  });

  dedupedActs.forEach((act, idx) => {
    if (isActivityClaimed(claimed, act)) return;
    items.push({
      kind: 'activity',
      pw: null,
      act,
      _sortIdx: idx,
    });
  });

  items.sort(compareDayItemsChronologically);
  items.forEach((item) => { delete item._sortIdx; });

  return { items, pwToAct, claimed };
}
