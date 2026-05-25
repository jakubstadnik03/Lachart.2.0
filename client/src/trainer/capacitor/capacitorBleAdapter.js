/**
 * Capacitor BLE Adapter
 * Implements TrainerAdapter using @capacitor-community/bluetooth-le for iOS/Android.
 * Used automatically when running inside a Capacitor native app.
 */

// Lazy-load BleClient so the web bundle doesn't fail when the plugin is absent
let _BleClient = null;
const getBleClient = async () => {
  if (!_BleClient) {
    const mod = await import('@capacitor-community/bluetooth-le');
    _BleClient = mod.BleClient;
    await _BleClient.initialize({ androidNeverForLocation: true });
  }
  return _BleClient;
};

// GATT Service / Characteristic UUIDs
const FTMS_SERVICE  = '00001826-0000-1000-8000-00805f9b34fb';
const CPS_SERVICE   = '00001818-0000-1000-8000-00805f9b34fb';
const CSC_SERVICE   = '00001816-0000-1000-8000-00805f9b34fb';

const FTMS_IBD_CHAR = '00002ad2-0000-1000-8000-00805f9b34fb'; // Indoor Bike Data
const FTMS_CTRL     = '00002ad9-0000-1000-8000-00805f9b34fb'; // FTMS Control Point
const CPS_MEAS      = '00002a63-0000-1000-8000-00805f9b34fb'; // Cycling Power Measurement
const CSC_MEAS      = '00002a5b-0000-1000-8000-00805f9b34fb'; // CSC Measurement
const SC_CTRL       = '00002a55-0000-1000-8000-00805f9b34fb'; // SC Control Point (FE-C)

export class CapacitorBleAdapter {
  constructor() {
    this._deviceId   = null;
    this._deviceName = null;
    this._capabilities    = null;
    this._telemetryCbs    = new Set();
    this._state           = 'disconnected';
    this._ctrlServiceUUID = null;
    this._ctrlCharUUID    = null;
    this._ctrlType        = null; // 'ftms' | 'fec'
    this._ctrlRequested   = false;
    this._pendingDevice   = null;

    // CSC delta tracking
    this._cscWheelRevs = null;
    this._cscWheelTime = null;
    this._cscCrankRevs = null;
    this._cscCrankTime = null;

    // CPS delta tracking
    this._cpsCrankRevs = null;
    this._cpsCrankTime = null;
    this._cpsWheelRevs = null;
    this._cpsWheelTime = null;
  }

  // ─── TrainerAdapter interface ──────────────────────────────────

  /** Expose internal state so useTrainer.js can read adapterRef.current.state */
  get state() { return this._state; }

  async scan() {
    const BleClient = await getBleClient();

    let device;
    try {
      device = await BleClient.requestDevice({
        services: [FTMS_SERVICE, CPS_SERVICE],
        optionalServices: [CSC_SERVICE],
      });
    } catch (err) {
      if (/cancel|dismiss|user cancel/i.test(err?.message || '')) {
        return []; // User dismissed picker — not an error
      }
      throw err;
    }

    this._pendingDevice = device;
    return [{
      id:        device.deviceId,
      name:      device.name || 'Unknown Trainer',
      transport: 'capacitor-ble',
    }];
  }

