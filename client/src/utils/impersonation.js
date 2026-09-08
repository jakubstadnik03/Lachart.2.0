/**
 * Impersonation — "login as user", with a way back.
 *
 * Logging in as an athlete replaces the admin's own session, because a browser
 * tab has one identity and localStorage is shared across all of them. So this
 * does not try to hold two sessions at once. It remembers the admin's token
 * before handing the tab over, and hands it back on request.
 *
 * The stash is deliberately small and separate from the auth keys: the login
 * flow wipes `token`, `authToken` and `user` on every login, and this has to
 * survive exactly that wipe.
 */

const KEY = 'impersonation_return';

/** Remember who to come back as, before the tab becomes someone else. */
export function rememberAdminSession(token, user) {
  if (!token || !user) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        admin: user.admin,
      },
      at: Date.now(),
    }));
  } catch {
    // A full quota is not a reason to block the impersonation itself; the
    // admin can log back in by hand.
  }
}

/** The admin session to return to, or null when this tab is not impersonating. */
export function getReturnSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?._id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReturnSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
