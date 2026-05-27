import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { hasFeature, type FeatureKey, type Tier } from './features';

/**
 * Reads subscription tier for the current user.
 *
 * Resolution order (backend is source of truth — set by Stripe webhooks
 * or by admins via PUT /admin/users/:id `{ premium: true }`):
 *
 *   1. `user.isPremium`  — server-computed effective access flag
 *   2. `user.premium`    — manual override (admin grant)
 *   3. `user.subscription.tier` / `subscription.plan` — Stripe-driven
 *
 * Coaches with premium → tier="coach" (unlocks athlete-management features).
 * Anyone else with premium → tier="athlete".
 * Admins are always treated as "coach" (full unlock).
 *
 * This hook performs ZERO purchase / IAP / steering. Apple Guideline 3.1.3
 * requires no in-app purchase or external-purchase prompts.
 */
export function usePremium() {
  const { user } = useAuth();

  const tier: Tier = useMemo(() => {
    if (!user) return 'free';

    // Admins always get full access.
    const role = String(user.role || '').toLowerCase();
    if (user.admin === true || role === 'admin') return 'coach';

    // Detect premium access from any of the supported flags / sources.
    const subTier =
      (user as any)?.subscription?.tier ??
      (user as any)?.subscription?.plan ??
      null;

    const hasPremiumAccess =
      user.isPremium === true ||
      user.premium === true ||
      subTier === 'coach' ||
      subTier === 'team' ||
      subTier === 'enterprise' ||
      subTier === 'pro' ||
      subTier === 'athlete';

    if (!hasPremiumAccess) return 'free';

    // Coach-role users with premium → unlock coach features (athletes, dashboard).
    if (role === 'coach' || role === 'tester' || role === 'testing') return 'coach';
    if (subTier === 'coach' || subTier === 'team' || subTier === 'enterprise') return 'coach';

    return 'athlete';
  }, [user]);

  const isPremium = tier === 'athlete' || tier === 'coach';
  const isCoach = tier === 'coach';

  const can = (feature: FeatureKey) => hasFeature(tier, feature);

  return { tier, isPremium, isCoach, can };
}
