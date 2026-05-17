/**
 * useBluetoothCoreTemp
 * ────────────────────
 * Connect to a CORE Body Temperature sensor (greenTEG CORE) over BLE.
 * Works in both Web Bluetooth (desktop browsers) and Capacitor native
 * (`@capacitor-community/bluetooth-le` on iOS / Android).
 *
 * Profile: CORE uses a CUSTOM 128-bit service — there's no SIG-standard
 * for core body temperature. The spec is publicly documented:
 *   • Service:        00002100-5b1e-4347-b07c-97b514dae121
 *   • Temperature:    00002101-5b1e-4347-b07c-97b514dae121  (notify)
 *
 * The temperature characteristic payload is a packed binary structure:
 *   byte 0:       flags
 *                   bit 0 — skin temperature present
 *                   bit 1 — core reserved (legacy, often unset)
 *                   bit 2 — quality nibble present
 *                   bit 3 — heart rate present
 *                   bit 4 — heat strain index (HSI) present
 *   bytes 1-2:    core body temperature, int16 LE, °C × 100
 *   bytes 3-4:    skin temperature (if flag bit 0)
 *   bytes 5-6:    core reserved   (if flag bit 1) — skipped
 *   byte:         quality nibble  (if flag bit 2) — high 4 bits
 *   byte:         heart rate      (if flag bit 3) — uint8 bpm
 *   byte:         HSI             (if flag bit 4) — × 10
 *
 * The hook exposes `data = { coreTemp, skinTemp, quality, hsi }` (°C
 * and 0-10 HSI). Heart rate is intentionally NOT exposed here — use the
 * dedicated HR-strap hook for that (cleaner separation of concerns and
 * avoids the case where strap HR is more accurate than the optical HR
 * embedded in the CORE sensor).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { isCapacitorNative } from '../utils/isNativeApp';

const CORE_SERVICE_UUID = '00002100-5b1e-4347-b07c-97b514dae121';
const CORE_TEMP_UUID    = '00002101-5b1e-4347-b07c-97b514dae121';

function parseCoreTemp(dataView) {
  if (!dataView || dataView.byteLength < 3) return null;
  const flags = dataView.getUint8(0);
  const hasSkin     = !!(flags & 0x01);
  const hasReserved = !!(flags & 0x02);
  const hasQuality  = !!(flags & 0x04);
  const hasHr       = !!(flags & 0x08);
  const hasHsi      = !!(flags & 0x10);

  let offset = 1;
  const coreRaw = dataView.getInt16(offset, true);
  offset += 2;
  const coreTemp = coreRaw === -32768 ? null : coreRaw / 100;

  let skinTemp = null;
  if (hasSkin && offset + 2 <= dataView.byteLength) {
    const raw = dataView.getInt16(offset, true);
    skinTemp = raw === -32768 ? null : raw / 100;
    offset += 2;
  }
  if (hasReserved && offset + 2 <= dataView.byteLength) offset += 2;

  let quality = null;
  if (hasQuality && offset + 1 <= dataView.byteLength) {
    // High nibble carries the quality value 0-4 in current firmware.
    quality = (dataView.getUint8(offset) >> 4) & 0x0F;
    offset += 1;
  }
  if (hasHr && offset + 1 <= dataView.byteLength) offset += 1; // skip HR
  let hsi = null;
  if (hasHsi && offset + 1 <= dataView.byteLength) {
    hsi = dataView.getUint8(offset) / 10;
    offset += 1;
  }
  return { coreTemp, skinTemp, quality, hsi };
}

let _BleClient = null;
async function getBleClient() {
  if (_BleClient) return _BleClient;
  const mod = await import('@capacitor-community/bluetooth-le');
  _BleClient = mod.BleClient;
  await _BleClient.initialize({ androidNeverForLocation: true });
  return _BleClient;
}

export default function useBluetoothCoreTemp() {
  const [status, setStatus] = useState('disconnected');
  const [deviceName, setDeviceName] = useState(null);
  const [data, setData] = useState({ coreTemp: null, skinTemp: null, quality: null, hsi: null });
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  const deviceRef = useRef(null);
  const charRef = useRef(null);
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
    setData({ coreTemp: null, skinTemp: null, quality: null, hsi: null });
  }, []);

  const connectNative = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      const BleClient = await getBleClient();
      const device = await BleClient.requestDevice({
        services: [CORE_SERVICE_UUID],
        optionalServices: [CORE_SERVICE_UUID],
      });
      if (!device?.deviceId) { setStatus('disconnected'); return false; }
      nativeDeviceIdRef.current = device.deviceId;
      setDeviceName(device.name || 'CORE Sensor');
      await BleClient.connect(device.deviceId, () => handleDisconnected());
      await BleClient.startNotifications(
        device.deviceId,
        CORE_SERVICE_UUID,
        CORE_TEMP_UUID,
        (value) => {
          const parsed = parseCoreTemp(value);
          if (parsed) setData(parsed);
        },
      );
      setStatus('connected');
      return true;
    } catch (err) {
      const msg = err?.message || 'Failed to connect to CORE sensor';
      if (/cancel|dismiss/i.test(msg)) { setStatus('disconnected'); return false; }
      setError(msg);
      setStatus('error');
      return false;
    }
  }, [handleDisconnected]);

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
        filters: [{ services: [CORE_SERVICE_UUID] }],
        optionalServices: [CORE_SERVICE_UUID],
      });
      deviceRef.current = device;
      setDeviceName(device.name || 'CORE Sensor');
      device.addEventListener('gattserverdisconnected', handleDisconnected);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(CORE_SERVICE_UUID);
      const char = await service.getCharacteristic(CORE_TEMP_UUID);
      charRef.current = char;
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (event) => {
        const parsed = parseCoreTemp(event.target.value);
        if (parsed) setData(parsed);
      });
      setStatus('connected');
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') { setStatus('disconnected'); return false; }
      setError(err.message || 'Failed to connect to CORE sensor');
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

  return { status, deviceName, data, error, supported, connect, disconnect };
}
