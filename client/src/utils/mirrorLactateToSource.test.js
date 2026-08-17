/**
 * Lactate has to land on the activity it was measured against, whichever
 * provider that came from. Three pages used to do this by hand for Strava
 * only, which is why a reading typed on a Garmin ride saved to the training
 * and then wasn't in the calendar.
 */

import { mirrorLactateToSource } from './mirrorLactateToSource';
import { updateGarminLactateValues, updateStravaLactateValues } from '../services/api';

jest.mock('../services/api', () => ({
  updateStravaLactateValues: jest.fn().mockResolvedValue({ success: true }),
  updateGarminLactateValues: jest.fn().mockResolvedValue({ success: true }),
}));

const results = [
  { interval: 1, power: 280 },
  { interval: 2, power: 300, lactate: 1.9 },
  { interval: 3, power: 320, lactate: 3.4 },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mirrorLactateToSource', () => {
  it('sends readings to Strava when the training came from a ride there', async () => {
    const out = await mirrorLactateToSource({ sourceStravaActivityId: '19124087286' }, results);
    expect(updateStravaLactateValues).toHaveBeenCalledWith('19124087286', [
      { lapIndex: 1, lactate: 1.9 },
      { lapIndex: 2, lactate: 3.4 },
    ]);
    expect(updateGarminLactateValues).not.toHaveBeenCalled();
    expect(out).toEqual({ mirrored: 'strava', count: 2 });
  });

  it('sends them to Garmin when that is where the ride came from', async () => {
    const out = await mirrorLactateToSource({ sourceGarminActivityId: '20240817001' }, results);
    expect(updateGarminLactateValues).toHaveBeenCalledWith('20240817001', [
      { lapIndex: 1, lactate: 1.9 },
      { lapIndex: 2, lactate: 3.4 },
    ]);
    expect(updateStravaLactateValues).not.toHaveBeenCalled();
    expect(out).toEqual({ mirrored: 'garmin', count: 2 });
  });

  it('recognises a raw Garmin activity that has no link stamped yet', async () => {
    await mirrorLactateToSource({ source: 'garmin', garminId: '555' }, results);
    expect(updateGarminLactateValues).toHaveBeenCalledWith('555', expect.any(Array));
  });

  it('prefers an explicit lap index over the interval number', async () => {
    await mirrorLactateToSource({ sourceStravaActivityId: '1' }, [
      { interval: 1, sourceLapIndex: 7, lactate: 2.2 },
    ]);
    expect(updateStravaLactateValues).toHaveBeenCalledWith('1', [{ lapIndex: 7, lactate: 2.2 }]);
  });

  it('does nothing when no reading was entered', async () => {
    const out = await mirrorLactateToSource({ sourceStravaActivityId: '1' }, [{ interval: 1, power: 250 }]);
    expect(updateStravaLactateValues).not.toHaveBeenCalled();
    expect(out).toEqual({ mirrored: null, count: 0 });
  });

  it('does nothing for a training with no source activity', async () => {
    const out = await mirrorLactateToSource({ title: 'Manual entry' }, results);
    expect(updateStravaLactateValues).not.toHaveBeenCalled();
    expect(updateGarminLactateValues).not.toHaveBeenCalled();
    expect(out).toEqual({ mirrored: null, count: 0 });
  });

  it('never throws — the training is already saved by this point', async () => {
    updateStravaLactateValues.mockRejectedValueOnce(new Error('429 Too Many Requests'));
    await expect(mirrorLactateToSource({ sourceStravaActivityId: '1' }, results))
      .resolves.toEqual({ mirrored: null, count: 0 });
  });

  it('tolerates junk input', async () => {
    await expect(mirrorLactateToSource(null, results)).resolves.toEqual({ mirrored: null, count: 0 });
    await expect(mirrorLactateToSource({ sourceStravaActivityId: '1' }, null))
      .resolves.toEqual({ mirrored: null, count: 0 });
  });
});
