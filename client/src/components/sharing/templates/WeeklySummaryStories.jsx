/**
 * WeeklySummaryStories.jsx — seven weekly-summary share cards for LaChart,
 * sized for an Instagram story (1080 × 1920).
 *
 * ┌─ WHY PURE SVG ────────────────────────────────────────────────────────────
 * │ ActivityShareSheet renders each template with renderToStaticMarkup() into
 * │ an SVG *string*, loads it as an <img>, and draws it to a canvas. That means
 * │ every template MUST be a single <svg> root with no HTML/foreignObject, and
 * │ may ONLY use fonts that are already installed (web fonts don't load inside
 * │ the detached Image). Same rules as the existing SummaryShareTemplate.jsx.
 * │
 * │ The canvas is pre-filled with #0F172A when `transparent` is false, so these
 * │ templates paint over transparency and add only a subtle vignette/wash.
 * │ When `transparent` is true they skip every background fill (alpha kept).
 * └────────────────────────────────────────────────────────────────────────────
 *
 * Each component takes:  { week, accent = '#767EB5', transparent = false }
 * See SAMPLE_WEEK below for the exact `week` shape. Wire them into the share
 * sheet's template list (see README for the snippet).
 */
import React from 'react';
import ShareSportGlyph, { pickSportKey } from './ShareSportGlyph';
import ShareBrandLogo from './ShareBrandLogo';
import { useSharePalette } from '../SharePaletteProvider';
import { buildRoutePath } from '../shareRoutePath';
import { ActivityShareBackground } from './activityShareChrome';

const W = 1080, H = 1920, PAD = 90;
const FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

const SPORTCOL = { swim: '#599FD0', bike: '#767EB5', run: '#FF6B4A', strength: '#9AA3C9', other: '#9AA3C9' };
const sportColor = (s) => SPORTCOL[pickSportKey(s)] || SPORTCOL.other;

// ── tiny SVG text helper ─────────────────────────────────────────────────────
function Txt({ x, y, size, weight = 700, fill, anchor = 'start', ls, children }) {
  const C = useSharePalette();
  return (
    <text x={x} y={y} textAnchor={anchor}
      style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, fill: fill ?? C.text, letterSpacing: ls }}>
      {children}
    </text>
  );
}
function Box({ x, y, w, h, r = 26, fill, stroke, sw = 1.5, ...rest }) {
  const C = useSharePalette();
  return (
    <rect x={x} y={y} width={w} height={h} rx={r}
      fill={fill ?? C.surface} stroke={stroke ?? C.border} strokeWidth={sw} {...rest} />
  );
}

// ── shared chrome ────────────────────────────────────────────────────────────
function StoryBackground({ transparent, theme = 'dark' }) {
  if (transparent) return null;
  return <ActivityShareBackground transparent={false} theme={theme} />;
}

function Vignette({ transparent }) {
  const C = useSharePalette();
  if (transparent) return null;
  return (
    <>
      <radialGradient id="ssWash" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stopColor={C.wash} />
        <stop offset="46%" stopColor="rgba(118,126,181,0)" />
      </radialGradient>
      <rect x="0" y="0" width={W} height={H} fill="url(#ssWash)" />
    </>
  );
}

function Header({ accent, chip }) {
  const C = useSharePalette();
  return (
    <g>
      <ShareBrandLogo x={PAD} y={118} height={58} />
      {chip && (() => {
        const cw = chip.length * 17 + 56;
        return (
          <g>
            <rect x={W - PAD - cw} y="108" width={cw} height="68" rx="34" fill={C.surface} stroke={C.border} strokeWidth="1.5" />
            <Txt x={W - PAD - cw / 2} y="153" size={28} weight={600} fill={C.muted} anchor="middle">{chip}</Txt>
          </g>
        );
      })()}
    </g>
  );
}

function Footer({ accent, week }) {
  const C = useSharePalette();
  const y = H - 96;
  return (
    <g>
      <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={C.divider} strokeWidth="2" />
      <Txt x={PAD} y={y + 50} size={28} weight={600} fill={C.muted}>{week.handle || 'lachart.net'}</Txt>
      <rect x={W - PAD - 200} y={y + 28} width="44" height="6" rx="3" fill={accent} />
      <Txt x={W - PAD} y={y + 50} size={26} weight={600} fill={C.faint} anchor="end">{week.rangeShort}</Txt>
    </g>
  );
}

const eyebrow = (x, y, text, color) =>
  <Txt x={x} y={y} size={26} weight={700} fill={color} ls="5px">{String(text).toUpperCase()}</Txt>;

