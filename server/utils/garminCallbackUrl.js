'use strict';

/**
 * The Garmin webhook takes no signature, and a "ping" entry names a URL that
 * the server then fetches with the athlete's Garmin access token in the
 * Authorization header. Only Garmin's own HTTPS hosts may be fetched that way;
 * anything else would hand the token (or a request from inside our network)
 * to whoever posted the ping.
 */
function allowedHosts() {
  const hosts = new Set();
  try {
    hosts.add(new URL(process.env.GARMIN_API_BASE_URL || 'https://apis.garmin.com').hostname.toLowerCase());
  } catch { /* bad env value: fall back to the domain rule below */ }
  return hosts;
}

function isGarminCallbackUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'garmin.com' || host.endsWith('.garmin.com')) return true;
  return allowedHosts().has(host);
}

module.exports = { isGarminCallbackUrl };
