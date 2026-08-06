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


// routes/healthRoutes.js pulls in config/jwt.config, which kills the process
// when JWT_SECRET is unset. This script has nothing to do with auth, so it
// supplies a throwaway value rather than forcing every caller to export one.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-script';

const { getCatalogEntry } = require('../data/injuryCatalog');
const { evaluateHealthGate } = require('../utils/healthGate');
const { _internals: h } = require('../routes/healthRoutes');

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

// ── 14. Single-sided minutes test is satisfiable at all ─────────────────────
// The soleus "protect" gate wants a 30 min pain-free walk. There is no left or
// right to compare, so the number lives in `value`; before that field existed
// this gate could never open, whatever the athlete actually walked.
{
  const entry = getCatalogEntry('calf_strain_soleus');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline };
  const days = (walkMinutes) => [0, 1, 2].map((i) => ({
    date: key(-i),
    painNow: 0,
    functionalTests: [{ test: 'pain_free_walk', value: walkMinutes }],
  }));
  const walked = evaluateHealthGate(ep, entry, days(30));
  const short = evaluateHealthGate(ep, entry, days(12));
  const untested = evaluateHealthGate(ep, entry, [0, 1, 2].map((i) => ({ date: key(-i), painNow: 0 })));
  const walkCond = (g) => g.stageGate.conditions.find((c) => c.id === 'test_pain_free_walk');
  console.log('\n14) Soleus protect gate, 30 min pain-free walk');
  check('30 min opens the gate', walked.stageGate.met, true);
  check('30 min condition met', walkCond(walked).met, true);
  check('12 min blocked', short.stageGate.met, false);
  check('12 min condition unmet', walkCond(short).met, false);
  check('never walked stays unmet', walkCond(untested).met, false);
  check('never walked detail', walkCond(untested).detail, 'Not tested yet');
}

// ── 15. The checklist reads as English, not as catalogue keys ───────────────
{
  const entry = getCatalogEntry('calf_strain_soleus');
  const ep = { catalogId: entry.id, currentStageIndex: 0, baseline };
  const g = evaluateHealthGate(ep, entry, [0, 1, 2].map((i) => ({
    date: key(-i),
    painNow: 0,
    functionalTests: [{ test: 'pain_free_walk', value: 30 }],
  })));
  const cond = g.stageGate.conditions.find((c) => c.id === 'test_pain_free_walk');
  console.log('\n15) Walk condition label, unit and detail');
  check('human label', cond.label, 'Pain-free walk');
  check('minutes in the detail', cond.detail, '30 min (need 30)');
  check('unit exposed', cond.unit, 'minutes');
  check('bilateral flag exposed', cond.bilateral, false);
}

// ── 16. A reps test still reads as reps, and symmetry still uses both sides ─
{
  const entry = getCatalogEntry('calf_strain_soleus');
  const ep = { catalogId: entry.id, currentStageIndex: 1, baseline };
  const g = evaluateHealthGate(ep, entry, [
    { date: key(0), painNow: 0, functionalTests: [{ test: 'single_leg_heel_raise_bent', left: 22, right: 24, symmetryPct: 92 }] },
  ]);
  const cond = g.stageGate.conditions.find((c) => c.id === 'test_single_leg_heel_raise_bent');
  console.log('\n16) Soleus strength gate wording');
  check('human label', cond.label, 'Single-leg heel raise, knee bent (soleus)');
  check('reps in the detail', cond.detail, '22 reps (need 20)');
  check('unit exposed', cond.unit, 'reps');
  check('bilateral flag exposed', cond.bilateral, true);

  // Weaker side still decides when no single-sided value was recorded.
  const weak = evaluateHealthGate(ep, entry, [
    { date: key(0), painNow: 0, functionalTests: [{ test: 'single_leg_heel_raise_bent', left: 12, right: 24, symmetryPct: 50 }] },
  ]);
  check('weaker side blocks', weak.stageGate.conditions.find((c) => c.id === 'test_single_leg_heel_raise_bent').met, false);
}

