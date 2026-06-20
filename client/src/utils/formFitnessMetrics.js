/**
 * Shared copy for CTL / ATL / TSB (Fitness, Fatigue, Form).
 * Used by native Status card, web glossary, and help sheets.
 */

export const FORM_FITNESS_INTRO =
  'LaChart estimates your training balance from every workout\'s Training Stress Score (TSS). Three curves work together: long-term fitness, short-term fatigue, and the gap between them — your form.';

export const FORM_FITNESS_METRICS = [
  {
    id: 'fitness',
    label: 'Fitness',
    aliases: ['CTL', 'Chronic Training Load'],
    color: '#3b82f6',
    short: 'Your long-term aerobic base — built slowly over weeks.',
    detail:
      'Rolling average of daily training load over ~42 days. Rises with consistent training and drops slowly when you rest. Higher fitness means you can handle bigger training blocks.',
  },
  {
    id: 'fatigue',
    label: 'Fatigue',
    aliases: ['ATL', 'Acute Training Load'],
    color: '#9333ea',
    short: 'How tired you are from recent hard sessions.',
    detail:
      'Rolling average over ~7 days. Jumps up after hard days and falls quickly with recovery. High fatigue is normal during a training block but hurts performance if it stays high too long.',
  },
  {
    id: 'form',
    label: 'Form',
    aliases: ['TSB', 'Training Stress Balance'],
    color: '#f97316',
    short: 'Readiness = Fitness minus Fatigue.',
    detail:
      'Form = Fitness − Fatigue. Positive values mean you\'re fresh relative to your fitness base; negative values mean you\'re carrying training load. Time race peaks when form is moderately positive.',
  },
];

export const TSB_STATUS_BANDS = [
  {
    min: 25,
    label: 'Detraining',
    color: '#599FD0',
    hint: 'Very fresh, but fitness is fading — add training if you want to maintain form.',
  },
  {
    min: 5,
    label: 'Fresh',
    color: '#4BA87D',
    hint: 'Well rested — good for races or breakthrough sessions.',
  },
  {
    min: -10,
    label: 'Optimal',
    color: '#5E6590',
    hint: 'Balanced training load — productive without excessive risk.',
  },
  {
    min: -30,
    label: 'Productive',
    color: '#F59E0B',
    hint: 'Building fitness through meaningful load — expect some tiredness.',
  },
  {
    min: -Infinity,
    label: 'Overreaching',
    color: '#E05347',
    hint: 'Very high load — plan recovery before performance drops or injury risk rises.',
  },
];

export function getTsbStatus(tsb) {
  const n = Number(tsb);
  for (const band of TSB_STATUS_BANDS) {
    if (n > band.min) return band;
  }
  return TSB_STATUS_BANDS[TSB_STATUS_BANDS.length - 1];
}

export function metricById(id) {
  return FORM_FITNESS_METRICS.find((m) => m.id === id) || null;
}
