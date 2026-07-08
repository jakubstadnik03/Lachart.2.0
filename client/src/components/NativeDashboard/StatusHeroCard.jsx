import React, { useState, useMemo } from 'react';
import useElementWidth from '../../hooks/useElementWidth';
import { NativeSkeleton } from '../native/shared/Tiles';
import FormFitnessHelpSheet from '../shared/FormFitnessHelpSheet';
import { getTsbStatus } from '../../utils/formFitnessMetrics';
import { computePmcFromActivities } from '../../utils/formFitnessFromActivities';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { useAuth } from '../../context/AuthProvider';

function DeltaPill({ value }) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  const isUp   = n > 0;
  const isDown = n < 0;
  const bg    = isUp ? '#ECFDF5' : isDown ? '#FEF2F2' : '#F3F4F6';
  const color = isUp ? '#047857' : isDown ? '#B84238' : '#6B7280';
  const sign  = isUp ? '▲' : isDown ? '▼' : '—';
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: '1px 5px',
      borderRadius: 9999, background: bg, color, display: 'inline-block', marginLeft: 3,
    }}>
      {sign} {Math.abs(Math.round(n))}
    </span>
  );
}

// Build SVG path from values with explicit [min,max] domain
function makePath(values, w, h, domMin, domMax, padX = 0, padY = 6) {
  if (!values || values.length < 2) return '';
  const range = domMax - domMin || 1;
  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (w - padX * 2);
    const y = padY + (1 - (v - domMin) / range) * (h - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return 'M' + pts.join(' L');
}

// y-pixel for a value given domain (used for reference lines)
function yForVal(val, h, domMin, domMax, padY = 6) {
  const range = domMax - domMin || 1;
  return padY + (1 - (val - domMin) / range) * (h - padY * 2);
}

// Read a value from a data point — API returns capitalised keys (Fitness/Form/Fatigue)
// but some legacy paths use lowercase; support both.
function readField(d, ...keys) {
  for (const k of keys) {
    const v = d[k] ?? d[k.toLowerCase()] ?? d[k.toUpperCase()];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}

export default function StatusHeroCard({
  activities = [],
  userProfile = null,
  todayMetrics = {},
  sparklineData = [],
  loading = false,
}) {
  const { user } = useAuth() || {};
  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const derived = useMemo(() => {
    if (!activities?.length || !profile) return null;
    return computePmcFromActivities(activities, profile, { tssUser: user });
  }, [activities, profile, user]);

  const effTodayMetrics = useMemo(() => {
    if (derived?.todayMetrics && activities?.length) return derived.todayMetrics;
    if (todayMetrics.fitness != null || todayMetrics.form != null || todayMetrics.fatigue != null) {
      return todayMetrics;
    }
    return derived?.todayMetrics || todayMetrics;
  }, [todayMetrics, derived, activities]);

  const effSparkline = useMemo(() => {
    if (derived?.series?.length && activities?.length) return derived.series;
    return sparklineData?.length ? sparklineData : (derived?.series || []);
  }, [sparklineData, derived, activities]);
  const [heroView, setHeroView] = useState('status');
  const [helpOpen, setHelpOpen] = useState(false);
  const [formRange, setFormRange] = useState('3m');
  // Which metric to highlight in the status sparkline
  const [statusMetric, setStatusMetric] = useState('form'); // 'fitness' | 'fatigue' | 'form'
  // Animation key — bumps when statusMetric / day changes to retrigger SVG fade-in
  const [animTick, setAnimTick] = useState(0);
  // Day offset: 0 = today, -1 = yesterday, etc. Lets the user scrub through
  // past days to see how their TSB / fitness evolved.
  const [dayOffset, setDayOffset] = useState(0);

  // Horizontal swipe to scrub days (status view only — form chart has its own
  // range toggle and shouldn't compete with it). Vertical lock so it doesn't
  // hijack page scroll. Threshold 45 px feels right on iOS — anything smaller
  // triggers on accidental thumb drags during normal scrolling.
  const swipeRef = React.useRef({ x: 0, y: 0, active: false });
  const onTouchStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    const s = swipeRef.current; if (!s.active) return;
    s.active = false;
    if (heroView !== 'status') return; // only scrub days when on Status view
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && canGoForward) { setDayOffset(o => o + 1); setAnimTick(t => t + 1); }
    else if (dx > 0 && canGoBack) { setDayOffset(o => o - 1); setAnimTick(t => t + 1); }
  };

  // Build a date → sparkline-point lookup so we can resolve metrics for any day.
  const sparkByDate = React.useMemo(() => {
    const map = {};
    (effSparkline || []).forEach(d => {
      const key = d?.date ? String(d.date).slice(0, 10) : null;
      if (key) map[key] = d;
    });
    return map;
  }, [effSparkline]);

  const today = new Date();
  const selectedDate = new Date(today);
  selectedDate.setDate(today.getDate() + dayOffset);
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const selectedKey = dateKey(selectedDate);
  const selectedPt  = sparkByDate[selectedKey];
  const isToday     = dayOffset === 0;
  // Cap forward navigation at today — we don't have future data points yet.
  const canGoForward = dayOffset < 0;
  // Cap backward navigation at the oldest sparkline point we have.
  const oldestKey = effSparkline.length > 0 ? String(effSparkline[0].date || '').slice(0, 10) : null;
  const canGoBack = !!effSparkline.length && selectedKey > oldestKey;

  const lastPt = effSparkline.length > 0 ? effSparkline[effSparkline.length - 1] : null;

  const fitness = Math.round(
    isToday
      ? (effTodayMetrics.fitness ?? (lastPt ? readField(lastPt, 'Fitness', 'fitness', 'ctl') : 0))
      : (selectedPt ? readField(selectedPt, 'Fitness', 'fitness', 'ctl') : 0)
  );
  const fatigue = Math.round(
    isToday
      ? (effTodayMetrics.fatigue ?? (lastPt ? readField(lastPt, 'Fatigue', 'fatigue', 'atl') : 0))
      : (selectedPt ? readField(selectedPt, 'Fatigue', 'fatigue', 'atl') : 0)
  );
  const form = Math.round(
    isToday
      ? (effTodayMetrics.form != null ? effTodayMetrics.form : lastPt ? readField(lastPt, 'Form', 'form', 'tsb') : 0)
      : (selectedPt ? readField(selectedPt, 'Form', 'form', 'tsb') : 0)
  );

  // Delta vs the day before the selected one (not the cached today-vs-yesterday)
  const prev = new Date(selectedDate);
  prev.setDate(selectedDate.getDate() - 1);
  const prevPt = sparkByDate[dateKey(prev)];
  const computeDelta = (curr, todayKey, prevKey) => {
    if (isToday && effTodayMetrics[todayKey] != null) return effTodayMetrics[todayKey];
    if (!prevPt) return null;
    const prevVal = readField(prevPt, prevKey[0], prevKey[1], prevKey[2]);
    return Math.round(curr - prevVal);
  };
  const fitnessDelta = computeDelta(fitness, 'fitnessChange', ['Fitness','fitness','ctl']);
  const fatigueDelta = computeDelta(fatigue, 'fatigueChange', ['Fatigue','fatigue','atl']);
  const formDelta    = computeDelta(form,    'formChange',    ['Form','form','tsb']);

  const status = getTsbStatus(form);

  // Build sparkline arrays from chartData
  // API returns: { Fitness, Fatigue, Form, dateLabel, date }
  const rangeMap = { '14d': 14, '6w': 42, '3m': 90 };
  const pts = effSparkline.slice(-rangeMap[formRange]);
  const tsbSeries = pts.map(d => readField(d, 'Form',    'form',    'tsb'));
  const ctlSeries = pts.map(d => readField(d, 'Fitness', 'fitness', 'ctl'));
  const atlSeries = pts.map(d => readField(d, 'Fatigue', 'fatigue', 'atl'));

  // ring fill % — clamp TSB to -40..+40 range, map to 0–100%
  const ringPct = Math.min(1, Math.max(0, (form + 40) / 80));
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = ringPct * circ * 0.82; // 82% of circumference = full

  // H_SPARK bumped from 52 → 120 and H_FORM 150 → 170 so both views fill
  // the card uniformly. Previously the Status sparkline sat tiny at the
  // bottom with a fat empty band above it, and toggling to Form chart
  // shifted everything around. Card minHeight stays in sync via the body
  // wrapper below.
  // Measure the real chart width so the fixed-viewBox SVGs fill the full width
  // without horizontal stretch on iPad (both the status sparkline and the form
  // chart render full-width and share this ref — only one shows at a time).
  const [wrapRef, measuredW] = useElementWidth(320);
  const H_SPARK = 72;
  const H_FORM = 128;
  const RING = 72;
  const W = measuredW > 0 ? measuredW : 320;

  // Shared y-domain for form chart: all three series + 0
  const allFormVals = [...ctlSeries, ...atlSeries, ...tsbSeries, 0];
  const domMin = Math.min(...allFormVals) - 2;
  const domMax = Math.max(...allFormVals) + 2;
  const zeroY  = yForVal(0, H_FORM, domMin, domMax, 8);

  // Date tick labels (first and last)
  const firstLabel = pts.length > 0 ? (pts[0].dateLabel || '') : '';
  const lastLabel  = pts.length > 0 ? (pts[pts.length - 1].dateLabel || '') : '';

  if (loading && !activities?.length) {
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <NativeSkeleton width={80} height={10} style={{ marginBottom: 8 }} />
            <NativeSkeleton width={124} height={18} />
          </div>
          <NativeSkeleton width={86} height={26} radius={999} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 10, alignItems: 'center' }}>
          <NativeSkeleton width={76} height={76} radius={999} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NativeSkeleton width="60%" height={12} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <NativeSkeleton height={28} radius={8} />
              <NativeSkeleton height={28} radius={8} />
              <NativeSkeleton height={28} radius={8} />
            </div>
          </div>
        </div>
        <NativeSkeleton width="100%" height={72} radius={10} style={{ marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div style={styles.card} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Inject keyframes once */}
      <style>{`
        @keyframes ndFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ndDrawLine { to { stroke-dashoffset: 0; } }
        @keyframes ndScaleIn  { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes ndSpin     { to { transform: rotate(360deg); } }
      `}</style>
      {/* Header row — date navigator on the left, view toggle on the right */}
      <div style={styles.headerRow}>
        {heroView === 'status' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <button
              onClick={() => { if (canGoBack) { setDayOffset(o => o - 1); setAnimTick(t => t + 1); } }}
              disabled={!canGoBack}
              aria-label="Previous day"
              style={{ ...dateNavBtn, opacity: canGoBack ? 1 : 0.35, cursor: canGoBack ? 'pointer' : 'not-allowed' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span style={{ ...styles.eyebrow, whiteSpace: 'nowrap' }}>
              {isToday ? 'Today' : dayOffset === -1 ? 'Yesterday' : selectedDate.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={() => { if (canGoForward) { setDayOffset(o => o + 1); setAnimTick(t => t + 1); } }}
              disabled={!canGoForward}
              aria-label="Next day"
              style={{ ...dateNavBtn, opacity: canGoForward ? 1 : 0.35, cursor: canGoForward ? 'pointer' : 'not-allowed' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {!isToday && (
              <button
                onClick={() => { setDayOffset(0); setAnimTick(t => t + 1); }}
                style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 9999,
                  background: 'rgba(118,126,181,.12)', color: '#5E6590', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', textTransform: 'uppercase', marginLeft: 2,
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                Today
              </button>
            )}
          </div>
        ) : (
          <span style={styles.eyebrow}>Form · last {formRange}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="What do Fitness, Fatigue and Form mean?"
            style={infoBtn}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <div style={styles.seg}>
            {['status', 'form'].map(v => (
              <button key={v} style={{ ...styles.segBtn, ...(heroView === v ? styles.segBtnOn : {}) }}
                onClick={() => setHeroView(v)}>
                {v === 'status' ? 'Status' : 'Form chart'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body — fixed min-height so Status ↔ Form chart toggle doesn't shrink
          or grow the surrounding layout. Picked to fit the taller of the two
          views (Form chart with H_FORM=150 + header + footer ≈ 220 px). */}
      <div style={{ minHeight: heroView === 'status' ? 168 : 188 }}>
      {heroView === 'status' ? (
        <>
          {/* Ring + compact stats */}
          <div style={{ display: 'grid', gridTemplateColumns: `${RING}px 1fr`, gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <div style={{ position: 'relative', width: RING, height: RING }}>
              <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
                <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="rgba(118,126,181,.12)" strokeWidth="6" />
                <circle
                  cx={RING / 2} cy={RING / 2} r={r}
                  fill="none"
                  stroke={status.color}
                  strokeWidth="6"
                  strokeDasharray={`${dash} 999`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                  style={{
                    transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1), stroke .35s ease',
                  }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  fontSize: 18, fontWeight: 700, color: '#0A0E1A',
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
                }}>
                  {form >= 0 ? `+${form}` : form}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', marginTop: 1 }}>TSB</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div
                key={status.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 9999,
                  background: status.color + '1f', alignSelf: 'flex-start',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.color, display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: status.color }}>{status.label}</span>
              </div>

              {/* Fitness / Fatigue / Form — one row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                {[
                  { key: 'fitness', label: 'Fitness', val: fitness, delta: fitnessDelta, color: '#3b82f6' },
                  { key: 'fatigue', label: 'Fatigue', val: fatigue, delta: fatigueDelta, color: '#9333ea' },
                  { key: 'form', label: 'Form', val: form >= 0 ? `+${form}` : form, delta: formDelta, color: status.color, isForm: true },
                ].map(({ key, label, val, delta, color, isForm }) => {
                  const on = statusMetric === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { setStatusMetric(key); setAnimTick(t => t + 1); }}
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: 4,
                        padding: '1px 0', background: 'transparent', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', position: 'relative',
                      }}
                    >
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: on ? color : '#9CA3AF',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>{label}</span>
                      <span style={{
                        fontSize: isForm ? 14 : 15, fontWeight: 700,
                        color: on ? color : '#0A0E1A',
                        fontVariantNumeric: 'tabular-nums',
                      }}>{val}</span>
                      <DeltaPill value={delta} />
                      <span style={{
                        position: 'absolute', left: 0, right: 0, bottom: -2, height: 2, borderRadius: 2,
                        background: color,
                        opacity: on ? 1 : 0,
                        transform: on ? 'scaleX(1)' : 'scaleX(0)',
                        transition: 'opacity .2s ease, transform .2s ease',
                      }} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sparkline — switches between fitness/fatigue/form with cross-fade */}
          {(() => {
            // Pick the right series for the selected metric
            const series = statusMetric === 'fitness' ? ctlSeries
                         : statusMetric === 'fatigue' ? atlSeries
                         : tsbSeries;
            if (!series || series.length < 2) return null;
            const seriesColor = statusMetric === 'fitness' ? '#3b82f6'
                              : statusMetric === 'fatigue' ? '#9333ea'
                              : status.color;
            const showZero = statusMetric === 'form';
            const spMin = Math.min(...series, showZero ? 0 : Math.min(...series)) - 2;
            const spMax = Math.max(...series, showZero ? 0 : Math.max(...series)) + 2;
            const spZeroY = yForVal(0, H_SPARK, spMin, spMax, 4);
            const path  = makePath(series, W, H_SPARK, spMin, spMax, 0, 4);
            const baseY = showZero ? spZeroY : H_SPARK;
            const gradId = `ndspark-${statusMetric}`;

            return (
              <div
                key={animTick}
                ref={wrapRef}
                style={{
                  marginTop: 2,
                  animation: 'ndFadeIn .4s cubic-bezier(.22,1,.36,1) both',
                }}
              >
                <svg viewBox={`0 0 ${W} ${H_SPARK}`} preserveAspectRatio="none"
                  style={{ width: '100%', height: H_SPARK, display: 'block' }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor={seriesColor} stopOpacity=".28" />
                      <stop offset="1" stopColor={seriesColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {showZero && (
                    <line x1="0" y1={spZeroY} x2={W} y2={spZeroY}
                      stroke="rgba(10,14,26,.1)" strokeDasharray="2 3" />
                  )}
                  <path
                    d={`${path} L ${W} ${baseY} L 0 ${baseY} Z`}
                    fill={`url(#${gradId})`}
                    style={{ animation: 'ndFadeIn .5s cubic-bezier(.22,1,.36,1) both' }}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={seriesColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 1000,
                      strokeDashoffset: 1000,
                      animation: 'ndDrawLine .9s cubic-bezier(.22,1,.36,1) forwards',
                    }}
                  />
                </svg>
              </div>
            );
          })()}
        </>
      ) : (
        <>
          {/* Form chart header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { l: 'CTL', v: fitness, c: '#3b82f6' },
                { l: 'ATL', v: fatigue, c: '#9333ea' },
                { l: 'TSB', v: form,    c: '#f97316' },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <span style={{ fontSize: 8.5, color: '#6B7280', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{l}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                    {l === 'TSB' && v >= 0 ? `+${v}` : v}
                  </span>
                </div>
              ))}
            </div>
            <div style={styles.seg}>
              {['14d', '6w', '3m'].map(r2 => (
                <button key={r2} style={{ ...styles.segBtnSm, ...(formRange === r2 ? styles.segBtnOn : {}) }}
                  onClick={() => setFormRange(r2)}>{r2}</button>
              ))}
            </div>
          </div>

          {ctlSeries.length >= 2 ? (
            <>
              <div ref={wrapRef} style={{ width: '100%' }}>
              <svg
                key={`form-${formRange}`}
                viewBox={`0 0 ${W} ${H_FORM}`} preserveAspectRatio="none"
                style={{
                  width: '100%', height: H_FORM, display: 'block',
                  animation: 'ndFadeIn .35s cubic-bezier(.22,1,.36,1) both',
                }}>
                <defs>
                  <linearGradient id="ndctl-g" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#3b82f6" stopOpacity=".18" />
                    <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="ndtsb-g2" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#f97316" stopOpacity=".15" />
                    <stop offset="1" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="ndAboveZero">
                    <rect x="0" y="0" width={W} height={zeroY} />
                  </clipPath>
                  <clipPath id="ndBelowZero">
                    <rect x="0" y={zeroY} width={W} height={H_FORM - zeroY} />
                  </clipPath>
                </defs>

                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map(f => (
                  <line key={f} x1="0" y1={H_FORM * f} x2={W} y2={H_FORM * f}
                    stroke="rgba(10,14,26,.04)" strokeDasharray="2 4" />
                ))}

                {/* Zero reference line */}
                <line x1="0" y1={zeroY} x2={W} y2={zeroY}
                  stroke="rgba(10,14,26,.14)" strokeDasharray="3 4" />

                {/* CTL fill + line — animated draw */}
                <path d={makePath(ctlSeries, W, H_FORM, domMin, domMax, 0, 8) + ` L ${W} ${H_FORM} L 0 ${H_FORM} Z`}
                  fill="url(#ndctl-g)"
                  style={{ animation: 'ndFadeIn .5s ease both' }}
                />
                <path d={makePath(ctlSeries, W, H_FORM, domMin, domMax, 0, 8)}
                  fill="none" stroke="#3b82f6" strokeWidth="2"
                  style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'ndDrawLine 1.1s cubic-bezier(.22,1,.36,1) forwards' }}
                />

                <path d={makePath(atlSeries, W, H_FORM, domMin, domMax, 0, 8)}
                  fill="none" stroke="#9333ea" strokeWidth="1.6" strokeDasharray="4 3"
                  style={{ animation: 'ndFadeIn .8s .15s ease both' }}
                />

                <path
                  d={makePath(tsbSeries, W, H_FORM, domMin, domMax, 0, 8) + ` L ${W} ${zeroY} L 0 ${zeroY} Z`}
                  fill="rgba(34,197,94,.15)" clipPath="url(#ndAboveZero)"
                  style={{ animation: 'ndFadeIn .6s .2s ease both' }}
                />
                <path
                  d={makePath(tsbSeries, W, H_FORM, domMin, domMax, 0, 8) + ` L ${W} ${zeroY} L 0 ${zeroY} Z`}
                  fill="rgba(239,68,68,.12)" clipPath="url(#ndBelowZero)"
                  style={{ animation: 'ndFadeIn .6s .2s ease both' }}
                />
                <path d={makePath(tsbSeries, W, H_FORM, domMin, domMax, 0, 8)}
                  fill="none" stroke="#f97316" strokeWidth="2.2"
                  style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'ndDrawLine 1.2s .15s cubic-bezier(.22,1,.36,1) forwards' }}
                />
              </svg>
              </div>

              {/* X-axis date labels */}
              {firstLabel && lastLabel && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span style={{ fontSize: 9.5, color: '#9CA3AF', fontWeight: 600 }}>{firstLabel}</span>
                  <span style={{ fontSize: 9.5, color: '#9CA3AF', fontWeight: 600 }}>{lastLabel}</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No data yet</span>
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'center' }}>
            {[['#3b82f6', 'CTL (Fitness)', false], ['#9333ea', 'ATL (Fatigue)', true], ['#f97316', 'TSB (Form)', false]].map(([c, l, dashed]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#6B7280', fontWeight: 600 }}>
                <span style={{
                  display: 'inline-block', width: 12, height: 2, borderRadius: 1,
                  background: dashed ? 'transparent' : c,
                  borderTop: dashed ? `2px dashed ${c}` : 'none',
                }} />
                {l}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              style={{
                marginLeft: 'auto', border: 'none', background: 'transparent', padding: 0,
                fontSize: 10, fontWeight: 700, color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Learn more
            </button>
          </div>
        </>
      )}
      </div>

      <FormFitnessHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// Compact circular chevron button used by the day navigator at the top.
const infoBtn = {
  width: 28, height: 28, borderRadius: '50%',
  background: 'rgba(118,126,181,.1)', border: 'none',
  color: '#5E6590', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, flexShrink: 0, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
};

const dateNavBtn = {
  width: 22, height: 22, borderRadius: '50%',
  background: 'rgba(118,126,181,.12)', border: 'none',
  color: '#5E6590', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, flexShrink: 0,
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
};

const styles = {
  card: {
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 22,
    padding: '12px 14px',
    marginBottom: 0,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B7280' },
  seg: { display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(118,126,181,.12)' },
  segBtn: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#6B7280', padding: '4px 10px', borderRadius: 8, cursor: 'pointer' },
  segBtnSm: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, color: '#6B7280', padding: '4px 9px', borderRadius: 8, cursor: 'pointer' },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
};
