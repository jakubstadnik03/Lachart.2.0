/**
 * bleDeviceMemory
 * ───────────────
 * Tiny localStorage layer that remembers the LAST connected BLE device per
 * role (trainer / hr / core) so the app can auto-reconnect on the next
 * session instead of forcing the athlete through the device picker every time.
 *
 * We persist only a stable identity — `{ id, name }`:
 *   • Web Bluetooth: `device.id`     (stable per browser-profile + device)
 *   • Capacitor native: `device.deviceId`
 *
 * Silent reconnect strategy (see the hooks):
 *   • Web: `navigator.bluetooth.getDevices()` returns the already-permitted
 *     devices; we match the saved id and connect WITHOUT a chooser.
 *   • Native: `BleClient.connect(savedId)` connects directly by id.
 * If the device is out of range / unpaired / the API is unavailable, the
 * reconnect just fails silently and the athlete can reconnect manually.
 */

const KEY = 'lachart.ble.devices.v1';

/** @typedef {'trainer'|'hr'|'core'} BleRole */

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** Last saved device `{ id, name, ts }` for a role, or null. */
export function loadBleDevice(role) {
  const d = readAll()[role];
  return d && d.id ? d : null;
}

/** Remember a freshly-connected device for a role. No-op without an id. */
export function saveBleDevice(role, { id, name } = {}) {
  if (!id) return;
  try {
    const all = readAll();
    all[role] = { id, name: name || null, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/** Forget a role (e.g. user explicitly picks "don't reconnect"). */
export function clearBleDevice(role) {
  try {
    const all = readAll();
    delete all[role];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* non-fatal */
  }
}
