/**
 * Cold-start retry for the authentication POSTs.
 *
 * Render puts the API to sleep when it is idle. The first request wakes it,
 * but anything that arrives before Express is listening is answered by
 * Render's gateway with a 502 — and a gateway 502 carries no
 * Access-Control-Allow-Origin header, so the browser reports it as a CORS
 * failure. That is how a sleeping server shows up in the console as:
 *
 *   Access to XMLHttpRequest at '…/user/google-auth' has been blocked by CORS
 *   policy: No 'Access-Control-Allow-Origin' header is present
 *   POST …/user/google-auth net::ERR_FAILED 502 (Bad Gateway)
 *
 * Nothing is wrong with the server's CORS config and nothing is wrong with
 * the route — the request simply never reached either. Observed on
 * 2026-10-15: /health reported 135s of uptime on a 20-hour-old commit, so the
 * process had just booted when the Google sign-in failed.
 *
 * GETs through the `api` axios instance already retry on 502/503/504. The
 * sign-in POSTs did not, so a visitor who opened a cold site and clicked
 * "Sign in with Google" got a dead button and a message blaming their
 * internet connection.
 *
 * Retrying these POSTs is safe: a connection-level failure (network error,
 * timeout, or a gateway 5xx) means no response came back from our app at
 * all, so nothing was processed and there is nothing to duplicate. Token
 * verification and find-or-create are idempotent besides. We deliberately do
 * NOT retry on a response the app itself produced — a 4xx, or a 429 — since
 * that one did run.
 */

/** Auth POSTs that are safe to repeat when the request never reached the app. */
const RETRYABLE_AUTH_PATHS = ['/google-auth', '/apple-auth'];

/** Status codes that mean "the gateway answered, our app did not". */
const COLD_START_STATUSES = [502, 503, 504];

/** Boot takes ~20-40s on Render, so the waits have to add up to more than that. */
const RETRY_WAITS_MS = [2000, 4000, 8000, 12000];

export function isRetryableAuthPath(url) {
  if (!url) return false;
  return RETRYABLE_AUTH_PATHS.some((path) => String(url).includes(path));
}

export function isColdStartStatus(status) {
  return COLD_START_STATUSES.includes(status);
}

export { COLD_START_STATUSES, RETRY_WAITS_MS };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() that survives a sleeping API.
 *
 * For the `fetch`-based sign-in call sites (sign-up, settings, tester login),
 * which don't go through the axios instance and so never got its retry.
 * Retries only on a thrown network error or a gateway 5xx; any response the
 * app produced itself is returned to the caller untouched.
 *
 * @param {() => void} [onRetry] called before each wait, so the UI can say
 *   that the server is waking up instead of showing a failure.
 */
export async function fetchWithColdStartRetry(url, options = {}, onRetry) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!isColdStartStatus(response.status) || attempt === RETRY_WAITS_MS.length) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_WAITS_MS.length) throw error;
    }

    if (onRetry) onRetry(attempt + 1);
    await wait(RETRY_WAITS_MS[attempt]);
  }

  // Unreachable: the loop either returns a response or throws above.
  throw lastError || new Error('Request failed');
}
