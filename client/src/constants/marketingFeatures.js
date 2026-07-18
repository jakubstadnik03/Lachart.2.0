/**
 * Single source of truth for LaChart marketing feature copy (About page, auth carousel, ads).
 * Keep in sync with PLANS_UI in SettingsPage.jsx when describing paid tiers.
 */

export const MARKETING_FEATURE_CATEGORIES = [
  'All',
  'Testing',
  'Analysis',
  'Training',
  'Planning',
  'Execution',
  'Integration',
  'Coach',
  'Tools',
];

export const MARKETING_FEATURES = [
  // Testing
  { cat: 'Testing', title: 'Lactate Curve Generation', body: 'Enter test values and auto-generate your curve. Calculates LT1, LT2, LTP1, LTP2, IAT, log-log, OBLA (2.0–3.5) and baseline.', icon: 'M3 20h18M5 16l3-6 4 4 5-9' },
  { cat: 'Testing', title: 'Training Zone Calculation', body: 'Auto-calculate 5 training zones with precise power / pace / HR ranges for cycling, running and swimming.', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { cat: 'Testing', title: 'Step-Test Wizard', body: 'Generate stage ladders from start power/pace and increment — ideal for field or lab protocols.', icon: 'M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h8' },

  // Analysis
  { cat: 'Analysis', title: 'Historical Test Comparison', body: 'Store every test and overlay curves over time. See LT1 and LT2 shift as fitness improves.', icon: 'M12 7v5l3 2' },
  { cat: 'Analysis', title: 'Form & Fitness (CTL / ATL / TSB)', body: 'Daily fitness, fatigue and form with plain-English status — fresh, optimal, productive, overreaching.', icon: 'M9 19v-6H5v6M14 19v-9h-4M21 19V5h-3v14' },
  { cat: 'Analysis', title: 'TSS & Weekly Load', body: 'Training Stress Score per workout, weekly load charts and sport split — same numbers as your calendar.', icon: 'M3 3v18h18M7 16l4-8 4 5 5-9' },
  { cat: 'Analysis', title: 'Intensity & Zone Distribution', body: 'Time in Z1–Z5 from power or HR — donut charts, heatmaps and period stats on the training calendar.', icon: 'M12 2a10 10 0 1 0 10 10' },
  { cat: 'Analysis', title: 'Population Comparison', body: 'Benchmark your LT1/LT2 and test results against athletes on LaChart with the same sport and profile.', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { cat: 'Analysis', title: 'Training Insights', body: 'Daily readiness hints from form, HRV, sleep and planned load — with weekly signals on the dashboard.', icon: 'M12 3v3M12 18v3M5 12H2M22 12h-3M5.6 5.6l-2.1-2.1M20.5 20.5l-2.1-2.1M5.6 18.4l-2.1 2.1M20.5 3.5l-2.1 2.1' },

  // Training
  { cat: 'Training', title: 'Lactate on Any Interval', body: 'Tag any lap of any workout with a blood sample. Every value feeds back into your curve and zones.', icon: 'M12 3s7 8 7 13a7 7 0 1 1-14 0c0-5 7-13 7-13z' },
  { cat: 'Training', title: 'Training Progress Tracking', body: 'Compare the same workout type over time — pace or power at the same lactate level.', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { cat: 'Training', title: 'Auto Session Categories', body: 'Sessions classified as endurance, tempo, threshold, VO₂max or recovery based on your zones.', icon: 'M7 7h.01M3 7v5a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 12 3H7a4 4 0 0 0-4 4z' },

  // Planning
  { cat: 'Planning', title: 'Workout Planner', body: 'Build structured workouts — warm-up, intervals with target zones, recoveries, cooldown — and drop them on the calendar.', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { cat: 'Planning', title: 'Training Calendar', body: 'Week, month and season view — planned vs completed, drag sessions, daily TSS and sport colours.', icon: 'M3 10h18M8 3v4M16 3v4' },
  { cat: 'Planning', title: 'Race Planning & Taper', body: 'Countdown to A/B/C races, CTL targets, taper suggestions and post-race feedback.', icon: 'M6 3v18M18 3v18M4 8h16M4 16h16' },

  // Execution
  { cat: 'Execution', title: 'Live Workout Mode', body: 'Run planned sessions step-by-step — timers, target zones and adherence in the browser or iOS app.', icon: 'M5 3l14 9-14 9V3z' },
  { cat: 'Execution', title: 'Smart Trainer (FTMS)', body: 'Pair over Bluetooth and execute structured workouts with automatic resistance — no Zwift required.', icon: 'M12 18h.01M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0' },

  // Integration
  { cat: 'Integration', title: 'Strava Sync', body: 'Auto-import rides, runs and swims with power, HR, pace and laps — backfill history in one click.', icon: 'M7 16a4 4 0 0 1-.88-7.9A5 5 0 0 1 15.9 6M16 16a4 4 0 1 0 0-8M12 22V10M15 13l-3-3-3 3' },
  { cat: 'Integration', title: 'Garmin Connect', body: 'Sync activities from Garmin Connect — same pipeline as Strava, with auto-sync on a schedule.', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { cat: 'Integration', title: 'FIT File Upload', body: 'Garmin, Wahoo, Polar, Suunto — upload FIT files with full interval detection.', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' },
  { cat: 'Integration', title: 'Apple Health', body: 'Resting HR, HRV, sleep and workouts from iPhone — wellness and readiness on the dashboard.', icon: 'M21 8.5c0-3-2-5.5-5-5.5-2.5 0-4 1.5-4 1.5S10.5 3 8 3c-3 0-5 2.5-5 5.5C3 14 12 21 12 21s9-7 9-12.5z' },
  { cat: 'Integration', title: 'Native iOS App', body: 'Full LaChart on iPhone — dashboard, testing, calendar, Apple Health and home-screen widget.', icon: 'M12 18h.01M7 21h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z' },

  // Coach
  { cat: 'Coach', title: 'Athlete Management', body: 'Unlimited athletes, status dots, athlete switcher and coach dashboard in one workspace.', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { cat: 'Coach', title: 'Plan for Athletes', body: 'Build once, push to any athlete calendar — compare plan vs what they actually did.', icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 4h6v4H9zM9 14l2 2 4-4' },
  { cat: 'Coach', title: 'Branded PDF Reports', body: 'Your logo, studio name and colours — professional lactate handouts for every athlete.', icon: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13l3 3 5-6' },

  // Tools
  { cat: 'Tools', title: 'Free Lactate Calculator', body: 'No sign-up required — generate a curve and all thresholds instantly at lachart.net.', icon: 'M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h8' },
  { cat: 'Tools', title: 'PDF Report Export', body: 'Curve, HR overlay, zones, stage table and recommendations — share or print in seconds.', icon: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 13h6M9 17h6' },
  { cat: 'Tools', title: 'Share Activity Cards', body: 'Export route, stats or weekly summary as Instagram-ready images from any session.', icon: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13' },
];

export function featureCountByCategory(cat) {
  if (cat === 'All') return MARKETING_FEATURES.length;
  return MARKETING_FEATURES.filter((f) => f.cat === cat).length;
}
