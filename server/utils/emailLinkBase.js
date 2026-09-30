/**
 * The host that appears in links inside an email.
 *
 * Every campaign letter carries an unsubscribe link and, in the outreach ones,
 * a click redirect. Those were built from SERVER_PUBLIC_URL, which is
 * lachart.onrender.com — and *.onrender.com is shared hosting whose reputation
 * is pooled across every service anyone has ever run there. On 2026-09-30
 * centrum.cz soft-bounced a letter with
 *
 *   554 Your access to this mail system has been rejected due to poor
 *       reputation of a domain used in message
 *
 * "a domain used in message", not the sender. A shared hosting domain in the
 * body is exactly the kind of thing that earns that.
 *
 * Kept separate from SERVER_PUBLIC_URL rather than replacing it, because that
 * variable also registers the Strava webhook callback and the Garmin push URL —
 * those must keep pointing at the backend directly, not through a CDN rewrite.
 *
 * Unset, this falls back to the old behaviour. Set it only once lachart.net
 * actually proxies /api to the backend (see the rewrite in client/vercel.json):
 * until then the links would resolve to the React app and every unsubscribe in
 * every campaign would silently break, which is worse than a shared domain.
 */

'use strict';

function emailLinkBase() {
  const base = process.env.EMAIL_LINK_BASE_URL
    || process.env.SERVER_PUBLIC_URL
    || 'https://lachart.onrender.com';
  return String(base).replace(/\/+$/, '');
}

module.exports = { emailLinkBase };
