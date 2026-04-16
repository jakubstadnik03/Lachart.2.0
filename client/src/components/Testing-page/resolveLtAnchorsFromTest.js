/**
 * LTP1/LTP2 anchor resolution shared by zone tables and the race pace predictor.
 * Lives in its own module to avoid circular init with zoneCalculator / heavy UI imports.
 */
import { calculateThresholds } from './DataTable';

/** Minimální rozumný odstup LT2 od LT1 pro generování zón (W nebo % pro pace) */
const MIN_LT2_LT1_GAP_W = 20;

/**
 * Resolved LTP1/LTP2 anchor intensities (bike: watts; run metric: sec/km, run imperial: sec/mile; swim: sec/100m).
 * Same rules as calculateZonesFromTest before zone bands are built.
 */
export function resolveLtAnchorsFromTest(testData) {
  if (!testData || !testData.results || testData.results.length < 3) {
    return null;
  }

  const sport = testData.sport || 'bike';
  const thresholds = calculateThresholds(testData);
  if (!thresholds) return null;

  let lt1_value = thresholds['LTP1'];
  let lt2_value = thresholds['LTP2'];
  let hr1 = thresholds.heartRates?.['LTP1'];
  let hr2 = thresholds.heartRates?.['LTP2'];

  if (sport === 'bike' && lt1_value != null && lt2_value != null && (lt2_value - lt1_value) < MIN_LT2_LT1_GAP_W) {
    const obla35 = thresholds['OBLA 3.5'];
    const iat = thresholds['IAT'];
    if (obla35 != null && obla35 > lt1_value + MIN_LT2_LT1_GAP_W) {
      lt2_value = obla35;
      hr2 = thresholds.heartRates?.['OBLA 3.5'] ?? hr2;
    } else if (iat != null && iat > lt1_value + MIN_LT2_LT1_GAP_W) {
      lt2_value = iat;
      hr2 = thresholds.heartRates?.['IAT'] ?? hr2;
    }
  }
  if (sport === 'run' || sport === 'swim') {
    const gap = lt1_value != null && lt2_value != null ? lt1_value - lt2_value : 0;
    const minGapPace = (lt2_value || 0) * 0.08;
    if (gap < minGapPace && lt1_value != null && lt2_value != null) {
      const obla35 = thresholds['OBLA 3.5'];
      const iat = thresholds['IAT'];
      if (obla35 != null && lt1_value - obla35 >= minGapPace) {
        lt2_value = obla35;
        hr2 = thresholds.heartRates?.['OBLA 3.5'] ?? hr2;
      } else if (iat != null && lt1_value - iat >= minGapPace) {
        lt2_value = iat;
        hr2 = thresholds.heartRates?.['IAT'] ?? hr2;
      }
    }
  }

  if (!lt1_value || !lt2_value) {
    return null;
  }

  if (sport === 'bike') {
    if (lt2_value <= lt1_value) return null;
  } else {
    if (lt2_value >= lt1_value) return null;
  }

  return { lt1_value, lt2_value, sport, hr1, hr2 };
}
