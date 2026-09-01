/**
 * Live app UI cards for the marketing pages — a React port of
 * docs/component-library.html.
 *
 * Two things the library file could not be dropped in as-is:
 *
 * 1. Its class names are generic (.card, .grid, .wrap, .row, .pill, .session).
 *    The marketing pages run on marketingKit's sheet, which owns .lc-card,
 *    .lc-page and friends, and the app ships Tailwind underneath. Every
 *    selector here is therefore `lcui-`-prefixed — nothing in this file can
 *    collide with either.
 *
 * 2. Its charts and its interactivity are an imperative <script> that reaches
 *    for element ids. Ids do not survive being rendered several times on one
 *    page. Here each card is a self-contained component holding its own state,
 *    so the same card can appear twice and both copies stay independent.
 *
 * These are real controls, not pictures of controls: the sport toggles, metric
 * tabs, period filters, legend chips, calendar days and table rows all respond
 * to hover and to a click. A visitor gets to poke at the product before they
 * have an account.
 *
 * <PhotoShowcase> lays one or two cards *over* a marketing photograph. Below
 * 820 px the absolute placement is dropped: the primary card slides under the
 * photo overlapping its bottom edge, the secondary is not rendered. An overlap
 * that survives a phone is one that was never absolute on it.
 */
import React, { useState } from 'react';

/* ── SVG helpers ──────────────────────────────────────────────────────── */

const scalePoints = (data, w, h, padTop = 8, padBottom = 8) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const innerH = h - padTop - padBottom;
  return data.map((v, i) => [
    (i / (data.length - 1)) * w,
    padTop + innerH - ((v - min) / ((max - min) || 1)) * innerH,
  ]);
};

const toPath = (pts) => pts.map((p) => p.join(',')).join(' ');

const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/* ── Shared controls ──────────────────────────────────────────────────── */

/** Segmented control — the app's Bike/Run and Power/HR/Lactate switch. */
const Segmented = ({ options, value, onChange, width, style }) => (
  <div className="lcui-seg" style={{ width, ...style }} role="tablist">
    {options.map((o) => (
      <button
        key={o} type="button" role="tab" aria-selected={o === value}
        className={`lcui-seg-btn${o === value ? ' lcui-on' : ''}`}
        onClick={() => onChange(o)}
      >
        {o}
      </button>
    ))}
  </div>
);

/** Round filter pill — periods, categories, chart ranges. */
const Pill = ({ children, active, dot, onClick, tip }) => (
  <button
    type="button" onClick={onClick} data-tip={tip}
    className={`lcui-filter${active ? ' lcui-on' : ''}`}
    aria-pressed={active}
  >
    {dot && <i className="lcui-fdot" style={{ background: dot }} />}
    {children}
  </button>
);

/* ── Cards ────────────────────────────────────────────────────────────── */

const THRESHOLDS = {
  Bike: { lt1: '350', lt1u: 'W', lt1m: '1.9 mmol · 141 bpm', lt2: '415', lt2u: 'W', lt2m: '4.0 mmol · 159 bpm' },
  Run: { lt1: '4:50', lt1u: '/km', lt1m: '1.8 mmol · 146 bpm', lt2: '4:15', lt2u: '/km', lt2m: '4.1 mmol · 164 bpm' },
};

/** LT1 / LT2 pair — the smallest card that still says what the app is for. */
export const ThresholdPairCard = () => {
  const [sport, setSport] = useState('Bike');
  const t = THRESHOLDS[sport];
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 12 }}>
        <span className="lcui-eyebrow">Thresholds</span>
        <Segmented options={['Bike', 'Run']} value={sport} onChange={setSport} width={110} />
      </div>
      <div className="lcui-row">
        <div className="lcui-thresh lcui-thresh-lt1" data-tip="Aerobic threshold">
          <div className="lcui-thresh-lbl" style={{ color: '#16A34A' }}>LT1</div>
          <div className="lcui-thresh-val">{t.lt1}<span className="lcui-unit">{t.lt1u}</span></div>
          <div className="lcui-thresh-sub">{t.lt1m}</div>
        </div>
        <div className="lcui-thresh lcui-thresh-lt2" data-tip="Anaerobic threshold">
          <div className="lcui-thresh-lbl" style={{ color: '#DC5A45' }}>LT2</div>
          <div className="lcui-thresh-val">{t.lt2}<span className="lcui-unit">{t.lt2u}</span></div>
          <div className="lcui-thresh-sub">{t.lt2m}</div>
        </div>
      </div>
    </div>
  );
};

const STAGES = [
  { w: 230, la: 0.9 }, { w: 260, la: 1.0 }, { w: 290, la: 0.8 }, { w: 320, la: 1.3 },
  { w: 350, la: 1.9 }, { w: 380, la: 2.7 }, { w: 410, la: 3.9 }, { w: 440, la: 5.8 }, { w: 470, la: 8.0 },
];

/** The lactate curve — click a stage to read it back. */
export const LactateTestCard = () => {
  const [sel, setSel] = useState(6);
  const pts = scalePoints(STAGES.map((s) => s.la), 320, 150);
  const lt1x = pts[4][0];
  const lt2x = pts[6][0];
  const s = STAGES[sel];
  return (
    <div className="lcui-card">
      <div className="lcui-hdr">
        <div>
          <div className="lcui-card-title">Last lactate test</div>
          <div className="lcui-card-sub">Mar 9 · 9 stages · 230→470 W</div>
        </div>
        <span className="lcui-pill" style={{ background: '#EEF0F8', color: '#5E6590' }}>
          {s.w} W · {s.la.toFixed(1)} mmol
        </span>
      </div>
      <svg width="100%" height="160" viewBox="0 0 320 170" role="img" aria-label="Lactate curve with LT1 and LT2 marked">
        <polygon points={toPath([[0, 150], ...pts, [320, 150]])} fill="rgba(29,44,76,.06)" />
        <line x1={lt1x} y1="0" x2={lt1x} y2="150" stroke="#16A34A" strokeWidth="1.5" strokeDasharray="4,4" />
        <line x1={lt2x} y1="0" x2={lt2x} y2="150" stroke="#E05347" strokeWidth="1.5" strokeDasharray="4,4" />
        <polyline points={toPath(pts)} fill="none" stroke="#1D2C4C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={STAGES[i].w} className="lcui-dot" cx={p[0]} cy={p[1]} r={i === sel ? 6 : 4}
            fill={i === sel ? '#767EB5' : '#fff'} stroke={i === sel ? '#5E6590' : '#1D2C4C'} strokeWidth="2.5"
            onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}
          />
        ))}
      </svg>
      <div className="lcui-row" style={{ marginTop: 12 }}>
        <div className="lcui-thresh lcui-thresh-lt1" data-tip="Aerobic threshold">
          <div className="lcui-thresh-lbl" style={{ color: '#16A34A' }}>LT1</div>
          <div className="lcui-thresh-val">350<span className="lcui-unit">W</span></div>
          <div className="lcui-thresh-sub">1.9 mmol · <b>141</b> bpm</div>
        </div>
        <div className="lcui-thresh lcui-thresh-lt2" data-tip="Anaerobic threshold">
          <div className="lcui-thresh-lbl" style={{ color: '#DC5A45' }}>LT2</div>
          <div className="lcui-thresh-val">415<span className="lcui-unit">W</span></div>
          <div className="lcui-thresh-sub">4.0 mmol · <b>159</b> bpm</div>
        </div>
      </div>
      <div className="lcui-hint">Tap a stage to read it back</div>
    </div>
  );
};

