/**
 * Health & injury API helpers.
 *
 * The injury catalogue lives on the server (server/data/injuryCatalog.js) and is
 * fetched once per session - the tissue rules must not be duplicated here, or
 * the client and the gate can disagree about what an athlete is allowed to do.
 */
import api, { clearGetCacheMatching } from './api';

const BASE = '/api/health';

function invalidate() {
  try {
    clearGetCacheMatching?.('/api/health');
  } catch {
    /* cache helper is best-effort */
  }
}

function withAthlete(params = {}, athleteId) {
  return athleteId ? { ...params, athleteId } : params;
}

// ── Catalogue ──────────────────────────────────────────────────────────────

let catalogCache = null;

/** Injury/illness definitions, body sites and field tests. Cached per session. */
export async function fetchHealthCatalog() {
  if (catalogCache) return catalogCache;
  const { data } = await api.get(`${BASE}/catalog`);
  catalogCache = {
    catalog: Array.isArray(data?.catalog) ? data.catalog : [],
    bodySites: Array.isArray(data?.bodySites) ? data.bodySites : [],
    functionalTests: data?.functionalTests || {},
  };
  return catalogCache;
}

export function findCatalogEntry(catalog, id) {
  return (catalog || []).find((e) => e.id === id) || null;
}

/** Entries plausible for a body site, for the picker after a tap on the map. */
export function catalogForBodySite(catalog, siteId) {
  if (!siteId) return catalog || [];
  return (catalog || []).filter((e) => (e.bodySites || []).includes(siteId));
}

// ── Episodes ───────────────────────────────────────────────────────────────

export async function fetchEpisodes({ athleteId, status } = {}) {
  const params = withAthlete(status ? { status } : {}, athleteId);
  const { data } = await api.get(`${BASE}/episodes`, { params });
  return Array.isArray(data) ? data : [];
}

export async function fetchEpisode(id) {
  const { data } = await api.get(`${BASE}/episodes/${id}`);
  return data;
}

export async function createEpisode(payload) {
  const { data } = await api.post(`${BASE}/episodes`, payload);
  invalidate();
  return data;
}

export async function updateEpisode(id, patch) {
  const { data } = await api.patch(`${BASE}/episodes/${id}`, patch);
  invalidate();
  return data;
}

export async function deleteEpisode(id) {
  const { data } = await api.delete(`${BASE}/episodes/${id}`);
  invalidate();
  return data;
}

// ── Check-ins ──────────────────────────────────────────────────────────────

export async function fetchCheckIns(episodeId, days = 90) {
  const { data } = await api.get(`${BASE}/episodes/${episodeId}/check-ins`, { params: { days } });
  return Array.isArray(data) ? data : [];
}

/**
 * Upsert one report. Returns { checkIn, gate } so the UI can react at once.
 *
 * payload.date may be any past day back to the episode's start, which is how
 * backfilling works. The server rejects a future date or one before onset,
 * because every streak the gate computes walks backwards from the newest
 * check-in and a stray date silently corrupts all of them.
 */
export async function saveCheckIn(episodeId, payload) {
  const { data } = await api.put(`${BASE}/episodes/${episodeId}/check-ins`, payload);
  invalidate();
  return data;
}

export async function deleteCheckIn(episodeId, checkInId) {
  const { data } = await api.delete(`${BASE}/episodes/${episodeId}/check-ins/${checkInId}`);
  invalidate();
  return data;
}

// ── Gate and stage transitions ─────────────────────────────────────────────

export async function fetchGate(episodeId) {
  const { data } = await api.get(`${BASE}/episodes/${episodeId}/gate`);
  return data;
}

/** Open episodes with their verdict - the dashboard card and the health page. */
export async function fetchHealthToday(athleteId) {
  const { data } = await api.get(`${BASE}/today`, { params: withAthlete({}, athleteId) });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function advanceStage(episodeId, { force = false } = {}) {
  const { data } = await api.post(`${BASE}/episodes/${episodeId}/advance`, { force });
  invalidate();
  return data;
}

export async function stepBackStage(episodeId, reason) {
  const { data } = await api.post(`${BASE}/episodes/${episodeId}/step-back`, { reason });
  invalidate();
  return data;
}

export async function markSpeedStepCleared(episodeId) {
  const { data } = await api.post(`${BASE}/episodes/${episodeId}/speed-cleared`, {});
  invalidate();
  return data;
}

/**
 * Jump straight to a stage. Needed for backfill: someone logging an injury four
 * weeks late is not on stage 1, and walking them through the gates they already
 * cleared in real life would be theatre.
 */
export async function setStage(episodeId, stageIndex) {
  const { data } = await api.post(`${BASE}/episodes/${episodeId}/set-stage`, { stageIndex });
  invalidate();
  return data;
}

/**
 * Weekly return-to-training series: actual volume and speed against the ceiling
 * that was in force at the time and against the frozen pre-injury baseline.
 * `weeks` is how much pre-injury context to include before onset, not a cap on
 * the series, which always runs through the current week.
 */
export async function fetchProgress(episodeId, weeks = 8) {
  const { data } = await api.get(`${BASE}/episodes/${episodeId}/progress`, { params: { weeks } });
  return {
    sport: data?.sport || 'run',
    baseline: data?.baseline || null,
    weeks: Array.isArray(data?.weeks) ? data.weeks : [],
  };
}

// ── Formatting helpers shared by the health UI ─────────────────────────────

export const LIGHT_COLORS = {
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
};

export const LIGHT_LABELS = {
  green: 'Clear to train as planned',
  amber: 'Hold - do not add load today',
  red: 'Stop - back off',
};

/**
 * What the athlete should read first. A tendinopathy told to rest gets worse,
 * so the headline follows loadResponse rather than a generic "take it easy".
 */
export function loadResponseHeadline(entry) {
  switch (entry?.loadResponse) {
    case 'rest':
      return 'This tissue needs load taken off it before it can take load again.';
    case 'progressive_load':
      return 'This tissue gets worse with rest. It needs the right dose, not time off.';
    case 'modified_load':
    default:
      return 'Keep training, but under the level that provokes it.';
  }
}

export function formatDistance(metres, unitSystem = 'metric') {
  if (metres == null) return '-';
  if (unitSystem === 'imperial') return `${(metres / 1609.34).toFixed(1)} mi`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** m/s -> mm:ss per km, the unit runners actually think in. */
export function formatPace(mps) {
  if (!mps || mps <= 0) return '-';
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
