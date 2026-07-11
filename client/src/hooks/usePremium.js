import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthProvider';

/**
 * usePremium — gate premium features behind an upgrade modal.
 *
 * Usage:
 *   const { isPremium, gate, UpgradeModalProps } = usePremium();
 *
 *   // In a click handler:
 *   if (!gate('FIT Training Analysis', 'pro')) return;
 *   // ... continue with premium action
 *
 *   // In JSX:
 *   <UpgradeModal {...UpgradeModalProps} />
 */
export function usePremium() {
  const { user } = useAuth();

  // isPremium comes from the user object resolved by AuthProvider, which
  // mirrors server/utils/premiumAccess.js → resolvePremiumAccess():
  //   - true  if user.premium === true (manual admin grant)
  //   - true  if active paid Subscription (status active/trialing)
  //   - true  if BETA_ALL_PREMIUM=true on the server
  //   - false otherwise — INCLUDING admins. Admins must also pay (or be
  //     granted manual access) so they dogfood the real paywall.
  //
  // We require strict === true here. A missing / undefined isPremium MUST
  // be treated as not-premium (previous `!== false` was leaky — it let any
  // legacy account through).
  //
  // On native iOS/Android, Stripe checkout stays out of the app (App Store
  // 3.1.1) — UpgradeModal shows a web-only message instead. Premium access
  // still follows user.isPremium from the server (e.g. subscription bought on web).
  //
  // Set FREE_FOR_EVERYONE = true to unlock every gate (early access / launch).
  const FREE_FOR_EVERYONE = false;
  const isPremium = FREE_FOR_EVERYONE
    ? true
    : (user != null && user.isPremium === true);
  const isCoach = isPremium;

  const [modalState, setModalState] = useState({
    isOpen: false,
    feature: '',
    requiredPlan: 'pro',
  });

  const closeModal = useCallback(() => {
    setModalState((s) => ({ ...s, isOpen: false }));
  }, []);

  /**
   * gate(featureName, requiredPlan?)
   * Returns true if user has access, false + opens upgrade modal if not.
   */
  const gate = useCallback(
    (featureName = 'This feature', requiredPlan = 'pro') => {
      if (!user || !isPremium) {
        setModalState({ isOpen: true, feature: featureName, requiredPlan });
        return false;
      }
      return true;
    },
    [user, isPremium]
  );

  const UpgradeModalProps = {
    isOpen: modalState.isOpen,
    onClose: closeModal,
    feature: modalState.feature,
    requiredPlan: modalState.requiredPlan,
  };

  return { isPremium, isCoach, gate, UpgradeModalProps };
}
