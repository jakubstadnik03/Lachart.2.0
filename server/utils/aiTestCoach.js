/**
 * aiTestCoach
 * ───────────
 * Replacement for the over-engineered lactateCurvePredictor: three
 * focused outputs in one server response.
 *
 *   1. **Simple protocol** — start watts/pace, step, stages, duration.
 *      Computed from a single anchor (best 20-min effort in last 30 d,
 *      OR athlete profile FTP, OR previous test LT2) — no ensemble,
 *      no Critical Power, no Z-score outlier rejection. Just one
 *      anchor + a heuristic spread.
 *
 *   2. **Predicted lactate curve** — for each protocol stage, an
 *      expected lactate value drawn from a piecewise model. Same
 *      math as before but returned as plot-ready points the client
 *      can overlay on the measured curve.
 *
 *   3. **AI narrative** — 1-2 paragraphs of plain-language
 *      interpretation from Claude. The server passes the model a
 *      compact summary (key training numbers + test results) and
 *      asks for an actionable read in the athlete's language.
 *
 * The Anthropic call uses direct HTTP fetch — no SDK dependency. If
 * the API key is missing or the call fails, the narrative falls back
 * to a templated string so the rest of the panel still works.
 */

const PROTOCOL_STAGE_COUNT = 8;
const PROTOCOL_STAGE_DURATION_S = 4 * 60;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Cheap + fast — narrative is a few-hundred-token writeup, no need for Opus.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_NARRATIVE_MODEL || 'claude-haiku-4-5';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_VERSION = '2023-06-01';

// ── Tiny helpers ──
const safe = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Pick a single LT2 anchor from whatever data we have, in priority order.
 * Returns { value, source, confidence } where source explains where the
 * number came from.
 *
 * Priority:
 *   1. Measured LT2 from this test (when test already has data) — that's
 *      ground truth; we use it directly for the curve overlay.
 *   2. Prior test LT2 from this athlete.
 *   3. Best 20-min normalised power × 0.95 × 0.93 (Allen-Coggan FTP → LT2)
 *      from cycling activities in the last 30 days.
 *   4. Athlete profile FTP × 0.93.
 *
 * Pace is handled analogously: best 10k pace × 1.06 for runners.
 */
function pickAnchor({ sport, measuredLt2, priorTestLt2, activities, userProfile }) {
  const isPace = sport === 'run' || sport === 'swim';

  if (measuredLt2 && Number.isFinite(measuredLt2) && measuredLt2 > 0) {
    return { value: measuredLt2, source: 'measured', confidence: 'high' };
  }
  if (priorTestLt2 && Number.isFinite(priorTestLt2) && priorTestLt2 > 0) {
    return { value: priorTestLt2, source: 'prior-test', confidence: 'medium' };
  }
  // Filter activities to the right sport AND last 30 days.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = activities.filter((a) => {
    if (!a.date || new Date(a.date).getTime() < cutoff) return false;
    const s = String(a.sport || '').toLowerCase();
    if (isPace) return s.includes('run') || s.includes('swim');
    return s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling';
  });

  if (!isPace) {
    // Cycling: best 20-min NP from activities of 20-50 min duration
    // (so we don't pick a 4-hour ride's NP as "best 20-min").
    let best20 = 0;
    for (const a of recent) {
      const d = Number(a.durationS || 0);
      if (d < 20 * 60 || d > 50 * 60) continue;
      const np = Number(a.normalizedPower || a.avgPower || 0);
      if (np > best20) best20 = np;
    }
    if (best20 > 0) {
      const lt2 = best20 * 0.95 * 0.93;
      return { value: lt2, source: 'best-20min', confidence: 'medium', best20min: Math.round(best20) };
    }
    // Fallback: profile FTP × 0.93
    const ftp = userProfile?.powerZones?.cycling?.lt2 || userProfile?.powerZones?.cycling?.ftp || userProfile?.ftp || 0;
    if (ftp > 0) {
      return { value: ftp * 0.93, source: 'profile-ftp', confidence: 'low', profileFtp: ftp };
    }
  } else {
    // Running/swimming: best 10 km pace × 1.06 ≈ LT2 pace
    let best10kPace = Infinity;
    for (const a of recent) {
      const dist = Number(a.distanceM || 0);
      const dur = Number(a.durationS || 0);
      if (dist < 10000 || dur <= 0) continue;
      const pacePerKm = (dur / dist) * 1000;
      if (pacePerKm < best10kPace) best10kPace = pacePerKm;
    }
    if (Number.isFinite(best10kPace)) {
      return { value: best10kPace * 1.06, source: 'best-10k', confidence: 'medium' };
    }
  }
  return { value: null, source: 'none', confidence: 'none' };
}

