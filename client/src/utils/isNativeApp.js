import { Capacitor } from '@capacitor/core';

/** True inside Capacitor iOS/Android shell (not the mobile browser). */
export function isCapacitorNative() {
  return Capacitor.isNativePlatform();
}
