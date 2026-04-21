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
  // All features are currently free — treat every logged-in user as premium.
  const isPremium = !!user;
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
   * Returns true if user has access.
   * All features are free, so always returns true for logged-in users.
   */
  const gate = useCallback(
    (featureName = 'This feature', requiredPlan = 'pro') => {
      // All features free — always grant access for authenticated users.
      if (!user) {
        setModalState({ isOpen: true, feature: featureName, requiredPlan });
        return false;
      }
      return true;
    },
    [user]
  );

  const UpgradeModalProps = {
    isOpen: modalState.isOpen,
    onClose: closeModal,
    feature: modalState.feature,
    requiredPlan: modalState.requiredPlan,
  };

  return { isPremium, isCoach, gate, UpgradeModalProps };
}
