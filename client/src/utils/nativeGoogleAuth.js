/**
 * Native Google Sign-In via @codetrix-studio/capacitor-google-auth
 *
 * Returns the Google ID token (same format as @react-oauth/google on web)
 * so it can be sent directly to /auth/google-auth backend endpoint.
 */
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

let _initialized = false;

export async function initNativeGoogleAuth() {
  if (!Capacitor.isNativePlatform() || _initialized) return;
  await GoogleAuth.initialize({
    clientId: '962857277252-7g2sbol9ucvl0unvr4m573ud2njuqt7a.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    grantOfflineAccess: false,
  });
  _initialized = true;
}

/**
 * Sign in with Google natively.
 * Returns { credential: idToken } — same shape as @react-oauth/google credentialResponse.
 * Throws on failure/cancel.
 */
export async function signInWithGoogleNative() {
  await initNativeGoogleAuth();
  const result = await GoogleAuth.signIn();
  // result.authentication.idToken is the JWT ID token
  const idToken = result?.authentication?.idToken;
  if (!idToken) throw new Error('No ID token returned from Google Sign-In');
  return { credential: idToken };
}
