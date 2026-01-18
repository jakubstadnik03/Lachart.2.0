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

// Re-export types
export type { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, TrainerStatus, TrainerClientOptions } from './types.ts';
export { logger } from './logger.js';
export { FTMSAdapter } from './ftms/ftmsAdapter.ts';
export { CompanionAdapter } from './companion/companionAdapter.ts';
export { ANTAdapter } from './ant/antAdapter.ts';
export { useTrainer } from './react/useTrainer.js';
export { TrainerConnectModal } from './react/TrainerConnectModal.jsx';

/**
 * Create a trainer client adapter
 */
export function createTrainerClient(options: TrainerClientOptions = {}): TrainerAdapter {
  const { preferred = 'auto', companionUrl, antBridgeUrl } = options;

  logger.info('Creating trainer client', { preferred, hasWebBluetooth: hasWebBluetooth() });

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
  if (hasWebBluetooth()) {
    return null; // Web Bluetooth available
  }
  return 'iOS requires LaChart Link companion app for trainer connectivity.';
}
