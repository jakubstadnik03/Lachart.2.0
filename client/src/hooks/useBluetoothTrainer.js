/**
 * useBluetoothTrainer
 * ───────────────────
 * React hook for connecting to a smart trainer via Web Bluetooth API.
 *
 * Supported protocol: Fitness Machine Service (FTMS) – UUID 0x1826
 *   • Indoor Bike Data characteristic  – UUID 0x2AD2  (notify, read power/cadence/speed)
 *   • Fitness Machine Control Point    – UUID 0x2AD9  (write – ERG power targets)
 *
 * Usage:
 *   const trainer = useBluetoothTrainer();
 *   await trainer.connect();
 *   trainer.setPower(250);   // ERG: set 250 W
 *   trainer.disconnect();
 */
import { useState, useRef, useCallback, useEffect } from 'react';

// FTMS UUIDs (Bluetooth SIG assigned numbers)
const FTMS_SERVICE            = 0x1826;
const INDOOR_BIKE_DATA_CHAR   = 0x2AD2;
const CONTROL_POINT_CHAR      = 0x2AD9;

// FTMS Control Point opcodes
const OP_REQUEST_CONTROL       = 0x00;
const OP_RESET                 = 0x01;
const OP_SET_TARGET_POWER      = 0x05;
const OP_START_RESUME          = 0x07;

/** Parse Indoor Bike Data notification (Bluetooth LE little-endian) */
function parseIndoorBikeData(dataView) {
  // Flags field (16-bit)
  const flags = dataView.getUint16(0, true);
  let offset = 2;

  const hasInstSpeed          = !(flags & 0x0001); // bit 0 = 0 means present
  const hasAvgSpeed           = !!(flags & 0x0002);
  const hasInstCadence        = !!(flags & 0x0004);
  const hasAvgCadence         = !!(flags & 0x0008);
  const hasTotalDistance      = !!(flags & 0x0010);
  const hasResistanceLevel    = !!(flags & 0x0020);
  const hasInstPower          = !!(flags & 0x0040);
  const hasAvgPower           = !!(flags & 0x0080);
  const hasExpendedEnergy     = !!(flags & 0x0100);
  const hasHeartRate          = !!(flags & 0x0200);
  const hasMetabolicEquivalent= !!(flags & 0x0400);
  const hasElapsedTime        = !!(flags & 0x0800);
  const hasRemainingTime      = !!(flags & 0x1000);

  const result = {};

  if (hasInstSpeed && offset + 2 <= dataView.byteLength) {
    result.speed = dataView.getUint16(offset, true) * 0.01; // km/h
    offset += 2;
  }
  if (hasAvgSpeed && offset + 2 <= dataView.byteLength) {
    result.avgSpeed = dataView.getUint16(offset, true) * 0.01;
    offset += 2;
  }
  if (hasInstCadence && offset + 2 <= dataView.byteLength) {
    result.cadence = dataView.getUint16(offset, true) * 0.5; // rpm
    offset += 2;
  }
  if (hasAvgCadence && offset + 2 <= dataView.byteLength) {
    result.avgCadence = dataView.getUint16(offset, true) * 0.5;
    offset += 2;
  }
  if (hasTotalDistance && offset + 3 <= dataView.byteLength) {
    result.distance = (dataView.getUint8(offset) | (dataView.getUint8(offset+1)<<8) | (dataView.getUint8(offset+2)<<16)); // m
    offset += 3;
  }
  if (hasResistanceLevel && offset + 2 <= dataView.byteLength) {
    result.resistance = dataView.getInt16(offset, true);
    offset += 2;
  }
  if (hasInstPower && offset + 2 <= dataView.byteLength) {
    result.power = dataView.getInt16(offset, true); // W (signed)
    offset += 2;
  }
  if (hasAvgPower && offset + 2 <= dataView.byteLength) {
    result.avgPower = dataView.getInt16(offset, true);
    offset += 2;
  }
  if (hasExpendedEnergy && offset + 5 <= dataView.byteLength) {
    result.totalEnergy     = dataView.getUint16(offset, true);     // kcal
    result.energyPerHour   = dataView.getUint16(offset+2, true);
    result.energyPerMinute = dataView.getUint8(offset+4);
    offset += 5;
  }
  if (hasHeartRate && offset + 1 <= dataView.byteLength) {
    result.heartRate = dataView.getUint8(offset);
    offset += 1;
  }
  // GATT field order after HR: metabolic equivalent (1 B) → elapsed (2 B) → remaining (2 B)
  if (hasMetabolicEquivalent && offset + 1 <= dataView.byteLength) {
    offset += 1;
  }
  if (hasElapsedTime && offset + 2 <= dataView.byteLength) {
    result.elapsedTime = dataView.getUint16(offset, true); // s
    offset += 2;
  }
  if (hasRemainingTime && offset + 2 <= dataView.byteLength) {
    offset += 2;
  }

  return result;
}

