/**
 * atpPeriodization.js — turning "my A race is on 14 June" into 52 week rows.
 *
 * The model is Friel's classic block sequence, laid out backwards from each
 * A-priority race: the race week itself, two Peak weeks before it, then Build 2,
 * Build 1, Base 3, Base 2, Base 1 in four-week blocks, and whatever is left at
 * the front of the season becomes Prepare.
 *
 * Weekly TSS comes out of two multipliers: how hard the period is relative to
 * the season's peak week (PERIOD_LOAD), and where the week sits inside its
 * block (WEEK_PATTERN — three weeks building, the fourth a recovery week).
 * Every number stays editable afterwards; this only fills the grid.
 */

'use strict';

/** How hard each period is, as a fraction of the season's peak weekly TSS. */
const PERIOD_LOAD = {
  Prepare:      0.50,
  'Base 1':     0.72,
  'Base 2':     0.86,
  'Base 3':     1.00,
  'Build 1':    1.00,
  'Build 2':    1.00,
  Peak:         0.66,
  Race:         0.42,
  Transition:   0.28,
  Rest:         0.10,
};

/**
 * Load through a four-week block: build for three weeks, then back off.
 * A 6-week Base 2 run wraps around — week 5 restarts the pattern.
 */
const WEEK_PATTERN = [0.82, 0.92, 1.00, 0.59];

/** Peak and Race are short and taper down rather than cycling the 4-week pattern. */
const SHORT_PATTERNS = {
  Peak:       [1.00, 0.72],
  Race:       [1.00],
  Transition: [1.00, 0.85, 0.85, 0.85],
  Rest:       [1.00],
};

/** The lead-in to a goal race, nearest-week-first. Consumed walking backwards. */
const LEAD_IN = [
  ['Peak', 2],
  ['Build 2', 4],
  ['Build 1', 4],
  ['Base 3', 4],
  ['Base 2', 4],
  ['Base 1', 4],
];

/** Weeks of downtime granted after a goal race before the next block starts. */
const TRANSITION_WEEKS = 2;

/** Longest off-season run before the plan calls it preparation for next year. */
const MAX_TRANSITION_WEEKS = 4;

// ── date helpers (all 'YYYY-MM-DD', all TZ-stable) ─────────────────────────

