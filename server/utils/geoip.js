const axios = require('axios');

/**
 * Extract the real client IP from an Express request,
 * handling proxies (Render, Cloudflare, etc.).
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be comma-separated; first entry is the real client
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

/**
 * Resolve an IPv4/IPv6 address to a geographic location using ip-api.com (free, no key needed).
 * Returns null on failure. Timeout is kept short to never block the caller for long.
 */
async function resolveIpLocation(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return null;
  }

  try {
    const { data } = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone`, {
      timeout: 3000,
    });

    if (data?.status !== 'success') return null;

    return {
      ip,
      country: data.country || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      region: data.regionName || null,
      timezone: data.timezone || null,
      resolvedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget helper: resolve IP and persist to user document.
 * Safe to call without awaiting – errors are silently logged.
 */
async function saveRegistrationLocation(userDao, userId, req) {
  try {
    const ip = getClientIp(req);
    const location = await resolveIpLocation(ip);
    if (location) {
      await userDao.updateUser(userId, { registrationLocation: location });
    } else if (ip) {
      // At least save the raw IP even if geo lookup failed
      await userDao.updateUser(userId, { 'registrationLocation.ip': ip });
    }
  } catch (err) {
    console.error('[GeoIP] Failed to save registration location:', err.message);
  }
}

module.exports = { getClientIp, resolveIpLocation, saveRegistrationLocation };
