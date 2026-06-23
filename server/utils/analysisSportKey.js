/**
 * Canonical sport keys for monthly zone analysis (matches client resolveSportKey).
 */

function resolveAnalysisSportKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual')) return 'bike';
  if (s.includes('swim')) return 'swim';
  if (
    s.includes('nordic') ||
    s.includes('backcountry') ||
    s.includes('rollerski') ||
    (s.includes('ski') && !s.includes('kite'))
  ) return 'ski';
  if (s.includes('hike')) return 'hike';
  if (s.includes('walk')) return 'walk';
  if (s.includes('run') || s.includes('trail')) return 'run';
  if (
    s.includes('gym') ||
    s.includes('weight') ||
    s.includes('strength') ||
    s.includes('workout') ||
    s.includes('crossfit') ||
    s.includes('yoga') ||
    s.includes('elliptical') ||
    s.includes('fitness')
  ) return 'gym';
  return 'other';
}

/** FIT file sport field → analysis key */
function resolveFitSportKey(trainingSport) {
  if (trainingSport === 'running') return 'run';
  if (trainingSport === 'swimming') return 'swim';
  if (trainingSport === 'cycling') return 'bike';
  return 'other';
}

/** HR zone profile key for a sport bucket */
function hrZoneProfileSport(sportKey) {
  if (sportKey === 'run' || sportKey === 'hike' || sportKey === 'walk' || sportKey === 'ski') return 'running';
  return 'cycling';
}

function createEmptyHrZones() {
  const zones = {};
  for (let z = 1; z <= 5; z++) {
    zones[z] = { time: 0, avgHeartRate: 0, heartRateCount: 0 };
  }
  return zones;
}

function ensureSportStat(month, key) {
  if (!month.sportStats) month.sportStats = {};
  if (!month.sportStats[key]) {
    month.sportStats[key] = { time: 0, trainings: 0, hrZones: createEmptyHrZones() };
  }
  return month.sportStats[key];
}

function addSportHrZone(month, sportKey, hrZone, increment, hr) {
  const stat = ensureSportStat(month, sportKey);
  stat.hrZones[hrZone].time += increment;
  stat.hrZones[hrZone].avgHeartRate += hr * increment;
  stat.hrZones[hrZone].heartRateCount += increment;
}

function addSportActivity(month, sportKey, timeSec) {
  const stat = ensureSportStat(month, sportKey);
  stat.trainings += 1;
  stat.time += Number(timeSec) || 0;
}

module.exports = {
  resolveAnalysisSportKey,
  resolveFitSportKey,
  hrZoneProfileSport,
  createEmptyHrZones,
  ensureSportStat,
  addSportHrZone,
  addSportActivity,
};
