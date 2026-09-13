/**
 * Which plan the paywall offers.
 *
 * A coach who hit a locked feature was shown "LaChart Athlete — €6.99",
 * because every gate in the app asks for the athlete tier by default. The
 * plan a coach needs is the Coach plan.
 */
import { planForUser } from './planForUser';

describe('planForUser', () => {
  it('offers a coach the Coach plan when the gate asked for Athlete', () => {
    expect(planForUser('pro', { role: 'coach' })).toBe('coach');
    expect(planForUser('pro', { role: 'Coach' })).toBe('coach');
    expect(planForUser('pro', { role: 'tester' })).toBe('coach');
  });

  it('leaves an athlete on the Athlete plan', () => {
    expect(planForUser('pro', { role: 'athlete' })).toBe('pro');
    expect(planForUser('pro', null)).toBe('pro');
  });

  it('never downgrades an explicit Coach ask', () => {
    expect(planForUser('coach', { role: 'athlete' })).toBe('coach');
  });
});
