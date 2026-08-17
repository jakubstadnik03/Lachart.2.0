/**
 * Apple Health automation preferences.
 *
 * Per device, not per account: whether Health workouts should be imported here
 * depends on what this iPhone records and which other sources (Strava, Garmin)
 * already feed the same account, so localStorage is the right home.
 *
 * `importWorkouts` keeps its original key — turning it into a shared module
 * must not silently reset the choice of anyone who already set it.
 */

const KEYS = {
  importWorkouts: 'appleHealth_importWorkouts',
  syncWellness: 'appleHealth_syncWellness',
  notifyImports: 'appleHealth_notifyImports',
};

/**
 * Off by default: most people who connect Apple Health already get workouts
 * from Strava/Garmin, so importing Apple's copies just creates duplicates.
 */
const DEFAULTS = {
  importWorkouts: false,
  syncWellness: true,
  notifyImports: true,
};

function readFlag(key, fallback) {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    if (raw == null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

/** @returns {{ importWorkouts: boolean, syncWellness: boolean, notifyImports: boolean }} */
export function getAppleHealthPrefs() {
  return {
    importWorkouts: readFlag('importWorkouts', DEFAULTS.importWorkouts),
    syncWellness: readFlag('syncWellness', DEFAULTS.syncWellness),
    notifyImports: readFlag('notifyImports', DEFAULTS.notifyImports),
  };
}

/**
 * @param {'importWorkouts'|'syncWellness'|'notifyImports'} key
 * @param {boolean} value
 */
export function setAppleHealthPref(key, value) {
  if (!KEYS[key]) return;
  try {
    localStorage.setItem(KEYS[key], value ? '1' : '0');
  } catch {
    /* private mode / quota — the toggle still applies for this session */
  }
}
