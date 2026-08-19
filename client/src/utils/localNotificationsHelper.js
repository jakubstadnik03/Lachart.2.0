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

/**
 * Drop every notification this account had queued.
 *
 * Local notifications live on the device, not in the account: a race
 * countdown, a planned session reminder or the morning read scheduled by one
 * athlete fires just the same after somebody else signs in on that phone.
 *
 * @returns {Promise<number>} how many were cancelled
 */
export async function cancelAllLocalNotifications() {
  if (!isCapacitorNative()) return 0;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    const notifications = (pending?.notifications || []).map((n) => ({ id: n.id }));
    if (!notifications.length) return 0;
    await LocalNotifications.cancel({ notifications });
    return notifications.length;
  } catch (e) {
    console.warn('[LocalNotifications] cancelAll failed:', e?.message || e);
    return 0;
  }
}
