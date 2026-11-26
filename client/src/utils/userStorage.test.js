import { extractUserDataForStorage, saveUserToStorage, carryPremiumState } from './userStorage';

const profile = (o = {}) => ({
  _id: 'u1',
  name: 'Jakub',
  email: 'a@b.c',
  role: 'athlete',
  isPremium: true,
  premiumSource: 'manual',
  premium: true,
  ...o,
});

beforeEach(() => localStorage.clear());

describe('extractUserDataForStorage', () => {
  it('keeps the premium state the profile reported', () => {
    const stored = extractUserDataForStorage(profile());
    expect(stored.isPremium).toBe(true);
    expect(stored.premiumSource).toBe('manual');
    expect(stored.premium).toBe(true);
  });

  it('keeps an explicit free answer as free', () => {
    const stored = extractUserDataForStorage(profile({ isPremium: false, premiumSource: null, premium: false }));
    expect(stored.isPremium).toBe(false);
    expect(stored).not.toHaveProperty('premium');
  });

  it('leaves isPremium out when the source never said', () => {
    const stored = extractUserDataForStorage({ _id: 'u1', email: 'a@b.c' });
    expect(stored).not.toHaveProperty('isPremium');
  });

  it('keeps coached access for athletes whose coach pays', () => {
    const coachedAccess = { active: true, coachName: 'Coach K' };
    const stored = extractUserDataForStorage(profile({ isPremium: false, coachedAccess }));
    expect(stored.coachedAccess).toEqual(coachedAccess);
  });
});

describe('carryPremiumState', () => {
  it('keeps known premium when an update says nothing about it', () => {
    const next = carryPremiumState(profile(), { _id: 'u1', name: 'New name' });
    expect(next.isPremium).toBe(true);
    expect(next.premiumSource).toBe('manual');
    expect(next.name).toBe('New name');
  });

  it('lets the update win when it does say', () => {
    const next = carryPremiumState(profile(), { _id: 'u1', isPremium: false });
    expect(next.isPremium).toBe(false);
  });

  it('never copies premium across accounts', () => {
    const next = carryPremiumState(profile(), { _id: 'u2' });
    expect(next).not.toHaveProperty('isPremium');
  });

  it('matches ObjectId-like ids by string', () => {
    const next = carryPremiumState(profile({ _id: { toString: () => 'abc' } }), { _id: 'abc' });
    expect(next.isPremium).toBe(true);
  });

  it('passes through when nothing is known', () => {
    const update = { _id: 'u1' };
    expect(carryPremiumState(null, update)).toBe(update);
    expect(carryPremiumState({ _id: 'u1' }, update)).toBe(update);
    expect(carryPremiumState(profile(), null)).toBe(null);
  });
});

describe('saveUserToStorage', () => {
  it('does not wipe cached premium when a settings response lacks it', () => {
    saveUserToStorage(profile());
    saveUserToStorage({ _id: 'u1', name: 'Renamed', units: { distance: 'metric' } });
    const cached = JSON.parse(localStorage.getItem('user'));
    expect(cached.name).toBe('Renamed');
    expect(cached.isPremium).toBe(true);
  });

  it('stores a downgrade when the profile reports one', () => {
    saveUserToStorage(profile());
    saveUserToStorage(profile({ isPremium: false, premiumSource: null, premium: false }));
    expect(JSON.parse(localStorage.getItem('user')).isPremium).toBe(false);
  });

  it('does not carry premium into a different account', () => {
    saveUserToStorage(profile());
    saveUserToStorage({ _id: 'u2', email: 'x@y.z' });
    expect(JSON.parse(localStorage.getItem('user'))).not.toHaveProperty('isPremium');
  });
});
