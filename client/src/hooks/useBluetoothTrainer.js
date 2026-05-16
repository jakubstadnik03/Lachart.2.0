/**
 * useBluetoothTrainer
 * ───────────────────
 * React hook for FTMS-compatible smart trainers. Works in BOTH:
 *
 *   1. **Web Bluetooth** (desktop Chrome / Edge) — via `navigator.bluetooth`.
 *
 *   2. **Capacitor native** (iOS / Android app shell) — via the
 *      `@capacitor-community/bluetooth-le` plugin. WKWebView ships with
 *      no Web Bluetooth, so the desktop path silently fails there. The
 *      same plugin already powers the HR strap hook, so the pod is
 *      installed and initialised.
 *
 * Profile: Fitness Machine Service (FTMS) — UUID 0x1826
 *   • Indoor Bike Data characteristic   — 0x2AD2  (notify)
 *   • Fitness Machine Control Point     — 0x2AD9  (write — ERG target)
 *
 * Identical external surface either way:
 *   const trainer = useBluetoothTrainer();
 *   await trainer.connect();
 *   trainer.setPower(250);          // ERG: set 250 W
 *   trainer.data.power              // live power (W)
 *   trainer.disconnect();
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { isCapacitorNative } from '../utils/isNativeApp';

// 16-bit ids (Web Bluetooth)
const FTMS_SERVICE_16          = 0x1826;
const INDOOR_BIKE_DATA_CHAR_16 = 0x2AD2;
const CONTROL_POINT_CHAR_16    = 0x2AD9;

// 128-bit ids (Capacitor expects full UUIDs)
const FTMS_SERVICE_UUID        = '00001826-0000-1000-8000-00805f9b34fb';
const INDOOR_BIKE_DATA_UUID    = '00002ad2-0000-1000-8000-00805f9b34fb';
const CONTROL_POINT_UUID       = '00002ad9-0000-1000-8000-00805f9b34fb';

// FTMS Control Point opcodes
const OP_REQUEST_CONTROL  = 0x00;
const OP_RESET            = 0x01;
const OP_SET_TARGET_POWER = 0x05;
const OP_START_RESUME     = 0x07;

/** Parse Indoor Bike Data notification (Bluetooth LE little-endian). */
function parseIndoorBikeData(dataView) {
  const flags = dataView.getUint16(0, true);
  let offset = 2;

  const hasInstSpeed     = !(flags & 0x0001); // bit 0 = 0 means present
  const hasAvgSpeed      = !!(flags & 0x0002);
  const hasInstCadence   = !!(flags & 0x0004);
  const hasAvgCadence    = !!(flags & 0x0008);
  const hasTotalDistance = !!(flags & 0x0010);
  const hasResistance    = !!(flags & 0x0020);
  const hasInstPower     = !!(flags & 0x0040);
  const hasAvgPower      = !!(flags & 0x0080);
  const hasEnergy        = !!(flags & 0x0100);
  const hasHeartRate     = !!(flags & 0x0200);
  const hasMetEquiv      = !!(flags & 0x0400);
  const hasElapsedTime   = !!(flags & 0x0800);
  const hasRemainTime    = !!(flags & 0x1000);

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
    result.distance = (
      dataView.getUint8(offset)
      | (dataView.getUint8(offset + 1) << 8)
      | (dataView.getUint8(offset + 2) << 16)
    );
    offset += 3;
  }
  if (hasResistance && offset + 2 <= dataView.byteLength) {
    result.resistance = dataView.getInt16(offset, true);
    offset += 2;
  }
  if (hasInstPower && offset + 2 <= dataView.byteLength) {
    result.power = dataView.getInt16(offset, true);
    offset += 2;
  }
  if (hasAvgPower && offset + 2 <= dataView.byteLength) {
    result.avgPower = dataView.getInt16(offset, true);
    offset += 2;
  }
  if (hasEnergy && offset + 5 <= dataView.byteLength) offset += 5;
  if (hasHeartRate && offset + 1 <= dataView.byteLength) {
    result.heartRate = dataView.getUint8(offset);
    offset += 1;
  }
  if (hasMetEquiv && offset + 1 <= dataView.byteLength) offset += 1;
  if (hasElapsedTime && offset + 2 <= dataView.byteLength) offset += 2;
  if (hasRemainTime && offset + 2 <= dataView.byteLength) offset += 2;

  return result;
}

