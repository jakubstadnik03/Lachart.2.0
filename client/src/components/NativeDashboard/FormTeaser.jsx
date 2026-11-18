import React from 'react';
import { getTsbStatus } from '../../utils/formFitnessMetrics';

/**
 * The free user's own form, in one line — the part of Form & Fitness that is
 * worth knowing every morning. The chart, trend and deltas are what Premium
 * adds on top of it, so the lock shows something true about them rather than
 * a blurred stand-in.
 */
export default function FormTeaser({ todayMetrics, loading }) {
  const fitness = Number(todayMetrics?.fitness);
  const form = Number(todayMetrics?.form);
  if (loading) return <div style={{ height: 52, borderRadius: 12, background: '#F3F4F6' }} />;
  if (!Number.isFinite(fitness) || fitness <= 0 || !Number.isFinite(form)) {
    return (
      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
        Once your training syncs from Strava, Garmin or Apple Health, LaChart works out
        how fresh you are every day.
      </div>
    );
  }
  const status = getTsbStatus(form);
  const formRounded = Math.round(form);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: '#F7F8FA', borderRadius: 14, padding: '12px 14px',
    }}>
      <div style={{ textAlign: 'center', minWidth: 56 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: status.color, lineHeight: 1 }}>
          {formRounded > 0 ? `+${formRounded}` : formRounded}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Form
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: status.color }}>{status.label}</div>
        <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.4, marginTop: 2 }}>{status.hint}</div>
      </div>
    </div>
  );
}
