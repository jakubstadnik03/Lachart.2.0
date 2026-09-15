/**
 * A planned session as text — "15:00 warm-up Z1, 5 × (8:00 work LT2 + 4:00
 * recovery Z1), 10:00 cool-down Z1" — for hover cards and previews. Pure, so
 * it can be read without the modal it decorates.
 */
import { formatTargetLabel } from '../components/WorkoutPlanner/WorkoutBuilder';

const KIND_LABEL = { warmup: 'warm-up', work: 'work', recovery: 'recovery', cooldown: 'cool-down', rest: 'rest' };

export function fmtStepSize(step) {
  if (step?.durationType === 'distance' && Number(step.distanceMeters) > 0) {
    const m = Number(step.distanceMeters);
    return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${Math.round(m)} m`;
  }
  const s = Number(step?.durationSeconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function stepText(step) {
  const target = formatTargetLabel(step?.powerTarget);
  const kind = step?.label || KIND_LABEL[step?.stepType] || 'step';
  // A label that already names the target ("Easy Z1") is not followed by it again.
  const showTarget = target && !String(kind).toLowerCase().endsWith(target.toLowerCase());
  return `${fmtStepSize(step)} ${kind}${showTarget ? ` ${target}` : ''}`;
}

/** A ramp block (the builder's stepped warm-up / cool-down) as one line: total, kind, first → last target. */
function blockText(block) {
  const secs = block.reduce((a, s) => a + (Number(s.durationSeconds) || 0), 0);
  const first = formatTargetLabel(block[0]?.powerTarget);
  const last = formatTargetLabel(block[block.length - 1]?.powerTarget);
  const kind = KIND_LABEL[block[0]?.blockKind] || KIND_LABEL[block[0]?.stepType] || 'ramp';
  const range = first && last && first !== last ? ` ${first} → ${last}` : (first ? ` ${first}` : '');
  return `${fmtStepSize({ durationSeconds: secs })} ${kind}${range} (${block.length} steps)`;
}

/**
 * The steps as lines, repeats folded: one line per step, one per group with
 * its members in brackets and the count in front.
 */
export function stepsToLines(steps) {
  if (!Array.isArray(steps)) return [];
  const lines = [];
  const seen = new Set();
  const seenBlocks = new Set();
  steps.forEach((s) => {
    if (!s) return;
    if (s.blockId && !s.groupId) {
      if (seenBlocks.has(s.blockId)) return;
      seenBlocks.add(s.blockId);
      const block = steps.filter((x) => x && x.blockId === s.blockId && !x.groupId);
      if (block.length > 1) { lines.push({ text: blockText(block), kind: s.blockKind || s.stepType || 'work' }); return; }
    }
    if (!s.groupId) { lines.push({ text: stepText(s), kind: s.stepType || 'work' }); return; }
    if (seen.has(s.groupId)) return;
    seen.add(s.groupId);
    const group = steps.filter((x) => x && x.groupId === s.groupId);
    const header = group.find((x) => x.isGroupHeader) || group[0];
    const reps = header?.groupRepeat || 1;
    lines.push({ text: `${reps} × (${group.map(stepText).join(' + ')})`, kind: 'group' });
  });
  return lines;
}
