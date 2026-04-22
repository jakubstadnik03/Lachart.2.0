/**
 * Native Google Sign-In via @codetrix-studio/capacitor-google-auth
 * Plugin reads GIDClientID automatically from Info.plist on iOS.
 * Returns { credential: idToken } — same shape as @react-oauth/google.
 */
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

export async function signInWithGoogleNative() {
  // Plugin auto-reads GIDClientID from Info.plist — no manual init needed
  const result = await GoogleAuth.signIn();

  console.log('Google Sign-In result:', JSON.stringify(result));

  const idToken =
    result?.authentication?.idToken ||
    result?.idToken ||
    result?.serverAuthCode;

  if (!idToken) {
    console.error('Google Sign-In: no idToken in result', result);
    throw new Error('Google Sign-In did not return an ID token');
  }

  return { credential: idToken };
}
