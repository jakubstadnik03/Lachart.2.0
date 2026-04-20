/**
 * TestRecommendationCard
 * Always-visible card that generates a full lactate test protocol
 * from every available data source: FIT files, Strava activities, previous tests, HR streams.
 */
import React, { useState, useMemo } from 'react';
import {
  ClipboardDocumentListIcon,
  BeakerIcon,
  BoltIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  HeartIcon,
  PlayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ─── App palette ─────────────────────────────────────────────────────────────
const C = {
  primary:    '#767EB5',
  primaryDk:  '#5E6590',
  greenos:    '#4BA87D',
  red:        '#E05347',
  secondary:  '#599FD0',
  text:       '#1D2C4C',
  lighter:    '#4A5E82',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycl') || v.includes('ride')) return 'bike';
  if (v.includes('run')) return 'run';
  if (v.includes('swim')) return 'swim';
  return null;
}

function fmtPace(sec) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function daysSince(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt) ? null : Math.floor((Date.now() - dt.getTime()) / 86400000);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Rough %HRmax → bpm interpolation when no explicit LT1/LT2 HR available
function estimateHrAtPct(pctFtp, hrMax, lt1Hr, lt2Hr, lt1PctFtp = 0.72, lt2PctFtp = 0.92) {
  if (!hrMax && !lt1Hr) return null;
  const hmx = hrMax || (lt2Hr ? lt2Hr / 0.97 : null);
  if (!hmx) return null;
  let pctHr;
  if (pctFtp <= 0.60)      pctHr = 0.65 + (pctFtp - 0.55) / 0.05 * 0.05;
  else if (pctFtp <= 0.75) pctHr = 0.70 + (pctFtp - 0.60) / 0.15 * 0.13;
  else if (pctFtp <= 0.90) pctHr = 0.83 + (pctFtp - 0.75) / 0.15 * 0.12;
  else if (pctFtp <= 1.00) pctHr = 0.95 + (pctFtp - 0.90) / 0.10 * 0.03;
  else                      pctHr = Math.min(1.05, 0.98 + (pctFtp - 1.0) * 0.20);
  // Blend with explicit LT1/LT2 if available
  if (lt1Hr && lt2Hr) {
    let hrInterp;
    if (pctFtp <= lt1PctFtp) {
      hrInterp = lt1Hr * (pctFtp / lt1PctFtp);
    } else if (pctFtp >= lt2PctFtp) {
      hrInterp = lt2Hr + (pctFtp - lt2PctFtp) / 0.08 * (lt2Hr * 0.04);
    } else {
      const t = (pctFtp - lt1PctFtp) / (lt2PctFtp - lt1PctFtp);
      hrInterp = lt1Hr + t * (lt2Hr - lt1Hr);
    }
    // Blend 60% explicit, 40% formula
    return Math.round(hrInterp * 0.6 + pctHr * hmx * 0.4);
  }
  return Math.round(pctHr * hmx);
}

function zoneLabel(pctFtp) {
  if (pctFtp < 0.56) return { z: 'Z1', color: '#94a3b8' };
  if (pctFtp < 0.76) return { z: 'Z2', color: C.secondary };
  if (pctFtp < 0.91) return { z: 'Z3', color: C.greenos };
  if (pctFtp < 1.05) return { z: 'Z4', color: '#F59E0B' };
  return { z: 'Z5', color: C.red };
}

// ─── Protocol generator ───────────────────────────────────────────────────────

function generateBikeProtocol({ ftpEst, hrMax, lt1Hr, lt2Hr, lt1Power, lt2Power }) {
  if (!ftpEst || ftpEst < 60) return null;
  const step   = ftpEst >= 300 ? 30 : 25;
  const start  = Math.max(80, Math.round(ftpEst * 0.55 / step) * step);
  const end    = Math.round(ftpEst * 1.15 / step) * step;
  const lt1Pct = lt1Power ? lt1Power / ftpEst : 0.72;
  const lt2Pct = lt2Power ? lt2Power / ftpEst : 0.92;
  const stages = [];
  for (let w = start; w <= end; w += step) {
    const pct = w / ftpEst;
    const hr  = estimateHrAtPct(pct, hrMax, lt1Hr, lt2Hr, lt1Pct, lt2Pct);
    const zone = zoneLabel(pct);
    const tag = lt1Power && Math.abs(w - lt1Power) < step * 0.6 ? 'LT1' :
                lt2Power && Math.abs(w - lt2Power) < step * 0.6 ? 'LT2' : null;
    stages.push({ intensity: `${w} W`, pct: Math.round(pct * 100), hr, zone, tag, duration: 4, rest: 1 });
  }
  return { stages, totalMin: stages.length * 5, note: '4 min effort · 1 min rest · blood sample last 30 sec' };
}

function generateRunProtocol({ lt2Sec, hrMax, lt1Hr, lt2Hr }) {
  if (!lt2Sec || lt2Sec < 120) return null;
  const step  = 15; // sec/km
  const start = lt2Sec + 75; // slower end
  const end   = Math.max(lt2Sec - 30, 120); // fastest stage
  if (start <= end) return null;
  const lt1Sec = lt2Sec + 40; // rough LT1 estimate
  const lt1Pct = 0.72, lt2Pct = 0.92;
  const stages = [];
  for (let s = start; s >= end; s -= step) {
    const pct  = lt2Sec / s; // fraction of LT2 speed (higher = harder)
    const hr   = estimateHrAtPct(pct, hrMax, lt1Hr, lt2Hr, lt1Pct, lt2Pct);
    const zone = zoneLabel(pct);
    const tag  = Math.abs(s - lt1Sec) < step * 0.6 ? 'LT1' :
                 Math.abs(s - lt2Sec) < step * 0.6 ? 'LT2' : null;
    stages.push({ intensity: fmtPace(s), pct: Math.round(pct * 100), hr, zone, tag, duration: 3, rest: 1 });
  }
  return { stages, totalMin: stages.length * 4, note: '3 min effort · 1 min rest · blood sample last 30 sec' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ icon: Icon, label, value, color = C.primary }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
         style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
      <Icon style={{ width: 12, height: 12, color }} />
      <span className="text-[10px]" style={{ color: C.lighter }}>
        <span className="font-semibold" style={{ color }}>{label}:</span> {value}
      </span>
    </div>
  );
}

