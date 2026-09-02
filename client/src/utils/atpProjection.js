/**
 * atpProjection.js — what the season plan does to fitness.
 *
 * Two chains run day by day over the same impulse-response model the dashboard
 * uses (CTL 42-day, ATL 7-day exponential averages), sharing one pre-season
 * history so they start from the same fitness:
 *
 *   ATP     — what the plan produces if every week is hit exactly. Actual TSS
 *             up to the season start, then the weekly target spread evenly
 *             across seven days.
 *   Actual  — what is really happening. Logged TSS up to today, planned
 *             workouts after it, then nothing, so the line decays and the gap
 *             to the ATP line is the cost of the weeks that were missed.
 *
 * That gap is the reason the page exists. A season plan that only showed its
 * own targets would always look achieved.
 */

import { resolveActivityTss } from './computeTss';
import { enrichProfileForTss } from './inferThresholdsFromActivities';
import { localCalendarDateKey, activityCalendarDateKey } from './formFitnessFromActivities';
import { completedSecs } from './completedSessionStats';
import { plannedWorkoutDurationSecs } from './planCompliance';

const ALPHA_CTL = 1 / 42;
const ALPHA_ATL = 1 / 7;

/** Days of history run before the season start so the seed CTL is settled. */
const WARMUP_DAYS = 180;

// ── date helpers ───────────────────────────────────────────────────────────

