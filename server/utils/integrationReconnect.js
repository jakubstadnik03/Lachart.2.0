/**
 * "Your watch stopped talking to us" — said out loud, once.
 *
 * Both providers can drop us without warning: Strava answers `invalid_grant`
 * for a refresh token the athlete revoked in their own Strava settings, and
 * Garmin does the same plus 401s a live access token after a password change.
 * Every one of those paths already handled the failure correctly on the
 * server — and silently. The card fell back to "Not connected", activities
 * stopped arriving, and from the athlete's side that is indistinguishable from
 * the app having lost their training. Nobody reconnects an integration they
 * were never told was broken.
 *
 * So the failure is recorded on the user and the athlete is told once, with a
 * cooldown: the auto-sync scheduler keeps hitting the same dead token every
 * single day, and a daily "reconnect Garmin" push would be its own bug.
 */

const User = require('../models/UserModel');

const PROVIDERS = { strava: 'Strava', garmin: 'Garmin' };

/** Don't re-nag about the same dead token more than once every three days. */
const NOTIFY_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/** Human sentence per cause — the athlete needs to know what to do, not what HTTP said. */
const REASON_COPY = {
  revoked: 'access was revoked',
  refresh_failed: 'the connection expired',
  unauthorized: 'the connection is no longer authorised',
};

function idOf(userOrId) {
  if (!userOrId) return null;
  const id = typeof userOrId === 'object' ? (userOrId._id || userOrId.id) : userOrId;
  return id ? String(id) : null;
}

/**
 * Does this error mean the *user* has to act, as opposed to the server having a
 * bad minute? Only the first kind is worth interrupting anyone over.
 */
function isReconnectableAuthError(err, status = null) {
  const code = Number(status ?? err?.response?.status ?? 0);
  if (code === 401 || code === 403) return true;
  const body = err?.response?.data;
  const s = `${err?.message || ''} ${typeof body === 'string' ? body : JSON.stringify(body || '')}`.toLowerCase();
  if (s.includes('invalid_grant')) return true;
  if (s.includes('invalidoauthtoken')) return true;
  if (s.includes('token expired') || s.includes('token revoked')) return true;
  // A missing pull token is a server configuration gap, never the user's doing.
  if (s.includes('invalidpulltoken') || s.includes('garmin_pull_token')) return false;
  return false;
}

/**
 * Record that `provider` needs reconnecting, and notify the athlete at most
 * once per cooldown window. Safe to call from any failure path, including ones
 * that have already mutated or wiped the user document.
 */
async function flagNeedsReconnect(userOrId, provider, reason = 'refresh_failed') {
  const id = idOf(userOrId);
  const label = PROVIDERS[provider];
  if (!id || !label) return;

  try {
    const before = await User.findById(id).select('integrationAlerts name').lean();
    const prev = before?.integrationAlerts?.[provider] || {};
    const now = new Date();

    await User.updateOne({ _id: id }, {
      $set: {
        [`integrationAlerts.${provider}.needsReconnectAt`]: prev.needsReconnectAt || now,
        [`integrationAlerts.${provider}.reason`]: reason,
      },
    });

    const lastNotified = prev.notifiedAt ? new Date(prev.notifiedAt).getTime() : 0;
    if (Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) return;

    await User.updateOne({ _id: id }, {
      $set: { [`integrationAlerts.${provider}.notifiedAt`]: now },
    });

    // Required lazily: notificationHelper pulls in the push stack, and this
    // module is required from the token helpers that the push stack itself uses.
    const { sendNotification } = require('./notificationHelper');
    await sendNotification(id, {
      type: 'integration_reconnect',
      title: `${label} disconnected`,
      body: `${label} ${REASON_COPY[reason] || REASON_COPY.refresh_failed}, so new activities are not arriving. `
        + 'Tap to reconnect — nothing already imported is lost.',
      resourceType: 'settings',
      pushData: { screen: 'settings', tab: 'integrations', provider },
    });
    console.log(`[integrationReconnect] told user ${id} to reconnect ${provider} (${reason})`);
  } catch (e) {
    // Never let the alert break the sync path it was called from.
    console.error('[integrationReconnect] flag failed:', e?.message || e);
  }
}

/** Clear the flag — a successful token use or a fresh connect both count. */
async function clearNeedsReconnect(userOrId, provider) {
  const id = idOf(userOrId);
  if (!id || !PROVIDERS[provider]) return;
  try {
    await User.updateOne({ _id: id }, {
      $set: {
        [`integrationAlerts.${provider}.needsReconnectAt`]: null,
        [`integrationAlerts.${provider}.reason`]: null,
        [`integrationAlerts.${provider}.notifiedAt`]: null,
      },
    });
  } catch (e) {
    console.error('[integrationReconnect] clear failed:', e?.message || e);
  }
}

/** Shape for the status endpoints, so the Settings card can say it in place. */
function reconnectState(userDoc, provider) {
  const a = userDoc?.integrationAlerts?.[provider] || {};
  if (!a.needsReconnectAt) return { needsReconnect: false, reconnectReason: null, needsReconnectSince: null };
  return {
    needsReconnect: true,
    reconnectReason: a.reason || 'refresh_failed',
    needsReconnectSince: a.needsReconnectAt,
  };
}

module.exports = {
  flagNeedsReconnect,
  clearNeedsReconnect,
  reconnectState,
  isReconnectableAuthError,
  REASON_COPY,
};