const ZONES = [
  ['Z1', '#599FD0', '175–315 W', '71–127', 'Active recovery'],
  ['Z2', '#2DBFB0', '315–350 W', '127–141', 'Endurance — below LT1'],
  ['Z3', '#F5C542', '350–415 W', '141–159', 'Tempo — between the thresholds'],
  ['Z4', '#F5824A', '415–432 W', '159–165', 'Threshold — at LT2'],
  ['Z5', '#E05347', '432–457 W', '165–174', 'VO₂max — above LT2'],
];

/** Zones generated out of the test — power and heart rate side by side. */
export const ZonesCard = () => {
  const [sel, setSel] = useState(2);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 4 }}>
        <span className="lcui-eyebrow">Zones · Power · HR</span>
        <span className="lcui-link">✎ Edit</span>
      </div>
      {ZONES.map(([z, c, w, hr, tip], i) => (
        <div
          key={z} className={`lcui-zrow${i === sel ? ' lcui-on' : ''}`} data-tip={tip}
          onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
        >
          <span><i className="lcui-zdot" style={{ background: c }} />{z}</span>
          <span>{w}</span>
          <span style={{ color: '#DC5A45' }}>{hr}</span>
        </div>
      ))}
    </div>
  );
};

const FORM_STATES = [
  { tsb: '+25', frac: 0.78, label: 'Fresh', ring: '#22C55E', pill: ['#DCFCE7', '#16A34A'], ctl: 59, atl: 31, tip: 'TSB between 5 and 25 — ready to race' },
  { tsb: '-14', frac: 0.42, label: 'Building', ring: '#F59E0B', pill: ['#FEF3C7', '#B45309'], ctl: 66, atl: 82, tip: 'TSB below -10 — a productive training block' },
  { tsb: '-31', frac: 0.2, label: 'Overreaching', ring: '#E05347', pill: ['#FCE9E7', '#DC5A45'], ctl: 71, atl: 104, tip: 'TSB below -30 — back off or plan a rest week' },
];

/** Form today — click through the states a training block moves you between. */
export const FormCard = () => {
  const [i, setI] = useState(0);
  const f = FORM_STATES[i];
  const R = 40;
  const C = 2 * Math.PI * R;
  return (
    <div className="lcui-card lcui-card-row" onClick={() => setI((n) => (n + 1) % FORM_STATES.length)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setI((n) => (n + 1) % FORM_STATES.length); }}>
      <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`Training stress balance ${f.tsb}, ${f.label}`}>
        <circle cx="48" cy="48" r={R} fill="none" stroke="#EEF0F3" strokeWidth="9" />
        <circle
          cx="48" cy="48" r={R} fill="none" stroke={f.ring} strokeWidth="9" strokeLinecap="round"
          transform="rotate(-90 48 48)" strokeDasharray={`${C * f.frac} ${C}`}
          style={{ transition: 'stroke-dasharray .45s cubic-bezier(.2,.7,.2,1), stroke .3s' }}
        />
        <text x="48" y="46" textAnchor="middle" fontSize="20" fontWeight="800" fill="#1D2C4C">{f.tsb}</text>
        <text x="48" y="62" textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="1" fill="#9AA1B2">TSB</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
        <span className="lcui-pill" style={{ background: f.pill[0], color: f.pill[1] }} data-tip={f.tip}>
          <i className="lcui-pill-dot" style={{ background: f.pill[1] }} />{f.label}
        </span>
        <div className="lcui-row">
          <div className="lcui-stat" data-tip="Chronic load (CTL)"><div className="lcui-stat-lbl">Fitness</div><div className="lcui-stat-val">{f.ctl}</div></div>
          <div className="lcui-stat" data-tip="Acute load (ATL)"><div className="lcui-stat-lbl">Fatigue</div><div className="lcui-stat-val">{f.atl}</div></div>
        </div>
      </div>
    </div>
  );
};

const WEEK = [
  { d: 'M', tss: 97, s: 'Bike · 2h04 · endurance' },
  { d: 'T', tss: 109, s: 'Bike · 1h31 · 4×5min at LT2' },
  { d: 'W', tss: 101, s: 'Run · 1h10 · 7×4min' },
  { d: 'T', tss: 103, s: 'Bike · 2h20 · endurance' },
  { d: 'F', tss: 93, s: 'Swim + run · brick' },
  { d: 'S', tss: 14, s: 'Swim · 50min easy' },
  { d: 'S', tss: 0, s: 'Rest day' },
];

