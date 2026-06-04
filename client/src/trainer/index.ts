/**
 * Trainer Connectivity Factory
 * Creates appropriate adapter based on platform and preferences
 */

import type { TrainerAdapter, TrainerClientOptions } from './types.ts';
import { hasWebBluetooth } from './utils.js';
import { logger } from './logger.js';
import { FTMSAdapter } from './ftms/ftmsAdapter.ts';
import { CompanionAdapter } from './companion/companionAdapter.ts';
import { ANTAdapter } from './ant/antAdapter.ts';
import { CapacitorBleAdapter } from './capacitor/capacitorBleAdapter.js';

// Re-export types
export type { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, TrainerStatus, TrainerClientOptions } from './types.ts';
export { logger } from './logger.js';
export { FTMSAdapter } from './ftms/ftmsAdapter.ts';
export { CompanionAdapter } from './companion/companionAdapter.ts';
export { ANTAdapter } from './ant/antAdapter.ts';
export { useTrainer } from './react/useTrainer.js';
export { TrainerConnectModal } from './react/TrainerConnectModal.jsx';

/** Detect Capacitor native platform (iOS / Android) */
function isCapacitorNative(): boolean {
  try {
    // Capacitor sets window.Capacitor.isNativePlatform() at runtime
    const w = window as any;
    return !!(w?.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Create a trainer client adapter
 */
export function createTrainerClient(options: TrainerClientOptions = {}): TrainerAdapter {
  const { preferred = 'auto', companionUrl, antBridgeUrl } = options;

  // __TEMP_SCREENSHOT__ force companion transport for headless screenshot capture
  if (typeof window !== 'undefined' && (window as any).__USE_COMPANION__) {
    logger.info('Using Companion adapter (forced via __USE_COMPANION__)');
    return new CompanionAdapter(companionUrl);
  }

  logger.info('Creating trainer client', { preferred, hasWebBluetooth: hasWebBluetooth(), isNative: isCapacitorNative() });

  // On Capacitor native (iOS/Android), use the native BLE adapter
  if ((preferred === 'auto' || preferred === 'capacitor') && isCapacitorNative()) {
    logger.info('Using Capacitor BLE adapter (native platform)');
    return new CapacitorBleAdapter();
  }

  if (preferred === 'ftms' || (preferred === 'auto' && hasWebBluetooth())) {
    logger.info('Using FTMS adapter (Web Bluetooth)');
    return new FTMSAdapter();
  }

  if (preferred === 'companion' || preferred === 'auto') {
    logger.info('Using Companion adapter');
    return new CompanionAdapter(companionUrl);
  }

  if (preferred === 'ant') {
    logger.info('Using ANT+ adapter');
    return new ANTAdapter(antBridgeUrl);
  }

  // Fallback to companion
  logger.warn('Falling back to Companion adapter');
  return new CompanionAdapter(companionUrl);
}

/**
 * Get platform-specific message for trainer connectivity
 */
export function getPlatformMessage(): string | null {
  if (isCapacitorNative() || hasWebBluetooth()) {
    return null; // Native BLE or Web Bluetooth available
  }
  return 'Connect via Chrome on desktop, or use the mobile app for Bluetooth trainer support.';
}
