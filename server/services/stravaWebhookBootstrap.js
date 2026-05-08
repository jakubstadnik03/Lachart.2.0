const axios = require('axios');

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
    console.log('[StravaWebhook] Skipping bootstrap: STRAVA_CLIENT_ID/SECRET not set');
    return;
  }
  if (!serverUrl) {
    console.log('[StravaWebhook] Skipping bootstrap: SERVER_PUBLIC_URL not set');
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
        await registerWebhook(clientId, clientSecret, callbackUrl, verifyToken);
      }
      return;
    }

    // No subscription — register now
    await registerWebhook(clientId, clientSecret, callbackUrl, verifyToken);
  } catch (e) {
    const status = e.response?.status;
    const data = e.response?.data;
    // 409 = subscription already exists (race condition on multi-instance deploy)
    if (status === 409) {
      console.log('[StravaWebhook] Subscription already registered (409)');
      return;
    }
    console.error('[StravaWebhook] Bootstrap error:', status, data || e.message);
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
}

module.exports = { bootstrapStravaWebhook };