function parseKey(key) {
  const d = new Date(`${String(key).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week containing `date`. */
function mondayOf(date) {
  const d = date instanceof Date ? new Date(date) : parseKey(date);
  if (!d) return null;
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  d.setHours(12, 0, 0, 0);
  return d;
}

function mondayKey(date) {
  const m = mondayOf(date);
  return m ? toKey(m) : null;
}

function addWeeks(key, n) {
  const d = parseKey(key);
  if (!d) return null;
  d.setDate(d.getDate() + n * 7);
  return toKey(d);
}

/** Every Monday from startDate through endDate, inclusive. */
function weekStartsBetween(startDate, endDate) {
  const first = mondayKey(startDate);
  const last = mondayKey(endDate);
  if (!first || !last) return [];
  const out = [];
  let cur = first;
  // 260 = five years; a runaway guard, never reached by a real season.
  for (let i = 0; cur <= last && i < 260; i += 1) {
    out.push(cur);
    cur = addWeeks(cur, 1);
  }
  return out;
}

// ── TSS targets ────────────────────────────────────────────────────────────

/**
 * Weekly TSS for one week of a period.
 * @param {string} period      e.g. 'Base 2'
 * @param {number} periodWeek  1-based position within the current run of that period
 * @param {number} peakWeeklyTss
 */
function weekTargetTss(period, periodWeek, peakWeeklyTss) {
  const load = PERIOD_LOAD[period];
  if (!load || !(peakWeeklyTss > 0)) return 0;
  const pattern = SHORT_PATTERNS[period] || WEEK_PATTERN;
  const idx = Math.max(0, (Number(periodWeek) || 1) - 1) % pattern.length;
  const raw = peakWeeklyTss * load * pattern[idx];
  return Math.round(raw / 10) * 10;
}

/**
 * Renumber `periodWeek` down a week list so each run of the same period counts
 * 1, 2, 3 … — what the "Base 3 - Week 2" label reads off. Mutates in place.
 */
function renumberPeriodWeeks(weeks) {
  let prev = null;
  let n = 0;
  for (const w of weeks) {
    if (w.period && w.period === prev) n += 1;
    else n = w.period ? 1 : 0;
    w.periodWeek = w.period ? n : null;
    prev = w.period;
  }
  return weeks;
}

// ── the wizard ─────────────────────────────────────────────────────────────

/**
 * Lay out a season.
 *
 * @param {object}   opts
 * @param {string}   opts.startDate       season start (snapped to its Monday)
 * @param {string}   opts.endDate         season end
 * @param {Array}    opts.races           [{ date, priority }] — only 'A' races anchor blocks
 * @param {number}   opts.peakWeeklyTss
 * @param {Array}    opts.existingWeeks   preserved notes/hours, keyed by weekStart
 * @returns {Array}  week rows ready to store on the plan
 */
function buildSeason({ startDate, endDate, races = [], peakWeeklyTss = 700, existingWeeks = [] }) {
  const starts = weekStartsBetween(startDate, endDate);
  if (!starts.length) return [];

  const index = new Map(starts.map((k, i) => [k, i]));
  const periods = new Array(starts.length).fill(null);

  // A races anchor the plan; B and C races are raced through a normal block.
  const aRaceWeeks = Array.from(new Set(
    (races || [])
      .filter((r) => String(r?.priority || 'A').toUpperCase() === 'A')
      .map((r) => mondayKey(r.date))
      .filter((k) => k && index.has(k)),
  )).sort();

  // Earliest race first. The first A race gets the full lead-in because it is
  // the one the base has to be built for; each later race then walks backwards
  // only as far as the previous race's block, which is what makes two races ten
  // weeks apart come out as Transition → Build → Peak → Race instead of trying
  // to fit a second full base phase that does not exist.
  for (const raceKey of aRaceWeeks) {
    const raceIdx = index.get(raceKey);
    periods[raceIdx] = 'Race';

    let cursor = raceIdx - 1;
    for (const [period, count] of LEAD_IN) {
      for (let i = 0; i < count && cursor >= 0; i += 1) {
        if (periods[cursor] !== null) { cursor = -1; break; } // ran into an earlier block
        periods[cursor] = period;
        cursor -= 1;
      }
      if (cursor < 0) break;
    }

    // Recovery after the race, but never on top of the next race's lead-in.
    for (let i = 1; i <= TRANSITION_WEEKS; i += 1) {
      const idx = raceIdx + i;
      if (idx >= periods.length || periods[idx] !== null) break;
      periods[idx] = 'Transition';
    }
  }

  if (!aRaceWeeks.length) {
    // No goal race yet — run the season forward through the standard blocks so
    // there is still something to edit rather than an empty grid.
    const forward = [['Prepare', 3], ['Base 1', 4], ['Base 2', 4], ['Base 3', 4], ['Build 1', 4], ['Build 2', 4]];
    let cursor = 0;
    for (const [period, count] of forward) {
      for (let i = 0; i < count && cursor < periods.length; i += 1) {
        periods[cursor] = period;
        cursor += 1;
      }
    }
    while (cursor < periods.length) { periods[cursor] = 'Base 2'; cursor += 1; }
  } else {
    // Weeks before the first block become Prepare; gaps between a Transition and
    // the next block extend that block's opening period backwards (usually Base 1).
    const firstAssigned = periods.findIndex((p) => p !== null);
    for (let i = 0; i < firstAssigned; i += 1) periods[i] = 'Prepare';

    for (let i = periods.length - 1; i >= 0; i -= 1) {
      if (periods[i] === null) periods[i] = periods[i + 1] || 'Transition';
    }

    // A season that ends well after the last race would otherwise run out on a
    // twenty-week Transition. Off-season is a month at most; after that the
    // athlete is preparing for next year, so say so.
    let run = 0;
    for (let i = 0; i < periods.length; i += 1) {
      if (periods[i] !== 'Transition') { run = 0; continue; }
      run += 1;
      if (run > MAX_TRANSITION_WEEKS) periods[i] = 'Prepare';
    }
  }

  const prior = new Map((existingWeeks || []).map((w) => [w.weekStart, w]));
  const weeks = starts.map((weekStart, i) => ({
    weekStart,
    period: periods[i],
    periodWeek: null,
    targetTss: 0,
    targetHours: prior.get(weekStart)?.targetHours ?? null,
    notes: prior.get(weekStart)?.notes || '',
  }));

  renumberPeriodWeeks(weeks);
  for (const w of weeks) w.targetTss = weekTargetTss(w.period, w.periodWeek, peakWeeklyTss);
  return weeks;
}

/**
 * Grow or shrink an existing week list to a new season range, keeping every
 * week that still falls inside it. Used when the athlete moves the end date.
 */
function resizeSeason({ startDate, endDate, weeks = [], peakWeeklyTss = 700 }) {
  const starts = weekStartsBetween(startDate, endDate);
  const prior = new Map((weeks || []).map((w) => [w.weekStart, w]));
  const out = starts.map((weekStart) => {
    const p = prior.get(weekStart);
    return {
      weekStart,
      period: p?.period ?? null,
      periodWeek: p?.periodWeek ?? null,
      targetTss: p?.targetTss ?? 0,
      targetHours: p?.targetHours ?? null,
      notes: p?.notes || '',
    };
  });
  renumberPeriodWeeks(out);
  for (const w of out) {
    if (!prior.has(w.weekStart) && w.period) w.targetTss = weekTargetTss(w.period, w.periodWeek, peakWeeklyTss);
  }
  return out;
}

module.exports = {
  PERIOD_LOAD,
  WEEK_PATTERN,
  SHORT_PATTERNS,
  LEAD_IN,
  mondayKey,
  toKey,
  addWeeks,
  weekStartsBetween,
  weekTargetTss,
  renumberPeriodWeeks,
  buildSeason,
  resizeSeason,
};
