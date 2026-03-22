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

/**
 * Vrací efektivní režim zobrazení/výpočtu pro běh/plavání.
 *
 * Problém: při přepnutí testu může zůstat v dokumentu `inputMode: 'speed'`, ale pole `power`
 * je stále v sekundách (pace). Pak graf formátuje 224 jako „224 km/h“ místo mm:ss.
 *
 * Pokud je v metadatech speed, ale jakákoli zátěž přesáhne rozumné maximum km/h,
 * považujeme hodnoty za sekundy (pace).
 */
export function getEffectiveLactateInputMode(mockData) {
  const raw = String(mockData?.inputMode ?? 'pace').trim().toLowerCase();
  let mode = raw === 'speed' ? 'speed' : 'pace';
  const sk = normalizeLactateSport(mockData?.sport);
  const isPaceSport = sk === 'run' || sk === 'swim';
  if (!isPaceSport || mode !== 'speed') return mode;

  const loads = (mockData?.results || [])
    .map((r) => Number(String(r?.power ?? '').replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!loads.length) return mode;

  const maxPlausibleKmh = sk === 'swim' ? 14 : 48;
  if (loads.some((v) => v > maxPlausibleKmh)) return 'pace';
  return mode;
}
