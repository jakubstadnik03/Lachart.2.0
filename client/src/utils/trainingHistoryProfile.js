/**
 * What the athlete has actually been doing, per sport.
 *
 * The planner used to start from numbers typed into a form: eight hours a
 * week, five sessions, one sport. An athlete who has been swimming three times
 * a week for a year had to tell it so, and a block built on a guess ramps from
 * the wrong place — the first week is either a holiday or an injury.
 *
 * This reads the weeks that already happened and answers the questions the
 * intake form would otherwise have to ask: how many hours, how many sessions,
 * how many kilometres, in which sports, and how much of that was hard.
 *
 * Deliberately per-sport: a triathlete's eight hours are not one number, and a
 * plan that treats them as one produces a bike block with the swim missing.
 */
import { completedSecs, completedDistM, completedTss } from './completedSessionStats';
import { resolveSportKey } from '../components/shared/SportIcon';

/** Weeks read by default — long enough to survive one holiday, short enough to be current. */
export const DEFAULT_HISTORY_WEEKS = 12;

/** A week with less than this is not training; counting it drags the average down. */
const MIN_WEEK_SECONDS = 20 * 60;

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(date) {
  const d = startOfWeek(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function activityDate(a) {
  const raw = a?.date || a?.startDate || a?.timestamp;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Sports the planner can build sessions for; everything else is counted but not planned. */
const PLANNABLE = new Set(['bike', 'run', 'swim']);

function sportOf(a) {
  const key = resolveSportKey(a?.sport || a?.type || a?.name);
  return PLANNABLE.has(key) ? key : 'other';
}

/** A session is hard when it says so, by category or by the shape of its title. */
const HARD_TITLE = /vo2|threshold|lt2|interval|tempo|race|sprint|hill|\d+\s*[x×]\s*\d+/i;
const HARD_CATEGORY = /vo2|threshold|lt2|tempo|race/i;

function isHard(a) {
  if (HARD_CATEGORY.test(String(a?.category || ''))) return true;
  return HARD_TITLE.test(String(a?.titleManual || a?.title || a?.name || ''));
}

/**
 * Summarise recent training, per sport and per week.
 *
 * @param {Array<object>} activities completed sessions, any source
 * @param {{ weeks?: number, now?: Date, userProfile?: object, user?: object }} [opts]
 * @returns {{
 *   weeksAnalysed: number,
 *   weeksTrained: number,
 *   totals: { hours: number, sessions: number, tss: number },
 *   perWeek: { hours: number, sessions: number, tss: number, hardSessions: number },
 *   sports: Array<{ sport: string, hoursPerWeek: number, kmPerWeek: number, sessionsPerWeek: number, tssPerWeek: number, share: number }>,
 *   biggestWeekHours: number,
 *   suggestion: { weeklyHours: number, sessionsPerWeek: number, sports: string[], longestSessionHours: number },
 * } | null}
 */
export function buildTrainingHistoryProfile(activities, opts = {}) {
  const {
    weeks = DEFAULT_HISTORY_WEEKS,
    now = new Date(),
    userProfile = null,
    user = null,
  } = opts;

  const list = Array.isArray(activities) ? activities : [];
  if (list.length === 0) return null;

  const firstWeek = startOfWeek(now);
  firstWeek.setDate(firstWeek.getDate() - (weeks - 1) * 7);
  const cutoff = firstWeek.getTime();

  /** weekKey -> { seconds, sessions, tss, bySport: Map } */
  const byWeek = new Map();
  const bySport = new Map();
  let longestSessionSecs = 0;
  let hardSessions = 0;

  for (const a of list) {
    const when = activityDate(a);
    if (!when || when.getTime() < cutoff || when.getTime() > now.getTime()) continue;
    // Planned-but-not-done rows describe intent, not history.
    if (a?.status === 'planned' || a?.status === 'skipped') continue;

    const secs = completedSecs(a);
    if (secs <= 0) continue;

    const sport = sportOf(a);
    const dist = completedDistM(a);
    const tss = completedTss(a, userProfile, user);
    const key = weekKey(when);

    if (!byWeek.has(key)) byWeek.set(key, { seconds: 0, sessions: 0, tss: 0 });
    const w = byWeek.get(key);
    w.seconds += secs;
    w.sessions += 1;
    w.tss += tss;

    if (!bySport.has(sport)) bySport.set(sport, { seconds: 0, metres: 0, sessions: 0, tss: 0 });
    const s = bySport.get(sport);
    s.seconds += secs;
    s.metres += dist;
    s.sessions += 1;
    s.tss += tss;

    if (secs > longestSessionSecs) longestSessionSecs = secs;
    if (isHard(a)) hardSessions += 1;
  }

  const trainedWeeks = [...byWeek.values()].filter((w) => w.seconds >= MIN_WEEK_SECONDS);
  if (trainedWeeks.length === 0) return null;

  const totalSeconds = trainedWeeks.reduce((s, w) => s + w.seconds, 0);
  const totalSessions = trainedWeeks.reduce((s, w) => s + w.sessions, 0);
  const totalTss = trainedWeeks.reduce((s, w) => s + w.tss, 0);
  // Averaged over weeks actually trained, not the calendar window: two weeks
  // off should not tell the planner to halve the block.
  const n = trainedWeeks.length;

  const round1 = (x) => Math.round(x * 10) / 10;

  const sports = [...bySport.entries()]
    .map(([sport, s]) => ({
      sport,
      hoursPerWeek: round1(s.seconds / 3600 / n),
      kmPerWeek: round1(s.metres / 1000 / n),
      sessionsPerWeek: round1(s.sessions / n),
      tssPerWeek: Math.round(s.tss / n),
      share: totalSeconds > 0 ? Math.round((s.seconds / totalSeconds) * 100) : 0,
    }))
    .filter((s) => s.hoursPerWeek > 0)
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);

  const perWeekHours = round1(totalSeconds / 3600 / n);
  const perWeekSessions = Math.round(totalSessions / n);

  return {
    weeksAnalysed: weeks,
    weeksTrained: n,
    totals: {
      hours: round1(totalSeconds / 3600),
      sessions: totalSessions,
      tss: Math.round(totalTss),
    },
    perWeek: {
      hours: perWeekHours,
      sessions: perWeekSessions,
      tss: Math.round(totalTss / n),
      hardSessions: Math.round(hardSessions / n),
    },
    sports,
    biggestWeekHours: round1(Math.max(...trainedWeeks.map((w) => w.seconds)) / 3600),
    suggestion: {
      // Start where they are, not where they were at their best.
      weeklyHours: perWeekHours,
      sessionsPerWeek: Math.max(3, Math.min(12, perWeekSessions)),
      sports: sports.filter((s) => PLANNABLE.has(s.sport) && s.share >= 5).map((s) => s.sport),
      longestSessionHours: round1(longestSessionSecs / 3600),
    },
  };
}

export default buildTrainingHistoryProfile;
