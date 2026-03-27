/**
 * Resolve how the account was created for API responses.
 * New users have `signupMethod` set in DB; older users are inferred from oauth/password when possible.
 */
function resolveSignupMethodForProfile(user) {
  if (user?.signupMethod) {
    return { method: user.signupMethod, source: 'stored' };
  }
  if (user?.googleId) {
    return { method: 'google', source: 'inferred' };
  }
  if (user?.facebookId) {
    return { method: 'facebook', source: 'inferred' };
  }
  if (user?.password) {
    return { method: 'email', source: 'inferred' };
  }
  return { method: 'unknown', source: 'unknown' };
}

/** Strip IP from registration location for client JSON (country/city/timezone only). */
function publicRegistrationLocation(user) {
  const loc = user?.registrationLocation;
  if (!loc || typeof loc !== 'object') return null;
  const hasAny =
    loc.country ||
    loc.city ||
    loc.region ||
    loc.timezone ||
    loc.resolvedAt;
  if (!hasAny) return null;
  return {
    country: loc.country || null,
    city: loc.city || null,
    region: loc.region || null,
    timezone: loc.timezone || null,
    resolvedAt: loc.resolvedAt || null
  };
}

module.exports = { resolveSignupMethodForProfile, publicRegistrationLocation };
