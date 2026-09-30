/**
 * The pace side of the zone breakdown, which used to read a run backwards.
 *
 * An hour at 4:23/km under a 3:20/km threshold came out as 52% zone five and
 * no zone two at all — the athlete had been nowhere near zone five. The bands
 * were being walked from the fast end and the resulting index mirrored, so an
 * easy run landed in the hardest zone it was faster than a band of.
 */

import { ltZones } from '../../utils/trainingZoneBounds';
import { readUserZones, zoneIndex } from './TimeInZonesBar';

// LT1 4:00/km, LT2 3:20/km — the zones the app itself would generate.
const RUN_PACE_ZONES = ltZones({
  lt1: 240, lt2: 200, ascending: false, floorFactor: 0.5, topFactor: 1.3,
});
const USER = { powerZones: { running: { lt1: 240, lt2: 200, ...RUN_PACE_ZONES } } };

const zoneOf = (paceSec) => zoneIndex(paceSec, readUserZones(USER, 'Run', 'pace'), true) + 1;

describe('pace zones', () => {
  it('generates a table that descends in seconds per km', () => {
    // Z1 holds the slowest running, Z5 the fastest.
    expect(RUN_PACE_ZONES.zone1.min).toBeGreaterThan(RUN_PACE_ZONES.zone5.max);
  });

  it('puts an easy run in the easy zones', () => {
    expect(zoneOf(330)).toBe(1); // 5:30/km — jogging
    expect(zoneOf(263)).toBe(2); // 4:23/km — the run that reported zone five
    expect(zoneOf(250)).toBe(2); // 4:10/km
  });

  it('puts threshold work at threshold', () => {
    expect(zoneOf(230)).toBe(3); // 3:50/km — between LT1 and LT2
    expect(zoneOf(205)).toBe(3); // 3:25/km — still slower than LT2
    expect(zoneOf(196)).toBe(4); // 3:16/km — the narrow band just past LT2
  });

  it('keeps zone five for pace faster than threshold', () => {
    expect(zoneOf(185)).toBe(5); // 3:05/km
    expect(zoneOf(150)).toBe(5); // 2:30/km — a sprint, still the top zone
  });

  it('reads a table typed the other way round the same', () => {
    const typed = {
      powerZones: {
        running: {
          zone1: { min: 330, max: 420 },
          zone2: { min: 285, max: 330 },
          zone3: { min: 255, max: 285 },
          zone4: { min: 225, max: 255 },
          zone5: { min: 170, max: 225 },
        },
      },
    };
    const bands = readUserZones(typed, 'Run', 'pace');
    expect(zoneIndex(400, bands, true)).toBe(0);
    expect(zoneIndex(300, bands, true)).toBe(1);
    expect(zoneIndex(270, bands, true)).toBe(2);
    expect(zoneIndex(240, bands, true)).toBe(3);
    expect(zoneIndex(180, bands, true)).toBe(4);
  });
});

describe('power and heart-rate zones still read upwards', () => {
  const BIKE = {
    powerZones: {
      cycling: {
        zone1: { min: 0, max: 160 },
        zone2: { min: 160, max: 220 },
        zone3: { min: 220, max: 260 },
        zone4: { min: 260, max: 300 },
        zone5: { min: 300, max: 450 },
      },
    },
  };

  it('places watts in the band they fall in', () => {
    const bands = readUserZones(BIKE, 'Ride', 'power');
    expect(zoneIndex(100, bands, false)).toBe(0);
    expect(zoneIndex(200, bands, false)).toBe(1);
    expect(zoneIndex(240, bands, false)).toBe(2);
    expect(zoneIndex(280, bands, false)).toBe(3);
    expect(zoneIndex(600, bands, false)).toBe(4);
  });
});