export function parseDayKey(key) {
  const d = new Date(`${String(key).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDaysKey(key, n) {
  const d = parseDayKey(key);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return localCalendarDateKey(d);
}

export function mondayKeyOf(dateOrKey) {
  const d = typeof dateOrKey === 'string' ? parseDayKey(dateOrKey) : new Date(dateOrKey);
  if (!d || Number.isNaN(d.getTime())) return null;
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return localCalendarDateKey(d);
}

// ── daily TSS inputs ───────────────────────────────────────────────────────

/**
 * Logged TSS per day, resolved exactly the way the dashboard and calendar do it
 * so Fitness on this page can never disagree with Fitness on that one.
 */
export function buildActualDailyTss(activities, profile, { tssUser = null } = {}) {
  const out = {};
  if (!Array.isArray(activities) || !activities.length || !profile) return out;

  const effectiveProfile = enrichProfileForTss(profile, activities);
  const prefsUser = tssUser || profile;

  for (const act of activities) {
    const dk = activityCalendarDateKey(act);
    if (!dk) continue;
    const tss = resolveActivityTss(act, effectiveProfile, { user: prefsUser }) || 0;
    if (tss > 0) out[dk] = (out[dk] || 0) + tss;
  }
  return out;
}

/** Estimated TSS for a planned workout — explicit target, else ~50 TSS/h. */
export function plannedWorkoutTss(pw) {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  const secs = Number(pw?.plannedDuration || 0);
  if (secs > 0 && secs < 24 * 3600) return (secs / 3600) * 50;
  return 0;
}

/** Planned TSS per day. Completed ones are skipped — they arrive as real activities. */
export function buildPlannedDailyTss(plannedWorkouts = []) {
  const out = {};
  for (const pw of plannedWorkouts) {
    if (pw?.status === 'completed' || pw?.status === 'skipped') continue;
    const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : localCalendarDateKey(pw?.date);
    if (!day) continue;
    const tss = plannedWorkoutTss(pw);
    if (tss > 0) out[day] = (out[day] || 0) + tss;
  }
  return out;
}

// ── the projection ─────────────────────────────────────────────────────────

/**
 * Run one CTL/ATL chain over a date range.
 * @param {(key: string) => number} tssForDay
 * @returns {Map<string, {ctl:number, atl:number}>} end-of-day values
 */
function runChain(fromKey, toKey, tssForDay, seed = { ctl: 0, atl: 0 }) {
  const out = new Map();
  let { ctl, atl } = seed;
  let cur = fromKey;
  // 2000 days ≈ 5.5 years; a guard against a malformed range, never hit normally.
  for (let i = 0; cur && cur <= toKey && i < 2000; i += 1) {
    const tss = tssForDay(cur) || 0;
    ctl += ALPHA_CTL * (tss - ctl);
    atl += ALPHA_ATL * (tss - atl);
    out.set(cur, { ctl, atl });
    cur = addDaysKey(cur, 1);
  }
  return out;
}

/**
 * Project a season.
 *
 * @param {object} opts
 * @param {Array}  opts.weeks             plan week rows ({ weekStart, period, periodWeek, targetTss })
 * @param {object} opts.actualDailyTss    'YYYY-MM-DD' -> logged TSS
 * @param {object} opts.plannedDailyTss   'YYYY-MM-DD' -> planned-workout TSS
 * @param {Array}  opts.races             [{ _id, name, date, priority, sport }]
 * @param {Date}   opts.today
 * @returns {{ rows: Array, totals: object }}
 */
export function projectAtpSeason({
  weeks = [],
  actualDailyTss = {},
  plannedDailyTss = {},
  races = [],
  sportsByWeek = {},
  testsByWeek = {},
  today = new Date(),
} = {}) {
  const sorted = [...(weeks || [])]
    .filter((w) => w?.weekStart)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  if (!sorted.length) {
    return { rows: [], totals: { atpTss: 0, plannedTss: 0, completedTss: 0 } };
  }

  const seasonStart = sorted[0].weekStart;
  const seasonEnd = addDaysKey(sorted[sorted.length - 1].weekStart, 6);
  const todayKey = localCalendarDateKey(today);

  // Weekly target spread evenly across the week — the same assumption
  // TrainingPeaks makes, and the only one available before the week is built.
  const dailyTargetByWeek = new Map(
    sorted.map((w) => [w.weekStart, (Number(w.targetTss) || 0) / 7]),
  );
  const weekStartFor = (key) => mondayKeyOf(key);

  // Shared history: everything logged before the season began.
  const warmStart = addDaysKey(seasonStart, -WARMUP_DAYS);
  const history = runChain(warmStart, addDaysKey(seasonStart, -1), (k) => actualDailyTss[k] || 0);
  const lastHist = history.get(addDaysKey(seasonStart, -1));
  const seed = lastHist ? { ctl: lastHist.ctl, atl: lastHist.atl } : { ctl: 0, atl: 0 };

  const atpChain = runChain(seasonStart, seasonEnd, (k) => {
    const ws = weekStartFor(k);
    return dailyTargetByWeek.get(ws) || 0;
  }, { ...seed });

  const actualChain = runChain(seasonStart, seasonEnd, (k) => {
    if (k <= todayKey) return actualDailyTss[k] || 0;
    return plannedDailyTss[k] || 0;
  }, { ...seed });

  // Races land on the week that contains them, newest lookup wins nothing —
  // a week with two races lists both.
  const racesByWeek = new Map();
  for (const r of races || []) {
    const ws = mondayKeyOf(r?.date);
    if (!ws) continue;
    if (!racesByWeek.has(ws)) racesByWeek.set(ws, []);
    racesByWeek.get(ws).push(r);
  }

  // Countdown target: the next A race at or after each week.
  const aRaceWeeks = (races || [])
    .filter((r) => String(r?.priority || 'A').toUpperCase() === 'A')
    .map((r) => mondayKeyOf(r.date))
    .filter(Boolean)
    .sort();

  const thisWeekKey = mondayKeyOf(today);
  let prevAtpCtl = seed.ctl;
  let prevActualCtl = seed.ctl;

  const rows = sorted.map((w) => {
    const weekEnd = addDaysKey(w.weekStart, 6);
    const atp = atpChain.get(weekEnd) || { ctl: prevAtpCtl, atl: 0 };
    const act = actualChain.get(weekEnd) || { ctl: prevActualCtl, atl: 0 };

    let completedTss = 0;
    let plannedTss = 0;
    for (let i = 0; i < 7; i += 1) {
      const k = addDaysKey(w.weekStart, i);
      completedTss += actualDailyTss[k] || 0;
      if (k > todayKey) plannedTss += plannedDailyTss[k] || 0;
    }

    const nextA = aRaceWeeks.find((k) => k >= w.weekStart);
    const weeksToEvent = nextA
      ? Math.round((parseDayKey(nextA) - parseDayKey(w.weekStart)) / (7 * 86400000))
      : null;

    const row = {
      weekStart: w.weekStart,
      weekEnd,
      period: w.period || null,
      periodWeek: w.periodWeek || null,
      targetTss: Math.round(Number(w.targetTss) || 0),
      targetHours: w.targetHours ?? null,
      notes: w.notes || '',
      completedTss: Math.round(completedTss),
      plannedTss: Math.round(plannedTss),
      races: racesByWeek.get(w.weekStart) || [],
      sports: sportsByWeek[w.weekStart] || null,
      tests: testsByWeek[w.weekStart] || [],
      weeksToEvent,
      atpCtl: Math.round(atp.ctl),
      atpTsb: Math.round(atp.ctl - atp.atl),
      atpRamp: Math.round(atp.ctl - prevAtpCtl),
      actualCtl: Math.round(act.ctl),
      actualTsb: Math.round(act.ctl - act.atl),
      actualRamp: Math.round(act.ctl - prevActualCtl),
      isPast: weekEnd < thisWeekKey,
      isCurrent: w.weekStart === thisWeekKey,
      isFuture: w.weekStart > thisWeekKey,
    };

    prevAtpCtl = atp.ctl;
    prevActualCtl = act.ctl;
    return row;
  });

  const totals = rows.reduce((acc, r) => ({
    atpTss: acc.atpTss + r.targetTss,
    plannedTss: acc.plannedTss + r.plannedTss,
    completedTss: acc.completedTss + r.completedTss,
  }), { atpTss: 0, plannedTss: 0, completedTss: 0 });

  return { rows, totals };
}

/** Which of the four columns a sport belongs in. */
function atpSportBucket(sport) {
  const v = String(sport || '').toLowerCase();
  if (v.includes('swim')) return 'swim';
  if (v.includes('ride') || v.includes('cycl') || v.includes('bike') || v.includes('virtual') || v.includes('mtb')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike') || v.includes('trail')) return 'run';
  if (v.includes('gym') || v.includes('weight') || v.includes('strength')) return 'strength';
  return 'other';
}

/**
 * Hours and sessions per sport, per week — done against planned.
 *
 * The season is planned in TSS because that is what projects fitness, but a
 * coach writing the week thinks in "six hours on the bike, two runs". Both
 * belong in the same table: the TSS column says whether the week is the right
 * size, these say what it is made of.
 *
 * @returns {Object} weekStartKey → { bike: { sec, count, plannedSec, plannedCount }, … }
 */
export function buildWeeklySportTotals({ activities = [], plannedWorkouts = [] } = {}) {
  const out = {};
  const slot = (wk, bucket) => {
    const week = out[wk] || (out[wk] = {});
    return week[bucket] || (week[bucket] = { sec: 0, count: 0, plannedSec: 0, plannedCount: 0 });
  };

  for (const a of activities || []) {
    const day = activityCalendarDateKey(a);
    const wk = day ? mondayKeyOf(day) : null;
    if (!wk) continue;
    const s = slot(wk, atpSportBucket(a?.sport || a?.type));
    s.sec += completedSecs(a);
    s.count += 1;
  }

  // A plan that has already been done is counted on the actual side by the
  // activity it produced; counting it here too would double the week.
  for (const pw of plannedWorkouts || []) {
    if (pw?.status === 'completed' || pw?.status === 'skipped') continue;
    const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : localCalendarDateKey(pw?.date);
    if (!day) continue;
    const wk = mondayKeyOf(day);
    if (!wk) continue;
    const s = slot(wk, atpSportBucket(pw?.sport));
    s.plannedSec += plannedWorkoutDurationSecs(pw);
    s.plannedCount += 1;
  }
  return out;
}

/**
 * Tests, per week — the ones that happened and the ones still on the calendar.
 *
 * A lactate test is the thing a block is built around: it sets the zones the
 * next weeks are written in. The season plan is where a coach decides when to
 * retest, so the plan is where the test has to be visible — both the one done
 * in March and the one pencilled in for June, which the calendar already
 * carries as a planned session with the sport "lactate".
 *
 * @returns {Object} weekStartKey → [{ done, id, sport, title, date, result?, zones? }]
 */
export function buildWeeklyTests({ tests = [], plannedWorkouts = [], annotate = null } = {}) {
  const out = {};
  const push = (day, entry) => {
    const wk = day ? mondayKeyOf(day) : null;
    if (!wk) return;
    (out[wk] || (out[wk] = [])).push(entry);
  };

  for (const t of tests || []) {
    const day = typeof t?.date === 'string' ? t.date.slice(0, 10) : localCalendarDateKey(t?.date);
    push(day, {
      done: true,
      id: String(t?._id || t?.id || ''),
      sport: t?.sport || null,
      title: t?.title || 'Test',
      date: day,
      // What the test found and whether the plan is written in its zones.
      // The caller works both out — the threshold pipeline and the profile
      // live above this file — and a row saying only "Field test" tells a
      // coach a test happened, not what it changed.
      ...(annotate ? annotate(t) : null),
    });
  }

  for (const pw of plannedWorkouts || []) {
    if (String(pw?.sport || '').toLowerCase() !== 'lactate') continue;
    if (pw?.status === 'completed') continue;
    const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : localCalendarDateKey(pw?.date);
    push(day, {
      done: false,
      id: String(pw?._id || ''),
      sport: pw?.sport || null,
      title: pw?.title || 'Test',
      date: day,
    });
  }

  for (const wk of Object.keys(out)) out[wk].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

/**
 * Group rows under the month their week starts in, the way the table reads.
 * A week straddling a month boundary belongs to the month it began in.
 */
export function groupRowsByMonth(rows = []) {
  const out = [];
  let current = null;
  for (const r of rows) {
    const d = parseDayKey(r.weekStart);
    const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'x';
    if (!current || current.key !== key) {
      current = {
        key,
        label: d ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '',
        shortLabel: d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '',
        rows: [],
      };
      out.push(current);
    }
    current.rows.push(r);
  }
  return out;
}

/** "6 - 12" or "27 Jul - 2 Aug" when the week crosses a month. */
export function formatWeekRange(weekStart, weekEnd) {
  const a = parseDayKey(weekStart);
  const b = parseDayKey(weekEnd);
  if (!a || !b) return '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} - ${b.getDate()}`;
  const bMonth = b.toLocaleDateString('en-GB', { month: 'short' });
  return `${a.getDate()} - ${bMonth} ${b.getDate()}`;
}
