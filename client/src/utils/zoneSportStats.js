import {
  SPORT_LABELS,
  SPORT_ICON_COLORS,
  SPORT_TOGGLE_ORDER,
} from '../components/shared/SportIcon';

function zOut(src) {
  if (!src) return null;
  const out = {};
  for (let z = 1; z <= 5; z++) {
    const b = src[z] ?? src[String(z)];
    out[`z${z}`] = Number(b?.time) || 0;
  }
  return out;
}

function parseZoneBoundaryNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === '∞' || cleaned.includes('inf')) return Infinity;
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Pick zone definition by zone number (1–5) from server defs map. */
export function pickZoneDef(defs, zoneNum) {
  if (!defs) return null;
  return defs[zoneNum] ?? defs[String(zoneNum)] ?? defs[`zone${zoneNum}`] ?? null;
}

/**
 * Human-readable zone boundary for charts.
 * Z1 includes everything from 0 (or slowest pace); Z5 has no upper cap for power/HR.
 */
export function formatZoneBoundaryLabel(zoneNum, zoneDef, allDefs, type, { paceUnit = '/km' } = {}) {
  if (!zoneDef) return '';

  const z1 = pickZoneDef(allDefs, 1);
  const z2 = pickZoneDef(allDefs, 2);
  const z5 = pickZoneDef(allDefs, 5);

  if (type === 'pace') {
    const fmtPace = (s) => {
      if (!s || s <= 0 || !Number.isFinite(s)) return '∞';
      const mn = Math.floor(s / 60);
      const sc = Math.round(s % 60);
      return `${mn}:${String(sc).padStart(2, '0')}`;
    };
    const z1Min = parseZoneBoundaryNum(z1?.min);
    const z5Max = parseZoneBoundaryNum(z5?.max);
    const lo = parseZoneBoundaryNum(zoneDef.min);
    const hi = parseZoneBoundaryNum(zoneDef.max);

    if (zoneNum === 1) {
      if (z1Min != null) return `≥ ${fmtPace(z1Min)}${paceUnit}`;
      if (hi != null && hi !== Infinity) return `≥ ${fmtPace(hi)}${paceUnit}`;
    }
    if (zoneNum === 5) {
      if (z5Max != null && z5Max !== Infinity) return `≤ ${fmtPace(z5Max)}${paceUnit}`;
      if (lo != null) return `≤ ${fmtPace(lo)}${paceUnit}`;
    }
    const fastStr = hi != null && hi !== Infinity ? fmtPace(hi) : null;
    const slowStr = lo != null ? fmtPace(lo) : null;
    if (fastStr && slowStr) return `${fastStr}–${slowStr}${paceUnit}`;
    if (fastStr) return `≤ ${fastStr}${paceUnit}`;
    if (slowStr) return `≥ ${slowStr}${paceUnit}`;
    return '';
  }

  const unit = type === 'hr' ? 'bpm' : 'W';
  const lo = parseZoneBoundaryNum(zoneDef.min);
  const hi = parseZoneBoundaryNum(zoneDef.max);
  const z2Min = parseZoneBoundaryNum(z2?.min);
  const z1Max = parseZoneBoundaryNum(z1?.max);
  const z5Min = parseZoneBoundaryNum(z5?.min ?? zoneDef.min);

  if (zoneNum === 1) {
    if (z1Max != null && z1Max !== Infinity) return `0–${Math.round(z1Max)} ${unit}`;
    if (z2Min != null) return `0–${Math.round(z2Min)} ${unit}`;
    if (lo != null && lo > 0) return `0–${Math.round(lo)} ${unit}`;
    return `0+ ${unit}`;
  }

  if (zoneNum === 5) {
    if (z5Min != null) return `≥ ${Math.round(z5Min)} ${unit}`;
    if (lo != null) return `≥ ${Math.round(lo)} ${unit}`;
  }

  if (lo != null && hi != null && hi !== Infinity) return `${Math.round(lo)}–${Math.round(hi)} ${unit}`;
  if (lo != null) return `≥ ${Math.round(lo)} ${unit}`;
  if (hi != null && hi !== Infinity) return `≤ ${Math.round(hi)} ${unit}`;
  return '';
}

function hrZonesHaveData(hrZones) {
  if (!hrZones) return false;
  return Object.values(hrZones).some((z) => Number(z?.time) > 0);
}

