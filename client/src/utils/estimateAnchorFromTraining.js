/**
 * Thresholds for an athlete who has never tested.
 *
 * Everything else in the app hangs off a lactate test. That is the right
 * design — a test is the only thing here made of blood — but it leaves the
 * newest user staring at an empty page, and they are exactly the person who
 * needs convincing that any of this is worth doing. Most of them arrive with
 * months of rides and runs already synced. That training says a great deal
 * about where their thresholds sit; it has simply never been asked.
 *
 * This asks it, and is careful about how loudly it answers. Every number comes
 * back labelled with where it came from, in a strict order of preference:
 *
 *   1. **Held heart rate.** hrTestPlanner walks the athlete's own HR streams
 *      and finds the intensity they can hold with heart rate flat. That is a
 *      field threshold test they did not know they were doing, and it is by
 *      some distance the best evidence available without blood.
 *   2. **A number they typed.** An FTP or threshold pace in their profile is
 *      usually the output of a real test somebody ran on them once.
 *   3. **A best twenty minutes.** The oldest estimate in cycling, and still a
 *      decent one: best 20-minute power × 0.95.
 *   4. **A best sustained effort.** For running, the fastest long steady
 *      average, slowed a little — the roughest source here, and flagged as such.
 *
 * LT1 is the one almost nobody has. Where the streams do not give it, it is
 * placed at the usual fraction of LT2 and labelled as derived rather than
 * measured, because the alternative — saying nothing about the bottom of the
 * curve — leaves out the half of it most athletes are training in.
 *
 * The result is anchor-shaped, so the curve renderer, the drift projection and
 * the zone tables all work on it unchanged. It carries `modelled: true`.
 */

import { modelledLactateCurve, sportKind, thresholdToDemand } from './hrPowerProfile';

/** Best-20-minute power to FTP, and FTP is close enough to LT2 for this purpose. */
const P20_TO_LT2 = 0.95;
/** A fastest sustained run average is quicker than threshold; slow it by this. */
const BEST_RUN_PACE_TO_LT2 = 1.05;
/** A long steady run has to be at least this long to say anything about threshold. */
const MIN_RUN_SEC = 20 * 60;
/** How far below LT2, in demand, LT1 usually sits when nothing has measured it. */
const LT1_OF_LT2 = { bike: 0.80, run: 0.86 };
/** LT2 heart rate as a fraction of maximum, when only maximum is known. */
const LT2_HR_OF_MAX = 0.90;
const LT1_HR_OF_MAX = 0.78;
/** Activities older than this describe a different athlete. */
const LOOKBACK_DAYS = 180;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function activitySport(a) {
  return String(a?.sport || a?.type || a?.sport_type || '').toLowerCase();
}

function matchesSport(a, kind) {
  const s = activitySport(a);
  if (kind === 'bike') {
    return s.includes('ride') || s.includes('bike') || s.includes('cycl') || s === 'virtualride';
  }
  if (kind === 'run') return s.includes('run');
  return false;
}

function activityDuration(a) {
  return num(a?.movingTime ?? a?.moving_time ?? a?.totalElapsedTime
    ?? a?.elapsedTime ?? a?.duration) || 0;
}

