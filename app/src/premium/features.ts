/**
 * Premium feature matrix.
 *
 * Mobile app does NOT sell subscriptions (per Apple guideline 3.1.3 reader-app model).
 * Subscriptions are managed externally on lachart.app — same as TrainingPeaks, Strava.
 *
 * Locked features display a static "Premium feature" message WITHOUT any link,
 * button, or pricing. Users must visit lachart.app themselves to subscribe.
 */

export type Tier = 'free' | 'athlete' | 'coach';

/**
 * Single source of truth for what each tier unlocks.
 * Keep in sync with web client/src/config (when subscription tiers ship).
 */
export const FEATURES = {
  // === Athlete features ===
  unlimitedTests: ['athlete', 'coach'] as Tier[],
  fullTestHistory: ['athlete', 'coach'] as Tier[],
  advancedZones: ['athlete', 'coach'] as Tier[],
  workoutBuilder: ['athlete', 'coach'] as Tier[],
  appleHealthSync: ['athlete', 'coach'] as Tier[],
  stravaSync: ['athlete', 'coach'] as Tier[],
  pdfExport: ['athlete', 'coach'] as Tier[],
  testTemplates: ['athlete', 'coach'] as Tier[],

  // === Coach-only features ===
  manageAthletes: ['coach'] as Tier[],
  coachDashboard: ['coach'] as Tier[],
  athleteCalendar: ['coach'] as Tier[],
  compareAthletes: ['coach'] as Tier[],
  whiteLabelExport: ['coach'] as Tier[],
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Free tier hard limits — used to gate quantity (vs feature presence). */
export const FREE_LIMITS = {
  maxTestsHistory: 3, // free user vidí jen poslední 3 testy
  maxAthletes: 0,      // free coach nemůže přidat ani jednoho atleta
  calendarHistoryDays: 30,
} as const;

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return (FEATURES[feature] as readonly Tier[]).includes(tier);
}