function UrgencyBadge({ days }) {
  if (days == null) return null;
  const level = days < 60 ? 'ok' : days < 90 ? 'soon' : 'retest';
  const cfg = {
    ok:     { Icon: CheckCircleIcon,       bg: '#F0FDF9', border: '#A7F3D0', text: C.greenos,    msg: `Last test ${days}d ago — up to date` },
    soon:   { Icon: ClockIcon,             bg: '#FFFBEB', border: '#FDE68A', text: '#B45309',    msg: `Last test ${days}d ago — schedule soon` },
    retest: { Icon: ExclamationTriangleIcon, bg: '#FFF5F4', border: '#F9BDB9', text: C.red,     msg: `Last test ${days}d ago — retest recommended` },
  }[level];
  const { Icon } = cfg;
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2"
         style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon style={{ width: 14, height: 14, color: cfg.text, flexShrink: 0 }} />
      <span className="text-[11px] font-semibold" style={{ color: cfg.text }}>{cfg.msg}</span>
    </div>
  );
}

function ProtocolTable({ protocol, isPace }) {
  if (!protocol?.stages?.length) return null;
  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: '#E5E7EB' }}>
      <table className="w-full text-xs min-w-[380px]">
        <thead>
          <tr style={{ background: `${C.primary}0A` }}>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: C.lighter }}>#</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: C.lighter }}>
              {isPace ? 'Pace' : 'Power'}
            </th>
            <th className="px-2 py-2 text-center font-semibold" style={{ color: C.lighter }}>%</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: C.lighter }}>
              <span className="flex items-center gap-1">
                <HeartIcon style={{ width: 10, height: 10 }} /> HR (bpm)
              </span>
            </th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: C.lighter }}>Zone</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: C.lighter }}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {protocol.stages.map((s, i) => {
            const isLt = !!s.tag;
            return (
              <tr
                key={i}
                className="border-t"
                style={{
                  borderColor: '#F1F5F9',
                  background: isLt ? `${C.primary}08` : i % 2 === 0 ? '#FAFAFA' : '#fff',
                }}
              >
                <td className="px-3 py-2 font-bold tabular-nums" style={{ color: C.lighter }}>
                  {i + 1}
                </td>
                <td className="px-3 py-2 font-black tabular-nums" style={{ color: C.text }}>
                  {s.intensity}
                  {isLt && (
                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: C.primary, color: '#fff' }}>
                      {s.tag}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-[11px]" style={{ color: C.lighter }}>
                  {s.pct}%
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: s.hr ? C.red : '#CBD5E1' }}>
                  {s.hr ? `~${s.hr}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: `${s.zone.color}18`, color: s.zone.color }}>
                    {s.zone.z}
                  </span>
                </td>
                <td className="px-3 py-2 text-[11px]" style={{ color: C.lighter }}>
                  {s.duration} min
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const SPORT_LABELS = { bike: '🚴 Cycling', run: '🏃 Running', swim: '🏊 Swimming' };

export default function TestRecommendationCard({
  sportsWithPastTests = [],
  latestBySport = {},
  advisor = {},
  hrTestPlan = null,
  hrTestPlanLoading = false,
  bikePowerMetrics = null,
  externalActivities = [],
  advisorLoading = false,
  onStartTest,
  onClose,
}) {
  const available = sportsWithPastTests.filter(s => ['bike', 'run', 'swim'].includes(s));
  const [sport, setSport] = useState(() =>
    available.includes('bike') ? 'bike' : available[0] || 'bike'
  );

  // ── Build data inputs ──────────────────────────────────────────────────────
  const inputs = useMemo(() => {
    const lastTest = latestBySport[sport];
    const days     = daysSince(lastTest?.date);

    if (sport === 'bike') {
      // FTP from multiple sources (priority order)
      const fitP20   = bikePowerMetrics?.personalRecords?.threshold20min || bikePowerMetrics?.allTime?.threshold20min;
      const fitFtp   = fitP20 ? Math.round(fitP20 * 0.95) : null;
      const lt2Test  = advisor.bike?.lt2FromLastTest || null;
      const stravaW  = (() => {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const rides  = (externalActivities || []).filter(a => {
          const s = (a.sport || a.type || '').toLowerCase();
          const t = new Date(a.startDate || a.date || 0).getTime();
          return (s.includes('ride') || s.includes('bike') || s.includes('cycl') || s === 'virtualride')
            && t >= cutoff && Number(a.movingTime || a.duration || 0) >= 40 * 60
            && Number(a.avgPower || a.averagePower || 0) > 50;
        });
        if (!rides.length) return null;
        return Math.round(rides.reduce((s, r) => s + Number(r.avgPower || r.averagePower), 0) / rides.length);
      })();

      const ftpEst   = lt2Test || fitFtp || stravaW || advisor.bike?.ftp || null;
      const hrMax    = hrTestPlan?.bike?.hrMax?.value || null;
      const lt1Hr    = hrTestPlan?.bike?.lt1?.hr?.value || null;
      const lt2Hr    = hrTestPlan?.bike?.lt2?.hr?.value || null;
      const lt1Power = hrTestPlan?.bike?.lt1?.power ? Number(String(hrTestPlan.bike.lt1.power).replace(/\D/g, '')) : null;
      const lt2Power = hrTestPlan?.bike?.lt2?.power ? Number(String(hrTestPlan.bike.lt2.power).replace(/\D/g, '')) : null;

      const sources = {
        fit:    fitFtp   ? `FIT 20-min: ${fitFtp} W` : null,
        strava: stravaW  ? `Strava avg: ${stravaW} W` : null,
        test:   lt2Test  ? `Last test LT2: ${Math.round(lt2Test)} W` : null,
        hr:     hrMax    ? `HRmax: ${hrMax} bpm${lt1Hr ? ` · LT1: ${lt1Hr}` : ''}${lt2Hr ? ` · LT2: ${lt2Hr}` : ''} bpm` : null,
      };

      return { isPace: false, ftpEst, hrMax, lt1Hr, lt2Hr, lt1Power, lt2Power, days, sources, lastTest };
    }

    if (sport === 'run') {
      const lt2Test = advisor.run?.lt2FromLastTest || null;
      const stravaS = (() => {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const runs   = (externalActivities || []).filter(a => {
          const s = (a.sport || a.type || '').toLowerCase();
          const t = new Date(a.startDate || a.date || 0).getTime();
          return s.includes('run') && t >= cutoff && Number(a.movingTime || a.duration || 0) >= 20 * 60;
        });
        if (!runs.length) return null;
        const best = runs.reduce((acc, r) => Math.max(acc, Number(r.avgSpeed || r.averageSpeed || 0)), 0);
        return best > 0 ? Math.round(1000 / best * 1.03) : null; // threshold estimate
      })();

      const lt2Sec  = lt2Test || stravaS || advisor.run?.lt2FromLastTest || null;
      const hrMax   = hrTestPlan?.run?.hrMax?.value || null;
      const lt1Hr   = hrTestPlan?.run?.lt1?.hr?.value || null;
      const lt2Hr   = hrTestPlan?.run?.lt2?.hr?.value || null;

      const sources = {
        strava: stravaS ? `Strava est.: ${fmtPace(stravaS)}` : null,
        test:   lt2Test ? `Last test LT2: ${fmtPace(lt2Test)}` : null,
        hr:     hrMax   ? `HRmax: ${hrMax} bpm${lt1Hr ? ` · LT1: ${lt1Hr}` : ''}${lt2Hr ? ` · LT2: ${lt2Hr}` : ''} bpm` : null,
      };

      return { isPace: true, lt2Sec, hrMax, lt1Hr, lt2Hr, days, sources, lastTest };
    }

    return { isPace: false, days: daysSince(latestBySport.swim?.date), sources: {}, lastTest: latestBySport.swim };
  }, [sport, latestBySport, advisor, hrTestPlan, bikePowerMetrics, externalActivities]);

  // ── Generate protocol ──────────────────────────────────────────────────────
  const protocol = useMemo(() => {
    if (sport === 'bike') return generateBikeProtocol(inputs);
    if (sport === 'run')  return generateRunProtocol(inputs);
    return null;
  }, [sport, inputs]);

  const loading = advisorLoading || hrTestPlanLoading;

  if (available.length === 0) return null;

  const activeHasData = sport === 'bike' ? !!inputs.ftpEst : sport === 'run' ? !!inputs.lt2Sec : false;
  const sourcesUsed   = Object.values(inputs.sources || {}).filter(Boolean);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: `${C.greenos}15` }}>
            <ClipboardDocumentListIcon style={{ width: 18, height: 18, color: C.greenos }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: C.text }}>Recommended Test Protocol</h2>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">generated from FIT files + Strava + previous tests</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Sport tabs */}
          {available.map(sp => (
            <button
              key={sp}
              onClick={() => setSport(sp)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={sport === sp
                ? { background: C.primary, color: '#fff', boxShadow: `0 2px 8px ${C.primary}40` }
                : { background: '#F3F4F6', color: C.lighter }
              }
            >
              {SPORT_LABELS[sp]}
            </button>
          ))}

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              title="Hide recommended protocol"
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              style={{ color: '#9CA3AF' }}
            >
              <XMarkIcon style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">

        {/* ── Urgency strip ──────────────────────────────────────────────── */}
        <UrgencyBadge days={inputs.days} />

        {/* ── Data sources ───────────────────────────────────────────────── */}
        {sourcesUsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inputs.sources.fit    && <SourceBadge icon={BoltIcon}    label="FIT files" value={inputs.sources.fit}    color={C.primary} />}
            {inputs.sources.strava && <SourceBadge icon={BoltIcon}    label="Strava"    value={inputs.sources.strava} color={C.secondary} />}
            {inputs.sources.test   && <SourceBadge icon={BeakerIcon}  label="Last test" value={inputs.sources.test}   color={C.greenos} />}
            {inputs.sources.hr     && <SourceBadge icon={HeartIcon}   label="HR data"   value={inputs.sources.hr}     color={C.red} />}
          </div>
        )}

        {/* ── Protocol summary line ──────────────────────────────────────── */}
        {activeHasData && protocol && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: C.lighter }}>
              <ClockIcon style={{ width: 13, height: 13 }} />
              <span>~{protocol.totalMin} min total</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: C.lighter }}>
              <ArrowRightIcon style={{ width: 13, height: 13 }} />
              <span>{protocol.stages.length} stages</span>
            </div>
            {sport === 'bike' && inputs.ftpEst && (
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}>
                <BoltIcon style={{ width: 13, height: 13 }} />
                <span>FTP est. {inputs.ftpEst} W</span>
              </div>
            )}
            {sport === 'run' && inputs.lt2Sec && (
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}>
                <ArrowRightIcon style={{ width: 13, height: 13 }} />
                <span>LT2 est. {fmtPace(inputs.lt2Sec)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Loading state ──────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-3 h-3 rounded-full border-2 animate-spin"
                 style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }} />
            Analysing Strava streams…
          </div>
        )}

        {/* ── Protocol table ─────────────────────────────────────────────── */}
        {protocol ? (
          <ProtocolTable protocol={protocol} isPace={inputs.isPace} />
        ) : sport === 'swim' ? (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: '#E5E7EB', color: C.lighter }}>
            <p className="font-semibold mb-1" style={{ color: C.text }}>Swimming Protocol</p>
            <p className="text-xs leading-relaxed">
              Use stepped pace or send-off intervals (e.g. 200–400 m per stage). Keep stroke style and
              turn technique consistent between lactate samples. Suggested 4–6 stages from easy aerobic
              to race pace, 4 min per stage with 1 min rest.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-center" style={{ borderColor: '#E5E7EB' }}>
            <p className="text-xs" style={{ color: C.lighter }}>
              Connect Strava or upload FIT files to generate a personalised protocol.
            </p>
          </div>
        )}

        {/* ── Protocol note ─────────────────────────────────────────────── */}
        {protocol && (
          <p className="text-[10px] leading-snug" style={{ color: C.lighter }}>
            💉 {protocol.note}
          </p>
        )}

        {/* ── Last test info ─────────────────────────────────────────────── */}
        {inputs.lastTest && (
          <p className="text-[10px]" style={{ color: '#94A3B8' }}>
            Last {sport} test: {fmtDate(inputs.lastTest.date)}
          </p>
        )}

        {/* ── Start test button ─────────────────────────────────────────── */}
        {onStartTest && (
          <button
            onClick={() => onStartTest(sport)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDk})`,
              color: '#fff',
              boxShadow: `0 4px 14px ${C.primary}40`,
            }}
          >
            <PlayIcon style={{ width: 16, height: 16 }} />
            Start {SPORT_LABELS[sport]} Test
          </button>
        )}

      </div>
    </div>
  );
}
