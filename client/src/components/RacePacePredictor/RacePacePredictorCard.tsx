import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';

const ACCENT = '#767eb5';
const ACCENT_SOFT = 'rgba(118, 126, 181, 0.18)';

export type RaceType = '1500m' | '5k' | '10k' | 'hm' | 'marathon';
export type CyclingEventType = '1min' | '5min' | '20min' | '1h' | '2h' | '3h' | '5h';
export type SportType = 'run' | 'bike' | 'swim';

export type LactatePoint = { x: number; y: number };

export type RacePacePredictorTraining = {
  volume: number;
  sessions: number;
  /** Z1–Z5 shares; values may be 0–1 fractions or 0–100 percentages (auto-normalized). */
  zoneDistribution: number[];
  longWorkout: number;
  /** Hours or score of interval work near LT2 — higher = more specific stimulus. */
  intervals: number;
};

export type RacePacePredictorProps = {
  lt1: number;
  lt2: number;
  lactateCurve: LactatePoint[];
  training: RacePacePredictorTraining;
  sport?: SportType;
  /** Athlete body weight in kg — enables W/kg display for cycling. */
  athleteWeightKg?: number;
  /** Show running paces as min/mile vs min/km (chart X-axis and pace strings). Math stays min/km internally. */
  unitSystem?: 'metric' | 'imperial';
  /** Optional: highlight one distance in the grid (default 10 km for run, 1h for bike). */
  featuredRace?: RaceType | CyclingEventType;
  /** @deprecated All standard distances are shown; use featuredRace to emphasize one. */
  raceType?: RaceType;
  /** Optional second curve (e.g. prior test) for comparison overlay. */
  comparisonCurve?: LactatePoint[];
  className?: string;
};

type ConfidenceLevel = 'low' | 'medium' | 'high';

/** Standard road/track distances (km); predictions use Riegel from LT2 @ 10 km reference. */
export const RACE_DISTANCE_ROWS: { id: RaceType; label: string; km: number }[] = [
  { id: '1500m', label: '1500 m', km: 1.5 },
  { id: '5k', label: '5 km', km: 5 },
  { id: '10k', label: '10 km', km: 10 },
  { id: 'hm', label: 'Half marathon', km: 21.0975 },
  { id: 'marathon', label: 'Marathon', km: 42.195 },
];

/**
 * Cycling power targets as % of FTP (LT2).
 * Based on empirical power-duration curves (Coggan power profile, extended endurance adjustments).
 */
export const CYCLING_EVENT_ROWS: {
  id: CyclingEventType;
  label: string;
  shortLabel: string;
  durationSec: number;
  ftpPct: number;
}[] = [
  { id: '1min', label: '1 min', shortLabel: '1 min', durationSec: 60, ftpPct: 1.50 },
  { id: '5min', label: '5 min', shortLabel: '5 min', durationSec: 300, ftpPct: 1.14 },
  { id: '20min', label: '20 min', shortLabel: '20 min', durationSec: 1200, ftpPct: 1.06 },
  { id: '1h', label: '1 hour (FTP)', shortLabel: '1h', durationSec: 3600, ftpPct: 1.00 },
  { id: '2h', label: '2 hours', shortLabel: '2h', durationSec: 7200, ftpPct: 0.87 },
  { id: '3h', label: '3 hours', shortLabel: '3h', durationSec: 10800, ftpPct: 0.79 },
  { id: '5h', label: '5 hours', shortLabel: '5h', durationSec: 18000, ftpPct: 0.70 },
];

const RIEGEL_EXP = 1.06;
const KM_PER_MILE = 1.609344;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Convert pace duration from min/km to min/mile (same "minutes per unit distance" scale). */
function minPerKmToMinPerMile(minPerKm: number): number {
  return minPerKm * KM_PER_MILE;
}