/** The training week — click a day to read the session behind the bar. */
export const WeekTssCard = () => {
  const [sel, setSel] = useState(1);
  const w = 330; const h = 110; const gap = 10;
  const max = Math.max(...WEEK.map((d) => d.tss));
  const barW = (w - gap * (WEEK.length - 1)) / WEEK.length;
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 14 }}>
        <span className="lcui-card-title" style={{ fontSize: 16 }}>This week</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>517 TSS · 16h 42m</span>
      </div>
      <svg width="100%" height="110" viewBox="0 0 330 110" role="img" aria-label="Daily training load across the week">
        {WEEK.map((d, i) => {
          const barH = Math.max((d.tss / max) * (h - 4), 2);
          return (
            <rect
              key={d.d + i} className="lcui-bar-hit" x={i * (barW + gap)} y={h - barH} width={barW} height={barH} rx="4"
              fill={i === sel ? '#5E6590' : '#767EB5'} opacity={i === sel ? 1 : 0.75}
              onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', marginTop: 6 }}>
        {WEEK.map((d, i) => (
          <div key={d.d + i} className={`lcui-daycol${i === sel ? ' lcui-on' : ''}`} onClick={() => setSel(i)}>
            {d.d}<div>{d.tss || '·'}</div>
          </div>
        ))}
      </div>
      <div className="lcui-readout">{WEEK[sel].s}</div>
    </div>
  );
};

const TREND = {
  Bike: {
    lt2: '415 W', lt1: '350 W', lt2d: '+12 W', lt1d: '+8 W',
    lt2s: [0.42, 0.35, 0.5, 0.72, 1.0], lt1s: [0.3, 0.28, 0.44, 0.66, 0.92],
  },
  Run: {
    lt2: '4:15 /km', lt1: '4:50 /km', lt2d: '−0:07', lt1d: '−0:05',
    lt2s: [0.3, 0.42, 0.4, 0.7, 0.95], lt1s: [0.25, 0.3, 0.48, 0.6, 0.88],
  },
};

/** Threshold movement across tests — the thing a returning client pays to see. */
export const ThresholdTrendCard = () => {
  const [sport, setSport] = useState('Bike');
  const t = TREND[sport];
  const lt2 = scalePoints(t.lt2s, 140, 60);
  const lt1 = scalePoints(t.lt1s, 140, 60);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 14 }}>
        <div>
          <div className="lcui-card-title" style={{ fontSize: 17 }}>Threshold trend</div>
          <div className="lcui-card-sub" style={{ margin: '2px 0 0' }}>LT1 &amp; LT2 over 8 tests</div>
        </div>
        <Segmented options={['Bike', 'Run']} value={sport} onChange={setSport} width={110} />
      </div>
      <div className="lcui-row">
        <div className="lcui-mini">
          <div className="lcui-mini-lbl" style={{ color: '#8B5CF6' }}>LT2 · THRESHOLD</div>
          <div className="lcui-mini-val">{t.lt2}</div>
          <span className="lcui-pill" style={{ background: '#E6F6EE', color: '#16A34A', padding: '3px 8px', fontSize: 11 }}>▲ {t.lt2d}</span>
          <svg width="100%" height="60" viewBox="0 0 140 60" style={{ marginTop: 8 }} aria-hidden="true">
            <polygon points={toPath([[0, 60], ...lt2, [140, 60]])} fill="rgba(29,44,76,.08)" />
            <polyline points={toPath(lt2)} fill="none" stroke="#1D2C4C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="lcui-mini">
          <div className="lcui-mini-lbl" style={{ color: '#16A34A' }}>LT1 · AEROBIC</div>
          <div className="lcui-mini-val">{t.lt1}</div>
          <span className="lcui-pill" style={{ background: '#E6F6EE', color: '#16A34A', padding: '3px 8px', fontSize: 11 }}>▲ {t.lt1d}</span>
          <svg width="100%" height="60" viewBox="0 0 140 60" style={{ marginTop: 8 }} aria-hidden="true">
            <polygon points={toPath([[0, 60], ...lt1, [140, 60]])} fill="rgba(59,130,246,.1)" />
            <polyline points={toPath(lt1)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
};

const CAL_LABEL = { '#F5824A': 'Run', '#3B82F6': 'Bike', '#2DBFB0': 'Swim', '#8B5CF6': 'Test' };

const CAL_DAYS = [
  { d: 27, dots: [], muted: true }, { d: 28, dots: [], muted: true }, { d: 29, dots: [], muted: true },
  { d: 30, dots: [], muted: true }, { d: 31, dots: [], muted: true }, { d: 1, dots: ['#F5824A'] }, { d: 2, dots: ['#3B82F6'] },
  { d: 3, dots: ['#F5824A', '#3B82F6'] }, { d: 4, dots: ['#3B82F6'] }, { d: 5, dots: ['#3B82F6', '#2DBFB0'] }, { d: 6, dots: ['#3B82F6'] },
  { d: 7, dots: [] }, { d: 8, dots: ['#8B5CF6'] }, { d: 9, dots: ['#8B5CF6', '#3B82F6'] },
  { d: 10, dots: ['#8B5CF6', '#3B82F6'] }, { d: 11, dots: ['#F5824A', '#3B82F6'] }, { d: 12, dots: ['#2DBFB0', '#3B82F6'] },
  { d: 13, dots: ['#2DBFB0'] }, { d: 14, dots: ['#3B82F6'] }, { d: 15, dots: ['#F5824A', '#3B82F6'] }, { d: 16, dots: ['#3B82F6', '#8B5CF6'] },
  { d: 17, dots: ['#8B5CF6', '#F5824A'] }, { d: 18, dots: ['#2DBFB0', '#3B82F6'] }, { d: 19, dots: ['#2DBFB0'] },
  { d: 20, dots: ['#3B82F6'] }, { d: 21, dots: ['#F5824A', '#3B82F6'] }, { d: 22, dots: ['#F5824A'] }, { d: 23, dots: ['#3B82F6', '#8B5CF6'] },
  { d: 24, dots: ['#F5824A', '#3B82F6'] }, { d: 25, dots: ['#2DBFB0'] }, { d: 26, dots: ['#2DBFB0', '#3B82F6'] },
  { d: 27, dots: ['#3B82F6'] }, { d: 28, dots: ['#3B82F6', '#F5824A'] }, { d: 29, dots: ['#3B82F6'] }, { d: 30, dots: ['#8B5CF6'] },
];

/** The planned month — click a day, the same as in the app. */
export const CalendarCard = () => {
  const [sel, setSel] = useState(34);
  return (
    <div className="lcui-card lcui-card-tight">
      <div className="lcui-hdr" style={{ padding: '0 4px 10px' }}>
        <span className="lcui-nav">‹</span>
        <b style={{ color: '#767EB5', letterSpacing: '.05em', fontSize: 13 }}>AUGUST 2026</b>
        <span className="lcui-nav">›</span>
      </div>
      <div className="lcui-cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={d + i} className="lcui-cal-dow">{d}</div>)}
      </div>
      <div className="lcui-cal">
        {CAL_DAYS.map((x, i) => (
          <div
            key={`${x.d}-${i}`}
            className={`lcui-cal-day${i === sel ? ' lcui-sel' : ''}${x.muted ? ' lcui-muted' : ''}`}
            data-tip={x.dots.length ? x.dots.map((c) => CAL_LABEL[c]).join(', ') : undefined}
            onClick={() => { if (!x.muted) setSel(i); }}
          >
            <div className="lcui-cal-num">{x.d}</div>
            <div className="lcui-cal-dots">
              {x.dots.map((c, j) => <i key={`${c}-${j}`} style={{ background: c }} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BikeIcon = ({ c }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" aria-hidden="true">
    <circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-9h4l4 9M10 8h5" />
  </svg>
);
const SwimIcon = ({ c }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8v8M8 8v8M13 8v8M18 8v8M3 6h18M3 18h18" />
  </svg>
);
const RunIcon = ({ c }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" aria-hidden="true">
    <circle cx="16" cy="5" r="2" /><path d="M9 20l3-6 -3-3 1-5 4 3 3 1M9 11l-4 2" />
  </svg>
);

const SPORT_STYLE = {
  Bike: { c: '#599FD0', bg: '#E9F2FB', Icon: BikeIcon },
  Swim: { c: '#2DBFB0', bg: '#E4F7F4', Icon: SwimIcon },
  Run: { c: '#F5824A', bg: '#FCEBE0', Icon: RunIcon },
};

const SESSIONS = [
  { sport: 'Bike', t: '2×29.5min + 2×45s', m: '3h55m · 106.45 km · 259 W · 179 TSS' },
  { sport: 'Swim', t: 'Afternoon Swim', m: '50m · 3.02 km · 1:41/100m · 45 TSS' },
  { sport: 'Run', t: '7×4min', m: '42m · 10.01 km · 4:14/km · 44 TSS' },
];

/** One day's sessions, the way they land after a sync. */
export const SessionListCard = () => {
  const [sel, setSel] = useState(0);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 12 }}>
        <span className="lcui-card-title" style={{ fontSize: 15 }}>Sat 29 August</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>3 sessions · 268 TSS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SESSIONS.map((s, i) => {
          const { c, bg, Icon } = SPORT_STYLE[s.sport];
          return (
            <div
              key={s.t} className={`lcui-session${i === sel ? ' lcui-on' : ''}`} style={{ borderLeftColor: c }}
              onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
            >
              <div className="lcui-session-ic" style={{ background: bg }}><Icon c={c} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lcui-session-t">{s.t}</div>
                <div className="lcui-session-m">{s.m}</div>
              </div>
              <span className="lcui-chev">›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RADAR = {
  Bike: {
    axes: ['5s', '1min', '5min', '20min', '60min'],
    all: [1, 1, 1, 1, 1],
    periods: { '30d': [0.42, 0.55, 0.8, 0.88, 0.94], '90d': [0.52, 0.68, 0.93, 0.97, 1.0], 'All time': [1, 1, 1, 1, 1] },
    color: '#3B82F6', fill: 'rgba(59,130,246,.28)',
  },
  Run: {
    axes: ['200m', '1km', '5km', '10km', 'HM'],
    all: [1, 1, 1, 1, 1],
    periods: { '30d': [0.36, 0.5, 0.72, 0.8, 0.84], '90d': [0.4, 0.58, 0.8, 0.9, 0.88], 'All time': [1, 1, 1, 1, 1] },
    color: '#F5824A', fill: 'rgba(245,130,74,.25)',
  },
};

/** Peak efforts across durations — switch sport and comparison window. */
export const PowerRadarCard = () => {
  const [sport, setSport] = useState('Bike');
  const [period, setPeriod] = useState('90d');
  const r = RADAR[sport];
  const cx = 170; const cy = 148; const maxR = 100; const n = 5;
  const recent = r.periods[period];
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 4 }}>
        <div>
          <div className="lcui-card-title" style={{ fontSize: 17 }}>{sport === 'Bike' ? 'Power' : 'Pace'} Radar</div>
          <div className="lcui-card-sub" style={{ margin: '2px 0 0' }}>Best efforts across durations</div>
        </div>
        <Segmented options={['Bike', 'Run']} value={sport} onChange={setSport} width={110} />
      </div>
      <div className="lcui-filters" style={{ margin: '10px 0 2px' }}>
        <span className="lcui-eyebrow" style={{ alignSelf: 'center' }}>Compare</span>
        {['30d', '90d', 'All time'].map((p) => (
          <Pill key={p} active={p === period} onClick={() => setPeriod(p)}>{p}</Pill>
        ))}
      </div>
      <svg width="100%" height="240" viewBox="0 0 340 275" role="img" aria-label={`Best efforts across durations, ${period} against all time`}>
        {[0.25, 0.5, 0.75, 1].map((l) => (
          <polygon key={l} points={toPath(Array.from({ length: n }, (_, i) => polar(cx, cy, maxR * l, (i * 360) / n)))}
            fill="none" stroke="#E2E4EC" strokeWidth="1" />
        ))}
        {r.axes.map((a, i) => {
          const p = polar(cx, cy, maxR, (i * 360) / n);
          const l = polar(cx, cy, maxR + 18, (i * 360) / n);
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="#E2E4EC" strokeWidth="1" />
              <text x={l[0]} y={l[1] + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#9AA1B2">{a}</text>
            </g>
          );
        })}
        <polygon points={toPath(r.all.map((v, i) => polar(cx, cy, maxR * v, (i * 360) / n)))}
          fill="rgba(185,190,201,.15)" stroke="#B9BEC9" strokeWidth="2" />
        <polygon points={toPath(recent.map((v, i) => polar(cx, cy, maxR * v, (i * 360) / n)))}
          fill={r.fill} stroke={r.color} strokeWidth="2" style={{ transition: 'all .35s cubic-bezier(.2,.7,.2,1)' }} />
        {recent.map((v, i) => {
          const p = polar(cx, cy, maxR * v, (i * 360) / n);
          return <circle key={r.axes[i]} cx={p[0]} cy={p[1]} r="4" fill={r.color} />;
        })}
      </svg>
      <div className="lcui-legend">
        <span><i className="lcui-zdot" style={{ background: '#B9BEC9' }} />All time</span>
        <span><i className="lcui-zdot" style={{ background: r.color }} />{period === 'All time' ? 'Same window' : `Past ${period}`}</span>
      </div>
    </div>
  );
};

const TIZ = [
  ['Z1', '#599FD0', 28, '41m', 'Below LT1'],
  ['Z2', '#2DBFB0', 22, '31m', 'At LT1'],
  ['Z3', '#F5C542', 11, '16m', 'Between the thresholds'],
  ['Z4', '#F5824A', 30, '43m', 'At LT2'],
  ['Z5', '#E05347', 9, '13m', 'Above LT2'],
];

/** Where the session actually sat against the measured thresholds. */
export const TimeInZonesCard = () => {
  const [sel, setSel] = useState(3);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 10 }}>
        <span className="lcui-eyebrow">Time in zones</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>LT2 415 W · 2h24m</span>
      </div>
      <div className="lcui-bar">
        {TIZ.map(([z, c, pct], i) => (
          <div
            key={z} style={{ width: `${pct}%`, background: c, opacity: i === sel ? 1 : 0.68 }}
            onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}
          >
            {pct >= 10 ? `${pct}%` : ''}
          </div>
        ))}
      </div>
      <div className="lcui-tiz">
        {TIZ.map(([z, c, pct, time], i) => (
          <div key={z} className={i === sel ? 'lcui-on' : undefined} onClick={() => setSel(i)}>
            <i className="lcui-zdot" style={{ background: c }} />{z}
            <div>{time}<br /><span style={{ color: '#9AA1B2' }}>{pct}%</span></div>
          </div>
        ))}
      </div>
      <div className="lcui-readout">{TIZ[sel][4]} · {TIZ[sel][3]}</div>
    </div>
  );
};

const TH_DATA = {
  Power: { values: [230, 270, 310, 295, 315, 225, 340, 378, 378, 382, 390, 300, 255, 215], color: '#767EB5', fmt: (v) => `${v} W` },
  HR: { values: [110, 118, 125, 121, 128, 112, 135, 142, 141, 144, 146, 130, 120, 115], color: '#E05347', fmt: (v) => `${v} bpm` },
  Lactate: { values: [1.2, 1.4, 1.6, 1.5, 1.8, 1.3, 2.4, 3.1, 3.3, 3.6, 4.0, 2.2, 1.9, 1.6], color: '#2DBFB0', fmt: (v) => `${v.toFixed(1)} mmol` },
  RPE: { values: [4, 5, 6, 5, 6, 4, 7, 8, 8, 8, 9, 6, 5, 4], color: '#F5824A', fmt: (v) => `RPE ${v}` },
};

/** The same interval across every time it has been done — the analysis card. */
export const TrainingHistoryCard = () => {
  const [metric, setMetric] = useState('Power');
  const [kind, setKind] = useState('Bars');
  const [sel, setSel] = useState(10);
  const { values, color, fmt } = TH_DATA[metric];
  const w = 300; const h = 150;
  const max = Math.max(...values);
  const gap = 5;
  const barW = (w - gap * (values.length - 1)) / values.length;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / max) * (h - 4)]);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 12 }}>
        <span className="lcui-eyebrow">Training history</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>4×15min · 6 of 175</span>
      </div>
      <Segmented options={['Power', 'HR', 'Lactate', 'RPE']} value={metric} onChange={setMetric} style={{ marginBottom: 8 }} />
      <Segmented options={['Bars', 'Line', 'Trace']} value={kind} onChange={setKind} style={{ marginBottom: 12 }} />
      <div style={{ background: '#F7F8FA', borderRadius: 14, padding: 14 }}>
        <svg width="100%" height="150" viewBox="0 0 300 155" role="img" aria-label={`${metric} across every lap of this session`}>
          {kind === 'Bars' && values.map((v, i) => {
            const bh = (v / max) * (h - 4);
            return (
              <rect
                key={i} className="lcui-bar-hit" x={i * (barW + gap)} y={h - bh} width={barW} height={bh} rx="4"
                fill={color} opacity={i === sel ? 1 : 0.45}
                onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}
              />
            );
          })}
          {kind === 'Line' && (
            <>
              <polygon points={toPath([[0, h], ...pts, [w, h]])} fill={`${color}22`} />
              <polyline points={toPath(pts)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {kind === 'Trace' && (
            <polyline points={toPath(pts)} fill="none" stroke={color} strokeWidth="1" strokeDasharray="2,4" />
          )}
          {kind !== 'Bars' && pts.map((p, i) => (
            <circle
              key={i} className="lcui-dot" cx={p[0]} cy={p[1]} r={i === sel ? 5.5 : 3.5}
              fill={i === sel ? color : '#fff'} stroke={color} strokeWidth="2"
              onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}
            />
          ))}
        </svg>
        <div className="lcui-readout" style={{ marginTop: 2 }}>Lap {sel + 1} · {fmt(values[sel])}</div>
      </div>
    </div>
  );
};

