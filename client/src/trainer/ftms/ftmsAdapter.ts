/**
 * FTMS (Fitness Machine Service) Adapter
 * Implements TrainerAdapter using Web Bluetooth and FTMS protocol
 */

import { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, ScanOptions, UnsubscribeFn } from '../types.ts';
import { logger } from '../logger.js';
import { calculateBackoffDelay } from '../utils.js';
import {
  FTMS_SERVICE_UUID_STRING,
  FTMS_FEATURE_UUID_STRING,
  FTMS_INDOOR_BIKE_DATA_UUID_STRING,
  FTMS_CONTROL_POINT_UUID_STRING,
  FTMS_POWER_RANGE_UUID_STRING,
  FTMS_RESISTANCE_RANGE_UUID_STRING,
  CYCLING_POWER_SERVICE_UUID_STRING,
  CYCLING_SPEED_CADENCE_SERVICE_UUID_STRING,
  CPS_MEASUREMENT_UUID_STRING,
  CPS_CONTROL_POINT_UUID_STRING,
  CSC_MEASUREMENT_UUID_STRING,
} from './ftmsUuids.ts';
import { parseIndoorBikeData } from './ftmsParser.ts';
import {
  buildRequestControlCommand,
  buildSetTargetPowerCommand,
  buildStartOrResumeCommand,
  parseControlResponse,
  getResponseErrorMessage,
} from './ftmsControl.ts';

type TrainerState = 'disconnected' | 'connecting' | 'ready' | 'controlled' | 'erg_active' | 'error';

export class FTMSAdapter implements TrainerAdapter {
  private device: BluetoothDevice | null = null;
  private scannedDevice: BluetoothDevice | null = null; // Store device from scan
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private powerService: BluetoothRemoteGATTService | null = null; // Cycling Power Service (fallback)
  private cscService: BluetoothRemoteGATTService | null = null; // CSC Service (fallback)
  private indoorBikeDataChar: BluetoothRemoteGATTCharacteristic | null = null;
  private powerMeasurementChar: BluetoothRemoteGATTCharacteristic | null = null; // CPS measurement
  private cscMeasurementChar: BluetoothRemoteGATTCharacteristic | null = null; // CSC measurement
  private controlPointChar: BluetoothRemoteGATTCharacteristic | null = null;
  private cpsControlPointChar: BluetoothRemoteGATTCharacteristic | null = null; // FE-C control via CPS
  private cscControlPointChar: BluetoothRemoteGATTCharacteristic | null = null; // FE-C control via CSC
  private state: TrainerState = 'disconnected';
  private capabilities: TrainerCapabilities | null = null;
  private telemetryCallbacks: Set<(t: Telemetry) => void> = new Set();
  private controlRequested: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private useFTMS: boolean = false; // Track which service we're using
  private cscPreviousValues: { wheelRevolutions: number; lastWheelTime: number; crankRevolutions: number; lastCrankTime: number; timestamp: number } | null = null;

