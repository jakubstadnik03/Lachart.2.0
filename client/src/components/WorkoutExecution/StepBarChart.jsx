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
 *   • Current step gets a glowing outline + label above showing watts + time.
 *   • The current step is split horizontally into a brighter (elapsed) and
 *     dimmer (remaining) half based on stepElapsed / stepDuration, so the
 *     athlete sees their progress within the interval at a glance.
 *   • Past steps are dimmed and get a thin "actual watts" overlay.
 *   • Steps with at least one lactate sample get a flask dot above the bar.
 *   • Tap a bar to jump execution to that step.
 *
 * Designed mobile-first. Bar minimum width 8 px keeps targets tappable.
 */
import React, { useMemo } from 'react';

const STEP_COLORS = {
  warmup:   { bar: '#fbbf24', edge: '#f59e0b' },
  work:     { bar: '#a78bfa', edge: '#7c3aed' },
  recovery: { bar: '#6ee7b7', edge: '#10b981' },
  cooldown: { bar: '#38bdf8', edge: '#0ea5e9' },
  rest:     { bar: '#d1d5db', edge: '#9ca3af' },
};

function fmtTime(s) {
  const sec = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function StepBarChart({
  steps = [],
  currentIdx = 0,
  stepElapsed = 0,
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

  const barAreaHeight = Math.max(20, height);

  const currentMeta = meta.rows[currentIdx];

  return (
    <div className="relative w-full" style={{ height, overflowX: 'hidden' }}>
      {/* Floating label for the CURRENT step — anchored to the TOP EDGE of
          the bar so it always touches the interval regardless of chart height. */}
      {currentMeta && (() => {
        const before = meta.rows.slice(0, currentIdx).reduce((sum, r) => sum + r.durationSeconds, 0);
        const leftPct = (before / meta.totalDur) * 100;
        const widthPct = (currentMeta.durationSeconds / meta.totalDur) * 100;
        const remaining = Math.max(0, currentMeta.durationSeconds - Math.round(stepElapsed));

        // Compute where the bar top is (in px from chart bottom) so the label
        // can sit right on top of it with a 2 px gap.
        const heightPct = currentMeta.target > 0
          ? Math.max(8, (currentMeta.target / meta.maxTarget) * 100)
          : 8;
        const barTopFromBottom = (heightPct / 100) * barAreaHeight + 2;

        // Center the label over the bar, but clamp so it never overflows the
        // chart edges (e.g. when the current step is the very first bar).
        const barCenterPct = leftPct + widthPct / 2;
        const clampedCenterPct = Math.max(4, Math.min(96, barCenterPct));

        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${clampedCenterPct}%`,
              transform: 'translateX(-50%)',
              bottom: barTopFromBottom,
            }}
          >
            <span
              className="px-1.5 py-[1px] rounded text-[9px] font-bold tabular-nums whitespace-nowrap"
              style={{
                color: '#fff',
                background: (STEP_COLORS[currentMeta.step.stepType] || STEP_COLORS.work).edge + 'cc',
                maxWidth: 'none',
              }}
            >
              {currentMeta.target > 0 && <>{currentMeta.target}W · </>}
              {fmtTime(remaining)}
            </span>
          </div>
        );
      })()}

      {/* Baseline */}
      <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: 0 }} />

      {/* Gap scales down for step-dense workouts so all bars always fit
          within the container width without overflowing. */}
      <div
        className="flex w-full items-end absolute left-0 right-0 bottom-0"
        style={{ height: barAreaHeight, gap: meta.rows.length > 20 ? 0.5 : 1.5 }}
      >
        {meta.rows.map((m, i) => {
          const col = STEP_COLORS[m.step.stepType] || STEP_COLORS.work;
          const widthPct = (m.durationSeconds / meta.totalDur) * 100;
          const heightPct = m.target > 0
            ? Math.max(8, (m.target / meta.maxTarget) * 100)
            : 8;

          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;

          // Within-lap progress for the CURRENT bar — left chunk is the
          // elapsed portion (brighter), right chunk is what's left (darker).
          // Gives instant visual feedback for "where am I in this interval".
          const progressPct = isCurrent
            ? Math.max(0, Math.min(100, (stepElapsed / m.durationSeconds) * 100))
            : (isPast ? 100 : 0);

          // Actual avg watts overlay (past steps only)
          const pData = stepPowerRef?.current?.[i];
          const actual = pData && pData.count > 0 ? pData.sum / pData.count : null;
          const actualHeightPct = !isCurrent && actual != null
            ? Math.max(4, (actual / meta.maxTarget) * 100)
            : null;

          const hasLactate = (lactateLogRef?.current || []).some((l) => l.stepIdx === i);

          return (
            <button
              key={i}
              onClick={() => onStepTap && onStepTap(i)}
              className="relative h-full group"
              style={{
                // flex-shrink: 0 is intentionally removed — with percentage
                // widths driven by duration ratios the bars sum to 100% of
                // the container width, so no bar needs to shrink further.
                // For very dense workouts this keeps everything within bounds.
                flexShrink: 0,
                width: `${widthPct}%`,
                // No minWidth — percentage layout means all bars always fit.
                // A tiny step at 0.5% width is still tappable via the title.
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: onStepTap ? 'pointer' : 'default',
                WebkitTapHighlightColor: 'transparent',
              }}
              title={`${m.step.label || m.step.stepType}${m.target ? ` · ${m.target} W` : ''} · ${fmtTime(m.durationSeconds)}`}
            >
              {/* Bar base — split into "elapsed" (brighter) and "remaining"
                  (dimmer) sub-bars when this is the current step. Past
                  steps render solid-dim, future steps render solid-mid. */}
              {progressPct > 0 && (
                <div
                  className="absolute bottom-0 rounded-tl-sm rounded-bl-sm transition-all"
                  style={{
                    left: 0,
                    width: `${progressPct}%`,
                    height: `${heightPct}%`,
                    background: col.bar,
                    opacity: isCurrent ? 1 : 0.32,
                    boxShadow: isCurrent ? `inset 0 -2px 0 ${col.edge}, 0 0 12px ${col.edge}66` : 'none',
                  }}
                />
              )}
              {progressPct < 100 && (
                <div
                  className="absolute bottom-0 rounded-tr-sm rounded-br-sm transition-all"
                  style={{
                    left: `${progressPct}%`,
                    right: 0,
                    height: `${heightPct}%`,
                    background: col.bar,
                    // When current step → remaining is noticeably dimmer.
                    // When future step → uniform mid opacity. When past
                    // (handled above) we don't reach this branch.
                    opacity: isCurrent ? 0.35 : 0.58,
                  }}
                />
              )}

              {/* Actual avg overlay (past steps only) */}
              {actualHeightPct != null && (
                <div
                  className="absolute left-[15%] right-[15%] bottom-0 rounded-t-sm pointer-events-none"
                  style={{
                    height: `${actualHeightPct}%`,
                    background: col.edge,
                    opacity: 0.85,
                  }}
                />
              )}

              {/* Lactate marker */}
              {hasLactate && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
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
