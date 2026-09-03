/**
 * The lactate test, said out loud.
 *
 * Everything under this file already exists as numbers: hrPowerProfile reads
 * every session since the test against that test's own HR–demand curve, and
 * the drift endpoint returns where LT1 and LT2 have moved to, on what
 * evidence, with what confidence. What has never existed is a sentence.
 *
 * That gap matters more than it sounds. Most people who reach LaChart come
 * from a lactate test somebody else ran on them: they have a curve, two
 * thresholds and no idea what to do next. A chart of estimated LT2 against
 * date does not answer "is my training working?" — it asks the athlete to
 * answer it themselves from a line. This module answers it.
 *
 * Three rules the sentences are held to:
 *
 *   · **Nothing is said that is not measured.** Every insight carries the
 *     sessions and minutes behind it, and a low-confidence read says so in the
 *     sentence rather than in a chip nobody reads.
 *   · **A missing answer is an answer.** "No heart rate on any session since
 *     your test" is more useful than a blank panel, and it tells the athlete
 *     what to fix.
 *   · **It never claims to have replaced a test.** The strongest thing it
 *     says is "go and test again".
 *
 * Deterministic on purpose. These sentences are generated on every page load,
 * offline, for free, and an athlete can trace each one back to the sessions
 * that produced it — none of which is true of a model writing prose about
 * numbers it cannot verify.
 */

import { sportKind, thresholdToDemand } from './hrPowerProfile';
import {
  fmtAge, fmtDemand, fmtDemandDelta, fmtDemandMagnitude, fmtHours, fmtShortDate,
} from './thresholdFormat';

/** Below this a threshold has not moved; it has wobbled. */
const MEANINGFUL_PCT = 1.5;
/** Above this, in either direction, a training block has visibly done something. */
const STRONG_PCT = 4;
/** A test older than this is describing an athlete who has since changed. */
const STALE_TEST_DAYS = 120;
/** Time near threshold below which "what drove it" has no honest answer. */
const MIN_THRESHOLD_MINUTES = 45;

const SPORT_NOUN = { bike: 'cycling', run: 'running', swim: 'swimming' };
const THRESHOLD_NAME = { lt1: 'LT1', lt2: 'LT2' };
const THRESHOLD_GLOSS = {
  lt1: 'the top of your easy pace — where lactate first starts to rise',
  lt2: 'the hardest effort you can hold steady',
};

function daysBetween(a, b) {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (y - x) / 86400000;
}

function pct(n, digits = 1) {
  const v = Math.abs(Number(n) || 0);
  return `${v.toFixed(digits)}%`;
}

/**
 * One insight.
 *
 * `tone` drives colour and nothing else — a falling threshold in a deliberate
 * base block is not a failure, so 'warn' is reserved for things the athlete
 * should act on, not for every negative number.
 *
 * @typedef {{
 *   id: string,
 *   tone: 'good'|'warn'|'neutral'|'info',
 *   title: string,
 *   body: string,
 *   evidence?: string,
 *   confidence?: 'low'|'medium'|'high'|null,
 * }} Insight
 */

// ── The individual reads ───────────────────────────────────────────────────

/**
 * Where the thresholds sit now.
 *
 * The headline, and the only insight that gets to state a number as the
 * answer. LT2 leads when both are available: it is the one every zone is hung
 * off and the one athletes recognise.
 */