const CATEGORIES = [
  ['All', '#555', 316], ['Endurance', '#599FD0', 14], ['LT1', '#2DBFB0', 11], ['LT2', '#8B5CF6', 25], ['VO₂max', '#E05347', 3],
];

const LIBRARY = [
  { cat: 'LT2', sport: 'Run', t: '5×1.5min + 2×3min', m: 'Today · 1h · 4.20 km · 21 laps' },
  { cat: 'LT1', sport: 'Bike', t: '2×11.5min + 2×6min', m: 'Yesterday · 1h 10m · 5 km · 20 laps' },
  { cat: 'LT2', sport: 'Bike', t: '4×5min + 4×3min', m: 'Yesterday · 1h 31m · 58.17 km · 234 W' },
  { cat: 'Endurance', sport: 'Bike', t: 'Long steady ride', m: '2d ago · 3h 55m · 106.45 km · 259 W' },
  { cat: 'VO₂max', sport: 'Run', t: '8×400m', m: '3d ago · 44m · 11.76 km · 14 laps' },
  { cat: 'Endurance', sport: 'Swim', t: 'Aerobic swim', m: '4d ago · 50m · 3.02 km · 1:41/100m' },
];

/** The workout library, grouped the way the app classifies sessions. */
export const IntervalTrainingsCard = () => {
  const [cat, setCat] = useState('All');
  const shown = LIBRARY.filter((s) => cat === 'All' || s.cat === cat).slice(0, 4);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 12 }}>
        <span className="lcui-eyebrow">Interval trainings</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>316 sessions</span>
      </div>
      <div className="lcui-filters" style={{ marginBottom: 14 }}>
        {CATEGORIES.map(([c, dot, n]) => (
          <Pill key={c} dot={dot} active={c === cat} onClick={() => setCat(c)}>{c} {n}</Pill>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 168 }}>
        {shown.map((s) => {
          const { c, bg, Icon } = SPORT_STYLE[s.sport];
          return (
            <div key={s.t} className="lcui-session" style={{ borderLeftColor: c }}>
              <div className="lcui-session-ic" style={{ background: bg }}><Icon c={c} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lcui-session-t">{s.t}</div>
                <div className="lcui-session-m">{s.m}</div>
              </div>
              <span className="lcui-chev">›</span>
            </div>
          );
        })}
        {!shown.length && <div className="lcui-readout">Nothing in this category yet</div>}
      </div>
    </div>
  );
};

