import { getStravaAuthUrl } from '../services/api';
import { isCapacitorNative } from './isNativeApp';

/**
 * Kick off the Strava OAuth flow. Works in both the web app and the native
 * (Capacitor) shell:
 *  - Native: open the auth URL in the system browser (Safari). The server's
 *    OAuth callback redirects to com.lachart.app://strava-connected, which the
 *    deep-link listener in initCapacitorShell.js catches to return to the app.
 *  - Web: navigate the current tab to the auth URL.
 *
 * Returns true if the flow was launched, false on error.
 */
export async function connectStrava() {
  try {
    const url = await getStravaAuthUrl();
    if (!url) return false;
    if (isCapacitorNative()) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
    return true;
  } catch (e) {
    console.error('[connectStrava] failed to start OAuth:', e);
    return false;
  }
}
