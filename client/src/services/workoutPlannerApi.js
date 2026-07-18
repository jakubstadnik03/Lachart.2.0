/**
 * Workout Planner API helpers
 */
import api, { clearGetCacheMatching } from './api';

const BASE = '/api/workout-planner';

/** Map UI / legacy sport labels to PlannedWorkout enum values accepted by the API. */
export function normalizePlannedSportForApi(sport) {
  const s = String(sport || '').toLowerCase().trim();
  if (!s) return 'other';
  if (s === 'gym' || s.includes('weight') || s.includes('crossfit') || s.includes('fitness')) return 'strength';
  if (['run', 'bike', 'swim', 'strength', 'walk', 'brick', 'crosstrain', 'mtbike', 'rowing', 'lactate', 'other'].includes(s)) {
    return s;
  }
  if (s.includes('bike') || s.includes('ride') || s.includes('cycl') || s.includes('virtual')) return 'bike';
  if (s.includes('run') || s.includes('trail')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk') || s.includes('hike')) return 'walk';
  if (s.includes('strength')) return 'strength';
  if (s.includes('row')) return 'rowing';
  if (s.includes('lactate')) return 'lactate';
  return 'other';
}

function normalizePlannedPayload(payload = {}) {
  const next = { ...payload };
  if (next.sport !== undefined) next.sport = normalizePlannedSportForApi(next.sport);
  return next;
}

// ── Templates ──────────────────────────────────────────────────────────────

export const getWorkoutTemplates = async (sport) => {
  const params = sport ? { sport } : {};
  const { data } = await api.get(`${BASE}/templates`, { params });
  return data;
};

export const getWorkoutTemplate = async (id) => {
  const { data } = await api.get(`${BASE}/templates/${id}`);
  return data;
};

export const createWorkoutTemplate = async (payload) => {
  const { data } = await api.post(`${BASE}/templates`, payload);
  return data;
};

export const updateWorkoutTemplate = async (id, payload) => {
  const { data } = await api.put(`${BASE}/templates/${id}`, payload);
  return data;
};

export const deleteWorkoutTemplate = async (id) => {
  const { data } = await api.delete(`${BASE}/templates/${id}`);
  return data;
};

// ── Planned Workouts ───────────────────────────────────────────────────────

const _plannedInflight = new Map();
const _plannedCache = new Map();
const PLANNED_CACHE_MS = 60 * 1000;
let _plannedCacheGen = 0;

function invalidatePlannedWorkoutsCache() {
  _plannedCacheGen += 1;
  _plannedCache.clear();
  _plannedInflight.clear();
  clearGetCacheMatching('/api/workout-planner/planned');
}

/**
 * @param {{ from?: string, to?: string, athleteId?: string }} opts
 */
export const getPlannedWorkouts = async (opts = {}) => {
  const key = JSON.stringify(opts || {});
  const hit = _plannedCache.get(key);
  if (hit && Date.now() - hit.ts < PLANNED_CACHE_MS) {
    return hit.data;
  }
  if (_plannedInflight.has(key)) return _plannedInflight.get(key);

  const genAtStart = _plannedCacheGen;
  const req = api.get(`${BASE}/planned`, { params: opts, cacheTtlMs: 15000 })
    .then(({ data }) => {
      if (genAtStart === _plannedCacheGen) {
        _plannedCache.set(key, { data, ts: Date.now() });
      }
      _plannedInflight.delete(key);
      return data;
    })
    .catch((err) => {
      _plannedInflight.delete(key);
      throw err;
    });

  _plannedInflight.set(key, req);
  return req;
};

export const getPlannedWorkout = async (id) => {
  const { data } = await api.get(`${BASE}/planned/${id}`);
  return data;
};

export const createPlannedWorkout = async (payload, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.post(`${BASE}/planned`, normalizePlannedPayload(payload), { params });
  invalidatePlannedWorkoutsCache();
  return data;
};

export const updatePlannedWorkout = async (id, payload, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.put(`${BASE}/planned/${id}`, normalizePlannedPayload(payload), { params });
  invalidatePlannedWorkoutsCache();
  return data;
};

/** Reorder planned workouts within one calendar day (orderedIds = full stack top→bottom). */
export const reorderPlannedWorkouts = async (date, orderedIds, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.put(`${BASE}/planned/reorder`, { date, orderedIds }, { params });
  invalidatePlannedWorkoutsCache();
  return data;
};

export const deletePlannedWorkout = async (id, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.delete(`${BASE}/planned/${id}`, { params });
  invalidatePlannedWorkoutsCache();
  return data;
};

/**
 * Download a planned workout as a structured-workout file (ZWO / TCX / FIT).
 * Triggers the browser's download dialog with a sensible filename so the
 * user can drop the file into Garmin Connect, TrainingPeaks, Zwift, etc.
 *
 * Returns true on success, throws otherwise (so the caller can show a
 * notification). The actual HTTP call goes through the same `api` axios
 * instance — auth headers + base URL are handled the same way as every
 * other request.
 */
/**
 * Complete a live workout: save execution data, generate FIT + FitTraining,
 * optionally upload to Strava.
 */
export const completePlannedWorkout = async (id, { executionData, uploadToStrava = false, athleteId = null } = {}) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.post(`${BASE}/planned/${id}/complete`, { executionData, uploadToStrava }, { params });
  return data;
};

