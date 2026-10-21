/**
 * The Training tab on the phone: the sessions you repeat, grouped for you,
 * each with one answer — are you getting better at it — plus search across
 * everything and a sheet to open any single session.
 *
 * It replaces a page of filters, category chips, chart toggles and paged
 * lists that its own owner admitted to not using. Everything that page did is
 * still reachable from the link at the bottom ("Lap-by-lap comparison"); this
 * is the part you open the tab for.
 *
 * Data comes in already shaped by NativeTrainingPage, which owns the lap
 * fetching and the grouping (utils/sessionMatching). Trends come from
 * utils/trainingTrends. Nothing here fetches.
 */
import React, { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { groupTrend, lowerIsBetter, workLaps } from '../../utils/trainingTrends';

// The activity modal's own lap chart, so a session reads the same here as it
// does when opened in full. Lazy for the same reason the modal is: CalendarView
// is large and pulling it eagerly caused a circular-chunk crash before.
const LapChart = lazy(() => import('../Calendar/CalendarView').then((m) => ({ default: m.LapChart })));

const SPORT_COLOR = { run: '#F97316', bike: '#3B82F6', swim: '#06B6D4' };
const sportColor = (s) => SPORT_COLOR[s] || '#8B5CF6';
const SPORT_WORDS = { run: 'run running beh', bike: 'bike ride cycling kolo jizda', swim: 'swim swimming plavani' };
const MONTH_WORDS = [
  'january leden', 'february unor', 'march brezen', 'april duben', 'may kveten', 'june cerven',
  'july cervenec', 'august srpen', 'september zari', 'october rijen', 'november listopad', 'december prosinec',
];
const fold = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[×✕]/g, 'x');
const shortDate = (d) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
const monthName = (d) => d.toLocaleDateString('en', { month: 'long' });

const GROUPS_SHOWN = 8;
const ONE_OFFS_SHOWN = 6;

const C = {
  ink: '#0A0E1A', muted: '#6B7280', faint: '#9CA3AF', accent: '#5E6590',
  good: '#16A34A', goodBg: '#ECFDF3', warn: '#B45309', warnBg: '#FFFBEB', la: '#7C3AED', laBg: '#F3E8FF',
};
const glass = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)', WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
};
const tap = { cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

// ─── trend wording ────────────────────────────────────────────────────────────

function trendChip(tr, sport) {
  if (!tr) return null;
  if (sport === 'bike' && tr.trend !== 'holding') {
    const w = Math.round(tr.delta);
    return { text: `${w > 0 ? '+' : '−'}${Math.abs(w)} W`, tone: tr.trend };
  }
  return { text: tr.trend === 'better' ? 'Faster' : tr.trend === 'worse' ? 'Slower' : 'Holding', tone: tr.trend };
}

function deltaText(tr, sport) {
  if (!tr) return '';
  const n = Math.round(Math.abs(tr.delta));
  if (n === 0) return '±0';
  if (sport === 'bike') return `${tr.delta > 0 ? '+' : '−'}${n} W`;
  return `${tr.delta > 0 ? '+' : '−'}${n} s`;
}

function verdict(group, fmt) {
  const tr = group.trend;
  if (!tr) return 'Do it once more and LaChart will tell you whether it is moving.';
  const since = monthName(group.sessions[0].date);
  const n = Math.round(Math.abs(tr.delta));
  const unit = group.sport === 'bike' ? 'W' : group.sport === 'swim' ? 's/100 m' : 's/km';
  let hr = '';
  if (tr.hrDelta != null && Math.abs(tr.hrDelta) >= 2) {
    const b = Math.round(Math.abs(tr.hrDelta));
    hr = tr.hrDelta < 0 ? ` at ${b} bpm less` : ` with ${b} bpm more`;
  }
  if (tr.trend === 'holding') {
    return `Holding ${fmt(tr.last, group.sport)} since ${since}${hr}.`;
  }
  if (group.sport === 'bike') {
    return tr.delta > 0 ? `${n} W more than in ${since}${hr}.` : `${n} W less than in ${since}${hr}.`;
  }
  if (n === 0) return `Same pace as in ${since}${hr}.`;
  return lowerIsBetter(group.sport) === (tr.delta < 0)
    ? `${n} ${unit} faster than in ${since}${hr}.`
    : `${n} ${unit} slower than in ${since}${hr}.`;
}

function why(group, fmt) {
  const tr = group.trend;
  if (!tr) return null;
  const basis = (group.trendBasis && group.trendBasis.length ? group.trendBasis : group.sessions);
  const first = basis[0];
  const last = basis[basis.length - 1];
  const parts = [`Work ${group.sport === 'bike' ? 'power' : 'pace'} went from ${fmt(tr.first, group.sport)} to ${fmt(tr.last, group.sport)}`];
  if (first.summary.hr && last.summary.hr) parts.push(`heart rate from ${Math.round(first.summary.hr)} to ${Math.round(last.summary.hr)}`);
  const withLa = basis.filter((s) => s.summary.lactate != null);
  if (withLa.length >= 2) {
    parts.push(`lactate from ${withLa[0].summary.lactate.toFixed(1)} to ${withLa[withLa.length - 1].summary.lactate.toFixed(1)} mmol`);
  }
  let text = `${parts.join(', ')}.`;
  if (tr.trend === 'worse' && basis.length >= 3) text += ' If your form is low, this is usually fatigue rather than lost fitness — check again after an easy week.';
  return text;
}

// ─── small pieces ─────────────────────────────────────────────────────────────

function Chip({ chip }) {
  if (!chip) return null;
  const tone = chip.tone === 'better' ? [C.good, C.goodBg] : chip.tone === 'worse' ? [C.warn, C.warnBg] : [C.muted, '#F3F4F6'];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', color: tone[0], background: tone[1] }}>
      {chip.text}
    </span>
  );
}