// ── 17. Check-in dates are validated, because the gate walks backwards ──────
// Every streak the gate computes starts at the newest check-in it can see, so a
// row dated next year or in 1970 does not merely look wrong, it changes today's
// verdict. These are the rules that stop that entering the collection.
{
  const bounds = { startDate: '2026-03-02', today: '2026-04-19', maxDay: '2026-04-20' };
  const v = (raw) => h.validateCheckInDate(raw, bounds);
  console.log('\n17) Check-in date validation');
  check('absent means today', v(null), { ok: true, date: '2026-04-19' });
  check('blank means today', v('   '), { ok: true, date: '2026-04-19' });
  check('a real backdated day passes', v('2026-03-15'), { ok: true, date: '2026-03-15' });
  check('the onset day itself passes', v('2026-03-02').ok, true);
  check('one day of timezone slack passes', v('2026-04-20').ok, true);
  check('two days ahead is a typo', v('2026-04-21').ok, false);
  check('1970 rejected', v('1970-01-01').ok, false);
  check('before onset rejected', v('2026-03-01').ok, false);
  check('non-date rejected', v('yesterday').ok, false);
  check('wrong shape rejected', v('15/03/2026').ok, false);
  check('31 February rejected', v('2026-02-31').ok, false);
  check('no startDate, no lower bound', h.validateCheckInDate('1999-01-01', {
    startDate: null, today: '2026-04-19', maxDay: '2026-04-20',
  }).ok, true);
}

// ── 18. Episode start dates take the same rules plus the end of the episode ─
{
  const v = (raw, endDate) => h.validateEpisodeStartDate(raw, { endDate, maxDay: '2026-04-20' });
  console.log('\n18) Episode startDate validation');
  check('a corrected earlier onset passes', v('2026-03-02', null), { ok: true, date: '2026-03-02' });
  check('future rejected', v('2026-04-21', null).ok, false);
  check('after endDate rejected', v('2026-04-02', '2026-04-01').ok, false);
  check('same day as endDate allowed', v('2026-04-01', '2026-04-01').ok, true);
  check('junk endDate ignored', v('2026-04-02', 'soon').ok, true);
  check('empty rejected', v('', null).ok, false);
  check('null rejected', v(null, null).ok, false);
}

// ── 19. Moving onset keeps the stage log contiguous ─────────────────────────
// A gap or an overlap here is not cosmetic: healthProgressService attributes
// each week to the stage covering most of its days, so a hole reads as "no
// stage in force" and the week loses its ceiling entirely.
{
  const history = [
    { stageId: 'offload', stageIndex: 0, from: '2026-03-02', to: '2026-03-30' },
    { stageId: 'walk_run', stageIndex: 1, from: '2026-03-30', to: null },
  ];
  console.log('\n19) Rebasing the stage log onto a corrected onset');

  const earlier = h.rebaseStageHistory(history, '2026-02-23');
  check('first row moves back', earlier[0].from, '2026-02-23');
  check('later boundaries untouched', earlier[0].to, '2026-03-30');
  check('and stay joined', earlier[1].from, '2026-03-30');
  check('open row stays open', earlier[1].to, null);

  // Onset moved past the first transition: rows drag forward rather than invert.
  const later = h.rebaseStageHistory(history, '2026-04-06');
  check('first row moves forward', later[0].from, '2026-04-06');
  check('its end is dragged with it', later[0].to, '2026-04-06');
  check('next row follows', later[1].from, '2026-04-06');
  check('no row ever ends before it starts', later.every((r) => r.to == null || r.to >= r.from), true);

  check('empty log stays empty', h.rebaseStageHistory([], '2026-02-23'), []);
  check('missing log stays empty', h.rebaseStageHistory(undefined, '2026-02-23'), []);
  check('the input is not mutated', history[0].from, '2026-03-02');
}

