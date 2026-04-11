/** localStorage: simulate “no premium” in the UI without changing the server. */

export const PREMIUM_PREVIEW_NO_ACCESS_KEY = 'lachart_preview_no_premium';

export function readPremiumPreviewNoAccess() {
  try {
    return localStorage.getItem(PREMIUM_PREVIEW_NO_ACCESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePremiumPreviewNoAccess(enabled) {
  try {
    if (enabled) localStorage.setItem(PREMIUM_PREVIEW_NO_ACCESS_KEY, '1');
    else localStorage.removeItem(PREMIUM_PREVIEW_NO_ACCESS_KEY);
  } catch {
    // ignore
  }
}

/** Strips premium flags for UI when preview is on. Admin/coach flags stay unchanged. */
export function userWithPremiumPreviewApplied(user, previewActive) {
  if (!user || !previewActive) return user;
  return {
    ...user,
    isPremium: false,
    premium: false,
    premiumSource: 'none',
  };
}
