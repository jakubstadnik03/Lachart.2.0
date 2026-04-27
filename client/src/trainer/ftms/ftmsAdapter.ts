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
  TACX_FEC_SERVICE_UUID,
  TACX_FEC_CHAR2_UUID,
  TACX_FEC_CHAR3_UUID,
  WAHOO_KICKR_CONTROL_UUID,
  WAHOO_KICKR_ERG_OPCODE,
  FTMS_OPCODE_REQUEST_CONTROL,
  FTMS_OPCODE_RESET,
  FTMS_OPCODE_SET_TARGET_POWER,
  FTMS_OPCODE_SET_INDOOR_BIKE_SIMULATION_PARAMETERS,
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
  private cpsControlPointChar: BluetoothRemoteGATTCharacteristic | null = null; // CPS Control Point (calibration only — NOT for ERG)
  private cscControlPointChar: BluetoothRemoteGATTCharacteristic | null = null; // CSC Control Point
  private tacxFecTxChar: BluetoothRemoteGATTCharacteristic | null = null;       // Tacx FE-C primary write channel
  private tacxFecFallbackChar: BluetoothRemoteGATTCharacteristic | null = null; // Tacx FE-C fallback write channel (tried if primary fails)
  private wahooControlChar: BluetoothRemoteGATTCharacteristic | null = null;    // Wahoo KICKR proprietary ERG channel
  // FE-C keepalive: ANT+ FE-C requires continuous commands (~4 Hz) or trainer reverts to free-wheel
  private fecKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private fecLastTargetWatts: number | null = null;
  private state: TrainerState = 'disconnected';
  private capabilities: TrainerCapabilities | null = null;
  private telemetryCallbacks: Set<(t: Telemetry) => void> = new Set();
  private controlRequested: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private useFTMS: boolean = false; // Track which service we're using
  private cscPreviousValues: { wheelRevolutions: number | null; lastWheelTime: number | null; crankRevolutions: number | null; lastCrankTime: number | null; timestamp: number } | null = null;
  // CPS crank revolution tracking for cadence calculation
  private cpsCrankRevs: number | null = null;
  private cpsCrankTime: number | null = null;
  // CPS wheel revolution tracking for speed calculation
  private cpsWheelRevs: number | null = null;
  private cpsWheelTime: number | null = null;

  // Pending promise callbacks for FTMS control-point responses
  private pendingControlResolve: (() => void) | null = null;
  private pendingControlReject: ((err: Error) => void) | null = null;
  private pendingErgResolve: (() => void) | null = null;
  private pendingErgReject: ((err: Error) => void) | null = null;

  async scan(options?: ScanOptions): Promise<DeviceInfo[]> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not available. Use Chrome, Edge, or Opera.');
    }

    logger.info('Scanning for FTMS trainers...');
    logger.info('Note: Web Bluetooth will show a device selection dialog. Please select your trainer.');

    // IMPORTANT: the browser allows only ONE requestDevice() call per user gesture.
    // A second call after the first resolves/rejects will throw SecurityError.
    // We therefore make a single call using acceptAllDevices so the picker always
    // opens, regardless of which services the device advertises.
    const optionalServices = options?.optionalServices ?? [
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
      TACX_FEC_SERVICE_UUID,        // Tacx/Garmin proprietary FE-C BLE service
      WAHOO_KICKR_CONTROL_UUID,     // Wahoo KICKR proprietary ERG characteristic
    ];

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });

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
        rssi: undefined, // Web Bluetooth doesn't expose RSSI
      };

      logger.info('Found device:', deviceInfo.name, deviceInfo.id);
      return [deviceInfo];
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        // User dismissed the picker — not an error, just return empty
        logger.info('No device selected by user');
        return [];
      }
      if (error.name === 'SecurityError') {
        logger.warn('Bluetooth permission denied:', error.message);
        throw new Error('Bluetooth permission denied. Please allow Bluetooth access in your browser settings and try again.');
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
          acceptAllDevices: true,
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
            TACX_FEC_SERVICE_UUID,
          ],
        });

        if (device.id !== deviceId) {
          throw new Error('Device ID mismatch');
        }
      }

      this.device = device;

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', (event) => {
        logger.warn('Device disconnected', { 
          deviceId: device.id, 
          deviceName: device.name,
          state: this.state,
          gattConnected: device.gatt?.connected 
        });
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

        // Send initial telemetry update to indicate connection
        this.telemetryCallbacks.forEach(cb => {
          cb({ ts: Date.now(), connected: true });
        });

        // NOTE: requestControl() is NOT called here automatically.
        // The caller (useTrainer → TrainerConnectModal or LactateTestingPage) is
        // responsible for calling it once after connect() resolves.  Calling it
        // inside connect() caused the state to regress back to 'ready' in useTrainer
        // and triggered multiple redundant control requests.
      } catch (ftmsError: any) {
        // FTMS not available, try Cycling Power Service or CSC Service
        logger.warn('FTMS service not available, trying alternative services:', ftmsError.message);
        
        // Try Cycling Power Service
        try {
          this.powerService = await this.server.getPrimaryService(CYCLING_POWER_SERVICE_UUID_STRING);
          logger.info('Cycling Power Service obtained');
          
          // Get Power Measurement characteristic
          this.powerMeasurementChar = await this.powerService.getCharacteristic(CPS_MEASUREMENT_UUID_STRING);
          logger.info('Power Measurement characteristic obtained');
          
          // Add event listener before starting notifications
          this.powerMeasurementChar.addEventListener('characteristicvaluechanged', (event: any) => {
            const value = event.target.value as DataView;
            logger.info('CPS notification fired, byteLength:', value.byteLength);
            this.handlePowerMeasurement(value);
          });
          
          await this.powerMeasurementChar.startNotifications();
          logger.info('Power Measurement notifications started');
          
          // Verify notifications are active
          const properties = this.powerMeasurementChar.properties;
          logger.info('Power Measurement properties:', {
            broadcast: properties.broadcast,
            read: properties.read,
            write: properties.write,
            writeWithoutResponse: properties.writeWithoutResponse,
            notify: properties.notify,
            indicate: properties.indicate
          });

          // Try Tacx proprietary FE-C BLE service for ERG control.
          // (0x2A66 CPS Control Point is NOT for ERG — writing to it causes trainer disconnect.)
          // Which of FEC2/FEC3 is write vs. notify varies by firmware; auto-detect via GATT properties.
          try {
            const tacxFecService = await this.server!.getPrimaryService(TACX_FEC_SERVICE_UUID);
            const fecChar2 = await tacxFecService.getCharacteristic(TACX_FEC_CHAR2_UUID);
            const fecChar3 = await tacxFecService.getCharacteristic(TACX_FEC_CHAR3_UUID);

            const c2write  = fecChar2.properties.writeWithoutResponse || fecChar2.properties.write;
            const c2notify = fecChar2.properties.notify || fecChar2.properties.indicate;
            const c3write  = fecChar3.properties.writeWithoutResponse || fecChar3.properties.write;
            const c3notify = fecChar3.properties.notify || fecChar3.properties.indicate;

            logger.info('FE-C char2 props: write=' + c2write + ' notify=' + c2notify);
            logger.info('FE-C char3 props: write=' + c3write + ' notify=' + c3notify);

            let writeChar: BluetoothRemoteGATTCharacteristic;
            let notifyChar: BluetoothRemoteGATTCharacteristic;

            // Per Tacx FE-C BLE spec (confirmed in Tacx iOS BLE example):
            //   FEC3 = write to trainer (app → trainer, TX from app)
            //   FEC2 = notify from trainer (trainer → app, RX for app)
            // Only override if GATT properties definitively show otherwise.
            if (c2write && !c3write) {
              // FEC2 is writable and FEC3 is not → unusual, use FEC2 as write
              writeChar  = fecChar2;
              notifyChar = fecChar3;
              logger.info('FE-C direction (auto): write→FEC2, notify←FEC3');
            } else {
              // Default (and correct per Tacx spec): FEC3 = write, FEC2 = notify
              writeChar  = fecChar3;
              notifyChar = fecChar2;
              logger.info('FE-C direction (default): write→FEC3, notify←FEC2');
            }

            this.tacxFecTxChar = writeChar;
            // Keep the other char as a fallback — if the primary char rejects writes
            // at GATT level, we automatically retry on the fallback.
            this.tacxFecFallbackChar = (writeChar === fecChar3) ? fecChar2 : fecChar3;

            // Subscribe to trainer responses (optional)
            try {
              await notifyChar.startNotifications();
              notifyChar.addEventListener('characteristicvaluechanged', (event: any) => {
                const val: DataView = event.target.value;
                logger.info('Tacx FE-C response:', Array.from(new Uint8Array(val.buffer)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
              });
              logger.info('Tacx FE-C notifications subscribed');
            } catch (_) { /* notify subscription optional */ }

            logger.info('Tacx FE-C service found — ERG control available');
          } catch (_) {
            logger.info('Tacx FE-C service not available — ERG control not supported on this connection');
          }

          // Try Wahoo KICKR proprietary ERG characteristic (inside CPS service)
          if (!this.tacxFecTxChar) {
            try {
              const wahooChar = await this.powerService!.getCharacteristic(WAHOO_KICKR_CONTROL_UUID);
              this.wahooControlChar = wahooChar;
              logger.info('Wahoo KICKR proprietary characteristic found — ERG control available');
            } catch (_) {
              logger.info('Wahoo KICKR characteristic not found');
            }
          }

          // Set basic capabilities
          this.capabilities = {
            erg: !!(this.tacxFecTxChar || this.wahooControlChar),
            resistance: false,
            slope: !!this.tacxFecTxChar, // FE-C supports grade/simulation mode
            supportsControlPoint: !!(this.tacxFecTxChar || this.wahooControlChar),
            telemetry: {
              power: true,
              cadence: false,
              speed: false,
              hr: false,
            },
          };

          this.state = 'ready';
          logger.info('Cycling Power Service adapter connected' + (this.tacxFecTxChar ? ' (ERG via Tacx FE-C)' : ' (read-only, no ERG)'));
          
          // Send initial telemetry update to indicate connection
          this.telemetryCallbacks.forEach(cb => {
            cb({ ts: Date.now(), connected: true });
          });
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
            
            // Send initial telemetry update to indicate connection
            this.telemetryCallbacks.forEach(cb => {
              cb({ ts: Date.now(), connected: true });
            });
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
    // If already disconnected, just return (idempotent)
    if (this.state === 'disconnected' && !this.device) {
      logger.debug('disconnect() called but already disconnected');
      return;
    }

    logger.info('disconnect() called', { 
      state: this.state, 
      deviceId: this.device?.id,
      gattConnected: this.device?.gatt?.connected
    });

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Stop FTMS notifications
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

    // Stop FE-C (CPS) notifications
    if (this.powerMeasurementChar) {
      try {
        await this.powerMeasurementChar.stopNotifications();
      } catch (e) {
        // Ignore
      }
      this.powerMeasurementChar = null;
    }

    // Stop FE-C (CSC) notifications
    if (this.cscMeasurementChar) {
      try {
        await this.cscMeasurementChar.stopNotifications();
      } catch (e) {
        // Ignore
      }
      this.cscMeasurementChar = null;
    }

    // Stop FE-C keepalive
    if (this.fecKeepAliveTimer) {
      clearInterval(this.fecKeepAliveTimer);
      this.fecKeepAliveTimer = null;
    }
    this.fecLastTargetWatts = null;

    this.tacxFecTxChar = null;
    this.tacxFecFallbackChar = null;
    this.wahooControlChar = null;
    this.cpsControlPointChar = null;
    this.cscControlPointChar = null;

    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }

    this.device = null;
    // Don't clear scannedDevice on disconnect - keep it for reconnection
    // this.scannedDevice = null;
    this.server = null;
    this.service = null;
    this.powerService = null;
    this.cscService = null;
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

  /**
   * Build a full 13-byte ANT+ broadcast packet from 8 bytes of FE-C page data.
   *
   * The Tacx FE-C BLE service (6e40fec1) does NOT strip the ANT+ radio wrapper —
   * it passes raw ANT+ frames verbatim over BLE in both directions.  The trainer
   * sends full ANT+ packets on the notify characteristic (confirmed: every frame
   * starts with 0xa4 0x09 0x4e 0x05), and it expects exactly the same framing on
   * the write characteristic.  Sending only the 8-byte page payload causes the
   * trainer to reply with page 71 (Command Status) status=0xFF ("not applicable"),
   * meaning it ignored the write entirely.
   *
   * Packet layout (13 bytes):
   *   [0]    SYNC        0xa4
   *   [1]    LENGTH      0x09  (9 = 1 channel byte + 8 data bytes)
   *   [2]    MSG TYPE    0x4e  (broadcast data)
   *   [3]    CHANNEL     0x05  (matches trainer's broadcast channel)
   *   [4–11] FE-C page   8 bytes of ANT+ FE-C page data
   *   [12]   CHECKSUM    XOR of bytes [0]–[11]
   */
  private buildFecAntPacket(pageData: Uint8Array): Uint8Array {
    const packet = new Uint8Array(13);
    packet[0] = 0xa4; // SYNC
    packet[1] = 0x09; // LENGTH
    packet[2] = 0x4e; // MSG TYPE: broadcast data
    packet[3] = 0x05; // CHANNEL (same as trainer's broadcast channel)
    packet.set(pageData.slice(0, 8), 4);
    let checksum = 0;
    for (let i = 0; i < 12; i++) checksum ^= packet[i];
    packet[12] = checksum;
    return packet;
  }

  async setErgWatts(watts: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    const clampedWatts = this.capabilities?.powerRange
      ? Math.max(this.capabilities.powerRange.min, Math.min(this.capabilities.powerRange.max, watts))
      : Math.max(0, Math.min(2000, watts));

    logger.info(`Setting ERG power to ${clampedWatts}W`);

    // Stop FE-C keepalive if setting to 0
    if (clampedWatts === 0 && this.fecKeepAliveTimer) {
      clearInterval(this.fecKeepAliveTimer);
      this.fecKeepAliveTimer = null;
      this.fecLastTargetWatts = null;
      logger.info('FE-C keepalive stopped (power set to 0)');
    }

    try {
      // Use FTMS control point if available
      if (this.useFTMS && this.controlPointChar) {
        if (this.state !== 'controlled' && this.state !== 'erg_active') {
          throw new Error('Control not granted. Call requestControl() first.');
        }

        // Set up the response promise BEFORE writing
        const ergResponsePromise = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingErgResolve = null;
            this.pendingErgReject = null;
            // Treat as success on timeout — trainer may not send a response for every power update
            resolve();
          }, 3000);

          this.pendingErgResolve = () => {
            clearTimeout(timer);
            this.pendingErgResolve = null;
            this.pendingErgReject = null;
            resolve();
          };
          this.pendingErgReject = (err: Error) => {
            clearTimeout(timer);
            this.pendingErgResolve = null;
            this.pendingErgReject = null;
            reject(err);
          };
        });

        const command = buildSetTargetPowerCommand(clampedWatts);
        await this.controlPointChar.writeValueWithResponse(command);
        await ergResponsePromise;

        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (FTMS)`);
      } else if (this.tacxFecTxChar) {
        // Tacx proprietary FE-C BLE service — ANT+ FE-C page 49 (Set Target Power).
        // The Tacx FE-C BLE bridge passes full ANT+ frames verbatim in both directions.
        // Raw page bytes must be wrapped with ANT+ framing via buildFecAntPacket() before
        // writing, otherwise the trainer ignores the write (replies with CommandStatus=0xFF).
        // ANT+ FE-C Device Profile spec, page 49 layout:
        //   byte 0: page number 0x31
        //   bytes 1–5: reserved, all 0xFF  (5 bytes per spec)
        //   bytes 6–7: target power uint16 LE at 0.25 W/bit resolution
        const powerInQuarterWatts = Math.round(clampedWatts * 4);
        const buildFecPage49 = (): Uint8Array => new Uint8Array([
          0x31,                                // Data page 49: Set Target Power
          0xFF, 0xFF, 0xFF, 0xFF, 0xFF,        // 5 reserved bytes (per ANT+ FE-C spec)
          powerInQuarterWatts & 0xFF,          // Target power LSB (byte 6)
          (powerInQuarterWatts >> 8) & 0xFF,   // Target power MSB (byte 7)
        ]);

        logger.info(`FE-C page 49: ${clampedWatts}W (raw=${powerInQuarterWatts}) → char ${this.tacxFecTxChar.uuid}`);

        // Helper: write to a char, try with-response first, fall back to without-response
        const writeFec = async (char: BluetoothRemoteGATTCharacteristic, data: Uint8Array): Promise<boolean> => {
          try {
            if (char.properties.write) {
              await char.writeValueWithResponse(data);
            } else {
              await char.writeValueWithoutResponse(data);
            }
            return true;
          } catch (e: any) {
            // write-with-response might fail on some firmwares — retry without
            try {
              await char.writeValueWithoutResponse(data);
              return true;
            } catch {
              logger.warn(`FE-C write to ${char.uuid} failed: ${e.message}`);
              return false;
            }
          }
        };

        // Wrap the raw FE-C page in a full ANT+ broadcast packet.
        // The Tacx BLE service passes ANT+ frames verbatim — the trainer ignores
        // bare 8-byte page writes and replies with CommandStatus page 71 = 0xFF
        // ("not applicable"). Wrapping adds: SYNC(a4) LEN(09) MSG(4e) CHAN(05) + XOR checksum.
        const page = this.buildFecAntPacket(buildFecPage49());
        let ok = await writeFec(this.tacxFecTxChar, page);

        // If primary char rejected the write, swap to the fallback char automatically
        if (!ok && this.tacxFecFallbackChar) {
          logger.warn(`Primary FE-C char failed — trying fallback char ${this.tacxFecFallbackChar.uuid}`);
          ok = await writeFec(this.tacxFecFallbackChar, page);
          if (ok) {
            logger.info(`Fallback char works — making it primary for future writes`);
            [this.tacxFecTxChar, this.tacxFecFallbackChar] = [this.tacxFecFallbackChar, this.tacxFecTxChar];
          }
        }

        // Store target and start keepalive.
        // ANT+ FE-C protocol expects continuous commands at ~4 Hz or the trainer
        // reverts to free-wheel. We send at 2 Hz (every 500 ms) as a safe default.
        // Each keepalive is a full ANT+ packet (same framing as the initial command).
        this.fecLastTargetWatts = clampedWatts;
        if (!this.fecKeepAliveTimer) {
          this.fecKeepAliveTimer = setInterval(async () => {
            if (this.fecLastTargetWatts == null || !this.tacxFecTxChar) return;
            const qw = Math.round(this.fecLastTargetWatts * 4);
            const rawPage = new Uint8Array([
              0x31, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
              qw & 0xFF, (qw >> 8) & 0xFF,
            ]);
            const ka = this.buildFecAntPacket(rawPage);
            try {
              if (this.tacxFecTxChar.properties.write) {
                await this.tacxFecTxChar.writeValueWithResponse(ka);
              } else {
                await this.tacxFecTxChar.writeValueWithoutResponse(ka);
              }
            } catch {
              // Keepalive failed silently — avoid log spam
            }
          }, 500);
          logger.info('FE-C keepalive started (500 ms interval, full ANT+ framing)');
        }

        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (Tacx FE-C${ok ? '' : ' — write may have failed'})`);
      } else if (this.wahooControlChar) {
        // Wahoo KICKR / KICKR CORE / KICKR SNAP proprietary ERG command.
        // Opcode 0x42 = Set ERG Target Power, payload = uint16 LE watts.
        const wahooCmd = new Uint8Array(3);
        wahooCmd[0] = WAHOO_KICKR_ERG_OPCODE; // 0x42
        wahooCmd[1] = clampedWatts & 0xFF;
        wahooCmd[2] = (clampedWatts >> 8) & 0xFF;

        logger.info(`Sending Wahoo ERG: ${clampedWatts}W bytes: ${Array.from(wahooCmd).map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' ')}`);
        try {
          await this.wahooControlChar.writeValueWithResponse(wahooCmd);
        } catch {
          await this.wahooControlChar.writeValueWithoutResponse(wahooCmd);
        }

        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (Wahoo KICKR)`);
      } else if (this.cscControlPointChar) {
        // ANT+ FE-C page 49 (0x31) — Set Target Power (CSC fallback path)
        // Same byte layout as Tacx FE-C: 5 reserved bytes, power at bytes 6–7
        const powerInQuarterWatts = Math.round(clampedWatts * 4);
        const fecPage49 = new Uint8Array([
          0x31,
          0xFF, 0xFF, 0xFF, 0xFF, 0xFF,      // 5 reserved bytes
          powerInQuarterWatts & 0xFF,         // power LSB (byte 6)
          (powerInQuarterWatts >> 8) & 0xFF,  // power MSB (byte 7)
        ]);

        logger.info(`Sending FE-C page 49: Set Target Power ${clampedWatts}W (${powerInQuarterWatts} × 0.25 W, via CSC)`);

        try {
          await this.cscControlPointChar.writeValueWithResponse(fecPage49);
        } catch (writeErr: any) {
          logger.warn('writeValueWithResponse failed, retrying without response:', writeErr.message);
          await this.cscControlPointChar.writeValueWithoutResponse(fecPage49);
        }

        this.state = 'erg_active';
        logger.info(`ERG power set to ${clampedWatts}W (FE-C page 49 via CSC)`);
      } else {
        throw new Error('No control point available for ERG mode');
      }
    } catch (error: any) {
      logger.error('Failed to set ERG power:', error);
      throw new Error(`Failed to set ERG power: ${error.message}`);
    }
  }

  async requestControl(): Promise<void> {
    // Already controlled — no need to request again
    if (this.state === 'controlled' || this.state === 'erg_active') {
      logger.info('Already controlled, skipping requestControl');
      return;
    }

    // For FTMS, request control via FTMS Control Point
    if (this.useFTMS && this.controlPointChar) {
      logger.info('Requesting control (FTMS)...');

      try {
        // Set up the response promise BEFORE writing (so we never miss the notification)
        const responsePromise = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingControlResolve = null;
            this.pendingControlReject = null;
            // If we timed out but controlRequested is already set (response arrived just
            // before the timer fired), treat it as success.
            if (this.controlRequested) {
              resolve();
            } else {
              reject(new Error('Timeout waiting for FTMS control response (5 s)'));
            }
          }, 5000);

          this.pendingControlResolve = () => {
            clearTimeout(timer);
            this.pendingControlResolve = null;
            this.pendingControlReject = null;
            resolve();
          };
          this.pendingControlReject = (err: Error) => {
            clearTimeout(timer);
            this.pendingControlResolve = null;
            this.pendingControlReject = null;
            reject(err);
          };
        });

        // Send RESET before REQUEST_CONTROL — clears any lingering state on the trainer.
        // Many trainers (Tacx Neo, Elite, Wahoo FTMS) require this for a clean handshake.
        try {
          await this.controlPointChar.writeValueWithResponse(new Uint8Array([FTMS_OPCODE_RESET]));
          logger.info('FTMS RESET sent');
        } catch (_) {
          logger.warn('FTMS RESET skipped (not supported or timed out)');
        }

        const command = buildRequestControlCommand();
        await this.controlPointChar.writeValueWithResponse(command);

        // Now wait for the trainer's FTMS indication/notification
        await responsePromise;

        this.state = 'controlled';
        logger.info('Control granted (FTMS)');
      } catch (error: any) {
        logger.error('Failed to request control:', error);
        throw new Error(`Failed to request control: ${error.message}`);
      }
    } else if (this.tacxFecTxChar || this.wahooControlChar || this.cpsControlPointChar || this.cscControlPointChar) {
      // For FE-C / Wahoo / Tacx, control is granted automatically — no explicit request needed
      logger.info('FE-C / Tacx / Wahoo control — granted automatically');
      this.controlRequested = true;
      this.state = 'controlled';
    } else {
      throw new Error('Control Point not available');
    }
  }

  async start(): Promise<void> {
    // For FTMS, send start command
    if (this.useFTMS && this.controlPointChar) {
      logger.info('Starting trainer (FTMS)...');

      try {
        const command = buildStartOrResumeCommand();
        await this.controlPointChar.writeValueWithResponse(command);
        logger.info('Trainer started');
        return;
      } catch (error: any) {
        logger.error('Failed to start trainer:', error);
        throw new Error(`Failed to start trainer: ${error.message}`);
      }
    }

    // For FE-C / Wahoo / CPS / CSC, no explicit start command is needed —
    // the trainer responds to power commands as soon as target power is set.
    if (this.tacxFecTxChar || this.wahooControlChar || this.cpsControlPointChar || this.cscControlPointChar) {
      logger.info('FE-C / Wahoo trainer - start command not required (trainer starts when power is set)');
      return;
    }

    // No control point available
    throw new Error('Control Point not available');
  }

  /**
   * Set slope / grade for simulation mode (non-ERG).
   * Only supported on trainers with Tacx FE-C (ANT+ page 51) or FTMS simulation params.
   * @param gradePercent Grade in percent (positive = uphill, negative = downhill)
   */
  async setSlope(gradePercent: number): Promise<void> {
    if (!this.isConnected()) throw new Error('Not connected');

    const clampedGrade = Math.max(-20, Math.min(20, gradePercent));
    logger.info(`Setting slope to ${clampedGrade}%`);

    if (this.tacxFecTxChar) {
      // ANT+ FE-C page 51 (0x33) — Track Resistance
      // Grade: sint16 at bytes 4–5, 0.01% resolution (e.g. 5.0% → 500 = 0x01F4)
      // Rolling resistance coefficient: byte 6, 0.00005 per bit (0xFF = use trainer default)
      const gradeRaw = Math.round(clampedGrade * 100); // 0.01% per bit
      const fecPage51 = new Uint8Array([
        0x33,                          // Data page 51: Track Resistance
        0xFF, 0xFF,                    // Incline (reserved, use 0xFF)
        gradeRaw & 0xFF,               // Grade LSB (0.01% resolution)
        (gradeRaw >> 8) & 0xFF,        // Grade MSB
        0xFF,                          // Rolling resistance coefficient (0xFF = default)
        0xFF,                          // Wind resistance (reserved)
        0xFF,                          // Wind speed (reserved)
      ]);
      const fecPage51Packet = this.buildFecAntPacket(fecPage51);
      logger.info(`Sending FE-C page 51 (Track Resistance): ${clampedGrade}% bytes: ${Array.from(fecPage51Packet).map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' ')}`);
      try {
        if (this.tacxFecTxChar.properties.write) {
          await this.tacxFecTxChar.writeValueWithResponse(fecPage51Packet);
        } else {
          await this.tacxFecTxChar.writeValueWithoutResponse(fecPage51Packet);
        }
      } catch {
        await this.tacxFecTxChar.writeValueWithoutResponse(fecPage51Packet);
      }
      this.state = 'erg_active';
    } else if (this.useFTMS && this.controlPointChar) {
      // FTMS opcode 0x11 — Set Indoor Bike Simulation Parameters
      // wind speed (sint16, 0.001 m/s), grade (sint16, 0.01%), crr (uint8), crw (uint8)
      const gradeRaw = Math.round(clampedGrade * 100); // 0.01% per bit
      const cmd = new Uint8Array(7);
      cmd[0] = FTMS_OPCODE_SET_INDOOR_BIKE_SIMULATION_PARAMETERS; // 0x11
      // Wind speed: 0 (no wind)
      cmd[1] = 0x00; cmd[2] = 0x00;
      // Grade
      cmd[3] = gradeRaw & 0xFF;
      cmd[4] = (gradeRaw >> 8) & 0xFF;
      // Rolling resistance (0x28 = 0.0040 — typical road bike default)
      cmd[5] = 0x28;
      // Wind resistance (0x28 = 0.40 kg/m — typical upright position)
      cmd[6] = 0x28;
      logger.info(`Sending FTMS simulation params: ${clampedGrade}% grade`);
      await this.controlPointChar.writeValueWithResponse(cmd);
      this.state = 'erg_active';
    } else {
      throw new Error('Slope control not available on this trainer connection');
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
    // Parse Cycling Power Measurement (GATT 0x2A63)
    // Layout: [flags: uint16 LE] [power: sint16 LE] [optional fields per flag bits...]
    // Instantaneous Power is MANDATORY (always at bytes 2–3).
    if (value.byteLength < 4) {
      logger.warn('CPS data too short:', value.byteLength);
      return;
    }

    const flags  = value.getUint16(0, true);
    const power  = value.getInt16(2, true);

    // Walk optional fields to find crank/wheel revolution data
    // Bit 0: Pedal Power Balance Present → 1 byte (uint8)
    // Bit 1: Pedal Power Balance Reference → 0 bytes (flag only)
    // Bit 2: Accumulated Torque Source → 0 bytes (flag only)
    // Bit 3: Accumulated Torque Present → 2 bytes (uint16)
    // Bit 4: Wheel Revolution Data Present → 6 bytes (uint32 revs + uint16 event time)
    // Bit 5: Crank Revolution Data Present → 4 bytes (uint16 revs + uint16 event time)
    let offset = 4; // start right after mandatory power field

    if (flags & 0x01) offset += 1; // pedal power balance
    if (flags & 0x08) offset += 2; // accumulated torque

    // ── Wheel Revolution Data (speed) ──────────────────────────
    let speed: number | undefined = undefined;
    if (flags & 0x10) {
      if (value.byteLength >= offset + 6) {
        const wheelRevs = value.getUint32(offset, true);
        const wheelTime = value.getUint16(offset + 4, true); // 1/2048 s per unit
        if (this.cpsWheelRevs !== null && this.cpsWheelTime !== null) {
          const dRevs = (wheelRevs - this.cpsWheelRevs + 0x100000000) % 0x100000000;
          const dTime = (wheelTime  - this.cpsWheelTime  + 0x10000)     % 0x10000;
          if (dTime > 0 && dRevs > 0 && dRevs < 100) {
            const wheelCircumference = 2.105; // m — standard 700c × 25mm
            const speedMs = (dRevs * wheelCircumference) / (dTime / 2048);
            const speedKmh = speedMs * 3.6;
            if (speedKmh >= 0 && speedKmh <= 120) speed = speedKmh;
          }
        }
        this.cpsWheelRevs = wheelRevs;
        this.cpsWheelTime = wheelTime;
      }
      offset += 6;
    }

    // ── Crank Revolution Data (cadence) ────────────────────────
    let cadence: number | undefined = undefined;
    if (flags & 0x20) {
      if (value.byteLength >= offset + 4) {
        const crankRevs = value.getUint16(offset,     true);
        const crankTime = value.getUint16(offset + 2, true); // 1/1024 s per unit
        if (this.cpsCrankRevs !== null && this.cpsCrankTime !== null) {
          const dRevs = (crankRevs - this.cpsCrankRevs + 0x10000) % 0x10000;
          const dTime = (crankTime  - this.cpsCrankTime  + 0x10000) % 0x10000;
          if (dTime > 0 && dRevs >= 0 && dRevs < 30) {
            const rpm = (dRevs / (dTime / 1024)) * 60;
            if (rpm >= 0 && rpm <= 200) cadence = Math.round(rpm);
          }
        }
        this.cpsCrankRevs = crankRevs;
        this.cpsCrankTime = crankTime;
      }
    }

    const rawHex = Array.from(new Uint8Array(value.buffer))
      .map(b => b.toString(16).padStart(2, '0')).join(' ');
    logger.info(`CPS: power=${power}W cadence=${cadence ?? '—'} rpm speed=${speed != null ? speed.toFixed(1) + 'km/h' : '—'} flags=0x${flags.toString(16)} raw=[${rawHex}]`);

    const telemetry: Telemetry = {
      ts: Date.now(),
      connected: true,
      power,
      cadence,
      speed,
      hr: undefined,
    };

    this.telemetryCallbacks.forEach(cb => {
      try { cb(telemetry); } catch (e) { logger.error('Telemetry cb error:', e); }
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
    try {
      const response = parseControlResponse(value);
      if (!response) return;

      logger.debug('Control response:', response);

      if (response.opcode === FTMS_OPCODE_REQUEST_CONTROL) {
        if (response.success) {
          this.controlRequested = true;
          this.state = 'controlled';
          logger.info('Control granted');
          this.pendingControlResolve?.();
        } else {
          this.controlRequested = false;
          const errorMsg = getResponseErrorMessage(response);
          logger.error('Control not granted:', errorMsg);
          this.pendingControlReject?.(new Error(`Control not granted: ${errorMsg}`));
        }
      } else if (response.opcode === FTMS_OPCODE_SET_TARGET_POWER) {
        if (response.success) {
          this.state = 'erg_active';
          logger.info('Target power set successfully');
          this.pendingErgResolve?.();
        } else {
          const errorMsg = getResponseErrorMessage(response);
          logger.error('Failed to set target power:', errorMsg);
          this.pendingErgReject?.(new Error(`Set target power failed: ${errorMsg}`));
        }
      }
    } catch (error: any) {
      logger.error('Error handling control response:', error);
      // Don't rethrow - errors in event handlers can cause disconnections
    }
  }

  private handleDisconnection(): void {
    const previousState = this.state;
    
    // Don't handle disconnection if we're in the middle of connecting
    if (previousState === 'connecting') {
      logger.warn('Disconnection event received during connection - ignoring');
      this.state = 'error';
      return;
    }

    this.state = 'disconnected';
    this.controlRequested = false;
    
    // Notify subscribers
    this.telemetryCallbacks.forEach(cb => {
      cb({ ts: Date.now(), connected: false });
    });

    // Only attempt reconnection if we were actually connected (not during initial connection)
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
