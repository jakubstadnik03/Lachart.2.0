/**
 * Dev affordance — kept as no-ops after the Settings "Preview as non-premium
 * user" toggle was removed, so any code path that still imports these helpers
 * keeps compiling but no longer overrides the server's premium state.
 *
 * On the first call to readPremiumPreviewNoAccess() we proactively clear the
 * stale localStorage key so users who flipped the toggle on weeks ago don't
 * silently keep showing as non-premium forever.
 */

export const PREMIUM_PREVIEW_NO_ACCESS_KEY = 'lachart_preview_no_premium';

export function readPremiumPreviewNoAccess() {
  try {
    // One-shot cleanup of the legacy flag so previously-toggled accounts
    // don't stay artificially locked out.
    if (localStorage.getItem(PREMIUM_PREVIEW_NO_ACCESS_KEY) !== null) {
      localStorage.removeItem(PREMIUM_PREVIEW_NO_ACCESS_KEY);
    }
  } catch {
    // ignore — private mode or quota errors
  }
  return false;
}

export function writePremiumPreviewNoAccess(_enabled) {
  // No-op. Toggle UI was removed; we keep the export to avoid breaking
  // callers that haven't been refactored yet.
}

/** Returns the user object unchanged — preview override is no longer applied. */
export function userWithPremiumPreviewApplied(user, _previewActive) {
  return user;
}
