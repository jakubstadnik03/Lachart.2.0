/**
 * emailLoginRoutes.js
 *
 * One-click sign-in from an email link.
 *
 * WHY: outreach emails ask a coach to look at a plan, but the link used to drop
 * them on a login wall. Asking someone to remember a password is exactly where
 * a warm click goes cold, so the CTA carries a signed token that signs them in
 * and lands them on the page the email promised.
 *
 * SAFETY NOTES
 *  - The emailed token is an HMAC over userId+expiry with the server secret, so
 *    it cannot be forged or edited to point at another account.
 *  - It expires (default 14 days) — long enough for an email to sit unread, far
 *    short of permanent.
 *  - The session JWT is handed to the browser in the URL **fragment**, which is
 *    never sent to servers, never lands in access logs and is not forwarded in
 *    Referer headers.
 *  - Anyone holding the emailed link can sign in as that user, which is the
 *    accepted trade-off of every magic link. Keep the expiry short and never
 *    reuse this for admin accounts.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/UserModel');
const { JWT_SECRET } = require('../config/jwt.config');

const DEFAULT_TTL_SEC = Number(process.env.EMAIL_LOGIN_TTL_SEC || 14 * 24 * 3600);

function getClientUrl() {
  return (process.env.CLIENT_URL || 'https://lachart.net').replace(/\/+$/, '');
}

function signature(userId, exp) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`email-login:${userId}:${exp}`)
    .digest('hex')
    .slice(0, 40);
}

/** Build the URL to put behind an email CTA. */
function buildEmailLoginUrl(userId, next = '/settings?tab=subscription', ttlSec = DEFAULT_TTL_SEC) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const qs = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    t: signature(String(userId), exp),
    next,
  });
  return `${base}/api/auth/email-login?${qs.toString()}`;
}

// GET /api/auth/email-login — verify, mint a session, hand off to the client.
router.get('/email-login', async (req, res) => {
  const { u, e, t, next } = req.query;
  const fail = (reason) =>
    res.redirect(`${getClientUrl()}/login?emailLogin=${encodeURIComponent(reason)}`);

  try {
    if (!u || !e || !t) return fail('invalid');
    const exp = Number(e);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return fail('expired');

    const expected = signature(String(u), exp);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(t));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail('invalid');

    const user = await User.findById(String(u)).select('_id role email').lean();
    if (!user) return fail('invalid');

    const token = jwt.sign(
      { userId: String(user._id), role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' },
    );

    await User.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() }, $inc: { loginCount: 1 } },
    ).catch(() => {});

    // Fragment, not query string — keeps the session token out of logs.
    const safeNext = typeof next === 'string' && next.startsWith('/') ? next : '/settings?tab=subscription';
    const frag = new URLSearchParams({ token, next: safeNext }).toString();
    return res.redirect(`${getClientUrl()}/auth/email-login#${frag}`);
  } catch (err) {
    console.error('[EmailLogin] failed:', err?.message || err);
    return fail('error');
  }
});

module.exports = router;
module.exports.buildEmailLoginUrl = buildEmailLoginUrl;
