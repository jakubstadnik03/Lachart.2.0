'use strict';

/**
 * Is this user an administrator?
 *
 * LaChart marks administrators with the boolean `admin`, not with a role: the
 * two admin accounts carry `admin: true` alongside `role: 'athlete'`, and no
 * document in the database has ever had `role: 'admin'` (481 athletes, 190
 * coaches, 2 testers). Gates written as `role === 'admin'` therefore refuse
 * everyone, forever — the Strava budget-reset endpoint answered 403 to its
 * only intended callers.
 *
 * Both markers are accepted so that a future `role: 'admin'` account works
 * too, and the role comparison is case-insensitive because the value is
 * user-editable in places.
 *
 * @param {{ admin?: boolean, role?: string } | null | undefined} user
 * @returns {boolean}
 */
function isAdminUser(user) {
  if (!user) return false;
  if (user.admin === true) return true;
  return String(user.role || '').toLowerCase() === 'admin';
}

module.exports = { isAdminUser };
