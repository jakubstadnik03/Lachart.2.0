// Shared definitions for day-themes (single-day focus tags like "LT2") and
// multi-day calendar periods (Vacation, Training camp, …). Kept in one place so
// every calendar view (CalendarView, WeeklyCalendar, WeekStrip, native
// dashboard) renders identical labels and colors.

// ── Day theme presets ──────────────────────────────────────────────────────
// Quick training-focus tags shown above the free-text title in the editor.
export const DAY_THEME_PRESETS = ['LT1', 'LT2', 'VO2max', 'Endurance', 'Recovery', 'Race', 'Rest'];

// Preset → hex color. Custom (free-text) titles fall back to the category
// color, or a neutral slate, handled by the caller.
const DAY_THEME_COLORS = {
  LT1:       '#16a34a', // green
  LT2:       '#dc2626', // red
  VO2MAX:    '#7c3aed', // purple
  ENDURANCE: '#2563eb', // blue
  RECOVERY:  '#0d9488', // teal
  RACE:      '#d97706', // amber/gold
  REST:      '#6b7280', // slate
};

/** Returns a hex color for a known preset title, else null. Case-insensitive. */
export function dayThemePresetColor(title) {
  if (!title) return null;
  const key = String(title).trim().toUpperCase();
  return DAY_THEME_COLORS[key] || null;
}

// ── Calendar periods (multi-day spans) ──────────────────────────────────────
export const PERIOD_TYPES = [
  { type: 'Vacation',      color: '#0ea5e9', label: 'Vacation' },      // sky
  { type: 'Training camp', color: '#7c3aed', label: 'Training camp' }, // purple
  { type: 'Work trip',     color: '#f59e0b', label: 'Work trip' },     // amber
  { type: 'Illness',       color: '#dc2626', label: 'Illness' },       // red
  { type: 'Race week',     color: '#d97706', label: 'Race week' },     // gold
  { type: 'Taper',         color: '#eab308', label: 'Taper' },         // yellow
];

const PERIOD_COLOR_BY_TYPE = PERIOD_TYPES.reduce((acc, p) => { acc[p.type] = p.color; return acc; }, {});

/** Color for a period — its stored color, else the type default, else slate. */
export function periodColor(period) {
  if (!period) return '#767EB5';
  return period.color || PERIOD_COLOR_BY_TYPE[period.type] || '#767EB5';
}

/** Expand a list of periods into a Map<YYYY-MM-DD, period[]> for fast per-day lookup. */
export function buildPeriodsByDate(periods) {
  const m = new Map();
  (periods || []).forEach((p) => {
    if (!p?.startDate || !p?.endDate) return;
    // Iterate calendar days inclusively using local date parts (no TZ drift).
    const [sy, sm, sd] = String(p.startDate).split('-').map(Number);
    const [ey, em, ed] = String(p.endDate).split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    let guard = 0;
    while (cur <= end && guard < 1000) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  });
  return m;
}
