/**
 * Scenario checks for utils/healthGate.js.
 *
 * There is no test runner on the server, and the gate is the one piece of the
 * health module where a silent logic slip has a real cost — it decides whether
 * someone is told to run on a healing bone. So the scenarios live here as a
 * plain script:
 *
 *   node scripts/checkHealthGate.js
 *
 * Exits non-zero on the first mismatch, so it can be dropped into CI as-is.
 */


const { getCatalogEntry } = require('../data/injuryCatalog');
const { evaluateHealthGate } = require('../utils/healthGate');

const DAY = 86400000;
const key = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

let pass = 0; let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`); }
}

const baseline = {
  weeklyDistanceBySport: { run: 42000 },
  weeklyDurationBySport: { run: 3 * 3600 },
  peakSpeedBySport: { run: 5.5 },
};

// ── 1. Bone stress injury, walk-run stage, 2/10 pain during running ─────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const ep = { catalogId: entry.id, currentStageIndex: 1, baseline, speedPctReached: null };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(0), painDuringSession: 2, painNow: 1 },
  ]);
  console.log('\n1) Bone stress, 2/10 during run');
  check('light red', g.light, 'red');
  check('hard stop', g.hardStop, true);
  check('steps back', g.stepBack, true);
  check('reason', g.reasons[0].id, 'pain_over_cap');
  check('no running in walk-run cap?', g.caps.runningAllowed, true);
  check('volume cap 10% of 42 km', g.caps.weeklyDistanceCapM, 4200);
}

// ── 2. Achilles, 4/10 during — under the tendon cap, so NOT a stop ──────────
{
  const entry = getCatalogEntry('achilles_tendinopathy_midportion');
  const ep = { catalogId: entry.id, currentStageIndex: 1, baseline };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(-2), hallmarkValue: 10, painNow: 2 },
    { date: key(-1), hallmarkValue: 8, painNow: 2 },
    { date: key(0), hallmarkValue: 5, painDuringSession: 4, painNow: 2 },
  ]);
  console.log('\n2) Achilles, 4/10 during (cap is 5)');
  check('not a hard stop', g.hardStop, false);
  check('light green', g.light, 'green');
}

// ── 3. Achilles, worse the next morning → stop ──────────────────────────────
{
  const entry = getCatalogEntry('achilles_tendinopathy_midportion');
  const ep = { catalogId: entry.id, currentStageIndex: 1, baseline };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(-1), painNextMorning: 1 },
    { date: key(0), painNextMorning: 4, painDuringSession: 3 },
  ]);
  console.log('\n3) Achilles, morning pain 1 -> 4');
  check('light red', g.light, 'red');
  check('reason', g.reasons.map((r) => r.id).includes('morning_worse'), true);
  check('steps back (not medical)', g.stepBack, true);
}

// ── 4. Achilles settle stage gate: stiffness <= 20 for 5 days → advance ─────
{
  const entry = getCatalogEntry('achilles_tendinopathy_midportion');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline };
  const checkIns = [0, 1, 2, 3, 4].map((i) => ({
    date: key(-i), hallmarkValue: 15, painNow: 1,
  }));
  const g = evaluateHealthGate(ep, entry, checkIns);
  console.log('\n4) Achilles settle, 5 days of stiffness <= 20');
  check('gate met', g.stageGate.met, true);
  check('can advance', g.canAdvance, true);
  check('light green', g.light, 'green');
  check('50% volume cap', g.caps.weeklyDistanceCapM, 21000);
}

// ── 5. Same but only 3 days → gate closed, shows progress ──────────────────
{
  const entry = getCatalogEntry('achilles_tendinopathy_midportion');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline };
  const checkIns = [0, 1, 2].map((i) => ({ date: key(-i), hallmarkValue: 15, painNow: 1 }));
  const g = evaluateHealthGate(ep, entry, checkIns);
  console.log('\n5) Achilles settle, only 3 of 5 days');
  check('gate not met', g.stageGate.met, false);
  check('cannot advance', g.canAdvance, false);
  check('condition detail', g.stageGate.conditions[0].detail, '3 / 5');
}

// ── 6. Fever → hard stop, medical, no plan rewrite ──────────────────────────
{
  const entry = getCatalogEntry('urti_above_neck');
  const ep = { catalogId: entry.id, kind: 'illness', currentStageIndex: 0, baseline };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(0), temperatureC: 38.4, symptoms: ['fever', 'body_aches'], hallmarkValue: 4 },
  ]);
  console.log('\n6) Fever 38.4');
  check('light red', g.light, 'red');
  check('medical', g.requiresMedicalAttention, true);
  check('reason', g.reasons.map((r) => r.id).includes('fever'), true);
}

// ── 7. Limping alone is a stop, even with low pain ──────────────────────────
{
  const entry = getCatalogEntry('calf_strain_soleus');
  const ep = { catalogId: entry.id, currentStageIndex: 2, baseline };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(0), painNow: 1, limping: true },
  ]);
  console.log('\n7) Limping with pain 1/10');
  check('light red', g.light, 'red');
  check('reason', g.reasons[0].id, 'altered_gait');
}

// ── 8. Muscle strain speed cap resolves to m/s from baseline peak speed ─────
{
  const entry = getCatalogEntry('hamstring_strain');
  const ep = { catalogId: entry.id, currentStageIndex: 3, baseline, speedPctReached: 70 };
  const g = evaluateHealthGate(ep, entry, [{ date: key(0), painNow: 0 }]);
  console.log('\n8) Hamstring speed stage, 70% cleared');
  check('speed cap pct', g.caps.speedCapPct, 70);
  check('speed cap m/s (70% of 5.5)', g.caps.speedCapMps, 3.85);
  check('gate needs 95%', g.stageGate.conditions.find((c) => c.id === 'speed_pct').met, false);
}

// ── 9. Functional test symmetry gate ────────────────────────────────────────
{
  const entry = getCatalogEntry('calf_strain_soleus');
  const ep = { catalogId: entry.id, currentStageIndex: 1, baseline };
  const weak = evaluateHealthGate(ep, entry, [
    { date: key(0), painNow: 0, functionalTests: [{ test: 'single_leg_heel_raise_bent', left: 12, right: 24, symmetryPct: 50 }] },
  ]);
  const strong = evaluateHealthGate(ep, entry, [
    { date: key(0), painNow: 0, functionalTests: [{ test: 'single_leg_heel_raise_bent', left: 22, right: 24, symmetryPct: 92 }] },
  ]);
  console.log('\n9) Soleus strength gate (need 90% symmetry, 20 reps)');
  check('12 vs 24 reps blocked', weak.stageGate.met, false);
  check('22 vs 24 reps opens', strong.stageGate.met, true);
}

// ── 10. ITB: bigger time-to-pain is better (inverted hallmark) ──────────────
{
  const entry = getCatalogEntry('itb_syndrome');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline };
  const improving = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: key(-i), hallmarkValue: 60, painNow: 1 }));
  const g = evaluateHealthGate(ep, entry, improving);
  console.log('\n10) ITB, 7 days of pain onset after 60 min (need >= 30)');
  check('gate met', g.stageGate.met, true);
  check('can advance', g.canAdvance, true);

  const worse = [
    { date: key(-2), hallmarkValue: 40, painNow: 1 },
    { date: key(-1), hallmarkValue: 20, painNow: 1 },
    { date: key(0), hallmarkValue: 5, painNow: 1 },
  ];
  const g2 = evaluateHealthGate(ep, entry, worse);
  check('shrinking time-to-pain flagged', g2.reasons.map((r) => r.id).includes('hallmark_worsening'), true);
  check('light amber', g2.light, 'amber');
}

// ── 11. High-risk bone site will not advance without clearance ──────────────
{
  const entry = getCatalogEntry('bone_stress_injury_high_risk');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline, medicalClearanceAt: null };
  const g = evaluateHealthGate(ep, entry, [{ date: key(0), painNow: 0 }]);
  console.log('\n11) High-risk bone site, no clearance');
  check('gate closed', g.stageGate.met, false);
  check('clearance condition unmet', g.stageGate.conditions.find((c) => c.id === 'medical_clearance').met, false);
  check('no running', g.caps.runningAllowed, false);

  const cleared = evaluateHealthGate(
    { ...ep, medicalClearanceAt: new Date() }, entry, [{ date: key(0), painNow: 0 }],
  );
  check('gate opens once cleared', cleared.stageGate.met, true);
}

// ── 12. Over the weekly ceiling → amber ─────────────────────────────────────
{
  const entry = getCatalogEntry('bone_stress_injury_low_risk');
  const ep = { catalogId: entry.id, currentStageIndex: 2, baseline };
  const g = evaluateHealthGate(ep, entry, [{ date: key(0), painNow: 0 }], {
    loadSummary: { overCapPct: 35, capLabel: '16.8 km', actualLabel: '22.7 km' },
  });
  console.log('\n12) 35% over the stage ceiling');
  check('light amber', g.light, 'amber');
  check('reason', g.reasons[0].id, 'over_stage_cap');
}

// ── 13. Final stage never claims "can advance" ──────────────────────────────
{
  const entry = getCatalogEntry('achilles_tendinopathy_midportion');
  const last = entry.stages.length - 1;
  const ep = { catalogId: entry.id, currentStageIndex: last, baseline };
  const g = evaluateHealthGate(ep, entry, [{ date: key(0), hallmarkValue: 0, painNow: 0 }]);
  console.log('\n13) Final stage');
  check('isFinalStage', g.stageGate.isFinalStage, true);
  check('cannot advance', g.canAdvance, false);
  check('100% volume', g.caps.volumePctOfBaseline, 100);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
