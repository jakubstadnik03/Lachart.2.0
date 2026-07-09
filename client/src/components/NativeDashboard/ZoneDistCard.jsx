import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getMonthlyPowerAnalysis } from '../../services/api';
import { NativeSkeleton } from '../native/shared/Tiles';
import { SportGlyph } from '../shared/SportIcon';
import {
  getSportsWithZoneData,
  pickZoneTimes,
  pickZoneDefs,
  formatZoneBoundaryLabel,
  pickZoneDef,
  SPORT_LABELS,
  SPORT_ICON_COLORS,
} from '../../utils/zoneSportStats';

// ─── Zone definitions ─────────────────────────────────────────────────────────

const ZONES = [
  { key: 'z1', zNum: 1, label: 'Z1', name: 'Recovery',  color: '#60A5FA', desc: 'Very easy effort. Promotes blood flow, active recovery, and builds aerobic base with minimal fatigue.' },
  { key: 'z2', zNum: 2, label: 'Z2', name: 'Endurance', color: '#34D399', desc: 'Comfortable aerobic pace. The cornerstone of endurance development — fat oxidation, mitochondrial density.' },
  { key: 'z3', zNum: 3, label: 'Z3', name: 'Tempo',     color: '#FBBF24', desc: 'Moderate to hard. Builds lactate threshold and muscular endurance. Use sparingly alongside Z2 work.' },
  { key: 'z4', zNum: 4, label: 'Z4', name: 'Threshold', color: '#F97316', desc: 'Hard effort around LT2. Raises anaerobic threshold and improves the ability to sustain high power/pace.' },
  { key: 'z5', zNum: 5, label: 'Z5', name: 'VO2max',    color: '#F43F5E', desc: 'Maximum effort. Increases VO₂max and neuromuscular power. Short bouts only — very high recovery cost.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Returns the YYYY-MM key for the current or previous month. */
function monthKey(offset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns { startDate, endDate } for a given week offset (0 = this week, -1 = last week). */
function weekBounds(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { startDate: monday, endDate: sunday };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ZoneDistCard({ athleteId = null }) {
  const [range, setRange]           = useState('week');
  const [sport, setSport]           = useState('all');
  const [metric, setMetric]         = useState('hr'); // 'power' | 'hr' | 'pace'
  const [selectedZone, setSelectedZone] = useState(null);

  // weekData: { week: [...entries], lastweek: [...entries] }
  // monthsData: { 'YYYY-MM': entry }
  const [weekData, setWeekData]     = useState({});   // keyed by 'week' | 'lastweek'
  const [monthsData, setMonthsData] = useState({});
  const [loading, setLoading]       = useState(false);
  const fetchedKeys  = useRef(new Set()); // month keys + 'week' + 'lastweek'
  const prevSportRef = useRef(sport);

  const toggleZone = useCallback((key) => {
    setSelectedZone(prev => prev === key ? null : key);
  }, []);

  // Auto-select a sensible default metric when sport changes
  useEffect(() => {
    if (prevSportRef.current === sport) return;
    prevSportRef.current = sport;
    setSelectedZone(null);
    if (sport === 'bike')       setMetric('power');
    else if (sport === 'run')   setMetric('pace');
    else if (sport === 'swim')  setMetric('pace');
    else if (sport === 'all')   setMetric('hr');
    else                        setMetric('hr');
  }, [sport]);

  // Reset cached data when athleteId changes
  useEffect(() => {
    fetchedKeys.current = new Set();
    setWeekData({});
    setMonthsData({});
  }, [athleteId]);

  // Fetch data for the current range
  useEffect(() => {
    let cancelled = false;

    if (range === 'week' || range === 'lastweek') {
      if (fetchedKeys.current.has(range)) return;
      setLoading(true);
      const offset = range === 'lastweek' ? -1 : 0;
      const { startDate, endDate } = weekBounds(offset);
      getMonthlyPowerAnalysis(athleteId || null, null, { startDate, endDate })
        .then(raw => {
          if (cancelled) return;
          fetchedKeys.current.add(range);
          const entries = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          setWeekData(prev => ({ ...prev, [range]: entries }));
        })
        .catch(() => {
          // Don't cache failed requests — let the user switch away and back to retry
          if (!cancelled) setWeekData(prev => ({ ...prev, [range]: [] }));
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      // thismonth / lastmonth — fetch by monthKey
      const mk = range === 'thismonth' ? monthKey(0) : monthKey(-1);
      if (fetchedKeys.current.has(mk)) return;
      setLoading(true);
      getMonthlyPowerAnalysis(athleteId || null, mk)
        .then(raw => {
          if (cancelled) return;
          fetchedKeys.current.add(mk);
          const entry = Array.isArray(raw) ? raw.find(m => m.monthKey === mk) : raw;
          setMonthsData(prev => ({ ...prev, [mk]: entry || null }));
        })
        .catch(() => { if (!cancelled) fetchedKeys.current.add(mk); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }

    return () => { cancelled = true; };
  }, [range, athleteId]);

  const activeEntries = useMemo(() => {
    if (range === 'week' || range === 'lastweek') {
      return weekData[range] || [];
    }
    const mk = range === 'thismonth' ? monthKey(0) : monthKey(-1);
    return [monthsData[mk]].filter(Boolean);
  }, [range, weekData, monthsData]);

  const availableSports = useMemo(
    () => getSportsWithZoneData(activeEntries),
    [activeEntries]
  );

  useEffect(() => {
    if (!availableSports.length) return;
    const sportOk = sport === 'all' ? availableSports.length > 1 : availableSports.includes(sport);
    if (!sportOk) {
      if (availableSports.length > 1) setSport('all');
      else setSport(availableSports[0]);
    }
  }, [availableSports, sport]);

  // ── Aggregate zone totals ──────────────────────────────────────────────────

  const totals  = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let hasData   = false;
  let repMonth  = null; // most-recent entry that has data (for zone defs)

  for (const m of activeEntries) {
    if (!m) continue;
    repMonth = repMonth ?? m;
    const zt = pickZoneTimes(m, sport, metric);
    if (zt) {
      let anyNonZero = false;
      Object.keys(totals).forEach(z => {
        const v = zt[z] || 0;
        totals[z] += v;
        if (v > 0) anyNonZero = true;
      });
      if (anyNonZero) hasData = true;
    }
  }

  const totalSecs = Object.values(totals).reduce((s, v) => s + v, 0);
  const maxSecs   = Math.max(...Object.values(totals), 1);

  // Zone boundary defs for expandable tooltip
  const zoneBoundaries = repMonth ? pickZoneDefs(repMonth, sport, metric) : null;

  // Distribution label
  let distLabel = null;
  if (totalSecs > 0) {
    const pct = {};
    Object.keys(totals).forEach(k => { pct[k] = (totals[k] / totalSecs) * 100; });
    if      (pct.z1 + pct.z5 >= 80)            distLabel = { text: 'Polarized',       color: '#6366f1' };
    else if (pct.z2 >= 60)                      distLabel = { text: 'Zone 2 Focus',    color: '#22c55e' };
    else if (pct.z3 + pct.z4 >= 50)            distLabel = { text: 'Threshold-heavy', color: '#f97316' };
    else if (pct.z1 > pct.z2 && pct.z2 > pct.z3) distLabel = { text: 'Pyramidal',   color: '#f59e0b' };
  }

  // ── Available sports ───────────────────────────────────────────────────────
  const sportToggles = [
    ...(availableSports.length > 1 ? [{ key: 'all', label: 'All' }] : []),
    ...availableSports.map((key) => ({ key, label: SPORT_LABELS[key] || key })),
  ];

  // ── Available metrics for the current sport ────────────────────────────────
  const metricOptions = (() => {
    if (sport === 'bike') {
      const hasPower = activeEntries.some(m => m?.zones);
      const hasHr    = activeEntries.some(m => m?.bikeHrZones || m?.hrZones);
      const opts = [];
      if (hasPower) opts.push({ key: 'power', label: '⚡ Power' });
      if (hasHr)    opts.push({ key: 'hr',    label: '♥ HR'    });
      return opts;
    }
    if (sport === 'run') {
      const hasPace = activeEntries.some(m => m?.runningZoneTimes);
      const hasHr   = activeEntries.some(m => m?.runningHrZones || m?.sportStats?.run?.hrZones);
      const opts = [];
      if (hasPace) opts.push({ key: 'pace', label: '🏃 Pace' });
      if (hasHr)   opts.push({ key: 'hr',   label: '♥ HR'   });
      return opts;
    }
    if (sport === 'swim') {
      const hasPace = activeEntries.some(m => m?.swimmingZoneTimes);
      if (hasPace) return [{ key: 'pace', label: '🏊 Pace' }];
      return [];
    }
    if (sport !== 'all') {
      const hasHr = activeEntries.some(m => m?.sportStats?.[sport]?.hrZones);
      if (hasHr) return [{ key: 'hr', label: '♥ HR' }];
    }
    return [];
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.card}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={styles.sectionLabel}>Time in Zones</span>
          {distLabel && (
            <span
              key={distLabel.text}
              style={{
                fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
                background: distLabel.color + '18', color: distLabel.color,
                whiteSpace: 'nowrap',
                animation: 'ndPopIn .5s .25s cubic-bezier(.22,1.4,.36,1) both',
                transition: 'background .25s ease, color .25s ease',
              }}
            >
              {distLabel.text}
            </span>
          )}
        </div>
        <div style={styles.seg}>
          {[['week', 'Week'], ['lastweek', 'Last wk'], ['thismonth', 'Month'], ['lastmonth', 'Last mo']].map(([val, lbl]) => (
            <button
              key={val}
              style={{
                ...styles.segBtn,
                ...(range === val ? styles.segBtnOn : {}),
                transition: 'background .25s ease, color .25s ease, box-shadow .25s ease, transform .12s ease',
              }}
              onClick={() => { setRange(val); setSelectedZone(null); }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
              onMouseUp={e   => { e.currentTarget.style.transform = ''; }}
              onMouseLeave={e=> { e.currentTarget.style.transform = ''; }}
              onTouchStart={e=> { e.currentTarget.style.transform = 'scale(.94)'; }}
              onTouchEnd={e  => { e.currentTarget.style.transform = ''; }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Sport toggle row */}
      {sportToggles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: metricOptions.length > 1 ? 7 : 11, flexWrap: 'wrap' }}>
          {sportToggles.map(({ key, label }, idx) => {
            const on = sport === key;
            const tint = SPORT_ICON_COLORS[key] || '#6B7280';
            return (
              <button
                key={key}
                onClick={() => setSport(key)}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
                onMouseUp={e   => { e.currentTarget.style.transform = ''; }}
                onMouseLeave={e=> { e.currentTarget.style.transform = ''; }}
                onTouchStart={e=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                onTouchEnd={e  => { e.currentTarget.style.transform = ''; }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: key !== 'all' ? '4px 9px 4px 6px' : '4px 10px',
                  borderRadius: 9999,
                  border: on ? '1px solid #5E6590' : '1px solid rgba(118,126,181,.18)',
                  background: on ? '#5E6590' : 'rgba(255,255,255,.5)',
                  color: on ? '#fff' : '#6B7280',
                  fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background .25s ease, color .25s ease, border-color .25s ease, transform .12s ease',
                  animation: `ndPopIn .35s ${idx * 50}ms cubic-bezier(.22,1.4,.36,1) both`,
                }}
              >
                {key !== 'all' && (
                  <SportGlyph sport={key} size={13} color={on ? '#fff' : tint} />
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Metric toggle row — only when multiple options exist */}
      {metricOptions.length > 1 && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 11, flexWrap: 'wrap' }}>
          {metricOptions.map(({ key, label }) => {
            const on = metric === key;
            return (
              <button
                key={key}
                onClick={() => { setMetric(key); setSelectedZone(null); }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
                onMouseUp={e   => { e.currentTarget.style.transform = ''; }}
                onMouseLeave={e=> { e.currentTarget.style.transform = ''; }}
                onTouchStart={e=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                onTouchEnd={e  => { e.currentTarget.style.transform = ''; }}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: 9999,
                  border: on
                    ? '1px solid rgba(94,101,144,.5)'
                    : '1px solid rgba(118,126,181,.12)',
                  background: on
                    ? 'rgba(94,101,144,.12)'
                    : 'rgba(255,255,255,.35)',
                  color: on ? '#5E6590' : '#9CA3AF',
                  fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background .2s ease, color .2s ease, border-color .2s ease, transform .12s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <NativeSkeleton height={14} radius={6} />
              <NativeSkeleton height={7} radius={4} />
              <NativeSkeleton height={14} radius={6} />
            </div>
          ))}
        </div>
      )}

      {/* No data state */}
      {!loading && !hasData && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6"  y1="20" x2="6"  y2="14" />
            <line x1="3"  y1="20" x2="21" y2="20" />
          </svg>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>No zone data</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
            {sport === 'bike' && metric === 'power'
              ? 'Upload FIT files with power data to see power zones'
              : sport === 'all'
                ? 'Upload FIT files or complete a lactate test to enable zone tracking'
                : `No ${sport} zone data for this period`}
          </div>
        </div>
      )}

      {/* Zone bars */}
      {hasData && (
        <>
          <div
            key={`zones-${range}-${sport}-${metric}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {ZONES.map(({ key, zNum, name, color, desc }, idx) => {
              const secs     = totals[key];
              const pct      = totalSecs > 0 ? (secs / totalSecs) * 100 : 0;
              const barW     = (secs / maxSecs) * 100;
              const barDelay = idx * 60;
              const isOpen   = selectedZone === key;

              // Zone boundary from server
              const def = zoneBoundaries
                ? pickZoneDef(zoneBoundaries.defs, zNum)
                : null;
              const boundLabel = def
                ? formatZoneBoundaryLabel(zNum, def, zoneBoundaries?.defs, zoneBoundaries?.type, {
                    paceUnit: sport === 'swim' ? '/100m' : '/km',
                  })
                : null;

              // Icon in expanded panel
              const BoundIcon = () => {
                if (!zoneBoundaries) return null;
                if (zoneBoundaries.type === 'power')
                  return (
                    <svg width="10" height="11" viewBox="0 0 24 24" fill={color} stroke="none">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  );
                if (zoneBoundaries.type === 'pace')
                  return (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  );
                // HR (heart)
                return (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={color} stroke="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                );
              };

              return (
                <div key={key} style={{ animation: `ndFadeIn .4s ${barDelay}ms cubic-bezier(.22,1,.36,1) both` }}>
                  {/* Clickable row */}
                  <div
                    onClick={() => toggleZone(key)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '88px 1fr 60px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 6px',
                      borderRadius: 9,
                      cursor: 'pointer',
                      background: isOpen ? color + '12' : 'transparent',
                      transition: 'background .2s ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    {/* Label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, color,
                        width: 22, textAlign: 'center',
                        padding: '2px 0', borderRadius: 4,
                        background: color + '18', flexShrink: 0,
                      }}>
                        {key.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: isOpen ? color : '#374151',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        transition: 'color .2s ease',
                      }}>
                        {name}
                      </span>
                    </div>

                    {/* Bar */}
                    <div style={{ position: 'relative', height: 7, borderRadius: 4, background: 'rgba(118,126,181,.1)', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${barW}%`, borderRadius: 4, background: color,
                        opacity: secs > 0 ? 1 : 0,
                        transformOrigin: 'left center',
                        transition: 'width .55s cubic-bezier(.22,1,.36,1), background .25s ease',
                        animation: secs > 0 ? `ndBarWidthIn .8s ${barDelay + 60}ms cubic-bezier(.22,1,.36,1) both` : 'none',
                        '--nd-bar-w': `${barW}%`,
                      }} />
                    </div>

                    {/* Time + % */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: secs > 0 ? '#0A0E1A' : '#D1D5DB' }}>
                        {fmtDuration(secs)}
                      </span>
                      <span style={{ fontSize: 9, color: secs > 0 ? '#9CA3AF' : 'transparent', fontWeight: 600, minHeight: 11 }}>
                        {secs > 0 ? `${pct.toFixed(0)}%` : '·'}
                      </span>
                    </div>
                  </div>

                  {/* Expandable info panel */}
                  {isOpen && (
                    <div style={{
                      margin: '2px 6px 4px',
                      padding: '10px 11px',
                      borderRadius: 10,
                      background: color + '10',
                      border: `1px solid ${color}28`,
                      animation: 'ndFadeIn .22s cubic-bezier(.22,1,.36,1) both',
                    }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#374151', lineHeight: 1.45, marginBottom: (boundLabel || secs > 0) ? 8 : 0 }}>
                        {desc}
                      </p>

                      {/* Zone boundary chip */}
                      {boundLabel && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(255,255,255,.7)', borderRadius: 7, padding: '4px 8px',
                          }}>
                            <BoundIcon />
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                              {boundLabel}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Time + share stats */}
                      {secs > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 7, borderTop: `1px solid ${color}20`, display: 'flex', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(secs)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Share</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}%</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ borderTop: '1px solid rgba(118,126,181,.12)', marginTop: 10, paddingTop: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(totalSecs)}</span>
          </div>
        </>
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
    padding: '13px 14px',
  },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' },
  seg:      { display: 'inline-flex', padding: 2, borderRadius: 9, background: 'rgba(118,126,181,.12)' },
  segBtn:   { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 9, fontWeight: 700, color: '#6B7280', padding: '3px 5px', borderRadius: 7, cursor: 'pointer' },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
};