/**
 * Build the protocol stage list from a single LT2 anchor.
 * No fancy ensemble — just span around the anchor.
 *
 * For cycling (watts ascending): start = LT2 × 0.55, end = LT2 × 1.12.
 * For pace (seconds descending = harder): start = LT2 × 1.4, end = LT2 × 0.95.
 *
 * Per-stage lactate uses the same piecewise model as before
 * (flat → quadratic LT1→LT2 → exponential), with LT1 fixed at 0.80 × LT2
 * (no polarisation-dependent ratio — that was sensitive to bad zone data).
 */
function buildProtocol({ sport, lt2, baseLactate = 1.0 }) {
  if (!lt2 || !Number.isFinite(lt2)) return null;
  const isPace = sport === 'run' || sport === 'swim';
  const lt1 = lt2 * 0.80;

  const startIntensity = isPace ? lt1 * 1.4 : lt2 * 0.55;
  const endIntensity   = isPace ? lt2 * 0.95 : lt2 * 1.12;
  const step = (endIntensity - startIntensity) / (PROTOCOL_STAGE_COUNT - 1);
  const span = isPace ? (lt1 - lt2) : (lt2 - lt1);

  const stages = [];
  for (let i = 0; i < PROTOCOL_STAGE_COUNT; i++) {
    const intensity = startIntensity + step * i;
    const frac = isPace ? (lt1 - intensity) / span : (intensity - lt1) / span;
    let la;
    if (frac < 0) la = baseLactate + Math.max(0, 0.5 * (1 + frac));
    else if (frac <= 1) la = 2.0 + (4.0 - 2.0) * frac * frac;
    else la = 4.0 * Math.exp(0.7 * (frac - 1));

    stages.push({
      stage: i + 1,
      intensity: Math.round(intensity),
      intensityLabel: isPace
        ? `${Math.floor(intensity / 60)}:${String(Math.round(intensity % 60)).padStart(2, '0')}/km`
        : `${Math.round(intensity)} W`,
      lactatePredicted: Number(la.toFixed(2)),
      rpePredicted: clamp(Math.round(3 + 7 * (i / (PROTOCOL_STAGE_COUNT - 1))), 1, 10),
      durationS: PROTOCOL_STAGE_DURATION_S,
    });
  }

  return {
    sport,
    stageDurationS: PROTOCOL_STAGE_DURATION_S,
    stages,
    summary: {
      lt1Estimate: Math.round(lt1),
      lt2Estimate: Math.round(lt2),
      start: stages[0].intensityLabel,
      end:   stages[stages.length - 1].intensityLabel,
      step:  isPace ? `−${Math.abs(Math.round(step))} s/km` : `+${Math.round(step)} W`,
      totalDurationMin: Math.round(PROTOCOL_STAGE_COUNT * PROTOCOL_STAGE_DURATION_S / 60),
    },
  };
}

/**
 * Compact 30-day training summary the LLM can consume. Anything more
 * detailed wastes tokens; the model doesn't need raw daily activities,
 * just the headline numbers.
 */
function summariseTraining(activities, userProfile) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = activities.filter((a) => a.date && new Date(a.date).getTime() >= cutoff);

  const totalHours = recent.reduce((s, a) => s + (a.durationS || 0), 0) / 3600;
  const totalKm = recent.reduce((s, a) => s + (a.distanceM || 0), 0) / 1000;
  const totalTss = recent.reduce((s, a) => s + (a.tss || 0), 0);
  const sessions = recent.length;

  const cyclingCount = recent.filter((a) => /ride|cycle|bike/i.test(a.sport)).length;
  const runCount    = recent.filter((a) => /run/i.test(a.sport)).length;
  const swimCount   = recent.filter((a) => /swim/i.test(a.sport)).length;

  // Average avg-HR across all activities with HR data, as fraction of HRmax
  const maxHr = userProfile?.maxHr || userProfile?.maxHeartRate || 0;
  let hrFracSum = 0, hrFracCount = 0;
  for (const a of recent) {
    if (a.avgHr && maxHr) { hrFracSum += a.avgHr / maxHr; hrFracCount++; }
  }
  const avgHrFrac = hrFracCount > 0 ? hrFracSum / hrFracCount : null;

  return {
    days: 30,
    sessions,
    totalHours: Number(totalHours.toFixed(1)),
    totalKm: Number(totalKm.toFixed(1)),
    totalTss: Math.round(totalTss),
    sportMix: { cycling: cyclingCount, running: runCount, swimming: swimCount },
    avgHrFractionOfMax: avgHrFrac != null ? Number(avgHrFrac.toFixed(2)) : null,
  };
}

/**
 * Build the prompt + call Claude. Returns { narrative, tokens } or
 * { narrative: null, error } when the API call fails / is unavailable.
 *
 * The narrative is intentionally short (2-4 sentences) — long LLM
 * outputs in UI panels just get skimmed and ignored.
 */
