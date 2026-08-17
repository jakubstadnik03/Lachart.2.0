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

/**
 * Every clock a record offers for how long the session lasted.
 *
 * Picking one field and comparing it across sources does not work, because
 * the sources do not mean the same thing by it. Strava's elapsedTime is wall
 * clock including stops; Garmin sends one duration that is the moving one. A
 * ride with 13 minutes of traffic lights arrives as 8948s from Strava and
 * 8062s from Garmin — the same ride, 886s apart, vetoed by any 3-minute rule.
 * Strava's own movingTime for it is 8147s, 85s from Garmin's.
 *
 * So collect what each side has and let the closest pair decide. The clocks a
 * record does not carry simply do not vote.
 */
function dupSecsCandidates(a) {
  const vals = [
    a?.totalTime, a?.duration, a?.movingTime, a?.moving_time,
    a?.elapsedTime, a?.elapsed_time, a?.totalElapsedTime, a?.totalTimerTime,
  ].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(vals));
}

/** Smallest gap between any clock on A and any clock on B, or Infinity. */
function closestDupSecsGap(xs, ys) {
  if (!xs.length || !ys.length) return Infinity;
  let best = Infinity;
  for (const x of xs) for (const y of ys) best = Math.min(best, Math.abs(x - y));
  return best;
}

/** Which place a calendar row arrived from. */
function dupSource(a) {
  if (a?.source) return String(a.source);
  const id = String(a?.id ?? '');
  if (id.startsWith('strava-') || a?.stravaId != null) return 'strava';
  if (id.startsWith('garmin-') || a?.garminId != null) return 'garmin';
  if (id.startsWith('apple-') || a?.healthKitId != null) return 'apple_health';
  if (id.startsWith('fit-')) return 'fit';
  return String(a?.type || 'regular');
}

/**
 * Providers whose stored start is a real instant.
 *
 * Garmin and Apple store the moment the session began. Strava rows are saved
 * from start_date_local — a local wall clock in a UTC-shaped field — and FIT
 * files carry device local time the same way. When one record of a pair comes
 * from each kind, this is what says whose timestamp to believe.
 */
const TRUE_UTC_SOURCES = new Set(['garmin', 'apple_health']);

function dupMetres(a) {
  return Number(a?.distance || a?.totalDistance || a?.total_distance || 0) || 0;
}

function dupHr(a) {
  return Number(a?.avgHeartRate || a?.averageHeartRate || a?.average_heartrate || 0) || 0;
}

function dupWatts(a) {
  return Number(a?.avgPower || a?.averagePower || a?.average_watts || a?.weighted_average_watts || 0) || 0;
}