function whereYouAreNow({ projection, kind, storageMode, testAgeDays }) {
  if (!projection) return null;
  const est = projection.lt2 || projection.lt1;
  if (!est) return null;
  const which = projection.lt2 ? 'lt2' : 'lt1';

  const moved = Math.abs(est.shiftPct) >= MEANINGFUL_PCT;
  const up = est.shift > 0;
  const delta = fmtDemandMagnitude(est.shift, est.toDemand, kind, storageMode);
  const to = fmtDemand(est.toDemand, kind, storageMode);
  const from = fmtDemand(est.fromDemand, kind, storageMode);
  const age = testAgeDays != null ? ` in the ${fmtAge(testAgeDays)} since` : ' since';

  if (!moved) {
    return {
      id: 'now',
      tone: 'neutral',
      title: `${THRESHOLD_NAME[which]} is holding at ${from}`,
      body: `Your training reads within ${pct(est.shiftPct)} of the ${from} your test measured${age} — `
        + 'no real movement either way. That is what maintenance looks like, and it is the right '
        + 'answer for a race taper or a recovery block. In a build block it means the stimulus '
        + 'has not been enough yet.',
      evidence: `${est.blocks} readings across ${est.minutes} min near ${THRESHOLD_NAME[which]}`,
      confidence: est.confidence,
    };
  }

  return {
    id: 'now',
    tone: up ? 'good' : 'warn',
    title: `${THRESHOLD_NAME[which]} reads ${to} — ${delta} ${up ? 'above' : 'below'} your test`,
    body: up
      ? `At the intensities your test covered, your heart rate is now lower than the curve it drew. `
        + `Read back onto that curve, ${THRESHOLD_NAME[which]} — ${THRESHOLD_GLOSS[which]} — has moved from `
        + `${from} to about ${to}${age}. ${Math.abs(est.shiftPct) >= STRONG_PCT
          ? 'That is a big move for one block; a retest would confirm it and reset your zones properly.'
          : 'Small, but it is going the right way.'}`
      : `Your heart rate is running higher than your test curve at the same intensities, which puts `
        + `${THRESHOLD_NAME[which]} nearer ${to} than the ${from} on file. Heat, fatigue, illness and a hard `
        + `block all read this way — it is not automatically lost fitness. `
        + `${Math.abs(est.shiftPct) >= STRONG_PCT
          ? 'A drop this size is worth checking against how you actually feel before you change anything.'
          : 'Keep an eye on it rather than acting on it.'}`,
    evidence: `${est.blocks} readings across ${est.minutes} min near ${THRESHOLD_NAME[which]}`,
    confidence: est.confidence,
  };
}

/**
 * Which way it has been going, from the weekly re-estimates.
 *
 * A single number says where the athlete is; the timeline says whether they
 * are going anywhere. The difference matters because the two can contradict:
 * a threshold that reads below the test but has climbed for six straight weeks
 * is a block that is working from a low start.
 */
function directionOfTravel({ timeline, kind, storageMode }) {
  const pts = (timeline || []).filter((p) => Number.isFinite(p.lt2) || Number.isFinite(p.lt1));
  if (pts.length < 3) return null;
  const key = pts.some((p) => Number.isFinite(p.lt2)) ? 'lt2' : 'lt1';
  const usable = pts.filter((p) => Number.isFinite(p[key]));
  if (usable.length < 3) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  const weeks = Math.max(1, Math.round((daysBetween(first.date, last.date) || 0) / 7));
  const change = last[key] - first[key];
  const changePct = (change / first[key]) * 100;

  if (Math.abs(changePct) < MEANINGFUL_PCT) {
    return {
      id: 'direction',
      tone: 'neutral',
      title: `Flat across the last ${weeks} weeks`,
      body: `Week to week the estimate has ${Math.abs(changePct) < 0.1 ? 'not moved at all'
        : `stayed inside ${pct(changePct)}`} — the line is level rather than `
        + 'noisy, which means the training has been consistent and the response to it has plateaued. '
        + 'A plateau is the usual signal to change something: more volume, or harder days, but not both.',
      evidence: `${usable.length} weekly estimates`,
    };
  }

  const up = change > 0;
  return {
    id: 'direction',
    tone: up ? 'good' : 'info',
    title: `${up ? 'Climbing' : 'Drifting down'} over the last ${weeks} weeks`,
    body: `Re-estimated every week from the training that had happened by then, ${THRESHOLD_NAME[key]} has gone `
      + `from ${fmtDemand(first[key], kind, storageMode)} to ${fmtDemand(last[key], kind, storageMode)} `
      + `— ${fmtDemandDelta(change, last[key], kind, storageMode)}, ${pct(changePct)}. `
      + (up
        ? 'A trend that holds across several weeks is worth more than any single session in it.'
        : 'Before reading that as lost fitness, check whether the block was deliberately heavy, or the '
          + 'weather turned — both push heart rate up at the same intensity.'),
    evidence: `${usable.length} weekly estimates`,
  };
}

/**
 * LT1 and LT2 moving by different amounts.
 *
 * The single most coachable thing in the whole panel, and the reason the two
 * thresholds are estimated separately rather than one being scaled off the
 * other. Base work slides the bottom of the curve right while the top stays
 * put; threshold work does the reverse. Which one moved tells the athlete what
 * their last block actually trained — which is usually not what they thought.
 */