async function generateNarrative({ sport, anchor, protocol, training, measured, priorTest, language = 'en' }) {
  // Two ways to turn the LLM off:
  //   1. AI_COACH_ENABLE_NARRATIVE != 'true'  → explicitly disabled
  //   2. ANTHROPIC_API_KEY missing            → no key configured
  //
  // In both cases we return { narrative: null, error: null } so the UI
  // simply doesn't render the narrative block — no scary banner about
  // "AI unavailable", because the AI side was never meant to run.
  if (process.env.AI_COACH_ENABLE_NARRATIVE !== 'true') {
    return { narrative: null, error: null };
  }
  if (!ANTHROPIC_API_KEY) {
    return { narrative: null, error: null };
  }

  const measuredBlock = measured?.lt1 && measured?.lt2 ? `
Measured this test:
- LT1: ${measured.lt1} ${sport === 'run' ? `s/km (${Math.floor(measured.lt1 / 60)}:${String(Math.round(measured.lt1 % 60)).padStart(2, '0')})` : 'W'} @ ${measured.lt1Lactate || '?'} mmol/L
- LT2: ${measured.lt2} ${sport === 'run' ? `s/km (${Math.floor(measured.lt2 / 60)}:${String(Math.round(measured.lt2 % 60)).padStart(2, '0')})` : 'W'} @ ${measured.lt2Lactate || '?'} mmol/L
` : '';

  const priorBlock = priorTest?.date && priorTest?.lt2 ? `
Previous test (${new Date(priorTest.date).toISOString().slice(0, 10)}): LT2 = ${priorTest.lt2} ${sport === 'run' ? 's/km' : 'W'}.
` : '';

  const protocolBlock = protocol?.summary ? `
Suggested next-test protocol: ${protocol.summary.start} → ${protocol.summary.end} in ${protocol.stages.length} stages × ${Math.round(protocol.stageDurationS / 60)} min (step ${protocol.summary.step}).
` : '';

  const prompt = `You are a sport-science assistant helping interpret a lactate threshold test for an endurance athlete. Write a 2-4 sentence interpretation in ${language === 'cs' ? 'Czech' : 'English'} — direct, actionable, no fluff.

Sport: ${sport}.

Last 30 days of training:
- ${training.sessions} sessions, ${training.totalHours} h, ${training.totalKm} km, ${training.totalTss} TSS
- Sport mix: ${training.sportMix.cycling} bike / ${training.sportMix.running} run / ${training.sportMix.swimming} swim
- Avg HR (% of HRmax): ${training.avgHrFractionOfMax != null ? Math.round(training.avgHrFractionOfMax * 100) + ' %' : 'unknown'}
${measuredBlock}${priorBlock}${protocolBlock}
Anchor used for protocol: ${anchor.source} (confidence ${anchor.confidence}).

Respond in this exact JSON format, no markdown:
{
  "headline": "<one-line takeaway, max 12 words>",
  "interpretation": "<2-3 sentences interpreting the test in light of training>",
  "recommendation": "<1-2 sentences with the single most useful next step>"
}`;

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { narrative: null, error: `Anthropic HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    const text = data?.content?.[0]?.text || '';
    // Try to parse the structured JSON; if it fails, return raw text in interpretation.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { headline: '', interpretation: text, recommendation: '' };
    }
    return {
      narrative: parsed,
      usage: data?.usage || null,
    };
  } catch (e) {
    return { narrative: null, error: e?.message || 'Anthropic fetch failed' };
  }
}

/**
 * Top-level orchestrator. Caller (route handler) provides:
 *   sport, measured ({lt1, lt2, lt1Lactate, lt2Lactate, baseLactate})?,
 *   priorTest ({date, lt2})?, activities[], userProfile, language?
 */
async function buildAiCoachResponse(opts) {
  const sportRaw = String(opts.sport || 'bike').toLowerCase();
  const sport = sportRaw.includes('run') ? 'run' : sportRaw.includes('swim') ? 'swim' : 'bike';

  const measuredLt2 = safe(opts.measured?.lt2);
  const priorLt2 = safe(opts.priorTest?.lt2);

  const anchor = pickAnchor({
    sport,
    measuredLt2,
    priorTestLt2: priorLt2,
    activities: opts.activities || [],
    userProfile: opts.userProfile || null,
  });

  const protocol = anchor.value ? buildProtocol({
    sport,
    lt2: anchor.value,
    baseLactate: safe(opts.measured?.baseLactate) || 1.0,
  }) : null;

  const training = summariseTraining(opts.activities || [], opts.userProfile || null);

  const narrative = await generateNarrative({
    sport,
    anchor,
    protocol,
    training,
    measured: opts.measured || null,
    priorTest: opts.priorTest || null,
    language: opts.language || 'en',
  });

  return {
    sport,
    isPace: sport === 'run' || sport === 'swim',
    anchor,
    protocol,
    training,
    narrative: narrative.narrative,
    narrativeError: narrative.error || null,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildAiCoachResponse,
  // Exposed for tests
  pickAnchor,
  buildProtocol,
  summariseTraining,
};
