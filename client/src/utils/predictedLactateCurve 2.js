import { shiftedLactateCurve, demandToThreshold } from './hrPowerProfile';

function normSport(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('bike') || s.includes('cycl') || s.includes('ride')) return 'bike';
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  return 'other';
}

/**
 * Where the test says the athlete was, redrawn where the training says they are.
 *
 * The card showed one thing: the last lab test. On this account that test is
 * from March, and by September nobody needs to be told what they could do six
 * months ago — the number they train against today is the estimate, and it was
 * buried on another page. So the estimate leads and the measurement is one tap
 * behind it.
 *
 * The measured test is never discarded. It is the anchor the estimate is built
 * on, it is what "Measured" shows, and when there is not enough training since
 * the test to project anything, it is what the card falls back to with no
 * toggle at all — an estimate offered without evidence would be worse than the
 * stale number it replaced.
 *
 * Everything downstream reuses the measured pipeline: the projected thresholds
 * are written into a clone of the test as overrides, so the zone strip and the
 * HR columns are computed by exactly the code that computes them for a real
 * test. There is no second zone implementation to drift out of step.
 *
 * The anchor is passed in rather than re-derived: the caller already built one
 * to send with the drift request, and the estimate has to be expressed against
 * the same thresholds it was measured against. Re-extracting here would risk
 * answering in terms of a slightly different curve than the server was given.
 *
 * @param {object} last        the measured test as the card parsed it
 * @param {object} projection  the drift walk's estimate
 * @param {object} anchor      the thresholds the drift request was anchored on
 */
export function predictedFromProjection(last, projection, anchor) {
  if (!last || !projection || !anchor) return null;

  const kind = normSport(last.sport);
  const storageMode = anchor.storageMode || 'pace';
  const back = (demand) => demandToThreshold(demand, { kind, storageMode });

  const lt1 = projection.lt1?.toDemand ? back(projection.lt1.toDemand) : null;
  const lt2 = projection.lt2?.toDemand ? back(projection.lt2.toDemand) : null;
  if (!(lt2 > 0)) return null;

  const shifted = shiftedLactateCurve(anchor, projection);
  if (!shifted?.points?.length) return null;

  // Heart rate rides along unchanged, and that is the premise rather than an
  // omission: the projection is built FROM heart rate measured in training, so
  // what moved is the power or pace produced at a given HR, not the HR itself.
  const points = shifted.points.map((p, i) => ({
    x: back(p.demand),
    y: p.lactate,
    hr: last.points[i]?.hr ?? null,
  })).filter((p) => Number.isFinite(p.x) && p.x > 0);
  if (points.length < 3) return null;

  return {
    ...last,
    points,
    ltp1: { ...last.ltp1, power: lt1 ?? last.ltp1.power },
    ltp2: { ...last.ltp2, power: lt2 },
    // A clone the measured zone pipeline can consume unchanged.
    raw: {
      ...last.raw,
      thresholdOverrides: {
        ...(last.raw.thresholdOverrides || {}),
        ...(lt1 > 0 ? { LTP1: lt1 } : {}),
        LTP2: lt2,
      },
    },
    projection,
  };
}