function whatMoved({ projection, kind, storageMode }) {
  const lt1 = projection?.lt1;
  const lt2 = projection?.lt2;
  if (!lt1 || !lt2) return null;
  if (lt1.confidence === 'low' && lt2.confidence === 'low') return null;

  const gap = lt1.shiftPct - lt2.shiftPct;
  const evidence = `LT1 ${fmtDemandDelta(lt1.shift, lt1.toDemand, kind, storageMode)} · `
    + `LT2 ${fmtDemandDelta(lt2.shift, lt2.toDemand, kind, storageMode)}`;

  if (Math.abs(gap) < MEANINGFUL_PCT) {
    if (Math.abs(lt2.shiftPct) < MEANINGFUL_PCT) return null;
    // Both thresholds moved the same distance — but which way decides whether
    // this is the cleanest thing a training block can do or the clearest sign
    // something is wrong. The shape of the finding is the same; the reading of
    // it is not.
    const forward = lt2.shift > 0;
    return {
      id: 'split',
      tone: forward ? 'good' : 'info',
      title: `The whole curve has moved ${forward ? 'together' : 'back together'}`,
      body: `LT1 and LT2 have shifted by almost the same amount (${pct(lt1.shiftPct)} and ${pct(lt2.shiftPct)}), `
        + `both ${forward ? 'forward' : 'backward'}. The curve has translated rather than changed shape.`
        + (forward
          ? ' Aerobic base and threshold moving in step is the cleanest kind of progress, and it usually '
            + 'comes from consistent volume with the hard days kept genuinely hard.'
          : ' A uniform shift down is rarely one threshold failing — it is the whole system running at a '
            + 'higher heart rate, which is what accumulated fatigue, a hot month, illness or a heavy block '
            + 'looks like. Check the easy days actually felt easy before reading it as lost fitness.'),
      evidence,
    };
  }

  const aerobicLed = gap > 0;
  return {
    id: 'split',
    tone: 'info',
    title: aerobicLed
      ? 'Your aerobic threshold has moved more than your LT2'
      : 'Your LT2 has moved more than your aerobic threshold',
    body: aerobicLed
      ? `LT1 is ${fmtDemandDelta(lt1.shift, lt1.toDemand, kind, storageMode)} against `
        + `LT2's ${fmtDemandDelta(lt2.shift, lt2.toDemand, kind, storageMode)}. The bottom of the curve has slid `
        + 'right while the top has barely moved — the signature of a base block. You can hold more '
        + 'intensity aerobically than you could on test day, but your ceiling is where it was. If you '
        + 'have a race coming, this is the point at which threshold work starts paying.'
      : `LT2 is ${fmtDemandDelta(lt2.shift, lt2.toDemand, kind, storageMode)} against `
        + `LT1's ${fmtDemandDelta(lt1.shift, lt1.toDemand, kind, storageMode)}. The top of the curve has moved and `
        + 'the bottom has not — sharpening, not building. It works, and it runs out: without the aerobic '
        + 'base underneath, a raised LT2 is harder to hold and quicker to lose. Worth protecting the '
        + 'easy volume through the next block.',
    evidence: `${evidence}   ·   LT1 ${lt1.confidence} confidence, LT2 ${lt2.confidence} confidence`,
  };
}

/**
 * What the estimate is actually made of.
 *
 * An estimate nobody can trace back to the training behind it is a number to
 * be taken on faith, and this one asks the athlete to change how they train.
 */
function whatDroveIt({ contributors, projection }) {
  const rows = (contributors || []).filter((c) => c.minutes > 0);
  if (!rows.length) return null;
  const minutes = rows.reduce((s, c) => s + c.minutes, 0);
  if (minutes < MIN_THRESHOLD_MINUTES) return null;

  const biggest = rows.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const recent = rows.slice(0, 4);
  const span = daysBetween(rows[rows.length - 1].date, rows[0].date);
  const perWeek = span > 6 ? (rows.length / (span / 7)) : null;

  return {
    id: 'evidence',
    tone: 'neutral',
    title: `Built from ${rows.length} sessions and ${Math.round(minutes)} minutes near your thresholds`,
    body: `Every session with a heart rate is a partial re-test: known intensity, known heart rate, hours of it. `
      + `${perWeek ? `You have averaged ${perWeek.toFixed(1)} readable sessions a week. ` : ''}`
      + `The longest single contribution was ${biggest.title || 'a session'} on ${fmtShortDate(biggest.date)} `
      + `(${biggest.minutes} min). `
      + (projection?.confidence === 'low'
        ? 'That is thin enough that the estimate is a hint rather than a number — a few more steady '
          + 'sessions will firm it up.'
        : 'No single session decides the answer; the estimate is a weighted median, so one bad day '
          + 'moves it rather than setting it.'),
    evidence: recent.map((c) => `${fmtShortDate(c.date)} · ${c.minutes} min`).join('   '),
  };
}

