// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';

export { resolveLtAnchorsFromTest };

const formatPace = (seconds) => {
  if (!seconds || seconds === 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Nejvyšší naměřená tepová frekvence v testu (pole `maxHR` nebo maximum ze stupňů).
 * Slouží jako strop Z5 — dřív Z5 končila na 1.30 × LT2 HR, což u testu s max. 183
 * bpm vykreslilo zónu až do 217 bpm.
 */
function measuredMaxHr(testData) {
  const candidates = [Number(testData?.maxHR)];
  for (const r of testData?.results || []) candidates.push(Number(r?.heartRate));
  const valid = candidates.filter((n) => Number.isFinite(n) && n > 80 && n < 240);
  return valid.length ? Math.max(...valid) : null;
}

/**
 * Zóny stavíme z hranic, ne z nezávislých min/max párů.
 *
 * Původní varianta počítala konec Z3 jako 0.95 × LT2 a začátek Z4 jako 0.96 × LT2,
 * takže mezi zónami zůstávaly nepřiřazené mezery (Z3 do 4:42, Z4 od 4:39), a když
 * LT1 a LT2 ležely blízko sebe, vyšla degenerovaná zóna typu „159–159 bpm".
 * Hranice jsou proto sdílené: konec jedné zóny je začátek další.
 *
 * @param {number[]} bounds šest hranic vzestupně (b0…b5)
 * @param {boolean} ascending true = vyšší číslo znamená vyšší intenzitu (watty, tep)
 */
function zonesFromBounds(bounds, ascending = true) {
  const b = [...bounds];
  // Jedna sdílená hranice na zónu; vynutíme ostře rostoucí řadu, aby ani u velmi
  // blízkých LT1/LT2 nevznikla zóna s nulovou šířkou.
  for (let i = 1; i < b.length; i++) {
    if (ascending ? b[i] <= b[i - 1] : b[i] >= b[i - 1]) {
      b[i] = ascending ? b[i - 1] + 1 : b[i - 1] - 1;
    }
  }
  return b;
}

export const calculateZonesFromTest = (testData) => {
  const anchors = resolveLtAnchorsFromTest(testData);
  if (!anchors) return null;

  const { lt1_value, lt2_value, sport, hr1, hr2 } = anchors;
  const hasHR = hr1 != null && hr2 != null && !Number.isNaN(Number(hr1)) && !Number.isNaN(Number(hr2));

  let heartRateZones = null;
  if (hasHR) {
    const maxHr = measuredMaxHr(testData);
    // Z5 končí naměřeným maximem; bez něj padáme zpět na 1.10 × LT2 HR.
    const hrTop = maxHr != null ? Math.max(maxHr, hr2 * 1.04 + 1) : hr2 * 1.10;
    const hb = zonesFromBounds([
      hr1 * 0.50,   // spodek Z1
      hr1 * 0.90,   // Z1 / Z2
      hr1,          // Z2 / Z3  – aerobní práh
      hr2,          // Z3 / Z4  – anaerobní práh
      hr2 * 1.04,   // Z4 / Z5
      hrTop,        // strop Z5
    ].map(Math.round), true);
    heartRateZones = {
      zone1: { min: hb[0], max: hb[1] },
      zone2: { min: hb[1], max: hb[2] },
      zone3: { min: hb[2], max: hb[3] },
      zone4: { min: hb[3], max: hb[4] },
      zone5: { min: hb[4], max: hb[5] },
    };
  }

  if (sport === 'bike') {
    const lt1_watts = lt1_value;
    const lt2_watts = lt2_value;
    const pb = zonesFromBounds([
      lt1_watts * 0.50,
      lt1_watts * 0.90,
      lt1_watts,
      lt2_watts,
      lt2_watts * 1.04,
      lt2_watts * 1.10,
    ].map(Math.round), true);
    return {
      power: {
        zone1: { min: pb[0], max: pb[1] },
        zone2: { min: pb[1], max: pb[2] },
        zone3: { min: pb[2], max: pb[3] },
        zone4: { min: pb[3], max: pb[4] },
        zone5: { min: pb[4], max: pb[5] },
      },
      heartRate: heartRateZones
    };
  }

  // Run/Swim – pace v sekundách (vyšší sec = pomalejší), takže hranice klesají.
  const lt1_sec = lt1_value;
  const lt2_sec = lt2_value;
  const sb = zonesFromBounds([
    lt1_sec / 0.50,
    lt1_sec / 0.90,
    lt1_sec,
    lt2_sec,
    lt2_sec / 1.04,
    // Rychlý okraj Z5: užší fialový pás (dřív 1.30 → 1.16 → 1.10)
    lt2_sec / 1.10,
  ].map(Math.round), false);
  const fmt = (s) => formatPace(s);
  return {
    pace: {
      zone1: { min: fmt(sb[0]), max: fmt(sb[1]) },
      zone2: { min: fmt(sb[1]), max: fmt(sb[2]) },
      zone3: { min: fmt(sb[2]), max: fmt(sb[3]) },
      zone4: { min: fmt(sb[3]), max: fmt(sb[4]) },
      zone5: { min: fmt(sb[4]), max: fmt(sb[5]) },
    },
    heartRate: heartRateZones
  };
};