const SERIES = [
  { k: 'Power', color: '#8B5CF6', bg: '#F3EFFB', op: 0.22 },
  { k: 'Heart Rate', color: '#E05347', bg: '#FCE9E7', op: 0.12 },
  { k: 'Speed', color: '#2DBFB0', bg: '#E4F7F4', op: 0.12 },
];

const STREAM = (() => {
  const n = 40;
  const out = { Power: [], 'Heart Rate': [], Speed: [] };
  for (let i = 0; i < n; i += 1) {
    const base = 45 + (i / n) * 10;
    const hard = [[6, 9], [12, 15], [18, 21], [24, 27], [30, 33]].some(([a, b]) => i >= a && i < b);
    out.Power.push(hard ? 82 + Math.sin(i) * 4 : (i % 6 === 0 ? 48 : base + 2));
    out['Heart Rate'].push(hard ? 78 + Math.sin(i) * 3 : base + 18);
    out.Speed.push(hard ? 88 + Math.sin(i) * 3 : base + 22);
  }
  return out;
})();

/** The session's streams — click a legend chip to drop a series. */
export const WorkoutGraphCard = () => {
  const [off, setOff] = useState([]);
  const toggle = (k) => setOff((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const w = 320; const h = 170;
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 12 }}>
        <div>
          <div className="lcui-card-title" style={{ fontSize: 17 }}>Bike LT2</div>
          <div className="lcui-card-sub" style={{ margin: '2px 0 0' }}>Sat 29 Aug · 2h24m · 106 km</div>
        </div>
        <span className="lcui-pill" style={{ background: '#EEF0F8', color: '#5E6590' }}>IF 0.86</span>
      </div>
      <div className="lcui-filters" style={{ marginBottom: 10 }}>
        {SERIES.map((s) => (
          <button
            key={s.k} type="button" onClick={() => toggle(s.k)}
            className={`lcui-chip${off.includes(s.k) ? ' lcui-off' : ''}`}
            style={{ background: s.bg, color: s.color }}
            aria-pressed={!off.includes(s.k)}
          >
            ● {s.k}
          </button>
        ))}
      </div>
      <svg width="100%" height="170" viewBox="0 0 320 170" role="img" aria-label="Power, heart rate and speed across the session">
        {[20, 40, 60, 80, 100].map((v) => {
          const y = h - (v / 100) * h;
          return <line key={v} x1="0" y1={y} x2={w} y2={y} stroke="#EEF0F3" strokeWidth="1" />;
        })}
        {SERIES.filter((s) => !off.includes(s.k)).reverse().map((s) => {
          const pts = STREAM[s.k].map((v, i) => [(i / (STREAM[s.k].length - 1)) * w, h - (v / 100) * h]);
          return (
            <g key={s.k}>
              <polygon points={toPath([[0, h], ...pts, [w, h]])} fill={s.color} opacity={s.op} />
              <polyline points={toPath(pts)} fill="none" stroke={s.color} strokeWidth="1.8" />
            </g>
          );
        })}
      </svg>
      <div className="lcui-hint">Chips toggle a series, the way they do in the app</div>
    </div>
  );
};

