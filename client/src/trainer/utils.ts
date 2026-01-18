/**
 * Utility functions for trainer connectivity
 */

import { TrainerCapabilities } from './types.ts';

/**
 * Detect if Web Bluetooth is available
 */
export function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * Clamp watts to supported range
 */
export function clampWatts(watts: number, capabilities?: TrainerCapabilities | null): number {
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
export function calculateBackoffDelay(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30s
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
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
export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/**
 * Convert speed from km/h to m/s
 */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}
