/**
 * Normalizace sportu pro laktátové testy (shodně s LactateCurveCalculator / DataTable).
 * @returns {'bike'|'run'|'swim'}
 */
export function normalizeLactateSport(sport) {
  const s = String(sport || 'bike').toLowerCase().trim();
  if (s === 'cycling' || s === 'cycle' || s === 'bike') return 'bike';
  if (s === 'running' || s === 'run' || s.includes('run')) return 'run';
  if (s === 'swimming' || s === 'swim' || s.includes('swim')) return 'swim';
  return 'bike';
}

function collectLoads(mockData) {
  return (mockData?.results || [])
    .map((r) => Number(String(r?.power ?? '').replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Hodnoty vypadají jako rychlost (km/h), ne jako tempo v sekundách. */
function loadsLookLikeSpeedKmh(sk, loads) {
  if (!loads.length) return false;
  const max = Math.max(...loads);
  const min = Math.min(...loads);
  if (sk === 'swim') {
    return min >= 1 && max <= 14;
  }
  return max <= 48 && min >= 3 && loads.every((v) => v < 120);
}

/** Hodnoty vypadají jako tempo v sekundách (pace /100m nebo /km). */
function loadsLookLikePaceSeconds(sk, loads) {
  if (!loads.length) return false;
  const min = Math.min(...loads);
  if (sk === 'swim') return min >= 45;
  return min >= 120;
}

/**
 * Vrací efektivní režim uložení zátěže pro běh/plavání (`pace` | `speed`).
 *
 * - Explicitní `inputMode: 'speed'` s hodnotami nad rozumným km/h → pace (sekundy).
 * - Chybí `inputMode` nebo je `pace`, ale intervaly vypadají jako km/h (např. 7.2–18)
 *   → speed (oprava starších testů bez metadat).
 */
export function getEffectiveLactateInputMode(mockData) {
  const sk = normalizeLactateSport(mockData?.sport);
  const isPaceSport = sk === 'run' || sk === 'swim';
  if (!isPaceSport) return 'pace';

  const loads = collectLoads(mockData);
  const raw = String(mockData?.inputMode ?? '').trim().toLowerCase();
  const maxPlausibleKmh = sk === 'swim' ? 14 : 48;

  if (raw === 'speed') {
    if (!loads.length) return 'speed';
    if (loads.some((v) => v > maxPlausibleKmh)) return 'pace';
    return 'speed';
  }

  if (raw === 'pace') {
    if (loadsLookLikeSpeedKmh(sk, loads) && !loadsLookLikePaceSeconds(sk, loads)) {
      return 'speed';
    }
    return 'pace';
  }

  if (loadsLookLikeSpeedKmh(sk, loads)) return 'speed';
  if (loadsLookLikePaceSeconds(sk, loads)) return 'pace';
  return 'pace';
}

function isFlaggedSpeed(test) {
  return String(test?.inputMode ?? '').trim().toLowerCase() === 'speed';
}

/** Speed goes up with lactate; a pace number goes down. */
function loadsRiseWithLactate(results) {
  const points = results
    .map((r) => [
      Number(String(r?.power ?? '').replace(',', '.')),
      Number(String(r?.lactate ?? '').replace(',', '.')),
    ])
    .filter(([load, lactate]) => load > 0 && lactate > 0);
  if (points.length < 2) return false;
  const mean = (i) => points.reduce((sum, p) => sum + p[i], 0) / points.length;
  const loadMean = mean(0);
  const lactateMean = mean(1);
  return points.reduce((sum, [load, lactate]) => sum + (load - loadMean) * (lactate - lactateMean), 0) > 0;
}

/**
 * The thresholds read run and swim loads as pace seconds and reject anything
 * under 60. This gives the seconds for a test whose `power` column holds speed
 * (km/h, or mph on an imperial test), or null when it already holds seconds.
 * Rows without a load keep what they had.
 *
 * Without an explicit 'speed' flag the loads must also rise with lactate. Seven
 * saved tests hold whole minutes of pace with the seconds lost (`5 5 4 4 4 4`):
 * read as km/h they look plausible and produce invented thresholds.
 */
export function speedLoadsAsPaceSeconds(test) {
  if (getEffectiveLactateInputMode(test) !== 'speed') return null;
  if (!collectLoads(test).length) return null;
  const results = test?.results || [];
  if (!isFlaggedSpeed(test) && !loadsRiseWithLactate(results)) return null;
  const isSwim = normalizeLactateSport(test?.sport) === 'swim';
  const isImperial = test?.unitSystem === 'imperial';
  return results.map((r) => {
    const speed = Number(String(r?.power ?? '').replace(',', '.'));
    if (!Number.isFinite(speed) || speed <= 0) return r?.power;
    if (!isSwim) return 3600 / speed;
    return 360 / (isImperial ? speed / 0.621371 : speed);
  });
}

/**
 * The test with its loads in pace seconds, flagged 'speed' so it still reads
 * the way it was typed. Returns the same object when there is nothing to do.
 */
export function withPaceSecondLoads(test) {
  const seconds = speedLoadsAsPaceSeconds(test);
  if (!seconds) return test;
  return {
    ...test,
    inputMode: 'speed',
    results: test.results.map((r, i) => (r ? { ...r, power: seconds[i] } : r)),
  };
}

/**
 * Režim zobrazení v grafech / tabulkách (pace vs speed).
 * - Test zadaný ve speed → vždy speed (shoda s tabulkou testu), ať už je uložený
 *   v km/h, nebo v sekundách, jak ho ukládá formulář. Preference `minpkm` to
 *   nepřebije: je to výchozí hodnota každého účtu, ne volba pro tento test.
 * - Jinak preference z Settings (`trainingPreferences.paceDisplay`).
 */
export function getLactateDisplayMode(mockData, user) {
  const storageMode = getEffectiveLactateInputMode(mockData);
  if (storageMode === 'speed') return 'speed';
  const sk = normalizeLactateSport(mockData?.sport);
  if ((sk === 'run' || sk === 'swim') && isFlaggedSpeed(mockData)) return 'speed';
  const pd = user?.trainingPreferences?.paceDisplay;
  if (pd === 'kmh') return 'speed';
  if (pd === 'minpkm') return 'pace';
  return storageMode;
}
