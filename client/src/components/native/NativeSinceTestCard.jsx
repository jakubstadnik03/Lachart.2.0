/**
 * "Since your test", sized for a phone.
 *
 * Same engine as the desktop panel — the drift endpoint reads every session
 * since the governing test against that test's own HR–demand curve, and the
 * test history is fitted separately — but a phone has room for a verdict, not
 * an argument. So this shows the headline read, the two thresholds with what
 * each prediction makes of them, and the top few insights; the full panel,
 * with the curve overlay and the season chart, is one tap away on the web
 * testing page.
 *
 * Inline styles rather than Tailwind, matching the rest of the native shell.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GlassCard, SectionTitle } from './shared/Tiles';
import { getThresholdDrift } from '../../services/api';
import {
  demandToThreshold, projectFromTestHistory, shiftedLactateCurve, sportKind, zoneAdviceFor,
} from '../../utils/hrPowerProfile';
import { extractLactateThresholds } from '../../utils/extractLactateThresholds';
import { buildTestInsights, summariseTestInsight, testsToDemandRows } from '../../utils/testInsights';
import { fmtDemand, fmtDemandDelta } from '../../utils/thresholdFormat';

const TRAINING_COLOR = '#7C3AED';
const HISTORY_COLOR = '#0D9488';

const TONE_STYLE = {
  good: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  warn: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
  neutral: { bg: 'rgba(255,255,255,.5)', border: 'rgba(118,126,181,.14)', text: '#0A0E1A' },
};

/** Matches the curve the native testing screen already draws above this card. */
const CURVE_W = 320;
const CURVE_H = 150;
const PAD_X = 16;
const PAD_Y = 14;

/** How many insights fit before the card becomes a page. */
const MAX_INSIGHTS = 3;

function ThresholdCell({ label, testDemand, training, history, kind, storageMode, color }) {
  if (!(testDemand > 0)) return null;
  const line = (est, tint) => {
    if (!est) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ color: tint }}>{fmtDemand(est.toDemand, kind, storageMode)}</span>
        <span style={{ color: '#9CA3AF', fontWeight: 600 }}>
          {fmtDemandDelta(est.shift, est.toDemand, kind, storageMode)}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '8px 10px', borderRadius: 11,
      background: `${color}0F`, border: `1px solid ${color}26`,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800, color, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 800, color: '#0A0E1A',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
      }}>
        {fmtDemand(testDemand, kind, storageMode)}
      </span>
      {line(training, TRAINING_COLOR)}
      {line(history, HISTORY_COLOR)}
    </div>
  );
}


// ── The curve, and where each prediction puts it ───────────────────────────

const CURVE_MODES = [
  { key: 'training', label: 'Training', color: TRAINING_COLOR },
  { key: 'history', label: 'Test history', color: HISTORY_COLOR },
  { key: 'both', label: 'Both', color: '#475569' },
  { key: 'test', label: 'Test only', color: '#5E6590' },
];

/**
 * The measured curve with a predicted one over it, drawn by hand.
 *
 * The desktop panel uses recharts; a phone in a webview does not want a
 * charting library for one 150-pixel figure, and the rest of the native
 * testing screen already draws its curve as plain SVG. So this matches that —
 * same padding, same pace inversion (slower on the left), same dot treatment.
 *
 * A predicted curve is the measured one slid along the intensity axis: the
 * lactate values are carried across untouched, and what moves is the intensity
 * at which each appears.
 */