function Dot({ sport, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: size / 2, background: sportColor(sport), flexShrink: 0, display: 'inline-block' }} />;
}

function Spark({ values, sport, color, w = 84, h = 28 }) {
  const vs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (vs.length < 2) return null;
  const min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const low = lowerIsBetter(sport);
  const pts = vs.map((v, i) => {
    const n = (v - min) / span;
    return [(i / (vs.length - 1)) * (w - 6) + 3, low ? 3 + n * (h - 6) : h - 3 - n * (h - 6)];
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

const toneColor = (t) => (t === 'better' ? C.good : t === 'worse' ? C.warn : C.faint);

function SectionLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 4px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{children}</span>
      {right && <span style={{ fontSize: 12, color: C.faint }}>{right}</span>}
    </div>
  );
}

function Row({ s, onOpen, right, sub, id, highlight = false }) {
  return (
    <button id={id} type="button" onClick={onOpen} style={{
      ...tap, display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
      padding: '11px 14px', border: 'none', borderBottom: '1px solid rgba(15,23,42,.06)', color: C.ink,
      background: highlight ? 'rgba(94,101,144,.12)' : 'transparent', transition: 'background .3s',
    }}>
      <Dot sport={s.sport} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{sub || shortDate(s.date)}</div>
      </div>
      {right}
      <span style={{ color: '#C4C7D4', fontSize: 18 }}>›</span>
    </button>
  );
}

// ─── charts ───────────────────────────────────────────────────────────────────

function GroupChart({ group, metric, fmt, picked = null, onPick = null }) {
  const sport = group.sport;
  const pick = (s) => (metric === 'hr' ? s.summary.hr : metric === 'lactate' ? s.summary.lactate : s.summary.value);
  const pts = group.sessions.map((s, i) => [i, pick(s)]).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (pts.length < 2) return <div style={{ fontSize: 13, color: C.faint, padding: '24px 0', textAlign: 'center' }}>Not enough data yet.</div>;
  const W = 340, H = 160, L = 46, R = 10, T = 12, B = 24;
  const ys = pts.map(([, v]) => v), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const invert = metric === 'main' && lowerIsBetter(sport);
  const n = group.sessions.length;
  const X = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const Y = (v) => { const k = (v - min) / span; return invert ? T + k * (H - T - B) : H - B - k * (H - T - B); };
  const lab = (v) => (metric === 'hr' ? `${Math.round(v)}` : metric === 'lactate' ? v.toFixed(1) : fmt(v, sport, true));
  const col = metric === 'lactate' ? C.la : metric === 'hr' ? '#E05347' : C.accent;
  const path = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${X(pts[pts.length - 1][0])},${H - B} L${X(pts[0][0])},${H - B} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="th-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity=".18" /><stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#E9EBF1" />
          <text x={L - 6} y={Y(v) + 4} fontSize="10" textAnchor="end" fill={C.faint}>{lab(v)}</text>
        </g>
      ))}
      <path d={area} fill="url(#th-fill)" />
      <path d={path} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([i, v], k) => {
        const on = picked === i;
        return (
          <g key={i} onClick={onPick ? () => onPick(i) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            {on && <line x1={X(i)} x2={X(i)} y1={T} y2={H - B} stroke={col} strokeOpacity=".25" strokeDasharray="3 3" />}
            <circle cx={X(i)} cy={Y(v)} r={on ? 6 : k === pts.length - 1 ? 4.5 : 3}
              fill={on || k === pts.length - 1 ? col : '#fff'} stroke={col} strokeWidth="2" />
            {/* A finger-sized target around a 3 px dot. */}
            {onPick && <circle cx={X(i)} cy={Y(v)} r="16" fill="transparent" />}
          </g>
        );
      })}
      <text x={L} y={H - 6} fontSize="10" fill={C.faint}>{shortDate(group.sessions[0].date)}</text>
      <text x={W - R} y={H - 6} fontSize="10" fill={C.faint} textAnchor="end">{shortDate(group.sessions[n - 1].date)}</text>
    </svg>
  );
}

