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
