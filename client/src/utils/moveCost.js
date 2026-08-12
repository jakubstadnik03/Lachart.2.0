/**
 * What moving a session actually costs.
 *
 * Dragging a workout to another day is one gesture and it is currently free —
 * the save happens the moment you let go. But a plan is a structure, not a list:
 * moving Thursday's intervals onto Wednesday can put three hard days in a row,
 * strand the recovery day, or drop a key session two days before a race.
 *
 * None of that is visible while dragging, which is exactly when the athlete is
 * deciding. This works out the consequences so they can be shown *before* the
 * move is committed, not discovered a week later.
 *
 * The rule throughout: report consequences, don't block. It is the athlete's
 * plan and there are good reasons to break every one of these guidelines.
 */
import { localCalendarDateKey } from './calendarDateKeys';

const HARD_HINT = /vo2|v̇o2|threshold|lt2|interval|tempo|race|hard|sprint|hill|\d+\s*[x×]\s*\d+/i;

export function isHardSession(pw) {
  if (!pw) return false;
  if (HARD_HINT.test(String(pw.title || ''))) return true;
  if (HARD_HINT.test(String(pw.category || ''))) return true;
  return Number(pw.targetTss || 0) >= 80;
}

export function plannedLoad(pw) {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  const secs = Number(pw?.plannedDuration || 0);
  return secs > 0 && secs < 24 * 3600 ? Math.round((secs / 3600) * 50) : 0;
}

function planKey(pw) {
  return String(pw?.date || '').slice(0, 10);
}

function shiftKey(key, days) {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return localCalendarDateKey(d);
}

/** Monday-anchored week key, used only to describe which week load moves between. */
function weekKey(key) {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localCalendarDateKey(d);
}

function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

/** Hard sessions on a given day, after the move is applied. */
function hardOn(plans, key) {
  return plans.filter((p) => planKey(p) === key && p.status !== 'skipped' && isHardSession(p));
}

/**
 * @param {object} opts
 * @param {object} opts.workout      the planned workout being moved
 * @param {string} opts.toDate       target date key (YYYY-MM-DD)
 * @param {Array}  opts.plannedWorkouts  the full plan, including the workout itself
 * @param {Array}  opts.races        [{ date, name }] upcoming races
 * @param {Date}   opts.now
 * @returns {object} { from, to, severity, headline, costs[], neutral[] }
 */