export default function useBluetoothTrainer() {
  const [status, setStatus] = useState('disconnected'); // 'disconnected'|'connecting'|'connected'|'error'
  const [deviceName, setDeviceName] = useState(null);
  const [data, setData] = useState({ power: null, cadence: null, speed: null, heartRate: null });
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  const deviceRef        = useRef(null);
  const serverRef        = useRef(null);
  const controlPointRef  = useRef(null);
  const controlGranted   = useRef(false);

  // Check Web Bluetooth support
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.bluetooth);
  }, []);

  /** Handle device disconnect (e.g. trainer turned off) */
  const handleDisconnected = useCallback(() => {
    setStatus('disconnected');
    setDeviceName(null);
    controlGranted.current = false;
    controlPointRef.current = null;
    serverRef.current = null;
    deviceRef.current = null;
    setData({ power: null, cadence: null, speed: null, heartRate: null });
  }, []);

  /** Connect to a FTMS trainer */
  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setError('Web Bluetooth is not supported in this browser.');
      setStatus('error');
      return false;
    }
    try {
      setStatus('connecting');
      setError(null);

      // Scan for devices advertising FTMS service
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
        optionalServices: [FTMS_SERVICE],
      });

      deviceRef.current = device;
      setDeviceName(device.name || 'Smart Trainer');
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      serverRef.current = server;

      const service = await server.getPrimaryService(FTMS_SERVICE);

      // Subscribe to Indoor Bike Data notifications
      try {
        const ibdChar = await service.getCharacteristic(INDOOR_BIKE_DATA_CHAR);
        await ibdChar.startNotifications();
        ibdChar.addEventListener('characteristicvaluechanged', (event) => {
          const parsed = parseIndoorBikeData(event.target.value);
          setData(prev => ({ ...prev, ...parsed }));
        });
      } catch (e) {
        console.warn('Indoor Bike Data characteristic not available:', e.message);
      }

      // Get Control Point characteristic
      try {
        const cpChar = await service.getCharacteristic(CONTROL_POINT_CHAR);
        controlPointRef.current = cpChar;
        // Start notifications for control point responses
        await cpChar.startNotifications();
        cpChar.addEventListener('characteristicvaluechanged', () => {});
      } catch (e) {
        console.warn('Control Point characteristic not available:', e.message);
      }

      setStatus('connected');
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User cancelled the picker — not really an error
        setStatus('disconnected');
        return false;
      }
      const msg = err.message || 'Failed to connect to trainer';
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

  /** Request control of the trainer (must be called before setting power) */
  const requestControl = useCallback(async () => {
    const cp = controlPointRef.current;
    if (!cp || controlGranted.current) return true;
    try {
      await cp.writeValueWithResponse(new Uint8Array([OP_REQUEST_CONTROL]));
      controlGranted.current = true;
      return true;
    } catch (err) {
      console.warn('requestControl failed:', err.message);
      return false;
    }
  }, []);

  /**
   * Set ERG power target (watts).
   * The trainer will adjust resistance to maintain this power regardless of speed.
   */
  const setPower = useCallback(async (watts) => {
    const cp = controlPointRef.current;
    if (!cp || status !== 'connected') return false;

    const w = Math.max(0, Math.round(watts));
    try {
      if (!controlGranted.current) {
        const ok = await requestControl();
        if (!ok) return false;
      }
      // Set Target Power: opcode 0x05, followed by signed 16-bit power (little-endian)
      const buf = new ArrayBuffer(3);
      const view = new DataView(buf);
      view.setUint8(0, OP_SET_TARGET_POWER);
      view.setInt16(1, w, true);
      await cp.writeValueWithResponse(buf);
      return true;
    } catch (err) {
      console.warn('setPower failed:', err.message);
      return false;
    }
  }, [status, requestControl]);

  /** Start / resume training */
  const start = useCallback(async () => {
    const cp = controlPointRef.current;
    if (!cp || status !== 'connected') return false;
    try {
      if (!controlGranted.current) await requestControl();
      await cp.writeValueWithResponse(new Uint8Array([OP_START_RESUME]));
      return true;
    } catch (err) {
      console.warn('start failed:', err.message);
      return false;
    }
  }, [status, requestControl]);

  /** Reset trainer */
  const reset = useCallback(async () => {
    const cp = controlPointRef.current;
    if (!cp) return false;
    try {
      await cp.writeValueWithResponse(new Uint8Array([OP_RESET]));
      controlGranted.current = false;
      return true;
    } catch (err) {
      console.warn('reset failed:', err.message);
      return false;
    }
  }, []);

  /** Disconnect from the trainer */
  const disconnect = useCallback(() => {
    try {
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    } catch (_) {}
    handleDisconnected();
  }, [handleDisconnected]);

  return {
    /** 'disconnected' | 'connecting' | 'connected' | 'error' */
    status,
    /** Device name reported by the trainer */
    deviceName,
    /** Latest sensor data: { power, cadence, speed, heartRate } */
    data,
    /** Last error message string or null */
    error,
    /** Whether Web Bluetooth is supported in this browser */
    supported,
    connect,
    disconnect,
    setPower,
    start,
    reset,
  };
}
