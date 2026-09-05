/**
 * The interval profile of a session, as a thumbnail — planned and completed.
 *
 * Both calendars draw these: the training calendar's day cells and the
 * dashboard's week strip. They used to draw them from two copies of the same
 * code, which is how the dashboard came to be showing a workout's shape at a
 * different resolution, in different colours, from the page next to it. One
 * copy, so a session looks like itself wherever it appears.
 */
import React from 'react';

/** Runs, walks and swims are read in distance; rides in time. */
export function isRunLikeSport(sport) {
  return /run|walk|hike|trail|swim/i.test(String(sport || ''));
}

/**
 * The interval profile of a structured workout, as a thumbnail.
 *
 * `fluid` swaps the fixed pixel width for a viewBox that stretches to its
 * container — what a calendar card wants, since the card's width is the
 * column's and not known here. `width` then only sets the aspect ratio.
 */
export function PlanMiniChart({ steps, color, width = 60, height = 16, fluid = false }) {
  if (!steps?.length) return null;
  const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };
  const FLOOR = 0.12;

  // Build segment list: individual steps stay as-is; repeat groups become one
  // "compressed" segment that renders a capped number of visible cycles so the
  // chart stays readable even in a 60px-wide thumbnail.
  const segments = []; // { kind:'step', step } | { kind:'group', workDur, recDur, reps, totalDur }
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { segments.push({ kind:'step', step:s }); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const header = group.find(x => x.isGroupHeader);
    const reps = header?.groupRepeat || 1;
    const workDur = header?.durationSeconds || 0;
    const recDur  = group.filter(x => !x.isGroupHeader).reduce((a, g) => a + (g.durationSeconds || 0), 0);
    segments.push({ kind:'group', workDur, recDur, reps, totalDur:(workDur + recDur) * reps });
  });

  const total = segments.reduce((s, seg) =>
    s + (seg.kind === 'step' ? (seg.step.durationSeconds || 30) : seg.totalDur), 0);
  if (!total) return null;

  const elems = [];
  let cx = 0;

  segments.forEach((seg, si) => {
    if (seg.kind === 'step') {
      const s = seg.step;
      const w  = Math.max(1.5, (s.durationSeconds || 30) / total * width);
      const intensity = s.stepType==='work' ? 1 : s.stepType==='warmup' ? 0.55 : s.stepType==='cooldown' ? 0.4 : s.stepType==='recovery' ? 0.3 : 0.15;
      const bh = Math.max(FLOOR * height, intensity * height);
      const bw = Math.max(1, w - 0.5);
      const fill = STEP_COLORS[s.stepType] || color || '#767EB5';
      const sx = cx; cx += w;
      if (s.isRamp && s.stepType === 'warmup') {
        elems.push(<polygon key={si} points={`${sx},${height} ${sx+bw},${height-bh} ${sx+bw},${height}`} fill={fill} opacity={0.85}/>);
      } else if (s.isRamp && s.stepType === 'cooldown') {
        elems.push(<polygon key={si} points={`${sx},${height-bh} ${sx},${height} ${sx+bw},${height}`} fill={fill} opacity={0.85}/>);
      } else {
        elems.push(<rect key={si} x={sx} y={height-bh} width={bw} height={bh} fill={fill} rx={1} opacity={0.85}/>);
      }
    } else {
      // Repeat group — render as a compressed "comb" of work/recovery stripes.
      // Limit visible cycles so each stripe is at least 2px wide.
      const { workDur, recDur, reps, totalDur } = seg;
      const gw = Math.max(6, totalDur / total * width);
      const sx = cx; cx += gw;
      const cycleTotalDur = workDur + (recDur || 0);
      // How many cycles fit given minimum stripe width of 2px
      const maxCycles = Math.max(1, Math.floor(gw / 2));
      const visCycles = Math.min(reps, maxCycles);
      const cycleW    = gw / visCycles;
      const workFrac  = cycleTotalDur > 0 ? workDur / cycleTotalDur : 1;
      const workW     = cycleW * workFrac;
      const recW      = cycleW * (1 - workFrac);
      const workH     = height; // full height
      const recH      = Math.max(FLOOR * height, 0.32 * height);

      for (let r = 0; r < visCycles; r++) {
        const x0 = sx + r * cycleW;
        // Work stripe
        const ww = Math.max(1, workW - 0.5);
        elems.push(<rect key={`${si}w${r}`} x={x0} y={0} width={ww} height={workH} fill={STEP_COLORS.work} rx={r===0&&visCycles===1?1:0} opacity={0.85}/>);
        // Recovery stripe
        if (recW >= 1 && recDur > 0) {
          const rw = Math.max(1, recW - 0.5);
          elems.push(<rect key={`${si}r${r}`} x={x0 + workW} y={height - recH} width={rw} height={recH} fill={STEP_COLORS.recovery} rx={0} opacity={0.80}/>);
        }
      }
    }
  });

  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={fluid ? `0 0 ${width} ${height}` : undefined}
      preserveAspectRatio={fluid ? 'none' : undefined}
      style={{ display:'block', flexShrink:0 }}
    >
      {elems}
    </svg>
  );
}