/**
 * How the training since the test compares with the training that produced it.
 *
 * The comparison an athlete cannot make for themselves, and the one that
 * explains a threshold that has not moved: a block with half the volume and
 * none of the intensity of the one before the test was never going to move it.
 */
function trainingMix({ zoneSplit }) {
  const after = zoneSplit?.after;
  if (!after || !(after.totalZoneSecs > 0)) return null;
  const before = zoneSplit?.before;

  const easy = after.aerobicPct;
  const hard = after.highIntensityPct;
  const tempo = Math.max(0, 100 - easy - hard);

  let title = `${easy}% easy, ${tempo}% tempo, ${hard}% hard since the test`;
  let tone = 'neutral';
  let body = '';

  if (hard < 5 && after.totalTime > 3600 * 5) {
    tone = 'info';
    body = 'Almost none of your time has been at threshold or above. That builds the aerobic base and '
      + 'will move LT1, but LT2 responds to work done near LT2 — if the ceiling is the goal, this block '
      + 'has not been asking for it.';
  } else if (easy < 60 && after.totalTime > 3600 * 5) {
    tone = 'warn';
    title = `Only ${easy}% of your training has been genuinely easy`;
    body = 'The middle of the range is the expensive place to spend time: hard enough to cost recovery, '
      + 'not hard enough to drive adaptation. Most of the evidence points at 75–80% easy with the '
      + 'remainder genuinely hard. Pushing the easy days easier is usually what unlocks the hard ones.';
  } else {
    body = 'A distribution close to what most threshold research supports — the bulk aerobic, a real '
      + 'minority hard, little marooned in between.';
  }

  let evidence = `${fmtHours(after.totalTime)} across ${after.totalSessions} sessions`;
  if (before && before.totalTime > 0) {
    const ratio = after.totalTime / before.totalTime;
    const dEasy = easy - before.aerobicPct;
    const dHard = hard - before.highIntensityPct;
    body += ` Against the block that led into the test: ${
      ratio >= 1.15 ? `${Math.round((ratio - 1) * 100)}% more volume`
        : ratio <= 0.85 ? `${Math.round((1 - ratio) * 100)}% less volume`
          : 'about the same volume'
    }, ${
      Math.abs(dHard) < 3 ? 'and a similar amount of hard work'
        : dHard > 0 ? `and ${Math.round(dHard)} points more time at threshold or above`
          : `and ${Math.round(-dHard)} points less time at threshold or above`
    }.`;
    evidence += `   ·   before the test: ${fmtHours(before.totalTime)}, ${before.aerobicPct}% easy`;
    if (Math.abs(dEasy) >= 8) {
      body += ` The easy share has ${dEasy > 0 ? 'risen' : 'fallen'} by ${Math.abs(Math.round(dEasy))} points.`;
    }
  }

  return { id: 'mix', tone, title, body, evidence };
}

/**
 * Where the tests themselves say the athlete is heading.
 *
 * A second opinion that owes nothing to heart rate. When it agrees with the
 * training read the answer is strong; when it does not, the disagreement is
 * itself the finding — and it is stated rather than averaged away.
 */
