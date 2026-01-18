/**
 * Companion Adapter Protocol
 * WebSocket message schema for communication between web and companion app
 */

export type MessageType =
  | 'scan'
  | 'scanResult'
  | 'connect'
  | 'connected'
  | 'disconnect'
  | 'disconnected'
  | 'telemetry'
  | 'setErg'
  | 'setResistance'
  | 'setSlope'
  | 'requestControl'
  | 'start'
  | 'ack'
  | 'error';

export interface BaseMessage {
  type: MessageType;
  requestId?: string;
}

export interface ScanMessage extends BaseMessage {
  type: 'scan';
}

export interface ScanResultMessage extends BaseMessage {
  type: 'scanResult';
  devices: Array<{
    id: string;
    name: string;
    rssi?: number;
  }>;
}

export interface ConnectMessage extends BaseMessage {
  type: 'connect';
  deviceId: string;
}

export interface ConnectedMessage extends BaseMessage {
  type: 'connected';
  deviceId: string;
  capabilities: {
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
  };
}

export interface DisconnectMessage extends BaseMessage {
  type: 'disconnect';
}

export interface DisconnectedMessage extends BaseMessage {
  type: 'disconnected';
}

export interface TelemetryMessage extends BaseMessage {
  type: 'telemetry';
  telemetry: {
    ts: number;
    power?: number;
    cadence?: number;
    speed?: number;
    hr?: number;
    connected: boolean;
  };
}

export interface SetErgMessage extends BaseMessage {
  type: 'setErg';
  watts: number;
}

export interface SetResistanceMessage extends BaseMessage {
  type: 'setResistance';
  level: number;
}

export interface SetSlopeMessage extends BaseMessage {
  type: 'setSlope';
  grade: number;
}

export interface RequestControlMessage extends BaseMessage {
  type: 'requestControl';
}

export interface StartMessage extends BaseMessage {
  type: 'start';
}

export interface AckMessage extends BaseMessage {
  type: 'ack';
  ok: boolean;
  error?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  error: string;
}

export type CompanionMessage =
  | ScanMessage
  | ScanResultMessage
  | ConnectMessage
  | ConnectedMessage
  | DisconnectMessage
  | DisconnectedMessage
  | TelemetryMessage
  | SetErgMessage
  | SetResistanceMessage
  | SetSlopeMessage
  | RequestControlMessage
  | StartMessage
  | AckMessage
  | ErrorMessage;
