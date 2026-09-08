import { rememberAdminSession, getReturnSession, clearReturnSession } from './impersonation';

const ADMIN = { _id: 'a1', name: 'Jakub', email: 'j@x.cz', role: 'admin', admin: true };

describe('the way back out of a borrowed account', () => {
  beforeEach(() => localStorage.clear());

  it('remembers who to come back as', () => {
    rememberAdminSession('admin-token', ADMIN);
    const back = getReturnSession();
    expect(back.token).toBe('admin-token');
    expect(back.user._id).toBe('a1');
    expect(back.user.name).toBe('Jakub');
  });

  it('keeps only what it needs to log back in', () => {
    // The stash sits in localStorage next to a quota that trainings and
    // calendar caches are already competing for.
    rememberAdminSession('t', { ...ADMIN, trainings: new Array(5000).fill({ x: 1 }) });
    expect(getReturnSession().user.trainings).toBeUndefined();
  });

  it('says nothing when this tab is not impersonating', () => {
    expect(getReturnSession()).toBeNull();
  });

  it('refuses a half-written stash rather than offering a broken way back', () => {
    localStorage.setItem('impersonation_return', JSON.stringify({ token: 'x' }));
    expect(getReturnSession()).toBeNull();
    localStorage.setItem('impersonation_return', 'not json');
    expect(getReturnSession()).toBeNull();
  });

  it('will not stash an incomplete session', () => {
    rememberAdminSession(null, ADMIN);
    expect(getReturnSession()).toBeNull();
    rememberAdminSession('t', null);
    expect(getReturnSession()).toBeNull();
  });

  it('clears', () => {
    rememberAdminSession('admin-token', ADMIN);
    clearReturnSession();
    expect(getReturnSession()).toBeNull();
  });
});
