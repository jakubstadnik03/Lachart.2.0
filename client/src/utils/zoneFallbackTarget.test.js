/**
 * Turning "Z2" into a pace when the athlete has no zone table of their own.
 *
 * This was a hardcoded array in four files, written against the zone shape as
 * it stood years ago and never moved when the shape did. It put Z2 at LT1
 * exactly, so a session planned as an endurance run exported to a watch with
 * the aerobic threshold as its target — a harder session than the one that was
 * written, not a rounding difference.
 */
import { zoneTargetFromThresholds, ltZones, TOP_FACTOR } from './trainingZoneBounds';

// LT1 3:58/km, LT2 3:20/km.
const RUN = { lt1: 238, lt2: 200, ascending: false, topFactor: TOP_FACTOR.pace };

describe('the fallback target for a zone', () => {
  it('lands inside the zone it names', () => {
    const table = ltZones(RUN);
    for (let z = 1; z <= 5; z += 1) {
      const target = zoneTargetFromThresholds(z, RUN);
      const { min, max } = table[`zone${z}`];
      expect(target).toBeLessThanOrEqual(Math.max(min, max));
      expect(target).toBeGreaterThanOrEqual(Math.min(min, max));
    }
  });

  it('no longer prescribes the aerobic threshold for an endurance run', () => {
    // The old array returned lt1p for Z2 — 3:58/km. Z2 sits well easier.
    expect(zoneTargetFromThresholds(2, RUN)).toBeGreaterThan(238 + 20);
  });

  it('puts a threshold session at the threshold', () => {
    expect(Math.round(zoneTargetFromThresholds(4, RUN))).toBe(200);
  });

  it('gets harder as the zone number rises', () => {
    const paces = [1, 2, 3, 4, 5].map((z) => zoneTargetFromThresholds(z, RUN));
    for (let i = 1; i < paces.length; i += 1) expect(paces[i]).toBeLessThan(paces[i - 1]);
  });

  it('works the other way up for watts', () => {
    const BIKE = { lt1: 190, lt2: 250, ascending: true, topFactor: TOP_FACTOR.power };
    const watts = [1, 2, 3, 4, 5].map((z) => zoneTargetFromThresholds(z, BIKE));
    for (let i = 1; i < watts.length; i += 1) expect(watts[i]).toBeGreaterThan(watts[i - 1]);
    expect(Math.round(zoneTargetFromThresholds(4, BIKE))).toBe(250);
  });

  it('says nothing when the thresholds are unusable', () => {
    expect(zoneTargetFromThresholds(2, { lt1: 0, lt2: 0, ascending: false })).toBeNull();
  });
});
