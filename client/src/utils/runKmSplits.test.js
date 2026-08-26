import { buildRunKmSplits, synthesizeKmLapsFromRecords } from './runKmSplits';

/**
 * A 190 spm run was displayed as 380. Strava reports running cadence as
 * strides/min (one foot), so it gets doubled to steps/min — but the detail
 * fetch already does that to every stream sample, and the splits builder did
 * it again to the laps it synthesizes from those samples.
 */

/** One km of records at a steady pace, cadence already in display spm. */
function kmOfRecords(startMeters, kmIndex, spm) {
  const recs = [];
  for (let i = 0; i <= 300; i += 1) {
    recs.push({
      distance: startMeters + (i / 300) * 1000,
      timeFromStart: kmIndex * 300 + i,
      speed: 1000 / 300,
      cadence: spm,
      heartRate: 150,
      altitude: 100,
    });
  }
  return recs;
}

const records = [...kmOfRecords(0, 0, 190), ...kmOfRecords(1000, 1, 190), ...kmOfRecords(2000, 2, 190)];

describe('cadence on synthesized km splits', () => {
  test('a 190 spm run reads 190, not 380', () => {
    const splits = buildRunKmSplits([], records, { lapTimeSource: 'strava' });
    expect(splits.length).toBeGreaterThan(0);
    splits.forEach((s) => expect(s.cadence).toBe(190));
  });

  test('the same for a FIT source, which never needed converting', () => {
    const splits = buildRunKmSplits([], records, { lapTimeSource: 'fit' });
    expect(splits.length).toBeGreaterThan(0);
    splits.forEach((s) => expect(s.cadence).toBe(190));
  });

  test('synthesized laps declare that their cadence is already display units', () => {
    const laps = synthesizeKmLapsFromRecords(records);
    expect(laps.length).toBeGreaterThan(0);
    laps.forEach((l) => expect(l._cadenceIsDisplayUnit).toBe(true));
  });

  test('device laps from Strava are still converted — those are strides/min', () => {
    const deviceLaps = [
      { lapNumber: 1, distance: 1000, moving_time: 300, elapsed_time: 300, average_speed: 3.33, average_cadence: 95 },
      { lapNumber: 2, distance: 1000, moving_time: 300, elapsed_time: 300, average_speed: 3.33, average_cadence: 95 },
    ];
    const splits = buildRunKmSplits(deviceLaps, [], { lapTimeSource: 'strava' });
    expect(splits.length).toBe(2);
    splits.forEach((s) => expect(s.cadence).toBe(190));
  });

  test('device laps from a FIT file are left as they are', () => {
    const deviceLaps = [
      { lapNumber: 1, distance: 1000, moving_time: 300, elapsed_time: 300, average_speed: 3.33, avgCadence: 190 },
      { lapNumber: 2, distance: 1000, moving_time: 300, elapsed_time: 300, average_speed: 3.33, avgCadence: 190 },
    ];
    const splits = buildRunKmSplits(deviceLaps, [], { lapTimeSource: 'fit' });
    expect(splits.length).toBe(2);
    splits.forEach((s) => expect(s.cadence).toBe(190));
  });

  test('a run without cadence reports none rather than zero', () => {
    const noCad = records.map(({ cadence, ...r }) => r);
    const splits = buildRunKmSplits([], noCad, { lapTimeSource: 'strava' });
    splits.forEach((s) => expect(s.cadence).toBeNull());
  });
});
