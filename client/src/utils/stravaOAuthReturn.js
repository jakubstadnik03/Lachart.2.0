import {
  fetchUserProfile,
  autoSyncStravaActivities,
  updateAvatarFromStrava,
  getIntegrationStatus,
} from '../services/api';
import { saveUserToStorage } from './userStorage';
import { maybeNotifyStravaActivitiesImported } from './stravaImportLocalNotification';
import { trackIntegrationConnected } from './analytics';

const HANDLED_SESSION_KEY = 'strava_oauth_return_handled';
let handling = false;

export function isStravaOAuthReturnUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  return urlParams.get('strava') === 'connected'
    || hashParams.get('strava') === 'connected'
    || window.location.search.includes('strava=connected');
}

export function cleanStravaOAuthReturnUrl() {
  try {
    const hashBase = window.location.hash.split('?')[0];
    const cleanUrl = window.location.pathname + hashBase;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (_) { /* ignore */ }
}

/**
 * After Strava OAuth redirect (web query param or iOS deep link), reload the
 * user profile and pull recent activities. The server already started a
 * ~1-year historical backfill in the OAuth callback.
 */
export async function handleStravaOAuthReturn({ onNotify } = {}) {
  if (handling) return;
  handling = true;
  try {
    const handledAt = sessionStorage.getItem(HANDLED_SESSION_KEY);
    if (handledAt && Date.now() - Number(handledAt) < 60 * 1000) return;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const updatedUser = await fetchUserProfile();
    if (!updatedUser?._id) return;

    saveUserToStorage(updatedUser);
    window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
    sessionStorage.setItem(HANDLED_SESSION_KEY, String(Date.now()));

    onNotify?.('Strava account connected — syncing your activities…', 'success');
    try { trackIntegrationConnected('strava'); } catch { /* analytics only */ }

    try {
      await getIntegrationStatus();
      window.dispatchEvent(new CustomEvent('strava:integration-refreshed'));
    } catch (_) { /* ignore */ }

    try {
      const syncResult = await autoSyncStravaActivities({ force: true });
      if (syncResult?.imported > 0 || syncResult?.updated > 0) {
        onNotify?.(
          `Strava sync: ${syncResult.imported || 0} imported, ${syncResult.updated || 0} updated`,
          'success',
        );
        maybeNotifyStravaActivitiesImported(
          syncResult.imported,
          updatedUser?.notifications,
          syncResult.latestActivityId,
        );
      }
      window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: syncResult }));
    } catch (e) {
      console.warn('[Strava OAuth return] client auto-sync failed (server backfill continues):', e?.message || e);
    }

    try {
      await updateAvatarFromStrava();
    } catch (_) { /* ignore */ }

    const refreshedUser = await fetchUserProfile();
    if (refreshedUser?._id) {
      saveUserToStorage(refreshedUser);
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: refreshedUser }));
    }

    onNotify?.('Importing your last year of Strava history in the background', 'info');
  } catch (e) {
    console.error('[Strava OAuth return] handler failed:', e);
  } finally {
    handling = false;
  }
}

export function setupStravaOAuthReturnListener({ onNotify } = {}) {
  const runFromUrl = () => {
    if (!isStravaOAuthReturnUrl()) return;
    cleanStravaOAuthReturnUrl();
    handleStravaOAuthReturn({ onNotify });
  };

  runFromUrl();

  const onDeepLink = () => handleStravaOAuthReturn({ onNotify });
  window.addEventListener('strava:connected', onDeepLink);

  return () => window.removeEventListener('strava:connected', onDeepLink);
}
