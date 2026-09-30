import { fetchUserProfile, autoSyncWatchActivities, getIntegrationStatus } from '../services/api';
import { saveUserToStorage } from './userStorage';
import { trackIntegrationConnected } from './analytics';

const HANDLED = { polar: 'polar_oauth_return_handled', coros: 'coros_oauth_return_handled' };
const handling = { polar: false, coros: false };

function providerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('polar') === 'connected' || params.get('polar') === 'error') return 'polar';
  if (params.get('coros') === 'connected' || params.get('coros') === 'error') return 'coros';
  return null;
}

export function cleanWatchOAuthReturnUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    params.delete('polar');
    params.delete('coros');
    params.delete('message');
    const qs = params.toString();
    const cleanUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch { /* ignore */ }
}

export async function handleWatchOAuthReturn(provider, { onNotify } = {}) {
  if (!provider || handling[provider]) return;
  handling[provider] = true;
  const label = provider === 'coros' ? 'COROS' : 'Polar';
  try {
    const key = HANDLED[provider];
    const handledAt = sessionStorage.getItem(key);
    if (handledAt && Date.now() - Number(handledAt) < 60 * 1000) return;

    await new Promise((resolve) => setTimeout(resolve, 800));
    const updatedUser = await fetchUserProfile();
    if (!updatedUser?._id) return;
    saveUserToStorage(updatedUser);
    window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
    sessionStorage.setItem(key, String(Date.now()));
    onNotify?.(`${label} connected — syncing your activities…`, 'success');
    try { trackIntegrationConnected(provider); } catch { /* analytics only */ }
    try {
      await getIntegrationStatus();
      window.dispatchEvent(new CustomEvent(`${provider}:integration-refreshed`));
    } catch { /* ignore */ }
    try {
      const syncResult = await autoSyncWatchActivities(provider);
      if (syncResult?.imported > 0 || syncResult?.updated > 0) {
        onNotify?.(`${label} sync: ${syncResult.imported || 0} imported, ${syncResult.updated || 0} updated`, 'success');
      }
      window.dispatchEvent(new CustomEvent('watchSyncComplete', { detail: { provider, ...syncResult } }));
    } catch (e) {
      console.error(`[${label} OAuth return] sync failed:`, e?.response?.data || e?.message || e);
    }
  } catch (e) {
    console.error(`[${provider} OAuth return] handler failed:`, e);
  } finally {
    handling[provider] = false;
  }
}

export function setupWatchOAuthReturnListener({ onNotify } = {}) {
  const runFromUrl = () => {
    const provider = providerFromUrl();
    if (!provider) return;
    const params = new URLSearchParams(window.location.search);
    const failed = params.get(provider) === 'error';
    const message = params.get('message');
    cleanWatchOAuthReturnUrl();
    if (failed) {
      onNotify?.(message || `${provider === 'coros' ? 'COROS' : 'Polar'} connection failed`, 'error');
      return;
    }
    handleWatchOAuthReturn(provider, { onNotify });
  };

  runFromUrl();
  const onPolar = () => handleWatchOAuthReturn('polar', { onNotify });
  const onCoros = () => handleWatchOAuthReturn('coros', { onNotify });
  window.addEventListener('polar:connected', onPolar);
  window.addEventListener('coros:connected', onCoros);
  return () => {
    window.removeEventListener('polar:connected', onPolar);
    window.removeEventListener('coros:connected', onCoros);
  };
}
