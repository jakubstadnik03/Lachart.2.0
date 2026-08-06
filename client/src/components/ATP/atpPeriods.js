/**
 * atpPeriods.js — the vocabulary of a season.
 *
 * Colours run cool-to-warm in the order a season is actually ridden: grey
 * preparation, blues deepening through base, greens through build, then yellow
 * for peak and red for race week. That ordering is the whole point — a coach
 * scanning the chart reads the shape of the year off the colour ramp without
 * looking at a single number.
 *
 * The load multipliers mirror server/utils/atpPeriodization.js. They live in
 * both places on purpose: the server owns what gets stored, this copy lets the
 * table preview a period change before the save round-trips.
 */

export const PERIODS = [
  'Prepare',
  'Base 1', 'Base 2', 'Base 3',
  'Build 1', 'Build 2',
  'Peak',
  'Race',
  'Transition',
  'Rest',
];

export const PERIOD_META = {
  Prepare:    { label: 'Prepare',    short: 'Prep',  color: '#94a3b8', text: '#ffffff', load: 0.50 },
  'Base 1':   { label: 'Base 1',     short: 'B1',    color: '#93c5fd', text: '#0f2b4a', load: 0.72 },
  'Base 2':   { label: 'Base 2',     short: 'B2',    color: '#3b82f6', text: '#ffffff', load: 0.86 },
  'Base 3':   { label: 'Base 3',     short: 'B3',    color: '#1e3a8a', text: '#ffffff', load: 1.00 },
  'Build 1':  { label: 'Build 1',    short: 'Bd1',   color: '#86efac', text: '#0f3b22', load: 1.00 },
  'Build 2':  { label: 'Build 2',    short: 'Bd2',   color: '#22c55e', text: '#ffffff', load: 1.00 },
  Peak:       { label: 'Peak',       short: 'Pk',    color: '#eab308', text: '#3b2f04', load: 0.66 },
  Race:       { label: 'Race',       short: 'Rc',    color: '#ef4444', text: '#ffffff', load: 0.42 },
  Transition: { label: 'Transition', short: 'Tr',    color: '#a8a29e', text: '#ffffff', load: 0.28 },
  Rest:       { label: 'Rest',       short: 'Rst',   color: '#d6d3d1', text: '#44403c', load: 0.10 },
};

/** Three weeks building, the fourth backing off. */
export const WEEK_PATTERN = [0.82, 0.92, 1.00, 0.59];

/** Peak and Race are short blocks that taper rather than cycling. */
export const SHORT_PATTERNS = {
  Peak:       [1.00, 0.72],
  Race:       [1.00],
  Transition: [1.00, 0.85, 0.85, 0.85],
  Rest:       [1.00],
};

export function periodColor(period) {
  return PERIOD_META[period]?.color || '#e2e8f0';
}

export function periodTextColor(period) {
  return PERIOD_META[period]?.text || '#475569';
}

/** "Base 3 - Week 2", or just the period when it has no week number yet. */
export function periodLabel(period, periodWeek) {
  if (!period) return '';
  return periodWeek ? `${period} - Week ${periodWeek}` : period;
}

/** What the pattern would put on this week — used to preview a period change. */
export function suggestedWeekTss(period, periodWeek, peakWeeklyTss) {
  const meta = PERIOD_META[period];
  if (!meta || !(peakWeeklyTss > 0)) return 0;
  const pattern = SHORT_PATTERNS[period] || WEEK_PATTERN;
  const idx = Math.max(0, (Number(periodWeek) || 1) - 1) % pattern.length;
  return Math.round((peakWeeklyTss * meta.load * pattern[idx]) / 10) * 10;
}

/** Race priority colours, matching the calendar's race pins. */
export const PRIORITY_COLOR = {
  A: '#dc2626',
  B: '#f59e0b',
  C: '#64748b',
};
