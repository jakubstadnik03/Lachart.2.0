/**
 * Shared LT1/LT2 extraction for native UI (profile, dashboard, testing list).
 * Uses the same calculateThresholds() pipeline as the full test page / zone tables.
 */
import { calculateThresholds } from '../components/Testing-page/DataTable';
import { getEffectiveLactateInputMode } from './lactateTestInputMode';

export function normLactateSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycl') || v.includes('ride')) return 'bike';
  if (v.includes('run')) return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

export function isPaceLactateSport(sport) {
  return sport === 'run' || sport === 'swim';
}

function fmtPaceSec(sec) {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format threshold intensity for UI chips (W, pace, or km/h for speed tests). */
export function formatThresholdIntensity(value, test, sport = normLactateSport(test?.sport)) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (sport === 'bike') return `${Math.round(n)} W`;
  const storage = getEffectiveLactateInputMode(test);
  if (storage === 'speed') {
    const unit = sport === 'swim' ? '/100m' : ' km/h';
    if (sport === 'swim') return `${n.toFixed(2)}${unit}`;
    return `${n.toFixed(1)}${unit}`;
  }
  const suffix = sport === 'swim' ? '/100m' : '/km';
  return `${fmtPaceSec(n)}${suffix}`;
}

/**
 * @returns {null | {
 *   sport, isPace, storageMode,
 *   lt1, lt2, lt1Lac, lt2Lac, lt1Hr, lt2Hr,
 *   ltp1, ltp2, baseLactate, peakLactate, points, stagesCount
 * }}
 */
export function extractLactateThresholds(test) {
  if (!test) return null;
  const sport = normLactateSport(test.sport);
  const isPace = isPaceLactateSport(sport);
  const storageMode = getEffectiveLactateInputMode(test);
  const ov = test.thresholdOverrides || {};

  let ltp1Power = ov.LTP1 != null ? Number(ov.LTP1) : null;
  let ltp2Power = ov.LTP2 != null ? Number(ov.LTP2) : null;
  let ltp1Lactate = ov.LTP1_lactate != null ? Number(ov.LTP1_lactate) : null;
  let ltp2Lactate = ov.LTP2_lactate != null ? Number(ov.LTP2_lactate) : null;
  let ltp1Hr = ov.LTP1_hr != null ? Number(ov.LTP1_hr) : null;
  let ltp2Hr = ov.LTP2_hr != null ? Number(ov.LTP2_hr) : null;

  const pts = (Array.isArray(test.results) ? test.results : [])
    .map((r) => ({
      x: Number(String(r.power ?? r.interval ?? '').replace(',', '.')),
      y: Number(String(r.lactate ?? '').replace(',', '.')),
      hr: Number(String(r.heartRate ?? '').replace(',', '.')),
    }))
    .filter((p) => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);

  try {
    const thr = calculateThresholds(test);
    if (thr) {
      const dLt1 = Number(thr.LTP1);
      const dLt2 = Number(thr.LTP2);
      const dLt1La = Number(thr.lactates?.LTP1);
      const dLt2La = Number(thr.lactates?.LTP2);
      const dLt1Hr = Number(thr.heartRates?.LTP1);
      const dLt2Hr = Number(thr.heartRates?.LTP2);
      if (ltp1Power == null && Number.isFinite(dLt1) && dLt1 > 0) ltp1Power = dLt1;
      if (ltp2Power == null && Number.isFinite(dLt2) && dLt2 > 0) ltp2Power = dLt2;
      if (ltp1Lactate == null && Number.isFinite(dLt1La) && dLt1La > 0) ltp1Lactate = dLt1La;
      if (ltp2Lactate == null && Number.isFinite(dLt2La) && dLt2La > 0) ltp2Lactate = dLt2La;
      if (ltp1Hr == null && Number.isFinite(dLt1Hr) && dLt1Hr > 0) ltp1Hr = Math.round(dLt1Hr);
      if (ltp2Hr == null && Number.isFinite(dLt2Hr) && dLt2Hr > 0) ltp2Hr = Math.round(dLt2Hr);
    }
  } catch {
    // fall through to simple interpolation
  }

  if ((ltp1Power == null || ltp2Power == null) && pts.length >= 3) {
    pts.sort((a, b) => (isPace ? b.x - a.x : a.x - b.x));
    const base = Number(test.baseLactate) || pts[0]?.y || 1.0;
    const lt1Target = base + 1.5;
    const lt2Target = Math.max(4.0, base + 3.0);
    const interp = (target) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
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
    if (ltp1Power == null) {
      const r = interp(lt1Target);
      if (r) { ltp1Power = r.x; ltp1Hr = ltp1Hr ?? r.hr; ltp1Lactate = ltp1Lactate ?? lt1Target; }
    }
    if (ltp2Power == null) {
      const r = interp(lt2Target) || interp(4.0);
      if (r) { ltp2Power = r.x; ltp2Hr = ltp2Hr ?? r.hr; ltp2Lactate = ltp2Lactate ?? 4.0; }
    }
  }

  return {
    sport,
    isPace,
    storageMode,
    lt1: ltp1Power,
    lt2: ltp2Power,
    lt1Lac: ltp1Lactate,
    lt2Lac: ltp2Lactate,
    lt1Hr: ltp1Hr,
    lt2Hr: ltp2Hr,
    ltp1: { power: ltp1Power, lactate: ltp1Lactate, hr: ltp1Hr },
    ltp2: { power: ltp2Power, lactate: ltp2Lactate, hr: ltp2Hr },
    baseLactate: Number(test.baseLactate) || (pts[0]?.y ?? null),
    peakLactate: pts.length ? Math.max(...pts.map((p) => p.y)) : null,
    points: pts,
    stagesCount: pts.length,
  };
}
