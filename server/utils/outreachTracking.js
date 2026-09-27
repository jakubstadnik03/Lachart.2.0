/**
 * Open and click tracking for cold outreach.
 *
 * The click redirect is signed, and that is not ceremony. A redirector that
 * forwards to whatever arrives in a query parameter is an open redirect: anyone
 * could mail `lachart.net/...?u=<their phishing page>` and borrow this domain's
 * reputation to do it. The signature covers the lead id AND the destination,
 * and the destination host has to be one of ours regardless — belt and braces,
 * because the cost of being wrong here is the sending domain.
 */

const crypto = require('crypto');

/** Hosts a tracked link may point at. Anything else is refused outright. */
const ALLOWED_HOSTS = new Set([
  'lachart.net',
  'www.lachart.net',
  'apps.apple.com',
]);

function secret() {
  return process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
}

function sign(...parts) {
  return crypto.createHmac('sha256', secret()).update(parts.join('|')).digest('hex').slice(0, 20);
}

function serverBase() {
  return (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
}

function isAllowedTarget(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Wrap one destination in a signed, per-lead redirect. */
function trackedUrl(leadId, target) {
  if (!isAllowedTarget(target)) {
    // Never silently emit an untracked link where a tracked one was expected —
    // but never refuse to send the letter over it either.
    console.warn('[outreachTracking] target not allowlisted, sending bare:', target);
    return target;
  }
  const t = Buffer.from(target, 'utf8').toString('base64url');
  const s = sign(String(leadId), target);
  return `${serverBase()}/api/email/t/c?l=${encodeURIComponent(String(leadId))}&u=${t}&s=${s}`;
}

/** The 1×1 beacon. Worth far less than a click; see the model comment. */
function trackingPixelUrl(leadId) {
  return `${serverBase()}/api/email/t/o.gif?l=${encodeURIComponent(String(leadId))}&s=${sign(String(leadId), 'open')}`;
}

function verifyClick(leadId, target, sig) {
  return !!sig && sig === sign(String(leadId), target);
}

function verifyOpen(leadId, sig) {
  return !!sig && sig === sign(String(leadId), 'open');
}

function decodeTarget(encoded) {
  try {
    return Buffer.from(String(encoded || ''), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** Transparent 1×1 GIF. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

module.exports = {
  trackedUrl,
  trackingPixelUrl,
  verifyClick,
  verifyOpen,
  decodeTarget,
  isAllowedTarget,
  PIXEL,
  ALLOWED_HOSTS,
};
