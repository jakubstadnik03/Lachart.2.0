/**
 * Can a refresh actually get past the planned-workout caches?
 *
 * The regression: pull-to-refresh on the native dashboard appeared to do
 * nothing. Three caches sit in front of this list — this module's 60 s map, its
 * in-flight promise, and axios's own entry — and the refresh path went through
 * all of them, so the one gesture people reach for when their plans are missing
 * handed back the same missing plans for up to a minute.
 */

jest.mock('./api', () => {
  const get = jest.fn(() => Promise.resolve({ data: [] }));
  return { __esModule: true, default: { get }, clearGetCacheMatching: jest.fn() };
});

import api from './api';
import { getPlannedWorkouts } from './workoutPlannerApi';

beforeEach(() => {
  api.get.mockClear();
  api.get.mockImplementation(() => Promise.resolve({ data: [{ _id: 'fresh' }] }));
});

describe('getPlannedWorkouts', () => {
  it('serves a repeat call from cache', async () => {
    await getPlannedWorkouts({ athleteId: 'a1' });
    await getPlannedWorkouts({ athleteId: 'a1' });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('goes to the network when forced, however warm the cache is', async () => {
    await getPlannedWorkouts({ athleteId: 'a2' });
    api.get.mockClear();
    await getPlannedWorkouts({ athleteId: 'a2' }, { force: true });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('tells the api layer not to answer from its own cache either', async () => {
    await getPlannedWorkouts({ athleteId: 'a3' }, { force: true });
    const [, config] = api.get.mock.calls[0];
    expect(config.noCache).toBe(true);
    // The 15 s axios entry must not come along for the ride — it would defeat
    // noCache's purpose on the very next forced call.
    expect(config.cacheTtlMs).toBeUndefined();
  });

  it('leaves a fresh result behind for the unforced callers', async () => {
    await getPlannedWorkouts({ athleteId: 'a4' }, { force: true });
    api.get.mockClear();
    const second = await getPlannedWorkouts({ athleteId: 'a4' });
    expect(api.get).not.toHaveBeenCalled();
    expect(second).toEqual([{ _id: 'fresh' }]);
  });
});
