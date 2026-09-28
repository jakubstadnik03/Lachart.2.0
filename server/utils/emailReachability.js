/**
 * Can we actually send this person an email?
 *
 * 30 of 826 accounts sign in with Apple and chose Hide My Email, so their
 * address is a @privaterelay.appleid.com forwarder. Apple only forwards from
 * senders registered against the app's Sign in with Apple configuration; every
 * other sender is refused at the relay with
 *
 *   550 5.1.1 <lachart@lachart.net>: unauthorized sender
 *
 * which is what has been filling the Zoho inbox with bounces. Nothing in the
 * code can fix that — the sending domain and each From address have to be
 * registered and verified in the Apple Developer portal. Until they are, these
 * users receive nothing: no welcome, no password reset, no campaign.
 *
 * This exists so the rest of the system stops pretending otherwise. Campaigns
 * skip them rather than generating a bounce per send, and the counts they
 * appear in can say "reachable" and mean it.
 */

'use strict';

/** Apple's Hide My Email forwarder. */
function isAppleRelay(email) {
  return /@privaterelay\.appleid\.com\s*$/i.test(String(email || ''));
}

/**
 * A placeholder this app invented for an Apple sign-in that returned no email
 * at all (see the Apple callback in userListRoute). It was never deliverable.
 */
function isSyntheticAppleAddress(email) {
  return /^apple_[^@]+@privaterelay\.appleid\.com$/i.test(String(email || ''));
}

/**
 * @returns {{reachable: boolean, reason: string|null}}
 */
function emailReachability(email) {
  const e = String(email || '').trim();
  if (!e) return { reachable: false, reason: 'no-address' };
  if (isSyntheticAppleAddress(e)) return { reachable: false, reason: 'apple-relay-placeholder' };
  if (isAppleRelay(e)) {
    return {
      reachable: false,
      reason: 'apple-relay-unregistered',
    };
  }
  return { reachable: true, reason: null };
}

module.exports = { isAppleRelay, isSyntheticAppleAddress, emailReachability };
