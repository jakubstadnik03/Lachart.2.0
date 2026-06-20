/**
 * Apple Push Notification service (APNs) — direct HTTP/2 sender.
 *
 * Replaces the prior Expo Push relay. Capacitor's `PushNotifications.register()`
 * returns the raw 64-char APNs device token, not an Expo `ExponentPushToken[...]`,
 * so the Expo relay was silently rejecting every send. This module talks to
 * APNs directly using a JWT signed by the team's `.p8` Auth Key — the only
 * setup Apple supports for "modern" push (HTTP/2 + JSON payload).
 *
 * Required env vars (set in Render → Environment):
 *   APNS_KEY_ID         — 10-char key id (Apple Developer → Keys → your APNs key)
 *   APNS_TEAM_ID        — 10-char team id (Apple Developer → Membership)
 *   APNS_BUNDLE_ID      — iOS app bundle id, e.g. "com.lachart.app"
 *   APNS_PRIVATE_KEY    — full text of the .p8 file (multiline, keep newlines)
 *   APNS_PRODUCTION     — "true" for App Store / TestFlight tokens, anything
 *                         else for Xcode debug builds (default: production)
 *
 * Tokens we receive from Capacitor on iOS are hex strings (no spaces). The
 * earlier Expo path stored them in user.expoPushTokens — we keep the same
 * field name for backward compat with existing rows, even though the
 * content is now raw APNs device tokens.
 */

const http2 = require('http2');
const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');

// ─── JWT cache ────────────────────────────────────────────────────────────────
// Apple wants a JWT signed by ES256 + your team key. The token is valid for up
// to 60 minutes; longer reuse means Apple starts returning 403 ExpiredProvider
// Token. Refresh every 50 min to be safe.
let cachedJwt = null;
let cachedJwtAt = 0;
const JWT_TTL_MS = 50 * 60 * 1000;

function getProviderJwt() {
  const now = Date.now();
  if (cachedJwt && now - cachedJwtAt < JWT_TTL_MS) return cachedJwt;

  const keyId  = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKey) {
    console.warn('[APNs] Missing APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY — push is disabled.');
    return null;
  }

  try {
    // The .p8 file content sometimes lands in env-vars as a single line with
    // literal `\n`. Restore the newlines so OpenSSL can parse the PEM block.
    const pem = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
    cachedJwt = jwt.sign(
      { iss: teamId, iat: Math.floor(now / 1000) },
      pem,
      {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid: keyId },
      }
    );
    cachedJwtAt = now;
    return cachedJwt;
  } catch (e) {
    console.error('[APNs] JWT sign failed — check the .p8 PEM content:', e.message);
    return null;
  }
}

// ─── HTTP/2 client ────────────────────────────────────────────────────────────
// One persistent connection per process; reconnect on close. APNs lets you
// stream many pushes through a single client — opening a fresh connection
// per send burns rate limit and adds 100-200 ms TLS handshake every time.

let session = null;
let sessionSandbox = null;

function apnsHost(sandbox) {
  return sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
}

function getSession(sandbox = false) {
  const preferSandbox = sandbox || process.env.APNS_PRODUCTION === 'false';
  let ref = preferSandbox ? sessionSandbox : session;
  const host = apnsHost(preferSandbox);

  if (ref && !ref.closed && !ref.destroyed) return { sess: ref, sandbox: preferSandbox };

  ref = http2.connect(host);
  ref.on('error', (err) => {
    console.warn('[APNs] session error:', err.message);
  });
  ref.on('close', () => {
    if (preferSandbox) sessionSandbox = null;
    else session = null;
  });

  if (preferSandbox) sessionSandbox = ref;
  else session = ref;

  return { sess: ref, sandbox: preferSandbox };
}

/**
 * Send one notification to a list of APNs device tokens.
 *
 * @param {string[]} tokens  — raw 64-char hex device tokens
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]   — JSON payload available to the JS handler when the user taps
 * @returns {Promise<{sent:number, invalid:string[]}>}
 *          invalid = tokens that APNs rejected as 410 Gone (uninstalled / re-registered).
 *          Caller should remove them from the user's saved tokens.
 */
async function sendApnsToTokens(tokens, { title, body, data = {} }) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { sent: 0, invalid: [] };
  const clean = [...new Set(tokens.map(t => String(t).trim()).filter(Boolean))];
  if (clean.length === 0) return { sent: 0, invalid: [] };

  const providerJwt = getProviderJwt();
  if (!providerJwt) return { sent: 0, invalid: [] };

  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    console.warn('[APNs] APNS_BUNDLE_ID missing — push is disabled.');
    return { sent: 0, invalid: [] };
  }

  const payload = JSON.stringify({
    aps: {
      alert: { title: title || 'LaChart', body: body || '' },
      sound: 'default',
      'content-available': 1,
    },
    ...(typeof data === 'object' && data ? data : {}),
  });

  const primarySandbox = process.env.APNS_PRODUCTION === 'false';
  const primary = await sendApnsBatch(clean, payload, bundleId, providerJwt, primarySandbox);

  // Xcode debug tokens need sandbox; TestFlight/App Store need production — retry mismatched tokens.
  const retryTokens = primary
    .filter((v) => !v.ok && (v.reason === 'BadDeviceToken' || v.status === 400))
    .map((v) => v.token);

  const secondary = retryTokens.length
    ? await sendApnsBatch(retryTokens, payload, bundleId, providerJwt, !primarySandbox)
    : [];

  const all = [...primary, ...secondary];
  let sent = 0;
  const invalid = [];
  const succeeded = new Set();

  for (const v of all) {
    if (v.ok) {
      if (!succeeded.has(v.token)) { sent += 1; succeeded.add(v.token); }
      continue;
    }
    if (v.status === 410 || v.reason === 'BadDeviceToken' || v.reason === 'Unregistered') {
      invalid.push(v.token);
    } else if (!retryTokens.includes(v.token)) {
      console.warn('[APNs] send failed', v.status, v.reason || v.error, v.token?.slice(0, 8));
    }
  }

  return { sent, invalid: [...new Set(invalid)] };
}

