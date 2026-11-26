import { computeEstTSS } from './WorkoutBuilder';

export function stepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach(s => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach(gs => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}


/**
 * What a planned session is worth — the one answer the screen prints and the
 * save writes.
 *
 * These were computed twice, in two places, and disagreed. The TSS box printed
 * the figure derived from the steps while the save sent whatever had been
 * typed or stored; the duration box did the reverse. A 3h/120 session edited
 * down to 1:25/102 therefore went back to the calendar as 1:25/120, and its
 * card kept quoting a number the builder on the other half of the screen had
 * already contradicted.
 *
 * A structure defines the session. Typed figures only stand in where there is
 * no structure to ask.
 */
export function plannedTotals({ steps, context, sport, typedTss, typedDurationSecs }) {
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  if (hasSteps) {
    const tss = computeEstTSS(steps, { ...context, sport });
    return {
      fromSteps: true,
      durationSecs: stepTotalSecs(steps) || undefined,
      tss: Number.isFinite(tss) && tss > 0 ? Math.round(tss) : undefined,
    };
  }
  return {
    fromSteps: false,
    durationSecs: typedDurationSecs || undefined,
    tss: typedTss ? Number(typedTss) : undefined,
  };
}

/**
 * Which steps a save writes.
 *
 * On a fresh session the builder's composer is pre-filled, so the chart draws
 * its draft (15 min Z1, 4×10 min LT2, 10 min Z1) the moment "Build workout" is
 * opened — but the draft only became steps after "Build steps". "Plan it"
 * pressed straight away saved `steps: []`: an empty session behind a chart of
 * intervals, and nothing on the athlete's watch.
 *
 * With nothing built, the draft is the session on screen, so it is saved.
 * With steps built, a draft stays a draft: it may be the untouched default of
 * a composer opened just to look, and appending it would add blocks nobody
 * asked for.
 */
export function stepsToSave({ builderOpen, steps, draft }) {
  const built = Array.isArray(steps) ? steps : [];
  if (builderOpen && built.length === 0 && Array.isArray(draft) && draft.length > 0) return draft;
  return built;
}
