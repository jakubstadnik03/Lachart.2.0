/**
 * Annual Training Plan API.
 *
 * Week edits are the hot path here: the table saves one row at a time as the
 * athlete tabs through it, and each save returns the whole plan because
 * changing one week's TSS shifts every projected fitness value after it.
 */
import api, { clearGetCacheMatching } from './api';

const BASE = '/api/atp';

function invalidate() {
  clearGetCacheMatching(BASE);
}

/** The calendar reads the season on its own. A save has to tell it, or the
 *  bands stay on whatever period was current the last time that page mounted. */
function publish(plan) {
  invalidate();
  if (typeof window === 'undefined' || !plan) return;
  window.dispatchEvent(new CustomEvent('atp:updated', { detail: plan }));
}

const withAthlete = (athleteId) => (athleteId ? { athleteId } : {});

/** All of an athlete's seasons, newest first. */
export const getAtpPlans = async (athleteId, { noCache = false } = {}) => {
  const { data } = await api.get(BASE, { params: withAthlete(athleteId), noCache });
  return Array.isArray(data) ? data : [];
};

/** One season, with the races that fall inside it. */
export const getAtpPlan = async (id, athleteId, { noCache = false } = {}) => {
  const { data } = await api.get(`${BASE}/${id}`, { params: withAthlete(athleteId), noCache });
  return data;
};

export const createAtpPlan = async (payload, athleteId) => {
  const { data } = await api.post(BASE, { ...payload, ...withAthlete(athleteId) });
  publish(data);
  return data;
};

/** Season settings — name, dates, peak weekly TSS. */
export const updateAtpPlan = async (id, payload, athleteId) => {
  const { data } = await api.put(`${BASE}/${id}`, payload, { params: withAthlete(athleteId) });
  publish(data);
  return data;
};

/**
 * Save week rows. Send only what changed — anything omitted keeps its stored
 * value. Omit `targetTss` on a row to let the server re-derive it from the
 * period, which is what a period change with no manual TSS should do.
 */
export const updateAtpWeeks = async (id, weeks, athleteId) => {
  const { data } = await api.put(`${BASE}/${id}/weeks`, { weeks }, { params: withAthlete(athleteId) });
  publish(data);
  return data;
};

/** Re-lay the blocks around the athlete's current A races. */
export const autoPeriodizeAtp = async (id, athleteId) => {
  const { data } = await api.post(`${BASE}/${id}/auto-periodize`, {}, { params: withAthlete(athleteId) });
  publish(data);
  return data;
};

export const deleteAtpPlan = async (id, athleteId) => {
  const { data } = await api.delete(`${BASE}/${id}`, { params: withAthlete(athleteId) });
  publish({ _id: id, deleted: true });
  return data;
};
