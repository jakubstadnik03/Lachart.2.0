/**
 * Companion Adapter
 * Implements TrainerAdapter using WebSocket communication with companion app
 */

import { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, UnsubscribeFn } from '../types.ts';
import { logger } from '../logger.js';
import { CompanionMessage } from './protocol.ts';

export class CompanionAdapter implements TrainerAdapter {
  private ws: WebSocket | null = null;
  private url: string;
  private devices: DeviceInfo[] = [];
  private connectedDevice: DeviceInfo | null = null;
  private capabilities: TrainerCapabilities | null = null;
  private telemetryCallbacks: Set<(t: Telemetry) => void> = new Set();
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
  private requestIdCounter: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = false;

  constructor(companionUrl: string = 'ws://localhost:8080/trainer') {
    this.url = companionUrl;
  }

  async scan(): Promise<DeviceInfo[]> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Scan timeout'));
      }, 10000);

      this.pendingRequests.set(requestId, {
        resolve: (devices: DeviceInfo[]) => {
          clearTimeout(timeout);
          resolve(devices);
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'scan',
        requestId,
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Connect timeout'));
      }, 10000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          const device = this.devices.find(d => d.id === deviceId);
          if (device) {
            this.connectedDevice = device;
          }
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'connect',
        requestId,
        deviceId,
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.shouldReconnect = false;
      this.send({ type: 'disconnect' });
      this.ws.close();
    }
    this.ws = null;
    this.connectedDevice = null;
    this.capabilities = null;
    
    // Notify subscribers
    this.telemetryCallbacks.forEach(cb => {
      cb({ ts: Date.now(), connected: false });
    });

    logger.info('Disconnected from companion');
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.connectedDevice !== null;
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
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Set ERG timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'setErg',
        requestId,
        watts: Math.max(0, Math.min(2000, Math.round(watts))),
      });
    });
  }

  async setResistance(level: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Set resistance timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'setResistance',
        requestId,
        level: Math.round(level),
      });
    });
  }

  async setSlope(grade: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Set slope timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'setSlope',
        requestId,
        grade,
      });
    });
  }

  async requestControl(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request control timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'requestControl',
        requestId,
      });
    });
  }

  async start(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Start timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: any) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send({
        type: 'start',
        requestId,
      });
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      logger.info(`Connecting to companion at ${this.url}...`);
      
      this.shouldReconnect = true;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        logger.info('Connected to companion');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: CompanionMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          logger.error('Failed to parse message:', e);
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        logger.warn('WebSocket closed');
        this.ws = null;
        
        // Notify subscribers
        this.telemetryCallbacks.forEach(cb => {
          cb({ ts: Date.now(), connected: false });
        });

        // Attempt reconnection
        if (this.shouldReconnect && this.reconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          this.reconnectAttempts++;
          logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          
          this.reconnectTimeout = setTimeout(() => {
            this.ensureConnected().catch(e => {
              logger.error('Reconnection failed:', e);
            });
          }, delay);
        }
      };
    });
  }

  private handleMessage(message: CompanionMessage): void {
    logger.debug('Received message:', message);

    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const pending = this.pendingRequests.get(message.requestId)!;
      this.pendingRequests.delete(message.requestId);

      if (message.type === 'ack') {
        if (message.ok) {
          pending.resolve(undefined);
        } else {
          pending.reject(new Error(message.error || 'Request failed'));
        }
      } else if (message.type === 'error') {
        pending.reject(new Error(message.error));
      }
      return;
    }

    switch (message.type) {
      case 'scanResult':
        this.devices = message.devices.map(d => ({
          ...d,
          transport: 'companion' as const,
        }));
        break;

      case 'connected':
        this.capabilities = message.capabilities;
        break;

      case 'telemetry':
        this.telemetryCallbacks.forEach(cb => {
          try {
            cb(message.telemetry);
          } catch (e) {
            logger.error('Error in telemetry callback:', e);
          }
        });
        break;

      case 'disconnected':
        this.connectedDevice = null;
        this.capabilities = null;
        break;

      case 'error':
        logger.error('Companion error:', message.error);
        break;
    }
  }

  private send(message: CompanionMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }
}
