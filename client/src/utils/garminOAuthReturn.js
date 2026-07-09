import {
  fetchUserProfile,
  autoSyncGarminActivities,
  getIntegrationStatus,
} from '../services/api';
import { saveUserToStorage } from './userStorage';

const HANDLED_SESSION_KEY = 'garmin_oauth_return_handled';
let handling = false;

export function isGarminOAuthReturnUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('garmin') === 'connected'
    || window.location.search.includes('garmin=connected');
}

export function cleanGarminOAuthReturnUrl() {
  try {
    const hashBase = window.location.hash.split('?')[0];
    const params = new URLSearchParams(window.location.search);
    params.delete('garmin');
    params.delete('message');
    const qs = params.toString();
    const cleanUrl = window.location.pathname + hashBase + (qs ? `?${qs}` : '');
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (_) { /* ignore */ }
}

/**
 * After Garmin OAuth redirect, reload profile and pull recent activities.
 * The server also kicks off an immediate sync in the OAuth callback.
 */
export async function handleGarminOAuthReturn({ onNotify } = {}) {
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

    onNotify?.('Garmin account connected — syncing your activities…', 'success');

    try {
      await getIntegrationStatus();
      window.dispatchEvent(new CustomEvent('garmin:integration-refreshed'));
    } catch (_) { /* ignore */ }

    try {
      const syncResult = await autoSyncGarminActivities();
      if (syncResult?.imported > 0 || syncResult?.updated > 0) {
        onNotify?.(
          `Garmin sync: ${syncResult.imported || 0} imported, ${syncResult.updated || 0} updated`,
          'success',
        );
      }
      window.dispatchEvent(new CustomEvent('garminSyncComplete', { detail: syncResult }));
    } catch (e) {
      console.warn('[Garmin OAuth return] client auto-sync failed (server sync continues):', e?.message || e);
    }

    onNotify?.('Importing your Garmin history in the background', 'info');

    const refreshedUser = await fetchUserProfile();
    if (refreshedUser?._id) {
      saveUserToStorage(refreshedUser);
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: refreshedUser }));
    }
  } catch (e) {
    console.error('[Garmin OAuth return] handler failed:', e);
  } finally {
    handling = false;
  }
}

export function setupGarminOAuthReturnListener({ onNotify } = {}) {
  const runFromUrl = () => {
    if (!isGarminOAuthReturnUrl()) return;
    cleanGarminOAuthReturnUrl();
    handleGarminOAuthReturn({ onNotify });
  };

  runFromUrl();

  const onDeepLink = () => handleGarminOAuthReturn({ onNotify });
  window.addEventListener('garmin:connected', onDeepLink);

  return () => window.removeEventListener('garmin:connected', onDeepLink);
}
