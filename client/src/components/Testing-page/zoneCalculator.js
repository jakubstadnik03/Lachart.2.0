// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';
import {
  ltZoneBounds, zonesFromBounds, measuredMaxHr, TOP_FACTOR, heartRateZoneBoundsFromTest,
} from '../../utils/trainingZoneBounds';

export { resolveLtAnchorsFromTest };

const formatPace = (seconds) => {
  if (!seconds || seconds === 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * HR zones for a test. Read off the test's own HR curve at the power/pace
 * zone edges whenever the engine supplied one (see heartRateZoneBoundsFromTest
 * for why the percentage version gave one-beat zones); the percentage version
 * is kept only for the legacy pipeline, which has no curve.
 *
 * @returns {{ zones: object|null, note: string|null }}
 */
export const heartRateZonesForTest = ({ anchors, intensityBounds, testData }) => {
  const { lt1_value, lt2_value, sport, hr1, hr2, hrCurve } = anchors;
  const top = measuredMaxHr(testData);
  const fromCurve = hrCurve && intensityBounds
    ? heartRateZoneBoundsFromTest({ intensityBounds, lt1: lt1_value, lt2: lt2_value, sport, hrCurve, top })
    : null;
  if (fromCurve) return { zones: zonesFromBounds(fromCurve.bounds), note: fromCurve.note };
  const hasHR = hr1 != null && hr2 != null && !Number.isNaN(Number(hr1)) && !Number.isNaN(Number(hr2));
  return {
    zones: hasHR
      ? zonesFromBounds(ltZoneBounds({ lt1: hr1, lt2: hr2, ascending: true, topFactor: TOP_FACTOR.heartRate, top }))
      : null,
    note: null,
  };
};

export const calculateZonesFromTest = (testData) => {
  const anchors = resolveLtAnchorsFromTest(testData);
  if (!anchors) return null;

  const { lt1_value, lt2_value, sport } = anchors;

  if (sport === 'bike') {
    const powerBounds = ltZoneBounds({
      lt1: lt1_value, lt2: lt2_value, ascending: true, topFactor: TOP_FACTOR.power,
    });
    const hr = heartRateZonesForTest({
      anchors, testData,
      intensityBounds: ltZoneBounds({ lt1: lt1_value, lt2: lt2_value, ascending: true, topFactor: TOP_FACTOR.power, round: false }),
    });
    return {
      power: zonesFromBounds(powerBounds),
      heartRate: hr.zones,
      heartRateNote: hr.note,
    };
  }

  // Run/Swim – pace v sekundách (vyšší sec = pomalejší), takže hranice klesají.
  // Strop Z5 je nyní sdílený s profilem — viz TOP_FACTOR.
  const paceBounds = ltZoneBounds({
    lt1: lt1_value, lt2: lt2_value, ascending: false, topFactor: TOP_FACTOR.pace,
  });
  const paceZones = paceBounds ? zonesFromBounds(paceBounds) : null;
  const hr = heartRateZonesForTest({
    anchors, testData,
    intensityBounds: ltZoneBounds({ lt1: lt1_value, lt2: lt2_value, ascending: false, topFactor: TOP_FACTOR.pace, round: false }),
  });
  return {
    pace: paceZones && Object.fromEntries(
      Object.entries(paceZones).map(([key, z]) => [key, { min: formatPace(z.min), max: formatPace(z.max) }])
    ),
    heartRate: hr.zones,
    heartRateNote: hr.note,
  };
};