export function pickTopHero(top, metric = 'distance') {
  const stats = top?.stats || [];
  const by = (kw) => stats.find((s) => s.label.toLowerCase().includes(kw));
  let hero;
  if (metric === 'tss') hero = by('tss');
  else if (metric === 'time') hero = by('moving');
  else if (metric === 'speed') hero = by('speed') || by('distance');
  else hero = by('distance');
  if (!hero) hero = stats[0] || { label: 'Distance', value: '0', unit: 'km' };
  const rest = stats.filter((s) => s !== hero);
  return { hero, rest };
}

// ════════════════════════════════════════════ 1 · WEEK OVERVIEW ════════════
export function WeeklyOverviewStory({ week, accent = '#767EB5', transparent = false, theme = 'dark' }) {
  const C = useSharePalette();
  const k = week.kpis, t = week.totals;
  const kpis = [
    { label: 'FITNESS', value: k.fitness, color: accent },
    { label: 'FORM', value: k.form > 0 ? `+${k.form}` : `${k.form}`, color: k.form >= 0 ? C.pos : C.neg },
    { label: 'FATIGUE', value: k.fatigue, color: C.neg },
  ];
  const tiles = [
    { label: 'ACTIVITIES', value: `${t.activities}` },
    { label: 'TIME', value: t.time },
    { label: 'DISTANCE', value: `${t.distance} ${t.distanceUnit}` },
    { label: 'TSS', value: `${t.tss}` },
  ];
  const maxTss = Math.max(1, ...week.days.map(d => d.tss));
  const barTop = 1500, barBot = 1660, barAreaX = PAD, barAreaW = W - PAD * 2, slot = barAreaW / 7;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={`Week ${week.weekNo}`} />

      {eyebrow(PAD, 320, 'Weekly summary', accent)}
      <Txt x={PAD} y={452} size={128} weight={800} ls="-0.035em">This week</Txt>
      <Txt x={PAD} y={520} size={38} weight={600} fill={C.muted}>{week.rangeLabel}</Txt>

      {/* KPI trio */}
      {kpis.map((c, i) => {
        const bw = (W - PAD * 2 - 56) / 3, x = PAD + i * (bw + 28);
        return (
          <g key={c.label}>
            <Box x={x} y={580} w={bw} h={190} r={28} />
            <Txt x={x + bw / 2} y={690} size={90} weight={800} anchor="middle">{c.value}</Txt>
            <Txt x={x + bw / 2} y={732} size={26} weight={700} fill={c.color} anchor="middle" ls="2px">{c.label}</Txt>
          </g>
        );
      })}

      {/* totals 2×2 */}
      {tiles.map((tl, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bw = (W - PAD * 2 - 26) / 2, x = PAD + col * (bw + 26), y = 818 + row * 186;
        return (
          <g key={tl.label}>
            <Box x={x} y={y} w={bw} h={160} r={28} />
            <Txt x={x + 38} y={y + 56} size={25} weight={700} fill={C.faint} ls="2px">{tl.label}</Txt>
            <Txt x={x + 38} y={y + 128} size={70} weight={800}>{tl.value}</Txt>
          </g>
        );
      })}

      {/* daily load bars */}
      <Txt x={PAD} y={1430} size={26} weight={700} fill={C.faint} ls="2px">DAILY LOAD · TSS</Txt>
      <Txt x={W - PAD} y={1430} size={26} weight={600} fill={C.muted} anchor="end">peak {week.days.reduce((a, b) => b.tss > a.tss ? b : a).key} · {maxTss}</Txt>
      {week.days.map((d, i) => {
        const x = barAreaX + i * slot, h = Math.max(8, (d.tss / maxTss) * (barBot - barTop));
        const peak = d.tss === maxTss, bw = slot - 18;
        return (
          <g key={i}>
            <rect x={x + 9} y={barBot - h} width={bw} height={h} rx={12} fill={peak ? C.coral : accent} />
            <Txt x={x + slot / 2} y={barBot + 44} size={24} weight={700} fill={C.muted} anchor="middle">{d.key[0]}</Txt>
          </g>
        );
      })}

      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 2 · DAY BY DAY ═══════════════
export function WeeklyDaysStory({ week, accent = '#767EB5', transparent = false, theme = 'dark' }) {
  const C = useSharePalette();
  const maxTss = Math.max(1, ...week.days.map(d => d.tss));
  const top = 360, rowH = 178, gap = 16;
  const barW = 180;
  const barX = W - PAD - 34 - barW;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={week.rangeShort} />
      {eyebrow(PAD, 280, 'Day by day', accent)}
      <Txt x={PAD} y={344} size={70} weight={800} ls="-0.03em">Your training week</Txt>

      {week.days.map((d, i) => {
        const y = top + i * (rowH + gap);
        const s0 = d.sessions?.[0];
        const more = Math.max(0, (d.sessions?.length || 0) - 1);
        const isLac = week.lactate && d.key === week.lactate.dayKey;

        if (!s0) {
          return (
            <g key={i}>
              <Box x={PAD} y={y} w={W - PAD * 2} h={rowH} r={26} />
              <Txt x={PAD + 34} y={y + 64} size={26} weight={700} fill={C.muted} ls="1px">{d.key}</Txt>
              <Txt x={PAD + 34} y={y + 116} size={44} weight={800}>{d.date}</Txt>
              <Txt x={PAD + 250} y={y + rowH / 2 + 8} size={34} weight={600} fill={C.faint}>Rest day</Txt>
              <Txt x={W - PAD - 34} y={y + 64} size={36} weight={800} anchor="end">
                {d.tss}<tspan style={{ fontSize: 22, fontWeight: 600, fill: C.faint }}> TSS</tspan>
              </Txt>
              <rect x={barX} y={y + 92} width={barW} height={12} rx={6} fill={C.track} />
            </g>
          );
        }

        const col = sportColor(s0.sport);
        const sub = [s0.dur, s0.dist].filter(Boolean).join('  ·  ') + (more > 0 ? `   +${more} more` : '');
        return (
          <g key={i}>
            <Box x={PAD} y={y} w={W - PAD * 2} h={rowH} r={26} />
            <Txt x={PAD + 34} y={y + 64} size={26} weight={700} fill={C.muted} ls="1px">{d.key}</Txt>
            <Txt x={PAD + 34} y={y + 116} size={44} weight={800}>{d.date}</Txt>
            <rect x={PAD + 130} y={y + rowH / 2 - 42} width="84" height="84" rx="22" fill={col + '33'} />
            <g transform={`translate(${PAD + 149}, ${y + rowH / 2 - 23}) scale(1.92)`}>
              <ShareSportGlyph sport={s0.sport} color={col} strokeWidth={2} />
            </g>
            {isLac && (
              <g>
                <circle cx={PAD + 214} cy={y + rowH / 2 - 42} r="22" fill={C.coral} stroke={C.canvas} strokeWidth="4" />
                <path d="M0,-9 C3.4,-3.8 5.2,-1.4 5.2,1.4 A5.2,5.2 0 0,1 -5.2,1.4 C-5.2,-1.4 -3.4,-3.8 0,-9 z"
                  transform={`translate(${PAD + 214}, ${y + rowH / 2 - 42})`} fill="#fff" />
              </g>
            )}
            <Txt x={PAD + 250} y={y + rowH / 2 - 4} size={40} weight={800}>{String(s0.title).slice(0, 22)}</Txt>
            <Txt x={PAD + 250} y={y + rowH / 2 + 40} size={28} weight={500} fill={C.muted}>{sub}</Txt>
            <Txt x={W - PAD - 34} y={y + 64} size={36} weight={800} anchor="end">
              {d.tss}<tspan style={{ fontSize: 22, fontWeight: 600, fill: C.faint }}> TSS</tspan>
            </Txt>
            <rect x={barX} y={y + 92} width={barW} height={12} rx={6} fill={C.track} />
            <rect x={barX} y={y + 92} width={Math.max(6, barW * (d.tss / maxTss))} height={12} rx={6} fill={d.tss === maxTss ? C.coral : accent} />
          </g>
        );
      })}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 3 · HERO STAT ════════════════
export function WeeklyHeroStory({
  week,
  accent = '#767EB5',
  transparent = false,
  metric = 'distance',
  theme = 'dark',
  secondaryMetrics = { time: true, tss: true, fitness: true, form: false },
}) {
  const C = useSharePalette();
  const t = week.totals;
  const k = week.kpis;
  const M = {
    distance:   { value: `${t.distance}`, unit: t.distanceUnit, label: 'Distance', sub: `across ${t.activities} activities`, size: 250 },
    tss:        { value: `${t.tss}`, unit: 'TSS', label: 'Training load', sub: `${t.time} of training`, size: 300 },
    time:       { value: t.time, unit: '', label: 'Time trained', sub: `${t.activities} activities`, size: 156 },
    activities: { value: `${t.activities}`, unit: 'sessions', label: 'Sessions', sub: `${t.time} · ${t.distance} ${t.distanceUnit}`, size: 300 },
  }[metric];
  const secondary = [
    { key: 'time', label: 'TIME', value: t.time },
    { key: 'tss', label: 'TSS', value: `${t.tss}` },
    { key: 'fitness', label: 'FITNESS', value: `${k.fitness}`, color: accent },
    { key: 'form', label: 'FORM', value: k.form > 0 ? `+${k.form}` : `${k.form}`, color: k.form >= 0 ? C.pos : C.neg },
  ].filter((s) => secondaryMetrics[s.key] !== false);
  const maxTss = Math.max(1, ...week.days.map(d => d.tss));
  const cx = W / 2;
  const unitSize = Math.round(M.size * 0.28);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={week.rangeShort} />

      <Txt x={cx} y={620} size={96} weight={800} anchor="middle" ls="-0.03em">This week</Txt>
      <Txt x={cx} y={700} size={26} weight={700} fill={accent} anchor="middle" ls="5px">{M.label.toUpperCase()}</Txt>
      {/* hero value + unit — single <text> so the unit flows after the digits (no overlap) */}
      <Txt x={cx} y={900} size={M.size} weight={800} anchor="middle" ls="-0.04em">
        {M.value}
        {M.unit ? (
          <tspan
            dx={16}
            dy={-Math.round(M.size * 0.2)}
            style={{ fontSize: unitSize, fontWeight: 800, fill: accent }}
          >
            {M.unit}
          </tspan>
        ) : null}
      </Txt>
      <Txt x={cx} y={980} size={40} weight={600} fill={C.muted} anchor="middle">{M.sub}</Txt>

      {/* secondary tiles */}
      {secondary.map((s, i) => {
        const n = secondary.length;
        const gap = 24;
        const bw = (W - PAD * 2 - gap * Math.max(0, n - 1)) / Math.max(1, n);
        const x = PAD + i * (bw + gap);
        const valSize = n >= 4 ? 52 : 62;
        return (
          <g key={s.key}>
            <Box x={x} y={1120} w={bw} h={180} r={28} />
            <Txt x={x + bw / 2} y={1218} size={valSize} weight={800} anchor="middle" fill={s.color}>{s.value}</Txt>
            <Txt x={x + bw / 2} y={1262} size={24} weight={700} fill={C.faint} anchor="middle" ls="2px">{s.label}</Txt>
          </g>
        );
      })}

      {/* daily bars */}
      {(() => {
        const top = 1440, bot = 1600, area = W - PAD * 2, slot = area / 7;
        return week.days.map((d, i) => {
          const x = PAD + i * slot, h = Math.max(8, (d.tss / maxTss) * (bot - top)), peak = d.tss === maxTss;
          return (
            <g key={i}>
              <rect x={x + 9} y={bot - h} width={slot - 18} height={h} rx={12} fill={peak ? C.coral : accent} />
              <Txt x={x + slot / 2} y={bot + 44} size={24} weight={700} fill={C.muted} anchor="middle">{d.key[0]}</Txt>
            </g>
          );
        });
      })()}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 4 · SPORT SPLIT ══════════════
export function WeeklySportSplitStory({ week, accent = '#767EB5', transparent = false, theme = 'dark' }) {
  const C = useSharePalette();
  const total = week.sports.reduce((a, s) => a + s.min, 0);
  const cx = W / 2, cy = 760, R = 200, SW = 78, CIRC = 2 * Math.PI * R;
  let acc = 0;
  const top = 1080, rowH = 150, gap = 22;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={week.rangeShort} />
      {eyebrow(PAD, 280, 'Sport split', accent)}
      <Txt x={PAD} y={344} size={70} weight={800} ls="-0.03em">Where the hours went</Txt>

      {/* donut */}
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {week.sports.map((s) => {
          const len = (s.min / total) * CIRC, gapPx = 5, off = -acc; acc += len;
          return (
            <circle key={s.sport} cx={cx} cy={cy} r={R} fill="none"
              stroke={sportColor(s.sport)} strokeWidth={SW}
              strokeDasharray={`${Math.max(0, len - gapPx)} ${CIRC - Math.max(0, len - gapPx)}`}
              strokeDashoffset={off} />
          );
        })}
      </g>
      <Txt x={cx} y={cy - 36} size={26} weight={700} fill={C.faint} anchor="middle" ls="2px">TOTAL</Txt>
      <Txt x={cx} y={cy + 28} size={72} weight={800} anchor="middle" ls="-0.02em">{week.totals.time}</Txt>
      <Txt x={cx} y={cy + 78} size={28} weight={600} fill={C.muted} anchor="middle">{week.totals.activities} activities</Txt>

      {/* legend */}
      {week.sports.map((s, i) => {
        const y = top + i * (rowH + gap), col = sportColor(s.sport), pct = Math.round((s.min / total) * 100);
        return (
          <g key={s.sport}>
            <Box x={PAD} y={y} w={W - PAD * 2} h={rowH} r={24} />
            <rect x={PAD + 32} y={y + rowH / 2 - 35} width="70" height="70" rx="18" fill={col + '33'} />
            <g transform={`translate(${PAD + 48}, ${y + rowH / 2 - 19}) scale(1.6)`}>
              <ShareSportGlyph sport={s.sport} color={col} strokeWidth={2.2} />
            </g>
            <Txt x={PAD + 128} y={y + rowH / 2 - 6} size={38} weight={800}>{s.label}</Txt>
            <Txt x={PAD + 128} y={y + rowH / 2 + 38} size={27} weight={500} fill={C.muted}>{s.time}  ·  {s.dist}  ·  {s.acts} act</Txt>
            <Txt x={W - PAD - 36} y={y + rowH / 2 + 18} size={54} weight={800} fill={col} anchor="end">{pct}<tspan style={{ fontSize: 30 }}>%</tspan></Txt>
          </g>
        );
      })}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 5 · CONSISTENCY ══════════════
export function WeeklyStreakStory({ week, accent = '#767EB5', transparent = false, theme = 'dark' }) {
  const C = useSharePalette();
  const st = week.streak;
  const grid = week.loadGrid || [];
  const maxG = Math.max(1, ...grid.flat());
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={`Week ${week.weekNo}`} />

      {eyebrow(PAD, 470, 'Consistency', accent)}
      <Txt x={PAD} y={580} size={96} weight={800} ls="-0.035em">Perfect</Txt>
      <Txt x={PAD} y={672} size={96} weight={800} ls="-0.035em">week.</Txt>
      <Txt x={PAD} y={742} size={38} weight={600} fill={C.muted}>Trained {st.activeDays} of 7 days · {week.totals.activities} sessions</Txt>

      {/* 7-day check ring */}
      {week.days.map((d, i) => {
        const area = W - PAD * 2, slot = area / 7, x = PAD + i * slot + slot / 2, cy = 880;
        return (
          <g key={i}>
            <circle cx={x} cy={cy} r="52" fill={accent} />
            <path d="M-22,2 l14,15 l30,-32" transform={`translate(${x}, ${cy})`} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <Txt x={x} y={cy + 110} size={26} weight={700} fill={C.muted} anchor="middle">{d.key[0]}</Txt>
          </g>
        );
      })}

      {/* streak block + load grid */}
      {(() => {
        const y = 1080, hCard = 460, leftW = 380;
        return (
          <g>
            <Box x={PAD} y={y} w={leftW} h={hCard} r={32} fill={accent} stroke="none" />
            <Txt x={PAD + 44} y={y + 230} size={150} weight={800} fill="#fff" ls="-0.04em">{st.weekStreak}</Txt>
            <Txt x={PAD + 44} y={y + 300} size={34} weight={600} fill="rgba(255,255,255,0.92)">weeks in a row</Txt>
            <Txt x={PAD + 44} y={y + 344} size={34} weight={600} fill="rgba(255,255,255,0.92)">hitting your plan</Txt>

            <Box x={PAD + leftW + 26} y={y} w={W - PAD * 2 - leftW - 26} h={hCard} r={32} />
            <Txt x={PAD + leftW + 64} y={y + 84} size={64} weight={800}>{st.last28Active}<tspan style={{ fontSize: 34, fontWeight: 600, fill: C.faint }}> / {st.last28}</tspan></Txt>
            <Txt x={PAD + leftW + 64} y={y + 126} size={27} weight={600} fill={C.muted}>active days · last 4 weeks</Txt>
            {(() => {
              const gx = PAD + leftW + 64, gy = y + 170, cell = (W - PAD * 2 - leftW - 26 - 76 - 6 * 12) / 7;
              return grid.map((wk, r) => wk.map((v, c) => (
                <rect key={`${r}-${c}`} x={gx + c * (cell + 12)} y={gy + r * (cell + 12)} width={cell} height={cell} rx={10}
                  fill={v === 0 ? C.track : accent} opacity={v === 0 ? 1 : 0.35 + 0.65 * (v / maxG)} />
              )));
            })()}
          </g>
        );
      })()}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 6 · TOP SESSION ══════════════
export function WeeklyTopSessionStory({
  week,
  accent = '#767EB5',
  transparent = false,
  heroMetric = 'distance',
  showMap = false,
  gpsPoints = [],
  theme = 'dark',
}) {
  const C = useSharePalette();
  const top = week.top;
  const col = sportColor(top.sport);
  const { hero, rest } = pickTopHero(top, heroMetric);
  const points = (Array.isArray(gpsPoints) && gpsPoints.length > 1)
    ? gpsPoints
    : (top.gpsPoints || []);
  const routePath = showMap
    ? buildRoutePath(points, { boxX: PAD + 20, boxY: 720, boxW: W - PAD * 2 - 40, boxH: 400 })
    : null;
  const hasMap = Boolean(routePath);
  const heroY = hasMap ? 1240 : 920;
  const heroSize = hasMap ? 150 : 220;
  const unitSize = hasMap ? 44 : 64;
  const gridTop = hasMap ? 1330 : 1040;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <Header accent={accent} chip={week.rangeShort} />

      {/* badge */}
      {(() => { const bw = top.badge.length * 16 + 92; return (
        <g>
          <rect x={PAD} y={420} width={bw} height={64} rx={32} fill={C.coral} />
          <path d="M0,-12 L3.5,-4 L12,-3 L6,3 L7.5,11 L0,7 L-7.5,11 L-6,3 L-12,-3 L-3.5,-4 Z" transform={`translate(${PAD + 38}, ${452})`} fill="#fff" />
          <Txt x={PAD + 64} y={462} size={28} weight={700} fill="#fff" ls="0.5px">{top.badge}</Txt>
        </g>
      ); })()}

      {/* sport + title */}
      <rect x={PAD} y={540} width="140" height="140" rx="36" fill={col + '33'} />
      <g transform={`translate(${PAD + 28}, ${568}) scale(3.5)`}>
        <ShareSportGlyph sport={top.sport} color={col} strokeWidth={1.8} />
      </g>
      <Txt x={PAD + 176} y={612} size={70} weight={800} ls="-0.025em">{top.title}</Txt>
      <Txt x={PAD + 176} y={664} size={36} weight={600} fill={C.muted}>{top.day}</Txt>

      {/* route map */}
      {hasMap && (
        <g>
          <Box x={PAD} y={700} w={W - PAD * 2} h={440} r={32} fill={C.surfaceHi} />
          <path d={routePath} fill="none" stroke={C.routeShadow} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <path d={routePath} fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* hero value */}
      <Txt x={PAD} y={heroY} size={heroSize} weight={800} ls="-0.04em">
        {hero.value}
        {(hero.unit || hero.label === 'TSS') && (
          <tspan style={{ fontSize: unitSize, fontWeight: 800, fill: accent }}>
            {' '}{hero.unit || 'TSS'}
          </tspan>
        )}
      </Txt>

      {/* stat grid 2×N */}
      {rest.map((s, i) => {
        const col2 = i % 2, row = Math.floor(i / 2);
        const bw = (W - PAD * 2 - 22) / 2, x = PAD + col2 * (bw + 22), y = gridTop + row * 152;
        return (
          <g key={`${s.label}-${i}`}>
            <Box x={x} y={y} w={bw} h={130} r={26} />
            <Txt x={x + 36} y={y + 78} size={28} weight={700} fill={C.faint} ls="2px">{s.label.toUpperCase()}</Txt>
            <Txt x={x + bw - 36} y={y + 84} size={50} weight={800} anchor="end">{s.value}<tspan style={{ fontSize: 28, fontWeight: 600, fill: C.muted }}> {s.unit}</tspan></Txt>
          </g>
        );
      })}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ════════════════════════════════════════════ 7 · LACTATE TEST ════════════
export function WeeklyLactateStory({ week, accent = '#767EB5', transparent = false, theme = 'dark' }) {
  const C = useSharePalette();
  const L = week.lactate;
  if (!L) return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} />;
  const LT1C = '#599FD0', LT2C = C.coral;
  const xs = L.steps.map(s => s.x), xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymax = Math.max(9, ...L.steps.map(s => s.lac));
  const chartX = PAD, chartY = 590, chartW = W - PAD * 2, chartH = 580;
  const PL = chartX + 86, PR = chartX + chartW - 30, PT = chartY + 76, PB = chartY + chartH - 84;
  const sx = (v) => PL + (v - xmin) / (xmax - xmin) * (PR - PL);
  const sy = (l) => PT + (1 - l / ymax) * (PB - PT);
  const pts = L.steps.map(s => [sx(s.x), sy(s.lac)]);
  const smooth = (p) => {
    let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const line = smooth(pts);
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${PB} L ${pts[0][0].toFixed(1)} ${PB} Z`;
  const tiles = [{ ...L.lt1, color: LT1C }, { ...L.lt2, color: LT2C, delta: L.deltaLt2 }];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <StoryBackground transparent={transparent} theme={theme} />
      <Vignette transparent={transparent} />
      <linearGradient id="lacFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
        <stop offset="100%" stopColor={accent} stopOpacity="0" />
      </linearGradient>
      <Header accent={accent} chip={week.rangeShort} />

      {/* title block */}
      <path d="M0,-15 C4.4,-4.8 6.5,-1.8 6.5,1.8 A6.5,6.5 0 0,1 -6.5,1.8 C-6.5,-1.8 -4.4,-4.8 0,-15 z" transform={`translate(${PAD + 13}, ${300})`} fill={LT2C} />
      {eyebrow(PAD + 36, 312, 'Lactate test', LT2C)}
      <Txt x={PAD} y={420} size={92} weight={800} ls="-0.03em">New thresholds.</Txt>
      <g transform={`translate(${PAD}, ${462}) scale(1.5)`}><ShareSportGlyph sport={L.sport} color={C.muted} strokeWidth={2} /></g>
      <Txt x={PAD + 52} y={494} size={32} weight={600} fill={C.muted}>{L.day}  ·  {L.protocol}</Txt>

      {/* chart card */}
      <Box x={chartX} y={chartY} w={chartW} h={chartH} r={32} />
      <Txt x={chartX + 34} y={chartY + 46} size={24} weight={700} fill={C.faint} ls="2px">LACTATE · MMOL/L</Txt>
      <Txt x={chartX + chartW - 34} y={chartY + 46} size={24} weight={700} fill={C.faint} anchor="end" ls="2px">{L.xLabel.toUpperCase()} · {L.xUnit}</Txt>
      {/* gridlines */}
      {[2, 4, 6, 8].map(g => (
        <g key={g}>
          <line x1={PL} y1={sy(g)} x2={PR} y2={sy(g)} stroke={C.divider} strokeWidth={g === 4 ? 2.5 : 1.5} strokeDasharray={g === 4 ? '0' : '4 8'} />
          <Txt x={PL - 16} y={sy(g) + 9} size={26} weight={600} fill={C.faint} anchor="end">{g}</Txt>
        </g>
      ))}
      {/* thresholds */}
      {[{ t: L.lt1, c: LT1C }, { t: L.lt2, c: LT2C }].map((m, i) => (
        <g key={i}>
          <line x1={sx(m.t.x)} y1={PT - 2} x2={sx(m.t.x)} y2={PB} stroke={m.c} strokeWidth="3" strokeDasharray="8 8" />
          <rect x={sx(m.t.x) - 44} y={PT - 50} width="88" height="42" rx="12" fill={m.c} />
          <Txt x={sx(m.t.x)} y={PT - 21} size={26} weight={800} fill="#fff" anchor="middle">{m.t.label}</Txt>
        </g>
      ))}
      <path d={area} fill="url(#lacFill)" />
      <path d={line} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="9" fill={C.canvas} stroke={accent} strokeWidth="4" />)}
      {L.steps.map((s, i) => <Txt key={i} x={sx(s.x)} y={PB + 44} size={24} weight={600} fill={C.faint} anchor="middle">{s.x}</Txt>)}

      {/* threshold tiles */}
      {tiles.map((tt, i) => {
        const bw = (W - PAD * 2 - 26) / 2, x = PAD + i * (bw + 26), y = chartY + chartH + 40, h = 300;
        return (
          <g key={tt.label}>
            <Box x={x} y={y} w={bw} h={h} r={28} />
            <rect x={x} y={y} width={bw} height={6} rx={3} fill={tt.color} />
            <Txt x={x + 36} y={y + 70} size={34} weight={800} fill={tt.color}>{tt.label}</Txt>
            <Txt x={x + 36 + tt.label.length * 22 + 16} y={y + 70} size={25} weight={600} fill={C.muted}>{tt.sub}</Txt>
            <Txt x={x + 36} y={y + 156} size={84} weight={800} ls="-0.03em">{tt.x}<tspan style={{ fontSize: 36, fontWeight: 600, fill: C.muted }}> W</tspan></Txt>
            <Txt x={x + 36} y={y + 210} size={28} weight={600} fill={C.muted}>{tt.hr} bpm    {Number(tt.lac).toFixed(1)} mmol</Txt>
            {tt.delta && (
              <g>
                <rect x={x + 36} y={y + 232} width={tt.delta.length * 15 + 150} height={48} rx={24} fill="rgba(52,211,153,0.16)" />
                <Txt x={x + 60} y={y + 264} size={26} weight={700} fill={C.pos}>↑ {tt.delta} vs last test</Txt>
              </g>
            )}
          </g>
        );
      })}
      <Footer accent={accent} week={week} />
    </svg>
  );
}

// ── manifest + sample data ───────────────────────────────────────────────────
export const WEEKLY_STORIES = [
  { id: 'overview', label: 'Week overview', Comp: WeeklyOverviewStory },
  { id: 'days',     label: 'Day by day',    Comp: WeeklyDaysStory },
  { id: 'hero',     label: 'Hero stat',     Comp: WeeklyHeroStory },
  { id: 'split',    label: 'Sport split',   Comp: WeeklySportSplitStory },
  { id: 'streak',   label: 'Consistency',   Comp: WeeklyStreakStory },
  { id: 'top',      label: 'Top session',   Comp: WeeklyTopSessionStory },
  { id: 'lactate',  label: 'Lactate test',  Comp: WeeklyLactateStory, requires: (w) => !!w.lactate },
];

export const SAMPLE_WEEK = {
  rangeLabel: 'Jun 15 – Jun 21', rangeShort: 'Jun 15 – 21', weekNo: 25, handle: 'lachart.net',
  kpis: { fitness: 128, form: -1, fatigue: 127 },
  totals: { activities: 11, time: '19h 48m', distance: '372.0', distanceUnit: 'km', tss: 698 },
  days: [
    { key: 'MON', date: '15', tss: 78,  sessions: [{ sport: 'swim', title: 'Swim Easy', dur: '1h 14m', dist: '5.0 km' }] },
    { key: 'TUE', date: '16', tss: 205, sessions: [{ sport: 'bike', title: 'Bike TT Long', dur: '4h 08m', dist: '121 km' }] },
    { key: 'WED', date: '17', tss: 118, sessions: [{ sport: 'run', title: 'Morning Hike', dur: '3h 35m', dist: '16.6 km' }] },
    { key: 'THU', date: '18', tss: 84,  sessions: [{ sport: 'swim', title: 'Swim', dur: '59m', dist: '4.0 km' }, { sport: 'strength', title: 'Strength', dur: '45m', dist: '' }] },
    { key: 'FRI', date: '19', tss: 96,  sessions: [{ sport: 'swim', title: 'Swim Endurance', dur: '1h 00m', dist: '4.1 km' }, { sport: 'run', title: 'Easy Run', dur: '45m', dist: '8.5 km' }] },
    { key: 'SAT', date: '20', tss: 92,  sessions: [{ sport: 'bike', title: 'Bike Endurance', dur: '4h 45m', dist: '175 km' }, { sport: 'strength', title: 'Core', dur: '30m', dist: '' }] },
    { key: 'SUN', date: '21', tss: 25,  sessions: [{ sport: 'run', title: 'Long Run', dur: '1h 30m', dist: '20.0 km' }, { sport: 'swim', title: 'Recovery Swim', dur: '35m', dist: '1.6 km' }] },
  ],
  sports: [
    { sport: 'bike', label: 'Cycling', min: 533, time: '8h 53m', dist: '296 km', acts: 2 },
    { sport: 'run', label: 'Run / Hike', min: 350, time: '5h 50m', dist: '45.1 km', acts: 3 },
    { sport: 'swim', label: 'Swim', min: 228, time: '3h 48m', dist: '14.7 km', acts: 4 },
    { sport: 'strength', label: 'Strength', min: 75, time: '1h 15m', dist: '—', acts: 2 },
  ],
  top: {
    sport: 'bike', title: 'Bike TT Long', day: 'Tuesday · Jun 16', badge: 'Top TSS this week',
    stats: [
      { label: 'Distance', value: '121', unit: 'km' },
      { label: 'Moving time', value: '4:08', unit: 'h' },
      { label: 'Avg speed', value: '29.3', unit: 'km/h' },
      { label: 'TSS', value: '205', unit: '' },
      { label: 'Elevation', value: '1,240', unit: 'm' },
      { label: 'Avg HR', value: '148', unit: 'bpm' },
    ],
  },
  streak: { activeDays: 7, weekStreak: 12, last28Active: 23, last28: 28 },
  loadGrid: [
    [40, 0, 65, 30, 80, 120, 0],
    [55, 90, 0, 70, 45, 150, 25],
    [60, 0, 110, 50, 85, 0, 95],
    [78, 205, 118, 84, 96, 92, 25],
  ],
  lactate: {
    day: 'Saturday · Jun 20', dayKey: 'SAT', sport: 'bike', protocol: '4-min steps · 30 W', xUnit: 'W', xLabel: 'Power',
    steps: [
      { x: 150, lac: 0.9, hr: 118 }, { x: 180, lac: 1.1, hr: 129 }, { x: 210, lac: 1.4, hr: 141 },
      { x: 240, lac: 2.2, hr: 152 }, { x: 270, lac: 3.5, hr: 163 }, { x: 300, lac: 5.6, hr: 173 }, { x: 330, lac: 8.9, hr: 182 },
    ],
    lt1: { label: 'LT1', sub: 'Aerobic', x: 205, hr: 140, lac: 1.4 },
    lt2: { label: 'LT2', sub: 'Anaerobic · 4 mmol', x: 286, hr: 170, lac: 4.0 },
    deltaLt2: '+12 W',
  },
};
