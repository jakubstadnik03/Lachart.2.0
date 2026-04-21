/**
 * usePushNotifications – React hook
 *
 * Usage:
 *   const { granted, token, request } = usePushNotifications();
 *
 * The hook auto-initialises on mount (requests permission + registers).
 * `granted`  – boolean, whether permission is currently granted
 * `token`    – device token string (APNs/FCM), or null
 * `request`  – call manually to (re)request permission
 */

import { useState, useEffect, useCallback } from 'react';
import {
  registerForPushNotifications,
  checkNotificationPermission,
  addPushListeners,
  removePushListeners,
} from '../services/pushNotifications';

export const usePushNotifications = ({ onMessage, onActionPerformed } = {}) => {
  const [granted, setGranted]   = useState(false);
  const [token,   setToken]     = useState(null);
  const [loading, setLoading]   = useState(false);

  // Check existing permission on mount (no prompt)
  useEffect(() => {
    checkNotificationPermission().then(setGranted);
  }, []);

  // Register listeners
  useEffect(() => {
    addPushListeners({ onMessage, onActionPerformed });
    return () => { removePushListeners(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Request permission + get token
  const request = useCallback(async () => {
    setLoading(true);
    try {
      const t = await registerForPushNotifications();
      if (t) { setGranted(true); setToken(t); }
      else    { setGranted(false); }
      return t;
    } finally {
      setLoading(false);
    }
  }, []);

  return { granted, token, loading, request };
};

export default usePushNotifications;
