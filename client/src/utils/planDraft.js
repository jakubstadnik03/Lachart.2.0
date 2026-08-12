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

/** Session shapes a rule-based block is assembled from. */
const SESSION_LIBRARY = {
  easy: { title: 'Endurance', hard: false, tssPerHour: 50 },
  long: { title: 'Long ride', hard: false, tssPerHour: 55 },
  tempo: { title: 'Tempo 3x12min', hard: true, tssPerHour: 75 },
  threshold: { title: 'Threshold 4x8min', hard: true, tssPerHour: 85 },
  vo2: { title: 'VO2max 5x4min', hard: true, tssPerHour: 95 },
  recovery: { title: 'Recovery spin', hard: false, tssPerHour: 35 },
};

/** Which sessions each phase leans on, in priority order. */
const PHASE_MIX = {
  base: ['long', 'easy', 'tempo', 'easy', 'easy'],
  build: ['threshold', 'easy', 'long', 'tempo', 'easy'],
  peak: ['vo2', 'easy', 'threshold', 'easy', 'long'],
  taper: ['threshold', 'easy', 'recovery', 'easy'],
};

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
 * Build a periodised block.
 *
 * Rule-based on purpose: this is the preview and commit layer, and it has to
 * work before there is any AI to fill it. When the conversational planner
 * arrives it produces the same draft shape and reuses everything below.
 *
 * @param {object} opts
 * @param {Date|string} opts.startDate     any day in the first week
 * @param {number} opts.weeks              total weeks including recovery
 * @param {number} opts.weeklyHours        target hours in a normal week
 * @param {number} opts.sessionsPerWeek
 * @param {number} opts.recoveryEvery      every Nth week is a recovery week (0 = none)
 * @param {string} opts.sport
 */
export function buildBlockDraft({
  startDate = new Date(),
  weeks = 6,
  weeklyHours = 8,
  sessionsPerWeek = 5,
  recoveryEvery = 4,
  sport = 'bike',
  name = 'New block',
} = {}) {
  const monday = mondayOf(startDate);
  if (!monday) return null;

  const totalWeeks = Math.max(1, Math.min(24, Math.round(weeks)));
  const perWeek = Math.max(2, Math.min(7, Math.round(sessionsPerWeek)));

  // Phase boundaries: roughly half base, a third build, the rest peak, and a
  // taper week only if the block is long enough to earn one.
  const phaseFor = (i) => {
    const pct = i / totalWeeks;
    if (totalWeeks >= 4 && i === totalWeeks - 1) return 'taper';
    if (pct < 0.45) return 'base';
    if (pct < 0.8) return 'build';
    return 'peak';
  };

  // Days used, spread so hard sessions don't land adjacent: Tue/Thu/Sat plus
  // fillers. Index 0 = Monday.
  const DAY_SLOTS = [1, 3, 5, 2, 6, 4, 0];

  /** Volume relative to a normal week, by phase. */
  const PHASE_VOLUME = { base: 1, build: 1, peak: 0.9, taper: 0.55 };

  const weeksOut = [];
  let sinceRecovery = 0; // weeks since the last down week
  let cycle = 0;         // how many load cycles completed

  for (let i = 0; i < totalWeeks; i += 1) {
    const isRecovery = recoveryEvery > 0 && (i + 1) % recoveryEvery === 0 && i !== totalWeeks - 1;
    const phase = isRecovery ? 'base' : phaseFor(i);
    const mix = PHASE_MIX[phase] || PHASE_MIX.base;

    // Sawtooth, not a ramp to a ceiling. Volume climbs ~8% a week *within* a
    // cycle and each cycle starts a little above the last; a global ramp that
    // saturates produces three identical weeks in a row, which is a plateau
    // rather than periodisation and shows up immediately in the shape chart.
    const rampedHours = weeklyHours * (1 + cycle * 0.05 + sinceRecovery * 0.08);
    // Peak weeks trim volume to make room for intensity; the taper cuts it hard.
    const hours = isRecovery ? rampedHours * 0.55 : rampedHours * (PHASE_VOLUME[phase] ?? 1);
    const count = isRecovery ? Math.max(2, perWeek - 1) : perWeek;

    if (isRecovery) { sinceRecovery = 0; cycle += 1; } else { sinceRecovery += 1; }

    const sessions = [];
    for (let s = 0; s < count; s += 1) {
      const key = isRecovery && s > 0 ? 'easy' : (mix[s % mix.length] || 'easy');
      const spec = SESSION_LIBRARY[key];
      // Long sessions take a bigger slice of the week's hours.
      const share = key === 'long' ? 0.32 : (1 - 0.32) / Math.max(1, count - 1);
      const sessionHours = key === 'long' ? hours * share : hours * share;
      const durationSeconds = Math.round(sessionHours * 3600);
      sessions.push({
        id: `w${i}-s${s}`,
        dayOffset: DAY_SLOTS[s % DAY_SLOTS.length],
        sport,
        title: spec.title,
        hard: spec.hard,
        plannedDuration: durationSeconds,
        targetTss: Math.round(sessionHours * spec.tssPerHour),
      });
    }

    sessions.sort((a, b) => a.dayOffset - b.dayOffset);

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
    sport,
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
