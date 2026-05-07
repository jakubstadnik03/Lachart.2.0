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

  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

  const result = await SignInWithApple.authorize({
    clientId: process.env.REACT_APP_APPLE_BUNDLE_ID || 'net.lachart.app',
    redirectURI: '',
    scopes: 'email name',
    state: '',
    nonce: crypto.randomUUID(),
  });

  const { identityToken, givenName, familyName } = result.response;

  if (!identityToken) {
    throw new Error('Apple Sign In did not return an identity token');
  }

  return {
    identityToken,
    user: { givenName, familyName },
  };
}