function testHistoryRead({ history, projection, kind, storageMode }) {
  if (!history) return null;
  const est = history.lt2 || history.lt1;
  if (!est) return null;
  const which = history.lt2 ? 'lt2' : 'lt1';

  const perMonth = est.pctPerWeek * 4.33;
  const rising = est.shift > 0;
  const to = fmtDemand(est.toDemand, kind, storageMode);

  const trainingEst = projection?.[which];
  let agreement = '';
  let contradicted = false;
  if (trainingEst) {
    const sameWay = Math.sign(trainingEst.shift) === Math.sign(est.shift);
    const bothMoved = Math.abs(trainingEst.shiftPct) >= MEANINGFUL_PCT
      && Math.abs(est.shiftPct) >= MEANINGFUL_PCT;
    contradicted = !sameWay && bothMoved;
    agreement = sameWay && bothMoved
      ? ` Your training since the last test points the same way, which is the strongest read this app can give `
        + `you without a needle: two independent estimates, ${
          fmtDemand(trainingEst.toDemand, kind, storageMode)} from heart rate and ${to} from the test line.`
      : !sameWay && bothMoved
        ? ` Your training since the last test points the other way — it reads ${
          fmtDemand(trainingEst.toDemand, kind, storageMode)}. The history describes a season, the heart rate `
          + 'describes the last few weeks, so a recent block heavy enough to suppress heart rate will '
          + 'separate them. When they disagree, test.'
        : '';
  }

  return {
    id: 'history',
    tone: contradicted ? 'info' : rising ? 'good' : 'info',
    title: `Across ${history.tests} tests, ${THRESHOLD_NAME[which]} has been ${rising ? 'rising' : 'falling'} `
      + `${pct(Math.abs(perMonth))} a month`,
    body: `Fitting a straight line through the tests you have on file over ${
      Math.round(history.spanDays / 30)} months and carrying it forward ${fmtAge(history.reachDays)} `
      + `past the last one puts ${THRESHOLD_NAME[which]} at about ${to} today.${agreement}`,
    evidence: `${est.tests} tests · r² ${est.r2.toFixed(2)} · projected ${fmtAge(history.reachDays)} forward`,
    confidence: est.confidence,
  };
}

/** The test is old enough that everything above it is guesswork stacked on guesswork. */
function testAge({ testAgeDays, retest, advice, kind }) {
  if (testAgeDays == null) return null;
  // The zone card makes this same argument off the same evidence, and says
  // what to do about it. Two cards repeating one finding reads as padding.
  if (retest && !advice) {
    return {
      id: 'retest',
      tone: 'warn',
      title: 'Worth retesting',
      body: `Across ${retest.sessions} recent sessions your threshold reads ${pct(retest.trendPct)} `
        + `${retest.direction === 'up' ? 'above' : 'below'} the test on file`
        + `${retest.testAgeDays ? `, and that test is ${fmtAge(retest.testAgeDays)} old` : ''}. `
        + `Your zones are probably ${retest.direction === 'up' ? 'too easy' : 'too hard'} — every session `
        + 'you prescribe off them is aimed at an athlete you no longer are. This is the point where a '
        + 'retest earns its cost.',
      evidence: `${retest.sessions} sessions in the last 3 weeks`,
    };
  }
  if (testAgeDays < STALE_TEST_DAYS) return null;
  return {
    id: 'retest',
    tone: 'info',
    title: `Your ${SPORT_NOUN[kind] || ''} test is ${fmtAge(testAgeDays)} old`.replace('  ', ' '),
    body: 'Nothing in your training says the thresholds have moved, which is genuinely useful to know — '
      + 'but a test this old is being asked to describe a season it did not see. Everything on this page '
      + 'is measured against it, so retesting sharpens all of it at once.',
    evidence: null,
  };
}

