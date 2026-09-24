// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';
import { ltZoneBounds, zonesFromBounds, measuredMaxHr, TOP_FACTOR } from '../../utils/trainingZoneBounds';

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

  // The measured maximum raises the top of Z5 but no longer caps it — a test
  // stopped two beats above LT2 used to leave zone five two beats wide. See
  // TOP_FACTOR in utils/trainingZoneBounds.
  const heartRateZones = hasHR
    ? zonesFromBounds(ltZoneBounds({
        lt1: hr1, lt2: hr2, ascending: true,
        topFactor: TOP_FACTOR.heartRate, top: measuredMaxHr(testData),
      }))
    : null;

  if (sport === 'bike') {
    return {
      power: zonesFromBounds(ltZoneBounds({
        lt1: lt1_value, lt2: lt2_value, ascending: true, topFactor: TOP_FACTOR.power,
      })),
      heartRate: heartRateZones,
    };
  }

  // Run/Swim – pace v sekundách (vyšší sec = pomalejší), takže hranice klesají.
  // Strop Z5 je nyní sdílený s profilem — viz TOP_FACTOR.
  const paceBounds = ltZoneBounds({
    lt1: lt1_value, lt2: lt2_value, ascending: false, topFactor: TOP_FACTOR.pace,
  });
  const paceZones = paceBounds ? zonesFromBounds(paceBounds) : null;
  return {
    pace: paceZones && Object.fromEntries(
      Object.entries(paceZones).map(([key, z]) => [key, { min: formatPace(z.min), max: formatPace(z.max) }])
    ),
    heartRate: heartRateZones,
  };
};
