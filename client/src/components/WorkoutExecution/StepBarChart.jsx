/**
 * StepBarChart
 * ────────────
 * Compact horizontal bar chart of a workout's planned intervals.
 *
 * Each bar:
 *   • height — proportional to that step's target wattage (relative to the
 *     workout's max planned watts), so the silhouette looks like the
 *     classic Zwift / TrainerRoad workout profile.
 *   • width  — proportional to duration so long endurance blocks dominate
 *     visually like they do in real time.
 *   • colour — by stepType (warmup amber, work purple, recovery green,
 *     cooldown sky, rest grey).
 *
 * State overlays:
 *   • Current step gets a glowing outline + slight upscale.
 *   • Past steps are dimmed and (when execution data is present) get a
 *     thin "actual" fill on top showing the recorded avg watts vs target,
 *     so the athlete can scan over and immediately see where they hit /
 *     missed the prescription.
 *   • Steps with at least one recorded lactate sample show a tiny flask
 *     dot above the bar.
 *   • Tap a bar to jump execution to that step (caller-supplied callback).
 *
 * Replacement for the older StepMiniMap, which only used uniform-height
 * coloured squares — those gave no sense of intensity profile.
 *
 * Designed mobile-first: a default 60–80px height fits below the header
 * without dominating the screen, and the bars stay tappable even when the
 * workout has 30+ steps (a minimum 6px bar width is enforced).
 */
import React, { useMemo } from 'react';

const STEP_COLORS = {
  warmup:   { bar: '#fbbf24', edge: '#f59e0b' },
  work:     { bar: '#a78bfa', edge: '#7c3aed' },
  recovery: { bar: '#6ee7b7', edge: '#10b981' },
  cooldown: { bar: '#38bdf8', edge: '#0ea5e9' },
  rest:     { bar: '#d1d5db', edge: '#9ca3af' },
};

export default function StepBarChart({
  steps = [],
  currentIdx = 0,
  resolveTargetWatts,
  context,
  stepPowerRef,    // ref: { [idx]: { sum, count } }
  lactateLogRef,   // ref: array of { stepIdx, value }
  onStepTap,
  height = 64,
}) {
  // ── Geometry ─────────────────────────────────────────────────────────────
  const meta = useMemo(() => {
    const out = steps.map((s) => {
      const target = resolveTargetWatts
        ? resolveTargetWatts(s.powerTarget, context) ?? 0
        : 0;
      return {
        step: s,
        durationSeconds: Math.max(1, s.durationSeconds || 0),
        target,
      };
    });
    const totalDur = out.reduce((sum, m) => sum + m.durationSeconds, 0);
    const maxTarget = Math.max(120, ...out.map((m) => m.target || 0));
    return { rows: out, totalDur, maxTarget };
  }, [steps, resolveTargetWatts, context]);

  if (meta.rows.length === 0) {
    return <div style={{ height }} className="rounded-lg bg-white/[0.02]" />;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Baseline */}
      <div className="absolute left-0 right-0 bottom-0 h-px bg-white/10" />
      <div className="flex w-full h-full items-end gap-[1.5px]">
        {meta.rows.map((m, i) => {
          const col = STEP_COLORS[m.step.stepType] || STEP_COLORS.work;
          const widthPct = (m.durationSeconds / meta.totalDur) * 100;
          const heightPct = m.target > 0
            ? Math.max(8, (m.target / meta.maxTarget) * 100)
            : 8; // open/rest steps get a thin floor stripe

          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;

          // Actual avg watts (if data exists) — overlay as a darker bar on top
          const pData = stepPowerRef?.current?.[i];
          const actual = pData && pData.count > 0 ? pData.sum / pData.count : null;
          const actualHeightPct = actual != null
            ? Math.max(4, (actual / meta.maxTarget) * 100)
            : null;

          // Lactate marker
          const hasLactate = (lactateLogRef?.current || []).some((l) => l.stepIdx === i);

          return (
            <button
              key={i}
              onClick={() => onStepTap && onStepTap(i)}
              className="relative h-full flex-shrink-0 group"
              style={{
                width: `${widthPct}%`,
                minWidth: 6,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: onStepTap ? 'pointer' : 'default',
              }}
              title={`${m.step.label || m.step.stepType}${m.target ? ` · ${m.target} W` : ''}`}
            >
              {/* The planned target bar */}
              <div
                className="absolute left-0 right-0 bottom-0 rounded-t-sm transition-all"
                style={{
                  height: `${heightPct}%`,
                  background: col.bar,
                  opacity: isCurrent ? 1 : isPast ? 0.32 : 0.58,
                  boxShadow: isCurrent ? `0 0 12px ${col.edge}88, inset 0 -2px 0 ${col.edge}` : 'none',
                  outline: isCurrent ? `1px solid ${col.edge}` : 'none',
                }}
              />

              {/* Actual avg overlay — solid darker stripe on top of the planned bar */}
              {actualHeightPct != null && (
                <div
                  className="absolute left-[15%] right-[15%] bottom-0 rounded-t-sm"
                  style={{
                    height: `${actualHeightPct}%`,
                    background: col.edge,
                    opacity: 0.85,
                    // If actual exceeds target, the cap pokes above the planned bar — that's
                    // intentional, visually communicates "you went over".
                  }}
                />
              )}

              {/* Lactate marker */}
              {hasLactate && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    top: 2,
                    width: 6,
                    height: 6,
                    background: '#fbbf24',
                    boxShadow: '0 0 0 1.5px #0f172a',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
