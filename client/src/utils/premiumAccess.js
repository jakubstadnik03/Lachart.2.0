/**
 * Client-side premium gate. Prefer `user.isPremium` from GET /user/profile (combines manual + subscription).
 */
export function userHasPremiumAccess(user) {
  if (!user) return false;
  if (user.isPremium === true) return true;
  if (user.premium === true) return true;
  return false;
}
