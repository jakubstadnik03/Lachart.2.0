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

/**
 * Režim zobrazení v grafech / tabulkách (pace vs speed).
 * - Test uložený ve speed → vždy speed (shoda s tabulkou testu).
 * - Jinak preference z Settings (`trainingPreferences.paceDisplay`).
 */
export function getLactateDisplayMode(mockData, user) {
  const storageMode = getEffectiveLactateInputMode(mockData);
  if (storageMode === 'speed') return 'speed';
  const pd = user?.trainingPreferences?.paceDisplay;
  if (pd === 'kmh') return 'speed';
  if (pd === 'minpkm') return 'pace';
  return storageMode;
}