function monthHasLegacySportData(month, sportKey) {
  if (!month) return false;
  if (sportKey === 'bike') {
    return Number(month.bikeTime) > 0 || !!month.zones || Number(month.bikeTrainings) > 0;
  }
  if (sportKey === 'run') {
    return Number(month.runningTime) > 0 || !!month.runningZoneTimes || Number(month.runningTrainings) > 0;
  }
  if (sportKey === 'swim') {
    return Number(month.swimmingTime) > 0 || !!month.swimmingZoneTimes || Number(month.swimmingTrainings) > 0;
  }
  return false;
}

export function monthHasSportZoneData(month, sportKey) {
  if (!month) return false;
  const stat = month.sportStats?.[sportKey];
  if (stat) {
    if (Number(stat.time) > 0 || Number(stat.trainings) > 0) return true;
    if (hrZonesHaveData(stat.hrZones)) return true;
  }
  return monthHasLegacySportData(month, sportKey);
}

export function getSportsWithZoneData(entries) {
  const set = new Set();
  for (const m of entries) {
    if (!m) continue;
    if (m.sportStats) {
      for (const [key, stat] of Object.entries(m.sportStats)) {
        if (key === 'other') continue;
        if (Number(stat?.time) > 0 || Number(stat?.trainings) > 0 || hrZonesHaveData(stat?.hrZones)) {
          set.add(key);
        }
      }
    }
    for (const key of ['bike', 'run', 'swim']) {
      if (monthHasLegacySportData(m, key)) set.add(key);
    }
  }
  return SPORT_TOGGLE_ORDER.filter((k) => set.has(k));
}

export function pickZoneTimes(month, sport, metric) {
  if (!month) return null;

  if (sport === 'bike') {
    const statHr = month.sportStats?.bike?.hrZones;
    return metric === 'hr'
      ? zOut(statHr || month.bikeHrZones || month.hrZones)
      : zOut(month.zones);
  }

  if (sport === 'run') {
    const statHr = month.sportStats?.run?.hrZones;
    return metric === 'hr'
      ? zOut(statHr || month.runningHrZones)
      : zOut(month.runningZoneTimes);
  }

  if (sport === 'swim') {
    return zOut(month.swimmingZoneTimes);
  }

  const extraStat = month.sportStats?.[sport];
  if (extraStat?.hrZones) return zOut(extraStat.hrZones);

  if (sport === 'all') {
    const out = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    let any = false;

    if (month.sportStats) {
      for (const stat of Object.values(month.sportStats)) {
        if (!hrZonesHaveData(stat?.hrZones)) continue;
        for (let z = 1; z <= 5; z++) {
          const v = Number(stat.hrZones[z]?.time) || 0;
          out[`z${z}`] += v;
          if (v > 0) any = true;
        }
      }
    }

    if (!any) {
      const bikeHr = month.bikeHrZones || month.hrZones;
      const runHr = month.runningHrZones;
      if (!bikeHr && !runHr) return null;
      for (let z = 1; z <= 5; z++) {
        const bk = bikeHr ? (bikeHr[z] ?? bikeHr[String(z)]) : null;
        const rn = runHr ? (runHr[z] ?? runHr[String(z)]) : null;
        out[`z${z}`] = (Number(bk?.time) || 0) + (Number(rn?.time) || 0);
        if (out[`z${z}`] > 0) any = true;
      }
    }
    return any ? out : null;
  }

  return null;
}

export function pickZoneDefs(month, sport, metric) {
  if (!month) return null;

  if (sport === 'bike') {
    if (metric === 'power' && month.powerZones) return { defs: month.powerZones, type: 'power' };
    const hrDefs = month.bikeHeartRateZones || month.heartRateZones;
    if (metric === 'hr' && hrDefs) return { defs: hrDefs, type: 'hr' };
    return null;
  }

  if (sport === 'run') {
    if (metric === 'pace' && month.runningZones) return { defs: month.runningZones, type: 'pace' };
    const hrDefs = month.runningHeartRateZones || month.heartRateZones;
    if (metric === 'hr' && hrDefs) return { defs: hrDefs, type: 'hr' };
    return null;
  }

  if (sport === 'swim') {
    if (month.swimmingZones) return { defs: month.swimmingZones, type: 'pace' };
    return null;
  }

  if (sport === 'all') {
    const hrDefs = month.heartRateZones || month.bikeHeartRateZones;
    if (hrDefs) return { defs: hrDefs, type: 'hr' };
    return null;
  }

  const hrDefs = month.runningHeartRateZones || month.heartRateZones;
  if (hrDefs) return { defs: hrDefs, type: 'hr' };
  return null;
}

export { SPORT_LABELS, SPORT_ICON_COLORS, SPORT_TOGGLE_ORDER };
