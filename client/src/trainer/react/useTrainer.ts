/**
 * React Hook for Trainer Connectivity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TrainerAdapter, DeviceInfo, TrainerCapabilities, Telemetry, TrainerStatus, TrainerClientOptions } from '../types.ts';
import { createTrainerClient } from '../index.ts';
import { logger } from '../logger.js';
import { debounce, clampWatts } from '../utils.js';

export interface UseTrainerReturn {
  // State
  devices: DeviceInfo[];
  connectedDevice: DeviceInfo | null;
  telemetry: Telemetry | null;
  capabilities: TrainerCapabilities | null;
  status: TrainerStatus;
  error: string | null;

  // Actions
  scan: () => Promise<void>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setErgWatts: (watts: number) => Promise<void>;
  setResistance?: (level: number) => Promise<void>;
  setSlope?: (grade: number) => Promise<void>;
  requestControl: () => Promise<void>;
  start: () => Promise<void>;
}

export function useTrainer(options: TrainerClientOptions = {}): UseTrainerReturn {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<DeviceInfo | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [capabilities, setCapabilities] = useState<TrainerCapabilities | null>(null);
  const [status, setStatus] = useState<TrainerStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const adapterRef = useRef<TrainerAdapter | null>(null);
  const unsubscribeTelemetryRef = useRef<(() => void) | null>(null);

  // Initialize adapter
  useEffect(() => {
    if (!adapterRef.current) {
      adapterRef.current = createTrainerClient(options);
    }

    return () => {
      if (unsubscribeTelemetryRef.current) {
        unsubscribeTelemetryRef.current();
        unsubscribeTelemetryRef.current = null;
      }
      if (adapterRef.current) {
        adapterRef.current.disconnect().catch(e => {
          logger.error('Error disconnecting on cleanup:', e);
        });
      }
    };
  }, [options]);

  // Subscribe to telemetry
  useEffect(() => {
    if (!adapterRef.current) return;

    unsubscribeTelemetryRef.current = adapterRef.current.subscribeTelemetry((t: Telemetry) => {
      setTelemetry(t);
      if (!t.connected && status !== 'disconnected') {
        setStatus('disconnected');
        setConnectedDevice(null);
        setCapabilities(null);
      }
    });

    return () => {
      if (unsubscribeTelemetryRef.current) {
        unsubscribeTelemetryRef.current();
        unsubscribeTelemetryRef.current = null;
      }
    };
  }, [status]);

  const scan = useCallback(async () => {
    if (!adapterRef.current) {
      setError('Adapter not initialized');
      return;
    }

    try {
      setError(null);
      setStatus('connecting');
      const foundDevices = await adapterRef.current.scan();
      setDevices(foundDevices);
      setStatus('disconnected');
      logger.info('Scan complete:', foundDevices.length, 'devices found');
    } catch (err: any) {
      setError(err.message || 'Scan failed');
      setStatus('error');
      logger.error('Scan error:', err);
    }
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    if (!adapterRef.current) {
      setError('Adapter not initialized');
      return;
    }

    try {
      setError(null);
      setStatus('connecting');
      await adapterRef.current.connect(deviceId);
      
      const device = devices.find(d => d.id === deviceId) || { id: deviceId, name: 'Unknown', transport: 'ftms-ble' as const };
      setConnectedDevice(device);
      setCapabilities(adapterRef.current.getCapabilities());
      setStatus('ready');
      logger.info('Connected to device:', device.name);
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      setError(err.message || 'Failed to start trainer');
      logger.error('Start error:', err);
      throw err;
    }
  }, []);

  // Debounced ERG setter (200ms)
  const setErgWatts = useCallback(
    debounce(async (watts: number) => {
      if (!adapterRef.current) {
        setError('Adapter not initialized');
        return;
      }

      try {
        setError(null);
        const clamped = clampWatts(watts, capabilities);
        await adapterRef.current.setErgWatts(clamped);
        setStatus('erg_active');
        logger.debug('ERG set to', clamped, 'W');
      } catch (err: any) {
        setError(err.message || 'Failed to set ERG power');
        logger.error('Set ERG error:', err);
      }
    }, 200),
    [capabilities]
  );

  const setResistance = useCallback(async (level: number) => {
    if (!adapterRef.current || !adapterRef.current.setResistance) {
      setError('Resistance control not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.setResistance(level);
      logger.info('Resistance set to', level);
    } catch (err: any) {
      setError(err.message || 'Failed to set resistance');
      logger.error('Set resistance error:', err);
      throw err;
    }
  }, []);

  const setSlope = useCallback(async (grade: number) => {
    if (!adapterRef.current || !adapterRef.current.setSlope) {
      setError('Slope control not available');
      return;
    }

    try {
      setError(null);
      await adapterRef.current.setSlope(grade);
      logger.info('Slope set to', grade);
    } catch (err: any) {
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
  };
}
