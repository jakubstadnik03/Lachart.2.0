/**
 * Peak efforts + time-in-zones for a single activity (TrainingPeaks-style).
 */

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];

const POWER_BANDS_OF_FTP = [0.55, 0.75, 0.90, 1.05];
const HR_BANDS_OF_LT2 = [0.81, 0.89, 0.96, 1.02];

export const PEAK_WINDOWS = [
  { label: '5 sec', s: 5 },
  { label: '10 sec', s: 10 },
  { label: '12 sec', s: 12 },
  { label: '20 sec', s: 20 },
  { label: '30 sec', s: 30 },
  { label: '1 min', s: 60 },
  { label: '2 min', s: 120 },
  { label: '5 min', s: 300 },
  { label: '6 min', s: 360 },
  { label: '10 min', s: 600 },
  { label: '12 min', s: 720 },
  { label: '20 min', s: 1200 },
  { label: '30 min', s: 1800 },
  { label: '60 min', s: 3600 },
  { label: '90 min', s: 5400 },
  { label: '180 min', s: 10800 },
];

function sportKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual')) return 'cycling';
  if (s.includes('swim')) return 'swimming';
  return 'running';
}

function pickValue(rec, keys) {
  for (const k of keys) {
    const v = rec?.[k];
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function recordPower(r) { return pickValue(r, ['power', 'watts']); }
export function recordHr(r) { return pickValue(r, ['heartRate', 'heart_rate', 'hr']); }

function recordSec(r, prev) {
  if (!r) return 1;
  if (prev?.timestamp && r.timestamp) {
    const dt = (new Date(r.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (dt > 0 && dt < 30) return dt;
  }
  return 1;
}

function parseZoneNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === '∞' || cleaned.includes('inf')) return Infinity;
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function readUserZones(authUser, sport, metric) {
  if (!authUser) return null;
  const key = sportKey(sport);
  const root = metric === 'power' ? authUser.powerZones
    : metric === 'hr' ? authUser.heartRateZones
      : (authUser.paceZones || authUser.powerZones);
  const z = root?.[key];
  if (!z) return null;
  const zones = [];
  for (let i = 1; i <= 5; i++) {
    const zone = z[`zone${i}`];
    if (!zone) return null;
    zones.push({
      key: `zone${i}`,
      label: zone.label || zone.description || `Zone ${i}`,
      min: parseZoneNumber(zone.min),
      max: zone.max === undefined ? null : parseZoneNumber(zone.max),
    });
  }
  return zones;
}

function readReference(authUser, sport, metric) {
  if (!authUser) return null;
  const key = sportKey(sport);
  if (metric === 'power') {
    const lt2 = Number(authUser?.powerZones?.[key]?.lt2);
    return Number.isFinite(lt2) && lt2 > 0 ? lt2 : null;
  }
  const lt2 = Number(
    authUser?.heartRateZones?.[key]?.lt2
    ?? authUser?.heartRateZones?.[key]?.lt2Hr
    ?? authUser?.powerZones?.[key]?.lt2Hr,
  );
  return Number.isFinite(lt2) && lt2 > 0 ? lt2 : null;
}

function estimateMaxHr(records) {
  const vals = records.map(recordHr).filter((v) => v != null);
  if (vals.length < 30) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.98)];
}

function findZoneKeyForValue(value, zonesObj) {
  const val = Number(value);
  if (!Number.isFinite(val)) return null;
  let prevMax = null;
  let lastValidKey = null;
  let lastValidMax = null;
  for (const zKey of ZONE_KEYS) {
    const def = zonesObj?.[zKey];
    if (!def) continue;
    let min = parseZoneNumber(def?.min);
    const max = def?.max === undefined ? null : parseZoneNumber(def?.max);
    if (min === null && prevMax !== null) min = prevMax;
    if (min === null) { prevMax = max ?? prevMax; continue; }
    if (max === null || max === Infinity) {
      if (val >= min) return zKey;
      prevMax = min;
      continue;
    }
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    if (val >= low && val <= high) return zKey;
    prevMax = high;
    lastValidKey = zKey;
    if (lastValidMax === null || high > lastValidMax) lastValidMax = high;
  }
  if (lastValidKey !== null && lastValidMax !== null && val > lastValidMax) return lastValidKey;
  return null;
}

function formatZoneRange(def, metric, prevMax) {
  let min = def?.min;
  if (min === null && prevMax !== null) min = prevMax;
  const max = def?.max;
  if (min === null) return '—';
  if (metric === 'power') {
    if (max === null || max === Infinity) return `>${Math.round(min)} watts`;
    return `${Math.round(min)}-${Math.round(max)} watts`;
  }
  if (max === null || max === Infinity) return `>${Math.round(min)} bpm`;
  return `${Math.round(min)}-${Math.round(max)} bpm`;
}

export function estimateDtSec(records) {
  if (!records?.length) return 1;
  const ts = records.map((r) => {
    const t = new Date(r.timestamp).getTime();
    return Number.isFinite(t) ? t : null;
  });
  if (ts[0] != null && ts[ts.length - 1] != null && records.length > 1) {
    return Math.max(1, Math.round((ts[ts.length - 1] - ts[0]) / 1000 / (records.length - 1)));
  }
  return 1;
}

/** Best rolling average + start record index for seeking on the main chart. */
export function bestRolling(records, field, windowSec) {
  const dtSec = estimateDtSec(records);
  const w = Math.max(1, Math.round(windowSec / dtSec));
  const getter = field === 'power' ? recordPower : recordHr;
  const vals = records.map(getter).map((v) => v || 0);
  if (vals.length < w) return null;
  let sum = 0;
  for (let i = 0; i < w; i++) sum += vals[i];
  let best = sum / w;
  let bestStart = 0;
  for (let i = w; i < vals.length; i++) {
    sum += vals[i] - vals[i - w];
    const avg = sum / w;
    if (avg > best) {
      best = avg;
      bestStart = i - w + 1;
    }
  }
  if (best <= 0) return null;
  const rec = records[bestStart];
  let focusTimeSec = bestStart;
  if (rec?.timestamp) {
    const t0 = new Date(records[0].timestamp).getTime();
    focusTimeSec = (new Date(rec.timestamp).getTime() - t0) / 1000;
  }
  return { value: best, startIndex: bestStart, focusTimeSec };
}

export function computePeakEfforts(records, activityDurationSec) {
  const hasPower = records.some((r) => recordPower(r) != null);
  const hasHr = records.some((r) => recordHr(r) != null);
  const dur = activityDurationSec || 0;
  const windows = PEAK_WINDOWS.filter((w) => dur >= w.s * 0.55);
  return windows.map((w) => ({
    ...w,
    power: hasPower ? bestRolling(records, 'power', w.s) : null,
    hr: hasHr ? bestRolling(records, 'hr', w.s) : null,
  }));
}

export function computeZonesBreakdown(records, sport, authUser, metric) {
  if (!Array.isArray(records) || records.length < 10) return null;

  const profileZones = readUserZones(authUser, sport, metric);
  let zoneDefs = profileZones;
  let zonesObj = null;
  let usedProfile = !!profileZones;

  if (profileZones) {
    zonesObj = {};
    profileZones.forEach((z) => { zonesObj[z.key] = { min: z.min, max: z.max, label: z.label }; });
  } else {
    const ref = readReference(authUser, sport, metric);
    if (metric === 'power') {
      if (!(ref > 0)) return null;
      const bands = POWER_BANDS_OF_FTP.map((b) => b * ref);
      zoneDefs = ZONE_KEYS.map((key, i) => ({
        key,
        label: `Zone ${i + 1}`,
        min: i === 0 ? 0 : bands[i - 1],
        max: i < 4 ? bands[i] : Infinity,
      }));
      zonesObj = Object.fromEntries(zoneDefs.map((z) => [z.key, { min: z.min, max: z.max }]));
    } else {
      const ref = readReference(authUser, sport, 'hr') || estimateMaxHr(records);
      if (!(ref > 0)) return null;
      const factor = readReference(authUser, sport, 'hr') ? 1 : 0.92;
      const bands = HR_BANDS_OF_LT2.map((b) => b * ref * factor);
      zoneDefs = ZONE_KEYS.map((key, i) => ({
        key,
        label: `Zone ${i + 1}`,
        min: i === 0 ? 0 : bands[i - 1],
        max: i < 4 ? bands[i] : Infinity,
      }));
      zonesObj = Object.fromEntries(zoneDefs.map((z) => [z.key, { min: z.min, max: z.max }]));
    }
  }

  const zoneSecs = Object.fromEntries(ZONE_KEYS.map((k) => [k, 0]));
  let prev = null;
  const getter = metric === 'power' ? recordPower : recordHr;
  for (const r of records) {
    const dt = recordSec(r, prev);
    prev = r;
    const v = getter(r);
    if (v == null) continue;
    const zKey = findZoneKeyForValue(v, zonesObj);
    if (zKey) zoneSecs[zKey] += dt;
  }

  const totalSec = Object.values(zoneSecs).reduce((a, b) => a + b, 0);
  if (totalSec < 30) return null;

  let prevMax = null;
  const zones = zoneDefs.map((def) => {
    const range = formatZoneRange(
      { min: def.min ?? (prevMax ?? 0), max: def.max },
      metric,
      prevMax,
    );
    if (def.max != null && def.max !== Infinity) prevMax = def.max;
    else if (def.min != null) prevMax = def.min;
    return {
      key: def.key,
      label: def.label || def.key.replace('zone', 'Zone '),
      range,
      seconds: zoneSecs[def.key] || 0,
      minutes: (zoneSecs[def.key] || 0) / 60,
    };
  });

  return { metric, zones, totalSec, usedProfile };
}

export function formatPeakDuration(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatHms(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
