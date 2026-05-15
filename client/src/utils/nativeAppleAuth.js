import { isCapacitorNative } from './isNativeApp';

/**
 * Trigger Apple Sign In via the Capacitor community plugin.
 * Returns { identityToken, user: { givenName, familyName } } on success.
 * Throws on cancellation or error.
 */
export async function signInWithAppleNative() {
  if (!isCapacitorNative()) {
    throw new Error('Apple Sign In is only available in the native iOS app');
  }

  let SignInWithApple;
  try {
    ({ SignInWithApple } = await import('@capacitor-community/apple-sign-in'));
  } catch (e) {
    throw new Error('Sign in with Apple is not available in this build. Please update the app.');
  }

  // clientId MUST match the iOS app's PRODUCT_BUNDLE_IDENTIFIER and the server's
  // APPLE_BUNDLE_ID — otherwise the token's `aud` claim won't pass verification
  // (server returns 401 "Apple identity token is invalid or expired").
  let result;
  try {
    result = await SignInWithApple.authorize({
      clientId: process.env.REACT_APP_APPLE_BUNDLE_ID || 'com.lachart.app',
      redirectURI: '',
      scopes: 'email name',
      state: '',
      nonce: crypto.randomUUID(),
    });
  } catch (e) {
    // Re-throw with the underlying ASAuthorization error code preserved so
    // the caller can distinguish a real failure from a user-cancelled
    // attempt (code 1001) without parsing free-text messages.
    const err = new Error(e?.message || 'Apple Sign In failed');
    err.code = e?.code ?? e?.errorCode;
    err.cause = e;
    throw err;
  }

  const { identityToken, givenName, familyName } = result?.response || {};

  if (!identityToken) {
    throw new Error('Apple Sign In did not return an identity token. Please try again, or use email sign-in.');
  }

  return {
    identityToken,
    user: { givenName, familyName },
  };
}
