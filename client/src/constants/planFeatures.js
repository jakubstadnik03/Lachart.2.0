/**
 * What each plan promises — one source of truth for every paywall surface.
 *
 * Read by:
 *   client/src/components/UpgradeModal.jsx        (hit a locked feature)
 *   client/src/components/WelcomePaywallModal.jsx (first sign-in)
 *   client/src/pages/SettingsPage.jsx             (Subscription tab)
 *   client/src/pages/About.jsx                    (public pricing)
 *
 * These four used to carry four hand-kept copies of the same list, each with a
 * comment asking the next person to keep them in step. They drifted. Now they
 * import from here, and the feature keys line up with FEATURE_MATRIX in
 * server/middleware/featureGate.js — the thing that actually enforces them.
 *
 * ── Why the list is split in two ──────────────────────────────────────────
 * LaChart is bought for two different reasons, and the billing data says so:
 * a quarter of paying accounts have never saved a single lactate test. They
 * pay for the calendar, the structured workouts and the watch export. Folding
 * everything into one lactate-shaped list sold those people a product they
 * were not buying, and sold everyone else a shorter one than they got.
 *
 * So each paid plan states two value lines — one per track — and lists its
 * features under two headings. A reader who came for lactate finds their
 * sentence first; a reader who came for the platform finds theirs right
 * under it, instead of having to infer it from bullet six.
 */

import { FREE_TEST_LIMIT } from './planLimits';

/** The two things LaChart is bought for. Order is stable across all surfaces. */
export const TRACKS = {
  testing: { key: 'testing', label: 'Lactate testing' },
  training: { key: 'training', label: 'Training platform' },
};

/** Free plan — a flat list; there is no upsell to structure here. */
export const FREE_FEATURES = [
  `${FREE_TEST_LIMIT} lactate tests`,
  'Garmin & Strava sync',
  'Add lactate values to intervals',
  'Connect with your coach',
  'Basic analytics',
];

/**
 * Paid plans. `valueLines` are the two sentences shown above the list;
 * `groups` are the same promise broken into checkable items.
 */
export const PLAN_FEATURES = {
  pro: {
    valueLines: [
      { track: 'testing', text: 'Test as often as you train, and keep every curve to compare against.' },
      { track: 'training', text: 'Plan the week and push structured workouts straight to your Garmin.' },
    ],
    groups: [
      {
        track: 'testing',
        items: [
          'Unlimited lactate tests',
          'Full test history — compare every curve',
          'Population comparison',
          'PDF export of test reports',
        ],
      },
      {
        track: 'training',
        items: [
          'Push structured workouts to your Garmin',
          'Plan your week in the calendar',
          'Start trainings from the app & smart trainer',
          'Load, form and fitness over the full history',
          'Priority support',
        ],
      },
    ],
  },
  coach: {
    valueLines: [
      { track: 'testing', text: 'Test your whole roster and send each athlete a report with your name on it.' },
      { track: 'training', text: 'Plan their weeks and push every session to their watch.' },
    ],
    groups: [
      {
        track: 'testing',
        items: [
          'Unlimited athletes',
          'Unlimited PDF report generation',
          'PDF branding — your logo, title & address',
        ],
      },
      {
        track: 'training',
        items: [
          'Push each athlete’s session to their Garmin',
          'Plan workouts for your athletes',
          'Coach dashboard & overview',
          'Everything in Athlete',
        ],
      },
    ],
  },
};

/** Track label for a group, e.g. 'Lactate testing'. */
export function trackLabel(trackKey) {
  return TRACKS[trackKey]?.label ?? '';
}

/**
 * The plan's features as one flat list, groups in order.
 * For surfaces that have no room for headings (narrow cards, plain text).
 */
export function flatPlanFeatures(planId) {
  const plan = PLAN_FEATURES[planId];
  if (!plan) return [];
  return plan.groups.flatMap((g) => g.items);
}