// Lazy BleClient import so the web bundle never pulls in the Capacitor plugin.
let _BleClient = null;
async function getBleClient() {
  if (_BleClient) return _BleClient;
  const mod = await import('@capacitor-community/bluetooth-le');
  _BleClient = mod.BleClient;
  await _BleClient.initialize({ androidNeverForLocation: true });
  return _BleClient;
}

export default function useBluetoothTrainer() {
  const [status, setStatus] = useState('disconnected'); // 'disconnected'|'connecting'|'connected'|'error'
  const [deviceName, setDeviceName] = useState(null);
  const [data, setData] = useState({ power: null, cadence: null, speed: null, heartRate: null });
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  // Web Bluetooth refs
  const deviceRef       = useRef(null);
  const controlPointRef = useRef(null);
  // Capacitor refs
  const nativeDeviceIdRef = useRef(null);

  const controlGranted = useRef(false);

  useEffect(() => {
    const native = isCapacitorNative();
    const webBt = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    setSupported(native || webBt);
  }, []);

  const handleDisconnected = useCallback(() => {
    setStatus('disconnected');
    setDeviceName(null);
    controlGranted.current = false;
    controlPointRef.current = null;
    deviceRef.current = null;
    nativeDeviceIdRef.current = null;
    setData({ power: null, cadence: null, speed: null, heartRate: null });
  }, []);

  // ── Capacitor native connect path ─────────────────────────────────────────
  const connectNative = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      const BleClient = await getBleClient();
      const device = await BleClient.requestDevice({
        services: [FTMS_SERVICE_UUID],
        optionalServices: [FTMS_SERVICE_UUID],
      });
      if (!device?.deviceId) {
        setStatus('disconnected');
        return false;
      }
      nativeDeviceIdRef.current = device.deviceId;
      setDeviceName(device.name || 'Smart Trainer');

      await BleClient.connect(device.deviceId, () => handleDisconnected());

      // Indoor Bike Data — notifications
      try {
        await BleClient.startNotifications(
          device.deviceId,
          FTMS_SERVICE_UUID,
          INDOOR_BIKE_DATA_UUID,
          (value) => {
            const parsed = parseIndoorBikeData(value);
            setData((prev) => ({ ...prev, ...parsed }));
          },
        );
      } catch (e) {
        console.warn('[trainer/native] IBD subscribe failed:', e?.message || e);
      }

      // Control Point — best-effort. Some trainers expose it lazily;
      // we just remember the IDs and write directly via BleClient when
      // setPower is called.
      controlPointRef.current = { kind: 'native' };

      setStatus('connected');
      return true;
    } catch (err) {
      const msg = err?.message || 'Failed to connect to trainer';
      if (/cancel|dismiss/i.test(msg)) {
        setStatus('disconnected');
        return false;
      }
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

  // ── Web Bluetooth connect path ─────────────────────────────────────────────
  const connectWeb = useCallback(async () => {
    if (!navigator.bluetooth) {
      setError('Web Bluetooth is not supported in this browser.');
      setStatus('error');
      return false;
    }
    try {
      setStatus('connecting');
      setError(null);

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE_16] }],
        optionalServices: [FTMS_SERVICE_16],
      });
      deviceRef.current = device;
      setDeviceName(device.name || 'Smart Trainer');
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(FTMS_SERVICE_16);

      try {
        const ibd = await service.getCharacteristic(INDOOR_BIKE_DATA_CHAR_16);
        await ibd.startNotifications();
        ibd.addEventListener('characteristicvaluechanged', (event) => {
          const parsed = parseIndoorBikeData(event.target.value);
          setData((prev) => ({ ...prev, ...parsed }));
        });
      } catch (e) {
        console.warn('[trainer/web] IBD subscribe failed:', e.message);
      }

      try {
        const cp = await service.getCharacteristic(CONTROL_POINT_CHAR_16);
        controlPointRef.current = { kind: 'web', char: cp };
        await cp.startNotifications();
        cp.addEventListener('characteristicvaluechanged', () => {});
      } catch (e) {
        console.warn('[trainer/web] Control Point not available:', e.message);
      }

      setStatus('connected');
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setStatus('disconnected');
        return false;
      }
      const msg = err.message || 'Failed to connect to trainer';
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

  const connect = useCallback(async () => {
    if (isCapacitorNative()) return connectNative();
    return connectWeb();
  }, [connectNative, connectWeb]);

  // ── Control-point writes (cross-platform helper) ──────────────────────────
  const writeControl = useCallback(async (bytes) => {
    const cp = controlPointRef.current;
    if (!cp) return false;
    try {
      if (cp.kind === 'web') {
        await cp.char.writeValueWithResponse(bytes);
        return true;
      }
      if (cp.kind === 'native' && nativeDeviceIdRef.current) {
        const BleClient = await getBleClient();
        // Plugin accepts a DataView for write payloads.
        const view = bytes instanceof DataView
          ? bytes
          : new DataView(bytes.buffer || bytes);
        await BleClient.writeWithResponse(
          nativeDeviceIdRef.current,
          FTMS_SERVICE_UUID,
          CONTROL_POINT_UUID,
          view,
        );
        return true;
      }
    } catch (err) {
      console.warn('[trainer] writeControl failed:', err?.message || err);
    }
    return false;
  }, []);

  const requestControl = useCallback(async () => {
    if (controlGranted.current) return true;
    const ok = await writeControl(new Uint8Array([OP_REQUEST_CONTROL]));
    if (ok) controlGranted.current = true;
    return ok;
  }, [writeControl]);

  /** ERG: set target power (W). Trainer adjusts resistance to maintain it. */
  const setPower = useCallback(async (watts) => {
    if (status !== 'connected') return false;
    const w = Math.max(0, Math.round(watts));
    if (!controlGranted.current) {
      const ok = await requestControl();
      if (!ok) return false;
    }
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint8(0, OP_SET_TARGET_POWER);
    view.setInt16(1, w, true);
    return writeControl(view);
  }, [status, requestControl, writeControl]);

  const start = useCallback(async () => {
    if (status !== 'connected') return false;
    if (!controlGranted.current) await requestControl();
    return writeControl(new Uint8Array([OP_START_RESUME]));
  }, [status, requestControl, writeControl]);

  const reset = useCallback(async () => {
    const ok = await writeControl(new Uint8Array([OP_RESET]));
    if (ok) controlGranted.current = false;
    return ok;
  }, [writeControl]);

  const disconnect = useCallback(async () => {
    try {
      if (nativeDeviceIdRef.current) {
        const BleClient = await getBleClient();
        await BleClient.disconnect(nativeDeviceIdRef.current).catch(() => {});
      } else if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    } catch (_) { /* swallow */ }
    handleDisconnected();
  }, [handleDisconnected]);

  return {
    /** 'disconnected' | 'connecting' | 'connected' | 'error' */
    status,
    /** Device name reported by the trainer */
    deviceName,
    /** Latest sensor data: { power, cadence, speed, heartRate, ... } */
    data,
    /** Last error message string or null */
    error,
    /** Whether BLE is available (web bt OR native) */
    supported,
    connect,
    disconnect,
    setPower,
    start,
    reset,
  };
}