/** Why the panel is thinner than it should be, and what would fix it. */
function coverageGaps({ coverage, projection, sessionsSinceTest, zoneSplit }) {
  if (!coverage) return null;
  const considered = coverage.considered || 0;
  const compared = coverage.compared || 0;
  /** Training the app can see at all, even if the drift walk found none of it. */
  const anyTraining = (zoneSplit?.after?.totalTime || 0) > 0;

  if (!considered) {
    return anyTraining ? {
      id: 'coverage',
      tone: 'info',
      title: 'None of your training since the test could be placed against it',
      body: 'The sessions are here, but reading one against your curve needs a second-by-second trace '
        + 'with heart rate alongside power or pace — and none of them carry it. Sessions synced as '
        + 'summaries only, or recorded without a heart-rate strap, cannot be compared with the curve.',
      evidence: null,
    } : {
      id: 'coverage',
      tone: 'info',
      title: 'No training synced since this test',
      body: 'Connect Strava or Garmin and every steady session becomes a partial re-test — known '
        + 'intensity, known heart rate, hours of it. That is what this page reads to tell you where '
        + 'your thresholds have moved to since test day, without you doing another test.',
      evidence: null,
    };
  }

  if (!compared) {
    return {
      id: 'coverage',
      tone: 'info',
      title: `None of your ${considered} sessions since the test could be read`,
      body: 'Placing a session against your test needs heart rate recorded alongside power or pace. '
        + 'Sessions without a heart-rate trace — or without any second-by-second data at all — cannot '
        + 'be compared with the curve. A chest strap on your steady rides is the single change that '
        + 'turns this page on.',
      evidence: Object.entries(coverage.unreadable || {})
        .map(([reason, n]) => `${n} × ${reason.replace(/-/g, ' ')}`).join('   ') || null,
    };
  }

  // Everything worked well enough — only speak up when the shortfall is the
  // reason the estimate above is weak.
  if (projection && projection.confidence !== 'low') return null;
  const readablePct = Math.round((compared / considered) * 100);
  if (readablePct >= 60 && (sessionsSinceTest || 0) >= 6) return null;

  return {
    id: 'coverage',
    tone: 'info',
    title: `${compared} of ${considered} sessions could be placed against your test`,
    body: readablePct < 60
      ? 'The rest had no heart rate, no second-by-second data, or never held an intensity your test '
        + 'covered. Interval days and recovery spins are most of a training week and most of them '
        + 'cannot be read — that is normal, it just means the estimate leans on your steady sessions.'
      : 'That is enough to point a direction but not enough to be firm about a number. A few more '
        + 'steady endurance sessions with heart rate will tighten it.',
    evidence: Object.entries(coverage.unreadable || {})
      .map(([reason, n]) => `${n} × ${reason.replace(/-/g, ' ')}`).join('   ') || null,
  };
}

/** The zones every session is prescribed against no longer match the athlete. */
function zoneDrift({ advice, kind, storageMode }) {
  if (!advice) return null;
  const parts = [];
  if (advice.thresholds.lt1) parts.push(`LT1 to ${fmtDemand(advice.thresholds.lt1, kind, storageMode)}`);
  if (advice.thresholds.lt2) parts.push(`LT2 to ${fmtDemand(advice.thresholds.lt2, kind, storageMode)}`);
  return {
    id: 'zones',
    tone: 'warn',
    title: 'Your zones are out of date',
    body: `${advice.reason} On ${advice.sessions} sessions and ${Math.round(advice.minutes / 60)} hours of `
      + `evidence, moving ${parts.join(' and ')} would put them back where you are actually training. `
      + `${advice.testAgeDays ? `The test they came from is ${fmtAge(advice.testAgeDays)} old. ` : ''}`
      + 'This changes what every future session asks of you, so it is offered rather than applied.',
    evidence: `${pct(advice.biggestPct)} ${advice.direction === 'up' ? 'above' : 'below'} the tested value`,
  };
}

/**
 * The block that produced the test.
 *
 * Not a read on anything current — context for the number at the top of the
 * page. A test is the output of the eight weeks before it, and an athlete
 * looking at a disappointing curve is usually looking at a training answer.
 */
function preTestContext({ zoneSplit, testDate }) {
  const before = zoneSplit?.before;
  if (!before || !(before.totalTime > 3600)) return null;
  // The window the caller actually asked for, not the number of calendar
  // months it happened to straddle — an 84-day block can touch four of them.
  const window = before.windowDays > 0 ? fmtAge(before.windowDays) : 'weeks';
  return {
    id: 'pre-test',
    tone: 'neutral',
    title: `The test came after ${fmtHours(before.totalTime)} in the ${window} before it`,
    body: `${before.totalSessions} sessions, ${before.aerobicPct}% of the time easy and `
      + `${before.highIntensityPct}% at threshold or above. That block is what the curve on `
      + `${fmtShortDate(testDate)} measured — a test does not describe your potential, it describes `
      + 'what the training before it built.',
    evidence: [1, 2, 3, 4, 5]
      .map((z) => `Z${z} ${before.zonePcts?.[`z${z}`] ?? 0}%`).join('   '),
  };
}

// ── Assembly ───────────────────────────────────────────────────────────────

/**
 * Every insight the available data supports, most important first.
 *
 * @param {object} o
 * @param {object} o.anchor        extractLactateThresholds() output for the governing test
 * @param {object} o.test          the governing test document
 * @param {object} [o.drift]       the /api/threshold-drift response
 * @param {object} [o.history]     projectFromTestHistory() output
 * @param {object} [o.advice]      zoneAdviceFor() output
 * @param {object} [o.zoneSplit]   {before, after} zone distributions either side of the test
 * @param {Date}   [o.now]
 * @returns {Insight[]}
 */