const LAPS = [
  ['1', '5:00', '3.09 km', '206 W', '109', '#F5A623'],
  ['2', '4:59', '3.28 km', '245 W', '116', '#2DBFB0'],
  ['3', '5:00', '3.47 km', '283 W', '125', '#2DBFB0'],
  ['4', '4:59', '3.62 km', '319 W', '132', '#8B5CF6'],
  ['5', '10:00', '7.00 km', '287 W', '125', '#2DBFB0'],
  ['6', '6:00', '4.26 km', '298 W', '125', '#2DBFB0'],
];

/** Laps, hoverable and selectable — the table under every workout. */
export const LapsTableCard = () => {
  const [sel, setSel] = useState(3);
  return (
    <div className="lcui-card lcui-card-flush">
      <div className="lcui-laps-hdr">
        <span>#</span><span>TIME</span><span>DIST</span><span>PWR</span><span>HR</span><span>LA</span>
      </div>
      {LAPS.map((l, i) => (
        <div
          key={l[0]} className={`lcui-lap${i === sel ? ' lcui-on' : ''}`} style={{ borderLeftColor: l[5] }}
          onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
        >
          <span style={{ color: l[5] }}>{l[0]}</span><span>{l[1]}</span><span>{l[2]}</span>
          <span>{l[3]}</span><span>{l[4]}</span><span style={{ color: '#8B5CF6' }}>+</span>
        </div>
      ))}
    </div>
  );
};

const METRICS = {
  HRV: { value: '86.1', unit: 'ms', range: '41–100 ms', color: '#16A34A', band: '#DCFCE7', min: 0, max: 180, avg: 71, tab: '86.1', data: [71, 38, 45, 46, 165, 50, 112, 48, 70, 32, 88, 38, 68, 80, 105, 58, 64, 100, 52, 84, 58, 74, 86] },
  Sleep: { value: '7:39', unit: 'h', range: '6:30–9:00 h', color: '#3B82F6', band: '#DBEAFE', min: 5, max: 9, avg: 7.3, tab: '7:39', data: [6.9, 7.1, 6.5, 7.8, 8.2, 7.0, 6.2, 7.5, 8.0, 7.3, 6.8, 7.9, 8.1, 7.2, 6.6, 7.4, 7.7, 8.3, 6.9, 7.1, 7.6, 7.8, 7.65] },
  'Rest HR': { value: '46', unit: 'bpm', range: '40–55 bpm', color: '#E05347', band: '#FCE9E7', min: 35, max: 60, avg: 47, tab: '46', data: [48, 52, 45, 44, 50, 55, 42, 47, 49, 51, 44, 46, 48, 53, 45, 44, 47, 49, 46, 45, 48, 47, 46] },
  'Low HR': { value: '36', unit: 'bpm', range: '35–45 bpm', color: '#2DBFB0', band: '#E4F7F4', min: 30, max: 48, avg: 37, tab: '36', data: [38, 40, 35, 37, 41, 39, 36, 38, 40, 37, 35, 36, 39, 41, 38, 37, 36, 39, 38, 37, 36, 38, 36] },
};

/** Apple Health metrics — tap a tab, the chart follows. */
export const HealthMetricsCard = () => {
  const [key, setKey] = useState('HRV');
  const m = METRICS[key];
  const w = 320; const h = 150; const pad = 10;
  const y = (v) => pad + (h - pad * 2) - ((v - m.min) / (m.max - m.min)) * (h - pad * 2);
  const pts = m.data.map((v, i) => [(i / (m.data.length - 1)) * w, y(v)]);
  return (
    <div className="lcui-card">
      <div className="lcui-sheet-tabs">
        {Object.keys(METRICS).map((k) => (
          <button
            key={k} type="button" onClick={() => setKey(k)}
            className={`lcui-sheet-tab${k === key ? ' lcui-on' : ''}`} aria-pressed={k === key}
          >
            {k}<span>{METRICS[k].tab}</span>
          </button>
        ))}
      </div>
      <div className="lcui-hdr" style={{ alignItems: 'flex-start', marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 28, color: '#0A0E1A' }}>{m.value}<span className="lcui-unit">{m.unit}</span></div>
        <span className="lcui-pill lcui-pill-green" data-tip={`Normal range ${m.range}`}>In your normal range</span>
      </div>
      <div className="lcui-card-sub" style={{ margin: '2px 0 10px' }}>Last 30 days · normal {m.range}</div>
      <svg width="100%" height="150" viewBox="0 0 320 150" role="img" aria-label={`${key} over the last 30 days`}>
        <rect x="0" y="0" width={w} height={h} fill={m.band} opacity=".45" rx="10" />
        <line x1="0" y1={y(m.avg)} x2={w} y2={y(m.avg)} stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" />
        <polyline points={toPath(pts)} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {[0, 6, 12, 18, pts.length - 1].map((i) => <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="4" fill={m.color} />)}
      </svg>
    </div>
  );
};

