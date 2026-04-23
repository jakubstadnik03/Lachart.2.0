/**
 * Utility functions for trainer connectivity
 */

/**
 * Detect if Web Bluetooth is available
 */
export function hasWebBluetooth() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * Clamp watts to supported range
 */
export function clampWatts(watts, capabilities) {
  if (capabilities?.powerRange) {
    return Math.max(
      capabilities.powerRange.min,
      Math.min(capabilities.powerRange.max, watts)
    );
  }
  // Default range: 0-2000W
  return Math.max(0, Math.min(2000, watts));
}

/**
 * Exponential backoff for reconnection
 */
export function calculateBackoffDelay(attempt, baseDelay = 1000) {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30s
}

/**
 * Debounce function — returns the promise from the wrapped async fn so callers
 * can await / catch errors. Each call resets the timer; the latest call wins.
 */
export function debounce(func, wait) {
  let timeout = null;
  let resolvePending = null;

  return function executedFunction(...args) {
    // Return a promise that resolves/rejects when the debounced fn finally runs
    return new Promise((resolve, reject) => {
      // Cancel previous pending call's promise (resolve it as a no-op)
      if (resolvePending) resolvePending();

      resolvePending = resolve;

      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(() => {
        timeout = null;
        resolvePending = null;
        Promise.resolve(func(...args)).then(resolve, reject);
      }, wait);
    });
  };
}

/**
 * Convert speed from m/s to km/h
 */
export function msToKmh(ms) {
  return ms * 3.6;
}

/**
 * Convert speed from km/h to m/s
 */
export function kmhToMs(kmh) {
  return kmh / 3.6;
}