function PredictedCurve({ anchor, training, history, kind, storageMode, mode, onMode, available }) {
  const shapes = useMemo(() => {
    const isPace = kind !== 'bike';
    const toX = (points) => points
      .map((pt) => ({ x: demandToThreshold(pt.demand, { kind, storageMode }), y: pt.lactate }))
      .filter((pt) => Number.isFinite(pt.x) && pt.x > 0);

    const measured = (anchor.points || [])
      .map((pt) => ({ x: Number(pt.x), y: Number(pt.y) }))
      .filter((pt) => Number.isFinite(pt.x) && pt.x > 0 && Number.isFinite(pt.y) && pt.y > 0);
    if (measured.length < 3) return null;

    const wantTraining = training && (mode === 'training' || mode === 'both');
    const wantHistory = history && (mode === 'history' || mode === 'both');
    const shifted = {
      training: wantTraining ? shiftedLactateCurve(anchor, training) : null,
      history: wantHistory ? shiftedLactateCurve(anchor, history) : null,
    };

    const series = [
      { key: 'test', pts: measured, color: '#94A3B8', dashed: true },
      shifted.training && { key: 'training', pts: toX(shifted.training.points), color: TRAINING_COLOR },
      shifted.history && { key: 'history', pts: toX(shifted.history.points), color: HISTORY_COLOR },
    ].filter((sr) => sr && sr.pts.length >= 3);

    const allX = series.flatMap((sr) => sr.pts.map((pt) => pt.x));
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const yMax = Math.max(...series.flatMap((sr) => sr.pts.map((pt) => pt.y)), 5) * 1.1;

    // Pace: a bigger number of seconds is slower, so it belongs on the left.
    const px = (x) => (isPace && storageMode !== 'speed'
      ? PAD_X + ((xMax - x) / (xMax - xMin || 1)) * (CURVE_W - PAD_X * 2)
      : PAD_X + ((x - xMin) / (xMax - xMin || 1)) * (CURVE_W - PAD_X * 2));
    const py = (y) => CURVE_H - PAD_Y - (y / yMax) * (CURVE_H - PAD_Y * 2);

    const path = (pts) => {
      const xy = [...pts]
        .sort((a, b) => px(a.x) - px(b.x))
        .map((pt) => [px(pt.x), py(pt.y)]);
      return {
        d: xy.reduce((acc, [x, y], i) => {
          if (i === 0) return `M${x},${y}`;
          const [x0, y0] = xy[i - 1];
          const cx = (x0 + x) / 2;
          return `${acc} C${cx},${y0} ${cx},${y} ${x},${y}`;
        }, ''),
        xy,
      };
    };

    // The bands come from whichever prediction is on screen; two overlapping
    // pairs are unreadable at this size, so 'both' shows the training pair.
    const source = mode === 'history' ? history : mode === 'test' ? null : training;
    const marks = source ? [
      { key: 'LT1', color: '#4BA87D', est: source.lt1 },
      { key: 'LT2', color: '#E05347', est: source.lt2 },
    ].filter((m) => m.est).map((m) => ({
      ...m,
      from: px(demandToThreshold(m.est.fromDemand, { kind, storageMode })),
      to: px(demandToThreshold(m.est.toDemand, { kind, storageMode })),
    })) : [];

    return { series: series.map((sr) => ({ ...sr, ...path(sr.pts) })), marks, fourMmolY: py(4) };
  }, [anchor, training, history, kind, storageMode, mode]);

  if (!shapes) return null;
  // Nothing to switch between — a lone pill is furniture on a screen this size.
  const canSwitch = CURVE_MODES.filter((m) => available[m.key]).length > 1;

  return (
    <div style={{ marginTop: 10 }}>
      {canSwitch && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {CURVE_MODES.filter((m) => available[m.key]).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onMode(m.key)}
            style={{
              padding: '4px 9px', borderRadius: 999,
              fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              background: mode === m.key ? m.color : 'rgba(255,255,255,.6)',
              color: mode === m.key ? '#fff' : '#6B7280',
              border: `1px solid ${mode === m.key ? m.color : 'rgba(118,126,181,.18)'}`,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      )}

      <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: CURVE_H, display: 'block' }}>
        <line x1={PAD_X} y1={CURVE_H - PAD_Y} x2={CURVE_W - PAD_X} y2={CURVE_H - PAD_Y}
          stroke="rgba(118,126,181,.18)" />
        {shapes.fourMmolY > PAD_Y && shapes.fourMmolY < CURVE_H - PAD_Y && (
          <line x1={PAD_X} y1={shapes.fourMmolY} x2={CURVE_W - PAD_X} y2={shapes.fourMmolY}
            stroke="rgba(224,83,71,.25)" strokeDasharray="2 4" />
        )}

        {/* How far each threshold travelled, drawn as the gap it crossed. */}
        {shapes.marks.map((m) => (
          <rect key={`b-${m.key}`}
            x={Math.min(m.from, m.to)} y={PAD_Y}
            width={Math.max(1.5, Math.abs(m.to - m.from))} height={CURVE_H - PAD_Y * 2}
            fill={m.color} fillOpacity={0.14} />
        ))}
        {shapes.marks.map((m) => (
          <line key={`t-${m.key}`} x1={m.to} y1={PAD_Y} x2={m.to} y2={CURVE_H - PAD_Y}
            stroke={m.color} strokeWidth="1.6" />
        ))}

        {shapes.series.map((sr) => (
          <path key={sr.key} d={sr.d} fill="none" stroke={sr.color}
            strokeWidth={sr.dashed ? 1.8 : 2.4}
            strokeDasharray={sr.dashed ? '4 3' : undefined}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {shapes.series.map((sr) => sr.xy.map(([x, y], i) => (
          <circle key={`${sr.key}-${i}`} cx={x} cy={y} r="2.6"
            fill="#fff" stroke={sr.color} strokeWidth="1.4" />
        )))}
      </svg>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 5,
        fontSize: 9.5, fontWeight: 600, color: '#9CA3AF',
      }}>
        <span style={{ color: '#94A3B8' }}>— — test day</span>
        {shapes.series.some((sr) => sr.key === 'training') && (
          <span style={{ color: TRAINING_COLOR }}>— from training</span>
        )}
        {shapes.series.some((sr) => sr.key === 'history') && (
          <span style={{ color: HISTORY_COLOR }}>— from test history</span>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.test   the test the card is about
 * @param {Array}  p.tests  every test the page holds — fitted for the history read
 */
export default function NativeSinceTestCard({
  test: openTest, tests = [], athleteId = null, onOpenFull = null,
}) {
  const kind = sportKind(openTest?.sport);
  const supported = kind === 'bike' || kind === 'run';

  /**
   * The latest test of this sport, which is the only one the drift walk can
   * speak about — it gathers sessions after the newest test and nothing
   * before it. See the desktop panel for the full reasoning.
   */
  const test = useMemo(() => {
    const sameSport = (tests || []).filter((t) => sportKind(t?.sport) === kind && t?.date);
    if (!sameSport.length) return openTest;
    const newest = sameSport.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
    return new Date(newest.date) > new Date(openTest?.date || 0) ? newest : openTest;
  }, [tests, kind, openTest]);

  const isViewingOlder = String(test?._id || '') !== String(openTest?._id || '');
  const anchor = useMemo(() => (test ? extractLactateThresholds(test) : null), [test]);
  const storageMode = anchor?.storageMode || 'pace';

  const anchorPayload = useMemo(() => (anchor?.lt2 > 0 && anchor?.lt2Hr > 0 ? {
    lt1: anchor.lt1, lt2: anchor.lt2, lt1Hr: anchor.lt1Hr, lt2Hr: anchor.lt2Hr,
    storageMode: anchor.storageMode,
    points: (anchor.points || []).map((p) => ({ x: p.x, y: p.y, hr: p.hr })),
  } : null), [anchor]);

  const [state, setState] = useState({ loading: true, drift: null });
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!supported || !anchorPayload) { setState({ loading: false, drift: null }); return undefined; }
    let cancelled = false;
    setState({ loading: true, drift: null });
    getThresholdDrift(kind, athleteId, anchorPayload)
      .then((res) => { if (!cancelled) setState({ loading: false, drift: res?.data ?? res }); })
      .catch(() => { if (!cancelled) setState({ loading: false, drift: null }); });
    return () => { cancelled = true; };
  }, [kind, athleteId, anchorPayload, supported]);

  // Only tests up to the one on screen — see the desktop panel for why.
  const history = useMemo(() => {
    if (!anchor) return null;
    const cutoff = new Date(test?.date).getTime();
    const rows = testsToDemandRows(tests, extractLactateThresholds, kind)
      .filter((r) => !Number.isFinite(cutoff) || new Date(r.date).getTime() <= cutoff);
    return projectFromTestHistory(rows, anchor);
  }, [tests, anchor, kind, test]);

  const drift = state.drift;
  const training = drift?.projection || null;

  const available = useMemo(() => ({
    training: !!training,
    history: !!history,
    both: !!training && !!history,
    test: true,
  }), [training, history]);

  // Default to the read made of training — it is the answer to "is this block
  // working", which is the question the athlete opened the app with.
  const curveMode = mode && available[mode] ? mode
    : training ? 'training' : history ? 'history' : 'test';

  const summary = useMemo(
    () => (anchor ? summariseTestInsight({ anchor, test, drift }) : null),
    [anchor, test, drift],
  );

  const insights = useMemo(() => {
    if (!anchor) return [];
    const advice = zoneAdviceFor(training, { testDate: test?.date });
    return buildTestInsights({ anchor, test, drift, history, advice })
      // The headline and the no-data explanation are already the summary above;
      // repeating either wastes the only screen there is.
      .filter((i) => i.id !== 'now' && !(i.id === 'coverage' && !training))
      .slice(0, MAX_INSIGHTS);
  }, [anchor, test, drift, history, training]);

  if (!openTest || !test || !supported || !anchor || !(anchor.lt2 > 0)) return null;
  if (state.loading) {
    return (
      <GlassCard>
        <SectionTitle>Since your test</SectionTitle>
        <div className="animate-pulse" style={{ marginTop: 10, height: 14, borderRadius: 8, background: 'rgba(118,126,181,.12)' }} />
        <div className="animate-pulse" style={{ marginTop: 6, height: 34, borderRadius: 11, background: 'rgba(118,126,181,.08)' }} />
      </GlassCard>
    );
  }
  if (!summary) return null;

  const tone = TONE_STYLE[summary.tone] || TONE_STYLE.neutral;
  const lt1Demand = training?.lt1?.fromDemand ?? history?.lt1?.fromDemand ?? null;
  const lt2Demand = training?.lt2?.fromDemand ?? history?.lt2?.fromDemand ?? null;

  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <SectionTitle>Since your test</SectionTitle>
        {drift?.coverage?.considered ? (
          <span style={{ fontSize: 9.5, fontWeight: 600, color: '#9CA3AF' }}>
            {drift.coverage.compared ?? drift.coverage.read}/{drift.coverage.considered} sessions read
          </span>
        ) : null}
      </div>

      {isViewingOlder && (
        <div style={{
          marginBottom: 8, padding: '7px 10px', borderRadius: 11,
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          fontSize: 10.5, fontWeight: 600, color: '#1E40AF', lineHeight: 1.45,
        }}>
          Read against your latest {kind === 'bike' ? 'bike' : 'run'} test
          {' '}({new Date(test.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })})
          {' '}— only the training after it can say where you are now.
        </div>
      )}

      {/* The verdict. */}
      <div style={{
        padding: '9px 11px', borderRadius: 12,
        background: tone.bg, border: `1px solid ${tone.border}`,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: tone.text, lineHeight: 1.35 }}>
          {summary.headline}
        </div>
        <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 600, color: '#6B7280', lineHeight: 1.45 }}>
          {summary.detail}
        </div>
      </div>

      {/* Test value on top, each prediction under it. */}
      {(training || history) && (lt1Demand || lt2Demand) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 9 }}>
            <ThresholdCell
              label="LT1" testDemand={lt1Demand} training={training?.lt1} history={history?.lt1}
              kind={kind} storageMode={storageMode} color="#4BA87D"
            />
            <ThresholdCell
              label="LT2" testDemand={lt2Demand} training={training?.lt2} history={history?.lt2}
              kind={kind} storageMode={storageMode} color="#E05347"
            />
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6,
            fontSize: 9.5, fontWeight: 600, color: '#9CA3AF',
          }}>
            <span>measured</span>
            {training && <span style={{ color: TRAINING_COLOR }}>from training</span>}
            {history && <span style={{ color: HISTORY_COLOR }}>from test history</span>}
          </div>
        </>
      )}

      <PredictedCurve
        anchor={anchor} training={training} history={history}
        kind={kind} storageMode={storageMode}
        mode={curveMode} onMode={setMode} available={available}
      />

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {insights.map((i) => {
            const t = TONE_STYLE[i.tone] || TONE_STYLE.neutral;
            return (
              <div key={i.id} style={{
                padding: '8px 10px', borderRadius: 11,
                background: t.bg, border: `1px solid ${t.border}`,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: t.text, lineHeight: 1.35 }}>{i.title}</div>
                <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 500, color: '#6B7280', lineHeight: 1.5 }}>
                  {i.body}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onOpenFull && (
        <button
          type="button"
          onClick={onOpenFull}
          style={{
            marginTop: 10, width: '100%', padding: '9px 12px', borderRadius: 12,
            background: 'rgba(118,126,181,.10)', border: '1px solid rgba(118,126,181,.18)',
            color: '#5E6590', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Open the full read
        </button>
      )}
    </GlassCard>
  );
}
