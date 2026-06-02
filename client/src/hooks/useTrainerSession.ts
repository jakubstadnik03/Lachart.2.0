// Legacy hook name — delegates to useTrainer + ftmsAdapter (not bluetoothTrainer.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrainer } from '../trainer/react/useTrainer';

export type TrainerSample = {
  t: number;
  power: number;
  cadence: number;
  speed: number;
};

export function useTrainerSession() {
  const trainer = useTrainer();
  const [isRunning, setIsRunning] = useState(false);
  const [samples, setSamples] = useState<TrainerSample[]>([]);
  const [targetPower, setTargetPowerState] = useState<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const isMounted = useRef(true);

  const isConnected = ['ready', 'controlled', 'erg_active'].includes(trainer.status);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      trainer.disconnect().catch(() => {});
    };
  }, [trainer.disconnect]);

  useEffect(() => {
    if (!isRunning || !trainer.telemetry) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    const sample: TrainerSample = {
      t: (Date.now() - sessionStartRef.current) / 1000,
      power: trainer.telemetry.power ?? 0,
      cadence: trainer.telemetry.cadence ?? 0,
      speed: trainer.telemetry.speed ?? 0,
    };
    if (!isMounted.current) return;
    setSamples((prev) => [...prev, sample]);
  }, [trainer.telemetry, isRunning]);

  const startSession = useCallback(async () => {
    try {
      setSamples([]);
      sessionStartRef.current = null;
      setIsRunning(true);

      const found = await trainer.scan();
      if (!found?.length) {
        throw new Error('No trainer selected');
      }
      await trainer.connect(found[0].id);
      if (trainer.requestControl) {
        try { await trainer.requestControl(); } catch { /* non-fatal */ }
      }
      if (trainer.start) {
        try { await trainer.start(); } catch { /* non-fatal */ }
      }
    } catch (error) {
      console.error('Error starting session:', error);
      setIsRunning(false);
      throw error;
    }
  }, [trainer]);

  const stopSession = useCallback(async () => {
    setIsRunning(false);
    sessionStartRef.current = null;
    await trainer.disconnect();
  }, [trainer]);

  const changeTargetPower = useCallback(async (power: number) => {
    try {
      setTargetPowerState(power);
      await trainer.setErgWatts(power);
    } catch (error) {
      console.error('Error setting target power:', error);
      throw error;
    }
  }, [trainer.setErgWatts]);

  return {
    isRunning,
    isConnected,
    samples,
    targetPower,
    startSession,
    stopSession,
    changeTargetPower,
  };
}
