/**
 * Draft training blocks — built, reviewed and only then committed.
 *
 * Today the planner writes straight to the server: every save and every dropped
 * template is a live PlannedWorkout before the athlete has seen what the block
 * looks like as a whole. That is fine for one session and wrong for six weeks —
 * you cannot judge a block from the day view, and undoing forty sessions one at
 * a time is nobody's idea of an edit.
 *
 * A draft lives entirely in the browser until it is committed. Nothing reaches
 * the calendar until the athlete says so, and an unfinished draft survives a
 * closed tab so a block can be built over more than one sitting.
 */
import { localCalendarDateKey } from './calendarDateKeys';

const STORAGE_KEY = 'lachart:planDrafts';
const MAX_DRAFTS = 10;

const HARD_HINT = /vo2|threshold|lt2|interval|tempo|race|hard|sprint|hill|\d+\s*[x×]\s*\d+/i;

export const BLOCK_PHASES = [
  { id: 'base', label: 'Base', hint: 'Volume, mostly easy' },
  { id: 'build', label: 'Build', hint: 'Threshold and tempo added' },
  { id: 'peak', label: 'Peak', hint: 'Sharp work, volume trimmed' },
  { id: 'taper', label: 'Taper', hint: 'Volume down, intensity kept' },
];

/**
 * Session shapes a rule-based block is assembled from, per sport.
 *
 * One library per sport rather than one library with the titles swapped: a
 * threshold set is 4×8min on the bike, 3×10min cruise on the run and 8×100 on
 * CSS in the pool, and the load per hour differs enough between them that
 * pretending otherwise mis-sizes every week. Running costs more per hour than
 * riding for the same effort; swimming, at the intensities most triathletes
 * actually hold, costs less.
 */
const SPORT_LIBRARY = {
  bike: {
    easy:      { title: 'Endurance', hard: false, tssPerHour: 50 },
    long:      { title: 'Long ride', hard: false, tssPerHour: 55, isLong: true },
    tempo:     { title: 'Tempo 3x12min', hard: true, tssPerHour: 75 },
    threshold: { title: 'Threshold 4x8min', hard: true, tssPerHour: 85 },
    vo2:       { title: 'VO2max 5x4min', hard: true, tssPerHour: 95 },
    recovery:  { title: 'Recovery spin', hard: false, tssPerHour: 35 },
  },
  run: {
    easy:      { title: 'Easy run', hard: false, tssPerHour: 60 },
    long:      { title: 'Long run', hard: false, tssPerHour: 68, isLong: true },
    tempo:     { title: 'Tempo 2x15min', hard: true, tssPerHour: 85 },
    threshold: { title: 'Threshold 3x10min', hard: true, tssPerHour: 95 },
    vo2:       { title: 'VO2max 6x3min', hard: true, tssPerHour: 105 },
    recovery:  { title: 'Recovery jog', hard: false, tssPerHour: 45 },
  },
  swim: {
    easy:      { title: 'Technique + aerobic', hard: false, tssPerHour: 45 },
    long:      { title: 'Long swim', hard: false, tssPerHour: 50, isLong: true },
    tempo:     { title: 'Tempo 6x200', hard: true, tssPerHour: 65 },
    threshold: { title: 'CSS 8x100', hard: true, tssPerHour: 75 },
    vo2:       { title: 'Speed 12x50', hard: true, tssPerHour: 80 },
    recovery:  { title: 'Easy swim', hard: false, tssPerHour: 35 },
  },
};

const DEFAULT_SPORT = 'bike';

function libraryFor(sport) {
  return SPORT_LIBRARY[sport] || SPORT_LIBRARY[DEFAULT_SPORT];
}

/** Which sessions each phase leans on, in priority order. */
const PHASE_MIX = {
  base: ['long', 'easy', 'tempo', 'easy', 'easy'],
  build: ['threshold', 'easy', 'long', 'tempo', 'easy'],
  peak: ['vo2', 'easy', 'threshold', 'easy', 'long'],
  taper: ['threshold', 'easy', 'recovery', 'easy'],
};

