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

  // Read isPremium from the user object (which already has premiumPreviewNoAccess applied
  // by AuthProvider via userWithPremiumPreviewApplied). Falls back to true for beta users.
  const isPremium = user ? (user.isPremium !== undefined ? user.isPremium : true) : false;
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
