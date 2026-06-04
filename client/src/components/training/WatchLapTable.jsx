/**
 * WatchLapTable — per-lap breakdown for trainings recorded by the LaChart
 * Apple Watch app. Each row shows the lap's pace + duration + the sensor
 * averages the watch computed at markLap() time:
 *
 *   #  Pace    Time   Dist.   HR   Power  Cad.  Core  HSI
 *   1  4:32   5:00   1.0 km  165   285 W  178   37.4  3.2
 *   2  4:28   4:58   1.0 km  170   292 W  180   37.6  4.1
 *
 * Columns auto-hide when no lap in the set has data for them (e.g. Stryd
 * column hides on a run without a power pod). Empty when `training.laps`
 * is empty — Strava/FIT trainings keep their own LapsTable.
 */
import React, { useMemo } from 'react';

const C = {
  ink:    '#0A0E1A',
  muted:  '#6B7280',
  border: '#E5E7EB',
  card:   '#FFFFFF',
  zone:   ['#9CA3AF', '#599FD0', '#4BA87D', '#F59E0B', '#E05347', '#7C3AED'],
};

function fmtPace(secPerKm) {
  const s = Math.max(0, Math.round(Number(secPerKm) || 0));
  if (s === 0) return '—';
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}
function fmtTime(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  if (s === 0) return '—';
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}
function fmtKm(metres) {
  const m = Number(metres) || 0;
  if (m === 0) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export default function WatchLapTable({ training }) {
  // Hooks must run unconditionally and in a stable order, so `laps` is memoised
  // and the empty-state early-return happens AFTER all hooks below.
  const laps = useMemo(
    () => (Array.isArray(training?.laps) ? training.laps : []),
    [training]
  );

  // Decide which columns to show based on whether at least one lap has
  // non-zero data for that sensor. Avoids 5 empty Stryd columns for a
  // run without a power pod.
  const cols = useMemo(() => ({
    hr:       laps.some(l => Number(l.avgHR)       > 0),
    power:    laps.some(l => Number(l.avgPower)    > 0),
    cadence:  laps.some(l => Number(l.avgCadence)  > 0),
    coreTemp: laps.some(l => Number(l.avgCoreTemp) > 0),
    hsi:      laps.some(l => Number(l.peakHSI)     > 0),
    distance: laps.some(l => Number(l.distance)    > 0),
  }), [laps]);

  // Compute totals/averages for the footer row.
  const totals = useMemo(() => {
    const n = laps.length;
    const sum = laps.reduce((acc, l) => ({
      time:     acc.time     + (Number(l.time)     || 0),
      distance: acc.distance + (Number(l.distance) || 0),
      hr:       acc.hr       + (Number(l.avgHR)       || 0),
      power:    acc.power    + (Number(l.avgPower)    || 0),
      cadence:  acc.cadence  + (Number(l.avgCadence)  || 0),
      core:     acc.core     + (Number(l.avgCoreTemp) || 0),
    }), { time: 0, distance: 0, hr: 0, power: 0, cadence: 0, core: 0 });
    const peakHSI = laps.reduce((m, l) => Math.max(m, Number(l.peakHSI) || 0), 0);
    return {
      time:     sum.time,
      distance: sum.distance,
      avgHR:       n ? Math.round(sum.hr      / n) : 0,
      avgPower:    n ? Math.round(sum.power   / n) : 0,
      avgCadence:  n ? Math.round(sum.cadence / n) : 0,
      avgCore:     n ? sum.core / n : 0,
      peakHSI,
    };
  }, [laps]);

  if (laps.length === 0) return null;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: '14px 16px 12px',
        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        marginTop: 16,
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: C.zone[3] }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '-0.005em' }}>
            Laps
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {laps.length} laps · {fmtTime(totals.time)} · {fmtKm(totals.distance)}
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <Th first>#</Th>
            <Th>Zone</Th>
            <Th>Pace</Th>
            <Th>Time</Th>
            {cols.distance && <Th>Dist.</Th>}
            {cols.hr       && <Th>HR</Th>}
            {cols.power    && <Th>Power</Th>}
            {cols.cadence  && <Th>Cad.</Th>}
            {cols.coreTemp && <Th>Core</Th>}
            {cols.hsi      && <Th>HSI</Th>}
          </tr>
        </thead>
        <tbody>
          {laps.map((l, i) => {
            const z = Math.max(0, Math.min(C.zone.length - 1, Number(l.zoneId) || 0));
            return (
              <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td first>{l.number || i + 1}</Td>
                <Td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.zone[z], marginRight: 4, verticalAlign: 'middle' }} />
                  Z{z}
                </Td>
                <Td>{fmtPace(l.pace)}</Td>
                <Td>{fmtTime(l.time)}</Td>
                {cols.distance && <Td>{fmtKm(l.distance)}</Td>}
                {cols.hr       && <Td>{l.avgHR ? `${l.avgHR}` : '—'}</Td>}
                {cols.power    && <Td>{l.avgPower ? `${l.avgPower} W` : '—'}</Td>}
                {cols.cadence  && <Td>{l.avgCadence ? `${l.avgCadence}` : '—'}</Td>}
                {cols.coreTemp && <Td>{l.avgCoreTemp ? `${Number(l.avgCoreTemp).toFixed(1)}°` : '—'}</Td>}
                {cols.hsi      && <Td>{l.peakHSI ? Number(l.peakHSI).toFixed(1) : '—'}</Td>}
              </tr>
            );
          })}
          {/* Footer row — averages / totals across all laps */}
          <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, color: C.ink }}>
            <Td first>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>{fmtTime(totals.time)}</Td>
            {cols.distance && <Td>{fmtKm(totals.distance)}</Td>}
            {cols.hr       && <Td>{totals.avgHR    || '—'}</Td>}
            {cols.power    && <Td>{totals.avgPower ? `${totals.avgPower} W` : '—'}</Td>}
            {cols.cadence  && <Td>{totals.avgCadence || '—'}</Td>}
            {cols.coreTemp && <Td>{totals.avgCore ? `${totals.avgCore.toFixed(1)}°` : '—'}</Td>}
            {cols.hsi      && <Td>{totals.peakHSI ? `${totals.peakHSI.toFixed(1)}*` : '—'}</Td>}
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        Footer shows averages across all laps · HSI shown as peak (marked *).
      </div>
    </div>
  );
}

function Th({ children, first }) {
  return (
    <th
      style={{
        padding: '6px 8px',
        textAlign: first ? 'left' : 'right',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, first }) {
  return (
    <td
      style={{
        padding: '8px 8px',
        textAlign: first ? 'left' : 'right',
        whiteSpace: 'nowrap',
        color: '#1F2937',
      }}
    >
      {children}
    </td>
  );
}