  async connect(deviceId) {
    const BleClient = await getBleClient();

    const device = this._pendingDevice;
    if (!device || device.deviceId !== deviceId) {
      throw new Error('Device not found. Please scan again and select your trainer.');
    }

    // Connect with disconnect callback
    await BleClient.connect(device.deviceId, (_id) => {
      console.log('[CapacitorBLE] Trainer disconnected');
      this._deviceId = null;
      this._state = 'disconnected';
      this._ctrlRequested = false;
      this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: false }));
    });

    this._deviceId   = device.deviceId;
    this._deviceName = device.name || deviceId;

    let hasFTMS = false;
    let hasCPS  = false;
    let hasCSC  = false;

    // Try FTMS Indoor Bike Data (preferred — gives power + cadence + speed)
    try {
      await BleClient.startNotifications(
        deviceId, FTMS_SERVICE, FTMS_IBD_CHAR,
        (value) => this._handleFtmsData(value),
      );
      hasFTMS = true;
      console.log('[CapacitorBLE] FTMS Indoor Bike Data notifications started');

      // Subscribe to FTMS Control Point indications so the trainer will
      // accept control commands (many trainers silently reject CP writes
      // unless the CCCD is enabled first).
      try {
        await BleClient.startNotifications(
          deviceId, FTMS_SERVICE, FTMS_CTRL,
          (value) => {
            if (value.byteLength >= 3 && value.getUint8(0) === 0x80) {
              const requestOpcode = value.getUint8(1);
              const resultCode    = value.getUint8(2);
              console.log(`[CapacitorBLE] FTMS CP response: req=0x${requestOpcode.toString(16)} result=${resultCode}`);
            }
          },
        );
        console.log('[CapacitorBLE] FTMS Control Point indications subscribed');
      } catch (e) {
        console.warn('[CapacitorBLE] FTMS CP indication subscribe failed (non-fatal):', e.message);
      }
    } catch (e) {
      console.warn('[CapacitorBLE] FTMS IBD not available:', e.message);
    }

    // Fallback: Cycling Power Service
    if (!hasFTMS) {
      try {
        await BleClient.startNotifications(
          deviceId, CPS_SERVICE, CPS_MEAS,
          (value) => this._handlePowerData(value),
        );
        hasCPS = true;
        console.log('[CapacitorBLE] CPS power notifications started');
      } catch (e) {
        console.warn('[CapacitorBLE] CPS not available:', e.message);
      }
    }

    // CSC for speed + cadence (even alongside FTMS/CPS)
    try {
      await BleClient.startNotifications(
        deviceId, CSC_SERVICE, CSC_MEAS,
        (value) => this._handleCscData(value),
      );
      hasCSC = true;
      console.log('[CapacitorBLE] CSC speed/cadence notifications started');
    } catch (e) {
      console.warn('[CapacitorBLE] CSC not available:', e.message);
    }

    if (!hasFTMS && !hasCPS && !hasCSC) {
      await BleClient.disconnect(deviceId).catch(() => {});
      throw new Error('No supported BLE services found on this trainer (FTMS, CPS, or CSC required).');
    }

    // Determine ERG control route.
    // Many trainers (Wahoo Kickr, Saris H3, Stages SB20) advertise CPS in their
    // advertisement packet but expose the FTMS Control Point post-connect.
    // When IBD subscription failed (hasFTMS=false) probe the FTMS Control Point
    // independently — if it accepts OP_REQUEST_CONTROL (0x00) we have full ERG.
    if (hasFTMS) {
      this._ctrlServiceUUID = FTMS_SERVICE;
      this._ctrlCharUUID    = FTMS_CTRL;
      this._ctrlType        = 'ftms';
    } else if (hasCPS) {
      // Probe FTMS Control Point even though IBD was unavailable.
      // We only probe write-ability — do NOT set _ctrlRequested here so that
      // requestControl() will still run the full RESET + REQUEST_CONTROL sequence.
      let ftmsErgCapable = false;
      try {
        const reqCtrl = new DataView(new ArrayBuffer(1));
        reqCtrl.setUint8(0, 0x00); // OP_REQUEST_CONTROL (probe only)
        await BleClient.writeWithResponse(deviceId, FTMS_SERVICE, FTMS_CTRL, reqCtrl);
        ftmsErgCapable = true;
        console.log('[CapacitorBLE] FTMS Control Point writable — ERG enabled on CPS data path.');

        // Also subscribe to FTMS CP indications so trainer accepts future commands.
        try {
          await BleClient.startNotifications(
            deviceId, FTMS_SERVICE, FTMS_CTRL,
            (value) => {
              if (value.byteLength >= 3 && value.getUint8(0) === 0x80) {
                const requestOpcode = value.getUint8(1);
                const resultCode    = value.getUint8(2);
                console.log(`[CapacitorBLE] FTMS CP response: req=0x${requestOpcode.toString(16)} result=${resultCode}`);
              }
            },
          );
          console.log('[CapacitorBLE] FTMS Control Point indications subscribed (CPS path)');
        } catch (e) {
          console.warn('[CapacitorBLE] FTMS CP indication subscribe failed (non-fatal):', e.message);
        }
      } catch (e) {
        console.log('[CapacitorBLE] FTMS Control Point not writable — CPS read-only mode.', e.message);
      }

      if (ftmsErgCapable) {
        this._ctrlServiceUUID = FTMS_SERVICE;
        this._ctrlCharUUID    = FTMS_CTRL;
        this._ctrlType        = 'ftms';
      }
      // else: _ctrlServiceUUID stays null → truly read-only CPS
    } else if (hasCSC) {
      this._ctrlServiceUUID = CSC_SERVICE;
      this._ctrlCharUUID    = SC_CTRL;
      this._ctrlType        = 'fec';
    }

    this._capabilities = {
      erg:                 !!(this._ctrlServiceUUID),
      resistance:          false,
      slope:               false,
      supportsControlPoint: !!(this._ctrlServiceUUID),
      powerRange:          { min: 0, max: 2000 },
      telemetry: {
        power:   hasFTMS || hasCPS,
        cadence: hasFTMS || hasCSC,
        speed:   hasFTMS || hasCSC,
        hr:      false,
      },
    };

    this._state = 'ready';
    this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: true }));
  }

  async disconnect() {
    if (this._deviceId) {
      const BleClient = await getBleClient();
      try { await BleClient.disconnect(this._deviceId); } catch (_) {}
      this._deviceId = null;
    }
    this._state = 'disconnected';
    this._ctrlRequested = false;
    this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: false }));
  }

  isConnected() {
    return this._state !== 'disconnected' && this._state !== 'error' && this._deviceId !== null;
  }

  getCapabilities() {
    return this._capabilities;
  }

  subscribeTelemetry(cb) {
    this._telemetryCbs.add(cb);
    return () => this._telemetryCbs.delete(cb);
  }

  async requestControl() {
    if (!this._deviceId || !this._ctrlServiceUUID || this._ctrlRequested) return;

    const BleClient = await getBleClient();
    const write = async (bytes) => {
      await BleClient.write(
        this._deviceId, this._ctrlServiceUUID, this._ctrlCharUUID,
        new DataView(bytes.buffer),
      );
    };

    if (this._ctrlType === 'ftms') {
      // FTMS: send RESET (0x01) then REQUEST_CONTROL (0x00)
      try {
        await write(new Uint8Array([0x01])); // RESET
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.warn('[CapacitorBLE] FTMS RESET skipped:', e.message);
      }
      try {
        await write(new Uint8Array([0x00])); // REQUEST_CONTROL
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn('[CapacitorBLE] FTMS REQUEST_CONTROL skipped:', e.message);
      }
    } else if (this._ctrlType === 'fec') {
      try {
        await write(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn('[CapacitorBLE] FE-C request control skipped:', e.message);
      }
    }

    this._ctrlRequested = true;
    this._state = 'controlled';
  }

  async start() {
    // Send START_RESUME (opcode 0x07) to FTMS trainers that require it
    // before they accept SET_TARGET_POWER commands.
    if (!this._deviceId || this._ctrlType !== 'ftms' || !this._ctrlServiceUUID) return;
    try {
      const BleClient = await getBleClient();
      const cmd = new DataView(new Uint8Array([0x07]).buffer);
      await BleClient.write(this._deviceId, this._ctrlServiceUUID, this._ctrlCharUUID, cmd);
      console.log('[CapacitorBLE] FTMS START_RESUME sent');
    } catch (e) {
      console.warn('[CapacitorBLE] START_RESUME failed (non-fatal):', e.message);
    }
  }

  async setErgWatts(watts) {
    if (!this._deviceId || !this._ctrlServiceUUID) {
      throw new Error('Not connected or ERG control not available');
    }

    const BleClient = await getBleClient();
    const write = async (bytes) => {
      await BleClient.write(
        this._deviceId, this._ctrlServiceUUID, this._ctrlCharUUID,
        new DataView(bytes.buffer),
      );
    };

    const clamped = Math.max(0, Math.min(2000, Math.round(watts)));

    if (this._ctrlType === 'ftms') {
      // FTMS opcode 0x05 = Set Target Power (uint16 LE, watts)
      const cmd = new Uint8Array([
        0x05,
        clamped & 0xFF,
        (clamped >> 8) & 0xFF,
      ]);
      await write(cmd);
    } else if (this._ctrlType === 'fec') {
      // FE-C via CSC Control Point
      if (!this._ctrlRequested) {
        await write(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        await new Promise(r => setTimeout(r, 300));
        this._ctrlRequested = true;
      }

      // Set ERGO mode (opcode 0x05, mode 0x04)
      await write(new Uint8Array([0x05, 0x00, 0x00, 0x00, 0x04, 0x00]));
      await new Promise(r => setTimeout(r, 500));

      // Set Target Power (opcode 0x01, power in 0.1 W units)
      const pTenths = Math.round(clamped * 10);
      await write(new Uint8Array([
        0x01, 0x00, 0x00, 0x00,
        pTenths & 0xFF,
        (pTenths >> 8) & 0xFF,
      ]));
    }

    this._state = 'erg_active';
    console.log(`[CapacitorBLE] ERG set to ${clamped}W (${this._ctrlType})`);
  }

  async setResistance(_level) {
    throw new Error('Resistance control not available via native BLE');
  }

  async setSlope(_grade) {
    throw new Error('Slope control not available via native BLE');
  }

  // ─── Telemetry parsers ─────────────────────────────────────────

  _handleFtmsData(dataView) {
    if (dataView.byteLength < 4) return;
    const flags = dataView.getUint16(0, true);
    let offset = 2;

    let speed, cadence, power, hr;

    // Bit 0: More Data (0 = instantaneous speed present)
    if (!(flags & 0x0001)) {
      if (dataView.byteLength >= offset + 2) {
        speed = dataView.getUint16(offset, true) * 0.01; // 0.01 km/h per unit
        offset += 2;
      }
    }
    if (flags & 0x0002) offset += 2; // average speed
    if (flags & 0x0004) {
      if (dataView.byteLength >= offset + 2) {
        cadence = dataView.getUint16(offset, true) * 0.5; // 0.5 rpm per unit
        offset += 2;
      }
    }
    if (flags & 0x0008) offset += 2; // average cadence
    if (flags & 0x0010) offset += 3; // total distance
    if (flags & 0x0020) offset += 2; // resistance level
    if (flags & 0x0040) {
      if (dataView.byteLength >= offset + 2) {
        power = dataView.getInt16(offset, true); // watts, signed
        offset += 2;
      }
    }
    if (flags & 0x0080) offset += 2; // average power
    if (flags & 0x0100) offset += 5; // total energy (3) + energy/hour (2)
    if (flags & 0x0200) {
      if (dataView.byteLength >= offset + 1) {
        hr = dataView.getUint8(offset);
        offset += 1;
      }
    }

    this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: true, power, cadence, speed, hr }));
  }

  _handlePowerData(dataView) {
    // Cycling Power Measurement: flags(2) + instant power(sint16) + ...
    if (dataView.byteLength < 4) return;
    const flags  = dataView.getUint16(0, true);
    const power  = dataView.getInt16(2, true);

    let offset = 4;
    if (flags & 0x01) offset += 1; // pedal power balance
    if (flags & 0x08) offset += 2; // accumulated torque

    // Wheel revolutions (speed)
    let speed;
    if (flags & 0x10 && dataView.byteLength >= offset + 6) {
      const revs = dataView.getUint32(offset, true);
      const time = dataView.getUint16(offset + 4, true);
      if (this._cpsWheelRevs !== null) {
        const dr = (revs - this._cpsWheelRevs + 0x100000000) % 0x100000000;
        const dt = (time - this._cpsWheelTime + 0x10000) % 0x10000;
        if (dt > 0 && dr > 0 && dr < 100) {
          const s = (dr * 2.105) / (dt / 2048) * 3.6;
          if (s >= 0 && s <= 120) speed = s;
        }
      }
      this._cpsWheelRevs = revs;
      this._cpsWheelTime = time;
      offset += 6;
    }

    // Crank revolutions (cadence)
    let cadence;
    if (flags & 0x20 && dataView.byteLength >= offset + 4) {
      const revs = dataView.getUint16(offset, true);
      const time = dataView.getUint16(offset + 2, true);
      if (this._cpsCrankRevs !== null) {
        const dr = (revs - this._cpsCrankRevs + 0x10000) % 0x10000;
        const dt = (time - this._cpsCrankTime + 0x10000) % 0x10000;
        if (dt > 0 && dr >= 0 && dr < 30) {
          const rpm = (dr / (dt / 1024)) * 60;
          if (rpm >= 0 && rpm <= 200) cadence = Math.round(rpm);
        }
      }
      this._cpsCrankRevs = revs;
      this._cpsCrankTime = time;
    }

    this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: true, power, cadence, speed }));
  }

  _handleCscData(dataView) {
    if (dataView.byteLength < 1) return;
    const flags = dataView.getUint8(0);
    let offset = 1;

    let speed, cadence;

    if (flags & 0x01 && dataView.byteLength >= offset + 6) {
      const revs = dataView.getUint32(offset, true);
      const time = dataView.getUint16(offset + 4, true);
      if (this._cscWheelRevs !== null) {
        const dr = (revs - this._cscWheelRevs + 0x100000000) % 0x100000000;
        const dt = (time - this._cscWheelTime + 0x10000) % 0x10000;
        if (dt > 0 && dr > 0 && dr < 200) {
          const s = (dr * 2.105 / (dt / 1024)) * 3.6;
          if (s >= 0 && s <= 120) speed = s;
        }
      }
      this._cscWheelRevs = revs;
      this._cscWheelTime = time;
      offset += 6;
    }

    if (flags & 0x02 && dataView.byteLength >= offset + 4) {
      const revs = dataView.getUint16(offset, true);
      const time = dataView.getUint16(offset + 2, true);
      if (this._cscCrankRevs !== null) {
        const dr = (revs - this._cscCrankRevs + 0x10000) % 0x10000;
        const dt = (time - this._cscCrankTime + 0x10000) % 0x10000;
        if (dt > 0 && dr >= 0 && dr < 30) {
          const rpm = (dr / (dt / 1024)) * 60;
          if (rpm >= 0 && rpm <= 200) cadence = Math.round(rpm);
        }
      }
      this._cscCrankRevs = revs;
      this._cscCrankTime = time;
    }

    this._telemetryCbs.forEach(cb => cb({ ts: Date.now(), connected: true, cadence, speed }));
  }
}
