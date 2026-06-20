/**
 * Report native app usage to the server (throttled) so admin can see who uses the mobile app.
 */
const THROTTLE_MS = 5 * 60 * 1000;
let lastPingAt = 0;

async function getNativeAppMeta() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;

  let appVersion = null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    appVersion = info?.version || null;
  } catch { /* ignore */ }

  return {
    platform: Capacitor.getPlatform(),
    appVersion,
  };
}

export async function syncMobileAppActivity({ force = false } = {}) {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return false;

    const auth = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!auth) return false;

    const now = Date.now();
    if (!force && now - lastPingAt < THROTTLE_MS) return false;

    const meta = await getNativeAppMeta();
    if (!meta) return false;

    const { pingMobileApp } = await import('../services/api');
    await pingMobileApp(meta);
    lastPingAt = now;
    return true;
  } catch (e) {
    console.warn('[MobileApp] sync failed:', e?.message || e);
    return false;
  }
}

export async function getMobileAppMetaForPush() {
  return getNativeAppMeta();
}
