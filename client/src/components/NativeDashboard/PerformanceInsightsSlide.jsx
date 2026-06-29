/**
 * First slide of the native dashboard carousel — Fitness / Form / Fatigue KPIs.
 */
import React, { useMemo } from 'react';
import { NativeSkeleton } from '../native/shared/Tiles';

const CARD = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '12px 14px 14px',
  width: '100%',
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

  if (loading) {
    return (
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <NativeSkeleton width={22} height={22} radius={6} />
          <NativeSkeleton width={140} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
          <NativeSkeleton height={72} radius={12} style={{ flex: 1 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={CARD}>
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

      <div style={{ display: 'flex', gap: 8 }}>
        <MetricTile label="Fitness" value={fitness} color="#3b82f6" delta={fitnessDelta} />
        <MetricTile label="Form" value={form} color="#f97316" delta={formDelta} highlight />
        <MetricTile label="Fatigue" value={fatigue} color="#ec4899" delta={fatigueDelta} />
      </div>
    </div>
  );
}
