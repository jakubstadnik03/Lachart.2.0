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

function plannedItemSortTime(pw, act, fallbackIndex = 0) {
  if (act) return activitySortTime(act);
  const day = String(pw?.date || '').slice(0, 10);
  if (!day) return fallbackIndex;
  const noon = new Date(`${day}T12:00:00`).getTime();
  const created = pw?.createdAt ? new Date(pw.createdAt).getTime() : 0;
  return (Number.isFinite(noon) ? noon : 0) + (fallbackIndex * 1000) + (created % 1000);
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
export function dedupeCalendarActivities(acts) {
  const list = Array.isArray(acts) ? acts : [];
  const kept = [];
  const indexByKey = new Map();

  for (const act of list) {
    const stravaId = act?.stravaId != null ? String(act.stravaId) : null;
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
  return kept;
}

/** TrainingPeaks-style plan ↔ activity pairing for one calendar day. */
export function planSportMatchesActivity(pwSport, actSport) {
  const p = String(pwSport || '').toLowerCase();
  const a = String(actSport || '').toLowerCase();
  if (p === 'bike' && (a.includes('ride') || a.includes('bike') || a.includes('cycle') || a.includes('virtual'))) return true;
  if (p === 'run' && a.includes('run')) return true;
  if (p === 'swim' && a.includes('swim')) return true;
  if (p === 'walk' && a.includes('walk')) return true;
  if (p === 'strength' && (a.includes('weight') || a.includes('strength') || a.includes('gym'))) return true;
  return p === a;
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
  const dedupedActs = dedupeCalendarActivities(acts);
  const pairing = pairFn(plannedForDay || [], dedupedActs);
  const pwToAct = pairing.pwToAct;
  const claimed = pairing.claimed || pairing.claimedKeys || new Set();

  const items = [];

  (plannedForDay || []).forEach((pw, idx) => {
    const act = pw?._id ? pwToAct.get(String(pw._id)) || null : null;
    items.push({
      kind: act ? 'pair' : 'planned',
      pw,
      act,
      sortTime: plannedItemSortTime(pw, act, idx),
    });
  });

  dedupedActs.forEach((act) => {
    if (isActivityClaimed(claimed, act)) return;
    items.push({
      kind: 'activity',
      pw: null,
      act,
      sortTime: activitySortTime(act),
    });
  });

  items.sort((a, b) => {
    if (a.sortTime !== b.sortTime) return a.sortTime - b.sortTime;
    const rank = { pair: 0, planned: 1, activity: 2 };
    return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
  });

  return { items, pwToAct, claimed };
}
