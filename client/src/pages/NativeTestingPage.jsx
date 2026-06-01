import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  GlassCard, SectionTitle, SportTile,
  normSport, SPORT_TINT, SPORT_ICONS, NativeSkeletonRows,
} from '../components/native/shared/Tiles';
import {
  NATIVE_DASHBOARD_KEYFRAMES, cardEntry,
} from '../components/NativeDashboard/animations';
import { getTestingsByAthleteId } from '../services/api';
import { calculateZonesFromTest } from '../components/Testing-page/zoneCalculator';
// Reuse the same threshold algorithm DataTable / LactateCurveCalculator use on
// desktop so LT1/LT2 shown on mobile cards stay in sync with the values on
// the actual test page.
import { calculateThresholds as desktopCalculateThresholds } from '../components/Testing-page/DataTable';
import NewTestSheet from '../components/NativeDashboard/NewTestSheet';
import LT2TrendSparkline from '../components/DashboardPage/LT2TrendSparkline';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtMmol(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Number(v).toFixed(1)} mmol`;
}

function fmtRelativeDate(date) {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isPaceSport(s) { return s === 'run' || s === 'swim'; }

// Zone metadata for the comparison zones table.
// `zones` returned by calculateZonesFromTest() has shape { power: { zone1: {min,max} ... }, heartRate: {...} }
// or { pace: { zone1: {min,max} ... }, heartRate: {...} } for run/swim.
const ZONE_DEFS = [
  { key: 'z1', zoneKey: 'zone1', name: 'Recovery',  color: '#60A5FA' },
  { key: 'z2', zoneKey: 'zone2', name: 'Endurance', color: '#34D399' },
  { key: 'z3', zoneKey: 'zone3', name: 'Tempo',     color: '#FBBF24' },
  { key: 'z4', zoneKey: 'zone4', name: 'Threshold', color: '#F97316' },
  { key: 'z5', zoneKey: 'zone5', name: 'VO2max',    color: '#F43F5E' },
];

function zoneVal(zones, zKey, isPace) {
  if (!zones) return '—';
  const root = isPace ? zones.pace : zones.power;
  const zoneKey = ZONE_DEFS.find(z => z.key === zKey)?.zoneKey;
  if (!root || !zoneKey || !root[zoneKey]) return '—';
  const r = root[zoneKey];
  if (isPace) return `${r.min}–${r.max}`;
  return `${r.min}–${r.max} W`;
}

function fmtThreshold(value, sport) {
  if (value == null) return '—';
  return isPaceSport(sport) ? fmtPace(value) : `${Math.round(value)} W`;
}

// Threshold extraction (same algorithm as ThresholdHistory.jsx + LastTestCard)
function extractThresholds(test) {
  if (!test) return null;
  const sport = normSport(test.sport);
  const isPace = isPaceSport(sport);
  const ov = test.thresholdOverrides || {};
  let lt1 = ov.LTP1 != null ? Number(ov.LTP1) : null;
  let lt2 = ov.LTP2 != null ? Number(ov.LTP2) : null;
  let lt1Lac = ov.LTP1_lactate != null ? Number(ov.LTP1_lactate) : null;
  let lt2Lac = ov.LTP2_lactate != null ? Number(ov.LTP2_lactate) : null;
  let lt1Hr  = ov.LTP1_hr      != null ? Number(ov.LTP1_hr)      : null;
  let lt2Hr  = ov.LTP2_hr      != null ? Number(ov.LTP2_hr)      : null;

  const pts = (Array.isArray(test.results) ? test.results : [])
    .map(r => ({
      x:  Number(String(r.power ?? r.interval ?? '').replace(',', '.')),
      y:  Number(String(r.lactate ?? '').replace(',', '.')),
      hr: Number(String(r.heartRate ?? '').replace(',', '.')),
    }))
    .filter(p => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);

  // Use the exact same algorithm DataTable / LactateCurveCalculator use on
  // desktop (D-max / IAT-style refinement with sport-specific guards) so
  // the LT1/LT2 numbers shown on the mobile test card match the values
  // visible on the test's actual page. Override values from
  // test.thresholdOverrides still win — same as desktop.
  try {
    const desktopThr = desktopCalculateThresholds(test);
    if (desktopThr) {
      const dLt1 = Number(desktopThr.LTP1);
      const dLt2 = Number(desktopThr.LTP2);
      const dLt1La = Number(desktopThr.lactates?.LTP1);
      const dLt2La = Number(desktopThr.lactates?.LTP2);
      const dLt1Hr = Number(desktopThr.heartRates?.LTP1);
      const dLt2Hr = Number(desktopThr.heartRates?.LTP2);
      if (lt1 == null && Number.isFinite(dLt1) && dLt1 > 0) lt1 = dLt1;
      if (lt2 == null && Number.isFinite(dLt2) && dLt2 > 0) lt2 = dLt2;
      if (lt1Lac == null && Number.isFinite(dLt1La) && dLt1La > 0) lt1Lac = dLt1La;
      if (lt2Lac == null && Number.isFinite(dLt2La) && dLt2La > 0) lt2Lac = dLt2La;
      if (lt1Hr  == null && Number.isFinite(dLt1Hr) && dLt1Hr > 0) lt1Hr  = Math.round(dLt1Hr);
      if (lt2Hr  == null && Number.isFinite(dLt2Hr) && dLt2Hr > 0) lt2Hr  = Math.round(dLt2Hr);
    }
  } catch (e) {
    // Desktop helper throws on degenerate tests — silently fall through to
    // the simple interpolation below so the card still shows something
    // instead of '—'.
  }

  // Fallback for very small / malformed tests where the desktop algorithm
  // returned nothing: simple linear interpolation at base + 1.5 (LT1) and
  // max(4.0, base + 3.0) (LT2). Keeps behaviour identical to the prior
  // mobile implementation for those edge cases.
  if ((lt1 == null || lt2 == null) && pts.length >= 3) {
    pts.sort((a, b) => isPace ? b.x - a.x : a.x - b.x);
    const base = Number(test.baseLactate) || pts[0]?.y || 1.0;
    const lt1T = base + 1.5;
    const lt2T = Math.max(4.0, base + 3.0);
    const interp = (target) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a.y - target) * (b.y - target) <= 0) {
          const t = (target - a.y) / (b.y - a.y || 1);
          const x = Math.round((a.x + t * (b.x - a.x)) * 10) / 10;
          const hr = (Number.isFinite(a.hr) && Number.isFinite(b.hr) && a.hr > 0 && b.hr > 0)
            ? Math.round(a.hr + t * (b.hr - a.hr))
            : null;
          return { x, hr };
        }
      }
      return null;
    };
    if (lt1 == null) {
      const r = interp(lt1T);
      if (r) { lt1 = r.x; lt1Hr = lt1Hr ?? r.hr; lt1Lac = lt1Lac ?? lt1T; }
    } else if (lt1Hr == null) {
      const r = interp(lt1T);
      if (r?.hr) lt1Hr = r.hr;
    }
    if (lt2 == null) {
      const r = interp(lt2T) || interp(4.0);
      if (r) { lt2 = r.x; lt2Hr = lt2Hr ?? r.hr; lt2Lac = lt2Lac ?? 4.0; }
    } else if (lt2Hr == null) {
      const r = interp(lt2T) || interp(4.0);
      if (r?.hr) lt2Hr = r.hr;
    }
  }

  return {
    sport, isPace,
    lt1, lt2, lt1Lac, lt2Lac, lt1Hr, lt2Hr,
    baseLactate: Number(test.baseLactate) || (pts[0]?.y ?? null),
    peakLactate: pts.length ? Math.max(...pts.map(p => p.y)) : null,
    points: pts,
    stagesCount: pts.length,
    isReviewed: !!(ov.LTP1 || ov.LTP2),
  };
}

// ─── lactate curve (smooth Bezier) ────────────────────────────────────────────

function LactateCurve({ thresholds }) {
  if (!thresholds || !thresholds.points || thresholds.points.length < 2) {
    return <div style={{ height: 140, color: '#9CA3AF', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No curve data</div>;
  }
  const W = 320, H = 140, padX = 16, padY = 14;

  // Sort by pixel-x (ascending) so the line path connects smoothly left→right.
  // For PACE sports we want SLOWER (higher seconds/km) on the LEFT and FASTER
  // (lower seconds/km) on the RIGHT — so we invert the x mapping below.
  const pts = [...thresholds.points].sort((a, b) =>
    thresholds.isPace ? b.x - a.x : a.x - b.x
  );
  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMax = Math.max(...pts.map(p => p.y), 5) * 1.1;

  // For pace: bigger seconds/km value = slower = LEFT side of chart
  const px = (x) => thresholds.isPace
    ? padX + ((xMax - x) / (xMax - xMin || 1)) * (W - padX * 2)
    : padX + ((x - xMin) / (xMax - xMin || 1)) * (W - padX * 2);
  const py = (y) => H - padY - (y / yMax) * (H - padY * 2);

  const xy = pts.map(p => [px(p.x), py(p.y)]);
  const linePath = xy.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px0, py0] = xy[i - 1];
    const cx = (px0 + x) / 2;
    return `${acc} C${cx},${py0} ${cx},${y} ${x},${y}`;
  }, '');
  const fillPath = `${linePath} L ${xy[xy.length - 1][0]},${H - padY} L ${xy[0][0]},${H - padY} Z`;

  const lt1X = thresholds.lt1 != null ? px(thresholds.lt1) : null;
  const lt2X = thresholds.lt2 != null ? px(thresholds.lt2) : null;

  // 4 mmol horizontal reference
  const fourMmolY = py(4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id="ntp-curve" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5E6590" stopOpacity=".18" />
          <stop offset="1" stopColor="#5E6590" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* X baseline */}
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY}
        stroke="rgba(118,126,181,.18)" />

      {/* 4 mmol horizontal reference */}
      {fourMmolY > padY && fourMmolY < H - padY && (
        <line x1={padX} y1={fourMmolY} x2={W - padX} y2={fourMmolY}
          stroke="rgba(224,83,71,.25)" strokeDasharray="2 4" />
      )}

      {/* Threshold guides */}
      {lt1X != null && (
        <line x1={lt1X} y1={padY} x2={lt1X} y2={H - padY}
          stroke="#4BA87D" strokeWidth="1.2" strokeDasharray="3 4"
          style={{ animation: 'ndFadeIn .4s .25s ease both' }} />
      )}
      {lt2X != null && (
        <line x1={lt2X} y1={padY} x2={lt2X} y2={H - padY}
          stroke="#E05347" strokeWidth="1.2" strokeDasharray="3 4"
          style={{ animation: 'ndFadeIn .4s .35s ease both' }} />
      )}

      {/* Fill + curve */}
      <path d={fillPath} fill="url(#ntp-curve)" style={{ animation: 'ndFadeIn .55s ease both' }} />
      <path d={linePath} fill="none" stroke="#5E6590" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round"
        style={{
          strokeDasharray: 1200, strokeDashoffset: 1200,
          animation: 'ndDrawLine 1.05s cubic-bezier(.22,1,.36,1) forwards',
        }} />

      {/* Data points */}
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#fff" stroke="#5E6590" strokeWidth="1.5"
          style={{ animation: `ndPopIn .35s ${320 + i * 40}ms cubic-bezier(.22,1.4,.36,1) both` }} />
      ))}
    </svg>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NativeTestingPage({ user, athleteId: externalAthleteId }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const testIdFromUrl = searchParams.get('testId');

  const athleteId = externalAthleteId || user?._id || user?.id;

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  // Default to 'bike' so the page lands on the latest bike test on first open;
  // the toggle below lets the user switch to 'run'. Tests list is filtered to
  // the active sport, and the most-recent test in that sport is auto-selected.
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTestId, setSelectedTestId] = useState(testIdFromUrl || null);
  // Compare mode: tap to multi-select up to 2 tests, page shows side-by-side comparison
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]); // array of test ids, max 2

  // New-test bottom sheet — opens when user taps "+ New"
  const [newSheetOpen, setNewSheetOpen] = useState(false);

  const toggleCompare = (id) => {
    setCompareIds(prev => {
      const has = prev.some(x => String(x) === String(id));
      if (has) return prev.filter(x => String(x) !== String(id));
      if (prev.length >= 2) return [prev[1], id]; // drop oldest, add new
      return [...prev, id];
    });
  };
  const clearCompare = () => { setCompareIds([]); setCompareMode(false); };

  // Load tests
  useEffect(() => {
    if (!athleteId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getTestingsByAthleteId(athleteId)
      .then(data => {
        if (!active) return;
        const arr = Array.isArray(data) ? data : (data?.data || []);
        setTests(arr);
        // If URL has testId and we don't have it loaded, keep selection
        if (testIdFromUrl && !arr.find(t => String(t._id || t.id) === String(testIdFromUrl))) {
          setSelectedTestId(null);
        }
      })
      .catch(() => active && setTests([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL testId to selection when it changes externally
  useEffect(() => {
    if (testIdFromUrl) setSelectedTestId(testIdFromUrl);
  }, [testIdFromUrl]);

  // Auto-select the latest test for the active sport when no URL-driven
  // selection exists. Runs when tests load or when the user flips the sport
  // toggle — so "Bike" lands on the newest bike test, "Run" lands on the
  // newest run test, etc.
  useEffect(() => {
    if (testIdFromUrl) return;
    if (selectedSport === 'all') return;
    const newestForSport = tests
      .filter(t => normSport(t.sport) === selectedSport)
      .sort((a, b) => new Date(b.date || b.testDate || 0) - new Date(a.date || a.testDate || 0))[0];
    if (newestForSport) {
      const id = String(newestForSport._id || newestForSport.id);
      if (id !== String(selectedTestId)) setSelectedTestId(id);
    } else {
      setSelectedTestId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, selectedSport, testIdFromUrl]);

  // ── Filter tests by sport ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tests.slice().sort((a, b) =>
      new Date(b.date || b.testDate || 0) - new Date(a.date || a.testDate || 0)
    );
    if (selectedSport !== 'all') {
      list = list.filter(t => normSport(t.sport) === selectedSport);
    }
    return list;
  }, [tests, selectedSport]);

  // Sport availability for the toggle row
  const sportsAvailable = useMemo(() => {
    const s = new Set();
    tests.forEach(t => {
      const sp = normSport(t.sport);
      if (sp !== 'other') s.add(sp);
    });
    return [...s];
  }, [tests]);

  const selected = useMemo(() => {
    if (!selectedTestId) return null;
    return tests.find(t => String(t._id || t.id) === String(selectedTestId)) || null;
  }, [tests, selectedTestId]);

  const selectedTh = selected ? extractThresholds(selected) : null;

  const onSelectTest = (testId) => {
    setSelectedTestId(testId);
    const next = new URLSearchParams(searchParams);
    if (testId) next.set('testId', String(testId));
    else next.delete('testId');
    setSearchParams(next, { replace: true });
  };

  // Scroll-snap so each card lands cleanly under the top bar when scrolling.
  // The page header is ALSO a snap point — that way scrolling to the very top
  // is reachable; otherwise proximity-snap would always pull you back to the
  // first card and the header would feel "stuck".
  const pageRef = useRef(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    const prev = {
      st: node.style.scrollSnapType,
      sp: node.style.scrollPaddingTop,
      sb: node.style.scrollBehavior,
    };
    node.style.scrollSnapType   = 'y proximity';
    node.style.scrollPaddingTop = '8px';
    node.style.scrollBehavior   = 'smooth';
    node.scrollTop = 0;
    return () => {
      node.style.scrollSnapType   = prev.st || '';
      node.style.scrollPaddingTop = prev.sp || '';
      node.style.scrollBehavior   = prev.sb || '';
    };
  }, []);
  const snap = { scrollSnapAlign: 'start', scrollSnapStop: 'normal' };

  // ── Sport sub-card (Bike / Run / Swim toggle) ─────────────────────────────
  const sportToggles = ['all', ...sportsAvailable];

  return (
    <>
      <style>{NATIVE_DASHBOARD_KEYFRAMES}</style>
      <div ref={pageRef} style={styles.page}>
        {/* ─── Greeting / header ─── */}
        <div style={{ ...styles.header, ...cardEntry(0), ...snap }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.title}>Lab tests</div>
            <div style={styles.subtitle}>
              {tests.length} test{tests.length !== 1 ? 's' : ''}
              {tests.length > 0 && (() => {
                const newest = filtered[0] || tests[0];
                if (!newest) return null;
                return ` · last ${fmtRelativeDate(newest.date || newest.testDate || 0)}`;
              })()}
            </div>
          </div>
          <button
            onClick={() => setNewSheetOpen(true)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            style={styles.newBtn}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        </div>

        <div style={styles.body}>
          {/* ─── Bike / Run sport switch at the top — flips which test is
              auto-selected below and which sport feeds LT2TrendSparkline. ─── */}
          <div style={{ ...cardEntry(1), ...snap, display: 'flex', gap: 8, padding: '4px 4px 0' }}>
            {['bike', 'run'].map((sp) => {
              const on = selectedSport === sp;
              const hasTests = tests.some(t => normSport(t.sport) === sp);
              return (
                <button
                  key={sp}
                  onClick={() => setSelectedSport(sp)}
                  disabled={!hasTests && !on}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 12,
                    fontSize: 13, fontWeight: 700,
                    background: on ? '#5E6590' : 'rgba(255,255,255,.6)',
                    color: on ? '#fff' : (hasTests ? '#5E6590' : '#C7CAD3'),
                    border: `1px solid ${on ? '#5E6590' : 'rgba(118,126,181,.18)'}`,
                    backdropFilter: 'blur(8px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(8px) saturate(160%)',
                    textTransform: 'capitalize',
                    cursor: hasTests || on ? 'pointer' : 'default',
                    transition: 'background .15s ease, color .15s ease',
                  }}
                >
                  {sp}
                </button>
              );
            })}
          </div>

          {/* ─── LT2 Trend — same component as PC dashboard, sport-synced. ───
              Hidden when the athlete has fewer than 2 tests of the currently
              selected sport — a single-point "trend" reads as broken UX, and
              the empty-state copy ("Enter more tests…") added vertical noise
              for new users who only have one test logged. */}
          {(() => {
            const sportTestCount = (Array.isArray(tests) ? tests : []).filter(t => {
              const s = String(t?.sport || '').toLowerCase();
              return selectedSport === 'all' ? true : s === selectedSport;
            }).length;
            if (sportTestCount < 2) return null;
            return (
              <div style={{ ...cardEntry(2), ...snap }}>
                <LT2TrendSparkline tests={tests} sport={selectedSport} />
              </div>
            );
          })()}

          {/* ─── Selected test (top) — shows curve + KPIs when one is picked ─── */}
          {selected && selectedTh && (
            <div style={{ ...cardEntry(1), ...snap }}>
              <GlassCard>
                <div key={`sel-${selected._id || selected.id}`}>
                  {/* Header row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 11,
                    animation: 'ndFadeIn .35s cubic-bezier(.22,1,.36,1) both',
                  }}>
                    <SportTile sport={selectedTh.sport} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.testTitle}>
                        {selected.title || `${selectedTh.sport.charAt(0).toUpperCase() + selectedTh.sport.slice(1)} test`}
                      </div>
                      <div style={styles.testMeta}>
                        {new Date(selected.date || selected.testDate || 0).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {selectedTh.stagesCount ? ` · ${selectedTh.stagesCount} stages` : ''}
                      </div>
                    </div>
                    {selectedTh.isReviewed && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700,
                        padding: '3px 8px', borderRadius: 9999,
                        background: '#ECFDF5', color: '#047857',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        animation: 'ndPopIn .5s .3s cubic-bezier(.22,1.4,.36,1) both',
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Reviewed
                      </span>
                    )}
                  </div>

                  {/* Curve */}
                  <LactateCurve thresholds={selectedTh} />

                  {/* LT1 / LT2 — rich tiles with lactate + HR sub-info */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                    marginTop: 11, marginBottom: 6,
                  }}>
                    {[
                      {
                        lbl: 'LT1',
                        val: fmtThreshold(selectedTh.lt1, selectedTh.sport),
                        col: '#4BA87D',
                        lac: selectedTh.lt1Lac,
                        hr:  selectedTh.lt1Hr,
                      },
                      {
                        lbl: 'LT2',
                        val: fmtThreshold(selectedTh.lt2, selectedTh.sport),
                        col: '#E05347',
                        lac: selectedTh.lt2Lac,
                        hr:  selectedTh.lt2Hr,
                      },
                    ].map(({ lbl, val, col, lac, hr }, idx) => (
                      <div key={lbl} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                        padding: '8px 10px', borderRadius: 11,
                        background: col + '0F',
                        border: `1px solid ${col}26`,
                        animation: `ndPopIn .45s ${idx * 70}ms cubic-bezier(.22,1.4,.36,1) both`,
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: col,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>{lbl}</span>
                        <span style={{
                          fontSize: 16, fontWeight: 800, color: '#0A0E1A',
                          fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
                          letterSpacing: '-0.01em',
                        }}>{val}</span>
                        {(lac != null || hr != null) && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            marginTop: 2, fontSize: 10, fontWeight: 600, color: '#6B7280',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {lac != null && (
                              <span>
                                <span style={{ color: col, fontWeight: 700 }}>{Number(lac).toFixed(1)}</span>
                                <span style={{ color: '#9CA3AF' }}> mmol</span>
                              </span>
                            )}
                            {lac != null && hr != null && (
                              <span style={{ color: '#D1D5DB' }}>·</span>
                            )}
                            {hr != null && (
                              <span>
                                <span style={{ color: '#0A0E1A', fontWeight: 700 }}>{hr}</span>
                                <span style={{ color: '#9CA3AF' }}> bpm</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Base LA · Peak LA — small secondary chips */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                    marginBottom: 11,
                  }}>
                    {[
                      { lbl: 'Base LA', val: fmtMmol(selectedTh.baseLactate) },
                      { lbl: 'Peak LA', val: fmtMmol(selectedTh.peakLactate) },
                    ].map(({ lbl, val }, idx) => (
                      <div key={lbl} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                        padding: '6px 10px', borderRadius: 9,
                        background: 'rgba(255,255,255,.5)',
                        border: '1px solid rgba(118,126,181,.12)',
                        animation: `ndPopIn .4s ${(idx + 2) * 70}ms cubic-bezier(.22,1.4,.36,1) both`,
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: '#9CA3AF',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>{lbl}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: '#0A0E1A',
                          fontVariantNumeric: 'tabular-nums',
                        }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Training zones — derived from this test's thresholds */}
                  {(() => {
                    const zones = calculateZonesFromTest(selected);
                    if (!zones) return null;
                    const isPace = isPaceSport(selectedTh.sport);
                    const root = isPace ? zones.pace : zones.power;
                    const hr = zones.heartRate;
                    if (!root && !hr) return null;
                    const primaryHeader = isPace ? 'Pace' : 'Power';
                    return (
                      <div style={{
                        marginBottom: 11,
                        padding: '8px 10px',
                        borderRadius: 11,
                        background: 'rgba(255,255,255,.5)',
                        border: '1px solid rgba(118,126,181,.12)',
                        animation: 'ndPopIn .45s 280ms cubic-bezier(.22,1.4,.36,1) both',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          marginBottom: 6,
                        }}>
                          <SectionTitle>Training zones</SectionTitle>
                        </div>
                        {/* Header */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '52px 1fr 1fr',
                          gap: 6,
                          padding: '0 0 4px',
                          borderBottom: '1px solid rgba(118,126,181,.1)',
                          fontSize: 8.5, fontWeight: 800, color: '#9CA3AF',
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          <span>Zone</span>
                          <span style={{ textAlign: 'right' }}>{primaryHeader}</span>
                          <span style={{ textAlign: 'right' }}>HR</span>
                        </div>
                        {ZONE_DEFS.map((z, i) => {
                          const primary = root && root[z.zoneKey]
                            ? (isPace
                              ? `${root[z.zoneKey].min}–${root[z.zoneKey].max}`
                              : `${root[z.zoneKey].min}–${root[z.zoneKey].max} W`)
                            : '—';
                          const hrCell = hr && hr[z.zoneKey]
                            ? `${hr[z.zoneKey].min}–${hr[z.zoneKey].max}`
                            : '—';
                          return (
                            <div key={z.key} style={{
                              display: 'grid',
                              gridTemplateColumns: '52px 1fr 1fr',
                              gap: 6, alignItems: 'center',
                              padding: '5px 0',
                              borderBottom: i < ZONE_DEFS.length - 1
                                ? '1px solid rgba(118,126,181,.07)'
                                : 'none',
                              animation: `ndFadeIn .35s ${i * 35}ms cubic-bezier(.22,1,.36,1) both`,
                            }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 800, color: z.color,
                              }}>
                                <span style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: z.color, flexShrink: 0,
                                }} />
                                Z{i + 1}
                              </span>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: '#0A0E1A',
                                fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                              }}>{primary}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: '#B84238',
                                fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                              }}>{hrCell}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Open in full editor */}
                  <button
                    onClick={() => navigate(`/testing?testId=${encodeURIComponent(selected._id || selected.id)}&full=1`)}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
                    onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                    onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                    onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
                    onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                    style={styles.openBtn}
                  >
                    Open full data
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </GlassCard>
            </div>
          )}

          {/* ─── Sport filter ─── */}
          {sportsAvailable.length > 1 && (
            <div style={{ ...cardEntry(2), ...snap }}>
              <GlassCard style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <SectionTitle style={{ marginRight: 4 }}>Filter</SectionTitle>
                  {sportToggles.map((sp, idx) => {
                    const on = selectedSport === sp;
                    const tint = sp === 'all' ? '#5E6590' : (SPORT_TINT[sp] || SPORT_TINT.other);
                    const icon = SPORT_ICONS[sp];
                    return (
                      <button
                        key={sp}
                        onClick={() => setSelectedSport(sp)}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                        onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                        onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                        onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                        onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: icon ? '4px 10px 4px 7px' : '4px 12px',
                          borderRadius: 9999,
                          border: on ? `1px solid ${tint}` : '1px solid rgba(118,126,181,.18)',
                          background: on ? tint : 'rgba(255,255,255,.55)',
                          color: on ? '#fff' : '#6B7280',
                          fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'background .25s ease, color .25s ease, border-color .25s ease, transform .12s ease',
                          animation: `ndPopIn .4s ${idx * 50}ms cubic-bezier(.22,1.4,.36,1) both`,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >
                        {icon && (
                          <span style={{
                            width: 13, height: 13, display: 'block', flexShrink: 0,
                            background: on ? '#fff' : tint,
                            WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})`,
                            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'center', maskPosition: 'center',
                            WebkitMaskSize: 'contain', maskSize: 'contain',
                          }} />
                        )}
                        {sp === 'all' ? 'All' : sp.charAt(0).toUpperCase() + sp.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          )}

          {/* ─── Comparison panel — only when compare mode + 2 tests selected ─── */}
          {compareMode && compareIds.length === 2 && (() => {
            const a = tests.find(t => String(t._id || t.id) === String(compareIds[0]));
            const b = tests.find(t => String(t._id || t.id) === String(compareIds[1]));
            if (!a || !b) return null;
            const tA = extractThresholds(a);
            const tB = extractThresholds(b);
            const zA = calculateZonesFromTest(a);
            const zB = calculateZonesFromTest(b);
            const dateA = new Date(a.date || a.testDate || 0);
            const dateB = new Date(b.date || b.testDate || 0);
            // Order: older on the left, newer on the right
            const [oldT, newT, thOld, thNew, zoneOld, zoneNew, dOld, dNew] = dateA <= dateB
              ? [a, b, tA, tB, zA, zB, dateA, dateB]
              : [b, a, tB, tA, zB, zA, dateB, dateA];

            return (
              <div style={{ ...cardEntry(3), ...snap }}>
                <GlassCard>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                    <div>
                      <SectionTitle>Compare</SectionTitle>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginTop: 2 }}>
                        {dOld.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                        {' → '}
                        {dNew.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={clearCompare}
                      style={styles.clearBtn}
                    >
                      Clear
                    </button>
                  </div>

                  {/* Two side-by-side mini curves */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {[
                      { th: thOld, zones: zoneOld, t: oldT, dt: dOld, label: 'Older' },
                      { th: thNew, zones: zoneNew, t: newT, dt: dNew, label: 'Newer' },
                    ].map(({ th, t, dt, label }, idx) => {
                      const tint = SPORT_TINT[th.sport] || '#5E6590';
                      return (
                        <div key={idx} style={{
                          padding: 10, borderRadius: 12,
                          background: 'rgba(255,255,255,.55)',
                          border: `1px solid ${tint}33`,
                          borderTop: `3px solid ${tint}`,
                          animation: `ndPopIn .45s ${idx * 90}ms cubic-bezier(.22,1.4,.36,1) both`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <SportTile sport={th.sport} size={20} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 9, fontWeight: 800, color: tint,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                              }}>{label}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {dt.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          </div>
                          {/* Mini curve scaled down */}
                          <div style={{ height: 90, marginBottom: 6, marginLeft: -6, marginRight: -6 }}>
                            <LactateCurve thresholds={th} />
                          </div>
                          {/* LT1 / LT2 values */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#4BA87D', letterSpacing: '0.04em' }}>LT1</span>
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtThreshold(th.lt1, th.sport)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#E05347', letterSpacing: '0.04em' }}>LT2</span>
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtThreshold(th.lt2, th.sport)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* LT delta summary */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 11,
                  }}>
                    {(() => {
                      const isPace = thOld.isPace;
                      const lt1Delta = thNew.lt1 != null && thOld.lt1 != null ? thNew.lt1 - thOld.lt1 : null;
                      const lt2Delta = thNew.lt2 != null && thOld.lt2 != null ? thNew.lt2 - thOld.lt2 : null;
                      // For pace, lower = better. For power, higher = better.
                      const fmtDelta = (d) => {
                        if (d == null) return null;
                        const better = isPace ? d < 0 : d > 0;
                        const sign = better ? '▲' : (d === 0 ? '—' : '▼');
                        const color = better ? '#047857' : (d === 0 ? '#9CA3AF' : '#B84238');
                        const bg    = better ? '#ECFDF5' : (d === 0 ? '#F3F4F6' : '#FEF2F2');
                        const display = isPace
                          ? `${Math.abs(Math.round(d))}s`
                          : `${d > 0 ? '+' : ''}${Math.round(d)} W`;
                        return { sign, color, bg, display };
                      };
                      const items = [
                        { label: 'LT1 change', delta: fmtDelta(lt1Delta), color: '#4BA87D' },
                        { label: 'LT2 change', delta: fmtDelta(lt2Delta), color: '#E05347' },
                      ];
                      return items.map(({ label, delta, color }, idx) => (
                        <div key={idx} style={{
                          padding: '7px 10px', borderRadius: 10,
                          background: 'rgba(255,255,255,.55)',
                          border: '1px solid rgba(118,126,181,.14)',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                          {delta ? (
                            <span style={{
                              alignSelf: 'flex-start',
                              fontSize: 11, fontWeight: 800,
                              padding: '2px 7px', borderRadius: 9999,
                              background: delta.bg, color: delta.color,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {delta.sign} {delta.display}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>—</span>
                          )}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Zones table — derived from data table thresholds */}
                  {(zoneOld || zoneNew) && (
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Training zones · {thOld.isPace ? 'pace' : 'power'}
                      </div>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '46px 1fr 1fr', gap: 4,
                        fontSize: 10, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {/* Header row */}
                        <div />
                        <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Older</div>
                        <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Newer</div>

                        {ZONE_DEFS.map(z => {
                          const valOld = zoneVal(zoneOld, z.key, thOld.isPace);
                          const valNew = zoneVal(zoneNew, z.key, thNew.isPace);
                          return (
                            <React.Fragment key={z.key}>
                              <span style={{
                                fontSize: 9.5, fontWeight: 800, color: z.color,
                                background: z.color + '18',
                                borderRadius: 6, padding: '3px 0',
                                textAlign: 'center', letterSpacing: '0.03em',
                              }}>
                                {z.key.toUpperCase()}
                              </span>
                              <span style={{
                                padding: '3px 6px', borderRadius: 6,
                                background: 'rgba(255,255,255,.5)',
                                color: '#374151', fontWeight: 600,
                                textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{valOld}</span>
                              <span style={{
                                padding: '3px 6px', borderRadius: 6,
                                background: 'rgba(255,255,255,.5)',
                                color: '#374151', fontWeight: 600,
                                textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{valNew}</span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </GlassCard>
              </div>
            );
          })()}

          {/* ─── Test list / history ─── */}
          <div style={{ ...cardEntry(4), ...snap }}>
            <GlassCard>
              <div style={{ marginBottom: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <SectionTitle>History</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600 }}>
                    {filtered.length} test{filtered.length !== 1 ? 's' : ''}
                  </span>
                  {filtered.length >= 2 && (
                    <button
                      onClick={() => {
                        if (compareMode) clearCompare();
                        else setCompareMode(true);
                      }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                      onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                      onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                      onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                      onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                      style={{
                        ...styles.compareBtn,
                        ...(compareMode ? styles.compareBtnOn : {}),
                      }}
                    >
                      {compareMode ? `${compareIds.length}/2 selected · Cancel` : 'Compare'}
                    </button>
                  )}
                </div>
              </div>

              {compareMode && (
                <div style={{
                  fontSize: 10.5, color: '#5E6590', fontWeight: 600,
                  background: 'rgba(118,126,181,.1)',
                  padding: '6px 10px', borderRadius: 9,
                  marginBottom: 10,
                  animation: 'ndFadeIn .35s ease both',
                }}>
                  {compareIds.length === 0 && 'Tap two tests to compare them.'}
                  {compareIds.length === 1 && 'Tap one more test to see the comparison.'}
                  {compareIds.length === 2 && 'Comparison ready — see card above.'}
                </div>
              )}

              {loading && filtered.length === 0 ? (
                <div style={{ padding: '4px 0 2px' }}>
                  <NativeSkeletonRows rows={4} />
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  {/* Beaker icon — empty tests state */}
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
                    <path d="M9 2v6L4 18a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L15 8V2" />
                    <line x1="6.5" y1="13" x2="17.5" y2="13" />
                    <line x1="9" y1="2" x2="15" y2="2" />
                  </svg>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>No tests yet</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                    Add your first lactate test to start tracking your history
                  </div>
                </div>
              ) : (
                /* 2-column compact grid */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {filtered.map((t, idx) => {
                    const th = extractThresholds(t);
                    const id = t._id || t.id;
                    const isCompareSel = compareIds.some(x => String(x) === String(id));
                    const isViewSel    = !compareMode && String(selectedTestId) === String(id);
                    const tint = SPORT_TINT[th?.sport] || '#5E6590';
                    const date = new Date(t.date || t.testDate || 0);

                    const handleClick = () => {
                      if (compareMode) toggleCompare(id);
                      else onSelectTest(id);
                    };

                    return (
                      <button
                        key={id}
                        onClick={handleClick}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.97)'; }}
                        onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                        onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                        onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.97)'; }}
                        onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                        style={{
                          position: 'relative',
                          display: 'flex', flexDirection: 'column', gap: 5,
                          padding: '9px 10px', borderRadius: 12,
                          background: isCompareSel
                            ? tint + '18'
                            : isViewSel
                              ? tint + '10'
                              : 'rgba(255,255,255,.6)',
                          border: isCompareSel
                            ? `1.5px solid ${tint}`
                            : isViewSel
                              ? `1.5px solid ${tint}55`
                              : '1px solid rgba(118,126,181,.14)',
                          borderLeft: `3px solid ${tint}`,
                          textAlign: 'left',
                          cursor: 'pointer', fontFamily: 'inherit',
                          animation: `ndFadeIn .35s ${idx * 35}ms cubic-bezier(.22,1,.36,1) both`,
                          transition: 'transform .12s ease, background .25s ease, border-color .25s ease',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >
                        {/* Compare-mode checkmark */}
                        {compareMode && (
                          <span style={{
                            position: 'absolute', top: 5, right: 5,
                            width: 18, height: 18, borderRadius: '50%',
                            background: isCompareSel ? tint : 'rgba(255,255,255,.7)',
                            border: isCompareSel ? `1.5px solid ${tint}` : '1.5px solid rgba(118,126,181,.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background .15s ease, border-color .15s ease',
                          }}>
                            {isCompareSel && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                        )}

                        {/* Top row: sport + date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <SportTile sport={th?.sport} size={22} />
                          <div style={{
                            fontSize: 10, color: '#6B7280', fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </div>
                        </div>

                        {/* Title */}
                        <div style={{
                          fontSize: 11.5, fontWeight: 700, color: '#0A0E1A',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          paddingRight: compareMode ? 22 : 0,
                        }}>
                          {t.title || `${th?.sport.charAt(0).toUpperCase()}${th?.sport.slice(1)} test`}
                        </div>

                        {/* LT1 / LT2 inline */}
                        {th && (th.lt1 != null || th.lt2 != null) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
                            {th.lt1 != null && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#4BA87D', letterSpacing: '0.04em' }}>LT1</span>
                                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0A0E1A' }}>
                                  {fmtThreshold(th.lt1, th.sport)}
                                </span>
                              </div>
                            )}
                            {th.lt2 != null && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#E05347', letterSpacing: '0.04em' }}>LT2</span>
                                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0A0E1A' }}>
                                  {fmtThreshold(th.lt2, th.sport)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>

      {/* New-test bottom sheet — wraps NewTestingComponent so the user can fill
          in stages, see live curve preview, and save without leaving the app. */}
      <NewTestSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        defaultSport={selectedSport}
        athleteId={athleteId}
        user={user}
        onCreated={(test) => {
          // Optimistically add the new test to the list and select it
          setTests(prev => [test, ...prev]);
          const newId = test._id || test.id;
          if (newId) {
            setSelectedTestId(newId);
            const next = new URLSearchParams(searchParams);
            next.set('testId', String(newId));
            setSearchParams(next, { replace: true });
          }
        }}
      />
    </>
  );
}

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    // Extra top padding so the title clears the NativeLayout top bar / dynamic island.
    padding: '22px 18px 10px',
  },
  title: {
    fontSize: 19, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '-0.02em', lineHeight: 1.25,
  },
  subtitle: {
    fontSize: 12, fontWeight: 600, color: '#6B7280', marginTop: 2,
  },
  newBtn: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 11.5, fontWeight: 700,
    padding: '7px 12px', borderRadius: 9999,
    background: '#5E6590', color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px -2px rgba(94,101,144,.55)',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  body: {
    flex: 1, padding: '8px 14px 0',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  testTitle: {
    fontSize: 13.5, fontWeight: 700, color: '#0A0E1A',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  testMeta: {
    fontSize: 11, color: '#6B7280', marginTop: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  openBtn: {
    width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 16px', borderRadius: 12,
    background: 'rgba(255,255,255,.55)',
    border: '1.5px solid #767EB5',
    color: '#5E6590',
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    transition: 'transform .12s ease',
  },
  compareBtn: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 10.5, fontWeight: 700,
    padding: '5px 11px', borderRadius: 9999,
    background: 'rgba(118,126,181,.12)',
    color: '#5E6590',
    border: '1px solid rgba(118,126,181,.2)',
    transition: 'background .2s ease, color .2s ease, transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  compareBtnOn: {
    background: '#5E6590', color: '#fff',
    border: '1px solid #5E6590',
    boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)',
  },
  clearBtn: {
    fontFamily: 'inherit', cursor: 'pointer',
    fontSize: 10.5, fontWeight: 700,
    padding: '4px 10px', borderRadius: 9999,
    background: 'rgba(255,255,255,.65)',
    border: '1px solid rgba(118,126,181,.2)',
    color: '#5E6590',
    transition: 'background .15s ease, transform .12s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
};