function sendApnsBatch(tokens, payload, bundleId, providerJwt, sandbox) {
  const { sess } = getSession(sandbox);
  return Promise.all(tokens.map((token) => new Promise((resolve) => {
    const req = sess.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerJwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let statusCode = 0;
    let responseBody = '';
    req.on('response', (headers) => { statusCode = headers[':status']; });
    req.on('data', (chunk) => { responseBody += chunk.toString(); });
    req.on('error', (err) => resolve({ token, ok: false, error: err.message }));
    req.on('end', () => {
      if (statusCode === 200) {
        resolve({ token, ok: true });
      } else {
        let reason = '';
        try { reason = JSON.parse(responseBody)?.reason || ''; } catch {}
        resolve({ token, ok: false, status: statusCode, reason });
      }
    });
    req.setTimeout(15000, () => { try { req.close(); } catch {} resolve({ token, ok: false, error: 'timeout' }); });
    req.end(payload);
  })));
}

/**
 * Wrapper that loads a user's saved tokens, sends the push, then prunes
 * any tokens APNs reported as invalid. All notifyXxx helpers below funnel
 * through this so dead tokens get cleaned up automatically.
 */
async function pushToUser(userId, { title, body, data }) {
  if (!userId) return { sent: 0 };
  try {
    const user = await User.findById(userId).select('expoPushTokens notifications').lean();
    if (!user) return { sent: 0 };

    // Respect user notification preference (same field the existing in-app
    // notification flow checks — keeps both channels in sync).
    if (user.notifications?.pushNotifications === false) return { sent: 0 };

    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens : [];
    if (tokens.length === 0) return { sent: 0 };

    const { sent, invalid } = await sendApnsToTokens(tokens, { title, body, data });

    if (invalid.length > 0) {
      try {
        await User.updateOne(
          { _id: userId },
          { $pull: { expoPushTokens: { $in: invalid } } }
        );
        console.log(`[APNs] Pruned ${invalid.length} dead tokens for user ${userId}`);
      } catch (e) {
        console.warn('[APNs] Failed to prune dead tokens:', e.message);
      }
    }
    return { sent };
  } catch (e) {
    console.error('[APNs] pushToUser:', e.message || e);
    return { sent: 0 };
  }
}

// ─── Public helpers — same signatures as the old Expo module ─────────────────
// Keeps callers (notificationHelper, stravaAutoSyncService, …) unchanged.

async function sendExpoPushToTokens(tokens, opts) {
  // Legacy name. Calls into the new APNs path directly so existing imports
  // keep working without a rename pass across the codebase.
  return sendApnsToTokens(tokens, opts);
}

async function notifyUserStravaActivitiesImported(userId, importedCount, opts = {}) {
  const latest = opts.latestActivityId;
  const title = 'LaChart';
  const body = importedCount === 1
    ? '1 new activity imported — tap to add lactate.'
    : `${importedCount} new activities imported from Strava.`;
  return pushToUser(userId, {
    title,
    body,
    data: {
      type: 'strava_import',
      activityType: 'strava',
      activityId: latest ? String(latest) : null,
      resourceType: 'strava',
      resourceId: latest ? String(latest) : null,
    },
  });
}

async function notifyUserCommentAdded(userId, opts = {}) {
  return pushToUser(userId, {
    title: opts.title || 'New comment',
    body:  opts.body  || 'Someone commented on your training.',
    data: {
      type: 'training_comment',
      resourceType: 'training',
      resourceId: opts.trainingId ? String(opts.trainingId) : null,
    },
  });
}

async function notifyUserCustom(userId, { title, body, data }) {
  return pushToUser(userId, { title, body, data });
}

async function notifyAdmins({ title, body, data }) {
  try {
    const admins = await User.find({ admin: true }).select('_id').lean();
    for (const a of admins) {
      await pushToUser(a._id, { title, body, data });
    }
  } catch (e) {
    console.error('[APNs] notifyAdmins:', e.message || e);
  }
}

module.exports = {
  sendApnsToTokens,
  sendExpoPushToTokens,        // legacy alias — same signature, now goes via APNs
  notifyUserStravaActivitiesImported,
  notifyUserCommentAdded,
  notifyUserCustom,
  notifyAdmins,
};
