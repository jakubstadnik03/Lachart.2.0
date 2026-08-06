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

const withAthlete = (athleteId) => (athleteId ? { athleteId } : {});

/** All of an athlete's seasons, newest first. */
export const getAtpPlans = async (athleteId) => {
  const { data } = await api.get(BASE, { params: withAthlete(athleteId) });
  return Array.isArray(data) ? data : [];
};

/** One season, with the races that fall inside it. */
export const getAtpPlan = async (id, athleteId) => {
  const { data } = await api.get(`${BASE}/${id}`, { params: withAthlete(athleteId) });
  return data;
};

export const createAtpPlan = async (payload, athleteId) => {
  const { data } = await api.post(BASE, { ...payload, ...withAthlete(athleteId) });
  invalidate();
  return data;
};

/** Season settings — name, dates, peak weekly TSS. */
export const updateAtpPlan = async (id, payload, athleteId) => {
  const { data } = await api.put(`${BASE}/${id}`, payload, { params: withAthlete(athleteId) });
  invalidate();
  return data;
};

/**
 * Save week rows. Send only what changed — anything omitted keeps its stored
 * value. Omit `targetTss` on a row to let the server re-derive it from the
 * period, which is what a period change with no manual TSS should do.
 */
export const updateAtpWeeks = async (id, weeks, athleteId) => {
  const { data } = await api.put(`${BASE}/${id}/weeks`, { weeks }, { params: withAthlete(athleteId) });
  invalidate();
  return data;
};

/** Re-lay the blocks around the athlete's current A races. */
export const autoPeriodizeAtp = async (id, athleteId) => {
  const { data } = await api.post(`${BASE}/${id}/auto-periodize`, {}, { params: withAthlete(athleteId) });
  invalidate();
  return data;
};

export const deleteAtpPlan = async (id, athleteId) => {
  const { data } = await api.delete(`${BASE}/${id}`, { params: withAthlete(athleteId) });
  invalidate();
  return data;
};
