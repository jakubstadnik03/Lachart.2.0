/**
 * Lightweight UI preferences persisted in localStorage (per device).
 */

const TSS_DISPLAY_MODE_KEY = 'lachart_activity_tssDisplayMode';
export const TSS_DISPLAY_MODE_EVENT = 'lachart:tssDisplayModeChanged';
const EDIT_PROFILE_ZONES_KEY = 'lachart_editProfile_zones';

const TSS_MODES = new Set(['power', 'hr']);
const ZONE_SPORTS = new Set(['cycling', 'running', 'swimming']);
const ZONE_TABS = new Set(['power', 'hr', 'lactate']);

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota / private mode
  }
}

export function getTssDisplayMode() {
  const v = safeGet(TSS_DISPLAY_MODE_KEY);
  return TSS_MODES.has(v) ? v : null;
}

export function setTssDisplayMode(mode) {
  if (!TSS_MODES.has(mode)) return;
  safeSet(TSS_DISPLAY_MODE_KEY, mode);
}

/** Pull server-side preference into localStorage (cross-device sync). */
export function syncTssDisplayModeFromUser(user) {
  const mode = user?.trainingPreferences?.tssDisplayMode;
  if (TSS_MODES.has(mode)) setTssDisplayMode(mode);
}

export function getEffectiveTssDisplayMode(user) {
  return getTssDisplayMode() || user?.trainingPreferences?.tssDisplayMode || null;
}

export function notifyTssDisplayModeChanged(mode) {
  try {
    window.dispatchEvent(new CustomEvent(TSS_DISPLAY_MODE_EVENT, { detail: { mode } }));
  } catch {
    // SSR / tests
  }
}

export function clearFormFitnessCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('formFitness_') || k.startsWith('widget_formFitness') || k.startsWith('weeklyTrainingLoad_'))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Pick saved mode when valid for this activity, else fall back to default. */
export function resolveTssDisplayMode({ powerTss, hrTss, explicitTss, defaultMode }) {
  const saved = getTssDisplayMode();
  if (saved === 'power' && powerTss > 0) return 'power';
  if (saved === 'hr' && hrTss > 0) return 'hr';
  return defaultMode;
}

export function getEditProfileZonesPrefs() {
  try {
    const raw = safeGet(EDIT_PROFILE_ZONES_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      sport: ZONE_SPORTS.has(p?.sport) ? p.sport : null,
      tab: ZONE_TABS.has(p?.tab) ? p.tab : null,
    };
  } catch {
    return null;
  }
}

export function setEditProfileZonesPrefs({ sport, tab }) {
  const payload = {};
  if (ZONE_SPORTS.has(sport)) payload.sport = sport;
  if (ZONE_TABS.has(tab)) payload.tab = tab;
  if (!Object.keys(payload).length) return;
  try {
    const prev = getEditProfileZonesPrefs() || {};
    safeSet(EDIT_PROFILE_ZONES_KEY, JSON.stringify({ ...prev, ...payload }));
  } catch {
    // ignore
  }
}

// ── Workout planner side panels ─────────────────────────────────────────────
// Which of the planner's two side panels (template library, training progress)
// are open. Stored only once the user has toggled one; until then the page
// decides from how wide it is — see plannerPanelsDefault.
const PLANNER_PANELS_KEY = 'lachart_planner_panels';

export function getPlannerPanelsPrefs() {
  try {
    const raw = safeGet(PLANNER_PANELS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    return { library: !!p.library, progress: !!p.progress };
  } catch {
    return null;
  }
}

export function setPlannerPanelsPrefs(panels) {
  safeSet(PLANNER_PANELS_KEY, JSON.stringify({ library: !!panels?.library, progress: !!panels?.progress }));
}

/**
 * What to open on a planner the user has not configured: the seven days come
 * first, and a panel only when it leaves them room. The app sidebar takes
 * ~260px, the library 240, the progress panel 272; a day should keep at least
 * ~120px, so the library waits for a 1440px window and the progress panel for
 * a 1700px one. Below that, both together squeezed each day to a strip that
 * fit the word "Rest" and nothing else.
 */
export function plannerPanelsDefault(viewportWidth) {
  const w = Number(viewportWidth) || 0;
  return { library: w >= 1440, progress: w >= 1700 };
}
