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
  const isPremium = user?.isPremium === true;
  const isCoach = user?.role === 'coach' && isPremium;

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
   * Returns false and opens upgrade modal if they don't.
   */
  const gate = useCallback(
    (featureName = 'This feature', requiredPlan = 'pro') => {
      const hasAccess =
        requiredPlan === 'coach' ? isCoach : isPremium;

      if (!hasAccess) {
        setModalState({ isOpen: true, feature: featureName, requiredPlan });
        return false;
      }
      return true;
    },
    [isPremium, isCoach]
  );

  const UpgradeModalProps = {
    isOpen: modalState.isOpen,
    onClose: closeModal,
    feature: modalState.feature,
    requiredPlan: modalState.requiredPlan,
  };

  return { isPremium, isCoach, gate, UpgradeModalProps };
}