function dupStartMs(a) {
  const raw = a?.date || a?.startDate || a?.start_date || a?.timestamp;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** Local calendar day as a number, so neighbouring days are ±1. */
function dupDayIndex(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return Math.round(d.getTime() / 86400000);
}

/** Only these three are classified confidently enough to veto a pair. */
function isConfidentSport(bucket) {
  return bucket === 'bike' || bucket === 'run' || bucket === 'swim';
}

/**
 * Everything the comparison needs, read off a record once.
 *
 * Dedup is quadratic in the worst case and a calendar payload runs to
 * thousands of rows, so parsing the same date and walking the same field
 * chains inside the inner loop is the difference between instant and
 * noticeable.
 */
export function sessionSignals(act) {
  const ms = dupStartMs(act);
  return {
    act,
    src: dupSource(act),
    sport: activitySportBucket(act),
    ms,
    dayIdx: dupDayIndex(ms),
    secs: dupSecsCandidates(act),
    metres: dupMetres(act),
    hr: dupHr(act),
    watts: dupWatts(act),
  };
}

/**
 * The gap you get when one provider stores local wall time and the other
 * stores UTC.
 *
 * The same ride reaches the app 2h apart in Czech summer — 15:42 from Strava,
 * 13:42 from Garmin — so nothing gated on "starts within five minutes" can
 * pair them, and a late-evening session lands on two different days. The
 * offset is not slack in the rules: it is one specific number, the athlete's
 * own UTC offset for that date, which is why matching it is evidence of a pair
 * rather than a hole. When the athlete is abroad it simply does not match, and
 * the stricter same-day fingerprint below is what decides instead.
 */
function clocksOffsetByTimezone(A, B) {
  if (!Number.isFinite(A.ms) || !Number.isFinite(B.ms)) return false;
  // Exactly one side can be on the offset clock. Garmin and Apple both store
  // real instants, so two of those hours apart are two sessions.
  if (TRUE_UTC_SOURCES.has(A.src) === TRUE_UTC_SOURCES.has(B.src)) return false;
  const offset = Math.abs(new Date(Math.min(A.ms, B.ms)).getTimezoneOffset()) * 60000;
  if (offset === 0) return false;
  return Math.abs(Math.abs(A.ms - B.ms) - offset) <= 5 * 60 * 1000;
}

/**
 * Are these two records the same session, arriving from two places?
 *
 * The case this exists for: a ride that reached the app from both Garmin and
 * Strava. Nothing joins them — different ids, different names, no shared
 * reference — so the only evidence is that they describe the same effort.
 *
 * A disagreement in sport, heart rate or power is always a veto. That
 * asymmetry is deliberate: showing a duplicate is a visible annoyance, but
 * merging two genuinely different sessions makes one disappear, and the
 * athlete has no way to notice what is gone.
 *
 * What counts as agreement depends on whether the two clocks can be compared
 * at all, which is what the tiers below are for.
 */
function sameSessionSignals(A, B) {
  // Two records from the same place are two different sessions. Strava never
  // returns one ride twice, and neither does Garmin — so whatever the numbers
  // say, there is nothing to collapse here, and collapsing would delete a real
  // session. This is also what lets the duration rules below stay generous.
  if (!A.src || A.src === B.src) return false;

  // Sports must agree when both are classified confidently. A legacy Garmin
  // row carrying a raw typeKey resolves to 'other', and that is not evidence
  // of a different sport — it abstains rather than vetoing.
  if (isConfidentSport(A.sport) && isConfidentSport(B.sport) && A.sport !== B.sport) return false;

  const startGap = Math.abs(A.ms - B.ms);
  const startsTogether = Number.isFinite(startGap) && startGap <= 5 * 60 * 1000;
  const offsetClocks = clocksOffsetByTimezone(A, B);
  const sameDay = A.dayIdx != null && A.dayIdx === B.dayIdx;
  // Two sessions a day apart are two sessions — unless the clocks are offset,
  // which is exactly how one evening session ends up on two dates.
  if (!sameDay && !offsetClocks) return false;

  // Duration compared across every clock each side carries, so a
  // stop-inclusive elapsed time on one side cannot veto a match its own moving
  // time confirms: one ride through Prague reads 8948s from Strava against
  // 8062s from Garmin, while Strava's own moving time is 85s from Garmin's.
  const durGap = closestDupSecsGap(A.secs, B.secs);
  const hasDur = A.secs.length > 0 && B.secs.length > 0;
  const longest = Math.max(...A.secs, ...B.secs, 0);
  const durAgrees = !hasDur || durGap <= Math.max(180, 0.1 * longest);
  const durAgreesTightly = hasDur && durGap <= Math.max(180, 0.05 * longest);

  const mA = A.metres;
  const mB = B.metres;
  const distGap = Math.abs(mA - mB);
  const farthest = Math.max(mA, mB);
  const bothHaveDistance = mA > 0 && mB > 0;
  // A missing distance abstains: a gym hour has none, and requiring it would
  // leave every strength session duplicated.
  const distAgrees = !bothHaveDistance || distGap <= farthest * 0.05;

  // Tier 1 — the timestamps agree, which is most of the evidence on its own.
  const tier1 = startsTogether && durAgrees && distAgrees;

  // Tier 2 — starts close enough to be one session and the same route to
  // within 3.5%, which is as far apart as provider GPS trimming puts the same
  // race. Apple Health is exempt from the duration check: it reports the
  // elapsed hour where Strava and Garmin report the moving one, so its
  // durations for a single session can be hours out and no rule can hold
  // them. For everyone else a duration that disagrees is the evidence that
  // these are two different sessions — two laps of one loop, not one lap
  // recorded twice.
  const routeMatches = mA > 200 && mB > 200 && distGap <= farthest * 0.035;
  const applePair = A.src === 'apple_health' || B.src === 'apple_health';
  const tier2 = (applePair || durAgrees) && Number.isFinite(startGap)
    && startGap <= 15 * 60 * 1000 && routeMatches;

  // Tier 3 — the offset-clock pair. The gap is the athlete's UTC offset, the
  // sports agree, the route matches to 3.5% and some pair of clocks agrees on
  // the length. Two devices recording one session differ by more than the 1%
  // the same-day rule below demands — 10.01 km against 10.18 km for one run —
  // which is how these survived every earlier attempt.
  const tier3 = offsetClocks && routeMatches && durAgrees;

  // Tier 4 — the timestamps cannot be compared at all (a FIT file's device
  // clock, hours from Strava's). Same day, the same route to within 1% and a
  // duration that agrees to within 3 minutes is a unique fingerprint, and the
  // same-provider guard above already excludes commute-style repeats.
  const tier4 = sameDay && durAgreesTightly
    && bothHaveDistance && distGap <= farthest * 0.01;

  if (!tier1 && !tier2 && !tier3 && !tier4) return false;

  // Heart rate and power only vote when both records carry them. A missing
  // value is not evidence either way, so it abstains rather than blocking.
  //
  // Loose on purpose. By this point the two records agree on the day, the
  // sport, the route and the length — two genuinely different sessions
  // matching all of that is already vanishingly unlikely, so these are a guard
  // against the pathological case, not the deciding evidence. Set tight (3
  // bpm, 3%) they vetoed real pairs instead: two devices recording one ride
  // smooth and start and stop differently, and their averages drift by more.
  if (A.hr > 0 && B.hr > 0 && Math.abs(A.hr - B.hr) > 12) return false;
  if (A.watts > 0 && B.watts > 0
    && Math.abs(A.watts - B.watts) > Math.max(A.watts, B.watts) * 0.15) return false;

  return true;
}

export function looksLikeSameSession(a, b) {
  return sameSessionSignals(sessionSignals(a), sessionSignals(b));
}

/**
 * When an offset-clock pair straddles midnight, the survivor has to be dated
 * by the provider that stores real instants — otherwise collapsing the pair
 * silently moves the session onto the wrong day, which is the bug the merge
 * was supposed to fix wearing a different hat.
 */
function withTrueStart(winner, other) {
  if (!other || TRUE_UTC_SOURCES.has(winner.src) || !TRUE_UTC_SOURCES.has(other.src)) return winner.act;
  if (winner.dayIdx === other.dayIdx) return winner.act; // same day on screen — leave it be
  const trueStart = other.act?.date || other.act?.startDate || new Date(other.ms).toISOString();
  return { ...winner.act, date: trueStart, startDate: trueStart };
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
  //
  // Candidates come from the day itself and the two days either side, because
  // an offset clock can date the two records of one evening session a day
  // apart. Anything with no usable date skips the numeric pass entirely.
  const merged = [];
  const seenByDay = new Map(); // day index -> [{ sig, idx }]
  for (const act of kept) {
    const sig = sessionSignals(act);
    let twinIdx = -1;
    let twinSig = null;
    if (sig.dayIdx != null) {
      for (const day of [sig.dayIdx, sig.dayIdx - 1, sig.dayIdx + 1]) {
        const bucket = seenByDay.get(day);
        if (!bucket) continue;
        const hit = bucket.find((entry) => sameSessionSignals(entry.sig, sig));
        if (hit) { twinIdx = hit.idx; twinSig = hit.sig; break; }
      }
    }

    if (twinIdx === -1) {
      const entry = { sig, idx: merged.length };
      merged.push(act);
      if (sig.dayIdx != null) {
        const bucket = seenByDay.get(sig.dayIdx) || [];
        bucket.push(entry);
        seenByDay.set(sig.dayIdx, bucket);
      }
      continue;
    }

    if (activityDedupeScore(act) > activityDedupeScore(twinSig.act)) {
      merged[twinIdx] = withTrueStart(sig, twinSig);
      twinSig.act = merged[twinIdx];
      twinSig.src = sig.src;
      twinSig.sport = isConfidentSport(sig.sport) ? sig.sport : twinSig.sport;
      twinSig.secs = sig.secs;
      twinSig.metres = sig.metres || twinSig.metres;
      twinSig.hr = sig.hr || twinSig.hr;
      twinSig.watts = sig.watts || twinSig.watts;
    } else {
      merged[twinIdx] = withTrueStart(twinSig, sig);
      twinSig.act = merged[twinIdx];
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