/**
 * The swim mix is its own: a swimmer's easy sessions are technique work rather
 * than junk volume, and the long swim earns a place only in base.
 */
const SWIM_PHASE_MIX = {
  base: ['easy', 'threshold', 'long', 'easy'],
  build: ['threshold', 'easy', 'tempo', 'easy'],
  peak: ['vo2', 'threshold', 'easy', 'easy'],
  taper: ['threshold', 'easy', 'recovery'],
};

function phaseMixFor(sport, phase) {
  const table = sport === 'swim' ? SWIM_PHASE_MIX : PHASE_MIX;
  return table[phase] || table.base;
}

function isHardTitle(title) {
  return HARD_HINT.test(String(title || ''));
}

function mondayOf(dateish) {
  const d = dateish instanceof Date ? new Date(dateish) : new Date(`${String(dateish).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Where each kind of session wants to land, Monday = 0.
 *
 * Key sessions go midweek and at the weekend with a day between them; long
 * sessions want the weekend; easy sessions fill what is left. Swimming is the
 * one sport that doubles up with another on the same day, which is how a
 * triathlete's week actually works — nobody has nine free days.
 */
const DAY_PREFERENCE = {
  key:  [1, 3, 5, 2, 4, 6, 0],
  long: [5, 6, 4, 3, 1, 2, 0],
  easy: [0, 2, 4, 6, 1, 3, 5],
};

/** A day already holding this much is full, unless the newcomer is a swim. */
const MAX_SESSIONS_PER_DAY = 2;

/**
 * Spread a week's sessions across seven days.
 *
 * The rules that matter, in order: no two hard days back to back, no two
 * sessions of the same sport on one day, and at most two sessions a day unless
 * a swim is joining something easy. When they cannot all be honoured the
 * earlier rule wins — a plan that stacks a threshold run onto a threshold ride
 * is worse than one that puts an easy spin next to a hard run.
 *
 * @param {Array<{sport: string, key: string, hard: boolean, isLong: boolean}>} sessions
 * @returns {Array<object>} the same sessions with a dayOffset each
 */
export function allocateWeekDays(sessions) {
  const placed = [];
  const dayLoad = new Map(); // dayOffset -> { count, hard, sports:Set }

  const load = (d) => dayLoad.get(d) || { count: 0, hard: false, sports: new Set() };

  // Hard first, then long, then easy: the sessions with the strongest opinion
  // about where they go get to choose before the fillers take the good days.
  const order = [...sessions].sort((a, b) => {
    const rank = (s) => (s.hard ? 0 : s.isLong ? 1 : 2);
    return rank(a) - rank(b);
  });

  for (const s of order) {
    const bucket = s.hard ? 'key' : s.isLong ? 'long' : 'easy';
    const prefs = DAY_PREFERENCE[bucket];

    const acceptable = (d, strict) => {
      const l = load(d);
      if (l.sports.has(s.sport)) return false;
      const roomy = l.count < MAX_SESSIONS_PER_DAY || (s.sport === 'swim' && !l.hard);
      if (!roomy) return false;
      if (!strict) return true;
      if (s.hard) {
        // Not next to another hard day, and never sharing one.
        if (l.hard) return false;
        if (load(d - 1).hard || load(d + 1).hard) return false;
      }
      return true;
    };

    let day = prefs.find((d) => acceptable(d, true));
    if (day === undefined) day = prefs.find((d) => acceptable(d, false));
    if (day === undefined) day = prefs[0];

    const l = load(day);
    dayLoad.set(day, {
      count: l.count + 1,
      hard: l.hard || Boolean(s.hard),
      sports: new Set([...l.sports, s.sport]),
    });
    placed.push({ ...s, dayOffset: day });
  }

  return placed.sort((a, b) => a.dayOffset - b.dayOffset);
}

/** Normalise the sports argument, accepting the old single-sport shape. */
function resolveSportPlan({ sports, sport, weeklyHours, sessionsPerWeek }) {
  if (Array.isArray(sports) && sports.length > 0) {
    return sports
      .map((s) => ({
        sport: SPORT_LIBRARY[s?.sport] ? s.sport : DEFAULT_SPORT,
        hoursPerWeek: Math.max(0, Number(s?.hoursPerWeek) || 0),
        sessionsPerWeek: Math.max(1, Math.min(7, Math.round(Number(s?.sessionsPerWeek) || 1))),
      }))
      .filter((s) => s.hoursPerWeek > 0);
  }
  return [{
    sport: SPORT_LIBRARY[sport] ? sport : DEFAULT_SPORT,
    hoursPerWeek: Math.max(0, Number(weeklyHours) || 0),
    sessionsPerWeek: Math.max(2, Math.min(7, Math.round(Number(sessionsPerWeek) || 5))),
  }];
}

/**
 * Build a periodised block.
 *
 * Rule-based on purpose: this is the preview and commit layer, and it has to
 * work before there is any AI to fill it. When the conversational planner
 * arrives it produces the same draft shape and reuses everything below.
 *
 * @param {object} opts
 * @param {Date|string} opts.startDate     any day in the first week
 * @param {number} opts.weeks              total weeks including recovery
 * @param {number} opts.recoveryEvery      every Nth week is a recovery week (0 = none)
 * @param {Array<{sport: string, hoursPerWeek: number, sessionsPerWeek: number}>} [opts.sports]
 *   what to plan, per sport — normally taken from the athlete's own history
 * @param {number} [opts.weeklyHours]      single-sport shorthand
 * @param {number} [opts.sessionsPerWeek]  single-sport shorthand
 * @param {string} [opts.sport]            single-sport shorthand
 */
export function buildBlockDraft({
  startDate = new Date(),
  weeks = 6,
  weeklyHours = 8,
  sessionsPerWeek = 5,
  recoveryEvery = 4,
  sport = 'bike',
  sports = null,
  name = 'New block',
} = {}) {
  const monday = mondayOf(startDate);
  if (!monday) return null;

  const sportPlan = resolveSportPlan({ sports, sport, weeklyHours, sessionsPerWeek });
  if (sportPlan.length === 0) return null;

  const totalWeeks = Math.max(1, Math.min(24, Math.round(weeks)));
  const perWeek = sportPlan.reduce((n, s) => n + s.sessionsPerWeek, 0);
  const totalWeeklyHours = sportPlan.reduce((h, s) => h + s.hoursPerWeek, 0);

  // Phase boundaries: roughly half base, a third build, the rest peak, and a
  // taper week only if the block is long enough to earn one.
  const phaseFor = (i) => {
    const pct = i / totalWeeks;
    if (totalWeeks >= 4 && i === totalWeeks - 1) return 'taper';
    if (pct < 0.45) return 'base';
    if (pct < 0.8) return 'build';
    return 'peak';
  };

  /** Volume relative to a normal week, by phase. */
  const PHASE_VOLUME = { base: 1, build: 1, peak: 0.9, taper: 0.55 };

  const weeksOut = [];
  let sinceRecovery = 0; // weeks since the last down week
  let cycle = 0;         // how many load cycles completed

  for (let i = 0; i < totalWeeks; i += 1) {
    const isRecovery = recoveryEvery > 0 && (i + 1) % recoveryEvery === 0 && i !== totalWeeks - 1;
    const phase = isRecovery ? 'base' : phaseFor(i);

    // Sawtooth, not a ramp to a ceiling. Volume climbs ~8% a week *within* a
    // cycle and each cycle starts a little above the last; a global ramp that
    // saturates produces three identical weeks in a row, which is a plateau
    // rather than periodisation and shows up immediately in the shape chart.
    const ramp = 1 + cycle * 0.05 + sinceRecovery * 0.08;
    // Peak weeks trim volume to make room for intensity; the taper cuts it hard.
    const volumeFactor = isRecovery ? ramp * 0.55 : ramp * (PHASE_VOLUME[phase] ?? 1);

    if (isRecovery) { sinceRecovery = 0; cycle += 1; } else { sinceRecovery += 1; }

    // Each sport is periodised on its own hours, then the week is laid out
    // once across all of them — otherwise three sports each pick Tuesday.
    const unplaced = [];
    sportPlan.forEach((plan, sportIdx) => {
      const lib = libraryFor(plan.sport);
      const mix = phaseMixFor(plan.sport, phase);
      const hours = plan.hoursPerWeek * volumeFactor;
      const count = isRecovery ? Math.max(1, plan.sessionsPerWeek - 1) : plan.sessionsPerWeek;
      if (hours <= 0 || count <= 0) return;

      // Pick the sessions first, then divide the hours between them. Asking
      // whether the phase mix *contains* a long session is not the same as
      // whether this week actually got one: a two-session swim week reserved
      // the long session's third and then split the rest between two, which
      // handed swimming a third more hours than it was given.
      const keys = [];
      for (let s = 0; s < count; s += 1) {
        keys.push(isRecovery && s > 0 ? 'easy' : (mix[s % mix.length] || 'easy'));
      }
      const longIdx = isRecovery ? -1 : keys.findIndex((k) => lib[k]?.isLong);
      const hasLong = count > 1 && longIdx >= 0;
      // A single long session takes about a third of a sport's week; the rest
      // split what is left evenly.
      const longShare = hasLong ? 0.32 : 0;
      const otherShare = hasLong ? (1 - longShare) / (count - 1) : 1 / count;

      keys.forEach((key, s) => {
        const spec = lib[key] || lib.easy;
        const isLong = hasLong && s === longIdx;
        const sessionHours = hours * (isLong ? longShare : otherShare);
        unplaced.push({
          id: `w${i}-${plan.sport}-${s}`,
          sport: plan.sport,
          key,
          title: spec.title,
          hard: Boolean(spec.hard),
          isLong,
          // Keeps the athlete's biggest sport first when days are contested.
          priority: sportIdx,
          plannedDuration: Math.round(sessionHours * 3600),
          targetTss: Math.round(sessionHours * spec.tssPerHour),
        });
      });
    });

    const sessions = allocateWeekDays(unplaced);

    weeksOut.push({
      index: i,
      startDate: localCalendarDateKey(addDays(monday, i * 7)),
      phase,
      isRecovery,
      label: isRecovery ? 'Recovery' : BLOCK_PHASES.find((p) => p.id === phase)?.label || 'Base',
      sessions,
    });
  }

  return {
    id: `draft-${localCalendarDateKey(monday)}-${totalWeeks}w`,
    name,
    // Kept for anything still reading a block as single-sport; `sports` is the
    // truth once there is more than one.
    sport: sportPlan[0].sport,
    sports: sportPlan,
    weeklyHours: Math.round(totalWeeklyHours * 10) / 10,
    sessionsPerWeek: perWeek,
    startDate: localCalendarDateKey(monday),
    weeks: weeksOut,
    createdAt: new Date().toISOString(),
    committedAt: null,
  };
}

/** Volume, intensity and session count for one week. */
export function weekSummary(week) {
  const sessions = week?.sessions || [];
  const tss = sessions.reduce((s, x) => s + (Number(x.targetTss) || 0), 0);
  const seconds = sessions.reduce((s, x) => s + (Number(x.plannedDuration) || 0), 0);
  const hardCount = sessions.filter((x) => x.hard || isHardTitle(x.title)).length;
  return {
    tss: Math.round(tss),
    hours: Math.round((seconds / 3600) * 10) / 10,
    sessions: sessions.length,
    hardCount,
    /** Share of load coming from hard sessions — the "intensity" axis. */
    intensityPct: tss > 0
      ? Math.round((sessions.filter((x) => x.hard || isHardTitle(x.title))
          .reduce((s, x) => s + (Number(x.targetTss) || 0), 0) / tss) * 100)
      : 0,
  };
}

/** Whole-block totals, for the commit bar. */
export function draftSummary(draft) {
  const weeks = draft?.weeks || [];
  const per = weeks.map(weekSummary);
  return {
    weeks: weeks.length,
    sessions: per.reduce((s, w) => s + w.sessions, 0),
    tss: per.reduce((s, w) => s + w.tss, 0),
    hours: Math.round(per.reduce((s, w) => s + w.hours, 0) * 10) / 10,
    peakWeekTss: per.length ? Math.max(...per.map((w) => w.tss)) : 0,
    recoveryWeeks: weeks.filter((w) => w.isRecovery).length,
  };
}

/** Real calendar dates — what the block looks like on the athlete's actual days. */
export function draftToPlannedWorkouts(draft) {
  if (!draft?.weeks) return [];
  const out = [];
  for (const week of draft.weeks) {
    const weekStart = new Date(`${week.startDate}T12:00:00`);
    if (Number.isNaN(weekStart.getTime())) continue;
    for (const s of week.sessions) {
      out.push({
        date: localCalendarDateKey(addDays(weekStart, s.dayOffset)),
        sport: s.sport,
        title: s.title,
        targetTss: s.targetTss,
        plannedDuration: s.plannedDuration,
        // What the generator meant by this session — the structure builder
        // needs it to know that "Threshold 3x10min" is a run threshold set
        // rather than a title to match against.
        key: s.key,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Days in the draft that already have something planned on the real calendar. */
export function draftCollisions(draft, existingPlanned = []) {
  const busy = new Map();
  for (const p of existingPlanned) {
    if (p?.status === 'skipped') continue;
    const key = String(p?.date || '').slice(0, 10);
    if (!key) continue;
    if (!busy.has(key)) busy.set(key, []);
    busy.get(key).push(p.title || 'Session');
  }
  return draftToPlannedWorkouts(draft)
    .filter((d) => busy.has(d.date))
    .map((d) => ({ date: d.date, incoming: d.title, existing: busy.get(d.date) }));
}

/** Move one session to another weekday, keeping the draft immutable. */
export function moveDraftSession(draft, weekIndex, sessionId, newDayOffset) {
  if (!draft) return draft;
  return {
    ...draft,
    weeks: draft.weeks.map((w) => (w.index !== weekIndex ? w : {
      ...w,
      sessions: w.sessions
        .map((s) => (s.id === sessionId ? { ...s, dayOffset: Math.max(0, Math.min(6, newDayOffset)) } : s))
        .sort((a, b) => a.dayOffset - b.dayOffset),
    })),
  };
}

/** Relabel a session — the correction the athlete makes when the shape is wrong. */
export function relabelDraftSession(draft, weekIndex, sessionId, patch) {
  if (!draft) return draft;
  return {
    ...draft,
    weeks: draft.weeks.map((w) => (w.index !== weekIndex ? w : {
      ...w,
      sessions: w.sessions.map((s) => (s.id === sessionId
        ? { ...s, ...patch, hard: patch.hard ?? (patch.title ? isHardTitle(patch.title) : s.hard) }
        : s)),
    })),
  };
}

export function removeDraftSession(draft, weekIndex, sessionId) {
  if (!draft) return draft;
  return {
    ...draft,
    weeks: draft.weeks.map((w) => (w.index !== weekIndex ? w : {
      ...w,
      sessions: w.sessions.filter((s) => s.id !== sessionId),
    })),
  };
}

// ── Persistence ────────────────────────────────────────────────────
// Local only. A draft is not a plan; putting half-built blocks on the server
// means coaches see sessions the athlete never agreed to.

export function listDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft) {
  if (!draft?.id) return listDrafts();
  const others = listDrafts().filter((d) => d.id !== draft.id);
  const next = [{ ...draft, savedAt: new Date().toISOString() }, ...others].slice(0, MAX_DRAFTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* quota — the draft stays in memory for this session */ }
  return next;
}

export function deleteDraft(id) {
  const next = listDrafts().filter((d) => d.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}
