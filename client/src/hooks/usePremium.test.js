/**
 * premiumResolved must only be true once the user object actually says
 * whether it is premium. A user restored from an old localStorage cache has
 * no isPremium field; treating that as "resolved free" put "Upgrade to Pro"
 * walls in front of paying users whenever /user/profile was slow or failed.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockAuth = { user: null };
jest.mock('../context/AuthProvider', () => ({ useAuth: () => mockAuth }));

// eslint-disable-next-line import/first
import { usePremium } from './usePremium';

const read = (user) => {
  mockAuth.user = user;
  let out;
  const Probe = () => {
    out = usePremium();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return out;
};

describe('usePremium', () => {
  it('is unresolved with no user', () => {
    expect(read(null).premiumResolved).toBe(false);
  });

  it('is unresolved for a cached user that never recorded premium', () => {
    const p = read({ _id: 'u1', role: 'athlete' });
    expect(p.premiumResolved).toBe(false);
    expect(p.isPremium).toBe(false);
  });

  it('is resolved premium for a cached paying user', () => {
    const p = read({ _id: 'u1', isPremium: true });
    expect(p.premiumResolved).toBe(true);
    expect(p.isPremium).toBe(true);
    expect(p.canViewAnalytics).toBe(true);
  });

  it('is resolved free when the server said free', () => {
    const p = read({ _id: 'u1', isPremium: false });
    expect(p.premiumResolved).toBe(true);
    expect(p.isPremium).toBe(false);
  });

  it('opens analytics for a coached athlete', () => {
    const p = read({ _id: 'u1', isPremium: false, coachedAccess: { active: true, coachName: 'K' } });
    expect(p.canViewAnalytics).toBe(true);
    expect(p.coachedBy).toBe('K');
  });
});
