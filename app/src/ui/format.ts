export function formatDuration(seconds?: number | null) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function formatDistanceMeters(meters?: number | null) {
  const m = Number(meters || 0);
  if (!m || Number.isNaN(m)) return '-';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatWatts(watts?: number | null) {
  const w = Number(watts);
  if (!w || Number.isNaN(w)) return '-';
  return `${Math.round(w)} W`;
}

export function formatBpm(bpm?: number | null) {
  const v = Number(bpm);
  if (!v || Number.isNaN(v)) return '-';
  return `${Math.round(v)} bpm`;
}

export function paceFromSpeed(speedMps?: number | null, kind: 'run' | 'swim' = 'run') {
  const s = Number(speedMps);
  if (!s || Number.isNaN(s) || s <= 0) return null;
  const seconds = kind === 'swim' ? 100 / s : 1000 / s; // swim: per 100m, run: per km
  return seconds;
}

export function formatPaceSeconds(paceSeconds?: number | null, suffix = '/km') {
  const s = Number(paceSeconds);
  if (!s || Number.isNaN(s)) return '-';
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${mm}:${String(ss).padStart(2, '0')}${suffix}`;
}



