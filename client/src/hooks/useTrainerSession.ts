// src/hooks/useTrainerSession.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectTrainer,
  disconnectTrainer,
  setOnSampleCallback,
  setTargetPower,
  TrainerSample,
} from "../bluetoothTrainer";

export function useTrainerSession() {
  const [isRunning, setIsRunning] = useState(false);
  const [samples, setSamples] = useState<TrainerSample[]>([]);
  const [targetPower, setTargetPowerState] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      disconnectTrainer();
    };
  }, []);

  const startSession = useCallback(async () => {
    try {
      setSamples([]);
      setIsRunning(true);
      setIsConnected(false);

      await connectTrainer();
      setIsConnected(true);

      setOnSampleCallback((sample) => {
        if (!isMounted.current) return;
        // Přidávání vzorků - případně můžete přidat downsample pro výkon
        setSamples((prev) => [...prev, sample]);
      });
    } catch (error) {
      console.error("Error starting session:", error);
      setIsRunning(false);
      setIsConnected(false);
      throw error;
    }
  }, []);

  const stopSession = useCallback(async () => {
    setIsRunning(false);
    setIsConnected(false);
    await disconnectTrainer();
  }, []);

  const changeTargetPower = useCallback(async (power: number) => {
    try {
      setTargetPowerState(power);
      await setTargetPower(power);
    } catch (error) {
      console.error("Error setting target power:", error);
      throw error;
    }
  }, []);

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

