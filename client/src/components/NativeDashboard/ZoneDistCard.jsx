import React, { useState } from 'react';

const ZONES = [
  { key: 'z1', label: 'Z1', name: 'Recovery',   color: '#60A5FA' },
  { key: 'z2', label: 'Z2', name: 'Endurance',  color: '#34D399' },
  { key: 'z3', label: 'Z3', name: 'Tempo',      color: '#FBBF24' },
  { key: 'z4', label: 'Z4', name: 'Threshold',  color: '#F97316' },
  { key: 'z5', label: 'Z5', name: 'VO2max',     color: '#F43F5E' },
];

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isSameWeek(date, refDate) {
  const dow = (refDate.getDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return date >= monday && date <= sunday;
}

function isSameMonth(date, refDate) {
  return date.getFullYear() === refDate.getFullYear() && date.getMonth() === refDate.getMonth();
}

/**
 * Aggregate zone seconds from a list of activities.
 * Each activity may have a zones object like:
 *   { z1: 1800, z2: 3600, z3: 900, z4: 300, z5: 60 }
 * or a timeInZones array [{ zone:1, seconds:1800 }, ...]
 */
function aggregateZones(activities) {
  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  for (const act of activities) {
    // Try direct zones object
    if (act.zones && typeof act.zones === 'object') {
      for (let i = 1; i <= 5; i++) {
        const key = `z${i}`;
        totals[key] += Number(act.zones[key] || act.zones[`zone${i}`] || 0);
      }
      continue;
    }
    // Try timeInZones array
    if (Array.isArray(act.timeInZones)) {
      for (const tz of act.timeInZones) {
        const z = tz.zone || tz.zoneNumber;
        if (z >= 1 && z <= 5) totals[`z${z}`] += Number(tz.seconds || tz.time || 0);
      }
      continue;
    }
    // Try flat fields: zone1, zone2, ...
    for (let i = 1; i <= 5; i++) {
      const key = `z${i}`;
      totals[key] += Number(act[key] || act[`zone${i}`] || act[`Zone${i}`] || 0);
    }
  }

  return totals;
}

export default function ZoneDistCard({ activities = [] }) {
  const [range, setRange] = useState('week');
  const today = new Date();

  const filtered = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    if (range === 'week')  return isSameWeek(d, today);
    if (range === 'month') return isSameMonth(d, today);
    // 4w = last 28 days
    const cutoff = new Date(today);
    cutoff.setDate(today.getDate() - 28);
    return d >= cutoff;
  });

  const zones = aggregateZones(filtered);
  const totalSecs = Object.values(zones).reduce((s, v) => s + v, 0);
  const maxSecs   = Math.max(...Object.values(zones), 1);

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={styles.sectionLabel}>Time in Zones</span>
        <div style={styles.seg}>
          {[['week', 'Week'], ['4w', '4w'], ['month', 'Month']].map(([val, lbl]) => (
            <button
              key={val}
              style={{ ...styles.segBtn, ...(range === val ? styles.segBtnOn : {}) }}
              onClick={() => setRange(val)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {totalSecs === 0 ? (
        <div style={{ textAlign: 'center', padding: '14px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
          No zone data for this period
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ZONES.map(({ key, label, name, color }) => {
            const secs = zones[key];
            const pct  = totalSecs > 0 ? (secs / totalSecs) * 100 : 0;
            const barW = maxSecs > 0 ? (secs / maxSecs) * 100 : 0;

            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px', alignItems: 'center', gap: 8 }}>
                {/* Zone badge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, color, letterSpacing: '0.04em',
                    lineHeight: 1, textTransform: 'uppercase',
                  }}>{label}</span>
                  <span style={{ fontSize: 7.5, color: '#9CA3AF', fontWeight: 600, marginTop: 1 }}>{pct.toFixed(0)}%</span>
                </div>

                {/* Bar track */}
                <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(118,126,181,.1)', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${barW}%`,
                    borderRadius: 4,
                    background: color,
                    opacity: secs > 0 ? 1 : 0.2,
                    transition: 'width .4s ease',
                  }} />
                </div>

                {/* Time */}
                <span style={{
                  fontSize: 11, fontWeight: 700, color: secs > 0 ? '#374151' : '#D1D5DB',
                  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                }}>
                  {fmtDuration(secs)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Total */}
      {totalSecs > 0 && (
        <div style={{ borderTop: '1px solid rgba(118,126,181,.12)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(totalSecs)}</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 18,
    padding: '14px 16px',
  },
  sectionLabel: {
    fontSize: 10.5, fontWeight: 700, color: '#0A0E1A',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  seg: { display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(118,126,181,.12)' },
  segBtn: {
    border: 'none', background: 'transparent', fontFamily: 'inherit',
    fontSize: 10.5, fontWeight: 700, color: '#6B7280',
    padding: '3px 8px', borderRadius: 7, cursor: 'pointer',
  },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
};
