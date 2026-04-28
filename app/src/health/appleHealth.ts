/**
 * Apple Health (HealthKit) integration for LaChart.
 * Requires a development build — does NOT work in Expo Go.
 * Uses react-native-health (install: npx expo install react-native-health)
 */
import { Platform } from 'react-native';

// Dynamically import to avoid crash on Android / Expo Go
let AppleHealthKit: any = null;
let Permissions: any = null;

try {
  const rnh = require('react-native-health');
  AppleHealthKit = rnh.default ?? rnh.AppleHealthKit ?? rnh;
  Permissions = rnh.HealthPermissions ?? rnh.AppleHealthKit?.Constants?.Permissions;
} catch {
  // Package not installed or running on Android/Expo Go
}

export const isAppleHealthAvailable = (): boolean => {
  return Platform.OS === 'ios' && AppleHealthKit !== null;
};

const READ_PERMISSIONS = [
  'Workout',
  'HeartRate',
  'ActiveEnergyBurned',
  'DistanceWalkingRunning',
  'DistanceCycling',
  'DistanceSwimming',
  'StepCount',
];

/**
 * Request HealthKit permissions. Returns true if granted.
 */
export async function requestAppleHealthPermissions(): Promise<boolean> {
  if (!isAppleHealthAvailable()) return false;

  return new Promise((resolve) => {
    const perms = READ_PERMISSIONS.reduce((acc: any, key: string) => {
      if (Permissions?.[key]) acc.push(Permissions[key]);
      return acc;
    }, []);

    AppleHealthKit.initHealthKit(
      { permissions: { read: perms, write: [] } },
      (err: any) => resolve(!err),
    );
  });
}

export interface HealthWorkout {
  id: string;
  type: string;         // 'Running' | 'Cycling' | 'Swimming' | ...
  startDate: string;    // ISO
  endDate: string;      // ISO
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
  avgHeartRate: number | null;
  sourceName: string;   // e.g. 'Apple Watch'
}

/**
 * Fetch workouts from HealthKit since a given ISO date.
 */
export async function fetchRecentWorkouts(since: string): Promise<HealthWorkout[]> {
  if (!isAppleHealthAvailable()) return [];

  return new Promise((resolve) => {
    AppleHealthKit.getSamples(
      {
        startDate: since,
        endDate: new Date().toISOString(),
        type: 'Workout',
      },
      (err: any, results: any[]) => {
        if (err || !Array.isArray(results)) { resolve([]); return; }

        const workouts: HealthWorkout[] = results.map((w) => ({
          id: w.id ?? w.uuid ?? String(w.startDate),
          type: w.activityName ?? w.type ?? 'Other',
          startDate: w.startDate,
          endDate: w.endDate,
          durationSeconds: Math.round(w.duration ?? 0),
          distanceMeters: Math.round((w.distance ?? 0) * 1000), // km → m
          calories: Math.round(w.calories ?? w.totalEnergyBurned ?? 0),
          avgHeartRate: w.heartRate ?? null,
          sourceName: w.sourceName ?? 'Apple Health',
        }));

        resolve(workouts);
      },
    );
  });
}
