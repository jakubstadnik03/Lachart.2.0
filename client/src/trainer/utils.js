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
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout = null;
  
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
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
