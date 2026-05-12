/**
 * VLamax — Maximal Lactate Production Rate.
 *
 *   VLamax = (peakLactate − preLactate) / (sprintDurationSec − alacticOffsetSec)
 *
 * Units: mmol · L⁻¹ · s⁻¹.
 *
 * The alactic offset (~3 s on the bike, ~3.5 s in running) accounts for the
 * window during which the phosphagen system fuels the effort and no
 * meaningful lactate accumulates yet.
 */

/** Compute VLamax + peak from raw inputs. Returns null when inputs invalid. */
export function computeVLamax({ preLactate, samples, sprintDurationSec, alacticOffsetSec = 3.0 }) {
  const pre = Number(preLactate);
  const dur = Number(sprintDurationSec);
  const alactic = Number(alacticOffsetSec);
  if (!Number.isFinite(pre) || pre < 0) return null;
  if (!Number.isFinite(dur) || dur <= 0) return null;
  if (!Number.isFinite(alactic) || alactic < 0) return null;
  if (dur - alactic <= 0) return null;

  const valid = (samples || [])
    .map(s => ({ tMin: Number(s.tMin), lactate: Number(s.lactate) }))
    .filter(s => Number.isFinite(s.tMin) && s.tMin >= 0 && Number.isFinite(s.lactate) && s.lactate > 0);
  if (valid.length === 0) return null;
  const peak = valid.reduce((best, s) => (s.lactate > best.lactate ? s : best), valid[0]);
  const vlamax = (peak.lactate - pre) / (dur - alactic);
  return {
    peakLactate: peak.lactate,
    peakAtMin: peak.tMin,
    vlamax: Number.isFinite(vlamax) ? vlamax : null,
  };
}

/** Interpret a VLamax number into a profile label + colour. */
export function interpretVLamax(vlamax) {
  if (vlamax == null || !Number.isFinite(vlamax)) return null;
  if (vlamax >= 0.90) return { label: 'Sprinter / power',     color: 'text-red-700 bg-red-50 border-red-200',          hint: 'Very high glycolytic capacity — power events.' };
  if (vlamax >= 0.65) return { label: 'Explosive / mixed',   color: 'text-orange-700 bg-orange-50 border-orange-200', hint: 'High glycolytic, well-rounded.' };
  if (vlamax >= 0.45) return { label: 'All-rounder',         color: 'text-amber-700 bg-amber-50 border-amber-200',    hint: 'Balanced — typical road cyclist / 5–10k runner.' };
  if (vlamax >= 0.30) return { label: 'Endurance-leaning',   color: 'text-emerald-700 bg-emerald-50 border-emerald-200', hint: 'Lower lactate production — good for TT / long climbs.' };
  return                    { label: 'Pure endurance',       color: 'text-teal-700 bg-teal-50 border-teal-200',        hint: 'Very low glycolytic — ultra / Ironman profile.' };
}
