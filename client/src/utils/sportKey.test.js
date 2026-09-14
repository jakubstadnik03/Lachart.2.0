import { resolveSportKey, gymKind } from './sportKey';

describe('gymKind', () => {
  it('tells weights from yoga, in every provider\'s words and the athlete\'s own', () => {
    expect(gymKind('WeightTraining')).toBe('strength');   // Strava
    expect(gymKind('Workout')).toBe('strength');
    expect(gymKind('strength')).toBe('strength');         // Garmin, as stored
    expect(gymKind('fitness')).toBe('strength');          // Garmin cardio / HIIT
    expect(gymKind('Yoga')).toBe('yoga');                 // Strava
    expect(gymKind('yoga')).toBe('yoga');                 // Garmin, as stored
    expect(gymKind('Pilates')).toBe('yoga');
    expect(gymKind('Jóga')).toBe('yoga');                 // a plan titled in Czech
    expect(gymKind('Mobility')).toBe('yoga');
  });

  it('is null outside the gym', () => {
    expect(gymKind('Ride')).toBeNull();
    expect(gymKind('running')).toBeNull();
    expect(gymKind('')).toBeNull();
    expect(gymKind('Ranní posilovna na vrch těla')).toBeNull(); // a title says nothing unless it says yoga
  });
});

describe('resolveSportKey', () => {
  it('buckets the Garmin gym family the calendar now receives', () => {
    expect(resolveSportKey('strength')).toBe('gym');
    expect(resolveSportKey('yoga')).toBe('gym');
    expect(resolveSportKey('fitness')).toBe('gym');
    expect(resolveSportKey('elliptical')).toBe('elliptical');
    expect(resolveSportKey('skiing')).toBe('ski');
    expect(resolveSportKey('rowing')).toBe('other');
  });
});