/**
 * The shape of a session that was actually done, read off its laps.
 *
 * A planned workout draws its profile from steps; a completed one has no
 * steps, only what the device recorded. Laps are the closest thing to a
 * profile that the calendar already has in memory — the list endpoint sends
 * them, so this costs a pass over an array rather than a request.
 *
 * One metric for the whole activity, not the best available per lap: mixing
 * power into some bars and heart rate into others draws a shape the session
 * never had. Power first, then speed, then heart rate, whichever most laps
 * agree on.
 *
 * @returns {number[]|null} relative heights in 0..1, oldest first
 */
export function activityProfileBars(a, maxBars = 44) {
  // Four vocabularies for the same session, in the order the opened workout
  // reads them.
  //
  // `savedAutoLaps` is the athlete's own Smart-detect split, and it comes
  // first because the Laps tab adopts it over the device's laps — a session
  // whose splits were corrected there was drawing its old device shape on the
  // card and its corrected one when opened. (The activities endpoint already
  // applies this preference when it builds `lapProfile`; FIT uploads and
  // manually logged trainings ship the whole document, so the choice has to
  // be made here too.)
  //
  // Then `lapProfile`, the four-key shape Mongo projects so the calendar list
  // can stay small, then the full laps, then hand-entered results.
  const laps = [a?.savedAutoLaps, a?.lapProfile, a?.laps, a?.results]
    .find(l => Array.isArray(l) && l.length >= 3) || null;
  if (!laps) return null;

  const durOf = (l) => Number(
    l.d ?? l.totalTimerTime ?? l.totalElapsedTime ?? l.moving_time ?? l.elapsed_time
    ?? l.durationSeconds ?? l.duration ?? 0
  ) || 0;

  const distOf = (l) => Number(
    l.m ?? l.totalDistance ?? l.distance ?? l.distanceMeters ?? 0
  ) || 0;

  // `floor` is where the bar's zero sits. Power really can be nothing, so a
  // coast should draw as nothing. Nobody runs at zero and nobody's heart
  // stops between reps: scaled from zero those two channels draw every
  // session as one near-full slab, so they measure from just under the
  // session's own easiest lap and the shape comes back.
  const READERS = [
    {
      floor: 'zero',
      read: (l) => Number(l.w ?? l.avgPower ?? l.average_watts ?? l.averagePower ?? l.power ?? 0) || 0,
    },
    {
      floor: 'min',
      read: (l) => {
        const speed = Number(l.s ?? l.avgSpeed ?? l.average_speed ?? l.averageSpeed ?? 0) || 0;
        if (speed > 0) return speed;
        const dist = Number(l.totalDistance ?? l.distance ?? l.distanceMeters ?? 0) || 0;
        const dur = durOf(l);
        return dist > 0 && dur > 0 ? dist / dur : 0;
      },
    },
    {
      floor: 'min',
      read: (l) => Number(l.h ?? l.avgHeartRate ?? l.average_heartrate ?? l.averageHeartRate ?? l.heartRate ?? 0) || 0,
    },
  ];

  // Whichever channel the device actually recorded for most of the session,
  // measured in seconds rather than in laps. A pool set is half rests, and a
  // rest carries no speed — counting laps, a swim with eight repeats and eight
  // walls failed the threshold and drew nothing at all, even though the rests
  // are thirty seconds each against repeats of eighty.
  const sessionSecs = laps.reduce((sum, l) => sum + durOf(l), 0) || laps.length;
  const covered = (r) => laps.reduce((sum, l) => sum + (r.read(l) > 0 ? (durOf(l) || 1) : 0), 0);
  const channel = READERS.find(r => covered(r) >= sessionSecs * 0.6);
  if (!channel) return null;
  const read = channel.read;

  const values = laps.map(read).filter(v => v > 0);
  if (!values.length) return null;

  // The band the bars are drawn against.
  //
  // Raw min-to-max let a single lap set both ends. On a swim with one sprint
  // and a float, the sprint took the top and the float the bottom, and every
  // real repeat was squashed into a flat strip along the floor — one spike and
  // a hedge, which is not what the session looked like. The opened workout's
  // lap chart never had this problem because it builds its scale from the work
  // laps and clamps whatever falls outside; percentiles are the same idea in
  // one line, and they leave the outliers visible at the ends rather than
  // letting them own the axis.
  const sorted = [...values].sort((x, y) => x - y);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const lo = sorted.length >= 5 ? at(0.1) : sorted[0];
  const hi = sorted.length >= 5 ? at(0.9) : sorted[sorted.length - 1];
  const peak = hi > lo ? hi : sorted[sorted.length - 1];
  const base = channel.floor === 'min' ? Math.min(lo, peak) * 0.95 : 0;
  const span = peak - base;
  if (!(span > 0)) return null;

  // What a lap's width measures — the same rule the opened workout's lap chart
  // uses, or the thumbnail draws a different session from the one it is a
  // thumbnail of. A ride is read in time; a run and a swim are read in
  // distance, because that is how their sets are written and how the chart
  // below them is drawn.
  //
  // On a 4x1km with floats the two disagree sharply: the 189m float that took
  // 2:02 is a fiftieth of the session by distance and a twentieth by time, and
  // every recovery swelled the same way — which is what made the card and the
  // chart look like different workouts.
  //
  // A rest lap with no distance is a hairline rather than a disqualification:
  // requiring every lap to carry distance sent a whole swim back to being read
  // in time, because the rests between its repeats measure zero metres. The
  // chart does the same with Math.max(dist, 1).
  const paceSport = isRunLikeSport(a?.sport);
  const distanceLaps = laps.filter(l => distOf(l) > 0).length;
  const useDistance = paceSport && distanceLaps >= Math.max(2, laps.length * 0.5);
  const weightOf = useDistance ? (l => Math.max(distOf(l), 1)) : durOf;

  const total = laps.reduce((s, l) => s + weightOf(l), 0);
  if (!(total > 0)) return null;

  // Sample the session at even points along that axis rather than drawing one
  // bar per lap: a ride with 90 auto-laps would otherwise draw 90 hairlines,
  // and one with 4 would draw four blocks whose widths say nothing. Always
  // sample at full resolution: with one bar per lap a six-by-three session
  // aliased into a single wide hump, because 14 samples cannot resolve
  // 180-second reps.
  const bars = [];
  const n = maxBars;
  let cursor = 0, acc = weightOf(laps[0]);
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * total;
    while (t > acc && cursor < laps.length - 1) acc += weightOf(laps[++cursor]);
    bars.push(Math.max(0.08, Math.min(1, (read(laps[cursor]) - base) / span)));
  }
  return bars;
}

/** The bars from activityProfileBars, drawn to fill whatever box they are given. */
export function ActivityMiniChart({ bars, color, height = 18 }) {
  if (!bars?.length) return null;
  const W = 140;
  const step = W / bars.length;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {bars.map((v, i) => (
        <rect
          key={i}
          x={i * step}
          y={height - v * height}
          width={Math.max(0.8, step - 0.4)}
          height={v * height}
          fill={color}
          // The hard efforts read darker than the rest without a second colour.
          opacity={0.3 + 0.55 * v}
        />
      ))}
    </svg>
  );
}

/**
 * The footer band a card's profile chart sits in.
 *
 * `bleed` is the card's own padding, negated — the band runs to the card's
 * edges so the profile reads as the card's floor rather than another line of
 * content. Cards that pad differently pass their own.
 */
export function CardProfileBand({ children, bleed = '-mx-2 -mb-1.5' }) {
  return (
    <div className={`${bleed} mt-0.5 px-2 pt-1 pb-1 border-t border-black/5 bg-black/[0.015]`}>
      {children}
    </div>
  );
}