// ── 20. A legacy episode with no log gets one before it is edited ───────────
{
  console.log('\n20) normalizeStageHistory');
  const legacy = {
    startDate: '2026-03-02', currentStageId: 'walk_run', currentStageIndex: 1, stageHistory: [],
  };
  check('seeded from the episode', h.normalizeStageHistory(legacy), [
    { stageId: 'walk_run', stageIndex: 1, from: '2026-03-02', to: null },
  ]);
  check('no startDate, nothing to seed', h.normalizeStageHistory({ stageHistory: [] }), []);
  check('rows out of order are sorted', h.normalizeStageHistory({
    startDate: '2026-03-02',
    stageHistory: [
      { stageId: 'b', stageIndex: 1, from: '2026-03-30', to: null },
      { stageId: 'a', stageIndex: 0, from: '2026-03-02', to: '2026-03-30' },
    ],
  }).map((r) => r.stageId), ['a', 'b']);
}

// ── 21. A manual stage jump closes the open row instead of overlapping it ───
{
  console.log('\n21) appendStageHistory on a manual jump');
  const episode = {
    startDate: '2026-03-02',
    currentStageId: 'offload',
    currentStageIndex: 0,
    stageHistory: [{ stageId: 'offload', stageIndex: 0, from: '2026-03-02', to: null }],
  };
  const rows = h.appendStageHistory(episode, { id: 'speed' }, 3, '2026-04-19');
  check('previous row closed', rows[0].to, '2026-04-19');
  check('new row starts there', rows[1].from, '2026-04-19');
  check('index recorded', rows[1].stageIndex, 3);
  check('new row is the open one', rows[1].to, null);

  // Backfilled onset can leave the open row starting after "today"; a negative
  // range would make the progress chart attribute days to nothing at all.
  const future = h.appendStageHistory(
    { startDate: '2026-05-01', currentStageIndex: 0, stageHistory: [{ stageId: 'a', stageIndex: 0, from: '2026-05-01', to: null }] },
    { id: 'b' }, 1, '2026-04-19',
  );
  check('never closes before it opened', future[0].to, '2026-05-01');
}

// ── 22. Stage index is clamped to the protocol it belongs to ────────────────
{
  console.log('\n22) clampStageIndex');
  check('inside the range', h.clampStageIndex(2, 5), 2);
  check('over the top clamps to last', h.clampStageIndex(99, 5), 4);
  check('negative clamps to first', h.clampStageIndex(-3, 5), 0);
  check('string digits accepted', h.clampStageIndex('3', 5), 3);
  check('fractions truncate', h.clampStageIndex(2.9, 5), 2);
  check('empty protocol clamps to 0', h.clampStageIndex(4, 0), 0);
  check('not a number at all', h.clampStageIndex('later', 5), null);
  // Number(null) and Number('') are both 0, so an omitted field would otherwise
  // read as a deliberate "put me back on stage one".
  check('null is not stage one', h.clampStageIndex(null, 5), null);
  check('undefined is not stage one', h.clampStageIndex(undefined, 5), null);
  check('empty string is not stage one', h.clampStageIndex('', 5), null);
  check('explicit zero still works', h.clampStageIndex(0, 5), 0);
}

// ── 23. Manual overrides are recorded, and cannot grow without bound ────────
{
  console.log('\n23) appendNote');
  check('first note', h.appendNote('', '[2026-04-19] Stage set manually.'), '[2026-04-19] Stage set manually.');
  check('appends on a new line', h.appendNote('Saw the physio.', 'x'), 'Saw the physio.\nx');
  check('null notes are fine', h.appendNote(null, 'x'), 'x');
  const long = h.appendNote('a'.repeat(2000), '[2026-04-19] Stage set manually.');
  check('capped at the schema limit', long.length, 2000);
  check('the newest line survives', long.endsWith('[2026-04-19] Stage set manually.'), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
