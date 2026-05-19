const axios = require('axios');

// Module-level status snapshot — surfaced via /strava/status so the
// Settings UI can show "Real-time sync: dead" when bootstrap failed
// (typically: missing SERVER_PUBLIC_URL env on a fresh Render deploy).
// Without this, a misconfigured deploy silently degraded every user
// to polling-only sync with no admin signal.
let webhookStatus = { state: 'pending', message: 'not yet attempted', updatedAt: null };
function setStatus(state, message, extra = {}) {
  webhookStatus = { state, message, updatedAt: new Date().toISOString(), ...extra };
}
function getWebhookStatus() {
  return webhookStatus;
}

/**
 * On server startup, ensure a Strava webhook subscription exists.
 * If none is found, register one automatically.
 * This runs once and is idempotent — Strava returns 409 if a sub already exists.
 */
async function bootstrapStravaWebhook() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const serverUrl = process.env.SERVER_PUBLIC_URL || process.env.STRAVA_WEBHOOK_CALLBACK_URL;
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'lachart-strava-webhook';

  if (!clientId || !clientSecret) {
    console.error('[StravaWebhook] ❌ DEAD: STRAVA_CLIENT_ID/SECRET not set — real-time sync will not work for any user');
    setStatus('dead', 'Strava credentials missing on server (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET)');
    return;
  }
  if (!serverUrl) {
    console.error('[StravaWebhook] ❌ DEAD: SERVER_PUBLIC_URL not set — Strava cannot push activity events to this deploy. Set SERVER_PUBLIC_URL=https://your-render-domain on the backend.');
    setStatus('dead', 'SERVER_PUBLIC_URL env var is not set on this deploy. Real-time webhook sync is disabled — users will only see new activities via the 30-min polling fallback.');
    return;
  }
  if (process.env.STRAVA_DISABLE_POLL === 'true' && process.env.STRAVA_DISABLE_WEBHOOK_BOOTSTRAP === 'true') {
    return;
  }

  const callbackUrl = `${serverUrl.replace(/\/+$/, '')}/api/integrations/strava/webhook`;

  try {
    // Check existing subscriptions first
    const checkParams = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    const existing = await axios.get(
      `https://www.strava.com/api/v3/push_subscriptions?${checkParams.toString()}`,
      { timeout: 10000 }
    );
    const subs = Array.isArray(existing.data) ? existing.data : [];

    if (subs.length > 0) {
      const sub = subs[0];
      console.log(`[StravaWebhook] Active subscription found (id=${sub.id}, callback=${sub.callback_url})`);

      // If callback URL changed (e.g. new deployment), delete old and re-register
      if (sub.callback_url !== callbackUrl) {
        console.log(`[StravaWebhook] Callback URL mismatch, re-registering (old=${sub.callback_url})`);
        await axios.delete(
          `https://www.strava.com/api/v3/push_subscriptions/${sub.id}`,
          { params: { client_id: clientId, client_secret: clientSecret }, timeout: 10000 }
        );
        const newId = await registerWebhook(clientId, clientSecret, callbackUrl, verifyToken);
        setStatus('active', `re-registered after callback drift to ${callbackUrl}`, { subscriptionId: newId, callbackUrl });
        return;
      }
      setStatus('active', `subscription healthy at ${sub.callback_url}`, { subscriptionId: sub.id, callbackUrl: sub.callback_url });
      return;
    }

    // No subscription — register now
    const newId = await registerWebhook(clientId, clientSecret, callbackUrl, verifyToken);
    setStatus('active', `registered fresh subscription at ${callbackUrl}`, { subscriptionId: newId, callbackUrl });
  } catch (e) {
    const status = e.response?.status;
    const data = e.response?.data;
    // 409 = subscription already exists (race condition on multi-instance deploy)
    if (status === 409) {
      console.log('[StravaWebhook] Subscription already registered (409)');
      setStatus('active', 'subscription exists (409 from POST)', { callbackUrl });
      return;
    }
    console.error('[StravaWebhook] Bootstrap error:', status, data || e.message);
    setStatus('error', `bootstrap failed: HTTP ${status || '?'} — ${typeof data === 'string' ? data : JSON.stringify(data || e.message)}`);
  }
}

async function registerWebhook(clientId, clientSecret, callbackUrl, verifyToken) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });
  const resp = await axios.post(
    `https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`,
    {},
    { timeout: 15000 }
  );
  console.log(`[StravaWebhook] Registered webhook subscription (id=${resp.data?.id}, callback=${callbackUrl})`);
  return resp.data?.id;
}

module.exports = { bootstrapStravaWebhook, getWebhookStatus };
