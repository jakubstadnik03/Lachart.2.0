/**
 * Daily wellness check-in API.
 *
 * The server owns the score, the bands, the change since last time and the
 * "is one due" rule (server/utils/wellnessScore.js); the client sends answers
 * and renders what comes back.
 */
import api, { clearGetCacheMatching } from './api';

const BASE = '/api/wellness-check-ins';

function invalidate() {
  try {
    clearGetCacheMatching?.(BASE);
  } catch {
    /* cache helper is best-effort */
  }
}

/** The athlete's local calendar day. The server clock is UTC, theirs is not. */
export function localTodayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Everything the card needs: frequency, due, latest, deltas, 14 days of rows. */
export async function fetchWellnessSummary(athleteId = null) {
  const params = { today: localTodayKey() };
  if (athleteId) params.athleteId = athleteId;
  const { data } = await api.get(`${BASE}/summary`, { params });
  return data;
}

/** Athlete only. Answering again the same day replaces that day's report. */
export async function saveWellnessCheckIn(payload) {
  const { data } = await api.put(BASE, { today: localTodayKey(), ...payload });
  invalidate();
  return data;
}

/** Record which injury/illness episode a pain or illness "yes" led to. */
export async function linkWellnessEpisode(checkInId, episodeId) {
  const { data } = await api.patch(`${BASE}/${checkInId}/episode`, { episodeId });
  invalidate();
  return data;
}

export async function deleteWellnessCheckIn(checkInId) {
  const { data } = await api.delete(`${BASE}/${checkInId}`);
  invalidate();
  return data;
}

/** { mode: 'off' | 'daily' | 'interval', everyDays } for one athlete. */
export async function saveWellnessFrequency({ athleteId = null, mode, everyDays }) {
  const { data } = await api.put(`${BASE}/settings`, { athleteId, mode, everyDays });
  invalidate();
  return data;
}