export function buildTestInsights({
  anchor, test, drift = null, history = null, advice = null, zoneSplit = null, now = null,
}) {
  if (!anchor || !(anchor.lt2 > 0)) return [];
  const kind = sportKind(anchor.sport);
  const storageMode = anchor.storageMode;
  const testAgeDays = test?.date ? daysBetween(test.date, now || new Date()) : null;

  const ctx = {
    projection: drift?.projection || null,
    timeline: drift?.timeline || [],
    contributors: drift?.contributors || [],
    coverage: drift?.coverage || null,
    retest: drift?.retest || null,
    sessionsSinceTest: drift?.projection?.sessions || 0,
    history,
    advice,
    zoneSplit,
    kind,
    storageMode,
    testAgeDays,
    testDate: test?.date || null,
  };

  const coverage = coverageGaps(ctx);
  // Nothing could be read at all: that is the whole story, and every other
  // card is a footnote to it.
  const blocked = coverage && !ctx.projection;

  return [
    blocked ? coverage : null,
    whereYouAreNow(ctx),
    zoneDrift(ctx),
    testAge(ctx),
    directionOfTravel(ctx),
    whatMoved(ctx),
    testHistoryRead(ctx),
    trainingMix(ctx),
    whatDroveIt(ctx),
    blocked ? null : coverage,
    preTestContext(ctx),
  ].filter(Boolean);
}

/**
 * The one sentence worth putting above the fold.
 *
 * Dashboards and the native testing page have room for a line, not a panel.
 * This is the same read as the headline insight, compressed to something that
 * fits on a card.
 */
export function summariseTestInsight({ anchor, test, drift, now = null }) {
  if (!anchor || !(anchor.lt2 > 0)) return null;
  const kind = sportKind(anchor.sport);
  const storageMode = anchor.storageMode;
  const est = drift?.projection?.lt2 || drift?.projection?.lt1;
  const testAgeDays = test?.date ? daysBetween(test.date, now || new Date()) : null;

  if (!est) {
    if (!drift?.coverage) {
      return {
        tone: 'info',
        headline: 'Could not read your training just now',
        detail: 'The reading against your test failed to load. Nothing is wrong with the test itself.',
      };
    }
    const considered = drift.coverage.considered || 0;
    return {
      tone: 'info',
      headline: considered
        ? 'Not enough readable training yet'
        : 'No training synced since this test',
      detail: considered
        ? `${considered} sessions since your test, none of them steady enough with heart rate to place `
          + 'against the curve.'
        : 'Connect Strava or Garmin to see where your thresholds have moved since test day.',
    };
  }

  const which = drift.projection.lt2 ? 'LT2' : 'LT1';
  const moved = Math.abs(est.shiftPct) >= MEANINGFUL_PCT;
  const to = fmtDemand(est.toDemand, kind, storageMode);
  const from = fmtDemand(est.fromDemand, kind, storageMode);

  return {
    tone: !moved ? 'neutral' : est.shift > 0 ? 'good' : 'warn',
    headline: moved
      ? `${which} reads ${to}, ${fmtDemandMagnitude(est.shift, est.toDemand, kind, storageMode)} `
        + `${est.shift > 0 ? 'above' : 'below'} your test`
      : `${which} holding at ${from}`,
    detail: `From ${est.blocks} readings across ${est.minutes} min of training`
      + `${testAgeDays != null ? ` in the ${fmtAge(testAgeDays)} since the test` : ''}.`,
    confidence: est.confidence,
    thresholdDemand: est.toDemand,
    testDemand: est.fromDemand,
  };
}

/**
 * Thresholds from a test document in engine units, for the history fit.
 *
 * @param {Array} tests      test documents
 * @param {Function} extract extractLactateThresholds — injected so this module
 *                           stays free of the DataTable import chain
 * @param {string} kind
 */
export function testsToDemandRows(tests, extract, kind) {
  return (tests || [])
    .filter((t) => sportKind(t?.sport) === kind)
    .map((t) => {
      const a = extract(t);
      if (!a) return null;
      const toDemand = (v) => (v > 0 ? thresholdToDemand(v, { kind, storageMode: a.storageMode }) : null);
      const lt1 = toDemand(a.lt1);
      const lt2 = toDemand(a.lt2);
      if (!lt1 && !lt2) return null;
      return { id: String(t._id), date: t.date, title: t.title, lt1, lt2 };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}
