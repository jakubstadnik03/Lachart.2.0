/**
 * First slide of the native dashboard carousel — Fitness / Form / Fatigue KPIs
 * plus today's training-readiness bar (Overloading ↔ Recharging).
 */
import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { NativeSkeleton } from '../native/shared/Tiles';
import { getTsbStatus } from '../../utils/formFitnessMetrics';

const CARD = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '12px 14px 16px',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
};

function readField(d, ...keys) {
  for (const k of keys) {
    const v = d[k] ?? d[k.toLowerCase()] ?? d[k.toUpperCase()];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}

function DeltaArrow({ value }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const color = up ? '#10b981' : '#9ca3af';
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, marginLeft: 2 }} aria-hidden>
      {up ? '▲' : '▼'}
    </span>
  );
}

/** Dashboard-friendly readiness label (matches design mock). */
function readinessHeadline(tsb) {
  const n = Number(tsb);
  if (n > 10) return 'Recharging';
  if (n > -5) return 'Balanced';
  if (n > -25) return 'Loading';
  return 'Overloading';
}

/** 0 = overloading (left), 100 = recharging (right). */
function readinessMarkerPct(tsb) {
  const n = Number(tsb);
  const clamped = Math.min(25, Math.max(-45, n));
  return Math.min(96, Math.max(4, ((clamped + 45) / 70) * 100));
}

function MetricTile({ label, value, color, delta, highlight = false }) {
  const display = typeof value === 'number' && label === 'Form' && value > 0 ? `+${value}` : value;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 12,
        padding: '10px 8px 8px',
        background: 'rgba(255,255,255,.55)',
        border: highlight ? `1.5px solid ${color}` : '1px solid rgba(118,126,181,.14)',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            color,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {display}
        </span>
        <DeltaArrow value={delta} />
      </div>
      <div
        style={{
          marginTop: 6,
          paddingTop: 5,
          borderTop: `2px solid ${color}`,
          fontSize: 11,
          fontWeight: 800,
          color,
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function PerformanceInsightsSlide({
  todayMetrics = {},
  sparklineData = [],
  loading = false,
  onReadinessPress = null,
}) {
  const { fitness, fatigue, form, fitnessDelta, fatigueDelta, formDelta } = useMemo(() => {
    const lastPt = sparklineData.length > 0 ? sparklineData[sparklineData.length - 1] : null;
    const prevPt = sparklineData.length > 1 ? sparklineData[sparklineData.length - 2] : null;

    const fit = Math.round(todayMetrics.fitness ?? (lastPt ? readField(lastPt, 'Fitness', 'fitness', 'ctl') : 0));
    const fat = Math.round(todayMetrics.fatigue ?? (lastPt ? readField(lastPt, 'Fatigue', 'fatigue', 'atl') : 0));
    const frm = Math.round(
      todayMetrics.form != null
        ? todayMetrics.form
        : lastPt
          ? readField(lastPt, 'Form', 'form', 'tsb')
          : 0,
    );

    const delta = (curr, todayKey, prevKeys) => {
      if (todayMetrics[todayKey] != null) return todayMetrics[todayKey];
      if (!prevPt || !lastPt) return null;
      const prevVal = readField(prevPt, ...prevKeys);
      return Math.round(curr - prevVal);
    };

    return {
      fitness: fit,
      fatigue: fat,
      form: frm,
      fitnessDelta: delta(fit, 'fitnessChange', ['Fitness', 'fitness', 'ctl']),
      fatigueDelta: delta(fat, 'fatigueChange', ['Fatigue', 'fatigue', 'atl']),
      formDelta: delta(frm, 'formChange', ['Form', 'form', 'tsb']),
    };
  }, [todayMetrics, sparklineData]);

  const status = getTsbStatus(form);
  const readiness = readinessHeadline(form);
  const markerLeft = readinessMarkerPct(form);

  if (loading) {
    return (
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <NativeSkeleton width={22} height={22} radius={6} />
          <NativeSkeleton width={140} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
        </div>
        <NativeSkeleton width="100%" height={88} radius={12} />
      </div>
    );
  }

  return (
    <div style={CARD}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="12" width="4" height="9" rx="1" fill="#599FD0" />
          <rect x="10" y="7" width="4" height="14" rx="1" fill="#5E6590" />
          <rect x="17" y="3" width="4" height="18" rx="1" fill="#599FD0" opacity="0.55" />
        </svg>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.02em' }}>
          Performance Insights
        </span>
      </div>

      {/* Fitness · Form · Fatigue */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <MetricTile label="Fitness" value={fitness} color="#3b82f6" delta={fitnessDelta} />
        <MetricTile label="Form" value={form} color="#f97316" delta={formDelta} highlight />
        <MetricTile label="Fatigue" value={fatigue} color="#ec4899" delta={fatigueDelta} />
      </div>

      {/* Today's training readiness */}
      <button
        type="button"
        onClick={onReadinessPress || undefined}
        style={{
          width: '100%',
          textAlign: 'left',
          border: '1px solid rgba(118,126,181,.14)',
          borderRadius: 14,
          padding: '10px 12px 12px',
          background: 'rgba(255,255,255,.5)',
          cursor: onReadinessPress ? 'pointer' : 'default',
          fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Today&apos;s Training Readiness</span>
          {onReadinessPress && <ChevronRight size={16} color="#9ca3af" strokeWidth={2.2} />}
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#78350f', marginBottom: 10, letterSpacing: '-0.02em' }}>
          {readiness}
        </div>
        <div style={{ position: 'relative', paddingTop: 8 }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${markerLeft}%`,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `7px solid ${status.color}`,
            }}
          />
          <div style={{ display: 'flex', gap: 3, height: 8 }}>
            {['#f97316', '#fdba74', '#fde68a', '#fef3c7', '#fff7ed'].map((bg, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderRadius: i === 0 ? '4px 0 0 4px' : i === 4 ? '0 4px 4px 0' : 2,
                  background: bg,
                  opacity: markerLeft < (i + 1) * 20 ? 0.35 + i * 0.12 : 1,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9a3412' }}>Overloading</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>Recharging</span>
          </div>
        </div>
      </button>
    </div>
  );
}
