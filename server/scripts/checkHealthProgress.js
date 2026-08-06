/**
 * Scenario checks for services/healthProgressService.js.
 *
 * Same reason as checkHealthGate.js: there is no test runner on the server, and
 * this series is the number an injured athlete will look at to decide whether
 * to add a session. A silent slip in the ceiling lookup would tell someone they
 * were comfortably under a cap they were actually over.
 *
 *   node scripts/checkHealthProgress.js
 *
 * Everything below runs against the pure builder with injected activity rows
 * and check-ins, so no database is involved.
 */

const { getCatalogEntry } = require('../data/injuryCatalog');
const { buildWeeklyProgress, stageTimeline } = require('../services/healthProgressService');

let pass = 0; let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`); }
}

// Fixed calendar so the whole file is deterministic. 2026-03-02 is a Monday.
const START = '2026-03-02';
const TODAY = '2026-04-19'; // Sunday of the week starting 2026-04-13

const baseline = {
  weeklyDistanceBySport: { run: 42000 },
  weeklyDurationBySport: { run: 4 * 3600 },
  weeklyTssBySport: { run: 300 },
  peakSpeedBySport: { run: 5.5 },
};

const run = (date, distance, movingTime, averageSpeed, tss = 0) => ({
  date, sport: 'Run', distance, movingTime, averageSpeed, tss,
});

const weekOf = (series, weekStart) => series.weeks.find((w) => w.weekStart === weekStart);

// ── 1. Bone stress: pre-injury context, the offload ceiling, a volume breach ─
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'walk_run',
    currentStageIndex: 1,
    stageHistory: [
      { stageId: 'offload', stageIndex: 0, from: START, to: '2026-03-30' },
      { stageId: 'walk_run', stageIndex: 1, from: '2026-03-30', to: null },
    ],
  };
  const activities = [
    // Two ordinary pre-injury weeks.
    run('2026-02-16', 21000, 6000, 3.5, 150),
    run('2026-02-19', 21000, 5250, 4.0, 150),
    run('2026-02-23', 21000, 6000, 3.5, 150),
    // First week back, over the 10% walk-run ceiling.
    run('2026-04-01', 5000, 1800, 2.778, 40),
  ];
  const checkIns = [
    { date: '2026-04-01', painNow: 2, painDuringSession: 4, hallmarkValue: 20 },
    { date: '2026-04-03', painNow: 1, hallmarkValue: 45 },
  ];
  const s = buildWeeklyProgress({
    episode, entry, activities, checkIns, today: TODAY, weeks: 2,
  });

  console.log('\n1) Bone stress, 2 weeks of pre-injury context');
  check('sport', s.sport, 'run');
  check('baseline distance', s.baseline.weeklyDistanceM, 42000);
  check('baseline peak speed', s.baseline.peakSpeedMps, 5.5);
  check('9 weeks 2026-02-16 .. 2026-04-13', s.weeks.length, 9);
  check('first week', s.weeks[0].weekStart, '2026-02-16');
  check('last week', s.weeks[8].weekStart, '2026-04-13');

  const pre = weekOf(s, '2026-02-16');
  check('pre-injury flagged', pre.isPreInjury, true);
  check('pre-injury distance', pre.distanceM, 42000);
  check('pre-injury sessions', pre.sessions, 2);
  check('pctOfBaseline 100', pre.pctOfBaseline, 100);
  check('distance-weighted mean speed', pre.avgSpeedMps, 3.75);
  check('fastest session', pre.fastestSpeedMps, 4);
  check('no stage before onset', pre.stageId, null);
  check('no ceiling before onset', pre.ceilingDistanceM, null);
  check('no breach before onset', pre.breachedVolume, false);

  const lastPre = weekOf(s, '2026-02-23');
  check('half a normal week', lastPre.pctOfBaseline, 50);
  check('still pre-injury', lastPre.isPreInjury, true);

  const onset = weekOf(s, START);
  check('onset week not pre-injury', onset.isPreInjury, false);
  check('onset week stage', onset.stageId, 'offload');
  check('offload ceiling is zero', onset.ceilingDistanceM, 0);
  check('offload forbids running', onset.runningAllowed, false);
  check('nothing run, so no breach', onset.breachedVolume, false);

  const back = weekOf(s, '2026-03-30');
  check('walk-run stage in force', back.stageId, 'walk_run');
  check('walk-run ceiling 10% of 42 km', back.ceilingDistanceM, 4200);
  check('ceilingPct', back.ceilingPct, 10);
  check('5 km against a 4.2 km cap', back.breachedVolume, true);
  check('no speed cap on this stage', back.speedCapMps, null);
  check('so no speed breach', back.breachedSpeed, false);
  check('worst pain that week', weekOf(s, '2026-03-30').painMax, 4);

  const symptomWeek = weekOf(s, '2026-03-30');
  check('worst hallmark (lower is better)', symptomWeek.hallmarkValue, 45);
  check('check-ins counted', symptomWeek.checkInCount, 2);
}

// ── 2. Speed ceiling: a closed stage is judged on the rung it started at ────
{
  const entry = getCatalogEntry('hamstring_strain');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'return',
    currentStageIndex: 4,
    speedPctReached: 95,
    stageHistory: [
      { stageId: 'energy_storage', stageIndex: 2, from: START, to: '2026-03-30' },
      { stageId: 'speed', stageIndex: 3, from: '2026-03-30', to: '2026-04-13' },
      { stageId: 'return', stageIndex: 4, from: '2026-04-13', to: null },
    ],
  };
  const activities = [
    run('2026-03-31', 8000, 2000, 4.0, 60),   // 4.0 m/s under a 3.3 m/s cap
    run('2026-04-14', 12000, 3000, 4.0, 90),
  ];
  const s = buildWeeklyProgress({ episode, entry, activities, today: TODAY, weeks: 0 });

  console.log('\n2) Hamstring, speed ceiling by stage');
  check('series starts at onset', s.weeks[0].weekStart, START);
  const speedWeek = weekOf(s, '2026-03-30');
  check('speed stage in force', speedWeek.stageId, 'speed');
  check('closed stage uses the first rung, 60% of 5.5', speedWeek.speedCapMps, 3.3);
  check('4.0 m/s over the cap', speedWeek.breachedSpeed, true);
  check('8 km under the 70% ceiling', speedWeek.breachedVolume, false);

  const finalWeek = weekOf(s, '2026-04-13');
  check('final stage', finalWeek.stageId, 'return');
  check('final stage has no speed cap', finalWeek.speedCapMps, null);
  check('so no speed breach', finalWeek.breachedSpeed, false);
  check('100% ceiling', finalWeek.ceilingDistanceM, 42000);
}

// ── 3. The open stage may use whatever speed the athlete has cleared ────────
{
  const entry = getCatalogEntry('hamstring_strain');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'speed',
    currentStageIndex: 3,
    speedPctReached: 90,
    stageHistory: [
      { stageId: 'energy_storage', stageIndex: 2, from: START, to: '2026-03-30' },
      { stageId: 'speed', stageIndex: 3, from: '2026-03-30', to: null },
    ],
  };
  const activities = [run('2026-03-31', 8000, 2000, 4.0, 60)];
  const s = buildWeeklyProgress({ episode, entry, activities, today: TODAY, weeks: 0 });

  console.log('\n3) Open stage, 90% of peak speed cleared');
  const w = weekOf(s, '2026-03-30');
  check('cap is 90% of 5.5', w.speedCapMps, 4.95);
  check('4.0 m/s is within it', w.breachedSpeed, false);
}

// ── 4. An explicit stage speed cap wins over the ladder ─────────────────────
{
  const entry = getCatalogEntry('hamstring_strain');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'energy_storage',
    currentStageIndex: 2,
    speedPctReached: 95,
    stageHistory: [{ stageId: 'energy_storage', stageIndex: 2, from: START, to: null }],
  };
  const activities = [run('2026-03-03', 6000, 1500, 4.0, 45)];
  const s = buildWeeklyProgress({ episode, entry, activities, today: TODAY, weeks: 0 });

  console.log('\n4) Explicit speedCapPct of 60%');
  const w = weekOf(s, START);
  check('cap is 60% of 5.5', w.speedCapMps, 3.3);
  check('breached', w.breachedSpeed, true);
  check('6 km over the 40% ceiling of 16.8 km', w.breachedVolume, false);
}

// ── 5. Legacy episode with no stageHistory ──────────────────────────────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'walk_run',
    currentStageIndex: 1,
    // No stageHistory at all: created before the field existed.
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    activities: [run('2026-03-03', 5000, 1800, 2.778, 40)],
    today: TODAY,
    weeks: 1,
  });

  console.log('\n5) Legacy episode, no stage history');
  check('timeline synthesised', stageTimeline(episode).length, 1);
  check('synthesised from startDate', stageTimeline(episode)[0].from, START);
  check('marked legacy', stageTimeline(episode)[0].legacy, true);
  const w = weekOf(s, START);
  check('whole episode attributed to the current stage', w.stageId, 'walk_run');
  check('ceiling from that stage', w.ceilingDistanceM, 4200);
  check('breach still detected', w.breachedVolume, true);
  const pre = weekOf(s, '2026-02-23');
  check('pre-injury week still has no stage', pre.stageId, null);
  check('and no ceiling', pre.ceilingPct, null);
}

// ── 6. No baseline: nulls, never NaN ────────────────────────────────────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const episode = {
    startDate: START,
    baseline: {},
    currentStageId: 'walk_run',
    currentStageIndex: 1,
    stageHistory: [{ stageId: 'walk_run', stageIndex: 1, from: START, to: null }],
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    activities: [run('2026-03-03', 5000, 1800, 2.778, 40)],
    today: TODAY,
    weeks: 1,
  });

  console.log('\n6) Episode with no baseline');
  check('baseline distance null', s.baseline.weeklyDistanceM, null);
  check('baseline peak speed null', s.baseline.peakSpeedMps, null);
  const w = weekOf(s, START);
  check('pctOfBaseline null', w.pctOfBaseline, null);
  check('ceiling null', w.ceilingDistanceM, null);
  check('ceilingPct still known', w.ceilingPct, 10);
  check('speed cap null', w.speedCapMps, null);
  check('no volume breach claimed', w.breachedVolume, false);
  check('no speed breach claimed', w.breachedSpeed, false);
  check('distance still real', w.distanceM, 5000);
  check('nothing serialises to null-by-NaN', JSON.stringify(s).includes('NaN'), false);
}

// ── 7. A week straddling a transition takes the stage it spent longest in ───
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'walk_run',
    currentStageIndex: 1,
    // Transition on the Thursday: 3 days offload, 4 days walk-run.
    stageHistory: [
      { stageId: 'offload', stageIndex: 0, from: START, to: '2026-03-05' },
      { stageId: 'walk_run', stageIndex: 1, from: '2026-03-05', to: null },
    ],
  };
  const s = buildWeeklyProgress({ episode, entry, today: TODAY, weeks: 0 });

  console.log('\n7) Mid-week stage change');
  check('the dominant stage wins', weekOf(s, START).stageId, 'walk_run');
  check('and its ceiling applies', weekOf(s, START).ceilingDistanceM, 4200);
}

// ── 8. Short sessions do not set the speed reading ──────────────────────────
{
  const entry = getCatalogEntry('hamstring_strain');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'energy_storage',
    currentStageIndex: 2,
    stageHistory: [{ stageId: 'energy_storage', stageIndex: 2, from: START, to: null }],
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    // 200 s at 6 m/s is a bad upload, not a session over the cap.
    activities: [run('2026-03-03', 1200, 200, 6.0, 5)],
    today: TODAY,
    weeks: 0,
  });

  console.log('\n8) Sub-5-minute upload ignored for speed');
  const w = weekOf(s, START);
  check('no fastest speed', w.fastestSpeedMps, null);
  check('no average speed', w.avgSpeedMps, null);
  check('no speed breach', w.breachedSpeed, false);
  check('but the distance counts', w.distanceM, 1200);
}

// ── 9. Hallmarks where a bigger number is the improvement ───────────────────
{
  const entry = {
    id: 'synthetic',
    sports: ['run'],
    hallmark: { key: 'timeToPainMinutes', betterIsLower: false },
    stages: [{ id: 'only', name: 'Only', volumePctOfBaseline: 50, runningAllowed: true }],
  };
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'only',
    currentStageIndex: 0,
    stageHistory: [{ stageId: 'only', stageIndex: 0, from: START, to: null }],
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    checkIns: [
      { date: '2026-03-03', hallmarkValue: 12 },
      { date: '2026-03-05', hallmarkValue: 30 },
    ],
    today: TODAY,
    weeks: 0,
  });

  console.log('\n9) betterIsLower = false');
  check('worst reading is the smallest', weekOf(s, START).hallmarkValue, 12);
}

// ── 10. Other sports are excluded from a running series ─────────────────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const episode = {
    startDate: START,
    baseline,
    currentStageId: 'offload',
    currentStageIndex: 0,
    stageHistory: [{ stageId: 'offload', stageIndex: 0, from: START, to: null }],
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    activities: [
      { date: '2026-03-03', sport: 'Ride', distance: 60000, movingTime: 7200, averageSpeed: 8.3, tss: 120 },
      { date: '2026-03-04', sport: 'Swim', distance: 2000, movingTime: 2400, averageSpeed: 0.83, tss: 40 },
    ],
    today: TODAY,
    weeks: 0,
  });

  console.log('\n10) Cross-training is not running volume');
  const w = weekOf(s, START);
  check('no running distance', w.distanceM, 0);
  check('no running sessions', w.sessions, 0);
  check('offload ceiling not breached', w.breachedVolume, false);
}

// ── 11. Shoulder episodes are measured in swimming ──────────────────────────
{
  const entry = getCatalogEntry('swimmers_shoulder');
  const episode = {
    startDate: START,
    baseline: { weeklyDistanceBySport: { swim: 12000, run: 42000 } },
    currentStageId: entry.stages[0].id,
    currentStageIndex: 0,
    stageHistory: [{ stageId: entry.stages[0].id, stageIndex: 0, from: START, to: null }],
  };
  const s = buildWeeklyProgress({
    episode,
    entry,
    activities: [
      { date: '2026-03-03', sport: 'Swim', distance: 3000, movingTime: 3600, averageSpeed: 0.83, tss: 50 },
      run('2026-03-04', 10000, 3000, 3.33, 70),
    ],
    today: TODAY,
    weeks: 0,
  });

  console.log('\n11) Swimmer\'s shoulder uses the swim bucket');
  check('sport', s.sport, 'swim');
  check('baseline', s.baseline.weeklyDistanceM, 12000);
  check('swim distance only', weekOf(s, START).distanceM, 3000);
  check('pctOfBaseline 25', weekOf(s, START).pctOfBaseline, 25);
}

// ── 12. A missing startDate returns an empty series, not a crash ────────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const s = buildWeeklyProgress({ episode: { baseline }, entry, today: TODAY });
  console.log('\n12) Episode with no start date');
  check('empty series', s.weeks.length, 0);
  check('sport still reported', s.sport, 'run');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
