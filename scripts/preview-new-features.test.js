/**
 * Renders the new dashboard card and comparison verdict into a standalone HTML
 * file so they can be reviewed without a backend or a login.
 *
 * Not a test of behaviour — it lives as a test only because that is the one
 * place in this project with a working JSX transform. Run it with:
 *
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     --testPathPattern=preview-new-features --rootDir=..
 *
 * Output: preview-new-features.html at the repo root.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Wellness is passed in as a prop here; mocking the fetcher keeps services/api
// (and axios, which ships ESM jest won't transform) out of the render.
jest.mock('../client/src/services/wellnessData', () => ({
  fetchWellness: () => Promise.resolve({ connected: false, days: [] }),
}));
jest.mock('../client/src/services/api', () => ({
  getTimelineZones: () => Promise.resolve({ days: [] }),
  updateFitTraining: () => Promise.resolve({}),
  updateStravaActivity: () => Promise.resolve({}),
  updateTraining: () => Promise.resolve({}),
}));

// eslint-disable-next-line import/first
import DailyCoachCard from '../client/src/components/DashboardPage/DailyCoachCard';
import ComparisonVerdict from '../client/src/components/Training-log/ComparisonVerdict';
import NativeComparisonVerdict from '../client/src/components/native/NativeComparisonVerdict';
import { PACE_NOISE } from '../client/src/utils/comparisonVerdict';
import { COACHING_STYLES } from '../client/src/constants/coachingStyles';
import TrainingTimeline from '../client/src/components/DashboardPage/TrainingTimeline';
import RpeCapture from '../client/src/components/training/RpeCapture';
import { MoveCostPanel } from '../client/src/components/Calendar/MoveCostDialog';
import { assessMoveCost } from '../client/src/utils/moveCost';
import PlanBlockPreview from '../client/src/components/WorkoutPlanner/PlanBlockPreview';
import { buildBlockDraft } from '../client/src/utils/planDraft';
import InteractiveChart from '../client/src/components/charts/InteractiveChart';
import ChartMention from '../client/src/components/charts/ChartMention';

const NOW = new Date();
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const offset = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
};

const USER = { _id: 'demo', name: 'Jakub', notifications: {} };
const PROFILE = { ftp: 280, maxHr: 190, powerZones: { cycling: { ftp: 280, lt2: 270 } } };

const ACTIVITIES = [
  { id: 'a1', date: offset(-1), sport: 'run', title: 'Easy run', totalTime: 2700, distance: 8200, tss: 38 },
  { id: 'a2', date: offset(-2), sport: 'bike', title: 'Z2 endurance', totalTime: 7200, distance: 62000, tss: 95 },
  { id: 'a3', date: offset(-4), sport: 'swim', title: 'Technique', totalTime: 2400, distance: 2000, tss: 30 },
  { id: 'a4', date: offset(-6), sport: 'bike', title: 'Long ride', totalTime: 12600, distance: 110000, tss: 180 },
];

const PLANNED = [
  { _id: 'p1', date: dayKey(NOW), sport: 'bike', title: '4x8min VO2max', status: 'planned', targetTss: 95, plannedDuration: 5400 },
  { _id: 'p2', date: dayKey(offset(1)), sport: 'run', title: 'Recovery jog', status: 'planned', plannedDuration: 1800 },
];

const wellnessDays = (today) => {
  const days = [];
  for (let i = 6; i >= 1; i -= 1) {
    days.push({ date: dayKey(offset(-i)), restingHeartRate: 48, hrvMs: 90, sleepMinutes: 460 });
  }
  days.push({ date: dayKey(NOW), ...today });
  return days;
};

const SCENARIOS = [
  { label: 'Productive fatigue · hard session planned', metrics: { fitness: 62, fatigue: 78, form: -16 }, planned: PLANNED },
  { label: 'Strained · the card pushes back', metrics: { fitness: 62, fatigue: 108, form: -46 }, planned: PLANNED },
  { label: 'Fresh · green light', metrics: { fitness: 62, fatigue: 50, form: 12 }, planned: PLANNED },
  { label: 'Rest day after a big ride', metrics: { fitness: 62, fatigue: 80, form: -18 }, planned: [] },
  { label: 'Lactate test day', metrics: { fitness: 62, fatigue: 66, form: -4 }, planned: [{ ...PLANNED[0], title: 'Step test', isLactateTest: true }] },
  {
    label: 'Body overrules the load model — RHR up, HRV down',
    metrics: { fitness: 62, fatigue: 50, form: 12 },
    planned: PLANNED,
    wellness: wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 }),
  },
  {
    label: 'Short sleep with a hard session planned',
    metrics: { fitness: 62, fatigue: 50, form: 12 },
    planned: PLANNED,
    wellness: wellnessDays({ restingHeartRate: 48, hrvMs: 90, sleepMinutes: 300 }),
  },
];

const timelineActivities = [];
const timelinePlanned = [];
for (let d = 41; d >= 0; d -= 1) {
  const day = offset(-d);
  const dow = day.getDay();
  const weekIdx = Math.floor((41 - d) / 7);
  const recovery = weekIdx === 3;
  if (dow === 1) continue; // Monday off
  const hard = dow === 2 || dow === 5;
  const base = hard ? 95 : dow === 0 ? 170 : 55;
  const tss = Math.round(base * (recovery ? 0.5 : 1) * (0.9 + ((d * 7) % 5) / 20));
  timelineActivities.push({
    id: `tl-${d}`, date: day, sport: dow === 4 ? 'run' : 'bike',
    title: hard ? '4x8min VO2max' : dow === 0 ? 'Long ride' : 'Endurance',
    totalTime: tss * 40, tss,
  });
  timelinePlanned.push({
    _id: `tp-${d}`, date: dayKey(day), sport: dow === 4 ? 'run' : 'bike',
    title: 'Planned', status: 'planned', targetTss: Math.round(base * (recovery ? 0.5 : 1)),
  });
}

const card = (props) =>
  renderToStaticMarkup(
    <DailyCoachCard
      athleteId="demo"
      user={USER}
      userProfile={PROFILE}
      activities={ACTIVITIES}
      {...props}
    />,
  );

const session = (date, values, hr = null) => ({
  _id: `t-${date}`,
  title: '5x5min threshold',
  date,
  results: values.map((v) => ({ type: 'work', power: v, ...(hr ? { heartRate: hr } : {}) })),
});

const lactateSession = (date, values) => ({
  _id: `l-${date}`,
  title: 'Threshold set',
  date,
  results: values.map((v) => ({ type: 'work', lactate: v })),
});

const VERDICTS = [
  {
    label: 'Real improvement — clears the noise',
    node: (
      <ComparisonVerdict
        metric="power"
        trainings={[
          session('2026-06-24', [270, 271, 269, 270, 270], 158),
          session('2026-07-01', [280, 281, 279, 280, 280], 156),
          session('2026-07-08', [290, 291, 289, 290, 290], 154),
          session('2026-07-15', [300, 301, 299, 300, 300], 152),
        ]}
      />
    ),
  },
  {
    label: 'Lactate down 0.2 mmol — inside analyser error',
    node: (
      <ComparisonVerdict
        metric="lactate"
        trainings={[lactateSession('2026-07-01', [3.0, 3.1, 3.0, 3.1]), lactateSession('2026-07-08', [2.8, 2.9, 2.8, 2.9])]}
      />
    ),
  },
  {
    label: 'Lactate down 1.1 mmol — a real change',
    node: (
      <ComparisonVerdict
        metric="lactate"
        trainings={[lactateSession('2026-07-01', [4.0, 4.1, 4.0, 4.1]), lactateSession('2026-07-08', [2.9, 3.0, 2.9, 3.0])]}
      />
    ),
  },
  {
    label: 'Intervals all over the place — not distinguishable',
    node: (
      <ComparisonVerdict
        metric="power"
        trainings={[session('2026-07-01', [200, 320, 240, 300, 260]), session('2026-07-08', [220, 330, 250, 310, 270])]}
      />
    ),
  },
];

function panel(title, html) {
  return `<section class="mb-6">
    <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">${title}</h3>
    ${html}
  </section>`;
}

it('writes the preview page', () => {
  const voices = COACHING_STYLES.map((s) =>
    panel(
      `${s.label} — ${s.blurb}`,
      card({ todayMetrics: SCENARIOS[0].metrics, plannedWorkouts: SCENARIOS[0].planned, user: { ...USER, notifications: { dailyCardStyle: s.id } } }),
    ),
  ).join('\n');

  const states = SCENARIOS.map((s) =>
    panel(s.label, card({ todayMetrics: s.metrics, plannedWorkouts: s.planned, wellnessDays: s.wellness || [] })),
  ).join('\n');

  const verdicts = VERDICTS.map((v) => panel(v.label, renderToStaticMarkup(v.node))).join('\n');

  const paceSession = (date, secs) => ({
    _id: `p-${date}`, title: '6x1km', date,
    results: secs.map((x) => ({ type: 'work', power: x })),
  });

  const native = [
    {
      label: 'Phone · power, real improvement',
      node: (
        <NativeComparisonVerdict
          metric="power"
          sport="bike"
          trainings={[session('2026-07-01', [280, 281, 279], 156), session('2026-07-08', [300, 301, 299], 152)]}
        />
      ),
    },
    {
      label: 'Phone · running pace — faster is better',
      node: (
        <NativeComparisonVerdict
          metric="power"
          sport="run"
          trainings={[paceSession('2026-07-01', [255, 256, 254]), paceSession('2026-07-08', [240, 241, 239])]}
        />
      ),
    },
    {
      label: 'Phone · lactate inside analyser error',
      node: (
        <NativeComparisonVerdict
          metric="lactate"
          sport="bike"
          trainings={[lactateSession('2026-07-01', [3.0, 3.1]), lactateSession('2026-07-08', [2.8, 2.9])]}
        />
      ),
    },
  ].map((v) => panel(v.label, renderToStaticMarkup(v.node))).join('\n');

  const timeline = panel('Flow — daily load with the rolling 7-day total', renderToStaticMarkup(
    <TrainingTimeline
      athleteId="demo"
      activities={timelineActivities}
      plannedWorkouts={timelinePlanned}
      userProfile={PROFILE}
      user={USER}
    />,
  ));

  const RPE_PROFILE = {
    ftp: 280,
    powerZones: { cycling: { ftp: 280, lt2: 280 } },
    heartRateZones: { cycling: { lt2: 165, zone4: { min: 165 } } },
  };
  const rpeCases = [
    { label: 'Unrated — the prompt', activity: { id: 'u1', avgPower: 200, totalTime: 3600 } },
    { label: 'Easy ride rated 8 — felt harder than it was', activity: { id: 'u2', avgPower: 150, totalTime: 3600, rpe: 8 } },
    { label: 'Threshold rated 5 — felt easier than it was', activity: { id: 'u3', avgPower: 280, totalTime: 3600, rpe: 5 } },
    { label: 'Perception matches the data', activity: { id: 'u4', avgPower: 250, totalTime: 3600, rpe: 7 } },
  ].map((c) => panel(c.label, renderToStaticMarkup(
    <div class="bg-white rounded-2xl p-4 shadow">
      <RpeCapture activity={c.activity} userProfile={RPE_PROFILE} />
    </div>,
  ))).join('\n');

  const MOVE_NOW = new Date(2026, 7, 10);
  const mpw = (id, date, over) => ({ _id: id, date, title: 'Endurance', sport: 'bike', status: 'planned', targetTss: 55, ...over });
  const mhard = (id, date, over) => mpw(id, date, { title: '4x8min VO2max', targetTss: 95, ...over });

  const moveCases = [
    {
      label: 'Three hard days in a row',
      a: assessMoveCost({
        workout: mhard('m', '2026-08-17'), toDate: '2026-08-12', now: MOVE_NOW,
        plannedWorkouts: [mhard('m', '2026-08-17'), mhard('x', '2026-08-11'), mhard('y', '2026-08-13')],
      }),
    },
    {
      label: 'Hard session two days before a race',
      a: assessMoveCost({
        workout: mhard('m', '2026-08-10'), toDate: '2026-08-14', now: MOVE_NOW,
        plannedWorkouts: [mhard('m', '2026-08-10')],
        races: [{ date: '2026-08-16', name: 'Regional TT' }],
      }),
    },
    {
      label: 'Lands on a day that already has a session',
      a: assessMoveCost({
        workout: mhard('m', '2026-08-14'), toDate: '2026-08-12', now: MOVE_NOW,
        plannedWorkouts: [mhard('m', '2026-08-14'), mpw('x', '2026-08-12', { title: 'Swim technique', targetTss: 40 })],
      }),
    },
  ].map((c) => panel(c.label, renderToStaticMarkup(
    <div class="max-w-md">
      <MoveCostPanel assessment={c.a} onConfirm={() => {}} onCancel={() => {}} />
    </div>,
  ))).join('\n');

  const blockDraft = buildBlockDraft({
    startDate: new Date(2026, 7, 12),
    weeks: 8, weeklyHours: 9, sessionsPerWeek: 5, recoveryEvery: 4,
    name: '8-week build block',
  });
  const blockPreview = panel('Shape — volume with the hard share darker, recovery week marked', renderToStaticMarkup(
    <PlanBlockPreview
      draft={blockDraft}
      existingPlanned={[{ date: '2026-08-15', title: 'Club ride', status: 'planned' }]}
      onChange={() => {}}
      onCommit={() => {}}
      onDiscard={() => {}}
    />,
  ));

  // A 4x8min VO2max session: warm-up, four efforts, cool-down.
  const chartSeries = (() => {
    const power = [];
    const hr = [];
    for (let t = 0; t <= 5400; t += 5) {
      const inWork = [[900, 1380], [1680, 2160], [2460, 2940], [3240, 3720]]
        .some(([a, b]) => t >= a && t < b);
      const base = t < 900 ? 150 : t > 3720 ? 130 : 165;
      const p = inWork ? 330 + Math.sin(t / 40) * 12 : base + Math.sin(t / 90) * 10;
      power.push({ x: t, y: Math.round(p) });
      hr.push({ x: t, y: Math.round((inWork ? 172 : 132) + Math.sin(t / 200) * 6 + (t / 5400) * 6) });
    }
    return [
      { key: 'power', label: 'Power', unit: 'W', points: power, decimals: 0 },
      { key: 'heartRate', label: 'HR', unit: 'bpm', points: hr, decimals: 0 },
    ];
  })();

  const chartLaps = [
    { start: 0, end: 900, label: 'Warm-up' },
    { start: 900, end: 1380, hard: true },
    { start: 1380, end: 1680 },
    { start: 1680, end: 2160, hard: true },
    { start: 2160, end: 2460 },
    { start: 2460, end: 2940, hard: true },
    { start: 2940, end: 3240 },
    { start: 3240, end: 3720, hard: true },
    { start: 3720, end: 5400, label: 'Cool-down' },
  ];

  const charts = [
    panel('Session chart — pan, zoom, lap bands numbered from one', renderToStaticMarkup(
      <div class="bg-white rounded-2xl p-4 shadow">
        <InteractiveChart series={chartSeries} laps={chartLaps} title="4x8min VO2max" height={200} />
      </div>,
    )),
    panel('Expandable from the coaching text', renderToStaticMarkup(
      <div class="bg-white rounded-2xl p-4 shadow text-sm text-gray-700 leading-relaxed">
        Your <ChartMention series={[chartSeries[1]]} laps={chartLaps}>heart rate</ChartMention> drifted
        upward across the four efforts while <ChartMention series={[chartSeries[0]]} laps={chartLaps}>power</ChartMention> held,
        which is the normal cost of a session this long rather than a sign anything went wrong.
      </div>,
    )),
  ].join('\n');

  const body = `
<div class="max-w-[1400px] mx-auto p-6">
  <h1 class="text-2xl font-bold text-gray-900">LaChart — new features preview</h1>
  <p class="text-sm text-gray-500 mb-6">Static render with mock data. Buttons are inert here; they work in the app.</p>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div>
      <h2 class="text-lg font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-900">1 · Daily card — states</h2>
      ${states}
    </div>
    <div>
      <h2 class="text-lg font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-900">2 · The six coaching voices</h2>
      <p class="text-xs text-gray-500 mb-4">Same athlete, same numbers, same plan — only the wording changes.</p>
      ${voices}
    </div>
    <div>
      <h2 class="text-lg font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-900">3 · Comparison verdict</h2>
      ${verdicts}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">4 · Training Timeline</h2>
      <p class="text-xs text-gray-500 mb-4">Six-week block with a recovery week in the middle. Rolling 7-day line in orange.</p>
      ${timeline}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">5 · RPE — felt vs data</h2>
      <p class="text-xs text-gray-500 mb-4">One tap, then the comparison against what the numbers predicted.</p>
      ${rpeCases}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">6 · One interactive chart, everywhere</h2>
      <p class="text-xs text-gray-500 mb-4">Static render — drag, scroll and tap are live in the app.</p>
      ${charts}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">7 · Plan a block before committing it</h2>
      <p class="text-xs text-gray-500 mb-4">Nothing reaches the calendar until the commit bar is pressed.</p>
      ${blockPreview}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">8 · Cost before you move a session</h2>
      <p class="text-xs text-gray-500 mb-4">Only opens when the move actually costs something — a free move stays instant.</p>
      ${moveCases}
      <h2 class="text-lg font-bold text-gray-900 mb-3 mt-8 pb-2 border-b-2 border-gray-900">9 · Verdict on the phone</h2>
      <p class="text-xs text-gray-500 mb-4">Same logic, native styling, and pace handled the right way round.</p>
      ${native}
    </div>
  </div>
</div>`;

  const out = path.resolve(__dirname, '..', 'preview-new-features.html');
  fs.writeFileSync(out, body);
  expect(fs.existsSync(out)).toBe(true);
});
