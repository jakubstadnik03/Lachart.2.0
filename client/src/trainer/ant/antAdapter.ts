/**
 * ANT+ FE-C Adapter (Stub)
 * Connects to a local bridge service for ANT+ FE-C protocol
 */

import { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, UnsubscribeFn } from '../types.ts';
import { logger } from '../logger.js';

export class ANTAdapter implements TrainerAdapter {
  private bridgeUrl: string;
  private ws: WebSocket | null = null;
  private devices: DeviceInfo[] = [];
  private connectedDevice: DeviceInfo | null = null;
  private capabilities: TrainerCapabilities | null = null;
  private telemetryCallbacks: Set<(t: Telemetry) => void> = new Set();

  constructor(bridgeUrl: string = 'ws://localhost:8081/ant') {
    this.bridgeUrl = bridgeUrl;
    logger.warn('ANT+ adapter is a stub - not fully implemented');
  }

  async scan(): Promise<DeviceInfo[]> {
    logger.info('ANT+ scan not implemented (stub)');
    return [];
  }

  async connect(deviceId: string): Promise<void> {
    logger.info('ANT+ connect not implemented (stub)');
    throw new Error('ANT+ adapter not implemented');
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectedDevice = null;
    this.capabilities = null;
  }

  isConnected(): boolean {
    return false;
  }

  getCapabilities(): TrainerCapabilities | null {
    return this.capabilities;
  }

  subscribeTelemetry(cb: (t: Telemetry) => void): UnsubscribeFn {
    this.telemetryCallbacks.add(cb);
    return () => {
      this.telemetryCallbacks.delete(cb);
    };
  }

  async setErgWatts(watts: number): Promise<void> {
    throw new Error('ANT+ adapter not implemented');
  }
}
