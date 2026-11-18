// Matches the server's rule in forgot-password-abl.js (resetPassword).
export const MIN_PASSWORD_LENGTH = 8;

export const RESET_LINK_INVALID =
  'This reset link is invalid or has expired. Request a new one and try again.';

/** Client-side checks before the request; returns an error message or ''. */
export function validateNewPassword(password, confirmPassword) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Your password must have at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) return 'The passwords do not match.';
  return '';
}

/**
 * Sends the new password with the token from the e-mail link.
 * `post` is axios.post (injected so the flow can be tested without a network).
 * Resolves to { type: 'success' | 'error', message }.
 */
export async function submitPasswordReset({ apiBaseUrl, token, password, confirmPassword }, post) {
  const invalid = validateNewPassword(password, confirmPassword);
  if (invalid) return { type: 'error', message: invalid };
  if (!token) return { type: 'error', message: RESET_LINK_INVALID };

  try {
    await post(`${apiBaseUrl}/user/reset-password`, { token, newPassword: password });
    return { type: 'success', message: 'Your password has been changed. Redirecting to sign in…' };
  } catch (error) {
    const status = error?.response?.status;
    if (!error?.response) {
      return { type: 'error', message: 'Could not reach the server. Check your connection and try again.' };
    }
    // The server answers an expired/garbled JWT with 500 and a wrong/used token
    // with 400; both mean the link is no good, and its messages are in Czech.
    if (status === 400 || status === 500) return { type: 'error', message: RESET_LINK_INVALID };
    return { type: 'error', message: 'Something went wrong while changing the password. Please try again.' };
  }
}
