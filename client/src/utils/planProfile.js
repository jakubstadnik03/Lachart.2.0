/**
 * The shape of a planned workout, as bars — what the calendar thumbnail draws.
 *
 * The thumbnail used to set a bar's height by its step *type*: every "work"
 * step full height, warm-up half, recovery a third. A session built as
 * Z2 → Z3 → Z4 → Z5 → Z1 → Z2, all of them typed "work", came out as a flat
 * comb that looked nothing like the preview in the builder. Heights now come
 * from the same target resolver the builder draws with, so the two agree.
 *
 * Repeat blocks are expanded like the builder expands them, but a thumbnail
 * is sixty pixels wide: when the reps do not fit, the block shows as many
 * cycles as have room and keeps the block's total width.
 */
import { expandSteps, resolveTargetWatts } from '../components/WorkoutPlanner/WorkoutBuilder';

export const PLAN_STEP_COLORS = { warmup: '#fbbf24', work: '#767EB5', recovery: '#6ee7b7', cooldown: '#38bdf8', rest: '#d1d5db' };
const FLOOR = 0.12;
const MIN_BAR_PX = 2;

const secsOf = (s) => Number(s?.durationSeconds) || 30;

/**
 * @returns {Array<{x:number, w:number, h:number, fill:string, step:object, ramp:null|'up'|'down'}>}
 *   x/w in pixels of `width`, h as a fraction of the height (FLOOR..1).
 */
export function planProfileBars(steps, { width = 60, context = null, color = '#767EB5' } = {}) {
  if (!Array.isArray(steps) || !steps.length) return [];
  const ctx = context || {};

  // Segments: a lone step, or a whole repeat block with its members.
  const segments = [];
  const seen = new Set();
  steps.forEach((s) => {
    if (!s.groupId) { segments.push({ members: [s], reps: 1 }); return; }
    if (seen.has(s.groupId)) return;
    seen.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const header = group.find((x) => x.isGroupHeader) || group[0];
    segments.push({ members: group, reps: header.groupRepeat || 1 });
  });

  const total = expandSteps(steps).reduce((a, s) => a + secsOf(s), 0);
  if (!total) return [];
  const allWatts = expandSteps(steps).map((s) => resolveTargetWatts(s.powerTarget, ctx));
  const maxW = Math.max(...allWatts, 1);
  const heightOf = (s) => Math.max(FLOOR, resolveTargetWatts(s.powerTarget, ctx) / maxW);

  const bars = [];
  let x = 0;
  segments.forEach(({ members, reps }) => {
    const cycleSecs = members.reduce((a, s) => a + secsOf(s), 0);
    const segW = (cycleSecs * reps) / total * width;
    // How many cycles can be drawn at MIN_BAR_PX a member.
    const visCycles = Math.max(1, Math.min(reps, Math.floor(segW / (members.length * MIN_BAR_PX))));
    const cycleW = segW / visCycles;
    for (let r = 0; r < visCycles; r += 1) {
      let cx = x + r * cycleW;
      members.forEach((s) => {
        const w = (secsOf(s) / cycleSecs) * cycleW;
        bars.push({
          x: cx,
          w,
          h: heightOf(s),
          fill: PLAN_STEP_COLORS[s.stepType] || color,
          step: s,
          ramp: s.isRamp ? (s.stepType === 'cooldown' ? 'down' : 'up') : null,
        });
        cx += w;
      });
    }
    x += segW;
  });
  return bars;
}
