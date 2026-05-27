export type SubscriptionTier = 'free' | 'athlete' | 'coach';

export type SubscriptionInfo = {
  /** Active entitlement tier — set by the backend from Stripe state. */
  tier: SubscriptionTier;
  /** ISO date string; null if free or lifetime. */
  expiresAt?: string | null;
  /** Whether the user is currently inside the introductory free trial. */
  inTrial?: boolean;
};

export type AuthUser = {
  _id: string;
  email?: string;
  name?: string;
  surname?: string;
  role?: 'admin' | 'coach' | 'athlete' | 'tester' | 'testing';
  admin?: boolean;
  athletes?: string[];
  /**
   * Manual premium flag set by admins (comp accounts, support, testers).
   * Maps to `user.premium` boolean on the server (UserModel).
   */
  premium?: boolean;
  /**
   * Effective premium access — true if `premium === true` OR the user has an
   * active paid Subscription. Resolved by server/utils/premiumAccess.js.
   */
  isPremium?: boolean;
  /** Where the premium access comes from (e.g. "manual" or "subscription"). */
  premiumSource?: string;
  /**
   * Subscription state, mirrored from lachart.app backend (Stripe is source of truth).
   * Absent / "free" means the user has no active premium entitlement.
   */
  subscription?: SubscriptionInfo;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};