/** Download the recorded workout as .fit (after complete). */
export const downloadPlannedWorkoutFit = async (id, { athleteId = null, suggestedName = null } = {}) => {
  const params = athleteId ? { athleteId } : {};
  const res = await api.get(`${BASE}/planned/${id}/download-fit`, {
    params,
    responseType: 'blob',
  });
  let filename = `${suggestedName || 'workout'}.fit`;
  const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
  if (cd) {
    const m = /filename="?([^";]+)"?/i.exec(cd);
    if (m) filename = m[1];
  }
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/vnd.ant.fit' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

export const exportPlannedWorkout = async (id, { format = 'tcx', athleteId = null, suggestedName = null } = {}) => {
  const params = { format };
  if (athleteId) params.athleteId = athleteId;
  const res = await api.get(`${BASE}/planned/${id}/export`, {
    params,
    responseType: 'blob',
  });
  // Filename: prefer the server-side Content-Disposition; fall back to the
  // suggested name or a generic "workout.<ext>".
  let filename = `${suggestedName || 'workout'}.${format}`;
  const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
  if (cd) {
    const m = /filename="?([^";]+)"?/i.exec(cd);
    if (m) filename = m[1];
  }
  // Create a temporary <a> to trigger the download. Works in both desktop
  // browsers and Capacitor WKWebView (the browser's native download flow).
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

// ── Day Plans ──────────────────────────────────────────────────────────────
// High-level theme assigned to a single calendar day ("Threshold", "Recovery",
// …). Lives next to PlannedWorkouts but is a distinct concept — a day can have
// a theme without any concrete workout, and a concrete workout without a
// theme. Both are surfaced in the mobile calendar's day header.

/**
 * @param {{ from?: string, to?: string, athleteId?: string }} opts
 */
export const getDayPlans = async (opts = {}) => {
  const { data } = await api.get(`${BASE}/day-plans`, { params: opts });
  return data;
};

/**
 * Upsert the theme for a single day.
 * @param {string} date  YYYY-MM-DD
 * @param {{ title?: string, category?: string|null, notes?: string }} payload
 * @param {string} [athleteId]  optional — for coach setting on athlete
 */
export const setDayPlan = async (date, payload, athleteId) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.put(`${BASE}/day-plans/${date}`, payload, { params });
  return data;
};

export const deleteDayPlan = async (date, athleteId) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.delete(`${BASE}/day-plans/${date}`, { params });
  return data;
};

// ── Calendar periods ────────────────────────────────────────────────────────
// Multi-day spans (Vacation, Training camp, Work trip, Illness, Race week)
// rendered as colored bands across the calendar.

/**
 * @param {{ from?: string, to?: string, athleteId?: string }} opts
 */
export const getPeriods = async (opts = {}) => {
  const { data } = await api.get(`${BASE}/periods`, { params: opts });
  return data;
};

/**
 * Create (no _id) or update (with _id) a period.
 * @param {{ _id?: string, startDate: string, endDate: string, type: string, color?: string|null, notes?: string }} payload
 * @param {string} [athleteId]  optional — for coach setting on athlete
 */
export const savePeriod = async (payload, athleteId) => {
  const params = athleteId ? { athleteId } : {};
  if (payload && payload._id) {
    const { data } = await api.put(`${BASE}/periods/${payload._id}`, payload, { params });
    return data;
  }
  const { data } = await api.post(`${BASE}/periods`, payload, { params });
  return data;
};

export const deletePeriod = async (periodId, athleteId) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.delete(`${BASE}/periods/${periodId}`, { params });
  return data;
};
