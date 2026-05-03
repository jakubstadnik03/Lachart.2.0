/**
 * React Hook for Trainer Connectivity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createTrainerClient } from '../index.ts';
import { logger } from '../logger.js';
import { debounce, clampWatts } from '../utils.js';

export function useTrainer(options) {
  // eslint-disable-next-line no-param-reassign
  options = options ?? {};
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);

  const adapterRef = useRef(null);
  const unsubscribeTelemetryRef = useRef(null);

  // Initialize adapter — run once on mount only.
  // options is captured at mount time; passing a new {} every render would
  // re-run this effect on every render and kill the telemetry subscription.
  const optionsRef = useRef(options);
  useEffect(() => {
    if (!adapterRef.current) {
      adapterRef.current = createTrainerClient(optionsRef.current);
    }
    // Telemetry cleanup is owned exclusively by the subscription effect below.
    // We intentionally don't disconnect or unsubscribe here to prevent
    // connection drops on component re-renders.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to telemetry
  useEffect(() => {
    if (!adapterRef.current) return;

    unsubscribeTelemetryRef.current = adapterRef.current.subscribeTelemetry((t) => {
      setTelemetry(t);
      // Only update status if we actually had a connection before
      // Don't reset status during scan, when already disconnected, or if no device was connected
      // Also don't reset if status indicates we're still connected (ready, controlled, erg_active)
      if (!t.connected && connectedDevice && 
          (status === 'ready' || status === 'controlled' || status === 'erg_active' || status === 'connecting')) {
        // Only disconnect if we're sure the device is actually disconnected
        // Don't disconnect just because telemetry says connected: false (could be temporary)
        // Wait for actual disconnection event
      }
      // Don't change status if we're scanning, already disconnected, or never had a device connected
    });

    return () => {
      if (unsubscribeTelemetryRef.current) {
        unsubscribeTelemetryRef.current();
        unsubscribeTelemetryRef.current = null;
      }
    };
  }, [status, connectedDevice]);

  const scan = useCallback(async () => {
    if (!adapterRef.current) {
      setError('Adapter not initialized');
      return;
    }

    try {
      setError(null);
      setStatus('scanning');
      const foundDevices = await adapterRef.current.scan();
      setDevices(foundDevices);
      // Don't set status to 'disconnected' after scan - keep it as 'scanning' or set to 'disconnected' only if no devices found
      if (foundDevices.length === 0) {
        setStatus('disconnected');
      } else {
        // Keep status as 'scanning' or set to 'disconnected' - user will connect manually
        setStatus('disconnected');
      }
      logger.info('Scan complete:', foundDevices.length, 'devices found');
    } catch (err) {
      const raw = err?.message || '';
      let msg = raw || 'Scan failed';
      // WebSocket error (Event object) or no message → companion WS unreachable
      if (!raw || /websocket|failed to construct/i.test(raw) || err instanceof Event) {
        msg = 'Bluetooth is not available in this browser. Use Chrome on desktop or the mobile app.';
      }
      setError(msg);
      setStatus('error');
      logger.error('Scan error:', err);
    }
  }, []);

  const connect = useCallback(async (deviceId) => {
    if (!adapterRef.current) {
      setError('Adapter not initialized');
      return;
    }

    try {
      setError(null);
      setStatus('connecting');
      await adapterRef.current.connect(deviceId);
      
      const device = devices.find(d => d.id === deviceId) || { id: deviceId, name: 'Unknown', transport: 'ftms-ble' };
      setConnectedDevice(device);
      setCapabilities(adapterRef.current.getCapabilities());
      setStatus('ready');
      logger.info('Connected to device:', device.name);
    } catch (err) {
      setError(err.message || 'Connection failed');
      setStatus('error');
      logger.error('Connection error:', err);
      throw err;
    }
  }, [devices]);

  const disconnect = useCallback(async () => {
    if (!adapterRef.current) {
      return;
    }

    try {
      await adapterRef.current.disconnect();
      setConnectedDevice(null);
      setCapabilities(null);
      setStatus('disconnected');
      setError(null);
      logger.info('Disconnected');
    } catch (err) {
      setError(err.message || 'Disconnect failed');
      logger.error('Disconnect error:', err);
    }
  }, []);

  const requestControl = useCallback(async () => {
    if (!adapterRef.current || !adapterRef.current.requestControl) {
      setError('Control not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.requestControl();
      setStatus('controlled');
      logger.info('Control granted');
    } catch (err) {
      setError(err.message || 'Failed to request control');
      setStatus('error');
      logger.error('Request control error:', err);
      throw err;
    }
  }, []);

  const start = useCallback(async () => {
    if (!adapterRef.current || !adapterRef.current.start) {
      setError('Start not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.start();
      logger.info('Trainer started');
    } catch (err) {
      setError(err.message || 'Failed to start trainer');
      logger.error('Start error:', err);
      throw err;
    }
  }, []);

  // Debounced ERG setter (200ms)
  const setErgWattsRef = useRef(null);

  useEffect(() => {
    setErgWattsRef.current = debounce(async (watts) => {
      if (!adapterRef.current) {
        setError('Adapter not initialized');
        return;
      }

      try {
        setError(null);

        // Auto-request control if the adapter isn't ready to accept ERG commands yet.
        // This handles cases where requestControl() timed out on initial connect, or where
        // the trainer silently re-entered 'ready' state after an ERG gap.
        const adapterState = adapterRef.current.state;
        if (adapterState && adapterState !== 'controlled' && adapterState !== 'erg_active') {
          logger.info('setErgWatts: adapter not controlled, auto-requesting control first');
          try {
            if (adapterRef.current.requestControl) {
              await adapterRef.current.requestControl();
            }
            if (adapterRef.current.start) {
              await adapterRef.current.start();
            }
            setStatus('controlled');
          } catch (ctrlErr) {
            logger.warn('Auto-requestControl in setErgWatts failed:', ctrlErr);
            // Continue anyway — some trainers (FE-C, Wahoo) don't need explicit control
          }
        }

        const clamped = clampWatts(watts, capabilities);
        await adapterRef.current.setErgWatts(clamped);
        setStatus('erg_active');
        logger.debug('ERG set to', clamped, 'W');
      } catch (err) {
        setError(err.message || 'Failed to set ERG power');
        logger.error('Set ERG error:', err);
      }
    }, 200);
  }, [capabilities]);

  // Returns the Promise from the debounced call so callers can await / catch
  const setErgWatts = useCallback((watts) => {
    if (setErgWattsRef.current) {
      return setErgWattsRef.current(watts);
    }
    return Promise.resolve();
  }, []);

  const setResistance = useCallback(async (level) => {
    if (!adapterRef.current || !adapterRef.current.setResistance) {
      setError('Resistance control not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.setResistance(level);
      logger.info('Resistance set to', level);
    } catch (err) {
      setError(err.message || 'Failed to set resistance');
      logger.error('Set resistance error:', err);
      throw err;
    }
  }, []);

  const setSlope = useCallback(async (grade) => {
    if (!adapterRef.current || !adapterRef.current.setSlope) {
      setError('Slope control not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.setSlope(grade);
      logger.info('Slope set to', grade);
    } catch (err) {
      setError(err.message || 'Failed to set slope');
      logger.error('Set slope error:', err);
      throw err;
    }
  }, []);

  return {
    devices,
    connectedDevice,
    telemetry,
    capabilities,
    status,
    error,
    scan,
    connect,
    disconnect,
    setErgWatts,
    setResistance: adapterRef.current?.setResistance ? setResistance : undefined,
    setSlope: adapterRef.current?.setSlope ? setSlope : undefined,
    requestControl,
    start: adapterRef.current?.start ? start : undefined,
    adapter: adapterRef.current, // expose raw adapter for advanced use
  };
}
