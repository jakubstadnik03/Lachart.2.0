/**
 * The curve your training implies, on a phone, before you have tested.
 *
 * Same estimator as the web card — thresholds off whatever the app knows, a
 * population lactate shape anchored at 4 mmol — drawn as plain SVG to match
 * the rest of the native shell rather than pulling a charting library into a
 * webview for one small figure.
 *
 * One deliberate difference: the web card can also read thresholds out of the
 * athlete's own heart-rate streams, which is the best source there is. Doing
 * that costs fifteen sequential stream fetches spaced to stay inside Strava's
 * rate limit — a minute of network on a phone, for a card above the fold. So
 * this reads the cheap sources only (a profile threshold, a best twenty
 * minutes) and points at the full page, which does the rest.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GlassCard, SectionTitle } from './shared/Tiles';
import api from '../../services/api';
import { sportKind, testLactateCurve, thresholdToDemand } from '../../utils/hrPowerProfile';
import { estimateAnchorFromTraining } from '../../utils/estimateAnchorFromTraining';
import { ltZoneBounds } from '../../utils/trainingZoneBounds';
import { fmtDemand } from '../../utils/thresholdFormat';

const CURVE_W = 320;
const CURVE_H = 150;
const PAD_X = 16;
const PAD_Y = 14;

const CURVE_COLOR = '#7C3AED';
const LT1_COLOR = '#4BA87D';
const LT2_COLOR = '#E05347';

const CONFIDENCE = {
  high: { label: 'strong evidence', bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
  medium: { label: 'fair evidence', bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE' },
  low: { label: 'a rough estimate', bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
};

const ZONES = [
  { label: 'Z1', name: 'Recovery', color: '#60A5FA' },
  { label: 'Z2', name: 'Aerobic', color: '#34D399' },
  { label: 'Z3', name: 'Tempo', color: '#FBBF24' },
  { label: 'Z4', name: 'Threshold', color: '#F97316' },
  { label: 'Z5', name: 'VO₂max', color: '#F43F5E' },
];

function ThresholdTile({ label, value, hr, lactate, color, kind, storageMode, derived, hrPopulation }) {
  if (!(value > 0)) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '8px 10px', borderRadius: 11,
      background: `${color}0F`, border: `1px solid ${color}26`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          fontSize: 9, fontWeight: 800, color, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{label}</span>
        {derived && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: '#9CA3AF',
            background: 'rgba(255,255,255,.7)', borderRadius: 999, padding: '1px 5px',
          }}>derived</span>
        )}
      </div>
      <span style={{
        fontSize: 16, fontWeight: 800, color: '#0A0E1A',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
      }}>
        {fmtDemand(thresholdToDemand(value, { kind, storageMode }), kind, storageMode)}
      </span>
      <div style={{
        display: 'flex', gap: 5, fontSize: 10, fontWeight: 600, color: '#6B7280',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {hr > 0 && (
          <span>
            <span style={{ color: '#0A0E1A', fontWeight: 700 }}>{Math.round(hr)}</span> bpm
            {hrPopulation ? <span style={{ color: '#9CA3AF' }}> (typical)</span> : null}
          </span>
        )}
        {lactate > 0 && <span style={{ color }}>≈{Number(lactate).toFixed(1)} mmol</span>}
      </div>
    </div>
  );
}

/** The modelled curve, drawn dashed because none of the lactate is measured. */
function ModelledCurve({ anchor, kind, storageMode }) {
  const shape = useMemo(() => {
    const curve = testLactateCurve(anchor);
    if (!curve) return null;
    const isPace = kind !== 'bike';
    const pts = curve.points.map((p) => ({ x: p.demand, y: p.lactate }));
    const xMin = Math.min(...pts.map((p) => p.x));
    const xMax = Math.max(...pts.map((p) => p.x));
    const yMax = Math.max(...pts.map((p) => p.y), 5) * 1.1;
    // Demand always runs faster to the right, for both sports.
    const px = (x) => PAD_X + ((x - xMin) / (xMax - xMin || 1)) * (CURVE_W - PAD_X * 2);
    const py = (y) => CURVE_H - PAD_Y - (y / yMax) * (CURVE_H - PAD_Y * 2);
    const xy = pts.map((p) => [px(p.x), py(p.y)]);
    const d = xy.reduce((acc, [x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [x0, y0] = xy[i - 1];
      const cx = (x0 + x) / 2;
      return `${acc} C${cx},${y0} ${cx},${y} ${x},${y}`;
    }, '');
    const fill = `${d} L ${xy[xy.length - 1][0]},${CURVE_H - PAD_Y} L ${xy[0][0]},${CURVE_H - PAD_Y} Z`;
    const toDemand = (v) => thresholdToDemand(v, { kind, storageMode });
    return {
      d,
      fill,
      xy,
      lt1X: px(toDemand(anchor.lt1)),
      lt2X: px(toDemand(anchor.lt2)),
      fourMmolY: py(4),
      isPace,
    };
  }, [anchor, kind, storageMode]);

  if (!shape) return null;

  return (
    <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: CURVE_H, display: 'block', marginTop: 8 }}>
      <defs>
        <linearGradient id="npcc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={CURVE_COLOR} stopOpacity=".16" />
          <stop offset="1" stopColor={CURVE_COLOR} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PAD_X} y1={CURVE_H - PAD_Y} x2={CURVE_W - PAD_X} y2={CURVE_H - PAD_Y}
        stroke="rgba(118,126,181,.18)" />
      {shape.fourMmolY > PAD_Y && shape.fourMmolY < CURVE_H - PAD_Y && (
        <line x1={PAD_X} y1={shape.fourMmolY} x2={CURVE_W - PAD_X} y2={shape.fourMmolY}
          stroke="rgba(224,83,71,.25)" strokeDasharray="2 4" />
      )}
      <rect x={Math.min(shape.lt1X, shape.lt2X)} y={PAD_Y}
        width={Math.abs(shape.lt2X - shape.lt1X)} height={CURVE_H - PAD_Y * 2}
        fill="#94A3B8" fillOpacity={0.08} />
      <line x1={shape.lt1X} y1={PAD_Y} x2={shape.lt1X} y2={CURVE_H - PAD_Y}
        stroke={LT1_COLOR} strokeWidth="1.6" />
      <line x1={shape.lt2X} y1={PAD_Y} x2={shape.lt2X} y2={CURVE_H - PAD_Y}
        stroke={LT2_COLOR} strokeWidth="1.6" />
      <path d={shape.fill} fill="url(#npcc-fill)" />
      <path d={shape.d} fill="none" stroke={CURVE_COLOR} strokeWidth="2.4"
        strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
      {shape.xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.8" fill="#fff" stroke={CURVE_COLOR} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function ZoneRows({ anchor, kind, storageMode }) {
  const rows = useMemo(() => {
    const bounds = ltZoneBounds({ lt1: anchor.lt1, lt2: anchor.lt2, ascending: kind === 'bike' });
    if (!bounds) return null;
    return ZONES.map((z, i) => ({ ...z, from: bounds[i], to: bounds[i + 1] }));
  }, [anchor, kind]);
  if (!rows) return null;
  const show = (v) => fmtDemand(thresholdToDemand(v, { kind, storageMode }), kind, storageMode);
  return (
    <div style={{ marginTop: 10, borderRadius: 11, overflow: 'hidden', border: '1px solid rgba(118,126,181,.14)' }}>
      {rows.map((z, i) => (
        <div key={z.label} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px',
          borderBottom: i < rows.length - 1 ? '1px solid rgba(118,126,181,.08)' : 'none',
          background: 'rgba(255,255,255,.45)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0A0E1A', width: 18 }}>{z.label}</span>
          <span style={{ fontSize: 10, color: '#9CA3AF', flex: 1 }}>{z.name}</span>
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums',
          }}>
            {show(z.from)} – {show(z.to)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object} p
 * @param {string} p.sport      'bike' | 'run'
 * @param {object} [p.profile]  the athlete's profile — the auth user carries it
 * @param {Function} [p.onAddTest]
 * @param {Function} [p.onOpenFull]
 */
export default function NativePredictedCurveCard({
  sport, profile = null, athleteId = null, onAddTest = null, onOpenFull = null,
}) {
  const kind = sportKind(sport);
  const [powerMetrics, setPowerMetrics] = useState(null);

  // The only network this card does. Cached for two minutes app-wide, so on a
  // warm app it costs nothing at all.
  useEffect(() => {
    if (kind !== 'bike') { setPowerMetrics(null); return undefined; }
    let cancelled = false;
    const params = new URLSearchParams({ comparePeriod: '90days' });
    if (athleteId) params.set('athleteId', String(athleteId));
    api.get(`/api/fit/power-metrics?${params.toString()}`)
      .then((res) => { if (!cancelled) setPowerMetrics(res?.data ?? null); })
      .catch(() => { if (!cancelled) setPowerMetrics(null); });
    return () => { cancelled = true; };
  }, [kind, athleteId]);

  const anchor = useMemo(() => estimateAnchorFromTraining({
    sport: kind, profile, powerMetrics,
  }), [kind, profile, powerMetrics]);

  if (kind !== 'bike' && kind !== 'run') return null;

  if (!anchor) {
    return (
      <GlassCard>
        <SectionTitle>No {kind === 'bike' ? 'bike' : 'run'} test yet</SectionTitle>
        <p style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5, color: '#6B7280' }}>
          Not enough on file to estimate your thresholds either. Set your
          {kind === 'bike' ? ' FTP' : ' threshold pace'} in your profile, or add a lactate test, and
          this becomes your curve.
        </p>
        {onAddTest && (
          <button type="button" onClick={onAddTest} style={{
            marginTop: 9, width: '100%', padding: '9px 12px', borderRadius: 12,
            background: '#767EB5', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
          }}>
            Add a lactate test
          </button>
        )}
      </GlassCard>
    );
  }

  const storageMode = anchor.storageMode;
  const conf = CONFIDENCE[anchor.confidence] || CONFIDENCE.low;
  const lt2Source = (anchor.sources || []).find((s) => s.threshold === 'LT2');

  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <SectionTitle>Your estimated curve</SectionTitle>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          background: conf.bg, color: conf.fg, border: `1px solid ${conf.border}`,
        }}>
          {conf.label}
        </span>
      </div>

      <p style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: '#6B7280' }}>
        You have not entered a lactate test yet, so this is the curve your training implies.
        {lt2Source ? ` The thresholds come from ${lt2Source.label}` : ''}
        {anchor.hrIsPopulation
          ? ', and the heart rates from a typical percentage of your maximum.'
          : lt2Source ? '.' : ''} The lactate values are the population shape anchored at 4 mmol —
        not your blood, which is why the line is dashed.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 9 }}>
        <ThresholdTile
          label="LT1" value={anchor.lt1} hr={anchor.lt1Hr} lactate={anchor.lt1Lac}
          color={LT1_COLOR} kind={kind} storageMode={storageMode}
          derived={anchor.lt1Derived} hrPopulation={anchor.hrIsPopulation}
        />
        <ThresholdTile
          label="LT2" value={anchor.lt2} hr={anchor.lt2Hr} lactate={anchor.lt2Lac}
          color={LT2_COLOR} kind={kind} storageMode={storageMode}
          hrPopulation={anchor.hrIsPopulation}
        />
      </div>

      <ModelledCurve anchor={anchor} kind={kind} storageMode={storageMode} />
      <ZoneRows anchor={anchor} kind={kind} storageMode={storageMode} />

      <div style={{
        marginTop: 10, padding: '9px 11px', borderRadius: 12,
        background: 'rgba(118,126,181,.08)', border: '1px solid rgba(118,126,181,.16)',
      }}>
        <p style={{ fontSize: 11, lineHeight: 1.5, color: '#374151', margin: 0 }}>
          <strong style={{ color: '#0A0E1A' }}>Do the test and this stops being a guess.</strong> A real
          curve pins your thresholds to blood, and from then on every session you train is read against
          it — so you see the curve move without testing again.
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {onAddTest && (
            <button type="button" onClick={onAddTest} style={{
              flex: 1, padding: '9px 12px', borderRadius: 12,
              background: '#767EB5', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
            }}>
              Add a test
            </button>
          )}
          {onOpenFull && (
            <button type="button" onClick={onOpenFull} style={{
              flex: 1, padding: '9px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,.6)', border: '1px solid rgba(118,126,181,.18)',
              color: '#5E6590', fontSize: 12, fontWeight: 700,
            }}>
              Refine on the web
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
