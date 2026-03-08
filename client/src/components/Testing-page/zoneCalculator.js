// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { calculateThresholds } from './DataTable';

const formatPace = (seconds) => {
  if (!seconds || seconds === 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/** Minimální rozumný odstup LT2 od LT1 pro generování zón (W nebo % pro pace) */
const MIN_LT2_LT1_GAP_W = 20;

export const calculateZonesFromTest = (testData) => {
  if (!testData || !testData.results || testData.results.length < 3) {
    return null;
  }

  const sport = testData.sport || 'bike';
  const thresholds = calculateThresholds(testData);

  let lt1_value = thresholds['LTP1'];
  let lt2_value = thresholds['LTP2'];
  let hr1 = thresholds.heartRates?.['LTP1'];
  let hr2 = thresholds.heartRates?.['LTP2'];

  // Pokud jsou LTP1 a LTP2 příliš blízko, použít pro LT2 rozumnější odhad (OBLA 3.5 / IAT)
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
    const gap = lt1_value != null && lt2_value != null ? lt1_value - lt2_value : 0; // pace: LT1 > LT2
    const minGapPace = (lt2_value || 0) * 0.08; // min ~8% rozdíl v tempu
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

  const hasHR = hr1 != null && hr2 != null && !Number.isNaN(Number(hr1)) && !Number.isNaN(Number(hr2));

  if (!lt1_value || !lt2_value) {
    return null;
  }

  // Validation: bike LTP2 > LTP1 (vyšší výkon), run/swim LTP2 < LTP1 (nižší tempo v sec = rychlejší)
  if (sport === 'bike') {
    if (lt2_value <= lt1_value) return null;
  } else {
    if (lt2_value >= lt1_value) return null;
  }
  
  const heartRateZones = hasHR ? {
    zone1: { min: Math.round(hr1 * 0.70), max: Math.round(hr1 * 0.90) },
    zone2: { min: Math.round(hr1 * 0.90), max: Math.round(hr1 * 1.00) },
    zone3: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 0.95) },
    zone4: { min: Math.round(hr2 * 0.96), max: Math.round(hr2 * 1.04) },
    zone5: { min: Math.round(hr2 * 1.05), max: Math.round(hr2 * 1.20) },
  } : null;
  
  if (sport === 'bike') {
    const lt1_watts = lt1_value;
    const lt2_watts = lt2_value;
    return {
      power: {
        zone1: { min: Math.round(lt1_watts * 0.70), max: Math.round(lt1_watts * 0.90) },
        zone2: { min: Math.round(lt1_watts * 0.90), max: Math.round(lt1_watts * 1.00) },
        zone3: { min: Math.round(lt1_watts * 1.00), max: Math.round(lt2_watts * 0.95) },
        zone4: { min: Math.round(lt2_watts * 0.96), max: Math.round(lt2_watts * 1.04) },
        zone5: { min: Math.round(lt2_watts * 1.05), max: Math.round(lt2_watts * 1.20) },
      },
      heartRate: heartRateZones
    };
  }
  
  // Run/Swim – pace v sekundách (vyšší sec = pomalejší)
  const lt1_sec = lt1_value;
  const lt2_sec = lt2_value;
  const fmt = (s) => formatPace(s);
  return {
    pace: {
      zone1: { min: fmt(lt1_sec / 0.70), max: fmt(lt1_sec / 0.90) },
      zone2: { min: fmt(lt1_sec / 0.90), max: fmt(lt1_sec / 1.00) },
      zone3: { min: fmt(lt1_sec / 1.00), max: fmt(lt2_sec / 0.95) },
      zone4: { min: fmt(lt2_sec / 0.96), max: fmt(lt2_sec / 1.04) },
      zone5: { min: fmt(lt2_sec / 1.05), max: fmt(lt2_sec / 1.20) },
    },
    heartRate: heartRateZones
  };
};


