/**
 * WatchSensorCharts — renders the advanced BLE sensor time-series the
 * LaChart Apple Watch app captures during a workout:
 *
 *   • CORE body temperature (core + skin + HSI)
 *   • Stryd metrics (power, cadence, ground contact, vertical osc, LSS)
 *
 * Renders nothing when both series are empty so trainings imported from
 * Strava/FIT (which never carry these fields) don't grow a blank
 * "no data" block.
 *
 * Props:
 *   training: the saved Training document. Reads:
 *     - training.coreTempSeries: [{ t, core, skin, hsi }]
 *     - training.strydSeries:    [{ t, power, cadence, gct, vosc, lss }]
 *     - training.hsiPeak:        number
 */
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts';

const LC_COLORS = {
  ink:        '#0A0E1A',
  muted:      '#6B7280',
  card:       '#FFFFFF',
  border:     '#E5E7EB',
  core:       '#FF6B4A',   // coral — matches watch CORE accent
  skin:       '#7BC2EB',
  hsi:        '#F59E0B',
  power:      '#5E6590',
  cadence:    '#599FD0',
  gct:        '#7BC2EB',
  vosc:       '#F59E0B',
  lss:        '#B84238',
};

/** mm:ss formatter for X-axis ticks (t is seconds since workout start). */
function fmtMMSS(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export default function WatchSensorCharts({ training }) {
  const core = Array.isArray(training?.coreTempSeries) ? training.coreTempSeries : [];
  const stryd = Array.isArray(training?.strydSeries) ? training.strydSeries : [];
  const hsiPeak = Number(training?.hsiPeak) || 0;

  // Bail out unless at least one series has real data. Empty arrays from
  // the watch (sensor not paired) shouldn't burn vertical space.
  if (core.length === 0 && stryd.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
      {core.length > 0 && <CoreTempChart data={core} hsiPeak={hsiPeak} />}
      {stryd.length > 0 && <StrydChart data={stryd} />}
    </div>
  );
}

/* ─── CORE body temp chart ─────────────────────────────────────────── */

function CoreTempChart({ data, hsiPeak }) {
  // Compute a sensible Y-axis range so a 36-39 °C run isn't squished to
  // the bottom of a 0-40 axis (Recharts auto-axis picks 0 by default).
  const { yMin, yMax } = useMemo(() => {
    const values = data.flatMap(d => [Number(d.core) || 0, Number(d.skin) || 0]).filter(Boolean);
    if (values.length === 0) return { yMin: 34, yMax: 40 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      yMin: Math.floor((min - 0.5) * 2) / 2,
      yMax: Math.ceil((max + 0.5) * 2) / 2,
    };
  }, [data]);

  return (
    <ChartCard
      title="CORE body temperature"
      subtitle={`HSI peak: ${hsiPeak ? hsiPeak.toFixed(1) : '—'} / 10`}
      accent={LC_COLORS.core}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 12, left: 0 }}>
          <CartesianGrid stroke={LC_COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtMMSS}
            tick={{ fontSize: 11, fill: LC_COLORS.muted }}
            stroke={LC_COLORS.border}
          />
          <YAxis
            yAxisId="temp"
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: LC_COLORS.muted }}
            stroke={LC_COLORS.border}
            tickFormatter={(v) => `${v.toFixed(1)}°`}
            width={42}
          />
          <YAxis
            yAxisId="hsi"
            orientation="right"
            domain={[0, 10]}
            tick={{ fontSize: 11, fill: LC_COLORS.hsi }}
            stroke={LC_COLORS.border}
            tickFormatter={(v) => v.toFixed(0)}
            width={28}
          />
          <Tooltip
            labelFormatter={(t) => `t = ${fmtMMSS(t)}`}
            formatter={(value, name) => {
              if (name === 'HSI') return [Number(value).toFixed(1), name];
              return [`${Number(value).toFixed(1)} °C`, name];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="core"
            name="Core"
            stroke={LC_COLORS.core}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="skin"
            name="Skin"
            stroke={LC_COLORS.skin}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="hsi"
            type="monotone"
            dataKey="hsi"
            name="HSI"
            stroke={LC_COLORS.hsi}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {hsiPeak > 0 && (
            <ReferenceLine
              yAxisId="hsi"
              y={hsiPeak}
              stroke={LC_COLORS.hsi}
              strokeDasharray="3 4"
              strokeOpacity={0.5}
              label={{ value: `Peak ${hsiPeak.toFixed(1)}`, fontSize: 10, fill: LC_COLORS.hsi, position: 'right' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Stryd metrics chart ──────────────────────────────────────────── */

function StrydChart({ data }) {
  // Compute averages for the header chip — gives the user an at-a-glance
  // "how was my form" without scanning the whole curve.
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const n = data.length;
    const sum = data.reduce((acc, d) => ({
      power:   acc.power   + (Number(d.power)   || 0),
      cadence: acc.cadence + (Number(d.cadence) || 0),
      gct:     acc.gct     + (Number(d.gct)     || 0),
      vosc:    acc.vosc    + (Number(d.vosc)    || 0),
      lss:     acc.lss     + (Number(d.lss)     || 0),
    }), { power: 0, cadence: 0, gct: 0, vosc: 0, lss: 0 });
    return {
      power:   Math.round(sum.power / n),
      cadence: Math.round(sum.cadence / n),
      gct:     Math.round(sum.gct / n),
      vosc:    (sum.vosc / n).toFixed(1),
      lss:     (sum.lss / n).toFixed(1),
    };
  }, [data]);

  return (
    <ChartCard
      title="Stryd running form"
      subtitle={stats ? `Avg ${stats.power} W · ${stats.cadence} spm · GCT ${stats.gct} ms` : ''}
      accent={LC_COLORS.power}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 12, left: 0 }}>
          <CartesianGrid stroke={LC_COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtMMSS}
            tick={{ fontSize: 11, fill: LC_COLORS.muted }}
            stroke={LC_COLORS.border}
          />
          <YAxis
            yAxisId="power"
            tick={{ fontSize: 11, fill: LC_COLORS.muted }}
            stroke={LC_COLORS.border}
            tickFormatter={(v) => `${Math.round(v)}`}
            width={38}
            label={{ value: 'W', angle: 0, position: 'insideTopLeft', fontSize: 10, fill: LC_COLORS.muted }}
          />
          <YAxis
            yAxisId="cadence"
            orientation="right"
            tick={{ fontSize: 11, fill: LC_COLORS.cadence }}
            stroke={LC_COLORS.border}
            tickFormatter={(v) => `${Math.round(v)}`}
            width={32}
          />
          <Tooltip
            labelFormatter={(t) => `t = ${fmtMMSS(t)}`}
            formatter={(value, name) => {
              const fmt = {
                Power:   (v) => `${Math.round(Number(v))} W`,
                Cadence: (v) => `${Math.round(Number(v))} spm`,
                GCT:     (v) => `${Math.round(Number(v))} ms`,
                VOsc:    (v) => `${Number(v).toFixed(1)} cm`,
                LSS:     (v) => `${Number(v).toFixed(1)} kN/m`,
              };
              return [(fmt[name] || ((v) => String(v)))(value), name];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="power"   type="monotone" dataKey="power"   name="Power"   stroke={LC_COLORS.power}   strokeWidth={2}   dot={false} isAnimationActive={false} />
          <Line yAxisId="cadence" type="monotone" dataKey="cadence" name="Cadence" stroke={LC_COLORS.cadence} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="power"   type="monotone" dataKey="gct"     name="GCT"     stroke={LC_COLORS.gct}     strokeWidth={1.2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      {stats && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LC_COLORS.border}`, flexWrap: 'wrap' }}>
          <Stat label="Avg power"   value={`${stats.power} W`}        color={LC_COLORS.power} />
          <Stat label="Avg cadence" value={`${stats.cadence} spm`}    color={LC_COLORS.cadence} />
          <Stat label="GCT"         value={`${stats.gct} ms`}         color={LC_COLORS.gct} />
          <Stat label="Vert. osc."  value={`${stats.vosc} cm`}        color={LC_COLORS.vosc} />
          <Stat label="LSS"         value={`${stats.lss} kN/m`}       color={LC_COLORS.lss} />
        </div>
      )}
    </ChartCard>
  );
}

/* ─── Reusable shells ─────────────────────────────────────────────── */

function ChartCard({ title, subtitle, accent, children }) {
  return (
    <div
      style={{
        background: LC_COLORS.card,
        border: `1px solid ${LC_COLORS.border}`,
        borderRadius: 14,
        padding: '14px 16px 12px',
        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: accent }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: LC_COLORS.ink, letterSpacing: '-0.005em' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: LC_COLORS.muted, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 60 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: LC_COLORS.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
        {value}
      </span>
    </div>
  );
}