// ─── session sheet ────────────────────────────────────────────────────────────

function SessionSheet({ s, group, onClose, onOpenFull, onAddLactate, onOpenGroup, fmt, fmtDur, fmtDist, unitSystem }) {
  const [picked, setPicked] = useState(null);
  const chartScrollRef = useRef(null);

  // Pull down to close, like a native sheet: only from the top of its own
  // scroll, follows the finger, closes past 120 px or on a quick flick and
  // springs back otherwise. Styles are set on the node directly so a drag
  // does not re-render the whole sheet sixty times a second.
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const onTouchStart = (e) => {
    const el = sheetRef.current;
    if (!el) return;
    drag.current = { y: e.touches[0].clientY, t: Date.now(), dy: 0, active: el.scrollTop <= 0 };
  };
  const onTouchMove = (e) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !d.active || !el) return;
    const dy = e.touches[0].clientY - d.y;
    if (dy <= 0 || el.scrollTop > 0) {
      if (d.dy) { d.dy = 0; el.style.transform = ''; }
      if (el.scrollTop > 0) d.active = false;
      return;
    }
    d.dy = dy;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el || !d.dy) return;
    const speed = d.dy / Math.max(1, Date.now() - d.t);
    if (d.dy > 120 || speed > 0.6) {
      el.style.transition = 'transform .2s ease-in';
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 180);
    } else {
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    }
  };
  useEffect(() => setPicked(null), [s]);
  if (!s) return null;
  const laps = (s.laps || []).filter((l) => Number.isFinite(l.num) && l.num > 0);
  const work = workLaps(laps, s.sport);
  const rank = group ? [...group.sessions]
    .filter((x) => Number.isFinite(x.summary.value))
    .sort((a, b) => (lowerIsBetter(s.sport) ? a.summary.value - b.summary.value : b.summary.value - a.summary.value))
    .findIndex((x) => x === s) + 1 : 0;
  // The lap shape LapChart reads: Strava-style field names.
  const chartLaps = laps.map((l) => ({
    moving_time: l.secs,
    distance: l.dist,
    average_watts: s.sport === 'bike' ? l.num : undefined,
    // Pace sessions without a distance still get a bar from their pace.
    ...(s.sport !== 'bike' && !(l.dist > 0) && l.secs > 0
      ? { distance: s.sport === 'swim' ? (l.secs / l.num) * 100 : (l.secs / l.num) * 1000 }
      : {}),
    average_heartrate: l.hr || undefined,
    lactate: l.la != null ? l.la : undefined,
    intervalType: l.type || undefined,
  }));
  const stat = (k, v, color) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '9px 10px', border: '1px solid #EEF0F4', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, color: color || C.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
    </div>
  );
  const root = document.getElementById('app-modal-root') || document.body;
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 10 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,26,.35)' }} />
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
        overscrollBehaviorY: 'none',
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88vh', overflowY: 'auto',
        background: '#F7F8FB', borderRadius: '22px 22px 0 0', padding: '8px 16px calc(24px + env(safe-area-inset-bottom))',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color: C.ink,
        animation: 'thSheetIn .28s cubic-bezier(.2,.8,.2,1)', boxSizing: 'border-box',
      }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: '#D1D5DB', margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dot sport={s.sport} size={10} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>
              {s.date.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              {group?.shape ? ` · ${group.shape}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...tap, width: 30, height: 30, borderRadius: 15, border: 'none', background: 'rgba(94,101,144,.1)', color: C.accent, fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
          {stat('Time', s.secs ? fmtDur(s.secs) : '–')}
          {stat('Distance', s.dist ? fmtDist(s.dist) : '–')}
          {stat('TSS', s.tss ? Math.round(s.tss) : '–')}
          {stat(s.sport === 'bike' ? 'Work power' : 'Work pace', s.summary.value ? fmt(s.summary.value, s.sport, true) : '–')}
          {stat('Avg HR', s.summary.hr ? Math.round(s.summary.hr) : (s.avgHr ? Math.round(s.avgHr) : '–'))}
          {stat('Lactate', s.summary.lactate != null ? s.summary.lactate.toFixed(1) : '–', s.summary.lactate != null ? C.la : C.faint)}
        </div>

        {group && group.sessions.length > 1 && (
          <button type="button" onClick={onOpenGroup} style={{
            ...tap, display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', marginTop: 12,
            padding: '12px 14px', background: '#fff', borderRadius: 14, border: '1px solid #EEF0F4', fontSize: 13, color: '#374151',
          }}>
            <span style={{ flex: 1 }}>
              Part of <b style={{ color: C.ink }}>{group.label}</b> · {group.sessions.length} sessions.{' '}
              {rank === 1 ? <b style={{ color: C.good }}>Your best one.</b> : rank > 0 ? `#${rank} of ${group.sessions.length}.` : ''}
            </span>
            <span style={{ color: '#C4C7D4', fontSize: 18 }}>›</span>
          </button>
        )}

        {laps.length >= 2 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EEF0F4', marginTop: 12, padding: '12px 0 6px', overflow: 'hidden' }}>
            <Suspense fallback={<div style={{ height: 232 }} />}>
              <LapChart
                laps={chartLaps}
                color={sportColor(s.sport)}
                isBike={s.sport === 'bike'}
                isRun={s.sport === 'run'}
                isSwim={s.sport === 'swim'}
                unitSystem={unitSystem}
                sport={s.sport}
                selectedLap={picked}
                onSelectLap={setPicked}
                chartScrollRef={chartScrollRef}
              />
            </Suspense>
          </div>
        )}

        {laps.length >= 2 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EEF0F4', marginTop: 12, overflow: 'hidden' }}>
            <div style={lapRowStyle(true)}>
              <span>Lap</span><span>{s.sport === 'bike' ? 'Power' : 'Pace'}</span><span>Dist</span><span>Time</span><span>HR</span><span>La</span>
            </div>
            {laps.map((l, k) => {
              const isWork = work.includes(l);
              return (
                <div key={k} onClick={() => setPicked(k)} style={{
                  ...lapRowStyle(false), ...tap,
                  fontWeight: isWork ? 600 : 400, color: isWork ? C.ink : C.faint,
                  background: picked === k ? '#EEF0FA' : 'transparent',
                }}>
                  <span>{k + 1}</span>
                  <span>{fmt(l.num, s.sport, true)}</span>
                  <span>{lapDist(l.dist)}</span>
                  <span>{l.secs ? fmtClock(l.secs) : '–'}</span>
                  <span>{l.hr ? Math.round(l.hr) : '–'}</span>
                  <span>{l.la != null ? <span style={{ fontSize: 10.5, fontWeight: 700, color: C.la, background: C.laBg, borderRadius: 6, padding: '1px 5px' }}>{l.la.toFixed(1)}</span> : ''}</span>
                </div>
              );
            })}
          </div>
        )}
        {laps.length < 2 && s.lapsPending && (
          <div style={{ fontSize: 12.5, color: C.faint, textAlign: 'center', padding: '16px 0' }}>Loading laps…</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={() => onAddLactate(s.raw)} style={{ ...tap, flex: 1, padding: 12, borderRadius: 13, border: 'none', background: 'rgba(94,101,144,.1)', color: C.accent, fontSize: 14, fontWeight: 700 }}>
            {s.summary.lactate != null ? 'Edit lactate' : 'Add lactate'}
          </button>
          <button type="button" onClick={() => onOpenFull(s.raw)} style={{ ...tap, flex: 1, padding: 12, borderRadius: 13, border: 'none', background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700 }}>
            Open full activity
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}

const lapRowStyle = (head) => ({
  display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 38px 38px', alignItems: 'center', gap: 4,
  padding: head ? '8px 12px' : '9px 12px', fontSize: head ? 10.5 : 13,
  fontWeight: head ? 700 : 400, color: head ? C.faint : C.ink,
  textTransform: head ? 'uppercase' : 'none', letterSpacing: head ? '.05em' : 0,
  background: head ? '#FAFAFC' : 'transparent', borderBottom: '1px solid #F1F2F5',
  fontVariantNumeric: 'tabular-nums',
});

/** "400 m" under a kilometre, "2.10 km" above it. */
function lapDist(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return '–';
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(2)} km`;
}

function fmtClock(secs) {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

// ─── group detail ─────────────────────────────────────────────────────────────

function GroupDetail({ group, onBack, onOpenSession, fmt }) {
  const [metric, setMetric] = useState('main');
  // Tap a point → that session is picked, and the list scrolls to its row.
  const [picked, setPicked] = useState(null);
  const chartCardRef = useRef(null);
  // The chart stays pinned at the top, so "scroll to the row" means: put the
  // row just under the chart, not at the top of the screen behind it.
  const pickSession = (i) => {
    setPicked(i);
    const row = document.getElementById(`th-sess-${group.sessions[i]?.id}`);
    if (!row) return;
    let box = row.parentElement;
    while (box && box !== document.body) {
      const oy = window.getComputedStyle(box).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      box = box.parentElement;
    }
    if (!box || box === document.body) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const chartBottom = chartCardRef.current ? chartCardRef.current.getBoundingClientRect().height + 16 : 0;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - chartBottom - 8;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };
  const pickedSession = picked != null ? group.sessions[picked] : null;
  const pickedValue = (x) => {
    if (!x) return '';
    if (metric === 'hr') return x.summary.hr ? `${Math.round(x.summary.hr)} bpm` : '–';
    if (metric === 'lactate') return x.summary.lactate != null ? `${x.summary.lactate.toFixed(1)} mmol` : '–';
    return x.summary.value ? fmt(x.summary.value, group.sport) : '–';
  };
  const hasHr = group.sessions.filter((s) => s.summary.hr).length >= 2;
  const hasLa = group.sessions.filter((s) => s.summary.lactate != null).length >= 2;
  const tabs = [['main', group.sport === 'bike' ? 'Work power' : 'Work pace'], hasHr && ['hr', 'Heart rate'], hasLa && ['lactate', 'Lactate']].filter(Boolean);
  const best = group.sessions.reduce((a, s) => {
    if (!Number.isFinite(s.summary.value)) return a;
    if (!a) return s;
    return (lowerIsBetter(group.sport) ? s.summary.value < a.summary.value : s.summary.value > a.summary.value) ? s : a;
  }, null);
  const whyText = why(group, fmt);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" onClick={onBack} style={{ ...tap, alignSelf: 'flex-start', border: 'none', background: 'transparent', color: C.accent, fontSize: 15, fontWeight: 600, padding: '4px 0' }}>
        ‹ Training
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dot sport={group.sport} size={10} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{group.label}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>
            {group.shape ? `${group.shape} · ` : ''}{group.sessions.length} sessions since {shortDate(group.sessions[0].date)}
          </div>
        </div>
      </div>

      <div style={{ ...glass, padding: '14px 16px' }}>
        <Chip chip={trendChip(group.trend, group.sport)} />
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35, marginTop: group.trend ? 8 : 0 }}>{verdict(group, fmt)}</div>
        {whyText && <div style={{ fontSize: 13, color: '#4B5563', marginTop: 6, lineHeight: 1.45 }}>{whyText}</div>}
      </div>

      {/* Pinned: the chart stays on screen while the session list scrolls under it. */}
      <div ref={chartCardRef} style={{
        ...glass, padding: '12px 12px 6px',
        position: 'sticky', top: 8, zIndex: 5,
        background: 'rgba(247,248,251,.94)',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          {tabs.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMetric(k)} style={{
              ...tap, border: `1px solid ${metric === k ? C.accent : '#E5E7EB'}`, background: metric === k ? C.accent : '#fff',
              color: metric === k ? '#fff' : C.muted, borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 600,
            }}>{l}</button>
          ))}
        </div>
        <div style={{ minHeight: 18, margin: '0 4px 2px', fontSize: 12.5, color: pickedSession ? C.ink : C.faint }}>
          {pickedSession
            ? <><b>{pickedSession.title}</b> · {shortDate(pickedSession.date)} · {pickedValue(pickedSession)}</>
            : 'Tap a point to find the session'}
        </div>
        <GroupChart group={group} metric={metric} fmt={fmt} picked={picked} onPick={pickSession} />
      </div>

      <SectionLabel right="tap one to open it">Every session</SectionLabel>
      <div style={{ ...glass, padding: '2px 0', overflow: 'hidden' }}>
        {[...group.sessions].reverse().map((s, k) => (
          <Row key={s.id} s={s} onOpen={() => onOpenSession(s, group)}
            id={`th-sess-${s.id}`}
            highlight={pickedSession === s}
            sub={`${shortDate(s.date)}${k === 0 ? ' · latest' : ''}${s === best ? ' · best' : ''}`}
            right={
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: s === best ? C.good : C.ink }}>
                  {s.summary.value ? fmt(s.summary.value, s.sport) : '–'}
                  {s.summary.lactate != null && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: C.la, background: C.laBg, borderRadius: 6, padding: '1px 5px', marginLeft: 4 }}>{s.summary.lactate.toFixed(1)}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.faint }}>{s.summary.hr ? `${Math.round(s.summary.hr)} bpm` : ' '}</div>
              </div>
            } />
        ))}
      </div>
    </div>
  );
}

// ─── the page ─────────────────────────────────────────────────────────────────

export default function TrainingHub({
  loading = false,      // the training list has not arrived yet
  groups = [],          // [{ key, label, shape, sport, sessions: [session oldest → newest] }]
  sessions = [],        // every session for search, newest first
  lactateReady = [],    // recent sessions with laps and no lactate yet
  sport = 'all',
  onSport,
  fmt,                  // (num, sport, bare?) => '3:17/km' | '298 W'
  fmtDur,
  fmtDist,
  unitSystem = 'metric',
  categories = [],      // [{ id, label, color, count }] — first is "All"
  categoryId = null,
  onCategory,
  categoryGroups = [],  // every session of the picked category, one group per sport
  onOpenFull,
  onAddLactate,
  onOpenClassic,
  onSessionOpen,
}) {
  const [query, setQuery] = useState('');
  const [openGroupKey, setOpenGroupKey] = useState(null);
  const [sheet, setSheet] = useState(null); // { s, group }
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showAllOneOffs, setShowAllOneOffs] = useState(false);
  const [showLactate, setShowLactate] = useState(false);

  // A session measured from its laps and one measured from its overall
  // average are not the same number — an interval session's average includes
  // the jogs. Trend on the lap-measured ones whenever there are two of them.
  const withTrend = useMemo(() => [...groups, ...categoryGroups].map((g) => {
    // Only sessions whose laps have arrived: a trend from half-loaded data
    // flipped from +90 W to −55 W as the rest came in.
    const fromLaps = g.sessions.filter((s) => !s.wholeOnly && !s.lapsPending);
    const settled = g.sessions.filter((s) => !s.lapsPending);
    const basis = fromLaps.length >= 2 ? fromLaps : settled;
    return { ...g, trend: groupTrend(basis.map((s) => s.summary), g.sport), trendBasis: basis };
  }), [groups, categoryGroups]);
  const isCategoryGroup = (g) => String(g.key).startsWith('cat:');

  const repeated = withTrend.filter((g) => !isCategoryGroup(g) && g.sessions.length >= 2);
  const oneOffs = withTrend.filter((g) => !isCategoryGroup(g) && g.sessions.length === 1).map((g) => ({ s: g.sessions[0], g }));
  const categoryCompared = withTrend.filter((g) => isCategoryGroup(g) && g.sessions.length >= 1);
  const groupOf = useMemo(() => {
    const m = new Map();
    withTrend.forEach((g) => { if (!isCategoryGroup(g)) g.sessions.forEach((s) => m.set(s.id, g)); });
    return m;
  }, [withTrend]);

  // The block that matters: groups done in the last three months.
  const recentCut = Date.now() - 90 * 86400000;
  // Three sessions or more: two is a coincidence, not a trend worth a headline.
  const active = repeated.filter((g) => g.trend && g.sessions.length >= 3
    && g.sessions[g.sessions.length - 1].date.getTime() >= recentCut);
  const better = active.filter((g) => g.trend.trend === 'better');
  const worse = active.filter((g) => g.trend.trend === 'worse');

  const openGroup = withTrend.find((g) => g.key === openGroupKey) || null;

  useEffect(() => {
    // Back to the list when the sport changes under an open group.
    if (openGroupKey && !openGroup) setOpenGroupKey(null);
  }, [openGroupKey, openGroup]);

  const q = fold(query.trim());
  const results = useMemo(() => {
    if (!q) return null;
    const terms = q.split(/\s+/);
    const hay = (s) => fold(`${s.title} ${groupOf.get(s.id)?.label || ''} ${groupOf.get(s.id)?.shape || ''} ${SPORT_WORDS[s.sport] || s.sport} ${shortDate(s.date)} ${MONTH_WORDS[s.date.getMonth()]} ${s.date.getFullYear()}`);
    const gs = repeated.filter((g) => terms.every((t) => fold(`${g.label} ${g.shape || ''} ${SPORT_WORDS[g.sport] || ''}`).includes(t)));
    const ss = sessions.filter((s) => terms.every((t) => hay(s).includes(t)));
    return { groups: gs, sessions: ss };
  }, [q, repeated, sessions, groupOf]);

  const openSession = (s, g = groupOf.get(s.id) || null) => {
    if (onSessionOpen) onSessionOpen(s.raw);
    setSheet({ s, group: g });
  };

  const liveSheetSession = sheet ? (sessions.find((x) => x.id === sheet.s.id)
    || withTrend.flatMap((g) => g.sessions).find((x) => x.id === sheet.s.id)
    || sheet.s) : null;
  const sheetEl = sheet && (
    <SessionSheet
      s={liveSheetSession}
      group={sheet.group}
      fmt={fmt}
      fmtDur={fmtDur}
      fmtDist={fmtDist}
      unitSystem={unitSystem}
      onClose={() => setSheet(null)}
      onOpenFull={(raw) => { setSheet(null); onOpenFull(raw); }}
      onAddLactate={(raw) => { setSheet(null); onAddLactate(raw); }}
      onOpenGroup={() => { const g = sheet.group; setSheet(null); setQuery(''); setOpenGroupKey(g.key); }}
    />
  );

  if (openGroup) {
    return (
      <>
        <style>{SHEET_KEYFRAMES}</style>
        <GroupDetail group={openGroup} fmt={fmt} onBack={() => setOpenGroupKey(null)} onOpenSession={openSession} />
        {sheetEl}
      </>
    );
  }

  const renderGroupCard = (g) => {
    const last = g.sessions[g.sessions.length - 1];
    const basis = (g.trendBasis && g.trendBasis.length ? g.trendBasis : g.sessions);
    const shownValue = basis[basis.length - 1].summary.value;
    const color = toneColor(g.trend?.trend);
    return (
      <button key={g.key} type="button" onClick={() => setOpenGroupKey(g.key)} style={{
        ...glass, ...tap, display: 'block', width: '100%', textAlign: 'left', padding: '13px 14px', color: C.ink,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dot sport={g.sport} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {g.shape ? `${g.shape} · ` : ''}{g.sessions.length}× · {relative(last.date)}
            </div>
          </div>
          <Chip chip={trendChip(g.trend, g.sport)} />
        </div>
        {shownValue ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
            <div>
              <div>
                <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(shownValue, g.sport)}</span>
                {g.trend && <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color }}>{deltaText(g.trend, g.sport)}</span>}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>
                {g.sport === 'bike' ? 'Work power' : 'Work pace'} · since {shortDate(g.sessions[0].date)}
              </div>
            </div>
            <Spark values={basis.map((s) => s.summary.value)} sport={g.sport} color={color} />
          </div>
        ) : null}
      </button>
    );
              };

  const shownGroups = showAllGroups ? repeated : repeated.slice(0, GROUPS_SHOWN);
  const shownOneOffs = showAllOneOffs ? oneOffs : oneOffs.slice(0, ONE_OFFS_SHOWN);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{SHEET_KEYFRAMES}</style>

      {/* search */}
      <div style={{ position: 'relative' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E93A8" strokeWidth="2.4" strokeLinecap="round"
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. LT2, 1 km, October"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', borderRadius: 12, background: 'rgba(118,126,181,.12)',
            padding: '10px 34px', fontSize: 16, color: C.ink, outline: 'none', fontFamily: 'inherit',
          }}
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery('')} style={{
            ...tap, position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20,
            borderRadius: 10, border: 'none', background: '#A3A8BF', color: '#fff', fontSize: 11, lineHeight: '20px', padding: 0,
          }}>✕</button>
        )}
      </div>

      {/* sport */}
      <div style={{ display: 'flex', background: 'rgba(118,126,181,.12)', borderRadius: 12, padding: 3, gap: 2 }}>
        {[['all', 'All'], ['run', 'Run'], ['bike', 'Bike'], ['swim', 'Swim']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => onSport(k)} style={{
            ...tap, flex: 1, border: 'none', padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: sport === k ? '#fff' : 'transparent', color: sport === k ? C.ink : C.muted,
            boxShadow: sport === k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
          }}>{l}</button>
        ))}
      </div>

      {/* categories */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -14px', padding: '0 14px 2px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {categories.map((c) => {
            const on = categoryId === c.id;
            return (
              <button key={c.id} type="button" onClick={() => onCategory(c.id)} style={{
                ...tap, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                border: `1px solid ${on ? c.color : 'rgba(118,126,181,.18)'}`,
                background: on ? `${c.color}22` : 'rgba(255,255,255,.6)', color: on ? C.ink : C.muted,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: c.color }} />
                {c.label}
                <span style={{ color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {results ? (
        <>
          {results.groups.length === 0 && results.sessions.length === 0 && (
            <div style={{ ...glass, padding: '26px 16px', textAlign: 'center', fontSize: 14, color: C.muted, marginTop: 6 }}>
              Nothing for “{query}”.
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Try a sport, a month or part of the name.</div>
            </div>
          )}
          {results.groups.length > 0 && (
            <>
              <SectionLabel right={results.groups.length}>Groups</SectionLabel>
              <div style={{ ...glass, padding: '2px 0', overflow: 'hidden' }}>
                {results.groups.map((g) => (
                  <Row key={g.key} s={{ sport: g.sport, title: g.label }} sub={`${g.shape ? `${g.shape} · ` : ''}${g.sessions.length} sessions`}
                    onOpen={() => { setQuery(''); setOpenGroupKey(g.key); }} right={<Chip chip={trendChip(g.trend, g.sport)} />} />
                ))}
              </div>
            </>
          )}
          {results.sessions.length > 0 && (
            <>
              <SectionLabel right={results.sessions.length}>Sessions</SectionLabel>
              <div style={{ ...glass, padding: '2px 0', overflow: 'hidden' }}>
                {results.sessions.slice(0, 60).map((s) => (
                  <Row key={s.id} s={s} onOpen={() => openSession(s)}
                    sub={`${shortDate(s.date)}${groupOf.get(s.id)?.shape ? ` · ${groupOf.get(s.id).shape}` : ''}`}
                    right={<span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{s.summary.value ? fmt(s.summary.value, s.sport) : ''}</span>} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {categoryCompared.length > 0 && (
            <>
              <SectionLabel right="across every session name">Compared together</SectionLabel>
              {categoryCompared.map(renderGroupCard)}
            </>
          )}

          {categoryCompared.length === 0 && active.length > 0 && (
            <div style={{ ...glass, padding: '13px 16px', fontSize: 13, color: '#374151', lineHeight: 1.45 }}>
              <b style={{ color: C.ink }}>{better.length} of {active.length}</b> sessions you repeat got better in the last three months.
              {worse.length > 0 && <> <b style={{ color: C.ink }}>{worse[0].label}</b> is slipping.</>}
            </div>
          )}

          {lactateReady.length > 0 && (
            <div style={{ ...glass, overflow: 'hidden' }}>
              <button type="button" onClick={() => setShowLactate((v) => !v)} style={{
                ...tap, display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px',
                background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: C.la }} />
                <span style={{ flex: 1 }}><b style={{ color: C.ink }}>{lactateReady.length} session{lactateReady.length === 1 ? '' : 's'} this week</b> can take a lactate value</span>
                <span style={{ color: C.accent, fontWeight: 700 }}>{showLactate ? 'Hide' : 'Show'}</span>
              </button>
              {showLactate && lactateReady.map((s) => (
                <Row key={s.id} s={s} onOpen={() => openSession(s)} />
              ))}
            </div>
          )}

          {repeated.length > 0 ? (
            <>
              <SectionLabel right="grouped automatically">Sessions you repeat</SectionLabel>
              {shownGroups.map(renderGroupCard)}
              {repeated.length > GROUPS_SHOWN && (
                <button type="button" onClick={() => setShowAllGroups((v) => !v)} style={linkBtn}>
                  {showAllGroups ? 'Show fewer' : `Show all ${repeated.length}`}
                </button>
              )}
            </>
          ) : loading ? (
            <>
              <SectionLabel>Sessions you repeat</SectionLabel>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ ...glass, height: 112, opacity: 0.7, animation: 'thPulse 1.2s ease-in-out infinite alternate' }} />
              ))}
            </>
          ) : (
            <div style={{ ...glass, padding: '18px 16px', fontSize: 13, color: C.muted, lineHeight: 1.45, marginTop: 6 }}>
              Nothing repeated yet. Do a session twice — same name, or the same intervals — and it shows up here with its trend.
            </div>
          )}

          {oneOffs.length > 0 && (
            <>
              <SectionLabel right={`${oneOffs.length} sessions`}>One-offs</SectionLabel>
              <div style={{ ...glass, padding: '2px 0', overflow: 'hidden' }}>
                {shownOneOffs.map(({ s, g }) => (
                  <Row key={s.id} s={s} onOpen={() => openSession(s, g)} sub={relative(s.date)} />
                ))}
              </div>
              {oneOffs.length > ONE_OFFS_SHOWN && (
                <button type="button" onClick={() => setShowAllOneOffs((v) => !v)} style={linkBtn}>
                  {showAllOneOffs ? 'Show fewer' : `Show all ${oneOffs.length}`}
                </button>
              )}
            </>
          )}

          <button type="button" onClick={onOpenClassic} style={{ ...linkBtn, marginTop: 10 }}>
            Lap-by-lap comparison & lactate log ›
          </button>
          <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', margin: '0 18px', lineHeight: 1.5 }}>
            Grouped by the name you gave a session, or by its shape — sport, number of work intervals and their length — when the watch named it.
          </div>
        </>
      )}
      {sheetEl}
    </div>
  );
}

const linkBtn = {
  ...tap, alignSelf: 'center', border: 'none', background: 'transparent', color: C.accent,
  fontSize: 13.5, fontWeight: 700, padding: '8px 12px',
};

const SHEET_KEYFRAMES = '@keyframes thSheetIn { from { transform: translateY(100%); } to { transform: none; } } @keyframes thPulse { from { opacity: .45; } to { opacity: .8; } }';

function relative(d) {
  const day = (x) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c.getTime(); };
  const days = Math.round((day(Date.now()) - day(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} d ago`;
  if (days < 30) return `${Math.floor(days / 7)} w ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return shortDate(d);
}
