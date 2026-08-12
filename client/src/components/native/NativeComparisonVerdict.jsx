/**
 * NativeComparisonVerdict — the phone's version of the comparison verdict.
 *
 * Same logic as the web block (utils/comparisonVerdict.js); only the styling
 * differs, because the native pages use inline styles and a glass aesthetic
 * rather than Tailwind. Deliberately more compact: on a phone the verdict and
 * the confidence line are worth the space, the four supporting stats are not
 * until you tap.
 */
import React, { useMemo, useState } from 'react';
import {
  PACE_NOISE,
  buildComparisonVerdict,
  formatMetric,
} from '../../utils/comparisonVerdict';

const TONE = {
  good: { bg: 'rgba(16,185,129,.10)', border: 'rgba(16,185,129,.28)', accent: '#047857' },
  bad: { bg: 'rgba(244,63,94,.10)', border: 'rgba(244,63,94,.28)', accent: '#B91C1C' },
  neutral: { bg: 'rgba(118,126,181,.08)', border: 'rgba(118,126,181,.18)', accent: '#5E6590' },
};

/**
 * Run and swim store pace in the `power` slot, where lower is better and the
 * value is seconds rather than watts. Without this the verdict congratulates a
 * runner for getting slower.
 */
export function paceAwareNoise(metric, sport) {
  const s = String(sport || '').toLowerCase();
  const isPaceSport = s.includes('run') || s.includes('swim') || s.includes('walk');
  return metric === 'power' && isPaceSport ? PACE_NOISE : null;
}

export default function NativeComparisonVerdict({
  trainings = [],
  metric = 'power',
  workOnly = true,
  intervalsFor = null,
  sport = null,
}) {
  const [open, setOpen] = useState(false);

  const noise = useMemo(
    () => paceAwareNoise(metric, sport ?? trainings?.[0]?.sport),
    [metric, sport, trainings],
  );

  const verdict = useMemo(
    () => buildComparisonVerdict(trainings, metric, { workOnly, intervalsFor, noise }),
    [trainings, metric, workOnly, intervalsFor, noise],
  );

  if (!verdict) return null;

  const tone = TONE[verdict.headline.tone] || TONE.neutral;
  const { vsPrevious, vsBest, efficiency, projection, latest, best } = verdict;
  const fmt = (v) => formatMetric(v, metric, noise);

  return (
    <div
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 12,
        padding: '9px 11px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em',
            textTransform: 'uppercase', color: tone.accent,
          }}>
            Verdict
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: '#111827', lineHeight: 1.25 }}>
            {verdict.headline.verdict}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
            {verdict.headline.detail}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>
            Latest
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: tone.accent }}>{fmt(latest.mean)}</div>
        </div>
      </div>

      {/* The confidence line is the point of the whole block on mobile. */}
      <div style={{
        marginTop: 7,
        background: 'rgba(255,255,255,.6)',
        borderRadius: 9,
        padding: '6px 8px',
        fontSize: 10.5,
        lineHeight: 1.4,
        color: '#374151',
      }}>
        {vsPrevious.significant ? '✓ ' : '⚠︎ '}
        {vsPrevious.confidenceLine}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none', background: 'transparent', padding: '5px 0 0',
          fontFamily: 'inherit', fontSize: 10, fontWeight: 700, color: '#6B7280', cursor: 'pointer',
        }}
      >
        {open ? 'Hide detail' : 'Best ever, efficiency & projection'}
      </button>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
          {[
            {
              label: 'vs last',
              value: vsPrevious.comparable
                ? `${vsPrevious.delta > 0 ? '+' : ''}${fmt(vsPrevious.delta)}`
                : '—',
              muted: !vsPrevious.significant,
            },
            { label: 'Best ever', value: best ? fmt(best.mean) : '—', muted: !vsBest?.significant },
            {
              label: 'Efficiency',
              value: efficiency ? `${efficiency.current.toFixed(2)} W/bpm` : '—',
              sub: efficiency ? efficiency.direction : 'needs power + HR',
              muted: !efficiency,
            },
            {
              label: 'Next session',
              value: projection ? fmt(projection.next) : '—',
              sub: projection ? projection.direction : 'needs 3+ sessions',
              muted: !projection || projection.direction === 'flat',
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: 'rgba(255,255,255,.6)',
                borderRadius: 9,
                padding: '5px 8px',
                opacity: s.muted ? 0.6 : 1,
              }}
            >
              <div style={{ fontSize: 8, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {s.label}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#111827' }}>{s.value}</div>
              {s.sub ? <div style={{ fontSize: 8.5, color: '#9CA3AF' }}>{s.sub}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
