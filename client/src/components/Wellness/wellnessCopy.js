/**
 * Questions, answer labels and colours for the daily wellness check-in.
 *
 * Shared by the form, the coach card and the per-area chart, so a 4 means the
 * same words everywhere. The order is the order the form asks in, and matches
 * AREAS in server/utils/wellnessScore.js.
 *
 * `higherIsBetter: false` marks the reverse-scored areas: for stress and
 * soreness a drop is the good news, which is why the tiles take their colour
 * from the server's `trend`, never from the sign of the change.
 */

export const WELLNESS_AREAS = [
  {
    key: 'wellbeing',
    label: 'Wellbeing',
    question: 'How do you feel overall?',
    higherIsBetter: true,
    scale: ['Very bad', 'Bad', 'OK', 'Good', 'Very good'],
  },
  {
    key: 'sleep',
    label: 'Sleep',
    question: 'How well did you sleep?',
    higherIsBetter: true,
    scale: ['Very poorly', 'Poorly', 'OK', 'Well', 'Very well'],
  },
  {
    key: 'energy',
    label: 'Energy',
    question: 'How much energy do you have for training?',
    higherIsBetter: true,
    scale: ['None', 'Little', 'Some', 'Good', 'Plenty'],
  },
  {
    key: 'stress',
    label: 'Stress',
    question: 'How stressed are you in everyday life?',
    higherIsBetter: false,
    scale: ['None', 'Low', 'Some', 'High', 'Very high'],
  },
  {
    key: 'sorenessUpper',
    label: 'Upper body',
    question: 'Muscle soreness, upper body',
    higherIsBetter: false,
    scale: ['None', 'Slight', 'Moderate', 'Sore', 'Very sore'],
  },
  {
    key: 'sorenessLower',
    label: 'Lower body',
    question: 'Muscle soreness, lower body',
    higherIsBetter: false,
    scale: ['None', 'Slight', 'Moderate', 'Sore', 'Very sore'],
  },
];

export function areaByKey(key) {
  return WELLNESS_AREAS.find((a) => a.key === key) || null;
}

/** The two lines on the score chart. Mirrors BAND_GOOD / BAND_LOW on the server. */
export const BAND_GOOD = 60;
export const BAND_LOW = 35;

export const BAND_STYLE = {
  good: { label: 'Good', hex: '#10b981', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  watch: { label: 'Watch', hex: '#f59e0b', pill: 'bg-amber-50 text-amber-700 ring-amber-200' },
  low: { label: 'Low', hex: '#f43f5e', pill: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** Improvement green, decline red, no change neutral. */
export const TREND_STYLE = {
  better: { hex: '#059669', text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  worse: { hex: '#e11d48', text: 'text-rose-600', bg: 'bg-rose-50', ring: 'ring-rose-200' },
  same: { hex: '#6b7280', text: 'text-gray-500', bg: 'bg-gray-50', ring: 'ring-gray-200' },
};

/** "+2", "−1", "±0", or "—" when there is nothing to compare against. */
export function formatDelta(delta) {
  if (delta == null) return '—';
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** The one line that frames every number in this feature. */
export const GUIDANCE_NOTE =
  'Self-reported, to guide the conversation. Not a medical or readiness test; training decisions stay with the coach.';