function formatPaceFromMinPerKm(
  minPerKm: number | null,
  unitSystem: 'metric' | 'imperial' = 'metric'
): string {
  if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm <= 0) return '—';
  const displayMin = unitSystem === 'imperial' ? minPerKmToMinPerMile(minPerKm) : minPerKm;
  const totalSec = Math.round(displayMin * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const suffix = unitSystem === 'imperial' ? '/mi' : '/km';
  return `${m}:${String(s).padStart(2, '0')} ${suffix}`;
}

function raceDistanceTileLabel(
  row: (typeof RACE_DISTANCE_ROWS)[number],
  unitSystem: 'metric' | 'imperial'
): string {
  if (unitSystem === 'metric') return row.label;
  const mi = row.km / KM_PER_MILE;
  if (row.id === '1500m') return `${row.label} (${mi.toFixed(2)} mi)`;
  if (row.id === '5k') return `5 km (${mi.toFixed(1)} mi)`;
  if (row.id === '10k') return `10 km (${mi.toFixed(1)} mi)`;
  if (row.id === 'hm') return `Half (${mi.toFixed(1)} mi)`;
  return `Marathon (${mi.toFixed(1)} mi)`;
}

/** Finish time from total seconds (compact for short races). */
function formatRaceTime(totalSeconds: number | null): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function normalizeZones(z: number[]): number[] {
  const base = z.length >= 5 ? z.slice(0, 5) : [...z, ...Array(5 - z.length).fill(0)];
  const sum = base.reduce((a, b) => a + Math.abs(b), 0);
  if (sum === 0) return [0.2, 0.2, 0.2, 0.2, 0.2];
  const scaled = base.map(v => Math.abs(v) / sum);
  return scaled;
}

function sortedCurve(points: LactatePoint[]): LactatePoint[] {
  return [...points].sort((a, b) => a.x - b.x);
}

/** Mean Δy/Δx between LT1 and LT2 on the intensity axis (lactate rise through the aerobic → threshold band). */
function linearSlopeLt1ToLt2(curve: LactatePoint[], lt1: number, lt2: number): number | null {
  const low = Math.min(lt1, lt2);
  const high = Math.max(lt1, lt2);
  const pts = sortedCurve(curve).filter(p => p.x >= low && p.x <= high);
  if (pts.length < 2) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    if (dx === 0) continue;
    sum += (pts[i].y - pts[i - 1].y) / dx;
    n += 1;
  }
  return n ? sum / n : null;
}

/** Discrete second derivative magnitude (curvature proxy), averaged over interior points. */
function meanCurvature(curve: LactatePoint[]): number | null {
  const pts = sortedCurve(curve);
  if (pts.length < 3) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const x0 = pts[i - 1].x;
    const x1 = pts[i].x;
    const x2 = pts[i + 1].x;
    const h1 = x1 - x0;
    const h2 = x2 - x1;
    if (h1 <= 0 || h2 <= 0) continue;
    const d2 =
      (2 / (h1 + h2)) *
      ((pts[i + 1].y - pts[i].y) / h2 - (pts[i].y - pts[i - 1].y) / h1);
    sum += Math.abs(d2);
    n += 1;
  }
  return n ? sum / n : null;
}

