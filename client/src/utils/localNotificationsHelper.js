import { isCapacitorNative } from './isNativeApp';

/** Run callback with LocalNotifications API only on native iOS/Android and after display permission. */
export async function withLocalNotificationsPermission(callback) {
  if (!isCapacitorNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
    }
    await callback(LocalNotifications);
  } catch (e) {
    console.warn('[LocalNotifications]', e?.message || e);
  }
}
