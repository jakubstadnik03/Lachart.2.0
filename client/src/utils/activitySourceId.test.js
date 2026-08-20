/**
 * Opening "Bike endurance" showed seven laps of dashes: the training shell,
 * not the ride. These are about following the link to the real thing.
 */
import { prefixedSourceId, resolveActivitySource } from './activitySourceId';

describe('resolveActivitySource', () => {
  it('opens the Strava ride a training was built from', () => {
    const t = { _id: 'abc', title: 'Bike endurance', sourceStravaActivityId: 19776176858 };
    expect(resolveActivitySource(t)).toEqual({ kind: 'strava', id: '19776176858', linked: true });
  });

  it('opens the Garmin activity when that is the source', () => {
    const t = { _id: 'abc', sourceGarminActivityId: 'g-999' };
    expect(resolveActivitySource(t).kind).toBe('garmin');
    expect(resolveActivitySource(t).id).toBe('g-999');
  });

  it('opens the FIT file when that is the source', () => {
    expect(resolveActivitySource({ _id: 'abc', sourceFitTrainingId: 'fit-777' }))
      .toEqual({ kind: 'fit', id: '777', linked: true });
  });

  it('prefers Strava when a training somehow links to several', () => {
    // Strava carries streams and a map; it is the richest of the three.
    const t = { sourceStravaActivityId: 1, sourceGarminActivityId: 2, sourceFitTrainingId: 3 };
    expect(resolveActivitySource(t).kind).toBe('strava');
  });

  it('knows an activity that is already the source', () => {
    expect(resolveActivitySource({ stravaId: 12345 })).toEqual({ kind: 'strava', id: '12345', linked: false });
    expect(resolveActivitySource({ type: 'fit', _id: 'f1' })).toEqual({ kind: 'fit', id: 'f1', linked: false });
  });

  it('strips a prefix that is already on the id', () => {
    expect(resolveActivitySource({ stravaId: 'strava-42' }).id).toBe('42');
  });

  it('falls back to the training itself', () => {
    expect(resolveActivitySource({ _id: 'abc' })).toEqual({ kind: 'regular', id: 'abc', linked: false });
    expect(resolveActivitySource({ id: 'regular-abc' })).toEqual({ kind: 'regular', id: 'abc', linked: false });
  });

  it('survives nothing at all', () => {
    expect(resolveActivitySource(null)).toEqual({ kind: 'regular', id: '', linked: false });
  });
});

describe('prefixedSourceId', () => {
  it('builds the id the modal fetches by', () => {
    expect(prefixedSourceId({ sourceStravaActivityId: 19776176858 })).toBe('strava-19776176858');
    expect(prefixedSourceId({ sourceGarminActivityId: 'g1' })).toBe('garmin-g1');
    expect(prefixedSourceId({ _id: 'abc' })).toBe('regular-abc');
  });

  it('is empty when there is no id to build from', () => {
    expect(prefixedSourceId({})).toBe('');
  });
});
