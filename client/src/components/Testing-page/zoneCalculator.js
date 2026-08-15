// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';
import { ltZoneBounds, zonesFromBounds, measuredMaxHr } from '../../utils/trainingZoneBounds';

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

  // Z5 stops at the heart rate the athlete actually reached; without one we
  // fall back to 1.10x LT2 HR rather than the old 1.30x, which drew Z5 to
  // 217 bpm on a test whose measured maximum was 183.
  const heartRateZones = hasHR
    ? zonesFromBounds(ltZoneBounds({
        lt1: hr1, lt2: hr2, ascending: true, top: measuredMaxHr(testData),
      }))
    : null;

  if (sport === 'bike') {
    return {
      power: zonesFromBounds(ltZoneBounds({
        lt1: lt1_value, lt2: lt2_value, ascending: true,
      })),
      heartRate: heartRateZones,
    };
  }

  // Run/Swim – pace v sekundách (vyšší sec = pomalejší), takže hranice klesají.
  // Rychlý okraj Z5: užší fialový pás (dřív 1.30 → 1.16 → 1.10).
  const paceBounds = ltZoneBounds({
    lt1: lt1_value, lt2: lt2_value, ascending: false,
  });
  const paceZones = paceBounds ? zonesFromBounds(paceBounds) : null;
  return {
    pace: paceZones && Object.fromEntries(
      Object.entries(paceZones).map(([key, z]) => [key, { min: formatPace(z.min), max: formatPace(z.max) }])
    ),
    heartRate: heartRateZones,
  };
};
