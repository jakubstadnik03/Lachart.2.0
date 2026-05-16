/**
 * useBluetoothHeartRate
 * ─────────────────────
 * React hook for connecting to a standard BLE heart-rate strap.
 *
 * Supported profile: Heart Rate Service (HRS) — UUID 0x180D
 *   • Heart Rate Measurement characteristic — UUID 0x2A37 (notify)
 *
 * Compatible with virtually every consumer HR strap: Polar H10/H9, Garmin
 * HRM-Pro / HRM-Dual, Wahoo TICKR, Coros HRM, Suunto Smart Sensor, etc.
 * The HR Service is a SIG-standardised profile so the UUID + flags layout
 * are identical across vendors.
 *
 * Independent of `useBluetoothTrainer` — most athletes wear an HR strap
 * AND a trainer simultaneously, and outdoor / running use cases need HR
 * without any trainer at all. The two hooks coexist in the same page.
 *
 * Usage:
 *   const hr = useBluetoothHeartRate();
 *   await hr.connect();              // shows native BLE picker
 *   hr.data.heartRate                // number | null (bpm)
 *   hr.data.rrIntervals              // number[] (ms between beats), optional
 *   hr.disconnect();
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const HR_SERVICE                = 0x180D;
const HR_MEASUREMENT_CHAR       = 0x2A37;

/**
 * Parse the Heart Rate Measurement characteristic. Per the spec the layout is:
 *   byte 0: flags
 *     bit 0: HR value format — 0 = uint8, 1 = uint16
 *     bit 1-2: sensor contact bits (0b00 = not supported)
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
    // Skip energy expended — not exposed by this hook yet.
    offset += 2;
  }

  const rrIntervals = [];
  if (hasRR) {
    // Each RR is uint16 in 1/1024 seconds — convert to ms.
    while (offset + 2 <= dataView.byteLength) {
      const raw = dataView.getUint16(offset, true);
      rrIntervals.push(Math.round((raw / 1024) * 1000));
      offset += 2;
    }
  }

  return { heartRate, rrIntervals };
}

export default function useBluetoothHeartRate() {
  const [status, setStatus] = useState('disconnected'); // 'disconnected'|'connecting'|'connected'|'error'
  const [deviceName, setDeviceName] = useState(null);
  const [data, setData] = useState({ heartRate: null, rrIntervals: [] });
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  const deviceRef = useRef(null);
  const serverRef = useRef(null);
  const charRef = useRef(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.bluetooth);
  }, []);

  const handleDisconnected = useCallback(() => {
    setStatus('disconnected');
    setDeviceName(null);
    charRef.current = null;
    serverRef.current = null;
    deviceRef.current = null;
    setData({ heartRate: null, rrIntervals: [] });
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setError('Web Bluetooth is not supported in this browser.');
      setStatus('error');
      return false;
    }
    try {
      setStatus('connecting');
      setError(null);

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
        optionalServices: [HR_SERVICE],
      });

      deviceRef.current = device;
      setDeviceName(device.name || 'Heart Rate Monitor');
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      serverRef.current = server;

      const service = await server.getPrimaryService(HR_SERVICE);
      const char = await service.getCharacteristic(HR_MEASUREMENT_CHAR);
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

  const disconnect = useCallback(() => {
    try {
      if (deviceRef.current?.gatt?.connected) {
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
    /** Whether Web Bluetooth is supported in this browser */
    supported,
    connect,
    disconnect,
  };
}
