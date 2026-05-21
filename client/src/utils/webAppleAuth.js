/**
 * Sign In with Apple — web browser flow.
 *
 * Requirements (one-time Apple Developer setup):
 *  1. Create a **Service ID** in Apple Developer → Certificates, IDs & Profiles
 *     e.g.  net.lachart.web
 *  2. Enable "Sign In with Apple" for that Service ID.
 *  3. Add your domain (lachart.net) and a Return URL
 *     e.g.  https://lachart.net  (popup mode doesn't redirect, but Apple still
 *     requires a registered domain).
 *  4. Set REACT_APP_APPLE_SERVICE_ID=net.lachart.web   in client/.env.production
 *  5. Set APPLE_WEB_SERVICE_ID=net.lachart.web         in server/.env
 *
 * The popup-based flow never leaves the page, so no redirect handling is needed.
 */

const APPLE_JS_SDK = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

function loadAppleSDK() {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${APPLE_JS_SDK}"]`);
    if (existing) {
      // Script tag is there but SDK might still be loading — poll briefly
      const poll = setInterval(() => {
        if (window.AppleID) { clearInterval(poll); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(poll); reject(new Error('Apple JS SDK load timeout')); }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.src = APPLE_JS_SDK;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Apple Sign In SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Opens Apple Sign In popup and returns { identityToken, user: { givenName, familyName } }.
 * Throws on cancellation or error.
 */
export async function signInWithAppleWeb() {
  const serviceId = process.env.REACT_APP_APPLE_SERVICE_ID;
  if (!serviceId) {
    throw new Error('Apple Sign In is not configured for this web app (missing REACT_APP_APPLE_SERVICE_ID).');
  }

  await loadAppleSDK();

  window.AppleID.auth.init({
    clientId: serviceId,
    scope: 'name email',
    redirectURI: window.location.origin,   // must be a registered Return URL
    state: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
    usePopup: true,                        // stays on the same page
  });

  let response;
  try {
    response = await window.AppleID.auth.signIn();
  } catch (err) {
    // User closed the popup — err is usually { error: 'popup_closed_by_user' }
    const msg = String(err?.error || err?.message || err || '').toLowerCase();
    const isCancel =
      msg.includes('popup_closed') ||
      msg.includes('cancel') ||
      msg.includes('user_cancelled');
    const wrapped = new Error(isCancel ? 'Apple sign-in was cancelled.' : (err?.error || err?.message || 'Apple sign-in failed'));
    wrapped.cancelled = isCancel;
    wrapped.cause = err;
    throw wrapped;
  }

  const identityToken = response?.authorization?.id_token;
  if (!identityToken) {
    throw new Error('Apple Sign In did not return an identity token. Please try again.');
  }

  return {
    identityToken,
    user: {
      givenName: response?.user?.name?.firstName ?? null,
      familyName: response?.user?.name?.lastName ?? null,
    },
  };
}
