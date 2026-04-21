/**
 * Client-side premium gate. Currently all features are free for all users.
 */
export function userHasPremiumAccess(user) {
  // All features are currently free — always grant access for logged-in users.
  if (!user) return false;
  return true;
}