  async scan(options?: ScanOptions): Promise<DeviceInfo[]> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not available. Use Chrome, Edge, or Opera.');
    }

    logger.info('Scanning for FTMS trainers...');
    logger.info('Note: Web Bluetooth will show a device selection dialog. Please select your trainer.');

    try {
      // Web Bluetooth API limitation: requestDevice() opens a user dialog
      // We can't scan without user interaction, so we request device with FTMS service filter
      // If that doesn't work, we try with acceptAllDevices as fallback
      let device: BluetoothDevice | null = null;

      // First try with FTMS service filter
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: options?.filters || [{ services: [FTMS_SERVICE_UUID_STRING] }],
          optionalServices: options?.optionalServices || [
            FTMS_SERVICE_UUID_STRING,
            FTMS_FEATURE_UUID_STRING,
            FTMS_POWER_RANGE_UUID_STRING,
            FTMS_CONTROL_POINT_UUID_STRING,
            FTMS_RESISTANCE_RANGE_UUID_STRING,
            CYCLING_POWER_SERVICE_UUID_STRING,
            CYCLING_SPEED_CADENCE_SERVICE_UUID_STRING,
            CPS_MEASUREMENT_UUID_STRING,
            CPS_CONTROL_POINT_UUID_STRING,
            CSC_MEASUREMENT_UUID_STRING,
          ],
        });
      } catch (firstError: any) {
        // If service filter fails, try accepting all devices (user can still filter in dialog)
        logger.warn('Service filter failed, trying acceptAllDevices:', firstError.message);
        try {
          device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
              FTMS_SERVICE_UUID_STRING,
              FTMS_FEATURE_UUID_STRING,
              FTMS_POWER_RANGE_UUID_STRING,
              FTMS_CONTROL_POINT_UUID_STRING,
              FTMS_RESISTANCE_RANGE_UUID_STRING,
              CYCLING_POWER_SERVICE_UUID_STRING,
              CYCLING_SPEED_CADENCE_SERVICE_UUID_STRING,
              CPS_MEASUREMENT_UUID_STRING,
              CPS_CONTROL_POINT_UUID_STRING,
              CSC_MEASUREMENT_UUID_STRING,
            ],
          });
        } catch (secondError: any) {
          logger.error('Both scan attempts failed:', secondError);
          throw secondError;
        }
      }

      if (!device) {
        logger.warn('No device returned from requestDevice');
        return [];
      }

      // Store the scanned device for later use in connect()
      this.scannedDevice = device;

      const deviceInfo: DeviceInfo = {
        id: device.id,
        name: device.name || 'Unknown Trainer',
        transport: 'ftms-ble',
        rssi: undefined, // Web Bluetooth doesn't provide RSSI
      };

      logger.info('Found device:', deviceInfo.name, deviceInfo.id);
      return [deviceInfo];
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        logger.warn('No device selected by user');
        return [];
      }
      if (error.name === 'SecurityError') {
        logger.warn('Permission denied or security error:', error.message);
        throw new Error('Bluetooth permission denied. Please allow access and try again.');
      }
      logger.error('Scan error:', error);
      throw error;
    }
  }

  async connect(deviceId: string): Promise<void> {
    if (this.state === 'connecting' || this.state === 'ready' || this.state === 'controlled') {
      logger.warn('Already connected or connecting');
      return;
    }

    this.state = 'connecting';
    this.reconnectAttempts = 0;

    try {
      let device: BluetoothDevice | null = null;

      // First, try to use the device from scan if it matches the deviceId
      if (this.scannedDevice && this.scannedDevice.id === deviceId) {
        logger.info('Using device from scan:', this.scannedDevice.name);
        device = this.scannedDevice;
      } else {
        // If no scanned device or ID mismatch, request device again
        logger.info('Requesting device again (not found in scan cache)');
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [FTMS_SERVICE_UUID_STRING] }],
          optionalServices: [
            FTMS_SERVICE_UUID_STRING,
            FTMS_FEATURE_UUID_STRING,
            FTMS_POWER_RANGE_UUID_STRING,
            FTMS_RESISTANCE_RANGE_UUID_STRING,
            CYCLING_POWER_SERVICE_UUID_STRING,
            CYCLING_SPEED_CADENCE_SERVICE_UUID_STRING,
            CPS_MEASUREMENT_UUID_STRING,
            CPS_CONTROL_POINT_UUID_STRING,
            CSC_MEASUREMENT_UUID_STRING,
          ],
        });

        if (device.id !== deviceId) {
          throw new Error('Device ID mismatch');
        }
      }

      this.device = device;

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        logger.warn('Device disconnected');
        this.handleDisconnection();
      });

      // Connect to GATT server
      logger.info('Connecting to GATT server...');
      this.server = await device.gatt!.connect();
      logger.info('GATT server connected');

      // Try to get FTMS service first
      try {
        this.service = await this.server.getPrimaryService(FTMS_SERVICE_UUID_STRING);
        logger.info('FTMS service obtained');
        this.useFTMS = true;

        // Get capabilities
        await this.readCapabilities();

        // Get Indoor Bike Data characteristic
        this.indoorBikeDataChar = await this.service.getCharacteristic(FTMS_INDOOR_BIKE_DATA_UUID_STRING);
        await this.indoorBikeDataChar.startNotifications();
        this.indoorBikeDataChar.addEventListener('characteristicvaluechanged', (event: any) => {
          this.handleIndoorBikeData(event.target.value);
        });
        logger.info('Indoor Bike Data notifications started');

        // Get Control Point characteristic
        this.controlPointChar = await this.service.getCharacteristic(FTMS_CONTROL_POINT_UUID_STRING);
        
        // Start notifications/indications for control point responses
        try {
          await this.controlPointChar.startNotifications();
          this.controlPointChar.addEventListener('characteristicvaluechanged', (event: any) => {
            this.handleControlResponse(event.target.value);
          });
          logger.info('Control Point notifications started');
        } catch (e) {
          logger.warn('Control Point notifications not available, using write only');
        }

        this.state = 'ready';
        logger.info('FTMS adapter connected and ready');

        // Request control
        await this.requestControl();
      } catch (ftmsError: any) {
        // FTMS not available, try Cycling Power Service or CSC Service
        logger.warn('FTMS service not available, trying alternative services:', ftmsError.message);
        
        // Try Cycling Power Service
        try {
          this.powerService = await this.server.getPrimaryService(CYCLING_POWER_SERVICE_UUID_STRING);
          logger.info('Cycling Power Service obtained');
          
          // Get Power Measurement characteristic
          this.powerMeasurementChar = await this.powerService.getCharacteristic(CPS_MEASUREMENT_UUID_STRING);
          await this.powerMeasurementChar.startNotifications();
          this.powerMeasurementChar.addEventListener('characteristicvaluechanged', (event: any) => {
            const value = event.target.value as DataView;
            this.handlePowerMeasurement(value);
          });
          logger.info('Power Measurement notifications started');

          // Try to get FE-C Control Point
          try {
            this.cpsControlPointChar = await this.powerService.getCharacteristic(CPS_CONTROL_POINT_UUID_STRING);
            logger.info('FE-C Control Point found via Cycling Power Service');
          } catch (e) {
            logger.warn('FE-C Control Point not available via CPS');
          }

          // Set basic capabilities
          this.capabilities = {
            erg: !!this.cpsControlPointChar,
            resistance: false,
            slope: false,
            supportsControlPoint: !!this.cpsControlPointChar,
            telemetry: {
              power: true,
              cadence: false,
              speed: false,
              hr: false,
            },
          };

          this.state = 'ready';
          logger.info('Cycling Power Service adapter connected and ready');
        } catch (cpsError: any) {
          // Try CSC Service as last resort
          logger.warn('Cycling Power Service not available, trying CSC Service:', cpsError.message);
          
          try {
            this.cscService = await this.server.getPrimaryService(CYCLING_SPEED_CADENCE_SERVICE_UUID_STRING);
            logger.info('CSC Service obtained');
            
            // Get CSC Measurement characteristic
            this.cscMeasurementChar = await this.cscService.getCharacteristic(CSC_MEASUREMENT_UUID_STRING);
            await this.cscMeasurementChar.startNotifications();
            this.cscMeasurementChar.addEventListener('characteristicvaluechanged', (event: any) => {
              this.handleCscMeasurement(event.target.value);
            });
            logger.info('CSC Measurement notifications started');

            // Try to get FE-C Control Point via CSC Service
            try {
              // Try standard FE-C Control Point UUID
              this.cscControlPointChar = await this.cscService.getCharacteristic('00002a55-0000-1000-8000-00805f9b34fb');
              logger.info('FE-C Control Point found via CSC Service');
            } catch (e) {
              logger.warn('FE-C Control Point not available via CSC Service');
            }

            // Set basic capabilities
            this.capabilities = {
              erg: !!this.cscControlPointChar,
              resistance: false,
              slope: false,
              supportsControlPoint: !!this.cscControlPointChar,
              telemetry: {
                power: false,
                cadence: true,
                speed: true,
                hr: false,
              },
            };

            this.state = 'ready';
            logger.info('CSC Service adapter connected' + (this.cscControlPointChar ? ' (with FE-C control)' : ' (read-only)'));
          } catch (cscError: any) {
            logger.error('No supported services found (FTMS, CPS, or CSC)');
            throw new Error('Device does not support FTMS, Cycling Power Service, or CSC Service');
          }
        }
      }
    } catch (error: any) {
      this.state = 'error';
      logger.error('Connection error:', error);
      throw new Error(`Failed to connect: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.indoorBikeDataChar) {
      try {
        await this.indoorBikeDataChar.stopNotifications();
      } catch (e) {
        // Ignore
      }
      this.indoorBikeDataChar = null;
    }

    if (this.controlPointChar) {
      try {
        await this.controlPointChar.stopNotifications();
      } catch (e) {
        // Ignore
      }
      this.controlPointChar = null;
    }

    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }

    this.device = null;
    // Don't clear scannedDevice on disconnect - keep it for reconnection
    // this.scannedDevice = null;
    this.server = null;
    this.service = null;
    this.state = 'disconnected';
    this.controlRequested = false;
    this.reconnectAttempts = 0;

    // Notify telemetry subscribers
    this.telemetryCallbacks.forEach(cb => {
      cb({ ts: Date.now(), connected: false });
    });

    logger.info('Disconnected');
  }

  isConnected(): boolean {
    return this.state !== 'disconnected' && this.state !== 'error' && 
           this.device?.gatt?.connected === true;
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

    const clampedWatts = this.capabilities?.powerRange
      ? Math.max(this.capabilities.powerRange.min, Math.min(this.capabilities.powerRange.max, watts))
      : Math.max(0, Math.min(2000, watts));

    logger.info(`Setting ERG power to ${clampedWatts}W`);

    try {
      // Use FTMS control point if available
      if (this.useFTMS && this.controlPointChar) {
        if (this.state !== 'controlled' && this.state !== 'erg_active') {
          throw new Error('Control not granted. Call requestControl() first.');
        }

        const command = buildSetTargetPowerCommand(clampedWatts);
        await this.controlPointChar.writeValueWithResponse(command);
        
        // Wait for response (handled in handleControlResponse)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for control response'));
          }, 3000);

          const checkResponse = () => {
            clearTimeout(timeout);
            setTimeout(resolve, 500);
          };

          checkResponse();
        });

        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (FTMS)`);
      } else if (this.cpsControlPointChar) {
        // Use FE-C control via Cycling Power Service
        // FE-C protocol: Set Target Power (opcode 0x31, value in watts)
        const fecCommand = new Uint8Array([
          0x31, // Opcode: Set Target Power
          clampedWatts & 0xFF, // Power low byte
          (clampedWatts >> 8) & 0xFF, // Power high byte
          0x00, 0x00, 0x00 // Reserved
        ]);
        
        await this.cpsControlPointChar.writeValueWithResponse(fecCommand);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (FE-C via CPS)`);
      } else if (this.cscControlPointChar) {
        // Use FE-C control via CSC Service
        // FE-C protocol: Set Target Power (opcode 0x31, value in watts)
        const fecCommand = new Uint8Array([
          0x31, // Opcode: Set Target Power
          clampedWatts & 0xFF, // Power low byte
          (clampedWatts >> 8) & 0xFF, // Power high byte
          0x00, 0x00, 0x00 // Reserved
        ]);
        
        await this.cscControlPointChar.writeValueWithResponse(fecCommand);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (FE-C via CSC)`);
      } else {
        throw new Error('No control point available for ERG mode');
      }
    } catch (error: any) {
      logger.error('Failed to set ERG power:', error);
      throw new Error(`Failed to set ERG power: ${error.message}`);
    }
  }

  async requestControl(): Promise<void> {
    // For FTMS, request control via FTMS Control Point
    if (this.useFTMS && this.controlPointChar) {
      logger.info('Requesting control (FTMS)...');

      try {
        const command = buildRequestControlCommand();
        await this.controlPointChar.writeValueWithResponse(command);
        
        // Wait for response
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for control response'));
          }, 3000);

          setTimeout(() => {
            clearTimeout(timeout);
            if (this.controlRequested) {
              resolve();
            } else {
              reject(new Error('Control not granted'));
            }
          }, 1000);
        });

        this.state = 'controlled';
        logger.info('Control granted (FTMS)');
      } catch (error: any) {
        logger.error('Failed to request control:', error);
        throw new Error(`Failed to request control: ${error.message}`);
      }
    } else if (this.cpsControlPointChar || this.cscControlPointChar) {
      // For FE-C, control is typically granted automatically or via different protocol
      // Some trainers don't require explicit control request for FE-C
      logger.info('FE-C control - control may be granted automatically');
      this.controlRequested = true;
      this.state = 'controlled';
    } else {
      throw new Error('Control Point not available');
    }
  }

  async start(): Promise<void> {
    if (!this.controlPointChar) {
      throw new Error('Control Point not available');
    }

    logger.info('Starting trainer...');

    try {
      const command = buildStartOrResumeCommand();
      await this.controlPointChar.writeValueWithResponse(command);
      logger.info('Trainer started');
    } catch (error: any) {
      logger.error('Failed to start trainer:', error);
      throw new Error(`Failed to start trainer: ${error.message}`);
    }
  }

  private async readCapabilities(): Promise<void> {
    if (!this.service) return;

    const capabilities: TrainerCapabilities = {
      erg: false,
      resistance: false,
      slope: false,
      supportsControlPoint: !!this.controlPointChar,
      telemetry: {
        power: false,
        cadence: false,
        speed: false,
        hr: false,
      },
    };

    try {
      // Read Feature characteristic
      const featureChar = await this.service.getCharacteristic(FTMS_FEATURE_UUID_STRING);
      const featureData = await featureChar.readValue();
      const featureFlags = featureData.getUint32(0, true);

      // Parse feature flags (simplified - check FTMS spec for full flags)
      capabilities.erg = !!(featureFlags & 0x00000001); // Target Power Supported
      capabilities.resistance = !!(featureFlags & 0x00000002); // Target Resistance Level Supported
      capabilities.slope = !!(featureFlags & 0x00000004); // Target Incline Supported

      logger.info('Feature flags:', featureFlags.toString(16));
    } catch (e) {
      logger.warn('Could not read Feature characteristic:', e);
      // Assume ERG is supported if we have control point
      capabilities.erg = !!this.controlPointChar;
    }

    try {
      // Read Power Range
      const powerRangeChar = await this.service.getCharacteristic(FTMS_POWER_RANGE_UUID_STRING);
      const powerRangeData = await powerRangeChar.readValue();
      const minPower = powerRangeData.getUint16(0, true);
      const maxPower = powerRangeData.getUint16(2, true);
      const minIncrement = powerRangeData.getUint16(4, true);
      
      capabilities.powerRange = { min: minPower, max: maxPower };
      logger.info(`Power range: ${minPower}-${maxPower}W (increment: ${minIncrement}W)`);
    } catch (e) {
      logger.warn('Could not read Power Range characteristic:', e);
      // Default range
      capabilities.powerRange = { min: 0, max: 2000 };
    }

    // Telemetry capabilities will be determined from Indoor Bike Data
    // For now, assume all are available
    capabilities.telemetry = {
      power: true,
      cadence: true,
      speed: true,
      hr: false, // Will be updated when we receive data
    };

    this.capabilities = capabilities;
    logger.info('Capabilities:', capabilities);
  }

  private handleIndoorBikeData(value: DataView): void {
    const parsed = parseIndoorBikeData(value);
    if (!parsed) return;

    const telemetry: Telemetry = {
      ts: Date.now(),
      connected: true,
      power: parsed.power,
      cadence: parsed.cadence,
      speed: parsed.speed ? parsed.speed * 3.6 : undefined, // Convert m/s to km/h
      hr: parsed.heartRate,
    };

    // Update telemetry capabilities based on received data
    if (this.capabilities) {
      this.capabilities.telemetry.power = parsed.power !== undefined;
      this.capabilities.telemetry.cadence = parsed.cadence !== undefined;
      this.capabilities.telemetry.speed = parsed.speed !== undefined;
      this.capabilities.telemetry.hr = parsed.heartRate !== undefined;
    }

    // Notify all subscribers
    this.telemetryCallbacks.forEach(cb => {
      try {
        cb(telemetry);
      } catch (e) {
        logger.error('Error in telemetry callback:', e);
      }
    });
  }

  private handlePowerMeasurement(value: DataView): void {
    // Parse Cycling Power Service Measurement
    // Format: [Flags (2 bytes), Instantaneous Power (2 bytes, signed), ...]
    if (value.byteLength < 4) {
      logger.warn('Power measurement data too short');
      return;
    }

    const flags = value.getUint16(0, true);
    const powerPresent = flags & 0x01;
    
    let power: number | undefined = undefined;
    if (powerPresent && value.byteLength >= 4) {
      power = value.getInt16(2, true); // Signed 16-bit, watts
    }

    const telemetry: Telemetry = {
      ts: Date.now(),
      connected: true,
      power,
      cadence: undefined,
      speed: undefined,
      hr: undefined,
    };

    // Notify all subscribers
    this.telemetryCallbacks.forEach(cb => {
      try {
        cb(telemetry);
      } catch (e) {
        logger.error('Error in telemetry callback:', e);
      }
    });
  }

  private handleCscMeasurement(value: DataView): void {
    // Parse Cycling Speed and Cadence (CSC) Measurement
    // Format: [Flags (1 byte), Cumulative Wheel Revolutions (4 bytes, optional), Last Wheel Event Time (2 bytes, optional), Cumulative Crank Revolutions (2 bytes, optional), Last Crank Event Time (2 bytes, optional)]
    if (value.byteLength < 1) {
      logger.warn('CSC data too short');
      return;
    }

    const flagsCSC = value.getUint8(0);
    const wheelRevPresent = flagsCSC & 0x01;
    const crankRevPresent = flagsCSC & 0x02;

    let wheelRevolutions: number | null = null;
    let lastWheelTime: number | null = null;
    let crankRevolutions: number | null = null;
    let lastCrankTime: number | null = null;
    let offset = 1;

    // Wheel revolutions data (if present)
    if (wheelRevPresent && value.byteLength >= offset + 6) {
      wheelRevolutions = value.getUint32(offset, true);
      lastWheelTime = value.getUint16(offset + 4, true);
      offset += 6;
    }

    // Crank revolutions data (if present)
    if (crankRevPresent && value.byteLength >= offset + 4) {
      crankRevolutions = value.getUint16(offset, true);
      lastCrankTime = value.getUint16(offset + 2, true);
    }

    // Calculate speed and cadence from deltas
    const prev = this.cscPreviousValues;
    const now = Date.now();
    let speed: number | undefined = undefined;
    let cadence: number | undefined = undefined;

    // Calculate speed from wheel revolutions
    if (wheelRevPresent && prev && prev.wheelRevolutions !== null && prev.lastWheelTime !== null &&
        wheelRevolutions !== null && lastWheelTime !== null) {
      let wheelDelta = wheelRevolutions - prev.wheelRevolutions;
      if (wheelDelta < 0) {
        wheelDelta += 4294967296; // Rollover handling
      }

      let timeDelta = lastWheelTime - prev.lastWheelTime;
      if (timeDelta < 0) {
        timeDelta += 65536; // Rollover handling
      }
      const timeDeltaSeconds = timeDelta / 1024.0;

      if (timeDeltaSeconds > 0.01 && timeDeltaSeconds < 10.0 && wheelDelta > 0) {
        const wheelCircumference = 2.1; // meters (standard 700c wheel)
        const speed_ms = (wheelDelta * wheelCircumference) / timeDeltaSeconds;
        speed = speed_ms * 3.6; // Convert to km/h

        if (speed < 0 || speed > 100) {
          speed = undefined;
        }
      }
    }

    // Calculate cadence from crank revolutions
    if (crankRevPresent && prev && prev.crankRevolutions !== null && prev.lastCrankTime !== null &&
        crankRevolutions !== null && lastCrankTime !== null) {
      let crankDelta = crankRevolutions - prev.crankRevolutions;
      if (crankDelta < 0) {
        crankDelta += 65536; // Rollover handling
      }

      let timeDelta = lastCrankTime - prev.lastCrankTime;
      if (timeDelta < 0) {
        timeDelta += 65536; // Rollover handling
      }
      const timeDeltaSeconds = timeDelta / 1024.0;

      if (timeDeltaSeconds > 0.01 && timeDeltaSeconds < 10.0 && crankDelta > 0) {
        cadence = (crankDelta / timeDeltaSeconds) * 60; // Convert to RPM

        if (cadence < 0 || cadence > 200) {
          cadence = undefined;
        }
      }
    }

    // Store current values for next calculation
    this.cscPreviousValues = {
      wheelRevolutions,
      lastWheelTime,
      crankRevolutions,
      lastCrankTime,
      timestamp: now
    };

    const telemetry: Telemetry = {
      ts: Date.now(),
      connected: true,
      power: undefined, // Not available from CSC
      cadence,
      speed,
      hr: undefined,
    };

    // Notify all subscribers
    this.telemetryCallbacks.forEach(cb => {
      try {
        cb(telemetry);
      } catch (e) {
        logger.error('Error in telemetry callback:', e);
      }
    });
  }

  private handleControlResponse(value: DataView): void {
    const response = parseControlResponse(value);
    if (!response) return;

    logger.debug('Control response:', response);

    if (response.opcode === FTMS_OPCODE_REQUEST_CONTROL) {
      if (response.success) {
        this.controlRequested = true;
        this.state = 'controlled';
        logger.info('Control granted');
      } else {
        this.controlRequested = false;
        const errorMsg = getResponseErrorMessage(response);
        logger.error('Control not granted:', errorMsg);
        throw new Error(errorMsg);
      }
    } else if (response.opcode === FTMS_OPCODE_SET_TARGET_POWER) {
      if (response.success) {
        this.state = 'erg_active';
        logger.info('Target power set successfully');
      } else {
        const errorMsg = getResponseErrorMessage(response);
        logger.error('Failed to set target power:', errorMsg);
        throw new Error(errorMsg);
      }
    }
  }

  private handleDisconnection(): void {
    this.state = 'disconnected';
    this.controlRequested = false;
    
    // Notify subscribers
    this.telemetryCallbacks.forEach(cb => {
      cb({ ts: Date.now(), connected: false });
    });

    // Attempt reconnection with backoff
    if (this.device && this.reconnectAttempts < 5) {
      const delay = calculateBackoffDelay(this.reconnectAttempts);
      logger.info(`Attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
      
      this.reconnectTimeout = setTimeout(async () => {
        this.reconnectAttempts++;
        try {
          if (this.device) {
            await this.connect(this.device.id);
            this.reconnectAttempts = 0;
          }
        } catch (e) {
          logger.error('Reconnection failed:', e);
          this.handleDisconnection();
        }
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached');
      this.state = 'error';
    }
  }
}