function interpolateY(curve: LactatePoint[], xq: number): number | null {
  const pts = sortedCurve(curve);
  if (!pts.length) return null;
  if (xq <= pts[0].x) return pts[0].y;
  if (xq >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (xq >= a.x && xq <= b.x) {
      const t = (xq - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return null;
}

function mergeCurveChartData(primary: LactatePoint[], secondary?: LactatePoint[]) {
  if (!secondary?.length) {
    return sortedCurve(primary).map(p => ({ x: p.x, lactate: p.y }));
  }
  const xs = new Set<number>();
  sortedCurve(primary).forEach(p => xs.add(p.x));
  sortedCurve(secondary).forEach(p => xs.add(p.x));
  return [...xs]
    .sort((a, b) => a - b)
    .map(x => {
      const lac = interpolateY(primary, x);
      const cmp = interpolateY(secondary, x);
      return {
        x,
        lactate: lac ?? NaN,
        compare: cmp ?? NaN,
      };
    });
}

function predictPaceRiegel(lt2MinPerKm: number, raceKm: number): number | null {
  if (!lt2MinPerKm || lt2MinPerKm <= 0) return null;
  const refKm = 10;
  const refTimeSec = lt2MinPerKm * refKm * 60;
  const timeSec = refTimeSec * Math.pow(raceKm / refKm, RIEGEL_EXP);
  return timeSec / (raceKm * 60);
}

function predictFromPowerWatts(lt2W: number, raceKm: number): number | null {
  if (!lt2W || lt2W <= 0) return null;
  const refKm = 10;
  const baselineW = 250;
  const baselineKmh = 14;
  const speedKmh = baselineKmh * Math.pow(lt2W / baselineW, 1 / 3);
  if (speedKmh <= 0) return null;
  const refTimeSec = (refKm / speedKmh) * 3600;
  const timeSec = refTimeSec * Math.pow(raceKm / refKm, RIEGEL_EXP);
  return timeSec / (raceKm * 60);
}

/**
 * Predict cycling power target for a given duration using FTP-percentage model.
 * ftpPct from CYCLING_EVENT_ROWS encodes physiological power-duration relationship.
 * Returns watts.
 */
function predictCyclingPower(ftp: number, ftpPct: number): number {
  return Math.round(ftp * ftpPct);
}

function enduranceScore(training: RacePacePredictorTraining): number {
  const z = normalizeZones(training.zoneDistribution);
  const z12 = z[0] + z[1];
  const volH = Math.max(0, training.volume);
  const volScore = clamp((volH / 14) * 100, 0, 100);
  const sessionScore = clamp((training.sessions / 20) * 100, 0, 100);
  const longH = Math.max(0, training.longWorkout);
  const longScore = clamp((longH / 5) * 100, 0, 100);
  const zoneScore = clamp(z12 * 100, 0, 100);
  return Math.round(clamp(0.35 * volScore + 0.25 * longScore + 0.25 * zoneScore + 0.15 * sessionScore, 0, 100));
}

function trainingLoadScore(training: RacePacePredictorTraining): number {
  const z = normalizeZones(training.zoneDistribution);
  const weights = [0.35, 0.55, 0.85, 1.15, 1.45];
  const intensity = z.reduce((acc, v, i) => acc + v * weights[i], 0);
  const volH = Math.max(0, training.volume);
  const raw = intensity * Math.log1p(volH) * 18;
  return Math.round(clamp(raw, 0, 100));
}

function durabilityScore(training: RacePacePredictorTraining): number {
  const z = normalizeZones(training.zoneDistribution);
  const z45 = z[3] + z[4];
  const longH = Math.max(0, training.longWorkout);
  const iv = Math.max(0, training.intervals);
  const longPart = clamp((longH / 4.5) * 55, 0, 55);
  const intervalPart = clamp((iv / 3) * 30, 0, 30);
  const balancePart = clamp((1 - z45) * 45, 0, 45);
  return Math.round(clamp(longPart * 0.55 + intervalPart * 0.25 + balancePart * 0.45, 0, 100));
}

/**
 * Optional capped slowdown for half marathon & marathon only: same Riegel LT2 anchor, but pace is nudged
 * slightly slower when durability / long-run exposure from `training` looks weak (max ~2.8% HM, ~4.5% marathon).
 * Shorter distances unchanged.
 */
function adjustPaceForLongRaceFromTraining(
  paceMinKm: number | null,
  raceKm: number,
  durability: number,
  longWorkoutHours: number
): number | null {
  if (paceMinKm == null || !Number.isFinite(paceMinKm) || paceMinKm <= 0) return null;
  if (raceKm < 21) return paceMinKm;

  const durDeficit = clamp((52 - durability) / 52, 0, 1);
  const longDeficit = clamp((2.25 - longWorkoutHours) / 2.25, 0, 1);
  const stress = clamp(0.58 * durDeficit + 0.42 * longDeficit, 0, 1);
  const maxPaceUpscale = raceKm >= 40 ? 0.045 : 0.028;
  return paceMinKm * (1 + maxPaceUpscale * stress);
}

function confidenceFromData(
  curveLen: number,
  lt1: number,
  lt2: number,
  minX: number,
  maxX: number,
  sessions: number
): ConfidenceLevel {
  const lo = Math.min(lt1, lt2);
  const hi = Math.max(lt1, lt2);
  const spanOk = curveLen >= 6 && lo >= minX && hi <= maxX;
  const sessionOk = sessions >= 8;
  if (spanOk && sessionOk && curveLen >= 8) return 'high';
  if (curveLen >= 4 && sessions >= 4) return 'medium';
  return 'low';
}

function buildProfileSummary(params: {
  endurance: number;
  load: number;
  durability: number;
  slope: number | null;
  gap: number | null;
  sport: SportType;
}): string {
  const { endurance, load, durability, slope, gap, sport } = params;
  const stable = slope != null && slope > 0.008 && slope < 0.22;
  const narrowGap = gap != null && gap < 1.2;

  let tone = 'Balanced';
  if (endurance > load + 12) tone = 'Endurance-dominant';
  else if (load > endurance + 12) tone = 'Intensity-forward';

  const lactate =
    stable && narrowGap
      ? 'stable lactate response with a compact LT1–LT2 transition'
      : stable
        ? 'stable lactate rise with room between LT1 and LT2'
        : 'responsive lactate curve with a steeper rise above LT1';

  const dur =
    durability >= 72 ? 'strong durability' : durability >= 48 ? 'solid durability' : 'developing durability';

  const sportLabel = sport === 'bike' ? 'cycling' : sport === 'swim' ? 'swimming' : 'running';

  return `${tone} ${sportLabel} profile with ${lactate} and ${dur}.`;
}

function buildTrainingHint(params: { endurance: number; load: number; durability: number; sport: SportType }): string {
  const { endurance, load, durability, sport } = params;
  if (durability < endurance - 12 && durability < 52) {
    return sport === 'bike'
      ? 'Based on your training, power is slightly limited by durability — prioritize long aerobic rides (3 h+).'
      : 'Based on your training, predicted pace is slightly limited by durability — prioritize long aerobic work.';
  }
  if (load > endurance + 10) {
    return 'Based on your training, freshness may outperform peak speed — watch recovery around key sessions.';
  }
  if (endurance > 78 && durability > 70) {
    return sport === 'bike'
      ? 'Training profile supports the prediction well — maintain volume with selective quality near LT2.'
      : 'Training profile supports the prediction well — maintain volume with selective quality near LT2.';
  }
  return 'Based on your training, predicted pace aligns with threshold and aerobic development.';
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const styles: Record<ConfidenceLevel, string> = {
    high: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    medium: 'bg-amber-50 text-amber-900 ring-amber-200',
    low: 'bg-rose-50 text-rose-800 ring-rose-200',
  };
  const label: Record<ConfidenceLevel, string> = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[level]}`}
    >
      {label[level]}
    </span>
  );
}

function MetricMini({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span className="text-lg font-bold text-slate-900">{value}</span>
        {suffix ? <span className="text-xs font-medium text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

// ─── Cycling power table ───────────────────────────────────────────────────────

function CyclingEventGrid({
  ftp,
  athleteWeightKg,
  highlightId,
}: {
  ftp: number;
  athleteWeightKg?: number;
  highlightId: string;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-sm font-bold text-slate-900">Power targets by event duration</h3>
        <p className="text-[11px] text-slate-500">FTP-percentage model · LT2 = FTP ({Math.round(ftp)} W)</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {CYCLING_EVENT_ROWS.map(row => {
          const watts = predictCyclingPower(ftp, row.ftpPct);
          const wpkg = athleteWeightKg && athleteWeightKg > 0 ? watts / athleteWeightKg : null;
          const isFeatured = row.id === highlightId;
          const isAboveFtp = row.ftpPct > 1.0;
          return (
            <div
              key={row.id}
              className={`rounded-xl border px-2 py-3 text-center shadow-sm transition-colors ${
                isFeatured
                  ? 'border-[#767eb5]/50 bg-[#767eb5]/[0.07] ring-1 ring-[#767eb5]/25'
                  : isAboveFtp
                  ? 'border-orange-200/60 bg-orange-50/40'
                  : 'border-slate-200/80 bg-white/80'
              }`}
            >
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${isAboveFtp ? 'text-orange-500' : 'text-[#767eb5]'}`}>
                {row.shortLabel}
              </div>
              <div className="mt-1.5 text-base font-bold tabular-nums leading-tight text-slate-900 sm:text-lg">
                {watts} W
              </div>
              {wpkg != null ? (
                <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                  {wpkg.toFixed(2)} W/kg
                </div>
              ) : null}
              <div className={`mt-0.5 text-[10px] font-medium ${isAboveFtp ? 'text-orange-400' : 'text-slate-400'}`}>
                {Math.round(row.ftpPct * 100)}% FTP
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        Targets based on FTP-percentage power-duration model (Coggan). Orange = above FTP (anaerobic).
        {athleteWeightKg ? ` W/kg calculated at ${athleteWeightKg} kg.` : ' Add body weight in test settings to see W/kg.'}
      </p>
    </div>
  );
}

