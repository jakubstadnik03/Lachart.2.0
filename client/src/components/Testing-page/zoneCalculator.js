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

  // Z3 is the band between the two thresholds, so it ends AT LT2 — not at 95%
  // of it. Taking a percentage off LT2 assumed the thresholds sit far apart;
  // for an athlete whose LT1 and LT2 are close (149 and 152 bpm on a real
  // test) the haircut landed the top of Z3 *below* its own bottom, printing
  // "149–144", and Z4 then opened at 146, under a zone that had started at
  // 149. LT1 and LT2 are the measured values here — the percentages around
  // them were invented, so the anchors win.
  const heartRateZones = hasHR ? {
    zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 0.90) },
    zone2: { min: Math.round(hr1 * 0.90), max: Math.round(hr1) },
    zone3: { min: Math.round(hr1), max: Math.round(Math.max(hr2, hr1)) },
    zone4: { min: Math.round(Math.max(hr2, hr1)), max: Math.round(hr2 * 1.04) },
    // Opens where Z4 closes: 1.05 left a band belonging to no zone at all.
    zone5: { min: Math.round(hr2 * 1.04), max: Math.round(hr2 * 1.30) },
  } : null;
  
  if (sport === 'bike') {
    const lt1_watts = lt1_value;
    const lt2_watts = lt2_value;
    return {
      power: {
        // Same as the heart-rate zones above: Z3 spans LT1 to LT2, so it ends
        // at the measured LT2 rather than 95% of it.
        zone1: { min: Math.round(lt1_watts * 0.50), max: Math.round(lt1_watts * 0.90) },
        zone2: { min: Math.round(lt1_watts * 0.90), max: Math.round(lt1_watts) },
        zone3: { min: Math.round(lt1_watts), max: Math.round(Math.max(lt2_watts, lt1_watts)) },
        zone4: { min: Math.round(Math.max(lt2_watts, lt1_watts)), max: Math.round(lt2_watts * 1.04) },
        zone5: { min: Math.round(lt2_watts * 1.04), max: Math.round(lt2_watts * 1.30) },
      },
      heartRate: heartRateZones
    };
  }
  
  // Run/Swim – pace v sekundách (vyšší sec = pomalejší)
  const lt1_sec = lt1_value;
  const lt2_sec = lt2_value;
  const fmt = (s) => formatPace(s);
  // Pace runs the other way — fewer seconds is faster — so the fast edge of Z3
  // is the smaller of the two anchors. Same fix as the heart-rate zones: Z3
  // ends at LT2 itself. With LT1 5:40 and LT2 5:29 the old 0.95 haircut printed
  // Z3 as "5:40–5:46", a band that got slower as it went up.
  const lt2_fast = Math.min(lt2_sec, lt1_sec);
  return {
    pace: {
      zone1: { min: fmt(lt1_sec / 0.50), max: fmt(lt1_sec / 0.90) },
      zone2: { min: fmt(lt1_sec / 0.90), max: fmt(lt1_sec) },
      zone3: { min: fmt(lt1_sec), max: fmt(lt2_fast) },
      zone4: { min: fmt(lt2_fast), max: fmt(lt2_sec / 1.04) },
      // Rychlý okraj Z5: užší fialový pás (dřív 1.30 → 1.16 → 1.10)
      zone5: { min: fmt(lt2_sec / 1.04), max: fmt(lt2_sec / 1.10) },
    },
    heartRate: heartRateZones
  };
};


