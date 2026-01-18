/**
 * Universal Trainer Connectivity Types
 */

export type TransportType = 'ftms-ble' | 'companion' | 'ant-fec';

export interface DeviceInfo {
  id: string;
  name: string;
  transport: TransportType;
  rssi?: number;
  capabilities?: TrainerCapabilities;
}

export interface TrainerCapabilities {
  erg: boolean;
  resistance: boolean;
  slope: boolean;
  supportsControlPoint: boolean;
  telemetry: {
    power: boolean;
    cadence: boolean;
    speed: boolean;
    hr: boolean;
  };
  powerRange?: {
    min: number;
    max: number;
  };
  resistanceRange?: {
    min: number;
    max: number;
  };
}

export interface Telemetry {
  ts: number;
  power?: number;
  cadence?: number;
  speed?: number;
  hr?: number;
  connected: boolean;
}

export type TrainerStatus = 
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'ready'
  | 'controlled'
  | 'erg_active'
  | 'error';

export type UnsubscribeFn = () => void;

export interface TrainerAdapter {
  scan(options?: ScanOptions): Promise<DeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getCapabilities(): TrainerCapabilities | null;
  subscribeTelemetry(cb: (t: Telemetry) => void): UnsubscribeFn;
  setErgWatts(watts: number): Promise<void>;
  setResistance?(level: number): Promise<void>;
  setSlope?(grade: number): Promise<void>;
  requestControl?(): Promise<void>;
  start?(): Promise<void>;
}

export interface ScanOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
}

export interface TrainerClientOptions {
  preferred?: 'auto' | 'ftms' | 'companion' | 'ant';
  companionUrl?: string;
  antBridgeUrl?: string;
}

export interface TrainerState {
  devices: DeviceInfo[];
  connectedDevice: DeviceInfo | null;
  telemetry: Telemetry | null;
  capabilities: TrainerCapabilities | null;
  status: TrainerStatus;
  error: string | null;
}
