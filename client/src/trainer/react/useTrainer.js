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

  // Subscribe once — re-subscribing on every status change dropped BLE notifications
  // and made power / charts flicker (connecting → ready → controlled → erg_active).
  useEffect(() => {
    if (!adapterRef.current) return;

    unsubscribeTelemetryRef.current = adapterRef.current.subscribeTelemetry((t) => {
      if (!t) return;
      setTelemetry((prev) => {
        if (!t.connected && prev?.connected) {
          return { ...prev, connected: false, ts: t.ts ?? Date.now() };
        }
        return {
          ts: t.ts ?? Date.now(),
          connected: t.connected !== false,
          power: t.power ?? prev?.power ?? null,
          cadence: t.cadence ?? prev?.cadence ?? null,
          speed: t.speed ?? prev?.speed ?? null,
          hr: t.hr ?? prev?.hr ?? null,
        };
      });
    });

    return () => {
      if (unsubscribeTelemetryRef.current) {
        unsubscribeTelemetryRef.current();
        unsubscribeTelemetryRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setTelemetry(null);
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

  const ergWriteCoreRef = useRef(null);
  const setErgWattsDebouncedRef = useRef(null);

  useEffect(() => {
    const writeErg = async (watts) => {
      if (!adapterRef.current) {
        setError('Adapter not initialized');
        return;
      }

      try {
        setError(null);

        const adapterState = adapterRef.current.state;
        if (adapterState === 'ready') {
          logger.info('setErgWatts: requesting control before first ERG write');
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
          }
        }
        // erg_active / controlled: skip RESET + REQUEST_CONTROL (adds ~500 ms on Tacx).

        const clamped = clampWatts(watts, capabilities);
        await adapterRef.current.setErgWatts(clamped);
        setStatus('erg_active');
        logger.info(`[FTMS] ERG power set to ${clamped} W`);
      } catch (err) {
        const msg = err?.message || 'Failed to set ERG power';
        setError(msg);
        logger.error('Set ERG error:', err);
        throw err;
      }
    };

    ergWriteCoreRef.current = writeErg;
    setErgWattsDebouncedRef.current = debounce(writeErg, 120);
  }, [capabilities]);

  const setErgWatts = useCallback((watts) => {
    if (setErgWattsDebouncedRef.current) {
      return setErgWattsDebouncedRef.current(watts);
    }
    return Promise.reject(new Error('Trainer not ready for ERG'));
  }, []);

  /** Lap / step changes — no debounce so Tacx FE-C gets the new target immediately. */
  const setErgWattsImmediate = useCallback((watts) => {
    if (ergWriteCoreRef.current) {
      return ergWriteCoreRef.current(watts);
    }
    return Promise.reject(new Error('Trainer not ready for ERG'));
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
    setErgWattsImmediate,
    setResistance: adapterRef.current?.setResistance ? setResistance : undefined,
    setSlope: adapterRef.current?.setSlope ? setSlope : undefined,
    requestControl,
    start: adapterRef.current?.start ? start : undefined,
    adapter: adapterRef.current, // expose raw adapter for advanced use
  };
}