// ─── Running distance grid ─────────────────────────────────────────────────────

function RunningDistanceGrid({
  distanceRows,
  highlightId,
  unitSystem,
  isPower,
}: {
  distanceRows: { id: RaceType; label: string; km: number; paceMinKm: number | null; timeSec: number | null }[];
  highlightId: string;
  unitSystem: 'metric' | 'imperial';
  isPower: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-sm font-bold text-slate-900">Predicted times &amp; paces</h3>
        <p className="text-[11px] text-slate-500">
          {isPower
            ? 'Power model · Riegel scaling from 10 km reference at LT2'
            : unitSystem === 'imperial'
              ? 'Riegel formula · LT2 pace as 10 km reference · paces shown in min/mile'
              : 'Riegel formula · LT2 pace as 10 km reference'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {distanceRows.map(row => {
          const isFeatured = row.id === highlightId;
          return (
            <div
              key={row.id}
              className={`rounded-xl border px-2.5 py-3 text-center shadow-sm transition-colors ${
                isFeatured
                  ? 'border-[#767eb5]/50 bg-[#767eb5]/[0.07] ring-1 ring-[#767eb5]/25'
                  : 'border-slate-200/80 bg-white/80'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#767eb5]">
                {raceDistanceTileLabel(row, unitSystem)}
              </div>
              <div className="mt-1.5 text-lg font-bold tabular-nums leading-tight text-slate-900 sm:text-xl">
                {formatRaceTime(row.timeSec)}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                {formatPaceFromMinPerKm(row.paceMinKm, unitSystem)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        1500 m–10 km: Riegel scaling from LT2 as a 10 km anchor. Half marathon &amp; marathon: same base, plus a
        small capped slowdown when durability or long-run volume from your training block looks limited.
      </p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function RacePacePredictorCard({
  lt1,
  lt2,
  lactateCurve,
  training,
  sport,
  athleteWeightKg,
  unitSystem = 'metric',
  featuredRace,
  raceType,
  comparisonCurve,
  className = '',
}: RacePacePredictorProps) {
  // Determine sport mode: explicit prop takes priority, else infer from values
  const isCycling: boolean = sport === 'bike' || (!sport && lt2 > lt1 && lt2 > 50);
  const isSwim: boolean = sport === 'swim';
  const sportType: SportType = isCycling ? 'bike' : isSwim ? 'swim' : 'run';

  const defaultFeatured = isCycling ? '1h' : '10k';
  const highlightId = (featuredRace ?? raceType ?? defaultFeatured) as string;
  const paceUnitLabel = unitSystem === 'imperial' ? 'min/mile' : 'min/km';

  const model = useMemo(() => {
    const curve = sortedCurve(lactateCurve);
    const minX = curve.length ? curve[0].x : 0;
    const maxX = curve.length ? curve[curve.length - 1].x : 0;
    const isPower = isCycling;

    const durability = durabilityScore(training);
    const longH = Math.max(0, training.longWorkout);

    const distanceRows = RACE_DISTANCE_ROWS.map(({ id, label, km }) => {
      let paceMinKm = isPower ? predictFromPowerWatts(lt2, km) : predictPaceRiegel(lt2, km);
      paceMinKm = adjustPaceForLongRaceFromTraining(paceMinKm, km, durability, longH);
      const timeSec =
        paceMinKm != null && Number.isFinite(paceMinKm) && paceMinKm > 0 ? paceMinKm * km * 60 : null;
      return { id, label, km, paceMinKm, timeSec };
    });

    const slope = linearSlopeLt1ToLt2(lactateCurve, lt1, lt2);
    const curvature = meanCurvature(lactateCurve);
    const y1 = interpolateY(lactateCurve, lt1);
    const y2 = interpolateY(lactateCurve, lt2);
    const lactateGap = y1 != null && y2 != null ? Math.abs(y2 - y1) : null;
    const ltGap = Math.abs(lt2 - lt1);

    const endurance = enduranceScore(training);
    const load = trainingLoadScore(training);

    const conf = confidenceFromData(
      curve.length,
      lt1,
      lt2,
      minX,
      maxX,
      training.sessions
    );

    const chartData = mergeCurveChartData(lactateCurve, comparisonCurve);

    const summary = buildProfileSummary({
      endurance,
      load,
      durability,
      slope,
      gap: lactateGap,
      sport: sportType,
    });

    const hint = buildTrainingHint({ endurance, load, durability, sport: sportType });

    return {
      isPower,
      distanceRows,
      slope,
      curvature,
      lactateGap,
      ltGap,
      endurance,
      load,
      durability,
      conf,
      chartData,
      summary,
      hint,
      minX,
      maxX,
    };
  }, [lt1, lt2, lactateCurve, training, comparisonCurve, isCycling, sportType]);

  const lt2Display = isCycling ? `${Math.round(lt2)} W` : formatPaceFromMinPerKm(lt2, unitSystem);
  const ltGapDisplay =
    isCycling || unitSystem === 'metric'
      ? model.ltGap.toFixed(isCycling ? 0 : 2)
      : (model.ltGap * KM_PER_MILE).toFixed(2);
  const ltGapUnit = isCycling ? 'W' : unitSystem === 'imperial' ? 'min/mi' : 'min/km';

  const chartHasCompare =
    Array.isArray(comparisonCurve) &&
    comparisonCurve.length > 0 &&
    model.chartData.some(d => Number.isFinite((d as any).compare));

  const sportLabel = isCycling ? 'Cycling' : isSwim ? 'Swimming' : 'Running';
  const wpkgDisplay = isCycling && athleteWeightKg && athleteWeightKg > 0
    ? `${(lt2 / athleteWeightKg).toFixed(2)} W/kg`
    : null;

  return (
    <section
      className={`rounded-2xl border border-slate-200/90 bg-gradient-to-b from-[#eef2ff] to-white p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.25)] sm:p-6 ${className}`}
      style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className="flex flex-col gap-2 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {isCycling ? 'Power Predictor' : 'Race Pace Predictor'}
            </h2>
            <span className="rounded-full bg-[#767eb5]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#767eb5]">
              {sportLabel}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {isCycling
              ? 'Power targets based on lactate threshold (FTP)'
              : 'Based on lactate & training data'}
          </p>
        </div>
        <ConfidenceBadge level={model.conf} />
      </header>

      {/* Event grid — cycling or running */}
      {isCycling ? (
        <CyclingEventGrid
          ftp={lt2}
          athleteWeightKg={athleteWeightKg}
          highlightId={highlightId}
        />
      ) : (
        <RunningDistanceGrid
          distanceRows={model.distanceRows}
          highlightId={highlightId}
          unitSystem={unitSystem}
          isPower={false}
        />
      )}

      {/* Metrics row */}
      <div className={`mt-5 grid gap-3 ${isCycling && wpkgDisplay ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <MetricMini label="Endurance score" value={model.endurance} suffix="/ 100" />
        <MetricMini label={isCycling ? 'FTP (LT2)' : 'LT2'} value={lt2Display} />
        {wpkgDisplay && (
          <MetricMini label="FTP W/kg" value={wpkgDisplay} />
        )}
        <MetricMini label="Training load" value={model.load} suffix="/ 100" />
        <MetricMini label="Durability" value={model.durability} suffix="/ 100" />
      </div>

      {/* Curve insight */}
      <div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Lactate curve</h3>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
              {isCycling
                ? 'X-axis: power (W) · Y-axis: lactate (mmol/L). Shaded band = intensity range between LT1 and LT2 (FTP zone).'
                : `X-axis: pace (${paceUnitLabel}; slower left, faster right) · Y-axis: lactate (mmol/L). Shaded band = intensity range between LT1 and LT2.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[10px] text-slate-500 sm:pt-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm" style={{ background: ACCENT }} />
              Lactate
            </span>
            {chartHasCompare ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-4 rounded-sm bg-slate-300" />
                Prior
              </span>
            ) : null}
          </div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={model.chartData}
              margin={{
                top: 4,
                right: 8,
                left: 0,
                bottom: isCycling ? 22 : unitSystem === 'imperial' ? 34 : 28,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="x"
                reversed={!isCycling}
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickMargin={4}
                tickFormatter={(v: number) =>
                  isCycling
                    ? `${Math.round(v)}`
                    : formatPaceFromMinPerKm(v, unitSystem).replace(/ \/mi| \/km/, '')
                }
                label={{
                  value: isCycling ? 'Power (W)' : `Pace (${paceUnitLabel})`,
                  position: 'bottom',
                  offset: 2,
                  fontSize: 10,
                  fill: '#64748b',
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
                labelFormatter={(v: number) =>
                  isCycling ? `Power ${v} W` : `Pace ${formatPaceFromMinPerKm(v, unitSystem)}`
                }
                formatter={(value: number, name: string) => {
                  const label = name === 'compare' ? 'Prior' : name === 'lactate' ? 'Lactate' : String(name);
                  return [`${Number(value).toFixed(2)} mmol/L`, label];
                }}
              />
              <ReferenceArea
                x1={Math.min(lt1, lt2)}
                x2={Math.max(lt1, lt2)}
                fill={ACCENT_SOFT}
                strokeOpacity={0}
              />
              <ReferenceLine
                x={lt1}
                stroke={ACCENT}
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'LT1', position: 'top', fontSize: 9, fill: ACCENT }}
              />
              <ReferenceLine
                x={lt2}
                stroke="#334155"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: isCycling ? 'FTP' : 'LT2', position: 'top', fontSize: 9, fill: '#334155' }}
              />
              <Line type="monotone" dataKey="lactate" stroke={ACCENT} strokeWidth={2} dot={false} name="Current" />
              {chartHasCompare ? (
                <Line
                  type="monotone"
                  dataKey="compare"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  name="Prior"
                  connectNulls={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Slope (LT1→LT2)</dt>
            <dd className="font-semibold text-slate-800">
              {model.slope != null ? model.slope.toFixed(3) : '—'} <span className="font-normal">Δy/Δx</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Curvature (avg |d²y|)</dt>
            <dd className="font-semibold text-slate-800">
              {model.curvature != null ? model.curvature.toFixed(4) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">LT1–LT2 gap</dt>
            <dd className="font-semibold text-slate-800">
              {ltGapDisplay}
              {ltGapUnit ? <span className="ml-1 font-normal text-slate-500">{ltGapUnit}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Lactate @ gap</dt>
            <dd className="font-semibold text-slate-800">
              {model.lactateGap != null ? `${model.lactateGap.toFixed(2)} mmol/L` : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm leading-relaxed text-slate-700">
        {model.summary}
      </p>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        <span className="font-semibold text-[#767eb5]">Training note.</span> {model.hint}
      </p>
    </section>
  );
}

export default RacePacePredictorCard;
