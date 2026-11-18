import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { trackEvent } from '../utils/analytics';
import { getReturnSession } from '../utils/impersonation';
import {
  getStoreOffer,
  purchasePlan,
  restoreStorePurchases,
  storePurchasesAvailable,
  storeUnavailableReason,
  waitForServerPremium,
} from '../utils/storePurchases';

/**
 * The App Store purchase flow for one plan, for a button to call.
 *
 *   const store = useStorePurchase('pro', 'native_dashboard');
 *   store.available   — false on web, Android, or a build without the key
 *   store.priceLabel  — the App Store's localized price once known, else null
 *   store.trialEligible — false when Apple says this Apple ID used the trial
 *   store.buy() / store.restore()
 *   store.busy        — 'buying' | 'restoring' | 'confirming' | null
 *   store.message     — a short line to show under the button, or null
 *
 * After a purchase it waits for the server (RevenueCat webhook) to flip
 * user.isPremium; the locks then unmount on their own.
 *
 * It also reports the two ways this can fail quietly — the store being
 * unavailable in a native build, and an offering that will not load. Both send
 * the person to the website with nothing recorded, so a build that cannot sell
 * at all produces the same empty funnel as a user who looked and declined.
 */
// Once per surface per app session: four locks can mount in the same moment,
// and this is a diagnostic, not a funnel step.
const reported = new Set();
function reportOnce(name, params) {
  const key = `${name}:${params.plan || ''}:${params.source || ''}:${params.reason || ''}`;
  if (reported.has(key)) return;
  reported.add(key);
  trackEvent(name, params);
}

export function useStorePurchase(plan = 'pro', source = 'unknown', { loadOffer = true } = {}) {
  const { user } = useAuth();
  const userId = user?._id || user?.id || null;
  const available = storePurchasesAvailable() && Boolean(userId);

  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  // A paywall that cannot sell. 'web' is not reported: the browser is supposed
  // to buy through Stripe. Inside the app it is always worth knowing.
  useEffect(() => {
    if (available) return;
    const reason = storeUnavailableReason() || (userId ? null : 'no_user');
    if (!reason || reason === 'web') return;
    reportOnce('store_unavailable', { plan, source, reason });
  }, [available, plan, source, userId]);

  useEffect(() => {
    if (!available || !loadOffer) return undefined;
    let alive = true;
    getStoreOffer(plan, userId)
      .then((o) => { if (alive) setOffer(o); })
      .catch((err) => {
        console.warn('[store] could not load offer:', err?.message || err);
        // No offering means no price, no trial eligibility and a button that
        // cannot complete — until now a console line on a phone nobody reads.
        reportOnce('store_offer_failed', {
          plan,
          source,
          reason: String(err?.code ?? err?.message ?? 'unknown').slice(0, 100),
        });
      });
    return () => { alive = false; };
  }, [available, loadOffer, plan, userId]);

  const confirm = useCallback(async () => {
    setBusy('confirming');
    setMessage('Confirming your subscription…');
    const ok = await waitForServerPremium();
    setMessage(ok
      ? null
      : 'Your purchase went through. Premium can take a minute to appear — pull to refresh or reopen the app.');
    return ok;
  }, []);

  const buy = useCallback(async () => {
    if (!available || busy) return;
    // An admin looking through someone's account would put that person's
    // subscription on the admin's Apple ID. Buy as yourself or not at all.
    if (getReturnSession()) {
      setMessage('You are signed in as someone else. Switch back to your own account to buy.');
      return;
    }
    setMessage(null);
    setBusy('buying');
    trackEvent('store_purchase_started', { plan, source });
    try {
      const result = await purchasePlan(plan, userId, offer);
      if (result === 'cancelled') {
        trackEvent('store_purchase_cancelled', { plan, source });
        return;
      }
      trackEvent('store_purchase_completed', { plan, source, trial: Boolean(offer?.trialEligible) });
      await confirm();
    } catch (err) {
      console.error('[store] purchase failed:', err);
      trackEvent('store_purchase_failed', { plan, source, code: String(err?.code ?? '') });
      setMessage(err?.message ? `Purchase failed: ${err.message}` : 'Purchase failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [available, busy, plan, source, userId, offer, confirm]);

  const restore = useCallback(async () => {
    if (!available || busy) return;
    setMessage(null);
    setBusy('restoring');
    trackEvent('store_restore_started', { source });
    try {
      const found = await restoreStorePurchases(userId);
      if (!found) {
        setMessage('No active LaChart subscription was found for this Apple ID.');
        return;
      }
      await confirm();
    } catch (err) {
      console.error('[store] restore failed:', err);
      setMessage(err?.message ? `Restore failed: ${err.message}` : 'Restore failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [available, busy, source, userId, confirm]);

  return {
    available,
    priceLabel: offer?.priceString || null,
    trialEligible: offer ? offer.trialEligible : true,
    busy,
    message,
    buy,
    restore,
  };
}
