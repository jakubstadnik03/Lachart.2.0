/**
 * TrainingPeaks-style dual-axis PMC chart:
 * - Left Y: TSS scale for CTL (Fitness) + ATL (Fatigue)
 * - Right Y: Form (TSB), centred on 0
 */

export const PMC_COLORS = {
  fitness: '#2563eb',
  fatigue: '#ec4899',
  form: '#f97316',
};

/** Upper bound for the left TSS axis (steps of 50, min 100). */
export function computeTssAxisMax(values = []) {
  const nums = values.map(Number).filter((v) => Number.isFinite(v) && v >= 0);
  const max = nums.length ? Math.max(...nums) : 0;
  const ceil = Math.ceil((max + 10) / 50) * 50;
  return Math.max(100, Math.min(ceil, 400));
}

/** Symmetric bounds for the right TSB axis. */
export function computeTsbAxisBounds(formValues = []) {
  const nums = formValues.map(Number).filter((v) => Number.isFinite(v));
  const maxAbs = nums.length ? Math.max(...nums.map((v) => Math.abs(v))) : 0;
  const bound = Math.max(30, Math.ceil((maxAbs + 10) / 25) * 25);
  return { min: -bound, max: bound };
}

/** Collect axis domains from PMC point rows ({ Fitness, Fatigue, Form, ... }). */
export function pmcAxisDomainsFromPoints(points = []) {
  const tssVals = [];
  const tsbVals = [];
  points.forEach((p) => {
    if (!p) return;
    [p.Fitness, p.Fatigue, p.fitnessProj, p.fatigueProj, p.FitnessProj, p.FatigueProj]
      .forEach((v) => { if (v != null && Number.isFinite(Number(v))) tssVals.push(Number(v)); });
    [p.Form, p.formProj, p.FormProj]
      .forEach((v) => { if (v != null && Number.isFinite(Number(v))) tsbVals.push(Number(v)); });
  });
  return {
    tssMax: computeTssAxisMax(tssVals),
    ...computeTsbAxisBounds(tsbVals),
  };
}

/** Tick values for SVG / manual labels. */
export function tssAxisTicks(max) {
  const step = max <= 150 ? 25 : 50;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function tsbAxisTicks(min, max) {
  const step = max <= 60 ? 15 : 25;
  const ticks = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  if (!ticks.includes(0) && min < 0 && max > 0) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

/** Max chart window — up to 2 years of PMC history. */
export const PMC_MAX_VIEW_DAYS = 730;

/** Segmented day ranges (calendar combined chart). */
export const PMC_VIEW_DAY_RANGES = [
  { id: 60, label: '60d' },
  { id: 90, label: '90d' },
  { id: 180, label: '180d' },
  { id: 365, label: '1y' },
  { id: 730, label: '2y' },
];

/** Dashboard Form & Fitness dropdown options. */
export const FORM_FITNESS_TIME_RANGES = [
  { value: '30 days', label: 'Past 30 days', days: 30 },
  { value: '60 days', label: 'Past 60 days', days: 60 },
  { value: '90 days', label: 'Past 90 days', days: 90 },
  { value: '180 days', label: 'Past 6 months', days: 180 },
  { value: '365 days', label: 'Past year', days: 365 },
  { value: '730 days', label: 'Past 2 years', days: 730 },
];

export const FORM_FITNESS_TIME_RANGE_VALUES = FORM_FITNESS_TIME_RANGES.map((r) => r.value);

export function daysFromFormFitnessTimeRange(label) {
  const found = FORM_FITNESS_TIME_RANGES.find((r) => r.value === label);
  return found?.days ?? 60;
}

/** Native app StatusHeroCard form chart ranges. */
export const NATIVE_FORM_RANGES = [
  { id: '14d', label: '14d', days: 14 },
  { id: '6w', label: '6w', days: 42 },
  { id: '3m', label: '3m', days: 90 },
  { id: '1y', label: '1y', days: 365 },
  { id: '2y', label: '2y', days: 730 },
];

export function nativeFormRangeDays(id) {
  return NATIVE_FORM_RANGES.find((r) => r.id === id)?.days ?? 90;
}

/** Initial zoom window when opening a chart — show the full selected range. */
export function pmcDefaultZoomWindow(viewDays, pointCount) {
  return Math.min(pointCount || viewDays, viewDays);
}