function activityDate(a) {
  const t = new Date(a?.startDate || a?.date || a?.start_date || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function activitySpeed(a) {
  const stored = num(a?.avgSpeed ?? a?.averageSpeed ?? a?.average_speed);
  if (stored) return stored;
  const dist = num(a?.distance ?? a?.totalDistance);
  const dur = activityDuration(a);
  return dist && dur ? dist / dur : null;
}

// ── The individual sources ─────────────────────────────────────────────────

/**
 * @returns {null | {value:number, hr:number|null, label:string, detail:string,
 *                   confidence:'high'|'medium'|'low'}}
 */
function fromHrStreams(plan, key, kind) {
  const est = plan?.[key];
  if (!est) return null;
  const value = kind === 'bike' ? num(est.power) : num(est.pace);
  const hr = num(est.hr?.value);
  if (!value) return hr ? { value: null, hr, label: null, detail: null, confidence: est.confidence } : null;
  const n = Array.isArray(est.evidence) ? est.evidence.length : 0;
  return {
    value,
    hr,
    label: 'your own steady sessions',
    detail: n
      ? `${n} session${n === 1 ? '' : 's'} where your heart rate held flat at a fixed effort`
      : 'sessions where your heart rate held flat at a fixed effort',
    confidence: est.confidence === 'high' ? 'high' : est.confidence === 'medium' ? 'medium' : 'low',
  };
}

function fromProfile(profile, kind) {
  const zones = profile?.powerZones || {};
  const value = kind === 'bike'
    ? num(zones.cycling?.lt2) || num(zones.cycling?.ftp) || num(profile?.ftp)
    : num(zones.running?.lt2) || num(profile?.runningZones?.lt2) || num(profile?.thresholdPace);
  if (!value) return null;
  // Values this app inferred for itself are not something the athlete told us.
  const inferred = kind === 'bike' ? zones.cycling?._inferred : zones.running?._inferred;
  return {
    value,
    hr: null,
    label: inferred ? 'a threshold inferred from your activities' : 'the threshold in your profile',
    detail: inferred
      ? 'estimated from your activity summaries'
      : kind === 'bike' ? 'the FTP you have set' : 'the threshold pace you have set',
    confidence: inferred ? 'low' : 'medium',
  };
}

function fromPowerMetrics(metrics, kind) {
  if (kind !== 'bike') return null;
  const p20 = num(metrics?.personalRecords?.threshold20min) || num(metrics?.allTime?.threshold20min);
  if (!p20) return null;
  return {
    value: Math.round(p20 * P20_TO_LT2),
    hr: null,
    label: 'your best twenty minutes',
    detail: `${Math.round(p20)} W held for 20 min, × ${P20_TO_LT2} — the standard FTP estimate`,
    confidence: 'medium',
  };
}

function fromBestRun(activities, kind, now) {
  if (kind !== 'run') return null;
  const cutoff = now - LOOKBACK_DAYS * 86400000;
  let best = null;
  for (const a of activities || []) {
    if (!matchesSport(a, 'run')) continue;
    if (activityDate(a) < cutoff) continue;
    if (activityDuration(a) < MIN_RUN_SEC) continue;
    const speed = activitySpeed(a);
    if (!speed) continue;
    if (!best || speed > best.speed) best = { speed, date: activityDate(a) };
  }
  if (!best) return null;
  const pace = 1000 / best.speed;
  return {
    value: Math.round(pace * BEST_RUN_PACE_TO_LT2),
    hr: null,
    label: 'your fastest long run',
    detail: `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')}/km `
      + 'averaged over 20 minutes or more, slowed a little to threshold',
    confidence: 'low',
  };
}

/** Whatever the app knows about how high this heart can go. */
function maxHeartRate(plan, profile, kind) {
  const zones = profile?.heartRateZones || {};
  const key = kind === 'bike' ? 'cycling' : 'running';
  return num(plan?.hrMax?.value)
    || num(zones[key]?.maxHeartRate)
    || num(profile?.maxHr) || num(profile?.maxHeartRate)
    || null;
}

/**
 * A threshold heart rate hiding in the saved zone table.
 *
 * The zone builder puts LT1 on the Z2/Z3 edge and LT2 on the Z3/Z4 edge, so
 * those boundaries *are* the thresholds — `zone4.min`, not `zone4.max`, which
 * sits 4% above LT2 and would read as a threshold the athlete does not have.
 */
function thresholdHrFromProfile(profile, kind, which) {
  const key = kind === 'bike' ? 'cycling' : 'running';
  const z = profile?.heartRateZones?.[key];
  if (!z) return null;
  if (which === 'lt2') {
    return num(z.lt2) || num(z.lt2Hr) || num(z.threshold)
      || num(z.zone4?.min) || num(z.zone3?.max) || null;
  }
  return num(z.lt1) || num(z.lt1Hr) || num(z.zone3?.min) || num(z.zone2?.max) || null;
}

// ── Assembly ───────────────────────────────────────────────────────────────

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

/**
 * @param {object} o
 * @param {string} o.sport
 * @param {object} [o.hrTestPlan]   generateHRTestPlan() output for this sport
 * @param {object} [o.profile]      the athlete's profile
 * @param {object} [o.powerMetrics] /api/fit/power-metrics response
 * @param {Array}  [o.activities]   external activity summaries
 * @param {Date}   [o.now]
 * @returns {null | object} anchor-shaped, plus {modelled, sources, confidence, lt1Derived}
 */
export function estimateAnchorFromTraining({
  sport, hrTestPlan = null, profile = null, powerMetrics = null, activities = [], now = null,
}) {
  const kind = sportKind(sport);
  if (kind !== 'bike' && kind !== 'run') return null;
  const nowMs = now ? new Date(now).getTime() : Date.now();

  // First source that carries a number wins; the rest are not consulted.
  const lt2Candidates = [
    fromHrStreams(hrTestPlan, 'lt2', kind),
    fromProfile(profile, kind),
    fromPowerMetrics(powerMetrics, kind),
    fromBestRun(activities, kind, nowMs),
  ].filter(Boolean);
  const lt2Source = lt2Candidates.find((c) => c.value);
  if (!lt2Source) return null;

  const hrMax = maxHeartRate(hrTestPlan, profile, kind);
  const sources = [{ threshold: 'LT2', ...lt2Source }];

  // LT2 heart rate: from the streams if they found it, then the profile, then
  // a fraction of maximum — which is a population number and says so.
  let lt2Hr = num(lt2Source.hr)
    || num(fromHrStreams(hrTestPlan, 'lt2', kind)?.hr)
    || thresholdHrFromProfile(profile, kind, 'lt2');
  let lt2HrLabel = lt2Hr ? 'measured on your own sessions' : null;
  /**
   * Whether the heart rates are this athlete's or the population's.
   *
   * It matters more than it looks: the heart-rate zones the card offers are
   * built off these two numbers, and a zone table drawn from 90% of an
   * estimated maximum is a textbook, not a person. The card marks them rather
   * than printing them as if a strap had recorded them.
   */
  let hrIsPopulation = false;
  if (!lt2Hr && hrMax) {
    lt2Hr = Math.round(hrMax * LT2_HR_OF_MAX);
    hrIsPopulation = true;
    lt2HrLabel = `${Math.round(LT2_HR_OF_MAX * 100)}% of your ${Math.round(hrMax)} bpm maximum — a population figure, not yours`;
  }

  // LT1: the streams again if they have it, otherwise the usual fraction of
  // LT2, computed in demand so the pace sign cannot go the wrong way.
  const lt1Stream = fromHrStreams(hrTestPlan, 'lt1', kind);
  let lt1 = num(lt1Stream?.value);
  let lt1Derived = false;
  if (lt1) {
    sources.push({ threshold: 'LT1', ...lt1Stream });
  } else {
    const lt2Demand = thresholdToDemand(lt2Source.value, { kind, storageMode: 'pace' });
    const lt1Demand = lt2Demand * LT1_OF_LT2[kind];
    lt1 = kind === 'bike' ? lt1Demand : 1000 / lt1Demand;
    lt1Derived = true;
    sources.push({
      threshold: 'LT1',
      value: lt1,
      hr: null,
      label: 'derived from LT2',
      detail: `${Math.round(LT1_OF_LT2[kind] * 100)}% of LT2 — where the aerobic threshold usually sits `
        + 'when nothing has measured it',
      confidence: 'low',
    });
  }

  let lt1Hr = num(lt1Stream?.hr) || thresholdHrFromProfile(profile, kind, 'lt1');
  if (!lt1Hr && hrMax) {
    lt1Hr = Math.round(hrMax * LT1_HR_OF_MAX);
    hrIsPopulation = true;
  }

  const anchor = modelledLactateCurve({
    lt1, lt2: lt2Source.value, lt1Hr, lt2Hr, hrMax,
    sport: kind, storageMode: 'pace',
  });
  if (!anchor) return null;

  // The whole thing is only as good as its weakest load-bearing part, and LT2
  // is the part everything else is hung off.
  let confidence = lt2Source.confidence || 'low';
  if (lt1Derived && confidence === 'high') confidence = 'medium';
  if (!lt2Hr) confidence = 'low';

  return {
    ...anchor,
    sources,
    confidence,
    lt1Derived,
    lt2HrLabel,
    hrIsPopulation,
    hrMax,
    /** How many activities of this sport the estimate had to look at. */
    activityCount: (activities || []).filter(
      (a) => matchesSport(a, kind) && activityDate(a) >= nowMs - LOOKBACK_DAYS * 86400000,
    ).length,
  };
}

/** The one sentence a card can lead with. */
export function describeEstimate(estimate) {
  if (!estimate) return null;
  const lt2 = estimate.sources?.find((s) => s.threshold === 'LT2');
  if (!lt2) return null;
  return {
    lead: `Estimated from ${lt2.label}`,
    detail: lt2.detail,
    confidence: estimate.confidence,
  };
}

export const ESTIMATE_CONSTANTS = {
  P20_TO_LT2, BEST_RUN_PACE_TO_LT2, LT1_OF_LT2, LT2_HR_OF_MAX, LT1_HR_OF_MAX, LOOKBACK_DAYS,
};

export { CONFIDENCE_RANK };
