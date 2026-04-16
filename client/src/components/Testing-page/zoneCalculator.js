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

export const calculateZonesFromTest = (testData) => {
  const anchors = resolveLtAnchorsFromTest(testData);
  if (!anchors) return null;

  const { lt1_value, lt2_value, sport, hr1, hr2 } = anchors;
  const hasHR = hr1 != null && hr2 != null && !Number.isNaN(Number(hr1)) && !Number.isNaN(Number(hr2));

  const heartRateZones = hasHR ? {
    zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 0.90) },
    zone2: { min: Math.round(hr1 * 0.90), max: Math.round(hr1 * 1.00) },
    zone3: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 0.95) },
    zone4: { min: Math.round(hr2 * 0.96), max: Math.round(hr2 * 1.04) },
    zone5: { min: Math.round(hr2 * 1.05), max: Math.round(hr2 * 1.30) },
  } : null;
  
  if (sport === 'bike') {
    const lt1_watts = lt1_value;
    const lt2_watts = lt2_value;
    return {
      power: {
        zone1: { min: Math.round(lt1_watts * 0.50), max: Math.round(lt1_watts * 0.90) },
        zone2: { min: Math.round(lt1_watts * 0.90), max: Math.round(lt1_watts * 1.00) },
        zone3: { min: Math.round(lt1_watts * 1.00), max: Math.round(lt2_watts * 0.95) },
        zone4: { min: Math.round(lt2_watts * 0.96), max: Math.round(lt2_watts * 1.04) },
        zone5: { min: Math.round(lt2_watts * 1.05), max: Math.round(lt2_watts * 1.30) },
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
      zone1: { min: fmt(lt1_sec / 0.50), max: fmt(lt1_sec / 0.90) },
      zone2: { min: fmt(lt1_sec / 0.90), max: fmt(lt1_sec / 1.00) },
      zone3: { min: fmt(lt1_sec / 1.00), max: fmt(lt2_sec / 0.95) },
      zone4: { min: fmt(lt2_sec / 0.96), max: fmt(lt2_sec / 1.04) },
      // Rychlý okraj Z5: užší fialový pás (dřív 1.30 → 1.16 → 1.10)
      zone5: { min: fmt(lt2_sec / 1.05), max: fmt(lt2_sec / 1.10) },
    },
    heartRate: heartRateZones
  };
};


