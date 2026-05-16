/**
 * useBluetoothHeartRate
 * ─────────────────────
 * React hook for a standard BLE heart-rate strap. Works in TWO modes
 * transparently:
 *
 *   1. **Web Bluetooth** — used on desktop browsers (Chrome / Edge). Calls
 *      `navigator.bluetooth.requestDevice` and the standard GATT API.
 *
 *   2. **Capacitor native** — used inside the iOS / Android app shell where
 *      WKWebView has no Web Bluetooth. Lazy-loads `BleClient` from
 *      `@capacitor-community/bluetooth-le` (the pod is already installed
 *      because the bike-trainer adapter uses it).
 *
 * Profile: Heart Rate Service (HRS) — UUID 0x180D, Heart Rate Measurement
 * characteristic 0x2A37. Compatible with virtually every HR strap (Polar
 * H10/H9, Garmin HRM-Pro / HRM-Dual, Wahoo TICKR, Coros, Suunto, etc.).
 *
 * Usage is identical regardless of platform:
 *   const hr = useBluetoothHeartRate();
 *   await hr.connect();
 *   hr.data.heartRate     // number | null (bpm)
 *   hr.data.rrIntervals   // number[]    (ms between beats, optional)
 *   hr.disconnect();
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { isCapacitorNative } from '../utils/isNativeApp';

// 16-bit (web bluetooth) ids:
const HR_SERVICE_16          = 0x180D;
const HR_MEASUREMENT_CHAR_16 = 0x2A37;
// Full 128-bit ids (Capacitor expects full UUIDs):
const HR_SERVICE_UUID        = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_UUID    = '00002a37-0000-1000-8000-00805f9b34fb';

/**
 * Parse the Heart Rate Measurement characteristic. Spec layout:
 *   byte 0: flags
 *     bit 0: HR value format — 0 = uint8, 1 = uint16
 *     bit 1-2: sensor contact (we don't expose)
 *     bit 3: energy expended present
 *     bit 4: RR interval(s) present
 *   then HR value (1 or 2 bytes), then optional fields in order.
 */
function parseHeartRateMeasurement(dataView) {
  const flags = dataView.getUint8(0);
  const isU16 = !!(flags & 0x01);
  const hasEnergy = !!(flags & 0x08);
  const hasRR = !!(flags & 0x10);

  let offset = 1;
  let heartRate = null;
  if (isU16) {
    if (offset + 2 <= dataView.byteLength) {
      heartRate = dataView.getUint16(offset, true);
      offset += 2;
    }
  } else if (offset + 1 <= dataView.byteLength) {
    heartRate = dataView.getUint8(offset);
    offset += 1;
  }

  if (hasEnergy && offset + 2 <= dataView.byteLength) {
    offset += 2; // skip energy expended
  }

  const rrIntervals = [];
  if (hasRR) {
    while (offset + 2 <= dataView.byteLength) {
      const raw = dataView.getUint16(offset, true);
      rrIntervals.push(Math.round((raw / 1024) * 1000));
      offset += 2;
    }
  }

  return { heartRate, rrIntervals };
}

// Lazy-load BleClient so the web bundle never imports the Capacitor plugin.
let _BleClient = null;
async function getBleClient() {
  if (_BleClient) return _BleClient;
  const mod = await import('@capacitor-community/bluetooth-le');
  _BleClient = mod.BleClient;
  await _BleClient.initialize({ androidNeverForLocation: true });
  return _BleClient;
}

export default function useBluetoothHeartRate() {
  const [status, setStatus] = useState('disconnected'); // 'disconnected'|'connecting'|'connected'|'error'
  const [deviceName, setDeviceName] = useState(null);
  const [data, setData] = useState({ heartRate: null, rrIntervals: [] });
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  // Web-Bluetooth refs
  const deviceRef = useRef(null);
  const charRef = useRef(null);
  // Capacitor refs
  const nativeDeviceIdRef = useRef(null);

  useEffect(() => {
    const native = isCapacitorNative();
    const webBt = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    setSupported(native || webBt);
  }, []);

  const handleDisconnected = useCallback(() => {
    setStatus('disconnected');
    setDeviceName(null);
    charRef.current = null;
    deviceRef.current = null;
    nativeDeviceIdRef.current = null;
    setData({ heartRate: null, rrIntervals: [] });
  }, []);

  // ── Capacitor-native connect path ──────────────────────────────────────────
  const connectNative = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      const BleClient = await getBleClient();
      const device = await BleClient.requestDevice({
        services: [HR_SERVICE_UUID],
        optionalServices: [HR_SERVICE_UUID],
      });
      if (!device?.deviceId) {
        setStatus('disconnected');
        return false;
      }
      nativeDeviceIdRef.current = device.deviceId;
      setDeviceName(device.name || 'Heart Rate Monitor');
      await BleClient.connect(device.deviceId, () => handleDisconnected());

      await BleClient.startNotifications(
        device.deviceId,
        HR_SERVICE_UUID,
        HR_MEASUREMENT_UUID,
        (value) => {
          // `value` is a DataView in @capacitor-community/bluetooth-le v3+.
          const parsed = parseHeartRateMeasurement(value);
          setData(parsed);
        },
      );
      setStatus('connected');
      return true;
    } catch (err) {
      const msg = err?.message || 'Failed to connect to HR strap';
      if (/cancel|dismiss/i.test(msg)) {
        setStatus('disconnected');
        return false;
      }
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

  // ── Web-Bluetooth connect path ─────────────────────────────────────────────
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
        filters: [{ services: [HR_SERVICE_16] }],
        optionalServices: [HR_SERVICE_16],
      });

      deviceRef.current = device;
      setDeviceName(device.name || 'Heart Rate Monitor');
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(HR_SERVICE_16);
      const char = await service.getCharacteristic(HR_MEASUREMENT_CHAR_16);
      charRef.current = char;
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (event) => {
        const parsed = parseHeartRateMeasurement(event.target.value);
        setData(parsed);
      });

      setStatus('connected');
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setStatus('disconnected');
        return false;
      }
      const msg = err.message || 'Failed to connect to HR strap';
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

  const connect = useCallback(async () => {
    if (isCapacitorNative()) return connectNative();
    return connectWeb();
  }, [connectNative, connectWeb]);

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
    /** Device name reported by the strap */
    deviceName,
    /** Latest measurement: { heartRate, rrIntervals } */
    data,
    /** Last error string or null */
    error,
    /** Whether BLE is available in this environment (web bt OR native) */
    supported,
    connect,
    disconnect,
  };
}