/** Every attempt at one planned session, best to worst. */
export const ProgressCard = () => {
  const rows = [
    ['29 Aug', '4×15min', '274 W', true],
    ['15 Aug', '4×15min', '281 W', true],
    ['1 Aug', '4×15min', '268 W', true],
  ];
  const [sel, setSel] = useState(0);
  return (
    <div className="lcui-card">
      <div className="lcui-hdr" style={{ marginBottom: 10 }}>
        <span className="lcui-card-title" style={{ fontSize: 16 }}>Progress</span>
        <span className="lcui-card-sub" style={{ margin: 0 }}>Planned vs done</span>
      </div>
      {rows.map(([d, t, p], i) => (
        <div key={d} className={`lcui-zrow${i === sel ? ' lcui-on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
          <span><i className="lcui-tick">✓</i>{d}</span>
          <span style={{ color: '#8B93A7' }}>{t}</span>
          <span style={{ fontWeight: 800 }}>{p}</span>
        </div>
      ))}
      <div className="lcui-readout">Completed as planned · 100% compliance</div>
    </div>
  );
};

/* ── Photo + card composition ─────────────────────────────────────────── */

/**
 * A marketing photograph with app cards laid over it.
 *
 * `cards[0]` sits bottom-left, `cards[1]` top-right. Placement is percentage
 * based so it holds at any container width, and `cardScale` shrinks the cards
 * where the photograph underneath is busy enough that a full-size one competes
 * with it. Below 820 px both leave the
 * absolute layer — the first drops under the photo overlapping its bottom
 * edge, the second is not rendered, because a stack of two full-width cards
 * under a photo is a list, not an overlap.
 */
export const PhotoShowcase = ({
  src, alt, ratio = '16 / 9', priority = false, width, height, cards = [], className = '',
  cardScale = 1,
}) => (
  <div className={`lcui-shot ${className}`} style={{ '--lcui-ratio': ratio, '--lcui-s': cardScale }}>
    <img
      className="lcui-shot-img" src={src} alt={alt}
      loading={priority ? 'eager' : 'lazy'} width={width} height={height}
    />
    <div className="lcui-shot-scrim" aria-hidden="true" />
    {cards[0] && <div className="lcui-shot-card lcui-shot-a">{cards[0]}</div>}
    {cards[1] && <div className="lcui-shot-card lcui-shot-b">{cards[1]}</div>}
  </div>
);

/* ── Stylesheet ───────────────────────────────────────────────────────────
   Every selector is `lcui-`-prefixed. marketingKit's sheet owns .lc-*, the app
   owns Tailwind's utilities, and the component library's .card / .grid / .row
   never make it into the bundle. */
export const APP_CARDS_STYLE = `
  .lcui-card {
    width: 361px; max-width: 100%;
    background: #fff; border-radius: 18px; padding: 18px;
    font-family: 'Hind Vadodara', system-ui, -apple-system, sans-serif;
    color: #1D2C4C; text-align: left;
    box-shadow: 0 24px 60px -14px rgba(10,14,26,.45), 0 2px 6px rgba(10,14,26,.10);
    transition: transform .28s cubic-bezier(.2,.7,.2,1), box-shadow .28s cubic-bezier(.2,.7,.2,1);
  }
  .lcui-card:hover { transform: translateY(-4px); box-shadow: 0 34px 70px -16px rgba(10,14,26,.5), 0 3px 8px rgba(10,14,26,.12); }
  .lcui-card-tight { padding: 14px 14px 6px; }
  .lcui-card-flush { padding: 0; overflow: hidden; }
  .lcui-card-row { display: flex; gap: 20px; align-items: center; cursor: pointer; }
  .lcui-card-title { font-weight: 800; font-size: 19px; color: #0A0E1A; letter-spacing: -.01em; }
  .lcui-card-sub { font-weight: 600; font-size: 13px; color: #8B93A7; margin: 2px 0 12px; }
  .lcui-hdr { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .lcui-row { display: flex; gap: 10px; }
  .lcui-row > * { flex: 1; min-width: 0; }
  .lcui-eyebrow { font-weight: 800; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8B93A7; }
  .lcui-link { font-weight: 700; font-size: 13px; color: #767EB5; cursor: pointer; }
  .lcui-nav { color: #B0B6C4; cursor: pointer; padding: 0 4px; }
  .lcui-nav:hover { color: #767EB5; }
  .lcui-unit { font-weight: 600; font-size: 15px; color: #8B93A7; margin-left: 3px; }
  .lcui-hint, .lcui-readout { font-weight: 600; font-size: 12px; color: #9AA1B2; text-align: center; margin-top: 10px; }
  .lcui-readout { color: #4A5E82; }

  .lcui-thresh { border-radius: 14px; padding: 14px 16px; transition: transform .15s, box-shadow .15s; }
  .lcui-thresh:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(10,14,26,.10); }
  .lcui-thresh-lt1 { background: #E6F6EE; }
  .lcui-thresh-lt2 { background: #FCE9E7; }
  .lcui-thresh-lbl { font-weight: 800; font-size: 11px; letter-spacing: .05em; }
  .lcui-thresh-val { font-weight: 800; font-size: 26px; color: #0A0E1A; margin: 4px 0; }
  .lcui-thresh-sub { font-weight: 600; font-size: 12px; color: #6B7280; }

  .lcui-stat { background: #F7F8FA; border: 1px solid #F1F2F5; border-radius: 12px; padding: 10px 12px; transition: transform .15s, box-shadow .15s; }
  .lcui-stat:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(10,14,26,.08); }
  .lcui-stat-lbl { font-weight: 700; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #9AA1B2; margin-bottom: 4px; }
  .lcui-stat-val { font-weight: 800; font-size: 20px; color: #0A0E1A; }

  .lcui-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 999px; font-weight: 700; font-size: 12px; width: fit-content; }
  .lcui-pill-green { background: #DCFCE7; color: #16A34A; }
  .lcui-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: #16A34A; }

  .lcui-seg { display: flex; background: #EEF0F3; border-radius: 12px; padding: 3px; gap: 2px; flex-shrink: 0; }
  .lcui-seg-btn {
    flex: 1; text-align: center; padding: 7px 6px; border: none; background: none;
    border-radius: 9px; font: 700 12.5px inherit; color: #7B8296; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .lcui-seg-btn:not(.lcui-on):hover { background: rgba(255,255,255,.7); color: #4A5E82; }
  .lcui-seg-btn.lcui-on { background: #fff; color: #1D2C4C; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

  .lcui-filters { display: flex; gap: 7px; flex-wrap: wrap; }
  .lcui-filter {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 11px; border-radius: 999px;
    background: #fff; border: 1px solid #E5E7EB;
    font: 700 12px inherit; color: #374151; cursor: pointer;
    transition: background .15s, color .15s, border-color .15s, transform .15s;
  }
  .lcui-filter:hover { background: #E9ECF6; border-color: transparent; transform: translateY(-1px); }
  .lcui-filter.lcui-on { background: #767EB5; border-color: transparent; color: #fff; }
  .lcui-fdot { width: 7px; height: 7px; border-radius: 50%; }

  .lcui-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px; border: none;
    font: 700 12px inherit; cursor: pointer;
    transition: opacity .15s, transform .15s;
  }
  .lcui-chip:hover { transform: translateY(-1px); }
  .lcui-chip.lcui-off { opacity: .35; }

  .lcui-mini { background: #F7F8FA; border-radius: 14px; padding: 14px; }
  .lcui-mini-lbl { font-weight: 800; font-size: 11px; letter-spacing: .05em; }
  .lcui-mini-val { font-weight: 800; font-size: 22px; margin: 6px 0; color: #0A0E1A; }

  .lcui-zrow {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 8px; margin: 0 -8px; border-radius: 8px;
    border-bottom: 1px solid #F1F2F5; font-weight: 600; font-size: 14px;
    cursor: pointer; transition: background .15s;
  }
  .lcui-zrow:last-child { border-bottom: none; }
  .lcui-zrow:hover { background: #F7F8FA; }
  .lcui-zrow.lcui-on { background: #EEF0F8; }
  .lcui-zdot { width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; display: inline-block; vertical-align: middle; }
  .lcui-tick { width: 18px; height: 18px; border-radius: 50%; background: #767EB5; color: #fff; font-size: 11px; font-style: normal; display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; vertical-align: middle; }

  .lcui-daycol { flex: 1; text-align: center; font-weight: 700; font-size: 11px; color: #9AA1B2; cursor: pointer; border-radius: 8px; padding: 2px 0; transition: background .15s; }
  .lcui-daycol:hover { background: #F7F8FA; }
  .lcui-daycol.lcui-on { background: #EEF0F8; color: #5E6590; }
  .lcui-daycol > div { color: #1D2C4C; font-size: 13px; margin-top: 2px; }
  .lcui-bar-hit { cursor: pointer; transition: opacity .15s, fill .15s; }

  .lcui-cal { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }
  .lcui-cal-dow { font-weight: 700; font-size: 10px; color: #9AA1B2; padding: 4px 0 8px; letter-spacing: .05em; }
  .lcui-cal-day { padding: 5px 0 8px; font-weight: 600; font-size: 13px; color: #1D2C4C; cursor: pointer; border-radius: 10px; transition: background .15s; }
  .lcui-cal-day.lcui-muted { color: #C7CBD6; cursor: default; }
  .lcui-cal-day:hover:not(.lcui-muted) .lcui-cal-num { background: #EEF0F8; }
  .lcui-cal-num { width: 24px; height: 24px; line-height: 24px; border-radius: 50%; margin: 0 auto 4px; transition: background .15s, color .15s; }
  .lcui-cal-day.lcui-sel .lcui-cal-num { background: #767EB5; color: #fff; }
  .lcui-cal-dots { display: flex; gap: 2px; justify-content: center; height: 5px; }
  .lcui-cal-dots i { width: 4px; height: 4px; border-radius: 50%; display: block; }

  .lcui-session {
    display: flex; align-items: center; gap: 12px; background: #fff;
    border-radius: 14px; padding: 10px 12px; border-left: 4px solid;
    box-shadow: 0 1px 3px rgba(10,14,26,.08); cursor: pointer;
    transition: transform .15s, box-shadow .15s, background .15s;
  }
  .lcui-session:hover, .lcui-session.lcui-on { transform: translateX(3px); box-shadow: 0 6px 16px rgba(10,14,26,.12); }
  .lcui-session-ic { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .lcui-session-t { font-weight: 700; font-size: 14.5px; color: #0A0E1A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lcui-session-m { font-weight: 500; font-size: 12px; color: #8B93A7; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lcui-chev { color: #C7CBD6; transition: transform .15s; }
  .lcui-session:hover .lcui-chev { transform: translateX(3px); }

  .lcui-legend { display: flex; justify-content: center; gap: 20px; margin-top: 4px; font-weight: 600; font-size: 13px; color: #374151; }

  .lcui-bar { display: flex; height: 26px; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
  .lcui-bar > div { display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 11px; cursor: pointer; transition: opacity .15s; }
  .lcui-tiz { display: flex; justify-content: space-between; text-align: center; font-weight: 600; font-size: 12px; }
  .lcui-tiz > div { cursor: pointer; padding: 4px 6px; border-radius: 8px; transition: background .15s; }
  .lcui-tiz > div:hover, .lcui-tiz > div.lcui-on { background: #F7F8FA; }

  .lcui-sheet-tabs { display: flex; gap: 6px; }
  .lcui-sheet-tab {
    flex: 1; text-align: center; padding: 8px 4px; border: none; background: none;
    border-radius: 12px; font: 600 11.5px inherit; color: #8B93A7; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .lcui-sheet-tab span { display: block; font-weight: 800; font-size: 14px; color: #0A0E1A; }
  .lcui-sheet-tab:hover { background: #F7F8FA; }
  .lcui-sheet-tab.lcui-on { background: #F1F2F6; color: #4A5E82; }

  .lcui-laps-hdr, .lcui-lap {
    display: grid; grid-template-columns: .5fr 1fr 1.1fr 1fr .7fr .5fr;
    align-items: center; padding: 10px 14px; gap: 4px;
  }
  .lcui-laps-hdr { font-weight: 800; font-size: 11px; color: #9AA1B2; border-bottom: 1px solid #F1F2F5; }
  .lcui-lap { font-weight: 700; font-size: 13px; border-left: 4px solid; cursor: pointer; transition: background .15s; }
  .lcui-lap:hover, .lcui-lap.lcui-on { background: #F7F8FA; }

  .lcui-dot { cursor: pointer; transition: r .15s, fill .15s; }

  /* Tooltips — the library's data-tip, prefixed and scoped. */
  .lcui-card [data-tip] { position: relative; }
  .lcui-card [data-tip]::after {
    content: attr(data-tip); position: absolute;
    bottom: calc(100% + 9px); left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: #1D2C4C; color: #fff; font: 600 11.5px inherit;
    padding: 6px 11px; border-radius: 8px; white-space: nowrap;
    opacity: 0; pointer-events: none; z-index: 80;
    transition: opacity .15s, transform .15s;
    box-shadow: 0 8px 20px rgba(0,0,0,.22);
  }
  .lcui-card [data-tip]:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ── Photo + card composition ──────────────────────────────────────── */
  /* min-width: 0 matters: these sit in grid tracks whose auto minimum would
     otherwise be the card's 361 px, pushing the track wider than the phone
     and clipping the card against the section's overflow-x: clip. */
  .lcui-shot { position: relative; min-width: 0; max-width: 100%; }
  .lcui-shot-img {
    display: block; width: 100%;
    aspect-ratio: var(--lcui-ratio, 16 / 9);
    object-fit: cover; border-radius: 20px;
  }
  .lcui-shot-scrim {
    position: absolute; inset: 0; border-radius: 20px; pointer-events: none;
    background:
      linear-gradient(to top right, rgba(10,14,26,.42) 0%, rgba(10,14,26,.10) 45%, rgba(10,14,26,0) 70%),
      linear-gradient(to bottom left, rgba(10,14,26,.30) 0%, rgba(10,14,26,0) 55%);
  }
  .lcui-shot-card { position: absolute; z-index: 2; transform: scale(var(--lcui-s, 1)); }
  .lcui-shot-a { left: 4%; bottom: 6%; transform-origin: left bottom; }
  .lcui-shot-b { right: 4%; top: 7%; transform-origin: right top; }

  /* Two 361 px cards need real room; below that they shrink with the box
     rather than growing into each other. Multiplied by the per-showcase
     --lcui-s so a card asked to be small stays small here too. */
  @media (max-width: 1180px) {
    .lcui-shot-card { transform: scale(calc(var(--lcui-s, 1) * .88)); }
  }

  /* Phones and small tablets: no absolute layer at all. */
  @media (max-width: 820px) {
    .lcui-shot { display: flex; flex-direction: column; }
    .lcui-shot-img { aspect-ratio: 4 / 3; }
    .lcui-shot-scrim { bottom: auto; height: auto; aspect-ratio: 4 / 3; }
    /* width: 100% (not 361px) so the card contributes nothing to its
       ancestors' min-content size — a fixed width here is what made the hero
       grid track outgrow a 375 px screen. */
    .lcui-shot-card {
      position: relative; transform: none;
      width: 100%; max-width: 361px; margin: -40px auto 0;
    }
    .lcui-card { width: 100%; max-width: 361px; }
    .lcui-shot-b { display: none; }
  }
  @media (max-width: 420px) {
    .lcui-card { padding: 15px; border-radius: 16px; }
    .lcui-card-row { gap: 12px; }
    .lcui-thresh { padding: 12px; }
    .lcui-thresh-val { font-size: 23px; }
    .lcui-session-t { font-size: 13.5px; }
    .lcui-session-m { font-size: 11.5px; }
    .lcui-seg-btn { font-size: 11.5px; padding: 7px 4px; }
    /* A tooltip anchored to a card edge would run off a 375 px screen. */
    .lcui-card [data-tip]::after { display: none; }
  }
`;
