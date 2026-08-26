/**
 * Signing out has to leave the phone quiet.
 *
 * Local notifications are scheduled on the device, not on the account: a race
 * countdown or a session reminder queued by one athlete fires just the same
 * after somebody else signs in.
 */
jest.mock('./isNativeApp', () => ({ isCapacitorNative: () => true }));

const mockLocalNotifications = {
  getPending: jest.fn(),
  cancel: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mockLocalNotifications }), { virtual: true });

const mockApi = { unregisterPushToken: jest.fn().mockResolvedValue({}) };
jest.mock('../services/api', () => mockApi, { virtual: true });

// eslint-disable-next-line import/first
import { cancelAllLocalNotifications } from './localNotificationsHelper';
// eslint-disable-next-line import/first
import { DEVICE_TOKEN_KEY, cachePushToken, detachPushTokenFromAccount } from './pushTokenSync';

describe('cancelAllLocalNotifications', () => {
  beforeEach(() => {
    mockLocalNotifications.getPending.mockReset();
    mockLocalNotifications.cancel.mockClear();
  });

  it('cancels everything that was queued', async () => {
    mockLocalNotifications.getPending.mockResolvedValue({
      notifications: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    await expect(cancelAllLocalNotifications()).resolves.toBe(3);
    expect(mockLocalNotifications.cancel).toHaveBeenCalledWith({
      notifications: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
  });

  it('does not call cancel with an empty list', async () => {
    mockLocalNotifications.getPending.mockResolvedValue({ notifications: [] });
    await expect(cancelAllLocalNotifications()).resolves.toBe(0);
    expect(mockLocalNotifications.cancel).not.toHaveBeenCalled();
  });

  it('never lets a notification failure block signing out', async () => {
    mockLocalNotifications.getPending.mockRejectedValue(new Error('plugin missing'));
    await expect(cancelAllLocalNotifications()).resolves.toBe(0);
  });
});

describe('detachPushTokenFromAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApi.unregisterPushToken.mockClear();
  });

  it('tells the server to stop sending to this device', async () => {
    cachePushToken('apns-device-token');
    await expect(detachPushTokenFromAccount()).resolves.toBe(true);
    expect(mockApi.unregisterPushToken).toHaveBeenCalledWith('apns-device-token');
  });

  it('keeps the token under a device key that survives the logout wipe', () => {
    cachePushToken('apns-device-token');
    expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBe('apns-device-token');
  });

  it('says so when this device never registered', async () => {
    await expect(detachPushTokenFromAccount()).resolves.toBe(false);
    expect(mockApi.unregisterPushToken).not.toHaveBeenCalled();
  });

  it('swallows a server error — logging out must still finish', async () => {
    cachePushToken('apns-device-token');
    mockApi.unregisterPushToken.mockRejectedValueOnce(new Error('offline'));
    await expect(detachPushTokenFromAccount()).resolves.toBe(false);
  });
});