export function assessMoveCost({
  workout,
  toDate,
  plannedWorkouts = [],
  races = [],
  now = new Date(),
} = {}) {
  const from = planKey(workout);
  const to = String(toDate || '').slice(0, 10);
  if (!workout || !from || !to || from === to) return null;

  const others = plannedWorkouts.filter(
    (p) => String(p._id) !== String(workout._id) && p.status !== 'skipped',
  );
  // The plan as it would be after the move.
  const after = [...others, { ...workout, date: to }];

  const hard = isHardSession(workout);
  const load = plannedLoad(workout);
  const costs = [];
  const neutral = [];

  // ── Already something on the target day ──
  const collisions = others.filter((p) => planKey(p) === to);
  if (collisions.length) {
    const collisionLoad = collisions.reduce((s, p) => s + plannedLoad(p), 0);
    costs.push({
      id: 'collision',
      severity: collisions.some(isHardSession) && hard ? 'high' : 'medium',
      text: collisions.length === 1
        ? `${collisions[0].title} is already on that day — you'd be doing both (${load + collisionLoad} TSS total).`
        : `${collisions.length} sessions are already on that day — ${load + collisionLoad} TSS in one day.`,
    });
  }

  // ── Hard-day spacing ──
  // The usual guidance is at least one easy day between hard ones. Breaking it
  // occasionally is fine; doing it without noticing is how blocks fall apart.
  if (hard) {
    const dayBefore = hardOn(after, shiftKey(to, -1));
    const dayAfter = hardOn(after, shiftKey(to, 1));
    const adjacent = [...dayBefore, ...dayAfter].filter((p) => String(p._id) !== String(workout._id));

    if (adjacent.length) {
      // Repeated workouts genuinely share a title, and "Intervals and Intervals
      // sit either side of it" reads like a bug. Name each one once.
      const unique = Array.from(new Set(adjacent.map((p) => p.title || 'a hard session')));
      const names = unique.length === 1
        ? (adjacent.length > 1 ? `two ${unique[0]} sessions` : unique[0])
        : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
      // Three in a row is a different animal from two.
      const threeInARow = dayBefore.length > 0 && dayAfter.length > 0;
      costs.push({
        id: 'hard-spacing',
        severity: threeInARow ? 'high' : 'medium',
        text: threeInARow
          ? `That makes three hard days in a row — ${names} sit either side of it.`
          : `Back-to-back hard days: ${names} is right next to it.`,
      });
    } else {
      neutral.push({ id: 'spacing-ok', text: 'Keeps an easy day either side of it.' });
    }

    // Moving a hard session *away* from a neighbour is worth saying too.
    const wasCrowded = hardOn(plannedWorkouts.filter((p) => p.status !== 'skipped'), shiftKey(from, -1)).length
      + hardOn(plannedWorkouts.filter((p) => p.status !== 'skipped'), shiftKey(from, 1)).length;
    if (wasCrowded > 0 && !dayBefore.length && !dayAfter.length) {
      neutral.push({ id: 'spacing-improved', text: 'Better spaced than where it is now.' });
    }
  }

  // ── The rest day it lands on ──
  const targetHadNothing = collisions.length === 0;
  const weekOfTarget = weekKey(to);
  const restDaysThatWeek = (() => {
    const keys = new Set();
    for (let i = 0; i < 7; i += 1) keys.add(shiftKey(weekOfTarget, i));
    const busy = new Set(others.filter((p) => keys.has(planKey(p))).map(planKey));
    return Array.from(keys).filter((k) => !busy.has(k));
  })();
  if (targetHadNothing && restDaysThatWeek.length === 1 && restDaysThatWeek[0] === to) {
    costs.push({
      id: 'last-rest-day',
      severity: 'high',
      text: 'That was the only rest day that week — the move leaves you training seven days straight.',
    });
  }

  // ── Load moving between weeks ──
  const fromWeek = weekKey(from);
  const toWeek = weekKey(to);
  if (fromWeek !== toWeek && load > 0) {
    const loadIn = (wk) => after
      .filter((p) => weekKey(planKey(p)) === wk)
      .reduce((s, p) => s + plannedLoad(p), 0);
    // Sessions get dragged backwards as often as forwards; "into the following
    // week" is wrong half the time.
    const forward = toWeek > fromWeek;
    costs.push({
      id: 'week-shift',
      severity: 'low',
      text: forward
        ? `Moves ${load} TSS into the following week — that week becomes ${Math.round(loadIn(toWeek))} TSS, this one drops to ${Math.round(loadIn(fromWeek))} TSS.`
        : `Pulls ${load} TSS back into the earlier week — that week becomes ${Math.round(loadIn(toWeek))} TSS, the later one drops to ${Math.round(loadIn(fromWeek))} TSS.`,
    });
  }

  // ── Races ──
  for (const race of races) {
    const raceKey = String(race?.date || '').slice(0, 10);
    if (!raceKey) continue;
    const gap = daysBetween(to, raceKey);
    if (gap === null || gap < 0 || gap > 7) continue;
    if (hard && gap <= 3) {
      costs.push({
        id: 'race-proximity',
        severity: gap <= 2 ? 'high' : 'medium',
        text: `${race.name || 'Your race'} is ${gap === 0 ? 'that same day' : `${gap} day${gap === 1 ? '' : 's'} later`} — a hard session this close eats into the taper.`,
      });
    } else if (gap <= 7) {
      neutral.push({ id: 'race-week', text: `Lands in race week (${race.name || 'race'} in ${gap} days).` });
    }
  }

  // ── Into the past ──
  const todayKey = localCalendarDateKey(now);
  if (to < todayKey) {
    costs.push({
      id: 'past',
      severity: 'medium',
      text: 'That day has already passed — the session will show as missed unless you complete it.',
    });
  }

  const severity = costs.some((c) => c.severity === 'high')
    ? 'high'
    : costs.some((c) => c.severity === 'medium')
      ? 'medium'
      : costs.length ? 'low' : 'none';

  const HEADLINES = {
    none: 'No cost — this one is free',
    low: 'Small change',
    medium: 'This costs you something',
    high: 'This breaks the structure',
  };

  return {
    from,
    to,
    workoutTitle: workout.title || 'Session',
    isHard: hard,
    load,
    daysMoved: daysBetween(from, to),
    severity,
    headline: HEADLINES[severity],
    costs: costs.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity];
    }),
    neutral,
  };
}

/** One-line summary, for a drag tooltip where a dialog would be too much. */
export function summariseMoveCost(assessment) {
  if (!assessment) return null;
  if (assessment.severity === 'none') return assessment.neutral[0]?.text || 'No conflicts.';
  return assessment.costs[0]?.text || assessment.headline;
}
