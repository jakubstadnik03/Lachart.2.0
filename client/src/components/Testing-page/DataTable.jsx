// DataTable.jsx
// =============

import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as math from 'mathjs';
import { useAuth } from '../../context/AuthProvider';
import { getEffectiveLactateInputMode, getLactateDisplayMode } from '../../utils/lactateTestInputMode';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { computeLactateThresholds } from './lactateThresholdSegmented';

/** Dev: podrobné logy LT1/LT2 jsou ve vývoji zapnuté výchozí. Vypnout: `localStorage.setItem('lachart:debugThresholds','0')`. */
export const isThresholdDebugEnabled = () => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    if (typeof localStorage === 'undefined') return true;
    const v = localStorage.getItem('lachart:debugThresholds');
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
};

// Pomocná funkce pro lineární interpolaci
const interpolate = (x0, y0, x1, y1, targetY) => {
    return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
  };
  
  // Pomocná funkce pro filtrování outlierů a vytvoření monotónně rostoucí křivky
  const filterOutliersAndCreateMonotonic = (points, isPaceSport = false) => {
    if (!points || points.length < 2) return points;
    
    // Seřadit body podle power/pace
    const sortedPoints = [...points].sort((a, b) => {
      if (isPaceSport) {
        return b.power - a.power; // Sestupně pro pace (pomalejší -> rychlejší)
      }
      return a.power - b.power; // Vzestupně pro power (nižší -> vyšší)
    });
    
    // Pro laktát: při zvyšující se intenzitě by měl laktát obecně růst
    // Filtrovat body, které mají laktát výrazně nižší než předchozí bod
    const filtered = [sortedPoints[0]]; // Vždy zahrnout první bod
    
    for (let i = 1; i < sortedPoints.length; i++) {
      const prev = filtered[filtered.length - 1];
      const curr = sortedPoints[i];
      
      // Pokud je laktát nižší než předchozí o více než 0.5 mmol/L, je to pravděpodobně outlier
      // Ale pokud je intenzita výrazně nižší (pro pace: vyšší power = pomalejší), může to být OK
      const intensityDiff = isPaceSport 
        ? (prev.power - curr.power) / prev.power // Pro pace: relativní změna
        : (curr.power - prev.power) / prev.power; // Pro power: relativní změna
      
      const lactateDiff = curr.lactate - prev.lactate;
      
      // Pokud je laktát výrazně nižší (>0.5 mmol/L) a intenzita se nezměnila výrazně (<10%), je to outlier
      if (lactateDiff < -0.5 && Math.abs(intensityDiff) < 0.1) {
        console.log(`[filterOutliers] Skipping outlier point: power=${curr.power}, lactate=${curr.lactate} (prev: ${prev.lactate})`);
        continue;
      }
      
      filtered.push(curr);
    }
    
    return filtered;
  };

  // D-max metoda pro nalezení thresholdu
  const calculateDmax = (points, isPaceSport = false) => {
    if (!points || points.length < 3) return null;
    
    // Filtrovat outliery a vytvořit monotónně rostoucí křivku
    const filteredPoints = filterOutliersAndCreateMonotonic(points, isPaceSport);
    
    let sortedPoints;
    if (filteredPoints.length < 3) {
      console.warn('[D-max] Not enough points after filtering outliers, using original points');
      // Pokud filtrování odstranilo příliš mnoho bodů, použít původní body
      sortedPoints = [...points].sort((a, b) => {
        if (isPaceSport) {
          return b.power - a.power;
        }
        return a.power - b.power;
      });
    } else {
      sortedPoints = filteredPoints;
    }
    
    // Modified D-max (Cheng 1992): use minimum lactate point in first half as reference start.
    // This correctly handles "drop then rise" lactate curves — the reference line starts where
    // lactate is lowest (first sustained rise), not at the very first measured point.
    const lastPoint = sortedPoints[sortedPoints.length - 1];
    const searchLen = Math.ceil(sortedPoints.length / 2);
    let riseStartIdx = 0;
    let minLa = sortedPoints[0].lactate;
    for (let i = 1; i < searchLen; i++) {
      if (sortedPoints[i].lactate < minLa) {
        minLa = sortedPoints[i].lactate;
        riseStartIdx = i;
      }
    }
    const refStart = sortedPoints[riseStartIdx]; // = firstPoint when no initial drop

    // Validace: reference start a poslední bod musí mít různý výkon
    if (refStart.power === lastPoint.power) {
      console.warn('[D-max] Reference start and last point have same power, cannot calculate D-max');
      return null;
    }

    // Přímka od minima laktátu k poslednímu bodu (Modified D-max referenční přímka)
    const slope = (lastPoint.lactate - refStart.lactate) /
                  (lastPoint.power - refStart.power);
    const intercept = refStart.lactate - slope * refStart.power;

    // Najít bod s největší kolmou vzdáleností od přímky.
    // Hledat pouze od riseStartIdx dál (body před minimem nejsou relevantní).
    let maxDistance = 0;
    let dmaxPoint = null;

    for (let i = riseStartIdx + 1; i < sortedPoints.length - 1; i++) {
      const point = sortedPoints[i];
      // Vypočítat vzdálenost bodu od přímky
      const distance = Math.abs(
        point.lactate - (slope * point.power + intercept)
      ) / Math.sqrt(1 + slope * slope);
      
      if (distance > maxDistance) {
        maxDistance = distance;
        dmaxPoint = point;
      }
    }
    
    // Pokud se nenašel žádný bod (málo dat), použít střední bod
    if (!dmaxPoint && sortedPoints.length >= 2) {
      const midIndex = Math.floor(sortedPoints.length / 2);
      dmaxPoint = sortedPoints[midIndex];
      console.warn('[D-max] No point found with max distance, using middle point');
    }
    
    // Debug logging removed - dmaxPoint found
    
    return dmaxPoint;
  };
  
  // Individual Anaerobic Threshold (IAT) – bod s největším nárůstem laktátu vzhledem k intenzitě
  // points musí být seřazené od nízké intenzity k vysoké (bike: low→high W, run/swim: slow→fast = high sec → low sec)
  const calculateIAT = (points, sport = 'bike') => {
    if (!points || points.length < 3) return null;
    const isPaceSport = sport === 'run' || sport === 'swim';
    const sortedPoints = [...points].sort((a, b) => {
      if (isPaceSport) return b.power - a.power; // pace: sestupně (pomalejší první = nízká intenzita první)
      return a.power - b.power; // bike: vzestupně (nízký výkon první)
    });
    
    let maxIncrease = -Infinity;
    let iatPoint = null;
    
    for (let i = 1; i < sortedPoints.length; i++) {
      const powerDiff = sortedPoints[i].power - sortedPoints[i - 1].power;
      if (powerDiff === 0) continue;
      const increase = (sortedPoints[i].lactate - sortedPoints[i - 1].lactate) / powerDiff;
      if (increase > maxIncrease) {
        maxIncrease = increase;
        iatPoint = sortedPoints[i];
      }
    }
    
    return iatPoint;
  };
  
  // Pomocná funkce pro výpočet derivací
  const calculateDerivatives = (points) => {
    if (!points || points.length < 3) {
      return { firstDerivative: [], secondDerivative: [] };
    }

    const firstDerivative = [];
    const secondDerivative = [];
  
    for (let i = 1; i < points.length - 1; i++) {
      // První derivace (změna laktátu / změna výkonu)
      const d1 = (points[i + 1].lactate - points[i - 1].lactate) / 
                 (points[i + 1].power - points[i - 1].power);
      firstDerivative.push({ power: points[i].power, value: d1 });
    }
  
    // Výpočet druhé derivace
    for (let i = 0; i < firstDerivative.length - 1; i++) {
      const d2 = (firstDerivative[i + 1].value - firstDerivative[i].value) /
                 (firstDerivative[i + 1].power - firstDerivative[i].power);
      secondDerivative.push({ power: firstDerivative[i].power, value: d2 });
    }
  
    return { firstDerivative, secondDerivative };
  };
  
  // Funkce pro výpočet Log-log thresholdu
  const calculateLogLogThreshold = (results) => {
    if (!results || results.length < 3) {
      // console.log('Not enough data points for Log-log calculation:', results);
      return null;
    }

    try {
      // console.log('Calculating Log-log threshold with data:', results);
      
      // Transformace dat do logaritmického prostoru
      const logData = results.map(r => ({
        logPower: Math.log(r.power),
        logLactate: Math.log(r.lactate),
        originalPoint: r
      }));

      // console.log('Log-transformed data:', logData);

      let maxDeltaSlope = -Infinity;
      let breakpointIndex = 0;

      // Najít bod s největší změnou směrnice
      for (let i = 1; i < logData.length - 1; i++) {
        const slopeBefore = (logData[i].logLactate - logData[i-1].logLactate) /
                           (logData[i].logPower - logData[i-1].logPower);
        const slopeAfter = (logData[i+1].logLactate - logData[i].logLactate) /
                          (logData[i+1].logPower - logData[i].logPower);
        
        const deltaSlope = slopeAfter - slopeBefore;
        
        if (deltaSlope > maxDeltaSlope) {
          maxDeltaSlope = deltaSlope;
          breakpointIndex = i;
        }
      }

      return logData[breakpointIndex].originalPoint;
    } catch (error) {
      console.error('Error in Log-log calculation:', error);
      return null;
    }
  };
  
  /** Sestaví polynomický fit a první derivaci z výsledků. Pro běh/plavání stejná logika jako v grafu: jen body s rostoucím laktátem (slow→fast). */
  const buildPolynomialFit = (sortedResults, baseLactate, sport = 'bike') => {
    if (!sortedResults || sortedResults.length < 3) return null;
    const isPaceSport = sport === 'run' || sport === 'swim';
    const points = sortedResults.map((r) => ({
      power: Number(r.power),
      lactate: Number(r.lactate),
      heartRate: r.heartRate != null ? Number(r.heartRate) : null
    }));
    const minP = Math.min(...points.map((p) => p.power));
    const maxP = Math.max(...points.map((p) => p.power));
    const range = maxP - minP || 1;
    // Pro běh/plavání: do fitu jen body tvořící neklesající laktát (slow→fast), aby křivka nedělala nesmysly
    const TOL = 0.05;
    const increasing = [];
    for (let i = 0; i < points.length; i++) {
      const lastLa = increasing.length ? increasing[increasing.length - 1].lactate : -Infinity;
      if (points[i].lactate >= lastLa - TOL) increasing.push(points[i]);
    }
    let pointsForCurve = increasing.length >= 2 ? increasing : points;
    let postDropStartX = null;
    if (pointsForCurve.length > 0) postDropStartX = pointsForCurve[0].power;
    const baseLaNum = baseLactate != null ? Number(baseLactate) : null;
    const xVals = [];
    const yVals = [];
    if (pointsForCurve === points && baseLaNum != null && baseLaNum > 0) {
      const baseX = isPaceSport ? maxP + range * 0.12 : minP - range * 0.12;
      xVals.push(baseX);
      yVals.push(baseLaNum);
    }
    pointsForCurve.forEach((p) => {
      xVals.push(p.power);
      yVals.push(p.lactate);
    });
    const n = xVals.length;
    if (n < 2) return null;
    const degree = Math.min(4, n - 1);
    if (degree < 1) return null;
    try {
      const X = xVals.map((x, i) => {
        const row = [1];
        for (let d = 1; d <= degree; d++) row.push(Math.pow(x, d));
        return row;
      });
      const Y = yVals;
      const XT = math.transpose(X);
      const XTX = math.multiply(XT, X);
      const XTY = math.multiply(XT, Y);
      const coeffs = math.lusolve(XTX, XTY).flat();
      const polyFn = (x) => {
        let v = coeffs[0];
        for (let d = 1; d <= degree; d++) v += coeffs[d] * Math.pow(x, d);
        return v;
      };
      const derivFn = (x) => {
        let v = 0;
        for (let d = 1; d <= degree; d++) v += d * coeffs[d] * Math.pow(x, d - 1);
        return v;
      };
      const fitMinX = Math.min(...xVals);
      const fitMaxX = Math.max(...xVals);
      return { polyFn, derivFn, fitMinX, fitMaxX, coeffs, postDropStartX };
    } catch (e) {
      return null;
    }
  };

  /**
   * Najde x (power/pace) na křivce polyFn, kde laktát = targetLactate.
   * Vrací dopočítanou hodnotu z křivky (ne z měřeného bodu).
   * @param {Function} polyFn - polynomická funkce lactate = polyFn(x)
   * @param {number} xMin - minimum x (fit rozsah)
   * @param {number} xMax - maximum x
   * @param {number} targetLactate - cílový laktát (mmol/L)
   * @param {boolean} isPaceSport - run/swim (pro výběr správného řešení při více průsečících)
   * @param {boolean} forLTP1 - true = hledáme LTP1 (nízká intenzita), false = LTP2 (vysoká intenzita)
   * @returns {number|null} x kde polyFn(x) ≈ targetLactate, nebo null
   */
  const findXForLactate = (polyFn, xMin, xMax, targetLactate, isPaceSport, forLTP1) => {
    const steps = 400;
    const dx = (xMax - xMin) / (steps - 1);
    const crossings = [];
    for (let i = 0; i < steps - 1; i++) {
      const x0 = xMin + i * dx;
      const x1 = xMin + (i + 1) * dx;
      const y0 = polyFn(x0);
      const y1 = polyFn(x1);
      if ((y0 <= targetLactate && y1 >= targetLactate) || (y0 >= targetLactate && y1 <= targetLactate)) {
        const t = Math.abs(y1 - y0) < 1e-9 ? 0.5 : (targetLactate - y0) / (y1 - y0);
        const xCross = x0 + t * (x1 - x0);
        crossings.push(xCross);
      }
    }
    if (crossings.length === 0) return null;
    
    // When lactate decreases and then increases again, there can be multiple crossings
    // For LTP1: if there are multiple crossings and lactate is decreasing, take the second one (after the drop)
    // For LTP2: take the last crossing (highest intensity)
    if (crossings.length > 1 && forLTP1) {
      // Check if lactate is decreasing (curve goes down then up)
      // Take the second crossing if it exists (after the drop)
      return isPaceSport ? crossings[1] || crossings[0] : crossings[1] || crossings[0];
    }
    
    if (forLTP1) {
      return isPaceSport ? Math.max(...crossings) : Math.min(...crossings);
    }
    return isPaceSport ? Math.min(...crossings) : Math.max(...crossings);
  };

  /** Fyziologické minimum: LTP1 (aerobní práh) má být vždy ≥ 1.5 mmol/L. */
  const MIN_LTP1_LACTATE = 1.5;
  /** Fyziologické maximum: LTP1 (aerobní práh) nemá být vyšší než 2.2 mmol/L (kolo + obecné guardy). */
  const MAX_LTP1_LACTATE = 2.2;
  /** Běh/plavání: horní strop La u LT1 z naměřených kroků — vyšší než u kola, aby se profily ne„lepily“ na 2.2. */
  const MAX_LTP1_LACTATE_PACE = 2.5;
  /** Absolutní fyziologické maximum pro LTP2 (nikdy nepřekročit). */
  const MAX_LTP2_LACTATE = 4.2;
  /** OBLA pro LT2: horní / dolní cíl; průměr použijeme místo „nalepení“ na strop 4.2 mmol/L */
  const OBLA_LT2_HIGH_MMOL = 4.0;
  const OBLA_LT2_LOW_MMOL = 3.5;
  const OBLA_LT2_BLEND_LACTATE_MMOL = (OBLA_LT2_HIGH_MMOL + OBLA_LT2_LOW_MMOL) / 2;
  /** LT2 má být alespoň kolem 2.5 mmol/L; pokud výpočet dá méně, použít výkon při 3.5/4.0 mmol/L */
  const MIN_LTP2_LACTATE_REASONABLE = 2.5;
  /** Minimální odstup LT2 od LT1 (W pro kolo), aby zóny dávaly smysl */
  const MIN_LT2_LT1_GAP_W = 25;
  /** Minimální odstup LT2 od LT1 u běhu/plavání (sekundy tempa): při menší mezeře posuneme LT1 na nižší La (dřívější aerobní práh). */
  const MIN_LT2_LT1_GAP_PACE_SEC = 22;

  const getAdaptiveLtp2Cap = (points) => {
    const vals = (points || [])
      .map(p => Number(p?.lactate))
      .filter(v => Number.isFinite(v) && v > 0);
    if (!vals.length) return MAX_LTP2_LACTATE;
    const observedMax = Math.max(...vals);
    // Držet cap znatelně pod vrcholem testu (např. max 4.1 → cap ~3.55), ať LT2 není „nalepený“ na konec křivky.
    const belowPeak = Math.max(0.5, observedMax * 0.12);
    return Math.min(MAX_LTP2_LACTATE, Math.max(3.5, observedMax - belowPeak));
  };

  // Lightweight robust smoothing: median-of-3 on lactate to reduce single-point noise.
  const smoothLactateMedian3 = (points) => {
    if (!points || points.length < 3) return points || [];
    return points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return { ...p };
      const vals = [Number(points[i - 1].lactate), Number(points[i].lactate), Number(points[i + 1].lactate)]
        .filter(v => Number.isFinite(v))
        .sort((a, b) => a - b);
      return { ...p, lactate: vals.length ? vals[Math.floor(vals.length / 2)] : p.lactate };
    });
  };

  /**
   * Po výrazném nárůstu: falešný start / ještě „nedozrálý“ LT1, pokud
   * - laktát později klesne pod patu (foot − ε), nebo
   * - před jasným pokračováním nahoru (‚breakout‘) klesne / couvne od špičky toho kroku (mírný retrace),
   * - nebo hned další bod znatelně klesne oproti konci nárůstu (stagnace / šum).
   */
  const isLtp1FalseStartRise = (
    points,
    riseEndIndex,
    footDipEpsilon = 0.08,
    peakRetraceMm = 0.055,
    breakoutDeltaMm = 0.42
  ) => {
    if (!points || riseEndIndex < 1 || riseEndIndex >= points.length) return false;
    const footLa = Number(points[riseEndIndex - 1].lactate);
    const currLa = Number(points[riseEndIndex].lactate);
    if (!Number.isFinite(footLa) || !Number.isFinite(currLa)) return false;
    const peakStep = Math.max(footLa, currLa);
    const footThreshold = footLa - footDipEpsilon;
    const breakoutLa = currLa + breakoutDeltaMm;

    if (riseEndIndex + 1 < points.length) {
      const laNext = Number(points[riseEndIndex + 1].lactate);
      if (Number.isFinite(laNext) && laNext < currLa - 0.04) return true;
    }

    let minBeforeBreakout = Infinity;
    for (let k = riseEndIndex + 1; k < points.length; k++) {
      const la = Number(points[k].lactate);
      if (!Number.isFinite(la)) continue;
      if (la < footThreshold) return true;
      if (la < peakStep - peakRetraceMm) return true;
      if (la >= breakoutLa) {
        if (minBeforeBreakout < peakStep - peakRetraceMm) return true;
        return false;
      }
      minBeforeBreakout = Math.min(minBeforeBreakout, la);
    }
    if (minBeforeBreakout < Infinity && minBeforeBreakout < peakStep - peakRetraceMm) return true;
    return false;
  };

  /** Krok s následným výrazným poklesem La — typicky špatný odběr / šum (např. 3.5 → 1.8). */
  const isSpikeThenDropOutlier = (pts, i) => {
    if (!pts || i < 0 || i >= pts.length - 1) return false;
    const la = Number(pts[i].lactate);
    const laNext = Number(pts[i + 1].lactate);
    if (!Number.isFinite(la) || !Number.isFinite(laNext)) return false;
    return la - laNext >= 0.5;
  };

  /** První významný nárůst laktátu v profilu je „falešný start“ (po něm ještě klesne pod patu). */
  const firstSignificantLactateRiseIsFalseStart = (pts) => {
    if (!pts || pts.length < 2) return false;
    for (let i = 1; i < pts.length; i++) {
      const inc = Number(pts[i].lactate) - Number(pts[i - 1].lactate);
      if (inc <= 0.3) continue;
      const la = Number(pts[i].lactate);
      if (!Number.isFinite(la) || la < 1.0) continue;
      // Check false-start even when La > LT1 cap (e.g. 3.5 mmol/L spike then drop).
      if (isLtp1FalseStartRise(pts, i) || isSpikeThenDropOutlier(pts, i)) return true;
      return false;
    }
    return false;
  };

  /**
   * LT1 z naměřených kroků: první významný nárůst, který není falešný start.
   * Laktát u LT1 omezen na maxLt1Lactate interpolací na segmentu (výkon z druhého nárůstu).
   */
  const pickLtp1PointSkippingFalseStarts = (pts, effectiveBaseLactate, maxLt1Lactate = MAX_LTP1_LACTATE) => {
    if (!pts || pts.length < 2) return null;
    const searchMaxLa = Math.max(maxLt1Lactate, 3.25);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const inc = Number(curr.lactate) - Number(prev.lactate);
      if (inc <= 0.3) continue;
      if (Number(curr.lactate) < effectiveBaseLactate * 0.8) continue;
      if (isLtp1FalseStartRise(pts, i) || isSpikeThenDropOutlier(pts, i)) continue;
      if (Number(curr.lactate) > searchMaxLa) continue;
      const la0 = Number(prev.lactate);
      const la1 = Number(curr.lactate);
      const p0 = Number(prev.power);
      const p1 = Number(curr.power);
      if (Number(curr.lactate) <= maxLt1Lactate) {
        return { power: Number(curr.power), lactate: Number(curr.lactate), heartRate: curr.heartRate };
      }
      if (Number.isFinite(la0) && Number.isFinite(la1) && la1 !== la0 && la0 <= maxLt1Lactate && la1 > maxLt1Lactate) {
        const t = (maxLt1Lactate - la0) / (la1 - la0);
        const p = p0 + t * (p1 - p0);
        return { power: p, lactate: maxLt1Lactate, heartRate: curr.heartRate };
      }
      return { power: Number(curr.power), lactate: Number(curr.lactate), heartRate: curr.heartRate };
    }
    return null;
  };

  /**
   * Běh/plavání: LT1 z reálných kroků testu — první krok s La ≥ minLactateMm (typicky 2.0),
   * ne z polynomu. La u LT1 omezeno na MAX_LTP1_LACTATE_PACE (2.5): při vyšším naměření interpolace na segmentu.
   * Při falešném startu stejná logika jako pickLtp1PointSkippingFalseStarts (s pace stropem).
   */
  const pickLt1FromMeasuredStepsForPace = (pts, effectiveBaseLactate, minLactateMm = 2.0) => {
    if (!pts || pts.length < 2) return null;
    const cap = MAX_LTP1_LACTATE_PACE;
    const sorted = [...pts].sort((a, b) => Number(b.power) - Number(a.power));
    if (firstSignificantLactateRiseIsFalseStart(sorted)) {
      return pickLtp1PointSkippingFalseStarts(sorted, effectiveBaseLactate, cap);
    }
    for (let i = 0; i < sorted.length; i++) {
      const la = Number(sorted[i].lactate);
      if (!Number.isFinite(la) || la < minLactateMm - 1e-9) continue;
      if (isSpikeThenDropOutlier(sorted, i)) continue;
      const curr = sorted[i];
      const pCurr = Number(curr.power);
      if (la <= cap) {
        return {
          power: pCurr,
          lactate: la,
          heartRate: curr.heartRate != null ? Number(curr.heartRate) : null
        };
      }
      if (i === 0) {
        return {
          power: pCurr,
          lactate: cap,
          heartRate: curr.heartRate != null ? Number(curr.heartRate) : null
        };
      }
      const prev = sorted[i - 1];
      const la0 = Number(prev.lactate);
      const la1 = la;
      const p0 = Number(prev.power);
      const p1 = pCurr;
      if (!Number.isFinite(la0) || !Number.isFinite(p0) || Math.abs(la1 - la0) < 1e-9) {
        return {
          power: pCurr,
          lactate: cap,
          heartRate: curr.heartRate != null ? Number(curr.heartRate) : null
        };
      }
      const t = (cap - la0) / (la1 - la0);
      const outPower = p0 + t * (p1 - p0);
      const h0 = prev.heartRate != null ? Number(prev.heartRate) : null;
      const h1 = curr.heartRate != null ? Number(curr.heartRate) : null;
      let outHr = null;
      if (h0 != null && h1 != null && Number.isFinite(h0) && Number.isFinite(h1)) {
        outHr = h0 + t * (h1 - h0);
      } else {
        outHr = h1 ?? h0;
      }
      return { power: outPower, lactate: cap, heartRate: outHr };
    }
    return null;
  };

  /**
   * Běh/plavání: LT1 jako konec prvního významného nárůstu po lokálním minimu v první polovině profilu
   * (typicky po poklesu na začátku testu) — odpovídá „prvnímu kopci“, ne až La ≥ 2.0 mmol/L.
   */
  const pickLt1PaceFirstRiseAfterMin = (pts) => {
    if (!pts || pts.length < 3) return null;
    const sorted = [...pts].sort((a, b) => Number(b.power) - Number(a.power));
    const n = sorted.length;
    const firstHalfEnd = Math.max(2, Math.ceil(n * 0.55));
    let minIdx = 0;
    let minLa = Number(sorted[0].lactate);
    for (let i = 1; i < firstHalfEnd; i++) {
      const la = Number(sorted[i].lactate);
      if (Number.isFinite(la) && la < minLa) {
        minLa = la;
        minIdx = i;
      }
    }
    // Pace sports often rise in two smaller steps (e.g. +0.20 then +0.30).
    // We want LT1 at the onset of that rise, not only at the later larger jump.
    const DIRECT_RISE_MIN = 0.24;
    const COMBINED_RISE_MIN = 0.32;
    for (let j = minIdx + 1; j < n; j++) {
      const prev = sorted[j - 1];
      const curr = sorted[j];
      const la0 = Number(prev.lactate);
      const la1 = Number(curr.lactate);
      if (!Number.isFinite(la0) || !Number.isFinite(la1)) continue;
      const inc = la1 - la0;
      const la2 = j + 1 < n ? Number(sorted[j + 1].lactate) : NaN;
      const nextInc = Number.isFinite(la2) ? (la2 - la1) : -Infinity;
      const sustainedRise =
        inc >= DIRECT_RISE_MIN &&
        (
          nextInc >= 0.08 ||
          (inc + Math.max(0, nextInc)) >= COMBINED_RISE_MIN
        );
      if (!sustainedRise) continue;
      if (isLtp1FalseStartRise(sorted, j) || isSpikeThenDropOutlier(sorted, j)) continue;

      // If the rise is a single large jump from a dip (e.g. trough 1.50 → 2.10 in one step),
      // don't snap LT1 to the full la1 — interpolate near the onset of the rise instead.
      // This mirrors shiftLt1AfterImmediateDropBike for pace sports.
      const DIP_RISE_THRESHOLD = 0.45; // mmol/L: if a single step rises more than this from a below-zone trough
      const DIP_TROUGH_MAX_LA = 1.85;  // trough must be below expected LT1 zone to qualify as a dip
      let laOut, pOut, hrOut;
      if (inc > DIP_RISE_THRESHOLD && la0 < DIP_TROUGH_MAX_LA) {
        // Interpolate at trough + 0.25 on the ascending segment (same logic as shiftLt1AfterImmediateDropBike)
        const targetLa = Math.max(la0 + 0.25, MIN_LTP1_LACTATE);
        const tInterp = Math.min(1, (targetLa - la0) / (la1 - la0));
        pOut = Number(prev.power) + tInterp * (Number(curr.power) - Number(prev.power));
        laOut = Math.min(targetLa, MAX_LTP1_LACTATE_PACE);
        // Interpolate HR proportionally
        const h0 = prev.heartRate != null && Number.isFinite(Number(prev.heartRate)) ? Number(prev.heartRate) : null;
        const h1 = curr.heartRate != null && Number.isFinite(Number(curr.heartRate)) ? Number(curr.heartRate) : null;
        hrOut = (h0 != null && h1 != null) ? h0 + tInterp * (h1 - h0) : (h1 ?? h0 ?? null);
      } else {
        laOut = Math.min(Math.max(la1, MIN_LTP1_LACTATE), MAX_LTP1_LACTATE_PACE);
        pOut = Number(curr.power);
        hrOut = curr.heartRate != null && Number.isFinite(Number(curr.heartRate)) ? Number(curr.heartRate) : null;
      }
      return { power: pOut, lactate: laOut, heartRate: hrOut };
    }
    return null;
  };

  /**
   * Běh/plavání: LT2 u inkrementálního testu — střed segmentu s největším nárůstem La mezi sousedními kroky
   * (nejčastěji „zlom“ křivky), ne výkon u maxima testu. Poslední interval se ignoruje, pokud existuje výraznější nárůst dříve.
   */
  const pickLt2PaceSteepestSegmentMid = (pts, ltp2LaCap) => {
    if (!pts || pts.length < 3) return null;
    const sorted = [...pts].sort((a, b) => Number(b.power) - Number(a.power));
    const n = sorted.length;
    const cap = Number.isFinite(Number(ltp2LaCap)) ? Number(ltp2LaCap) : MAX_LTP2_LACTATE;

    const segDelta = (i) => {
      const la0 = Number(sorted[i - 1].lactate);
      const la1 = Number(sorted[i].lactate);
      return Number.isFinite(la0) && Number.isFinite(la1) ? la1 - la0 : -Infinity;
    };

    let bestI = 1;
    let maxInc = -Infinity;
    for (let i = 1; i < n - 1; i++) {
      const inc = segDelta(i);
      if (inc > maxInc) {
        maxInc = inc;
        bestI = i;
      }
    }
    let useI = bestI;
    if (n >= 4) {
      const lastInc = segDelta(n - 1);
      if (lastInc > maxInc && lastInc >= 0.55) {
        useI = n - 1;
        maxInc = lastInc;
      } else if (maxInc < 0.45) {
        for (let i = 1; i < n; i++) {
          const inc = segDelta(i);
          if (inc > maxInc) {
            maxInc = inc;
            useI = i;
          }
        }
      }
    }

    if (maxInc < 0.38) return null;

    const a = sorted[useI - 1];
    const b = sorted[useI];
    const la0 = Number(a.lactate);
    const la1 = Number(b.lactate);
    const p0 = Number(a.power);
    const p1 = Number(b.power);
    const t = 0.5;
    const laMid = la0 + t * (la1 - la0);
    const pMid = p0 + t * (p1 - p0);
    const laOut = Math.min(
      Math.max(laMid, MIN_LTP2_LACTATE_REASONABLE * 0.9),
      Number.isFinite(cap) ? cap - 0.02 : MAX_LTP2_LACTATE
    );
    let hrMid = null;
    const h0 = a.heartRate != null ? Number(a.heartRate) : null;
    const h1 = b.heartRate != null ? Number(b.heartRate) : null;
    if (h0 != null && h1 != null && Number.isFinite(h0) && Number.isFinite(h1) && p0 !== p1) {
      hrMid = h0 + t * (h1 - h0);
    } else {
      hrMid = h1 ?? h0;
    }
    return { power: pMid, lactate: laOut, heartRate: hrMid };
  };

  /** Interpolace tempa (power v sekundách) při cílovém laktátu; sortedDesc = pomalý → rychlý. */
  const interpolatePowerAtLactatePace = (sortedDesc, targetLa) => {
    if (!sortedDesc || sortedDesc.length < 2) return null;
    const tLa = Number(targetLa);
    if (!Number.isFinite(tLa)) return null;
    for (let i = 0; i < sortedDesc.length - 1; i++) {
      const la = Number(sortedDesc[i].lactate);
      const lb = Number(sortedDesc[i + 1].lactate);
      const pa = Number(sortedDesc[i].power);
      const pb = Number(sortedDesc[i + 1].power);
      if (!Number.isFinite(la) || !Number.isFinite(lb) || !Number.isFinite(pa) || !Number.isFinite(pb)) continue;
      if ((la <= tLa && lb >= tLa) || (la >= tLa && lb <= tLa)) {
        const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (tLa - la) / (lb - la);
        return pa + t * (pb - pa);
      }
    }
    return null;
  };

  /**
   * Když jsou LT1 a LT2 v tempu téměř na sobě, posuň LT1 na nižší laktát (typicky ~2.0 mmol/L),
   * aby aerobní práh neležel u anaerobního — vychází z naměřených segmentů, ne z „natvrdo“ 2.5.
   */
  const relaxPaceLt1IfSqueezedAgainstLt2 = (sortedDesc, ltp1Power, ltp1Lactate, ltp2Power) => {
    const p1 = Number(ltp1Power);
    const p2 = Number(ltp2Power);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
    const gap = p1 - p2;
    if (gap >= MIN_LT2_LT1_GAP_PACE_SEC) return null;

    const tryLas = [1.85, 1.9, 1.95, 2.0, 2.05, 2.1];
    for (const targetLa of tryLas) {
      if (targetLa < MIN_LTP1_LACTATE - 1e-9 || targetLa > MAX_LTP1_LACTATE_PACE + 1e-9) continue;
      const p = interpolatePowerAtLactatePace(sortedDesc, targetLa);
      if (p == null || !Number.isFinite(p)) continue;
      if (p > p2 + MIN_LT2_LT1_GAP_PACE_SEC) {
        return { power: p, lactate: targetLa };
      }
    }

    const logPt = calculateLogLogThreshold(sortedDesc);
    if (logPt && Number.isFinite(Number(logPt.power)) && Number.isFinite(Number(logPt.lactate))) {
      const p = Number(logPt.power);
      const la = Number(logPt.lactate);
      if (la >= MIN_LTP1_LACTATE && la <= MAX_LTP1_LACTATE_PACE && p > p2 + MIN_LT2_LT1_GAP_PACE_SEC) {
        return { power: p, lactate: la };
      }
    }
    return null;
  };

  /**
   * Pace sports: after detecting an initial LT1 candidate on an early rise,
   * check if lactate immediately plateaus (flat for 1+ steps, Δ ≤ PLATEAU_MAX_DELTA)
   * and then has a bigger breakout (Δ ≥ BREAKOUT_MIN_DELTA).
   * If yes, defer LT1 to the END of the plateau (last flat step before breakout).
   * sortedDesc: sorted descending by pace (slowest first = largest seconds value first).
   */
  const deferPaceLt1PastPlateau = (sortedDesc, ltp1Power, ltp1Lactate) => {
    if (!sortedDesc || sortedDesc.length < 3) return null;
    const p1 = Number(ltp1Power);
    const la1 = Number(ltp1Lactate);
    if (!Number.isFinite(p1) || !Number.isFinite(la1)) return null;

    // Find index of the current LT1 candidate in the sorted array (within 5 s tolerance)
    let startIdx = -1;
    for (let i = 0; i < sortedDesc.length; i++) {
      if (Math.abs(Number(sortedDesc[i].power) - p1) <= 5) {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0 || startIdx >= sortedDesc.length - 1) return null;

    const PLATEAU_MAX_DELTA = 0.25; // mmol/L: step counts as "flat" if rise ≤ this
    const BREAKOUT_MIN_DELTA = 0.45; // mmol/L: next step must jump at least this
    let plateauEndIdx = -1;
    let lastPlateauLa = la1;

    for (let i = startIdx + 1; i < sortedDesc.length; i++) {
      const currLa = Number(sortedDesc[i].lactate);
      if (!Number.isFinite(currLa)) break;
      const delta = currLa - lastPlateauLa;
      if (delta >= -0.05 && delta <= PLATEAU_MAX_DELTA) {
        // Still within the flat plateau
        lastPlateauLa = currLa;
        // Check if the NEXT step is a real breakout
        if (i + 1 < sortedDesc.length) {
          const nextLa = Number(sortedDesc[i + 1].lactate);
          if (Number.isFinite(nextLa) && (nextLa - currLa) >= BREAKOUT_MIN_DELTA) {
            plateauEndIdx = i;
            break;
          }
        }
      } else {
        // Jumped immediately — no flat plateau after LT1 candidate
        break;
      }
    }

    if (plateauEndIdx < 0) return null;

    const endPoint = sortedDesc[plateauEndIdx];
    const laOut = Math.min(Math.max(Number(endPoint.lactate), MIN_LTP1_LACTATE), MAX_LTP1_LACTATE_PACE);
    return {
      power: Number(endPoint.power),
      lactate: laOut,
      heartRate: endPoint.heartRate != null ? Number(endPoint.heartRate) : null
    };
  };

  // LT1 helper: first sustained rise above baseline + delta, confirmed by next point.
  const findFirstSustainedRise = (points, baseline, sport = 'bike') => {
    if (!points || points.length < 3) return null;
    const isPaceSport = sport === 'run' || sport === 'swim';
    const ordered = [...points].sort((a, b) => isPaceSport ? Number(b.power) - Number(a.power) : Number(a.power) - Number(b.power));
    const smoothed = smoothLactateMedian3(ordered);
    const target = Math.max(Number(baseline || 1.0) + 0.35, MIN_LTP1_LACTATE);
    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = Number(smoothed[i - 1].lactate);
      const cur = Number(smoothed[i].lactate);
      const next = Number(smoothed[i + 1].lactate);
      if (Number.isFinite(prev) && Number.isFinite(cur) && Number.isFinite(next)) {
        const sustainedRise = cur >= target && next >= (cur - 0.05) && (cur - prev) >= 0.15;
        if (sustainedRise) {
          if (isLtp1FalseStartRise(smoothed, i)) continue;
          return smoothed[i];
        }
      }
    }
    return null;
  };

  /**
   * Bike-only post-processing:
   * If LT1 lands on the first point of a flat lactate plateau (e.g. +0.1, +0.1)
   * and only then comes a sharp breakout, move LT1 to the end of that plateau.
   */
  const deferEarlyLt1OnPlateauBike = (sortedResults, ltp1Power, ltp1Lactate) => {
    if (!Array.isArray(sortedResults) || sortedResults.length < 4) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    if (!Number.isFinite(Number(ltp1Power))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    const p = sortedResults.map((r) => Number(r.power));
    const la = sortedResults.map((r) => Number(r.lactate));
    const isValid = (v) => Number.isFinite(v);
    if (p.some((v) => !isValid(v)) || la.some((v) => !isValid(v))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    // If LT1 is already interpolated between measured points, do NOT snap/shift to plateau end.
    const nearestIdx = p.reduce((bestIdx, value, i) => {
      const bestDiff = Math.abs(p[bestIdx] - Number(ltp1Power));
      const curDiff = Math.abs(value - Number(ltp1Power));
      return curDiff < bestDiff ? i : bestIdx;
    }, 0);
    const nearestDiff = Math.abs(p[nearestIdx] - Number(ltp1Power));
    if (nearestDiff > 0.5) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    // First measured step at/after LT1 power.
    let idx = p.findIndex((v) => v >= Number(ltp1Power) - 1e-6);
    if (idx < 0) idx = nearestIdx;
    if (idx >= la.length - 2) return { power: ltp1Power, lactate: ltp1Lactate };

    // Detect small plateau increments after current LT1 candidate.
    const d1 = la[idx + 1] - la[idx];
    const d2 = la[idx + 2] - la[idx + 1];
    const looksLikePlateau =
      d1 >= -0.05 && d1 <= 0.2 &&
      d2 >= -0.05 && d2 <= 0.2 &&
      (la[idx + 2] - la[idx]) <= 0.35;

    if (!looksLikePlateau) return { power: ltp1Power, lactate: ltp1Lactate };

    // Look for first sharp breakout after the plateau.
    let breakoutIdx = -1;
    for (let k = idx + 3; k < la.length; k++) {
      const jump = la[k] - la[k - 1];
      if (jump >= 0.6) {
        breakoutIdx = k;
        break;
      }
    }
    if (breakoutIdx === -1) return { power: ltp1Power, lactate: ltp1Lactate };

    const plateauEndIdx = breakoutIdx - 1;
    if (plateauEndIdx <= idx || plateauEndIdx >= sortedResults.length) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    return {
      power: Number(sortedResults[plateauEndIdx].power),
      lactate: Number(sortedResults[plateauEndIdx].lactate),
    };
  };

  /**
   * Bike-only: pokud je vypočtené LT1 La níž než naměřená „držící“ hladina (např. poly/interpolace dá 1.6 mmol/L,
   * ale na dalších krocích je 1.8 → 1.7 mmol/L), posuň LT1 na konec této elevace — aerobní práh má odpovídat
   * stabilně vyššímu laktátu, ne prvnímu překročení 1.5 mmol/L na segmentu.
   */
  const snapLt1ToSustainedMeasuredElevationBike = (sortedResults, ltp1Power, ltp1Lactate) => {
    if (!Array.isArray(sortedResults) || sortedResults.length < 3) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const p = sortedResults.map((r) => Number(r.power));
    const la = sortedResults.map((r) => Number(r.lactate));
    if (p.some((v) => !Number.isFinite(v)) || la.some((v) => !Number.isFinite(v))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const laRef = Number(ltp1Lactate);
    if (!Number.isFinite(laRef)) return { power: ltp1Power, lactate: ltp1Lactate };

    const ELEVATION_EPS = 0.11; // measurably above computed LT1 lactate
    const PLATEAU_WIGGLE = 0.16; // max drop from running peak while lactate „still holds“
    const BREAKOUT_JUMP = 0.48; // next clear rise → end of LT1 plateau

    let idx = p.findIndex((v) => v >= Number(ltp1Power) - 1e-6);
    if (idx < 0) {
      idx = p.reduce((best, v, i) => (Math.abs(v - Number(ltp1Power)) < Math.abs(p[best] - Number(ltp1Power)) ? i : best), 0);
    }
    if (idx >= la.length - 1) return { power: ltp1Power, lactate: ltp1Lactate };

    let start = -1;
    for (let i = idx; i < la.length - 1; i++) {
      const a = la[i];
      const b = la[i + 1];
      const pairHigh = a >= laRef + ELEVATION_EPS && b >= laRef + ELEVATION_EPS * 0.7;
      const pairPlateau =
        a >= laRef + ELEVATION_EPS * 0.55 &&
        b >= laRef + ELEVATION_EPS * 0.55 &&
        Math.abs(a - b) <= PLATEAU_WIGGLE;
      if (pairHigh || pairPlateau) {
        start = i;
        break;
      }
    }
    if (start < 0) return { power: ltp1Power, lactate: ltp1Lactate };

    let peak = Math.max(la[start], la[start + 1]);
    let end = start + 1;
    for (let j = start + 2; j < la.length; j++) {
      const step = la[j] - la[j - 1];
      if (step >= BREAKOUT_JUMP) break;
      if (la[j] < peak - PLATEAU_WIGGLE) break;
      peak = Math.max(peak, la[j]);
      end = j;
    }

    if (p[end] <= Number(ltp1Power) + 2) return { power: ltp1Power, lactate: ltp1Lactate };

    let laOut = la[end];
    laOut = Math.min(Math.max(laOut, MIN_LTP1_LACTATE), MAX_LTP1_LACTATE);
    return {
      power: p[end],
      lactate: laOut,
    };
  };

  /**
   * Bike-only guard:
   * LT1 should not sit on a point that is followed by a meaningful lactate drop.
   * If it does, move LT1 forward to the first point after the drop where trend is non-decreasing.
   */
  const shiftLt1AfterImmediateDropBike = (sortedResults, ltp1Power, ltp1Lactate) => {
    if (!Array.isArray(sortedResults) || sortedResults.length < 3) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    if (!Number.isFinite(Number(ltp1Power))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const p = sortedResults.map((r) => Number(r.power));
    const la = sortedResults.map((r) => Number(r.lactate));
    if (p.some((v) => !Number.isFinite(v)) || la.some((v) => !Number.isFinite(v))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    let idx = p.findIndex((v) => v >= Number(ltp1Power) - 1e-6);
    if (idx < 0) idx = 0;
    if (idx >= la.length - 1) return { power: ltp1Power, lactate: ltp1Lactate };

    const dropThreshold = 0.12;

    // Find a local drop starting at/after idx, then move LT1 to the trough→rebound segment.
    // We intentionally anchor to the FIRST rebound after the trough (not later big jumps),
    // so cases like 2.6 → 2.4 → 2.9 → 4.6 don't push LT1 into 3.7+ mmol/L.
    let startIdx = idx;
    while (startIdx < la.length - 1 && !(la[startIdx + 1] < la[startIdx] - dropThreshold)) {
      startIdx += 1;
    }
    if (startIdx >= la.length - 1) {
      return { power: Number(sortedResults[idx].power), lactate: Number(sortedResults[idx].lactate) };
    }

    // Walk forward through the drop to find the trough (minimum lactate point).
    let troughIdx = startIdx + 1;
    while (troughIdx < la.length - 1 && (la[troughIdx + 1] < la[troughIdx] - 0.04)) {
      troughIdx += 1;
    }
    if (troughIdx >= la.length - 1) {
      return { power: Number(sortedResults[troughIdx].power), lactate: Number(sortedResults[troughIdx].lactate) };
    }

    const reboundIdx = troughIdx + 1;
    const troughP = Number(sortedResults[troughIdx].power);
    const troughLa = Number(sortedResults[troughIdx].lactate);
    const reboundP = Number(sortedResults[reboundIdx].power);
    const reboundLa = Number(sortedResults[reboundIdx].lactate);

    if (!Number.isFinite(troughP) || !Number.isFinite(troughLa) || !Number.isFinite(reboundP) || !Number.isFinite(reboundLa) || reboundP === troughP) {
      return { power: Number(sortedResults[troughIdx].power), lactate: Number(sortedResults[troughIdx].lactate) };
    }
    if (reboundLa <= troughLa + 0.08) {
      // No meaningful rebound; just keep trough as conservative LT1 anchor.
      return { power: troughP, lactate: troughLa };
    }

    // Interpolate LT1 slightly above trough on the immediate rebound segment.
    // Target is "after the 2.4" rather than mid-way to 4.6.
    const targetLaRaw = troughLa + 0.25;
    const targetLa = Math.min(targetLaRaw, reboundLa - 0.05);
    if (targetLa <= troughLa) {
      return { power: troughP, lactate: troughLa };
    }
    const t = (targetLa - troughLa) / (reboundLa - troughLa);
    const outP = troughP + t * (reboundP - troughP);
    return { power: outP, lactate: targetLa };
  };

  /**
   * Bike-only guard:
   * If curve has a clear "big break" (sharp lactate jump), LT1 should sit near the START
   * of that break, not high inside/after it.
   */
  const anchorLt1ToBreakStartBike = (sortedResults, ltp1Power, ltp1Lactate) => {
    if (!Array.isArray(sortedResults) || sortedResults.length < 3) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const p = sortedResults.map((r) => Number(r.power));
    const la = sortedResults.map((r) => Number(r.lactate));
    if (p.some((v) => !Number.isFinite(v)) || la.some((v) => !Number.isFinite(v))) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    // First significant jump defining the anaerobic break region.
    let jumpIdx = -1;
    for (let i = 1; i < la.length; i++) {
      const jump = la[i] - la[i - 1];
      if (jump >= 0.9 && la[i - 1] <= 2.6) {
        jumpIdx = i;
        break;
      }
    }
    if (jumpIdx <= 0) return { power: ltp1Power, lactate: ltp1Lactate };

    const p0 = p[jumpIdx - 1];
    const p1 = p[jumpIdx];
    const la0 = la[jumpIdx - 1];
    const la1 = la[jumpIdx];
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || !Number.isFinite(la0) || !Number.isFinite(la1) || p1 === p0 || la1 <= la0) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }

    // Apply only if LT1 currently sits too high (inside/after the break).
    const currentLa = Number(ltp1Lactate);
    const currentP = Number(ltp1Power);
    if (!Number.isFinite(currentLa) || !Number.isFinite(currentP)) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const tooHigh = currentLa >= (la0 + 0.75) || currentP >= (p0 + (p1 - p0) * 0.55);
    if (!tooHigh) return { power: ltp1Power, lactate: ltp1Lactate };

    const jump = la1 - la0;
    const riseOffset = Math.min(0.7, Math.max(0.2, jump * 0.2));
    const targetLa = Math.min(la1 - 0.05, la0 + riseOffset);
    if (!Number.isFinite(targetLa) || targetLa <= la0) {
      return { power: ltp1Power, lactate: ltp1Lactate };
    }
    const t = (targetLa - la0) / (la1 - la0);
    const outP = p0 + t * (p1 - p0);
    return { power: outP, lactate: targetLa };
  };

  const weightedMedian = (entries) => {
    const valid = (entries || [])
      .filter(e => Number.isFinite(Number(e?.x)) && Number.isFinite(Number(e?.w)) && Number(e.w) > 0)
      .map(e => ({ x: Number(e.x), w: Number(e.w) }))
      .sort((a, b) => a.x - b.x);
    if (!valid.length) return null;
    const total = valid.reduce((s, v) => s + v.w, 0);
    let acc = 0;
    for (const v of valid) {
      acc += v.w;
      if (acc >= total / 2) return v.x;
    }
    return valid[valid.length - 1].x;
  };

  const blendThreshold = ({ primary, candidates = [], isPaceSport, preferHigher }) => {
    if (!Number.isFinite(Number(primary))) return null;
    const p = Number(primary);
    const band = Math.max(Math.abs(p) * 0.18, isPaceSport ? 12 : 20);
    const filtered = candidates
      .filter(c => Number.isFinite(Number(c?.x)) && Number.isFinite(Number(c?.w)) && Number(c.w) > 0)
      .map(c => ({ x: Number(c.x), w: Number(c.w) }))
      .filter(c => Math.abs(c.x - p) <= band);
    const pool = [{ x: p, w: 2.5 }, ...filtered];
    const med = weightedMedian(pool);
    if (!Number.isFinite(Number(med))) return p;
    const m = Number(med);
    if (preferHigher) return Math.max(p, m);
    return Math.min(p, m);
  };

  const estimateThresholdConfidence = ({ ltp1, ltp2, candidates = [], isPaceSport, pointsCount = 0, hasHR = false }) => {
    if (!Number.isFinite(Number(ltp1)) || !Number.isFinite(Number(ltp2))) return 0;
    const base = Math.min(45, pointsCount * 7);
    const gap = isPaceSport ? (Number(ltp1) - Number(ltp2)) : (Number(ltp2) - Number(ltp1));
    const gapScore = Math.max(0, Math.min(25, gap / (isPaceSport ? 6 : 4)));
    const diffs = candidates
      .filter(c => Number.isFinite(Number(c)))
      .map(c => Math.abs(Number(c) - Number(ltp2)));
    const spread = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length) : 999;
    const spreadScore = Math.max(0, 25 - Math.min(25, spread / (isPaceSport ? 2 : 5)));
    const hrScore = hasHR ? 5 : 0;
    return Math.round(Math.max(0, Math.min(100, base + gapScore + spreadScore + hrScore)));
  };

  /** Z polynomu spočítá LTP1 (kde křivka začne růst – vždy až po poklesu) a LTP2 (maximum první derivace). */
  const findLTPFromPolynomial = (polyFit, sortedResults, isPaceSport, ltp2Cap = MAX_LTP2_LACTATE) => {
    if (!polyFit || !sortedResults || sortedResults.length < 2) return null;
    const { polyFn, derivFn, fitMinX, fitMaxX, postDropStartX } = polyFit;
    const steps = 200;
    const dx = (fitMaxX - fitMinX) / (steps - 1);
    // LTP2 = bod nejprudšího nárůstu laktátu. Bike: x = power, lactate roste s x → max derivace.
    // Běh/plavání: x = pace (s), lactate klesá s x (rychlejší = menší x = vyšší lactate) → derivace je záporná, hledáme minimum (nejzápornější).
    let bestDeriv = isPaceSport ? Infinity : -Infinity;
    let ltp2X = fitMinX;
    for (let i = 0; i < steps; i++) {
      const x = fitMinX + i * dx;
      const d = derivFn(x);
      const isBetter = isPaceSport ? (d < bestDeriv) : (d > bestDeriv);
      if (isBetter) {
        bestDeriv = d;
        ltp2X = x;
      }
    }
    const thresholdDeriv = Math.max(Math.abs(bestDeriv) * 0.12, 0.008);
    // LTP1 = první x (od nízké intenzity) kde křivka začne růst – a vždy AŽ po poklesu (postDropStartX)
    const searchMin = postDropStartX != null && !isPaceSport ? Math.max(fitMinX, postDropStartX) : fitMinX;
    const searchMax = postDropStartX != null && isPaceSport ? Math.min(fitMaxX, postDropStartX) : fitMaxX;
    let ltp1X = null;
    const lowToHigh = isPaceSport ? -1 : 1;
    const start = isPaceSport ? searchMax : searchMin;
    const end = isPaceSport ? searchMin : searchMax;
    for (let i = 0; i < steps; i++) {
      const x = start + (end - start) * (i / (steps - 1));
      if (lowToHigh * derivFn(x) >= thresholdDeriv) {
        ltp1X = x;
        break;
      }
    }
    if (ltp1X == null) ltp1X = isPaceSport ? searchMax : searchMin;
    // Jistota: LTP1 nikdy před „až to znovu začne růst“
    if (postDropStartX != null) {
      if (!isPaceSport) ltp1X = Math.max(ltp1X, postDropStartX);
      else ltp1X = Math.min(ltp1X, postDropStartX);
    }
    let ltp1Lactate = Math.max(0, polyFn(ltp1X));
    const rawPolyLt1La = ltp1Lactate;
    let lt1PhysClamp = 'none';
    // LTP1 musí být vždy v rozmezí 1.5–2.5 mmol/L; pokud je křivka v tomto bodě mimo rozsah,
    // vezmeme x kde křivka = MIN_LTP1_LACTATE nebo MAX_LTP1_LACTATE.
    if (ltp1Lactate < MIN_LTP1_LACTATE) {
      lt1PhysClamp = 'min_1.5';
      const xAtMin = findXForLactate(polyFn, fitMinX, fitMaxX, MIN_LTP1_LACTATE, isPaceSport, true);
      if (xAtMin != null) {
        ltp1X = xAtMin;
        ltp1Lactate = MIN_LTP1_LACTATE;
      }
    } else if (ltp1Lactate > (isPaceSport ? MAX_LTP1_LACTATE_PACE : MAX_LTP1_LACTATE)) {
      const lt1PolyMax = isPaceSport ? MAX_LTP1_LACTATE_PACE : MAX_LTP1_LACTATE;
      lt1PhysClamp = isPaceSport ? 'max_2.5_pace_poly' : 'max_2.2';
      const xAtMax = findXForLactate(polyFn, fitMinX, fitMaxX, lt1PolyMax, isPaceSport, true);
      if (xAtMax != null) {
        ltp1X = xAtMax;
        ltp1Lactate = lt1PolyMax;
      }
    }
    let ltp2Lactate = Math.max(0, polyFn(ltp2X));
    const rawPolyLt2La = ltp2Lactate;
    let lt2CapMode = 'none';
    // LTP2 nad adaptivním capem: nejdřív bod na křivce přímo u cap (~La z testu), až pak blend 3.5/4.0 (3.75).
    if (ltp2Lactate > ltp2Cap) {
      const xAtCap = findXForLactate(polyFn, fitMinX, fitMaxX, ltp2Cap, isPaceSport, false);
      if (xAtCap != null) {
        lt2CapMode = 'at_adaptive_cap';
        ltp2X = xAtCap;
        ltp2Lactate = Math.max(0, polyFn(ltp2X));
      } else {
        const blendLa = Math.min(ltp2Cap, OBLA_LT2_BLEND_LACTATE_MMOL);
        const xAtBlend = findXForLactate(polyFn, fitMinX, fitMaxX, blendLa, isPaceSport, false);
        if (xAtBlend != null) {
          lt2CapMode = 'blend_on_curve';
          ltp2X = xAtBlend;
          ltp2Lactate = Math.max(0, polyFn(ltp2X));
        }
      }
    }
    const interpolateHR = (x) => {
      for (let i = 0; i < sortedResults.length - 1; i++) {
        const a = Number(sortedResults[i].power);
        const b = Number(sortedResults[i + 1].power);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (x >= lo && x <= hi && a !== b) {
          const hrA = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
          const hrB = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
          if (hrA != null && hrB != null) return hrA + (hrB - hrA) * (x - a) / (b - a);
          return hrA ?? hrB;
        }
      }
      const nearest = sortedResults.reduce((best, r) =>
        Math.abs(Number(r.power) - x) < Math.abs(Number(best.power) - x) ? r : best
      );
      return nearest.heartRate != null ? Number(nearest.heartRate) : null;
    };
    // Ensure LT1 lactate is always lower than LT2 lactate
    // If LT1 has higher lactate than LT2, swap them
    let finalLtp1X = ltp1X;
    let finalLtp2X = ltp2X;
    let finalLtp1Lactate = ltp1Lactate;
    let finalLtp2Lactate = ltp2Lactate;
    
    let swappedLt = false;
    if (ltp1Lactate > ltp2Lactate) {
      swappedLt = true;
      // Swap LT1 and LT2 if LT1 has higher lactate
      console.warn('[findLTPFromPolynomial] LT1 lactate higher than LT2, swapping values');
      finalLtp1X = ltp2X;
      finalLtp2X = ltp1X;
      finalLtp1Lactate = ltp2Lactate;
      finalLtp2Lactate = ltp1Lactate;
    }

    if (isThresholdDebugEnabled()) {
      console.groupCollapsed('[LaChart] findLTPFromPolynomial (polynomický fit)');
      const r4 = (x) => (x == null || !Number.isFinite(Number(x)) ? x : Number(Number(x).toFixed(4)));
      console.log(
        'LT1: derivace přesahuje práh → výchozí x, pak fyz. omezení La na [' +
          MIN_LTP1_LACTATE +
          ', ' +
          (isPaceSport ? MAX_LTP1_LACTATE_PACE : MAX_LTP1_LACTATE) +
          '] mmol/L (běh/plavání až 2.5 na polynomu; kolo 2.2). Naměřený LT1 u pace je pak z kroků, ne z této větve.'
      );
      console.log(
        'LT2: maximum |dLa/d(intenzita)|; pokud La u bodu > adaptivní cap, nejdřív bod na křivce u La ≈ cap (typicky ~4), pak teprve fallback blend ' +
          OBLA_LT2_BLEND_LACTATE_MMOL +
          ' mmol/L.'
      );
      console.log({
        isPaceSport,
        ltp2Cap: r4(ltp2Cap),
        OBLA_LT2_BLEND_LACTATE_MMOL,
        fitMinX: r4(fitMinX),
        fitMaxX: r4(fitMaxX),
        postDropStartX: postDropStartX == null ? postDropStartX : r4(postDropStartX),
        LT1: {
          rawPolyLa: rawPolyLt1La,
          lt1PhysClamp,
          afterClampLa: ltp1Lactate,
          finalPowerX: finalLtp1X,
          finalLa: finalLtp1Lactate,
        },
        LT2: {
          rawPolyLa: rawPolyLt2La,
          lt2CapMode,
          afterCapLa: ltp2Lactate,
          finalPowerX: finalLtp2X,
          finalLa: finalLtp2Lactate,
        },
        swappedLt1Lt2: swappedLt,
      });
      console.groupEnd();
    }

    return {
      ltp1Power: finalLtp1X,
      ltp2Power: finalLtp2X,
      ltp1Lactate: finalLtp1Lactate,
      ltp2Lactate: finalLtp2Lactate,
      ltp1HR: interpolateHR(finalLtp1X),
      ltp2HR: interpolateHR(finalLtp2X)
    };
  };

  // Pomocná funkce pro výpočet nárůstu laktátu mezi body
  const calculateLactateIncrease = (points) => {
    if (!points || points.length < 2) return [];
    
    const increases = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const powerDiff = Math.abs(curr.power - prev.power);
      const lactateDiff = curr.lactate - prev.lactate;
      
      if (powerDiff > 0) {
        increases.push({
          power: (prev.power + curr.power) / 2, // Střed mezi body
          lactate: (prev.lactate + curr.lactate) / 2,
          increaseRate: lactateDiff / powerDiff, // mmol/L per W (nebo per s pro pace)
          point: curr
        });
      }
    }
    return increases;
  };

  // Vylepšená funkce pro nalezení LTP bodů
  const findLactateThresholds = (results, baseLactate, sport = 'bike', protocolMeta = {}) => {
    if (!results || results.length < 3) {
      return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
    }

    const isPaceSport = sport === 'run' || sport === 'swim';
    // Sanitise baseLactate the same way as analyzeLactateTest: never let it
    // exceed the lowest measured lactate (would otherwise cascade into bogus
    // thresholds and, historically, freeze the page).
    const rawBase = baseLactate != null && Number.isFinite(Number(baseLactate)) && Number(baseLactate) > 0
      ? Number(baseLactate) : null;
    const allLac = results
      .map(r => Number(String(r.lactate ?? '').replace(',', '.')))
      .filter(v => Number.isFinite(v) && v > 0);
    const minLac = allLac.length ? Math.min(...allLac) : null;
    const effectiveBaseLactate = rawBase != null
      ? (minLac != null ? Math.min(rawBase, minLac) : rawBase)
      : 1.0;
    
    // Seřadit data podle power/pace
    const sortedResults = [...results].sort((a, b) => {
      if (isPaceSport) {
        return b.power - a.power; // Sestupně pro pace (pomalejší -> rychlejší)
      }
      return a.power - b.power; // Vzestupně pro power (nižší -> vyšší)
    });
    const adaptiveLtp2Cap = getAdaptiveLtp2Cap(sortedResults);

    if (isThresholdDebugEnabled()) {
      console.groupCollapsed('[LaChart] findLactateThresholds — vstup + pravidla');
      const r4 = (x) => (x == null || !Number.isFinite(Number(x)) ? x : Number(Number(x).toFixed(4)));
      console.log({
        sport,
        steps: sortedResults.length,
        baseLactate: effectiveBaseLactate,
        adaptiveLtp2Cap: r4(adaptiveLtp2Cap),
        MAX_LTP1_LACTATE,
        MAX_LTP1_LACTATE_PACE,
        MIN_LTP1_LACTATE,
        OBLA_LT2_LOW_MMOL,
        OBLA_LT2_HIGH_MMOL,
        OBLA_LT2_BLEND_LACTATE_MMOL,
        MIN_LT2_LT1_GAP_W,
      });
      console.log(
        'Význam: LT1 kolo max ' +
          MAX_LTP1_LACTATE +
          ' mmol/L; běh/plavání z naměřených kroků až ' +
          MAX_LTP1_LACTATE_PACE +
          ' mmol/L. LT2 nad capem: nejdřív bod na křivce u La ≈ cap, pak případně blend ' +
          OBLA_LT2_BLEND_LACTATE_MMOL +
          ' mmol/L; u kola často průměr výkonů při 3.5 a 4.0 na segmentu.'
      );
      console.groupEnd();
    }

    // Primárně pro bike s ≥5 body: segmentovaná regrese + ensemble
    // (isotonic, 2 zlomy, baseline LT1, classic + Modified D-max, OBLA, log-log,
    // Dickhuth IAT). Median consensus, stage-duration corrected, individualized
    // by resting/max lactate when available.
    if (sport === 'bike' && sortedResults.length >= 5) {
      const points = sortedResults.map((r) => ({ power: Number(r.power), lactate: Number(r.lactate) }));
      // protocolMeta is plumbed in from the public calculateThresholds wrapper
      // — it carries baseLactate, maxLactate (post-test peak), and the test's
      // stageDurationSec. Each one improves a different part of the ensemble
      // when present; missing fields fall back to the old behaviour.
      const baseLa = Number(protocolMeta?.baseLactate);
      const maxLa = Number(protocolMeta?.maxLactate);
      const stageSec = Number(protocolMeta?.stageDurationSec);
      const segResult = computeLactateThresholds(points, {
        smooth: false,
        bootstrap: false,
        baseLactate: Number.isFinite(baseLa) ? baseLa : null,
        maxLactate: Number.isFinite(maxLa) ? maxLa : null,
        stageDurationSec: Number.isFinite(stageSec) ? stageSec : null,
      });
      const segLT1 = segResult.LT1;
      const segLT2 = segResult.LT2;
      if (segLT1 != null && segLT2 != null && segLT2 > segLT1 && segLT1 > 0 && segLT2 > 0) {
        const interpolateLactateAtPower = (powerVal) => {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = Number(sortedResults[i].power);
            const b = Number(sortedResults[i + 1].power);
            if (powerVal >= Math.min(a, b) && powerVal <= Math.max(a, b) && a !== b) {
              const la = sortedResults[i].lactate;
              const lb = sortedResults[i + 1].lactate;
              return la + (lb - la) * (powerVal - a) / (b - a);
            }
          }
          const nearest = sortedResults.reduce((best, r) =>
            Math.abs(Number(r.power) - powerVal) < Math.abs(Number(best.power) - powerVal) ? r : best
          );
          return Number(nearest.lactate);
        };
        const interpolateHRAtPower = (powerVal) => {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = Number(sortedResults[i].power);
            const b = Number(sortedResults[i + 1].power);
            if (powerVal >= Math.min(a, b) && powerVal <= Math.max(a, b) && a !== b) {
              const ha = sortedResults[i].heartRate;
              const hb = sortedResults[i + 1].heartRate;
              if (ha != null && hb != null) return ha + (hb - ha) * (powerVal - a) / (b - a);
              return ha ?? hb;
            }
          }
          const nearest = sortedResults.reduce((best, r) =>
            Math.abs(Number(r.power) - powerVal) < Math.abs(Number(best.power) - powerVal) ? r : best
          );
          return nearest.heartRate != null ? Number(nearest.heartRate) : null;
        };
        const interpolatePowerAtLactate = (targetLa) => {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = sortedResults[i];
            const b = sortedResults[i + 1];
            const la = Number(a.lactate);
            const lb = Number(b.lactate);
            if ((la <= targetLa && lb >= targetLa) || (la >= targetLa && lb <= targetLa)) {
              const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (targetLa - la) / (lb - la);
              return Number(a.power) + t * (Number(b.power) - Number(a.power));
            }
          }
          return null;
        };
        const ltp1Lactate = interpolateLactateAtPower(segLT1);
        // Breakpoint segLT1 je na modelu; výkon u LT1 musí odpovídat krvi — inverzní interpolace
        // mezi naměřenými body při tomto La (typicky nižší W než segLT1, pokud křivka „utíká“ od vzorků).
        let ltp1Power = segLT1;
        const pMeasLt1 = interpolatePowerAtLactate(ltp1Lactate);
        if (pMeasLt1 != null && Number.isFinite(pMeasLt1)) {
          ltp1Power = pMeasLt1;
        }
        let ltp2Lactate = interpolateLactateAtPower(segLT2);
        let ltp2Power = segLT2;
        // LTP2 nemá přesáhnout adaptivní strop — místo přesného cap (~4.2) průměr výkonů při OBLA 4.0 a 3.5 mmol/L
        if (ltp2Lactate > adaptiveLtp2Cap) {
          const pAt4 = interpolatePowerAtLactate(OBLA_LT2_HIGH_MMOL);
          const pAt35 = interpolatePowerAtLactate(OBLA_LT2_LOW_MMOL);
          const blendP =
            pAt4 != null && pAt35 != null ? (pAt4 + pAt35) / 2 : (pAt4 ?? pAt35);
          if (blendP != null) {
            ltp2Power = blendP;
            ltp2Lactate = interpolateLactateAtPower(ltp2Power);
          }
          if (ltp2Lactate > adaptiveLtp2Cap || blendP == null) {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = sortedResults[i];
            const b = sortedResults[i + 1];
            const la = Number(a.lactate);
            const lb = Number(b.lactate);
              if ((la <= adaptiveLtp2Cap && lb >= adaptiveLtp2Cap) || (la >= adaptiveLtp2Cap && lb <= adaptiveLtp2Cap)) {
                const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (adaptiveLtp2Cap - la) / (lb - la);
              ltp2Power = Number(a.power) + t * (Number(b.power) - Number(a.power));
                ltp2Lactate = adaptiveLtp2Cap;
              break;
            }
            }
          }
        }
        // LT2 musí dávat smysl: laktát alespoň ~2.5 mmol/L a odstup od LT1 min 25 W
        const gap = ltp2Power - ltp1Power;
        if (ltp2Lactate < MIN_LTP2_LACTATE_REASONABLE || gap < MIN_LT2_LT1_GAP_W) {
          const pAt4 = interpolatePowerAtLactate(OBLA_LT2_HIGH_MMOL);
          const pAt35 = interpolatePowerAtLactate(OBLA_LT2_LOW_MMOL);
          const betterP =
            pAt4 != null && pAt35 != null ? (pAt4 + pAt35) / 2 : (pAt4 ?? pAt35);
          if (betterP != null && betterP - ltp1Power >= MIN_LT2_LT1_GAP_W) {
            ltp2Power = betterP;
            ltp2Lactate = interpolateLactateAtPower(ltp2Power);
          }
        }
        // LTP1 musí být vždy ≥ 1.5 mmol/L
        let ltp1La = ltp1Lactate;
        if (ltp1Lactate < MIN_LTP1_LACTATE) {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = sortedResults[i];
            const b = sortedResults[i + 1];
            const la = Number(a.lactate);
            const lb = Number(b.lactate);
            if ((la <= MIN_LTP1_LACTATE && lb >= MIN_LTP1_LACTATE) || (la >= MIN_LTP1_LACTATE && lb <= MIN_LTP1_LACTATE)) {
              const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (MIN_LTP1_LACTATE - la) / (lb - la);
              ltp1Power = Number(a.power) + t * (Number(b.power) - Number(a.power));
              ltp1La = MIN_LTP1_LACTATE;
              break;
            }
          }
        }
        // Falešný start v naměřených bodech: segmentace často dá LT1 u prvního kopce (často ~2.2 mmol/L) — přepsat z druhého nárůstu.
        if (firstSignificantLactateRiseIsFalseStart(sortedResults)) {
          const rawLtp1 = pickLtp1PointSkippingFalseStarts(sortedResults, effectiveBaseLactate);
          if (rawLtp1 != null) {
            ltp1Power = Number(rawLtp1.power);
            ltp1La = Number(rawLtp1.lactate);
            if (ltp1La < MIN_LTP1_LACTATE) {
              for (let i = 0; i < sortedResults.length - 1; i++) {
                const a = sortedResults[i];
                const b = sortedResults[i + 1];
                const la = Number(a.lactate);
                const lb = Number(b.lactate);
                if ((la <= MIN_LTP1_LACTATE && lb >= MIN_LTP1_LACTATE) || (la >= MIN_LTP1_LACTATE && lb <= MIN_LTP1_LACTATE)) {
                  const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (MIN_LTP1_LACTATE - la) / (lb - la);
                  ltp1Power = Number(a.power) + t * (Number(b.power) - Number(a.power));
                  ltp1La = MIN_LTP1_LACTATE;
                  break;
                }
              }
            }
            const gapAfter = ltp2Power - ltp1Power;
            if (gapAfter < MIN_LT2_LT1_GAP_W) {
              const pAt4 = interpolatePowerAtLactate(OBLA_LT2_HIGH_MMOL);
              const pAt35 = interpolatePowerAtLactate(OBLA_LT2_LOW_MMOL);
              const betterP =
                pAt4 != null && pAt35 != null ? (pAt4 + pAt35) / 2 : (pAt4 ?? pAt35);
              if (betterP != null && betterP - ltp1Power >= MIN_LT2_LT1_GAP_W) {
                ltp2Power = betterP;
                ltp2Lactate = interpolateLactateAtPower(ltp2Power);
              }
            }
          }
        }
        // LT2: výkon při vypočteném La zarovnat na naměřenou úsečku (ne ponechat jen breakpoint z segmentace).
        const pMeasLt2 = interpolatePowerAtLactate(ltp2Lactate);
        if (pMeasLt2 != null && Number.isFinite(pMeasLt2)) {
          ltp2Power = pMeasLt2;
        }

        // First: if there's a drop just before the first rise, allow LT1 to be interpolated on the immediate rebound.
        const shiftedLt1 = shiftLt1AfterImmediateDropBike(sortedResults, ltp1Power, ltp1La);
        if (Number.isFinite(Number(shiftedLt1.power)) && Number.isFinite(Number(shiftedLt1.lactate))) {
          ltp1Power = Number(shiftedLt1.power);
          ltp1La = Number(shiftedLt1.lactate);
        }
        // Second: if LT1 is still detected too early on a flat plateau (without the drop pattern), defer it to plateau end.
        const deferredLt1 = deferEarlyLt1OnPlateauBike(sortedResults, ltp1Power, ltp1La);
        if (Number.isFinite(Number(deferredLt1.power)) && Number.isFinite(Number(deferredLt1.lactate))) {
          ltp1Power = Number(deferredLt1.power);
          ltp1La = Number(deferredLt1.lactate);
        }
        const snappedElevationLt1 = snapLt1ToSustainedMeasuredElevationBike(sortedResults, ltp1Power, ltp1La);
        if (Number.isFinite(Number(snappedElevationLt1.power)) && Number.isFinite(Number(snappedElevationLt1.lactate))) {
          ltp1Power = Number(snappedElevationLt1.power);
          ltp1La = Number(snappedElevationLt1.lactate);
        }
        const anchoredLt1 = anchorLt1ToBreakStartBike(sortedResults, ltp1Power, ltp1La);
        if (Number.isFinite(Number(anchoredLt1.power)) && Number.isFinite(Number(anchoredLt1.lactate))) {
          ltp1Power = Number(anchoredLt1.power);
          ltp1La = Number(anchoredLt1.lactate);
        }

        // Keep LT2 from collapsing too close to LT1 in bike tests.
        const minLt2LaBike = 3.2;
        if (ltp2Power < ltp1Power + MIN_LT2_LT1_GAP_W || ltp2Lactate < minLt2LaBike) {
          const pAt40 = interpolatePowerAtLactate(OBLA_LT2_HIGH_MMOL);
          const pAt35 = interpolatePowerAtLactate(OBLA_LT2_LOW_MMOL);
          const pAt32 = interpolatePowerAtLactate(minLt2LaBike);
          const candidates = [pAt35, pAt40, pAt32]
            .filter((v) => Number.isFinite(Number(v)))
            .map((v) => Number(v))
            .filter((v) => v - ltp1Power >= MIN_LT2_LT1_GAP_W);
          if (candidates.length) {
            const betterP = Math.min(...candidates);
            ltp2Power = betterP;
            ltp2Lactate = interpolateLactateAtPower(ltp2Power);
          }
        }

        const ltp1Reasonable = ltp1La >= MIN_LTP1_LACTATE && ltp1La <= 5 && ltp1Power > 0;
        const ltp2Reasonable = ltp2Lactate >= 1.5 && ltp2Lactate <= adaptiveLtp2Cap && ltp2Power > 0;
        if (ltp1Reasonable && ltp2Reasonable) {
          if (isThresholdDebugEnabled()) {
            console.groupCollapsed('[LaChart] findLactateThresholds — výstup (kolo, segmentace ≥5 bodů)');
            console.log({
              path: 'segmented_regression',
              segLT1_W: segLT1,
              segLT2_W: segLT2,
              adaptiveLtp2Cap,
              falseStartDetected: firstSignificantLactateRiseIsFalseStart(sortedResults),
              final: { ltp1_W: ltp1Power, lt1_La_mmol: ltp1La, ltp2_W: ltp2Power, lt2_La_mmol: ltp2Lactate },
            });
            console.log(
              'LT1: výkon se zarovnává na naměřenou křivku při vypočteném La; u nárůstu přes 2.2 mmol/L se na segmentu interpoluje na max 2.2 mmol/L (viz pickLtp1PointSkippingFalseStarts).'
            );
            console.log(
              'LT2: při vysokém La nebo malém odstupu od LT1 se bere průměr výkonů při OBLA 3.5 a 4.0 mmol/L → odpovídá „středu“ ~3.75 mmol/L mezi hranami OBLA.'
            );
            console.groupEnd();
          }
          return {
            ltp1: ltp1Power,
            ltp2: ltp2Power,
            ltp1Point: { power: ltp1Power, lactate: ltp1La, heartRate: interpolateHRAtPower(ltp1Power) },
            ltp2Point: { power: ltp2Power, lactate: ltp2Lactate, heartRate: interpolateHRAtPower(ltp2Power) }
          };
        }
      }
    }

    // For run/swim: run the same ensemble used for bike, with the X axis
    // negated internally (handled by `isPace: true`). Results are positive
    // pace seconds. We seed the polynomial path with these LT candidates
    // when they pass sanity checks — much more accurate than the polynomial
    // alone, especially when the test didn't reach 4 mmol/L.
    let paceEnsembleLT1 = null;
    let paceEnsembleLT2 = null;
    if (isPaceSport && sortedResults.length >= 5) {
      const pacePoints = sortedResults
        .map((r) => ({ power: Number(r.power), lactate: Number(r.lactate) }))
        .filter((p) => Number.isFinite(p.power) && p.power > 0 && Number.isFinite(p.lactate) && p.lactate > 0);
      if (pacePoints.length >= 5) {
        const baseLa = Number(protocolMeta?.baseLactate);
        const maxLa = Number(protocolMeta?.maxLactate);
        const stageSec = Number(protocolMeta?.stageDurationSec);
        const ens = computeLactateThresholds(pacePoints, {
          isPace: true,
          smooth: false,
          bootstrap: false,
          baseLactate: Number.isFinite(baseLa) ? baseLa : null,
          maxLactate: Number.isFinite(maxLa) ? maxLa : null,
          stageDurationSec: Number.isFinite(stageSec) ? stageSec : null,
        });
        // For pace: LT1 (slower) > LT2 (faster) in seconds. Sanity-check the
        // gap (≥ 10 sec for run/km, ≥ 5 sec for swim/100m) and order.
        const minGapSec = sport === 'swim' ? 5 : 10;
        if (ens.LT1 != null && ens.LT2 != null && ens.LT1 - ens.LT2 >= minGapSec && ens.LT1 > 0 && ens.LT2 > 0) {
          paceEnsembleLT1 = ens.LT1;
          paceEnsembleLT2 = ens.LT2;
        }
      }
    }

    // Sekundárně: LTP1 a LTP2 z polynomického fitu (kde křivka začne růst / maximum sklonu)
    const polyFit = buildPolynomialFit(sortedResults, baseLactate, sport);
    if (polyFit) {
      const fromPoly = findLTPFromPolynomial(polyFit, sortedResults, isPaceSport, adaptiveLtp2Cap);
      if (fromPoly) {
        let { ltp1Power, ltp2Power, ltp1Lactate, ltp2Lactate, ltp1HR, ltp2HR } = fromPoly;
        // Běh/plavání: LT1 z naměřených kroků — nejdřív první významný nárůst po lokálním minimu, jinak první La ≥ ~1.75.
        if (isPaceSport) {
          const interpolateHRAtPowerPoly = (powerVal) => {
            for (let i = 0; i < sortedResults.length - 1; i++) {
              const a = Number(sortedResults[i].power);
              const b = Number(sortedResults[i + 1].power);
              if (powerVal >= Math.min(a, b) && powerVal <= Math.max(a, b) && a !== b) {
                const ha = sortedResults[i].heartRate;
                const hb = sortedResults[i + 1].heartRate;
                if (ha != null && hb != null) return ha + (hb - ha) * (powerVal - a) / (b - a);
                return ha ?? hb;
              }
            }
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - powerVal) < Math.abs(Number(best.power) - powerVal) ? r : best
            );
            return nearest.heartRate != null ? Number(nearest.heartRate) : null;
          };
          const rawMeas =
            pickLt1PaceFirstRiseAfterMin(sortedResults) ||
            pickLt1FromMeasuredStepsForPace(sortedResults, effectiveBaseLactate, 1.75);
          if (rawMeas != null) {
            // If the initial candidate sits on an early rise followed by a flat plateau
            // and then a real breakout, defer LT1 to the END of that plateau.
            const deferred = deferPaceLt1PastPlateau(sortedResults, rawMeas.power, rawMeas.lactate);
            const effectiveMeas = deferred || rawMeas;
            ltp1Power = Number(effectiveMeas.power);
            ltp1Lactate = Number(effectiveMeas.lactate);
            if (effectiveMeas.heartRate != null && Number.isFinite(Number(effectiveMeas.heartRate))) {
              ltp1HR = Number(effectiveMeas.heartRate);
            } else {
              const h1 = interpolateHRAtPowerPoly(ltp1Power);
              if (h1 != null) ltp1HR = h1;
            }
            if (ltp1Lactate < MIN_LTP1_LACTATE) ltp1Lactate = MIN_LTP1_LACTATE;
            if (ltp1Lactate > MAX_LTP1_LACTATE_PACE) ltp1Lactate = MAX_LTP1_LACTATE_PACE;
          }
          const segLt2 = pickLt2PaceSteepestSegmentMid(sortedResults, adaptiveLtp2Cap);
          if (segLt2 != null && Number.isFinite(Number(segLt2.power)) && Number.isFinite(Number(segLt2.lactate))) {
            ltp2Power = Number(segLt2.power);
            ltp2Lactate = Number(segLt2.lactate);
            if (segLt2.heartRate != null && Number.isFinite(Number(segLt2.heartRate))) {
              ltp2HR = Number(segLt2.heartRate);
            } else {
              const h2 = interpolateHRAtPowerPoly(ltp2Power);
              if (h2 != null) ltp2HR = h2;
            }
          }
          const relaxedLt1 = relaxPaceLt1IfSqueezedAgainstLt2(sortedResults, ltp1Power, ltp1Lactate, ltp2Power);
          if (relaxedLt1) {
            ltp1Power = relaxedLt1.power;
            ltp1Lactate = relaxedLt1.lactate;
            const hR = interpolateHRAtPowerPoly(ltp1Power);
            if (hR != null) ltp1HR = hR;
          }
        } else {
          const interpolatePowerAtLactateBike = (targetLa) => {
            for (let i = 0; i < sortedResults.length - 1; i++) {
              const a = sortedResults[i];
              const b = sortedResults[i + 1];
              const la = Number(a.lactate);
              const lb = Number(b.lactate);
              if ((la <= targetLa && lb >= targetLa) || (la >= targetLa && lb <= targetLa)) {
                const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (targetLa - la) / (lb - la);
                return Number(a.power) + t * (Number(b.power) - Number(a.power));
              }
            }
            return null;
          };
          const interpolateHRAtPowerPolyBike = (powerVal) => {
            for (let i = 0; i < sortedResults.length - 1; i++) {
              const a = Number(sortedResults[i].power);
              const b = Number(sortedResults[i + 1].power);
              if (powerVal >= Math.min(a, b) && powerVal <= Math.max(a, b) && a !== b) {
                const ha = sortedResults[i].heartRate;
                const hb = sortedResults[i + 1].heartRate;
                if (ha != null && hb != null) return ha + (hb - ha) * (powerVal - a) / (b - a);
                return ha ?? hb;
              }
            }
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - powerVal) < Math.abs(Number(best.power) - powerVal) ? r : best
            );
            return nearest.heartRate != null ? Number(nearest.heartRate) : null;
          };
          const pMeasPoly = interpolatePowerAtLactateBike(ltp1Lactate);
          if (pMeasPoly != null && Number.isFinite(pMeasPoly)) {
            ltp1Power = pMeasPoly;
            const hrM = interpolateHRAtPowerPolyBike(ltp1Power);
            if (hrM != null) ltp1HR = hrM;
          }
          if (firstSignificantLactateRiseIsFalseStart(sortedResults)) {
            // Kolo: polynom ztrácí poklesy; u falešného startu LT1 z druhého nárůstu.
            const rawLtp1 = pickLtp1PointSkippingFalseStarts(sortedResults, effectiveBaseLactate);
            if (rawLtp1 != null) {
              ltp1Power = Number(rawLtp1.power);
              ltp1Lactate = Number(rawLtp1.lactate);
              if (rawLtp1.heartRate != null && Number.isFinite(Number(rawLtp1.heartRate))) {
                ltp1HR = Number(rawLtp1.heartRate);
              } else {
                ltp1HR = interpolateHRAtPowerPolyBike(ltp1Power);
              }
              if (ltp1Lactate < MIN_LTP1_LACTATE) ltp1Lactate = MIN_LTP1_LACTATE;
            }
          }
          const pMeasLt2Poly = interpolatePowerAtLactateBike(ltp2Lactate);
          if (pMeasLt2Poly != null && Number.isFinite(pMeasLt2Poly)) {
            ltp2Power = pMeasLt2Poly;
            const hr2m = interpolateHRAtPowerPolyBike(ltp2Power);
            if (hr2m != null) ltp2HR = hr2m;
          }

          // First: drop→rebound interpolation.
          const shiftedLt1 = shiftLt1AfterImmediateDropBike(sortedResults, ltp1Power, ltp1Lactate);
          if (Number.isFinite(Number(shiftedLt1.power)) && Number.isFinite(Number(shiftedLt1.lactate))) {
            ltp1Power = Number(shiftedLt1.power);
            ltp1Lactate = Number(shiftedLt1.lactate);
            const hrShifted = interpolateHRAtPowerPolyBike(ltp1Power);
            if (hrShifted != null) ltp1HR = hrShifted;
          }
          // Second: plateau deferral.
          const deferredLt1 = deferEarlyLt1OnPlateauBike(sortedResults, ltp1Power, ltp1Lactate);
          if (Number.isFinite(Number(deferredLt1.power)) && Number.isFinite(Number(deferredLt1.lactate))) {
            ltp1Power = Number(deferredLt1.power);
            ltp1Lactate = Number(deferredLt1.lactate);
            const hrDef = interpolateHRAtPowerPolyBike(ltp1Power);
            if (hrDef != null) ltp1HR = hrDef;
          }
          const snappedElevationLt1 = snapLt1ToSustainedMeasuredElevationBike(sortedResults, ltp1Power, ltp1Lactate);
          if (Number.isFinite(Number(snappedElevationLt1.power)) && Number.isFinite(Number(snappedElevationLt1.lactate))) {
            ltp1Power = Number(snappedElevationLt1.power);
            ltp1Lactate = Number(snappedElevationLt1.lactate);
            const hrSnap = interpolateHRAtPowerPolyBike(ltp1Power);
            if (hrSnap != null) ltp1HR = hrSnap;
          }
          const anchoredLt1 = anchorLt1ToBreakStartBike(sortedResults, ltp1Power, ltp1Lactate);
          if (Number.isFinite(Number(anchoredLt1.power)) && Number.isFinite(Number(anchoredLt1.lactate))) {
            ltp1Power = Number(anchoredLt1.power);
            ltp1Lactate = Number(anchoredLt1.lactate);
            const hrAnch = interpolateHRAtPowerPolyBike(ltp1Power);
            if (hrAnch != null) ltp1HR = hrAnch;
          }

          // Keep LT2 from collapsing too close to LT1 in bike tests (poly path too).
          const minLt2LaBike = 3.2;
          if (ltp2Power < ltp1Power + MIN_LT2_LT1_GAP_W || ltp2Lactate < minLt2LaBike) {
            const pAt40 = interpolatePowerAtLactateBike(OBLA_LT2_HIGH_MMOL);
            const pAt35 = interpolatePowerAtLactateBike(OBLA_LT2_LOW_MMOL);
            const pAt32 = interpolatePowerAtLactateBike(minLt2LaBike);
            const candidates = [pAt35, pAt40, pAt32]
              .filter((v) => Number.isFinite(Number(v)))
              .map((v) => Number(v))
              .filter((v) => v - ltp1Power >= MIN_LT2_LT1_GAP_W);
          if (candidates.length) {
              ltp2Power = Math.min(...candidates);
              // For bike, keep LT2 lactate tied to measured/interpolated segments, not polynomial value.
              const laAdj = interpolatePowerAtLactateBike(minLt2LaBike) != null
                ? (() => {
                    for (let i = 0; i < sortedResults.length - 1; i++) {
                      const a = sortedResults[i];
                      const b = sortedResults[i + 1];
                      const pa = Number(a.power);
                      const pb = Number(b.power);
                      if (ltp2Power >= Math.min(pa, pb) && ltp2Power <= Math.max(pa, pb) && pa !== pb) {
                        const t = (ltp2Power - pa) / (pb - pa);
                        return Number(a.lactate) + t * (Number(b.lactate) - Number(a.lactate));
                      }
                    }
                    return Number(ltp2Lactate);
                  })()
                : Number(ltp2Lactate);
              if (Number.isFinite(laAdj)) ltp2Lactate = laAdj;
              const hrAdj = interpolateHRAtPowerPolyBike(ltp2Power);
              if (hrAdj != null) ltp2HR = hrAdj;
            }
          }
        }
        const validOrder = isPaceSport ? ltp2Power < ltp1Power : ltp2Power > ltp1Power;
        const ltp1Reasonable = ltp1Lactate >= MIN_LTP1_LACTATE && ltp1Lactate <= 5 && ltp1Power > 0;
        const ltp2Reasonable = ltp2Lactate >= 1.0 && ltp2Lactate <= adaptiveLtp2Cap && ltp2Power > 0;
        if (validOrder && ltp1Reasonable && ltp2Reasonable) {
          // Pace ensemble blend: when run/swim has a valid ensemble result,
          // average it with the polynomial-derived value. The polynomial path
          // is good at capturing curve shape; the ensemble brings in D-max,
          // Modified D-max, log-log and OBLA. Their median is more robust
          // than either alone. Only blend when both numbers are nearby (within
          // 25 % of LT1's value, in seconds) — large disagreement means one
          // of them is wrong; in that case keep the polynomial result.
          if (isPaceSport && paceEnsembleLT1 != null && paceEnsembleLT2 != null) {
            const tol1 = Math.max(15, Math.abs(ltp1Power) * 0.12);
            const tol2 = Math.max(10, Math.abs(ltp2Power) * 0.12);
            if (Math.abs(paceEnsembleLT1 - ltp1Power) <= tol1) {
              ltp1Power = (ltp1Power + paceEnsembleLT1) / 2;
            }
            if (Math.abs(paceEnsembleLT2 - ltp2Power) <= tol2) {
              ltp2Power = (ltp2Power + paceEnsembleLT2) / 2;
            }
            // Recompute lactate at the blended powers so downstream zones use
            // the right La value.
            const interpAtPace = (pVal) => {
              for (let i = 0; i < sortedResults.length - 1; i++) {
                const a = Number(sortedResults[i].power);
                const b = Number(sortedResults[i + 1].power);
                if (pVal >= Math.min(a, b) && pVal <= Math.max(a, b) && a !== b) {
                  const la = Number(sortedResults[i].lactate);
                  const lb = Number(sortedResults[i + 1].lactate);
                  return la + (lb - la) * (pVal - a) / (b - a);
                }
              }
              return null;
            };
            const newLt1La = interpAtPace(ltp1Power);
            const newLt2La = interpAtPace(ltp2Power);
            if (newLt1La != null && Number.isFinite(newLt1La)) ltp1Lactate = newLt1La;
            if (newLt2La != null && Number.isFinite(newLt2La)) ltp2Lactate = newLt2La;
          }

          if (isThresholdDebugEnabled()) {
            console.groupCollapsed('[LaChart] findLactateThresholds — výstup (polynomický fit + ensemble blend)');
            console.log({
              path: 'polynomial_derivative',
              isPaceSport,
              adaptiveLtp2Cap,
              paceEnsembleLT1,
              paceEnsembleLT2,
              final: { ltp1: ltp1Power, lt1_La_mmol: ltp1Lactate, ltp2: ltp2Power, lt2_La_mmol: ltp2Lactate },
            });
            console.log('Detail výpočtu z polynomu viz skupina [findLTPFromPolynomial] výše.');
            console.groupEnd();
          }
          return {
            ltp1: ltp1Power,
            ltp2: ltp2Power,
            ltp1Point: { power: ltp1Power, lactate: ltp1Lactate, heartRate: ltp1HR },
            ltp2Point: { power: ltp2Power, lactate: ltp2Lactate, heartRate: ltp2HR }
          };
        }
      }
    }
    
    // Fallback: D-max a heuristiky na naměřených bodech
    // Vypočítat nárůsty laktátu mezi body
    const lactateIncreases = calculateLactateIncrease(sortedResults);
    
    // Najít bod s největším nárůstem laktátu (nejprudší stoupání) - to je dobrý kandidát na LTP2
    let maxIncrease = -Infinity;
    let maxIncreasePoint = null;
    for (const inc of lactateIncreases) {
      if (inc.increaseRate > maxIncrease) {
        maxIncrease = inc.increaseRate;
        maxIncreasePoint = inc.point;
      }
    }
    
    // Validace LTP2: měl by mít laktát vyšší než base lactate, max adaptivní strop
    const minLactateForLTP2 = Math.max(effectiveBaseLactate * 2.0, 3.5);
    const maxLactateForLTP2 = adaptiveLtp2Cap;
    const idealLTP2Lactate = 4.0;
    
    // Pro LTP2: použít D-max na druhé polovině křivky (rychlejší část s vyšším laktátem)
    const midIndex = Math.ceil(sortedResults.length / 2);
    const secondHalfPoints = sortedResults.slice(midIndex - 1); // Překrývání pro lepší detekci
    
    // Zkusit D-max na druhé polovině (kde by měl být LTP2)
    let ltp2Point = null;
    if (secondHalfPoints.length >= 3) {
      ltp2Point = calculateDmax(secondHalfPoints, isPaceSport);
    }
    
    // Pokud D-max na druhé polovině nenašel dobrý bod, zkusit na celé křivce
    if (!ltp2Point || ltp2Point.lactate < minLactateForLTP2 || ltp2Point.lactate > maxLactateForLTP2) {
      ltp2Point = calculateDmax(results, isPaceSport);
    }
    
    // Pokud D-max našel bod s laktátem > 5.0 mmol/L, je to příliš vysoké - najít lepší bod
    if (ltp2Point && ltp2Point.lactate > maxLactateForLTP2) {
      console.warn(`[findLactateThresholds] LTP2 lactate (${ltp2Point.lactate}) is too high (>${maxLactateForLTP2} mmol/L). Looking for better point.`);
      // Najít bod s laktátem v ideálním rozsahu (3.5-5.0 mmol/L pro LTP2)
      const candidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2);
      
      if (candidates.length > 0) {
        // Najít bod nejblíže ideálnímu laktátu (4.0 mmol/L)
        const idealLTP2Point = candidates.reduce((best, current) => {
          const bestDiff = Math.abs(best.lactate - idealLTP2Lactate);
          const currentDiff = Math.abs(current.lactate - idealLTP2Lactate);
          return currentDiff < bestDiff ? current : best;
        });
        
        // Použít ideální bod místo příliš vysokého
        ltp2Point = idealLTP2Point;
      } else if (maxIncreasePoint && maxIncreasePoint.lactate >= minLactateForLTP2 && maxIncreasePoint.lactate <= maxLactateForLTP2) {
        // Pokud není kandidát v ideálním rozsahu, použít bod s největším nárůstem (pokud je v rozsahu)
        ltp2Point = maxIncreasePoint;
      }
    }
    
    // Pokud D-max nenašel bod nebo má příliš nízký laktát, zkusit najít lepší bod
    if (!ltp2Point || ltp2Point.lactate < minLactateForLTP2) {
      // Zkusit použít bod s největším nárůstem laktátu, pokud má laktát v rozumném rozsahu
      if (maxIncreasePoint && maxIncreasePoint.lactate >= minLactateForLTP2 && maxIncreasePoint.lactate <= maxLactateForLTP2) {
        ltp2Point = maxIncreasePoint;
      } else {
        // Najít bod s laktátem v ideálním rozsahu (3.5-5.0 mmol/L pro LTP2)
        const candidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2);
        
        if (candidates.length > 0) {
          // Najít bod nejblíže ideálnímu laktátu (4.0 mmol/L)
          const idealLTP2Point = candidates.reduce((best, current) => {
            const bestDiff = Math.abs(best.lactate - idealLTP2Lactate);
            const currentDiff = Math.abs(current.lactate - idealLTP2Lactate);
            return currentDiff < bestDiff ? current : best;
          });
          
          // Použít ideální bod
          ltp2Point = idealLTP2Point;
        } else {
          // Fallback: najít bod s laktátem nejblíže 4.0 mmol/L (ale ne příliš vysoký)
          const fallbackCandidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2 && p.lactate <= adaptiveLtp2Cap);
          if (fallbackCandidates.length > 0) {
            // Preferovat body kolem 4.0 mmol/L
            ltp2Point = fallbackCandidates.reduce((best, current) => {
              // Preferovat body blíže k 4.0 mmol/L
              const bestDiff = Math.abs(best.lactate - idealLTP2Lactate);
              const currentDiff = Math.abs(current.lactate - idealLTP2Lactate);
              if (currentDiff < bestDiff) return current;
              // Pokud jsou stejně daleko, preferovat nižší (blíže k 4.0)
              if (currentDiff === bestDiff && current.lactate < best.lactate && current.lactate <= maxLactateForLTP2) {
                return current;
              }
              return best;
            });
          }
        }
      }
    }
    
    // Finální validace: LTP2 max adaptivní strop
    if (ltp2Point && ltp2Point.lactate > adaptiveLtp2Cap) {
      const lowerCandidates = sortedResults.filter(p => p.lactate >= 3.5 && p.lactate <= adaptiveLtp2Cap);
      if (lowerCandidates.length > 0) {
        // Najít bod nejblíže 4.0 mmol/L
        const betterLTP2Point = lowerCandidates.reduce((best, current) => {
          const bestDiff = Math.abs(best.lactate - idealLTP2Lactate);
          const currentDiff = Math.abs(current.lactate - idealLTP2Lactate);
          return currentDiff < bestDiff ? current : best;
        });
        ltp2Point = betterLTP2Point;
      }
    }
    
    if (!ltp2Point) {
      console.warn('[findLactateThresholds] Could not find LTP2 using D-max or max increase');
      return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
    }
    
    // Zajistit, že LTP2 není na stejném bodě jako LTP1 (pokud už máme LTP1)
    // Toto je preventivní opatření, ale LTP1 ještě není vypočítán
    
    // Pro LTP1: použít D-max na první polovině křivky (pomalejší část)
    // LTP1 by měl být kolem bodu, kde laktát začíná stoupat z baseline
    // DŮLEŽITÉ: Pokud laktát nejdřív roste a pak klesne, LTP1 musí být až za poklesem
    let ltp1Point = null;
    
    // Detekovat pokles laktátu na začátku křivky
    // Najít nejnižší bod laktátu (pokles) a použít pouze body po něm
    let minLactateIndex = 0;
    let minLactate = sortedResults[0].lactate;
    let hasDrop = false;
    
    // Projít první třetinu křivky a najít nejnižší laktát
    const firstThird = Math.floor(sortedResults.length / 3);
    for (let i = 1; i < Math.min(firstThird + 1, sortedResults.length); i++) {
      if (sortedResults[i].lactate < minLactate) {
        minLactate = sortedResults[i].lactate;
        minLactateIndex = i;
        hasDrop = true;
      }
    }
    
    // Pokud je pokles významný (alespoň 0.2 mmol/L), použít pouze body po poklesu
    let pointsForLTP1 = sortedResults;
    if (hasDrop && minLactateIndex > 0 && minLactateIndex < sortedResults.length - 1) {
      const dropMagnitude = sortedResults[0].lactate - minLactate;
      if (dropMagnitude >= 0.2) {
        // Použít body od poklesu dál (od minLactateIndex + 1, aby byl pokles za námi)
        pointsForLTP1 = sortedResults.slice(minLactateIndex + 1);
        console.log(`[findLactateThresholds] Detected lactate drop at index ${minLactateIndex} (${dropMagnitude.toFixed(2)} mmol/L). Using points after drop for LTP1 calculation.`);
      }
    }
    
    // Rozdělit křivku na dvě části - první polovina pro LTP1, druhá pro LTP2
    // Použít body po poklesu (pokud existuje) nebo původní body
    const firstHalfPoints = pointsForLTP1.slice(0, Math.ceil(pointsForLTP1.length / 2));
    
    // Zkusit D-max na první polovině (po poklesu, pokud existuje)
    if (firstHalfPoints.length >= 3) {
      ltp1Point = calculateDmax(firstHalfPoints, isPaceSport);
    }
    
    // Pokud D-max nenašel dobrý bod, použít alternativní metody
    // LTP1 by měl být v první polovině s laktátem kolem 1.5-2.5 mmol/L
    const maxLactateForLTP1 = isPaceSport ? MAX_LTP1_LACTATE_PACE : MAX_LTP1_LACTATE;
    
    if (!ltp1Point || ltp1Point.lactate < effectiveBaseLactate * 0.7 || ltp1Point.lactate > maxLactateForLTP1) {
      // Metoda 1: významný nárůst; přeskočit falešný start (nárůst → později pokles pod „pata“ kroku)
      const searchMaxLaForRise = Math.max(maxLactateForLTP1, 3.25);
      const pickLtp1FromRiseSegment = (prev, curr) => {
        const la0 = Number(prev.lactate);
        const la1 = Number(curr.lactate);
        const p0 = Number(prev.power);
        const p1 = Number(curr.power);
        if (!Number.isFinite(la0) || !Number.isFinite(la1) || la1 === la0) return { ...curr };
        if (curr.lactate <= maxLactateForLTP1) return { ...curr };
        if (la0 <= maxLactateForLTP1 && la1 > maxLactateForLTP1) {
          const t = (maxLactateForLTP1 - la0) / (la1 - la0);
          return {
            ...curr,
            power: p0 + t * (p1 - p0),
            lactate: maxLactateForLTP1
          };
        }
        return { ...curr };
      };
      let foundSmartRise = false;
      for (let i = 1; i < pointsForLTP1.length; i++) {
        const prev = pointsForLTP1[i - 1];
        const curr = pointsForLTP1[i];
        const lactateIncrease = curr.lactate - prev.lactate;
        if (lactateIncrease <= 0.3) continue;
        if (curr.lactate < effectiveBaseLactate * 0.8 || curr.lactate > searchMaxLaForRise) continue;
        if (isLtp1FalseStartRise(pointsForLTP1, i)) continue;
        ltp1Point = pickLtp1FromRiseSegment(prev, curr);
        foundSmartRise = true;
        break;
      }
      if (!foundSmartRise) {
        for (let i = 1; i < pointsForLTP1.length; i++) {
          const prev = pointsForLTP1[i - 1];
          const curr = pointsForLTP1[i];
          const lactateIncrease = curr.lactate - prev.lactate;
        if (lactateIncrease > 0.3 && curr.lactate >= effectiveBaseLactate * 0.8 && curr.lactate <= maxLactateForLTP1) {
          ltp1Point = curr;
          break;
          }
        }
      }
      
      // Metoda 2: Pokud stále nemáme bod, použít bod s laktátem nejblíže base lactate až 2.5 mmol/L
      // Použít body po poklesu (pokud existuje)
      if (!ltp1Point || ltp1Point.lactate < effectiveBaseLactate * 0.7 || ltp1Point.lactate > maxLactateForLTP1) {
        const idealLTP1Lactate = Math.max(effectiveBaseLactate * 1.2, 2.0); // Ideálně kolem 1.2x base nebo 2.0 mmol/L
        const candidates = pointsForLTP1.filter(p => 
          p.lactate >= effectiveBaseLactate * 0.9 && p.lactate <= maxLactateForLTP1
        );
        
        if (candidates.length > 0) {
          // Najít bod nejblíže ideálnímu laktátu
          ltp1Point = candidates.reduce((best, current) => {
            const bestDiff = Math.abs(best.lactate - idealLTP1Lactate);
            const currentDiff = Math.abs(current.lactate - idealLTP1Lactate);
            return currentDiff < bestDiff ? current : best;
          });
        } else {
          // Fallback: použít první bod s laktátem >= base lactate (z bodů po poklesu)
          ltp1Point = pointsForLTP1.find(p => p.lactate >= effectiveBaseLactate * 0.8 && p.lactate <= maxLactateForLTP1) || pointsForLTP1[0];
        }
      }
    }
    
    if (ltp1Point) {
      // Debug logging removed
      
      // Validace LTP1: měl by mít laktát alespoň kolem base lactate nebo mírně vyšší
      if (ltp1Point.lactate < effectiveBaseLactate * 0.8) {
        console.warn(`[findLactateThresholds] LTP1 lactate (${ltp1Point.lactate}) is too low compared to base (${effectiveBaseLactate}). Trying to find better point.`);
        // Najít bod s laktátem nejblíže base lactate (ideálně mezi 0.9x a 1.3x base lactate)
        // Najít index nejnižšího laktátu pro určení bodů po poklesu
        let minLactate = Infinity;
        let minLactateIndex = -1;
        for (let i = 0; i < sortedResults.length; i++) {
          if (sortedResults[i].lactate < minLactate) {
            minLactate = sortedResults[i].lactate;
            minLactateIndex = i;
          }
        }
        
        // Použít body po poklesu (od minLactateIndex dál)
        const pointsAfterDrop = sortedResults.slice(minLactateIndex + 1);
        const candidates = pointsAfterDrop.filter(p => 
          p.lactate >= effectiveBaseLactate * 0.9 && p.lactate <= effectiveBaseLactate * 1.3
        );
        let betterLTP1Point = null;
        if (candidates.length > 0) {
          // Najít bod nejblíže base lactate
          betterLTP1Point = candidates.reduce((best, current) => {
            const bestDiff = Math.abs(best.lactate - effectiveBaseLactate);
            const currentDiff = Math.abs(current.lactate - effectiveBaseLactate);
            return currentDiff < bestDiff ? current : best;
          });
        } else {
          // Pokud není žádný kandidát v ideálním rozsahu, najít nejbližší nad 0.9x base
          const fallbackCandidates = pointsAfterDrop.filter(p => p.lactate >= effectiveBaseLactate * 0.9);
          if (fallbackCandidates.length > 0) {
            betterLTP1Point = fallbackCandidates.reduce((best, current) => {
              const bestDiff = Math.abs(best.lactate - effectiveBaseLactate);
              const currentDiff = Math.abs(current.lactate - effectiveBaseLactate);
              return currentDiff < bestDiff ? current : best;
            });
          }
        }
        if (betterLTP1Point) {
          // Debug logging removed
          // Použít D-max na části od tohoto bodu
          const slowerPoints = isPaceSport
            ? sortedResults.filter(p => p.power >= betterLTP1Point.power)
            : sortedResults.filter(p => p.power <= betterLTP1Point.power);
          if (slowerPoints.length >= 3) {
            const altLTP1Point = calculateDmax(slowerPoints, isPaceSport);
            if (altLTP1Point && altLTP1Point.lactate >= effectiveBaseLactate * 0.8) {
              // Debug logging removed
              // Použít bod s lepším laktátem (blíže k base lactate nebo vyšší)
              if (altLTP1Point.lactate > ltp1Point.lactate) {
                // Debug logging removed
                ltp1Point = altLTP1Point;
              } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
                // Pokud D-max nenašel lepší, použít přímo alternativní bod
                // Debug logging removed
                ltp1Point = betterLTP1Point;
              }
            } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
              // Pokud D-max selhal, použít přímo alternativní bod
              // Debug logging removed
              ltp1Point = betterLTP1Point;
            }
          } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
            // Pokud není dostatek bodů pro D-max, použít přímo alternativní bod
            // Debug logging removed
            ltp1Point = betterLTP1Point;
          }
        }
      }
    }

    // Záložní metoda pomocí derivací, pokud D-max selže
    if (!ltp1Point) {
      console.warn('[findLactateThresholds] D-max failed for LTP1, trying derivatives');
      const { secondDerivative } = calculateDerivatives(sortedResults);
      const ltp1Candidate = secondDerivative.find(d => d.value > 0.0005);
      if (ltp1Candidate) {
        // Najít odpovídající bod v results
        const matchingPoint = results.find(r => Math.abs(r.power - ltp1Candidate.power) < 0.1) || results[0];
        // Zajistit, že LTP1 není na stejném bodě jako LTP2
        if (Math.abs(matchingPoint.power - ltp2Point.power) < 0.1) {
          // Najít jiný bod, který není stejný jako LTP2
          const alternativePoint = sortedResults.find(p => 
            Math.abs(p.power - ltp2Point.power) >= 0.1 && 
            p.lactate >= effectiveBaseLactate * 0.8 && 
            p.lactate <= maxLactateForLTP1
          ) || sortedResults[0];
          return {
            ltp1: alternativePoint.power,
            ltp2: ltp2Point.power,
            ltp1Point: alternativePoint,
            ltp2Point: ltp2Point
          };
        }
        return {
          ltp1: matchingPoint.power,
          ltp2: ltp2Point.power,
          ltp1Point: matchingPoint,
          ltp2Point: ltp2Point
        };
      }
      // Úplný fallback: použít první bod, který není stejný jako LTP2
      const fallbackPoint = sortedResults.find(p => 
        Math.abs(p.power - ltp2Point.power) >= 0.1
      ) || sortedResults[0];
      return {
        ltp1: fallbackPoint.power,
        ltp2: ltp2Point.power,
        ltp1Point: fallbackPoint,
        ltp2Point: ltp2Point
      };
    }

    // Zajistit, že LTP1 a LTP2 nejsou na stejném bodě
    if (Math.abs(ltp1Point.power - ltp2Point.power) < 0.1) {
      console.warn('[findLactateThresholds] LTP1 and LTP2 are on the same point, adjusting');
      // Najít jiný bod pro LTP1, který není stejný jako LTP2
      const alternativeLTP1 = sortedResults.find(p => 
        Math.abs(p.power - ltp2Point.power) >= 0.1 && 
        p.lactate >= effectiveBaseLactate * 0.8 && 
        p.lactate <= maxLactateForLTP1
      );
      if (alternativeLTP1) {
        ltp1Point = alternativeLTP1;
      } else {
        // Pokud není jiný bod, najít nejbližší bod, který není stejný
        const alternativeLTP1Alt = sortedResults.find(p => 
          Math.abs(p.power - ltp2Point.power) >= 0.1
        );
        if (alternativeLTP1Alt) {
          ltp1Point = alternativeLTP1Alt;
        }
      }
    }

    // Validace: Pro bike musí být LTP2 > LTP1, pro run/swim musí být LTP2 < LTP1
    // A také musí být dostatečně daleko od sebe (alespoň 8% rozdíl pro pace, 10% pro power)
    const powerDiff = Math.abs(ltp2Point.power - ltp1Point.power);
    const minPower = Math.min(ltp1Point.power, ltp2Point.power);
    const relativeDiff = powerDiff / minPower;
    const minRelativeDiff = isPaceSport ? 0.08 : 0.10; // Minimálně 8% pro pace, 10% pro power
    
    if (isPaceSport) {
      if (ltp1Point.power <= ltp2Point.power) {
        console.warn('[findLactateThresholds] Invalid LTP values for pace sport (LTP1 should be > LTP2):', {
          ltp1: ltp1Point.power,
          ltp2: ltp2Point.power
        });
        // Swap pokud jsou opačně
        return {
          ltp1: ltp2Point.power,
          ltp2: ltp1Point.power,
          ltp1Point: ltp2Point,
          ltp2Point: ltp1Point
        };
      }
    } else {
      if (ltp1Point.power >= ltp2Point.power) {
        console.warn('[findLactateThresholds] Invalid LTP values for power sport (LTP1 should be < LTP2):', {
          ltp1: ltp1Point.power,
          ltp2: ltp2Point.power
        });
        // Swap pokud jsou opačně
        return {
          ltp1: ltp2Point.power,
          ltp2: ltp1Point.power,
          ltp1Point: ltp2Point,
          ltp2Point: ltp1Point
        };
      }
    }
    
    // Pokud jsou hodnoty příliš blízko u sebe, upravit je
    if (relativeDiff < minRelativeDiff) {
      console.warn('[findLactateThresholds] LTP1 and LTP2 are too close, adjusting:', {
        ltp1: ltp1Point.power,
        ltp2: ltp2Point.power,
        diff: powerDiff,
        relativeDiff: (relativeDiff * 100).toFixed(2) + '%'
      });
      
      // Strategie: Najít body, které jsou správně oddělené podle laktátu a power
      let adjustedLTP1 = null;
      let adjustedLTP2 = null;
      
      if (isPaceSport) {
        // Pro pace: LTP1 by měl být pomalejší (vyšší power), LTP2 rychlejší (nižší power)
        // Najít LTP1 v první třetině křivky (pomalejší část) - použít body po poklesu (pokud existuje)
        const firstThird = Math.floor(pointsForLTP1.length / 3);
        const firstThirdPoints = pointsForLTP1.slice(0, firstThird + 1);
        const ltp1Candidates = firstThirdPoints.filter(p => 
          p.lactate >= effectiveBaseLactate * 0.8 && p.lactate <= maxLactateForLTP1
        );
        
        // Najít LTP2 v poslední třetině křivky (rychlejší část)
        const lastThird = Math.floor(sortedResults.length * 2 / 3);
        const lastThirdPoints = sortedResults.slice(lastThird);
        const ltp2Candidates = lastThirdPoints.filter(p => 
          p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2
        );
        
        if (ltp1Candidates.length > 0 && ltp2Candidates.length > 0) {
          // Najít kombinaci, kde LTP1 > LTP2 (správné pořadí pro pace) a jsou dostatečně daleko
          for (const candidate1 of ltp1Candidates) {
            for (const candidate2 of ltp2Candidates) {
              if (candidate1.power > candidate2.power) {
                const candidateDiff = Math.abs(candidate1.power - candidate2.power);
                const candidateRelativeDiff = candidateDiff / Math.min(candidate1.power, candidate2.power);
                if (candidateRelativeDiff >= minRelativeDiff) {
                  adjustedLTP1 = candidate1;
                  adjustedLTP2 = candidate2;
                  break;
                }
              }
            }
            if (adjustedLTP1 && adjustedLTP2) break;
          }
        }
        
        // Pokud nenašli jsme vhodnou kombinaci, použít původní strategii s úpravou
        if (!adjustedLTP1 || !adjustedLTP2) {
          const targetDiff = minPower * minRelativeDiff;
          const newLTP1Power = ltp1Point.power + targetDiff;
          const newLTP2Power = ltp2Point.power - targetDiff;
          
          // Pro LTP1 použít body po poklesu (pokud existuje)
          const newLTP1Point = pointsForLTP1.length > 0 ? pointsForLTP1.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP1Power);
            const currentDiff = Math.abs(current.power - newLTP1Power);
            return currentDiff < bestDiff ? current : best;
          }) : sortedResults.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP1Power);
            const currentDiff = Math.abs(current.power - newLTP1Power);
            return currentDiff < bestDiff ? current : best;
          });
          
          const newLTP2Point = sortedResults.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP2Power);
            const currentDiff = Math.abs(current.power - newLTP2Power);
            return currentDiff < bestDiff ? current : best;
          });
          
          if (newLTP1Point && newLTP1Point.lactate >= effectiveBaseLactate * 0.7 && 
              newLTP2Point && newLTP2Point.lactate >= effectiveBaseLactate * 1.5 &&
              newLTP1Point.power > newLTP2Point.power) {
            adjustedLTP1 = newLTP1Point;
            adjustedLTP2 = newLTP2Point;
          }
        }
      } else {
        // Pro bike: LTP1 by měl být nižší power, LTP2 vyšší power
        // Najít LTP1 v první třetině křivky (nižší power) - použít body po poklesu (pokud existuje)
        const firstThird = Math.floor(pointsForLTP1.length / 3);
        const firstThirdPoints = pointsForLTP1.slice(0, firstThird + 1);
        const ltp1Candidates = firstThirdPoints.filter(p => 
          p.lactate >= effectiveBaseLactate * 0.8 && p.lactate <= maxLactateForLTP1
        );
        
        // Najít LTP2 v poslední třetině křivky (vyšší power)
        const lastThird = Math.floor(sortedResults.length * 2 / 3);
        const lastThirdPoints = sortedResults.slice(lastThird);
        const ltp2Candidates = lastThirdPoints.filter(p => 
          p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2
        );
        
        if (ltp1Candidates.length > 0 && ltp2Candidates.length > 0) {
          // Najít kombinaci, kde LTP1 < LTP2 (správné pořadí pro bike) a jsou dostatečně daleko
          for (const candidate1 of ltp1Candidates) {
            for (const candidate2 of ltp2Candidates) {
              if (candidate1.power < candidate2.power) {
                const candidateDiff = Math.abs(candidate2.power - candidate1.power);
                const candidateRelativeDiff = candidateDiff / candidate1.power;
                if (candidateRelativeDiff >= minRelativeDiff) {
                  adjustedLTP1 = candidate1;
                  adjustedLTP2 = candidate2;
                  break;
                }
              }
            }
            if (adjustedLTP1 && adjustedLTP2) break;
          }
        }
        
        // Pokud nenašli jsme vhodnou kombinaci, použít původní strategii s úpravou
        if (!adjustedLTP1 || !adjustedLTP2) {
          const targetDiff = minPower * minRelativeDiff;
          const newLTP1Power = ltp1Point.power - targetDiff;
          const newLTP2Power = ltp2Point.power + targetDiff;
          
          // Pro LTP1 použít body po poklesu (pokud existuje)
          const newLTP1Point = pointsForLTP1.length > 0 ? pointsForLTP1.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP1Power);
            const currentDiff = Math.abs(current.power - newLTP1Power);
            return currentDiff < bestDiff ? current : best;
          }) : sortedResults.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP1Power);
            const currentDiff = Math.abs(current.power - newLTP1Power);
            return currentDiff < bestDiff ? current : best;
          });
          
          const newLTP2Point = sortedResults.reduce((best, current) => {
            const bestDiff = Math.abs(best.power - newLTP2Power);
            const currentDiff = Math.abs(current.power - newLTP2Power);
            return currentDiff < bestDiff ? current : best;
          });
          
          if (newLTP1Point && newLTP1Point.lactate >= effectiveBaseLactate * 0.7 && 
              newLTP2Point && newLTP2Point.lactate >= effectiveBaseLactate * 1.5 &&
              newLTP1Point.power < newLTP2Point.power) {
            adjustedLTP1 = newLTP1Point;
            adjustedLTP2 = newLTP2Point;
          }
        }
      }
      
      // Použít upravené body, pokud jsou validní
      if (adjustedLTP1 && adjustedLTP2) {
        ltp1Point = adjustedLTP1;
        ltp2Point = adjustedLTP2;
      } else {
        // Fallback: Pokud stále nemáme validní body, použít body s největším rozdílem v power
        // které splňují základní podmínky - použít body po poklesu (pokud existuje) pro LTP1
        const validLTP1Candidates = pointsForLTP1.filter(p => 
          p.lactate >= effectiveBaseLactate * 0.8 && p.lactate <= maxLactateForLTP1
        );
        const validLTP2Candidates = sortedResults.filter(p => 
          p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2
        );
        
        if (validLTP1Candidates.length > 0 && validLTP2Candidates.length > 0) {
          let bestPair = null;
          let maxDiff = 0;
          
          for (const candidate1 of validLTP1Candidates) {
            for (const candidate2 of validLTP2Candidates) {
              const isValidOrder = isPaceSport 
                ? candidate1.power > candidate2.power 
                : candidate1.power < candidate2.power;
              
              if (isValidOrder) {
                const diff = Math.abs(candidate2.power - candidate1.power);
                const relativeDiffCheck = diff / Math.min(candidate1.power, candidate2.power);
                if (relativeDiffCheck >= minRelativeDiff && diff > maxDiff) {
                  maxDiff = diff;
                  bestPair = { ltp1: candidate1, ltp2: candidate2 };
                }
              }
            }
          }
          
          if (bestPair) {
            ltp1Point = bestPair.ltp1;
            ltp2Point = bestPair.ltp2;
          }
        }
      }
    }

    // Dopočítat power/pace a lactate z polynomické křivky (ne z měřeného bodu), pokud máme fit
    if (polyFit && ltp1Point && ltp2Point && isPaceSport) {
      const { polyFn, fitMinX, fitMaxX } = polyFit;
      const xLTP1 = findXForLactate(polyFn, fitMinX, fitMaxX, ltp1Point.lactate, isPaceSport, true);
      const xLTP2 = findXForLactate(polyFn, fitMinX, fitMaxX, ltp2Point.lactate, isPaceSport, false);
      const interpolateHR = (x) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = Number(sortedResults[i].power);
          const b = Number(sortedResults[i + 1].power);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (x >= lo && x <= hi && a !== b) {
            const hrA = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
            const hrB = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
            if (hrA != null && hrB != null) return hrA + (hrB - hrA) * (x - a) / (b - a);
            return hrA ?? hrB;
          }
        }
        const nearest = sortedResults.reduce((best, r) =>
          Math.abs(Number(r.power) - x) < Math.abs(Number(best.power) - x) ? r : best
        );
        return nearest.heartRate != null ? Number(nearest.heartRate) : null;
      };
      if (xLTP1 != null && xLTP2 != null) {
        const validOrder = isPaceSport ? xLTP2 < xLTP1 : xLTP2 > xLTP1;
        if (validOrder) {
          let lactateAtLTP1 = Math.max(0, polyFn(xLTP1));
          let powerLTP1 = xLTP1;
          if (lactateAtLTP1 < MIN_LTP1_LACTATE) {
            const xAtMin = findXForLactate(polyFn, fitMinX, fitMaxX, MIN_LTP1_LACTATE, isPaceSport, true);
            if (xAtMin != null) {
              powerLTP1 = xAtMin;
              lactateAtLTP1 = MIN_LTP1_LACTATE;
            }
          } else if (lactateAtLTP1 > MAX_LTP1_LACTATE_PACE) {
            const xAtMax = findXForLactate(polyFn, fitMinX, fitMaxX, MAX_LTP1_LACTATE_PACE, isPaceSport, true);
            if (xAtMax != null) {
              powerLTP1 = xAtMax;
              lactateAtLTP1 = MAX_LTP1_LACTATE_PACE;
            }
          }
          ltp1Point = {
            power: powerLTP1,
            lactate: lactateAtLTP1,
            heartRate: interpolateHR(powerLTP1)
          };
          let lactateAtLTP2 = Math.max(0, polyFn(xLTP2));
          let powerLTP2 = xLTP2;
          if (lactateAtLTP2 > adaptiveLtp2Cap) {
            const xAtCap = findXForLactate(polyFn, fitMinX, fitMaxX, adaptiveLtp2Cap, isPaceSport, false);
            if (xAtCap != null) {
              powerLTP2 = xAtCap;
              lactateAtLTP2 = adaptiveLtp2Cap;
            }
          }
          ltp2Point = {
            power: powerLTP2,
            lactate: lactateAtLTP2,
            heartRate: interpolateHR(powerLTP2)
          };
        }
      }
    }

    // Finální pravidlo: LTP1 v rozmezí 1.5–2.5 mmol/L, LTP2 ≤ adaptivní cap.
    if (ltp1Point && ltp1Point.lactate < MIN_LTP1_LACTATE) {
      let powerAt15 = null;
      let hrAt15 = null;
      if (polyFit) {
        const { polyFn, fitMinX, fitMaxX } = polyFit;
        powerAt15 = findXForLactate(polyFn, fitMinX, fitMaxX, MIN_LTP1_LACTATE, isPaceSport, true);
        if (powerAt15 != null) {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = Number(sortedResults[i].power);
            const b = Number(sortedResults[i + 1].power);
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            if (powerAt15 >= lo && powerAt15 <= hi && a !== b) {
              const ha = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
              const hb = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
              if (ha != null && hb != null) hrAt15 = ha + (hb - ha) * (powerAt15 - a) / (b - a);
              else hrAt15 = ha ?? hb;
              break;
            }
          }
          if (hrAt15 == null) {
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - powerAt15) < Math.abs(Number(best.power) - powerAt15) ? r : best
            );
            hrAt15 = nearest.heartRate != null ? Number(nearest.heartRate) : null;
          }
        }
      } else {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const la = Number(a.lactate);
          const lb = Number(b.lactate);
          if ((la <= MIN_LTP1_LACTATE && lb >= MIN_LTP1_LACTATE) || (la >= MIN_LTP1_LACTATE && lb <= MIN_LTP1_LACTATE)) {
            const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (MIN_LTP1_LACTATE - la) / (lb - la);
            powerAt15 = Number(a.power) + t * (Number(b.power) - Number(a.power));
            const ha = a.heartRate != null ? Number(a.heartRate) : null;
            const hb = b.heartRate != null ? Number(b.heartRate) : null;
            hrAt15 = (ha != null && hb != null) ? ha + (hb - ha) * t : (ha ?? hb);
            break;
          }
        }
      }
      if (powerAt15 != null) {
        ltp1Point = { power: powerAt15, lactate: MIN_LTP1_LACTATE, heartRate: hrAt15 };
      }
    }

    // LTP1 horní strop: kolo 2.2 mmol/L, běh/plavání 2.5 mmol/L
    const lt1MaxClampFallback = isPaceSport ? MAX_LTP1_LACTATE_PACE : MAX_LTP1_LACTATE;
    if (ltp1Point && ltp1Point.lactate > lt1MaxClampFallback) {
      let powerAtMax = null;
      let hrAtMax = null;
      if (polyFit) {
        const { polyFn, fitMinX, fitMaxX } = polyFit;
        powerAtMax = findXForLactate(polyFn, fitMinX, fitMaxX, lt1MaxClampFallback, isPaceSport, true);
        if (powerAtMax != null) {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = Number(sortedResults[i].power);
            const b = Number(sortedResults[i + 1].power);
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            if (powerAtMax >= lo && powerAtMax <= hi && a !== b) {
              const ha = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
              const hb = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
              if (ha != null && hb != null) hrAtMax = ha + (hb - ha) * (powerAtMax - a) / (b - a);
              else hrAtMax = ha ?? hb;
              break;
            }
          }
          if (hrAtMax == null) {
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - powerAtMax) < Math.abs(Number(best.power) - powerAtMax) ? r : best
            );
            hrAtMax = nearest.heartRate != null ? Number(nearest.heartRate) : null;
          }
        }
      } else {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const la = Number(a.lactate);
          const lb = Number(b.lactate);
          if ((la <= lt1MaxClampFallback && lb >= lt1MaxClampFallback) || (la >= lt1MaxClampFallback && lb <= lt1MaxClampFallback)) {
            const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (lt1MaxClampFallback - la) / (lb - la);
            powerAtMax = Number(a.power) + t * (Number(b.power) - Number(a.power));
            const ha = a.heartRate != null ? Number(a.heartRate) : null;
            const hb = b.heartRate != null ? Number(b.heartRate) : null;
            hrAtMax = (ha != null && hb != null) ? ha + (hb - ha) * t : (ha ?? hb);
            break;
          }
        }
      }
      if (powerAtMax != null) {
        ltp1Point = { power: powerAtMax, lactate: lt1MaxClampFallback, heartRate: hrAtMax };
      }
    }

    // LTP2 max adaptivní strop (s absolutním max 4.2 mmol/L)
    if (ltp2Point && ltp2Point.lactate > adaptiveLtp2Cap) {
      let powerAtCap = null;
      let hrAtCap = null;
      if (polyFit) {
        const { polyFn, fitMinX, fitMaxX } = polyFit;
        powerAtCap = findXForLactate(polyFn, fitMinX, fitMaxX, adaptiveLtp2Cap, isPaceSport, false);
        if (powerAtCap != null) {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = Number(sortedResults[i].power);
            const b = Number(sortedResults[i + 1].power);
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            if (powerAtCap >= lo && powerAtCap <= hi && a !== b) {
              const ha = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
              const hb = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
              if (ha != null && hb != null) hrAtCap = ha + (hb - ha) * (powerAtCap - a) / (b - a);
              else hrAtCap = ha ?? hb;
              break;
            }
          }
          if (hrAtCap == null) {
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - powerAtCap) < Math.abs(Number(best.power) - powerAtCap) ? r : best
            );
            hrAtCap = nearest.heartRate != null ? Number(nearest.heartRate) : null;
          }
        }
      } else {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const la = Number(a.lactate);
          const lb = Number(b.lactate);
          if ((la <= adaptiveLtp2Cap && lb >= adaptiveLtp2Cap) || (la >= adaptiveLtp2Cap && lb <= adaptiveLtp2Cap)) {
            const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (adaptiveLtp2Cap - la) / (lb - la);
            powerAtCap = Number(a.power) + t * (Number(b.power) - Number(a.power));
            const ha = a.heartRate != null ? Number(a.heartRate) : null;
            const hb = b.heartRate != null ? Number(b.heartRate) : null;
            hrAtCap = (ha != null && hb != null) ? ha + (hb - ha) * t : (ha ?? hb);
            break;
          }
        }
      }
      if (powerAtCap != null) {
        ltp2Point = { power: powerAtCap, lactate: adaptiveLtp2Cap, heartRate: hrAtCap };
      }
    }

    // Final hard guard for bike: LT2 must be at least MIN_LT2_LT1_GAP_W above LT1.
    // Apply after all remaps/clamps so it cannot collapse again.
    if (!isPaceSport && ltp1Point && ltp2Point) {
      const minLt2Power = Number(ltp1Point.power) + MIN_LT2_LT1_GAP_W;
      if (!Number.isFinite(Number(ltp2Point.power)) || Number(ltp2Point.power) < minLt2Power) {
        const interpolateAtPower = (targetPower) => {
          for (let i = 0; i < sortedResults.length - 1; i++) {
            const a = sortedResults[i];
            const b = sortedResults[i + 1];
            const pa = Number(a.power);
            const pb = Number(b.power);
            const lo = Math.min(pa, pb);
            const hi = Math.max(pa, pb);
            if (targetPower >= lo && targetPower <= hi && pa !== pb) {
              const t = (targetPower - pa) / (pb - pa);
              const la = Number(a.lactate);
              const lb = Number(b.lactate);
              const ha = a.heartRate != null ? Number(a.heartRate) : null;
              const hb = b.heartRate != null ? Number(b.heartRate) : null;
              return {
                power: targetPower,
                lactate: Number.isFinite(la) && Number.isFinite(lb) ? la + t * (lb - la) : Number(ltp2Point.lactate),
                heartRate: (ha != null && hb != null) ? ha + t * (hb - ha) : (ha ?? hb ?? ltp2Point.heartRate ?? null)
              };
            }
          }
          return null;
        };

        let adjusted = interpolateAtPower(minLt2Power);
        if (!adjusted) {
          const pAt35 = sortedResults.find((r) => Number(r.lactate) >= OBLA_LT2_LOW_MMOL && Number(r.power) >= minLt2Power);
          if (pAt35) adjusted = { power: Number(pAt35.power), lactate: Number(pAt35.lactate), heartRate: pAt35.heartRate != null ? Number(pAt35.heartRate) : null };
        }
        if (!adjusted) {
          const maxPoint = sortedResults[sortedResults.length - 1];
          adjusted = { power: Number(maxPoint.power), lactate: Number(maxPoint.lactate), heartRate: maxPoint.heartRate != null ? Number(maxPoint.heartRate) : null };
        }
        if (adjusted && Number.isFinite(adjusted.power)) {
          ltp2Point = adjusted;
        }
      }
    }

    return {
      ltp1: ltp1Point.power,
      ltp2: ltp2Point.power,
      ltp1Point: ltp1Point,
      ltp2Point: ltp2Point
    };
  };

  
  // Hlavní funkce pro výpočet všech thresholdů
  const dbgWarn = (...args) => {
    if (!isThresholdDebugEnabled()) return;
    console.warn(...args);
  };
  const dbgLog = (...args) => {
    if (!isThresholdDebugEnabled()) return;
    console.log(...args);
  };

  const calculateThresholds = (mockData) => {
    const baseLactate = mockData.baseLactate;
    const { results } = mockData;
    // API / formulář může posílat cycling|running|swimming — findLactateThresholds očekává bike|run|swim
    let sport = mockData.sport || 'bike';
    const sLow = String(sport).toLowerCase();
    if (sLow === 'bike' || sLow === 'cycling' || sLow === 'cycle' || sLow.includes('ride')) sport = 'bike';
    else if (sLow === 'run' || sLow === 'running') sport = 'run';
    else if (sLow === 'swim' || sLow === 'swimming') sport = 'swim';
  
    if (!results || results.length < 3) {
      return {
        heartRates: {},
        lactates: {}
      };
    }
  
    // Filter out empty rows - rows where power or lactate is missing, empty, or 0
    let validResults = results.filter(r => {
      if (!r) return false;
      
      const powerStr = r.power?.toString().trim();
      const lactateStr = r.lactate?.toString().trim();
      
      // Exclude rows where power or lactate is missing, empty, or 0
      if (!powerStr || powerStr === '' || powerStr === '0' || 
          !lactateStr || lactateStr === '' || lactateStr === '0' ||
          r.power === undefined || r.power === null || 
          r.lactate === undefined || r.lactate === null) {
        return false;
      }
      
      const powerNum = Number(powerStr.replace(',', '.'));
      const lactateNum = Number(lactateStr.replace(',', '.'));
      
      // Check if values are valid numbers
      if (isNaN(powerNum) || isNaN(lactateNum)) {
        return false;
      }
      
      // Check reasonable ranges
      const isPaceSport = sport === 'run' || sport === 'swim';
      if (isPaceSport) {
        if (powerNum <= 0 || powerNum < 60) return false; // Minimum reasonable pace is ~60 seconds
      } else {
        if (powerNum <= 0 || powerNum < 50) return false; // Minimum reasonable power is ~50W
      }
      
      if (lactateNum <= 0 || lactateNum > 20) return false; // Lactate should be 0.1-20 mmol/L
      
      return true;
    });

    // Additional validation: detect and filter unrealistic lactate spikes followed by drops
    // This catches cases like 13.5 mmol/L followed by 6.2 mmol/L (measurement error)
    if (validResults.length > 2) {
      const sortedByPower = [...validResults].sort((a, b) => {
        if (sport === 'run' || sport === 'swim') {
          return b.power - a.power; // Descending for pace sports
        }
        return a.power - b.power; // Ascending for bike
      });

      const filteredResults = [];
      for (let i = 0; i < sortedByPower.length; i++) {
        const current = sortedByPower[i];
        const currentLactate = Number(current.lactate?.toString().replace(',', '.'));
        
        // Bad sample: lactate spikes then drops on the very next step (e.g. 3.7 → 1.8 mmol/L).
        // Applies to all sports once rows are sorted slow→fast (pace) or easy→hard (bike).
        if (i < sortedByPower.length - 1) {
          const nextLactate = Number(sortedByPower[i + 1].lactate?.toString().replace(',', '.'));
          if (Number.isFinite(nextLactate) && currentLactate - nextLactate >= 0.8) {
            console.warn(
              `[DataTable] Filtering spike-then-drop lactate outlier: ${currentLactate} mmol/L at power=${current.power} (next ${nextLactate})`
            );
            continue;
          }
        }

        // Check if this is an unrealistic spike (> 10 mmol/L)
        if (currentLactate > 10) {
          // Check if next value is significantly lower (drop of more than 3 mmol/L)
          if (i < sortedByPower.length - 1) {
            const next = sortedByPower[i + 1];
            const nextLactate = Number(next.lactate?.toString().replace(',', '.'));
            const drop = currentLactate - nextLactate;
            
            if (drop > 3) {
              // This is likely a measurement error - skip this high value
              console.warn(`[DataTable] Filtering out unrealistic lactate spike: ${currentLactate} mmol/L (followed by ${nextLactate} mmol/L, drop of ${drop.toFixed(1)} mmol/L)`);
              continue; // Skip this value
            }
          }
          
          // Also check if previous value was much lower (spike of more than 5 mmol/L from previous)
          if (i > 0) {
            const prev = sortedByPower[i - 1];
            const prevLactate = Number(prev.lactate?.toString().replace(',', '.'));
            const spike = currentLactate - prevLactate;
            
            if (spike > 5 && prevLactate < 5) {
              // Unrealistic spike from low value - likely measurement error
              console.warn(`[DataTable] Filtering out unrealistic lactate spike: ${currentLactate} mmol/L (spike of ${spike.toFixed(1)} mmol/L from ${prevLactate} mmol/L)`);
              continue; // Skip this value
            }
          }
        }
        
        filteredResults.push(current);
      }
      
      // Update validResults with filtered results (preserve original order)
      const filteredIds = new Set(filteredResults.map(r => `${r.power}_${r.lactate}`));
      validResults = validResults.filter(r => {
        const id = `${r.power}_${r.lactate}`;
        return filteredIds.has(id);
      });
    }
  
    // ── Non-monotonic input filter ──────────────────────────────────────────
    // Real step-test protocols have strictly increasing intensity. If the
    // user enters a power/pace value in the second half of the test that's
    // LOWER than any earlier stage, it's almost always a typo (e.g. 196
    // typed instead of 296). That single bad value, when sorted into the
    // middle of the curve by power, rips the polynomial fit apart and
    // produces nonsense thresholds. Drop those rows before the sort.
    //
    // Recovery rows (intervalType === 'recovery') are by design lower
    // intensity and must NOT trigger this — they're already excluded from
    // validResults upstream, but we double-check here for robustness.
    if (validResults.length >= 3) {
      const isPaceSport = sport === 'run' || sport === 'swim';
      const hardness = (r) => {
        if (r?.intervalType === 'recovery') return null;
        const p = Number(r?.power);
        if (!Number.isFinite(p)) return null;
        return isPaceSport ? -p : p; // "harder = higher"
      };
      const half = Math.floor(validResults.length / 2);
      let maxHardness = -Infinity;
      const cleaned = [];
      for (let i = 0; i < validResults.length; i++) {
        const h = hardness(validResults[i]);
        if (h == null) { cleaned.push(validResults[i]); continue; }
        if (h < maxHardness && i >= half) {
          console.warn(`[calculateThresholds] Dropping non-monotonic stage at index ${i}: power=${validResults[i]?.power} (lower than earlier max). Likely user typo.`);
          continue; // drop the anomalous row
        }
        if (h > maxHardness) maxHardness = h;
        cleaned.push(validResults[i]);
      }
      validResults = cleaned;
    }

    if (validResults.length < 3) {
      return {
        heartRates: {},
        lactates: {}
      };
    }

    // Pro běh a plavání necháme hodnoty v sekundách (nebudeme je převádět)
    const sortedResults = [...validResults].sort((a, b) => {
      if (sport === 'run' || sport === 'swim') {
        // Pro běh a plavání řadíme sestupně (nižší čas = lepší výkon)
        return b.power - a.power;
      }
      // Pro kolo řadíme vzestupně
      return a.power - b.power;
    });
  
    // Objekt pro ukládání výsledků
    const thresholds = {
      heartRates: {},
      lactates: {}
    };
  
    // Log-log threshold
    const logLogThreshold = calculateLogLogThreshold(sortedResults);
    if (logLogThreshold) {
      thresholds['Log-log'] = logLogThreshold.power;
      thresholds.heartRates['Log-log'] = logLogThreshold.heartRate;
      thresholds.lactates['Log-log'] = logLogThreshold.lactate;
    }
  
    // IAT threshold (předat sport kvůli správnému řazení u run/swim)
    const iatThreshold = calculateIAT(sortedResults, sport);
    if (iatThreshold) {
      thresholds['IAT'] = iatThreshold.power;
      thresholds.heartRates['IAT'] = iatThreshold.heartRate;
      thresholds.lactates['IAT'] = iatThreshold.lactate;
    }
  
    // Najít LTP body pomocí D-max metody (PŘED interpolací, aby měly prioritu).
    // Forward the test's protocol metadata so the ensemble inside
    // findLactateThresholds → computeLactateThresholds can individualize LT1,
    // use the post-test peak as D-max's upper anchor, and apply stage-duration
    // correction when stages are < 4 min.
    const protocolMeta = {
      baseLactate: Number(mockData?.baseLactate ?? mockData?.baseLa) || null,
      maxLactate: Number(mockData?.maxLactate ?? mockData?.recoveryLactate3min) || null,
      stageDurationSec: Number(mockData?.stageDurationSec) || null,
    };
    const { ltp1, ltp2, ltp1Point, ltp2Point } = findLactateThresholds(sortedResults, baseLactate, sport, protocolMeta);

    // Definice cílových laktátů. Stejná sanity check jako uvnitř
    // findLactateThresholds: baseLactate se nesmí dostat nad nejmenší naměřenou
    // hodnotu, jinak interpolace LT1 = base + 0.5 vrátí targety mimo data → NaN.
    const rawBaseEff = baseLactate != null && Number.isFinite(Number(baseLactate)) && Number(baseLactate) > 0
      ? Number(baseLactate) : null;
    const minLacEff = (() => {
      const vs = sortedResults
        .map(r => Number(String(r.lactate ?? '').replace(',', '.')))
        .filter(v => Number.isFinite(v) && v > 0);
      return vs.length ? Math.min(...vs) : null;
    })();
    const effectiveBaseLactate = rawBaseEff != null
      ? (minLacEff != null ? Math.min(rawBaseEff, minLacEff) : rawBaseEff)
      : 1.0;
    
    // Použít stejnou polynomiální křivku jako v grafu pro výpočet LTP1 a LTP2
    // Toto zajistí konzistenci mezi grafem a tabulkou
    // Použít calculatePolynomialRegression stejně jako v LactateCurveCalculator.jsx
    // Use filtered validResults (excludes unrealistic spikes)
    const polyPointsRaw = calculatePolynomialRegression(validResults);
    
    // Helper function to find X value from polynomial curve for a given lactate value
    // Stejná jako v LactateCurveCalculator.jsx
    const findXFromCurve = (targetLactate, curvePoints) => {
      if (!curvePoints || curvePoints.length === 0) return null;
      
      // Find the point on the curve closest to target lactate
      let closestPoint = curvePoints[0];
      let minDiff = Math.abs(closestPoint.y - targetLactate);
      
      for (const point of curvePoints) {
        const diff = Math.abs(point.y - targetLactate);
        if (diff < minDiff) {
          minDiff = diff;
          closestPoint = point;
        }
      }
      
      // If we have points on both sides, interpolate
      const index = curvePoints.findIndex(p => p.y >= targetLactate);
      if (index > 0 && index < curvePoints.length) {
        const prev = curvePoints[index - 1];
        const next = curvePoints[index];
        if (prev.y !== next.y) {
          const ratio = (targetLactate - prev.y) / (next.y - prev.y);
          const interpolatedX = prev.x + (next.x - prev.x) * ratio;
          return interpolatedX;
        }
      }
      
      return closestPoint.x;
    };
    
    // Pokud máme LTP body: kolo = výhradně výkon z findLactateThresholds (segmentace / D-max na vzorcích), ne X z polynomu.
    // Běh/plavání: stále můžeme použít polynom pro kontrolu pořadí a pro LT2 na křivce kde dává smysl.
    if (ltp1Point && ltp1Point.lactate != null && ltp2Point && ltp2Point.lactate != null) {
      const ltp1Lactate = ltp1Point.lactate;
      const ltp2Lactate = ltp2Point.lactate;
      const isPaceSport = sport === 'run' || sport === 'swim';

      const interpolateHR = (x) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = Number(sortedResults[i].power);
          const b = Number(sortedResults[i + 1].power);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (x >= lo && x <= hi && a !== b) {
            const hrA = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
            const hrB = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
            if (hrA != null && hrB != null) return hrA + (hrB - hrA) * (x - a) / (b - a);
            return hrA ?? hrB;
          }
        }
        const nearest = sortedResults.reduce((best, r) =>
          Math.abs(Number(r.power) - x) < Math.abs(Number(best.power) - x) ? r : best
        );
        return nearest.heartRate != null ? Number(nearest.heartRate) : null;
      };

      const applyLtpSwapFallback = () => {
        let finalLtp1 = ltp1;
        let finalLtp2 = ltp2;
        let finalLtp1Lactate = ltp1Lactate;
        let finalLtp2Lactate = ltp2Lactate;
        let finalLtp1HR = ltp1Point.heartRate || null;
        let finalLtp2HR = ltp2Point.heartRate || null;
        if (ltp1Lactate > ltp2Lactate) {
          console.warn('[calculateThresholds] LT1 lactate higher than LT2, swapping values');
          finalLtp1 = ltp2;
          finalLtp2 = ltp1;
          finalLtp1Lactate = ltp2Lactate;
          finalLtp2Lactate = ltp1Lactate;
          finalLtp1HR = ltp2Point.heartRate || null;
          finalLtp2HR = ltp1Point.heartRate || null;
        }
        thresholds['LTP1'] = finalLtp1;
        thresholds.heartRates['LTP1'] = finalLtp1HR;
        thresholds.lactates['LTP1'] = finalLtp1Lactate;
        thresholds['LTP2'] = finalLtp2;
        thresholds.heartRates['LTP2'] = finalLtp2HR;
        thresholds.lactates['LTP2'] = finalLtp2Lactate;
      };

      if (!isPaceSport) {
        const p1 = Number(ltp1Point.power);
        const p2 = Number(ltp2Point.power);
        const validOrder = Number.isFinite(p1) && Number.isFinite(p2) && p2 > p1;
        const validLactateOrder = ltp1Lactate < ltp2Lactate;
        if (validOrder && validLactateOrder) {
          thresholds['LTP1'] = p1;
          thresholds['LTP2'] = p2;
          thresholds.heartRates['LTP1'] = interpolateHR(p1);
          thresholds.heartRates['LTP2'] = interpolateHR(p2);
          thresholds.lactates['LTP1'] = ltp1Lactate;
          thresholds.lactates['LTP2'] = ltp2Lactate;
        } else {
          applyLtpSwapFallback();
        }
      } else {
        const ltp1XFromCurve = findXFromCurve(ltp1Lactate, polyPointsRaw);
        const ltp2XFromCurve = findXFromCurve(ltp2Lactate, polyPointsRaw);
        if (ltp1XFromCurve != null && !isNaN(ltp1XFromCurve) && ltp2XFromCurve != null && !isNaN(ltp2XFromCurve)) {
          const validOrder = Number(ltp2Point.power) < Number(ltp1Point.power);
          const validLactateOrder = ltp1Lactate < ltp2Lactate;
          if (validOrder && validLactateOrder) {
            const p1m = Number(ltp1Point.power);
            thresholds['LTP1'] = p1m;
            thresholds.heartRates['LTP1'] = interpolateHR(p1m);
            thresholds.lactates['LTP1'] = Number(ltp1Point.lactate);
            thresholds['LTP2'] = ltp2XFromCurve;
            thresholds.heartRates['LTP2'] = interpolateHR(ltp2XFromCurve);
            thresholds.lactates['LTP2'] = ltp2Lactate;
          } else {
            applyLtpSwapFallback();
          }
        } else {
          applyLtpSwapFallback();
        }
      }
    } else {
      // Fallback na D-max hodnoty pokud nemáme body
      if (ltp1Point && ltp1Point.lactate != null) {
      thresholds['LTP1'] = ltp1;
      thresholds.heartRates['LTP1'] = ltp1Point.heartRate || null;
        thresholds.lactates['LTP1'] = ltp1Point.lactate;
    }
    
      if (ltp2Point && ltp2Point.lactate != null) {
      thresholds['LTP2'] = ltp2;
      thresholds.heartRates['LTP2'] = ltp2Point.heartRate || null;
        thresholds.lactates['LTP2'] = ltp2Point.lactate;
      }
    }

    // Final UI-level guard for bike:
    // - LT1 should not lock too early on long flat low-lactate segments.
    // - LT2 must keep both power separation and physiological lactate floor.
    if (sport === 'bike' && Number.isFinite(Number(thresholds['LTP1'])) && Number.isFinite(Number(thresholds['LTP2']))) {
      const interpolateAtPower = (targetPower) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const pa = Number(a.power);
          const pb = Number(b.power);
          const lo = Math.min(pa, pb);
          const hi = Math.max(pa, pb);
          if (targetPower >= lo && targetPower <= hi && pa !== pb) {
            const t = (targetPower - pa) / (pb - pa);
            const la = Number(a.lactate);
            const lb = Number(b.lactate);
            const ha = a.heartRate != null ? Number(a.heartRate) : null;
            const hb = b.heartRate != null ? Number(b.heartRate) : null;
            return {
              power: targetPower,
              lactate: Number.isFinite(la) && Number.isFinite(lb) ? la + t * (lb - la) : null,
              heartRate: (ha != null && hb != null) ? ha + (hb - ha) * t : (ha ?? hb ?? null)
            };
          }
        }
        return null;
      };
      const interpolatePowerAtLactate = (targetLa) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const la = Number(a.lactate);
          const lb = Number(b.lactate);
          if ((la <= targetLa && lb >= targetLa) || (la >= targetLa && lb <= targetLa)) {
            const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (targetLa - la) / (lb - la);
            return Number(a.power) + t * (Number(b.power) - Number(a.power));
          }
        }
        return null;
      };

      // LT1 floor for bike: keep it near first meaningful rise, not at minimal 1.5 plateau.
      const lt1LaFloorBike = Math.min(MAX_LTP1_LACTATE, Math.max(1.7, Number(effectiveBaseLactate) + 0.5));
      const currentLt1La = Number(thresholds.lactates['LTP1']);
      if (Number.isFinite(currentLt1La) && currentLt1La < lt1LaFloorBike) {
        const pAtFloor = interpolatePowerAtLactate(lt1LaFloorBike);
        if (Number.isFinite(Number(pAtFloor))) {
          const lt1Point = interpolateAtPower(Number(pAtFloor));
          if (lt1Point) {
            thresholds['LTP1'] = lt1Point.power;
            thresholds.lactates['LTP1'] = lt1LaFloorBike;
            thresholds.heartRates['LTP1'] = lt1Point.heartRate;
          }
        }
      }

      const minLt2Power = Number(thresholds['LTP1']) + MIN_LT2_LT1_GAP_W;
      const minLt2LaBike = 3.2;
      const currentLt2Power = Number(thresholds['LTP2']);
      const currentLt2La = Number(thresholds.lactates['LTP2']);
      if (currentLt2Power < minLt2Power || !Number.isFinite(currentLt2La) || currentLt2La < minLt2LaBike) {
        let adjustedPoint = null;
        const pAt32 = interpolatePowerAtLactate(minLt2LaBike);
        const pAt35 = interpolatePowerAtLactate(OBLA_LT2_LOW_MMOL);
        const pAt40 = interpolatePowerAtLactate(OBLA_LT2_HIGH_MMOL);
        const candidatePowers = [pAt32, pAt35, pAt40]
          .filter((v) => Number.isFinite(Number(v)))
          .map((v) => Number(v))
          .filter((p) => p >= minLt2Power);
        if (candidatePowers.length > 0) {
          adjustedPoint = interpolateAtPower(Math.min(...candidatePowers));
        }
        if (!adjustedPoint) {
          adjustedPoint = interpolateAtPower(minLt2Power);
        }
        if (!adjustedPoint) {
          const higher = sortedResults.find((r) => Number(r.power) >= minLt2Power);
          const fallback = higher || sortedResults[sortedResults.length - 1];
          adjustedPoint = {
            power: Number(fallback.power),
            lactate: Number(fallback.lactate),
            heartRate: fallback.heartRate != null ? Number(fallback.heartRate) : null
          };
        }
        thresholds['LTP2'] = adjustedPoint.power;
        thresholds.lactates['LTP2'] = Number.isFinite(Number(adjustedPoint.lactate))
          ? Math.max(minLt2LaBike, Number(adjustedPoint.lactate))
          : minLt2LaBike;
        thresholds.heartRates['LTP2'] = adjustedPoint.heartRate;
      }
    }
    
    const targets = [
      2.0, 2.5, 3.0, 3.5,  // OBLA hodnoty
      effectiveBaseLactate + 0.5, effectiveBaseLactate + 1.0, effectiveBaseLactate + 1.5,  // Baseline + delta
      // LTP1 a LTP2 už máme z D-max, takže je přeskočíme v interpolaci
    ];
  
    // Projít všechny sousední body a najít thresholdy (kromě LTP1/LTP2, které už máme)
    for (let i = 1; i < sortedResults.length; i++) {
      const prev = sortedResults[i - 1];
      const curr = sortedResults[i];
  
      targets.forEach((target, index) => {
        if (prev.lactate <= target && curr.lactate >= target) {
          const key = [
            'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5',
            'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5',
          ][index];
  
          // Interpolovaný výkon/tempo
          thresholds[key] = interpolate(
            prev.power, prev.lactate,
            curr.power, curr.lactate,
            target
          );
  
          // Interpolovaný HR
          thresholds.heartRates[key] = interpolate(
            prev.heartRate, prev.lactate,
            curr.heartRate, curr.lactate,
            target
          );
  
          // Uložit cílový laktát
          thresholds.lactates[key] = target;
        }
      });
    }

    // --- Ensemble refinement (LT1/LT2) ---
    // Keep current method as primary, then nudge with robust candidates.
    const currentLtp1 = thresholds['LTP1'];
    const currentLtp2 = thresholds['LTP2'];
    if (Number.isFinite(Number(currentLtp1)) && Number.isFinite(Number(currentLtp2))) {
      const isPaceSportNow = sport === 'run' || sport === 'swim';
      const sustainedRise = findFirstSustainedRise(sortedResults, effectiveBaseLactate, sport);

      const lt1Candidates = [
        { x: thresholds['OBLA 2.0'], w: 1.0 },
        { x: thresholds['Bsln + 0.5'], w: 1.2 },
        { x: sustainedRise?.power, w: 1.4 }
      ];
      const lt2Candidates = [
        { x: thresholds['IAT'], w: 1.0 },
        { x: thresholds['OBLA 3.5'], w: 1.3 },
      ];

      const refinedLtp1 = blendThreshold({
        primary: currentLtp1,
        candidates: lt1Candidates,
        isPaceSport: isPaceSportNow,
        preferHigher: !isPaceSportNow // bike: slightly higher LT1 is safer; pace sports opposite
      });
      const refinedLtp2 = blendThreshold({
        primary: currentLtp2,
        candidates: lt2Candidates,
        isPaceSport: isPaceSportNow,
        preferHigher: !isPaceSportNow
      });
      const weightedAverage = (items) => {
        const valid = (items || []).filter(i => Number.isFinite(Number(i?.x)) && Number.isFinite(Number(i?.w)) && Number(i.w) > 0);
        if (!valid.length) return null;
        const sumW = valid.reduce((s, i) => s + Number(i.w), 0);
        if (sumW <= 0) return null;
        return valid.reduce((s, i) => s + (Number(i.x) * Number(i.w)), 0) / sumW;
      };
      const averagedLtp1 = weightedAverage([
        { x: refinedLtp1, w: 0.55 },
        { x: thresholds['Bsln + 0.5'], w: 0.25 },
        { x: thresholds['OBLA 2.0'], w: 0.20 },
      ]);
      const averagedLtp2Raw = weightedAverage([
        { x: refinedLtp2, w: 0.50 },
        { x: thresholds['OBLA 3.5'], w: 0.35 },
        { x: thresholds['IAT'], w: 0.15 },
      ]);
      const averagedLtp2 = Number.isFinite(Number(averagedLtp2Raw))
        ? averagedLtp2Raw
        : refinedLtp2;

      // Bike: vůbec nepřepisovat LTP1/LTP2 ensemblem (jinak se z OBLA/IAT zase „utrhne“ od segmentace).
      if (
        isPaceSportNow &&
        Number.isFinite(Number(averagedLtp1)) &&
        Number.isFinite(Number(averagedLtp2))
      ) {
        const orderOk = averagedLtp2 < averagedLtp1;
        const minGap = 6;
        const gapOk = (averagedLtp1 - averagedLtp2) >= minGap;

        if (orderOk && gapOk) {
          thresholds['LTP1'] = averagedLtp1;
          thresholds['LTP2'] = averagedLtp2;
        }
      }

    }
  
    // Fallback: Pokud se LTP1 nenajde pomocí D-max, zkusit interpolovat HR
    if (thresholds['LTP1'] && !thresholds.heartRates['LTP1'] && ltp1 && ltp1Point) {
      // Validace laktátu - měl by být v rozumném rozsahu
      const ltp1Lactate = ltp1Point.lactate;
      if (ltp1Lactate) {
        if (ltp1Lactate < 0.5 || ltp1Lactate > 8.0) {
          console.warn('[calculateThresholds] LTP1 lactate value seems invalid (out of range):', ltp1Lactate);
        } else if (ltp1Lactate > 4.0) {
          console.warn('[calculateThresholds] LTP1 lactate value is high (>4.0 mmol/L):', ltp1Lactate,
            '- This may indicate the D-max point is too late in the curve.');
        } else if (ltp1Lactate < 1.0) {
          console.warn('[calculateThresholds] LTP1 lactate value is low (<1.0 mmol/L):', ltp1Lactate,
            '- This may indicate the D-max point is too early in the curve.');
        }
      }
      
      // Pokud nemáme HR z bodu, zkusit interpolovat
      if (!thresholds.heartRates['LTP1']) {
        let prevLap = sortedResults[0];
        let nextLap = sortedResults[sortedResults.length - 1];
        
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const isPace = sport === 'run' || sport === 'swim';
          const condition = isPace 
            ? (sortedResults[i].power >= ltp1 && sortedResults[i + 1].power <= ltp1)
            : (sortedResults[i].power <= ltp1 && sortedResults[i + 1].power >= ltp1);
          
          if (condition) {
            prevLap = sortedResults[i];
            nextLap = sortedResults[i + 1];
            break;
          }
        }
        
        const hr1 = prevLap.heartRate || null;
        const hr2 = nextLap.heartRate || null;
        
        if (hr1 && hr2 && prevLap.power !== nextLap.power) {
          thresholds.heartRates['LTP1'] = interpolate(prevLap.power, hr1, nextLap.power, hr2, ltp1);
        } else if (hr1) {
          thresholds.heartRates['LTP1'] = hr1;
        } else if (hr2) {
          thresholds.heartRates['LTP1'] = hr2;
        }
      }
      
      // Debug logging removed
    }
    
    // Fallback: Pokud se LTP2 nenajde pomocí D-max, zkusit interpolovat HR
    if (thresholds['LTP2'] && !thresholds.heartRates['LTP2'] && ltp2 && ltp2Point) {
      // Pokud nemáme HR z bodu, zkusit interpolovat
      if (!thresholds.heartRates['LTP2']) {
        let prevLap = sortedResults[0];
        let nextLap = sortedResults[sortedResults.length - 1];
        
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const isPace = sport === 'run' || sport === 'swim';
          const condition = isPace 
            ? (sortedResults[i].power >= ltp2 && sortedResults[i + 1].power <= ltp2)
            : (sortedResults[i].power <= ltp2 && sortedResults[i + 1].power >= ltp2);
          
          if (condition) {
            prevLap = sortedResults[i];
            nextLap = sortedResults[i + 1];
            break;
          }
        }
        
        const hr1 = prevLap.heartRate || null;
        const hr2 = nextLap.heartRate || null;
        
        if (hr1 && hr2 && prevLap.power !== nextLap.power) {
          thresholds.heartRates['LTP2'] = interpolate(prevLap.power, hr1, nextLap.power, hr2, ltp2);
        } else if (hr1) {
          thresholds.heartRates['LTP2'] = hr1;
        } else if (hr2) {
          thresholds.heartRates['LTP2'] = hr2;
        }
      }
      
      // Debug logging removed
    }
  
    // Výpočet LTRatio pouze pokud máme oba LTP body a jsou validní
    if (ltp1 && ltp2 && ltp1 > 0 && ltp2 > 0 && ltp1Point && ltp2Point) {
      const isPaceSport = sport === 'run' || sport === 'swim';
      
      // Validace: hodnoty musí být v rozumném rozsahu
      // Pro bike: power obvykle 100-500W, pro pace: obvykle 180-600 sekund (3-10 min/km)
      const maxReasonablePower = isPaceSport ? 900 : 1000; // 15 min/km nebo 1000W je maximum
      const minReasonablePower = isPaceSport ? 60 : 50; // 1 min/km nebo 50W je minimum
      
      if (ltp1 > maxReasonablePower || ltp2 > maxReasonablePower || 
          ltp1 < minReasonablePower || ltp2 < minReasonablePower) {
        dbgWarn('[calculateThresholds] LTP values are out of reasonable range, skipping LTRatio:', {
          ltp1,
          ltp2,
          sport,
          isPaceSport,
          expectedRange: `${minReasonablePower}-${maxReasonablePower}`
        });
        // Nepřidat LTRatio, pokud jsou hodnoty mimo rozsah
      } else {
        // Validace: hodnoty nesmí být příliš blízko u sebe (rozdíl musí být alespoň 3%)
        // Sníženo z 5% na 3% pro lepší detekci i u dat s menším rozsahem
        const powerDiff = Math.abs(ltp2 - ltp1);
        const minPower = Math.min(ltp1, ltp2);
        const relativeDiff = powerDiff / minPower;
        
        if (relativeDiff < 0.03) {
          dbgWarn('[calculateThresholds] LTP1 and LTP2 are too close together, skipping LTRatio calculation:', {
            ltp1,
            ltp2,
            diff: powerDiff,
            relativeDiff: (relativeDiff * 100).toFixed(2) + '%'
          });
          // Nepřidat LTRatio, pokud jsou hodnoty příliš blízko
        } else {
          // Pro bike: LTP2 > LTP1, takže ratio = LTP2/LTP1 (typicky 1.1-1.3)
          // Pro run/swim: LTP2 < LTP1 (pace), takže ratio = LTP1/LTP2 (typicky 1.1-2.0)
          const ratio = isPaceSport ? ltp1 / ltp2 : ltp2 / ltp1;
          
          // Přísnější kontrola rozsahu
          // Pro bike: 1.05-1.5 (rozumný rozsah)
          // Pro pace: 1.05-2.5 (může být vyšší, ale ne extrémně)
          const minRatio = 1.05;
          const maxRatio = isPaceSport ? 2.5 : 1.5;
          
          // Kontrola, zda je ratio validní číslo a v rozumném rozsahu
          if (isNaN(ratio) || !isFinite(ratio)) {
            dbgWarn('[calculateThresholds] LTRatio is not a valid number, skipping:', {
              ratio,
              ltp1,
              ltp2
            });
          } else if (ratio >= minRatio && ratio <= maxRatio) {
            thresholds['LTRatio'] = ratio.toFixed(2);
          } else {
            // Pokud je ratio mimo rozsah, nezobrazit ho vůbec
            dbgWarn('[calculateThresholds] LTRatio out of reasonable range, not displaying:', {
              ratio: ratio.toFixed(2),
              ltp1,
              ltp2,
              sport,
              isPaceSport,
              expectedRange: `${minRatio}-${maxRatio}`
            });
            // Nepřidat LTRatio do thresholds
          }
        }
      }
    } else {
      dbgWarn('[calculateThresholds] Cannot calculate LTRatio - missing LTP values:', {
        hasLTP1: !!ltp1,
        hasLTP2: !!ltp2,
        hasLTP1Point: !!ltp1Point,
        hasLTP2Point: !!ltp2Point
      });
    }
  
    // Debug logging
    if (!thresholds['LTP1'] || !thresholds['LTP2']) {
      dbgWarn('[calculateThresholds] Missing LTP values:', {
        hasLTP1: !!thresholds['LTP1'],
        hasLTP2: !!thresholds['LTP2'],
        ltp1_dmax: ltp1,
        ltp2_dmax: ltp2,
        baseLactate: effectiveBaseLactate,
        resultsCount: sortedResults.length,
        maxLactate: Math.max(...sortedResults.map(r => r.lactate)),
        minLactate: Math.min(...sortedResults.map(r => r.lactate)),
        targetLTP1: effectiveBaseLactate * 1.5,
        targetLTP2: effectiveBaseLactate * 3.0
      });
    }

    // Sladit LTP2 u běhu/plavání s polynomem (LTP1 tam bereme z naměřených kroků).
    // Kolo: už vůbec nesnapovat na polynom — tento krok dřív přepsal veškerou logiku „z krevních vzorků“ zpět na křivku.
    const isPaceSportSync = sport === 'run' || sport === 'swim';
    if (isPaceSportSync && polyPointsRaw && polyPointsRaw.length > 0) {
      const interpolateHRAtIntensity = (x) => {
        if (x == null || !Number.isFinite(Number(x))) return null;
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = Number(sortedResults[i].power);
          const b = Number(sortedResults[i + 1].power);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (x >= lo && x <= hi && a !== b) {
            const hrA = sortedResults[i].heartRate != null ? Number(sortedResults[i].heartRate) : null;
            const hrB = sortedResults[i + 1].heartRate != null ? Number(sortedResults[i + 1].heartRate) : null;
            if (hrA != null && hrB != null) return hrA + (hrB - hrA) * (x - a) / (b - a);
            return hrA ?? hrB;
          }
        }
        const nearest = sortedResults.reduce((best, r) =>
          Math.abs(Number(r.power) - x) < Math.abs(Number(best.power) - x) ? r : best
        );
        return nearest.heartRate != null ? Number(nearest.heartRate) : null;
      };
      ['LTP1', 'LTP2'].forEach((ltpKey) => {
        if (ltpKey === 'LTP1') return;
        const la = thresholds.lactates[ltpKey];
        if (la == null || !Number.isFinite(Number(la))) return;
        const xCurve = findXFromCurve(Number(la), polyPointsRaw);
        if (xCurve != null && Number.isFinite(xCurve)) {
          thresholds[ltpKey] = xCurve;
          const hr = interpolateHRAtIntensity(xCurve);
          if (hr != null && Number.isFinite(hr)) thresholds.heartRates[ltpKey] = hr;
        }
      });
    }

    // Absolute last-mile guard for bike thresholds (must run right before return).
    // Prevents any previous step from leaving LT1/LT2 too low on "drop then rise" curves.
    if (sport === 'bike' && Number.isFinite(Number(thresholds['LTP1'])) && Number.isFinite(Number(thresholds['LTP2']))) {
      const interpolateAtPowerFinal = (targetPower) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const pa = Number(a.power);
          const pb = Number(b.power);
          if (targetPower >= Math.min(pa, pb) && targetPower <= Math.max(pa, pb) && pa !== pb) {
            const t = (targetPower - pa) / (pb - pa);
            const la = Number(a.lactate);
            const lb = Number(b.lactate);
            return {
              power: targetPower,
              lactate: Number.isFinite(la) && Number.isFinite(lb) ? la + t * (lb - la) : null,
              heartRate:
                (a.heartRate != null && b.heartRate != null)
                  ? Number(a.heartRate) + t * (Number(b.heartRate) - Number(a.heartRate))
                  : (a.heartRate ?? b.heartRate ?? null)
            };
          }
        }
        return null;
      };
      const interpolatePowerAtLactateFinal = (targetLa) => {
        for (let i = 0; i < sortedResults.length - 1; i++) {
          const a = sortedResults[i];
          const b = sortedResults[i + 1];
          const la = Number(a.lactate);
          const lb = Number(b.lactate);
          if ((la <= targetLa && lb >= targetLa) || (la >= targetLa && lb <= targetLa)) {
            const t = Math.abs(lb - la) < 1e-9 ? 0.5 : (targetLa - la) / (lb - la);
            return {
              power: Number(a.power) + t * (Number(b.power) - Number(a.power)),
              heartRate:
                (a.heartRate != null && b.heartRate != null)
                  ? Number(a.heartRate) + t * (Number(b.heartRate) - Number(a.heartRate))
                  : (a.heartRate ?? b.heartRate ?? null)
            };
          }
        }
        return null;
      };

      const lt1LaFloorFinal = Math.min(MAX_LTP1_LACTATE, Math.max(1.7, Number(effectiveBaseLactate) + 0.5));
      const curLt1La = Number(thresholds.lactates['LTP1']);
      if (!Number.isFinite(curLt1La) || curLt1La < lt1LaFloorFinal) {
        const pAtFloor = interpolatePowerAtLactateFinal(lt1LaFloorFinal);
        if (pAtFloor && Number.isFinite(Number(pAtFloor.power))) {
          thresholds['LTP1'] = Number(pAtFloor.power);
          thresholds.lactates['LTP1'] = lt1LaFloorFinal;
          thresholds.heartRates['LTP1'] = pAtFloor.heartRate != null ? Number(pAtFloor.heartRate) : thresholds.heartRates['LTP1'];
        }
      }

      // High-LT1 guard for bike:
      // LT1 should stay near the first deflection (roughly ~2.0-2.3 mmol), not near threshold segment.
      const targetLt1LaBike = Math.min(MAX_LTP1_LACTATE, Math.max(1.9, Number(effectiveBaseLactate) + 0.9));
      const pAtTargetLt1 = interpolatePowerAtLactateFinal(targetLt1LaBike);
      const obla25Power = Number(thresholds['OBLA 2.5']);
      const lt1UpperCandidates = [
        pAtTargetLt1?.power,
        Number.isFinite(obla25Power) ? obla25Power : null
      ]
        .filter((v) => Number.isFinite(Number(v)))
        .map((v) => Number(v));
      const lt1UpperBound = lt1UpperCandidates.length > 0 ? Math.min(...lt1UpperCandidates) : null;
      const curLt1Power = Number(thresholds['LTP1']);
      if (Number.isFinite(curLt1Power) && Number.isFinite(lt1UpperBound) && curLt1Power > lt1UpperBound) {
        const correctedLt1 = interpolateAtPowerFinal(lt1UpperBound);
        if (correctedLt1 && Number.isFinite(Number(correctedLt1.power))) {
          thresholds['LTP1'] = Number(correctedLt1.power);
          thresholds.lactates['LTP1'] = Number.isFinite(Number(correctedLt1.lactate))
            ? Number(correctedLt1.lactate)
            : targetLt1LaBike;
          thresholds.heartRates['LTP1'] = correctedLt1.heartRate != null
            ? Number(correctedLt1.heartRate)
            : thresholds.heartRates['LTP1'];
        }
      }

      const minLt2PowerFinal = Number(thresholds['LTP1']) + MIN_LT2_LT1_GAP_W;
      const maxLt2LaFinal = MAX_LTP2_LACTATE;
      const curLt2LaBeforeClamp = Number(thresholds.lactates['LTP2']);
      if (Number.isFinite(curLt2LaBeforeClamp) && curLt2LaBeforeClamp > maxLt2LaFinal + 0.05) {
        const pAtCap = interpolatePowerAtLactateFinal(maxLt2LaFinal);
        let correctedLt2 = null;
        if (pAtCap && Number.isFinite(Number(pAtCap.power)) && Number(pAtCap.power) >= minLt2PowerFinal) {
          correctedLt2 = interpolateAtPowerFinal(Number(pAtCap.power));
        }
        if (!correctedLt2) {
          correctedLt2 = interpolateAtPowerFinal(minLt2PowerFinal);
        }
        if (correctedLt2 && Number.isFinite(Number(correctedLt2.power))) {
          thresholds['LTP2'] = Number(correctedLt2.power);
          thresholds.lactates['LTP2'] = Number.isFinite(Number(correctedLt2.lactate))
            ? Math.min(maxLt2LaFinal, Number(correctedLt2.lactate))
            : maxLt2LaFinal;
          thresholds.heartRates['LTP2'] = correctedLt2.heartRate != null
            ? Number(correctedLt2.heartRate)
            : thresholds.heartRates['LTP2'];
        }
      }

      const minLt2LaFinal = 3.2;
      const curLt2Power = Number(thresholds['LTP2']);
      const curLt2La = Number(thresholds.lactates['LTP2']);
      if (!Number.isFinite(curLt2Power) || curLt2Power < minLt2PowerFinal || !Number.isFinite(curLt2La) || curLt2La < minLt2LaFinal) {
        const pAt32 = interpolatePowerAtLactateFinal(minLt2LaFinal);
        const pAt35 = interpolatePowerAtLactateFinal(OBLA_LT2_LOW_MMOL);
        const pAt40 = interpolatePowerAtLactateFinal(OBLA_LT2_HIGH_MMOL);
        const candidates = [pAt32, pAt35, pAt40]
          .filter((x) => x && Number.isFinite(Number(x.power)) && Number(x.power) >= minLt2PowerFinal)
          .sort((a, b) => Number(a.power) - Number(b.power));
        const chosen = candidates[0] || pAt32 || pAt35 || pAt40;
        if (chosen && Number.isFinite(Number(chosen.power))) {
          thresholds['LTP2'] = Number(chosen.power);
          thresholds.lactates['LTP2'] = Math.max(minLt2LaFinal, Number.isFinite(Number(chosen.lactate)) ? Number(chosen.lactate) : minLt2LaFinal);
          thresholds.heartRates['LTP2'] = chosen.heartRate != null ? Number(chosen.heartRate) : thresholds.heartRates['LTP2'];
        }
      }

      // Contradiction fallback:
      // if there is any higher-load point with lower lactate than current LT1 lactate,
      // use baseline-relative thresholds (Bsln+0.5 / Bsln+1.5).
      const currentLt1Power = Number(thresholds['LTP1']);
      const currentLt1La = Number(thresholds.lactates['LTP1']);
      const hasHigherPowerLowerLa = Number.isFinite(currentLt1Power) && Number.isFinite(currentLt1La)
        ? sortedResults.some((r) => Number(r.power) > currentLt1Power && Number(r.lactate) < currentLt1La - 0.05)
        : false;
      if (hasHigherPowerLowerLa) {
        const targetLt1La = Math.min(MAX_LTP1_LACTATE, Math.max(MIN_LTP1_LACTATE, Number(effectiveBaseLactate) + 0.5));
        const targetLt2La = Math.max(targetLt1La + 0.4, Number(effectiveBaseLactate) + 1.5);
        const pLt1 = interpolatePowerAtLactateFinal(targetLt1La);
        if (pLt1 && Number.isFinite(Number(pLt1.power))) {
          thresholds['LTP1'] = Number(pLt1.power);
          thresholds.lactates['LTP1'] = targetLt1La;
          thresholds.heartRates['LTP1'] = pLt1.heartRate != null ? Number(pLt1.heartRate) : thresholds.heartRates['LTP1'];
        }

        const minLt2PowerFromLt1 = Number(thresholds['LTP1']) + MIN_LT2_LT1_GAP_W;
        const pLt2Base = interpolatePowerAtLactateFinal(targetLt2La);
        let finalLt2 = null;
        if (pLt2Base && Number.isFinite(Number(pLt2Base.power)) && Number(pLt2Base.power) >= minLt2PowerFromLt1) {
          finalLt2 = pLt2Base;
        } else {
          finalLt2 = interpolateAtPowerFinal(minLt2PowerFromLt1);
          if (!finalLt2) {
            const higher = sortedResults.find((r) => Number(r.power) >= minLt2PowerFromLt1);
            if (higher) {
              finalLt2 = {
                power: Number(higher.power),
                lactate: Number(higher.lactate),
                heartRate: higher.heartRate != null ? Number(higher.heartRate) : null
              };
            }
          }
        }
        if (finalLt2 && Number.isFinite(Number(finalLt2.power))) {
          thresholds['LTP2'] = Number(finalLt2.power);
          thresholds.lactates['LTP2'] = Number.isFinite(Number(finalLt2.lactate))
            ? Math.max(targetLt2La, Number(finalLt2.lactate))
            : targetLt2La;
          thresholds.heartRates['LTP2'] = finalLt2.heartRate != null ? Number(finalLt2.heartRate) : thresholds.heartRates['LTP2'];
        }
      }
    }

    // Internal confidence (po všech krocích vč. sladění LTP2 s polynomem u run/swim — jinak by se lišilo od tabulky)
    if (Number.isFinite(Number(thresholds['LTP1'])) && Number.isFinite(Number(thresholds['LTP2']))) {
      const isPaceSportNow = sport === 'run' || sport === 'swim';
      const confidence = estimateThresholdConfidence({
        ltp1: thresholds['LTP1'],
        ltp2: thresholds['LTP2'],
        candidates: [thresholds['IAT'], thresholds['OBLA 3.5']],
        isPaceSport: isPaceSportNow,
        pointsCount: sortedResults.length,
        hasHR: sortedResults.some((r) => Number.isFinite(Number(r.heartRate))),
      });
      thresholds.confidence = confidence;
      dbgLog('[calculateThresholds] LT confidence (finální, po sladění s křivkou u pace)', {
        confidence,
        ltp1: thresholds['LTP1'],
        ltp2: thresholds['LTP2'],
        sport,
        testId: mockData?._id || null,
        testTitle: mockData?.title || null,
        note:
          'U běhu/plavání se LTP2 tempo po ensemblu ještě přemapuje na polynom při stejném La — proto dřívější log mohl mít jiné ltp2 než finální řádek.',
      });
    }

    // ── Pace/run final guard: LT1 must not sit on a spike that drops on the next step,
    // nor above the aerobic band, when a faster step has clearly lower lactate.
    if ((sport === 'run' || sport === 'swim')
      && Number.isFinite(Number(thresholds['LTP1']))
      && Number.isFinite(Number(thresholds.lactates?.['LTP1']))) {
      const sortedDesc = [...sortedResults].sort((a, b) => Number(b.power) - Number(a.power));
      const lt1P = Number(thresholds['LTP1']);
      const lt1La = Number(thresholds.lactates['LTP1']);
      const lt1Idx = sortedDesc.findIndex((r) => Math.abs(Number(r.power) - lt1P) <= 6);
      const onSpike = lt1Idx >= 0 && isSpikeThenDropOutlier(sortedDesc, lt1Idx);
      const hasFasterLowerLa = sortedDesc.some(
        (r) => Number(r.power) < lt1P - 1e-9 && Number(r.lactate) < lt1La - 0.25
      );
      const laTooHigh = lt1La > MAX_LTP1_LACTATE_PACE + 0.05;

      if (onSpike || hasFasterLowerLa || laTooHigh) {
        const repaired =
          pickLt1PaceFirstRiseAfterMin(sortedResults)
          || pickLt1FromMeasuredStepsForPace(sortedResults, effectiveBaseLactate, 1.75)
          || pickLtp1PointSkippingFalseStarts(sortedDesc, effectiveBaseLactate, MAX_LTP1_LACTATE_PACE);

        if (repaired && Number.isFinite(Number(repaired.power))) {
          const interpHRAtPace = (x) => {
            for (let i = 0; i < sortedResults.length - 1; i++) {
              const a = Number(sortedResults[i].power);
              const b = Number(sortedResults[i + 1].power);
              if (x >= Math.min(a, b) && x <= Math.max(a, b) && a !== b) {
                const ha = sortedResults[i].heartRate;
                const hb = sortedResults[i + 1].heartRate;
                if (ha != null && hb != null) return ha + (hb - ha) * (x - a) / (b - a);
                return ha ?? hb;
              }
            }
            const nearest = sortedResults.reduce((best, r) =>
              Math.abs(Number(r.power) - x) < Math.abs(Number(best.power) - x) ? r : best
            );
            return nearest.heartRate != null ? Number(nearest.heartRate) : null;
          };

          let p1 = Number(repaired.power);
          let la1 = Math.min(Math.max(Number(repaired.lactate), MIN_LTP1_LACTATE), MAX_LTP1_LACTATE_PACE);
          const lt2P = Number(thresholds['LTP2']);
          if (Number.isFinite(lt2P) && p1 - lt2P < MIN_LT2_LT1_GAP_PACE_SEC) {
            const relaxed = relaxPaceLt1IfSqueezedAgainstLt2(sortedResults, p1, la1, lt2P);
            if (relaxed) {
              p1 = Number(relaxed.power);
              la1 = Number(relaxed.lactate);
            }
          }

          thresholds['LTP1'] = p1;
          thresholds.lactates['LTP1'] = la1;
          const hr1 = repaired.heartRate != null && Number.isFinite(Number(repaired.heartRate))
            ? Number(repaired.heartRate)
            : interpHRAtPace(p1);
          if (hr1 != null && Number.isFinite(hr1)) thresholds.heartRates['LTP1'] = hr1;
        }
      }
    }

    // ── Manual override: if coach/athlete pinned LT1 or LT2, apply now ──────────
    const ovr = mockData?.thresholdOverrides;
    if (ovr) {
      // Interpolate HR from measured data at a given pace (seconds) / watts value
      const interpHRAtX = (x) => {
        if (!sortedResults || sortedResults.length < 2) return null;
        const pts = [...sortedResults].sort((a, b) => Number(a.power) - Number(b.power));
        if (x <= pts[0].power) return pts[0].heartRate != null ? Number(pts[0].heartRate) : null;
        if (x >= pts[pts.length - 1].power) {
          const last = pts[pts.length - 1];
          return last.heartRate != null ? Number(last.heartRate) : null;
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const lo = Number(pts[i].power), hi = Number(pts[i + 1].power);
          if (x >= lo && x <= hi && lo !== hi) {
            const ha = pts[i].heartRate != null ? Number(pts[i].heartRate) : null;
            const hb = pts[i + 1].heartRate != null ? Number(pts[i + 1].heartRate) : null;
            const t = (x - lo) / (hi - lo);
            if (ha != null && hb != null) return Math.round(ha + (hb - ha) * t);
            return ha ?? hb ?? null;
          }
        }
        return null;
      };

      if (!thresholds.lactates) thresholds.lactates = {};
      if (!thresholds.heartRates) thresholds.heartRates = {};

      if (ovr.LTP1 != null && Number.isFinite(Number(ovr.LTP1))) {
        thresholds['LTP1'] = Number(ovr.LTP1);
        // Apply saved lactate override
        if (ovr.LTP1_lactate != null && Number.isFinite(Number(ovr.LTP1_lactate))) {
          thresholds.lactates['LTP1'] = Number(ovr.LTP1_lactate);
        }
        // Derive HR from measured data at the override position
        const hr1 = interpHRAtX(Number(ovr.LTP1));
        if (hr1 != null) thresholds.heartRates['LTP1'] = hr1;
      }
      if (ovr.LTP2 != null && Number.isFinite(Number(ovr.LTP2))) {
        thresholds['LTP2'] = Number(ovr.LTP2);
        if (ovr.LTP2_lactate != null && Number.isFinite(Number(ovr.LTP2_lactate))) {
          thresholds.lactates['LTP2'] = Number(ovr.LTP2_lactate);
        }
        const hr2 = interpHRAtX(Number(ovr.LTP2));
        if (hr2 != null) thresholds.heartRates['LTP2'] = hr2;
      }
    }

    // ── LT2 upper-bound guard against polynomial overshoot ─────────────────
    // The cap chain above (MAX_LTP2_LACTATE, adaptiveLtp2Cap) checks the
    // POLYNOMIAL lactate at LT2. On tests with a flat aerobic baseline and a
    // sharp explosive finish (4.2 → 6.3 mmol in the last 10 sec/km), the
    // polynomial smooths the curve so much that poly@LT2 fits under the 4.2
    // cap even though RAW lactate at that pace is well above 5 mmol —
    // physiologically already VO2max territory, not LT2. Detect this by
    // checking the RAW interpolated lactate at the chosen LT2 and rewind to
    // OBLA 4.0 (or the slowest pace whose raw lactate ≤ 4.0) when it exceeds
    // 5.0 mmol.
    try {
      const rawLactateAtPowerForGuard = (P) => {
        if (!Number.isFinite(P)) return null;
        const pairs = (sortedResults || [])
          .map((r) => ({ p: Number(r.power), l: Number(r.lactate) }))
          .filter((x) => Number.isFinite(x.p) && Number.isFinite(x.l))
          .sort((a, b) => a.p - b.p);
        if (pairs.length === 0) return null;
        for (let i = 0; i < pairs.length - 1; i++) {
          const a = pairs[i];
          const b = pairs[i + 1];
          if (P >= a.p && P <= b.p && b.p !== a.p) {
            return a.l + (b.l - a.l) * (P - a.p) / (b.p - a.p);
          }
        }
        if (P <= pairs[0].p) return pairs[0].l;
        if (P >= pairs[pairs.length - 1].p) return pairs[pairs.length - 1].l;
        return null;
      };
      const findPowerAtRawLactate = (targetLa) => {
        const pairs = (sortedResults || [])
          .map((r) => ({ p: Number(r.power), l: Number(r.lactate) }))
          .filter((x) => Number.isFinite(x.p) && Number.isFinite(x.l))
          .sort((a, b) => a.p - b.p);
        for (let i = 0; i < pairs.length - 1; i++) {
          const a = pairs[i];
          const b = pairs[i + 1];
          if ((targetLa >= a.l && targetLa <= b.l) || (targetLa >= b.l && targetLa <= a.l)) {
            if (b.l === a.l) return (a.p + b.p) / 2;
            return a.p + (b.p - a.p) * (targetLa - a.l) / (b.l - a.l);
          }
        }
        return null;
      };
      const LT2_RAW_CAP = 5.0;
      const LT2_RAW_TARGET = 4.0;
      const lt2X = Number(thresholds['LTP2']);
      if (Number.isFinite(lt2X)) {
        const rawLa = rawLactateAtPowerForGuard(lt2X);
        if (Number.isFinite(rawLa) && rawLa > LT2_RAW_CAP) {
          const replacementPower = findPowerAtRawLactate(LT2_RAW_TARGET);
          if (Number.isFinite(replacementPower)) {
            // Honour the LT1 gap constraint so we don't collapse onto LT1.
            const lt1X = Number(thresholds['LTP1']);
            const isPaceSport = sport === 'run' || sport === 'swim';
            const minGap = isPaceSport ? 10 : MIN_LT2_LT1_GAP_W;
            const gapOk = !Number.isFinite(lt1X) ||
              (isPaceSport ? (lt1X - replacementPower) >= minGap
                           : (replacementPower - lt1X) >= minGap);
            if (gapOk) {
              console.warn(`[calculateThresholds] LT2 upper-guard: raw lactate at LT2 (${lt2X}) was ${rawLa.toFixed(2)} mmol — replacing with OBLA 4.0 at ${replacementPower}.`);
              thresholds['LTP2'] = replacementPower;
              thresholds.lactates['LTP2'] = LT2_RAW_TARGET;
              // Re-interpolate HR for the new LT2 power.
              for (let i = 0; i < sortedResults.length - 1; i++) {
                const a = sortedResults[i];
                const b = sortedResults[i + 1];
                const pa = Number(a.power);
                const pb = Number(b.power);
                const lo = Math.min(pa, pb);
                const hi = Math.max(pa, pb);
                if (replacementPower >= lo && replacementPower <= hi && pa !== pb) {
                  const hrA = a.heartRate != null ? Number(a.heartRate) : null;
                  const hrB = b.heartRate != null ? Number(b.heartRate) : null;
                  if (hrA != null && hrB != null) {
                    thresholds.heartRates['LTP2'] = hrA + (hrB - hrA) * (replacementPower - pa) / (pb - pa);
                  }
                  break;
                }
              }
            }
          }
        }
      }
    } catch (_) {
      // Non-fatal: leave LT2 as-is if the guard blew up.
    }

    // ── Displayed-lactate override ──────────────────────────────────────────
    // The lactate values stored in thresholds.lactates['LTP1'/'LTP2'] currently
    // come from the polynomial fit (polyFn). On real tests this routinely
    // disagrees with what the user sees on the chart — e.g. Schäftlarn bike
    // showed "LT2 = 208 W → La 2.20" while raw data at 202/221 W is 0.8/0.9.
    // The polynomial smooths neighbouring points UP, but for REPORTING the
    // user expects the same number they'd read off the dots.
    //
    // We therefore re-derive the displayed La from a raw linear interpolation
    // between the two adjacent measured points, ONLY when the polynomial
    // value disagrees with raw by >0.6 mmol/L. Small disagreements (where the
    // poly is slightly above/below the noisy raw) are left alone — the poly
    // is then closer to the "true" steady-state lactate.
    try {
      const rawLactateAtPower = (P) => {
        if (!Number.isFinite(P)) return null;
        const pairs = (sortedResults || [])
          .map((r) => ({ p: Number(r.power), l: Number(r.lactate) }))
          .filter((x) => Number.isFinite(x.p) && Number.isFinite(x.l))
          .sort((a, b) => a.p - b.p);
        if (pairs.length === 0) return null;
        for (let i = 0; i < pairs.length - 1; i++) {
          const a = pairs[i];
          const b = pairs[i + 1];
          if (P >= a.p && P <= b.p && b.p !== a.p) {
            return a.l + (b.l - a.l) * (P - a.p) / (b.p - a.p);
          }
        }
        if (P <= pairs[0].p) return pairs[0].l;
        if (P >= pairs[pairs.length - 1].p) return pairs[pairs.length - 1].l;
        return null;
      };
      ['LTP1', 'LTP2'].forEach((key) => {
        const xVal = Number(thresholds[key]);
        const polyLa = Number(thresholds.lactates?.[key]);
        if (!Number.isFinite(xVal)) return;
        const rawLa = rawLactateAtPower(xVal);
        if (!Number.isFinite(rawLa)) return;
        if (!Number.isFinite(polyLa) || Math.abs(polyLa - rawLa) > 0.6) {
          thresholds.lactates[key] = rawLa;
        }
      });
    } catch (_) {
      // Non-fatal: keep polynomial values if the raw override blew up.
    }

    if (isThresholdDebugEnabled()) {
      console.groupCollapsed('[LaChart] calculateThresholds — finální LTP1/LTP2 (po všech guardách)');
      const r4 = (x) => (x == null || !Number.isFinite(Number(x)) ? x : Number(Number(x).toFixed(4)));
      console.log({
        sport,
        testId: mockData?._id || null,
        testTitle: mockData?.title || null,
        LTP1_W: r4(thresholds['LTP1']),
        LTP2_W: r4(thresholds['LTP2']),
        LTP1_La_mmol: r4(thresholds.lactates?.['LTP1']),
        LTP2_La_mmol: r4(thresholds.lactates?.['LTP2']),
      });
      console.log(
        'Shrnutí limitů: LT1 kolo max ' +
          MAX_LTP1_LACTATE +
          ' mmol/L, běh/plavání z kroků max ' +
          MAX_LTP1_LACTATE_PACE +
          ' mmol/L. LT2 nad capem: nejdřív La ≈ adaptivní cap na křivce, pak případně blend ' +
          OBLA_LT2_BLEND_LACTATE_MMOL +
          ' mmol/L; u kola min. odstup LT2−LT1 ≥ ' +
          MIN_LT2_LT1_GAP_W +
          ' W a často min. La u LT2 ≥ 3.2 mmol/L.'
      );
      console.groupEnd();
    }
  
    return thresholds;
  };
  
  // Zkrácené a výstižnější popisy metod
  const methodDescriptions = {
    'Log-log': `A mathematical method that identifies the anaerobic threshold by plotting lactate values against 
    power/pace on logarithmic scales. The deflection point in this transformed curve represents 
    the transition between aerobic and anaerobic metabolism.`,
    
    'IAT': `Individual Anaerobic Threshold (IAT) is determined by finding the point of maximum lactate 
    increase relative to power/pace increase. This method accounts for individual metabolic responses 
    and is particularly useful for trained athletes.`,
    
    'OBLA 2.0': `Onset of Blood Lactate Accumulation at 2.0 mmol/L. This fixed threshold typically represents 
    the aerobic threshold and is often used to determine the upper limit of low-intensity training zones. 
    Particularly suitable for endurance training.`,
    
    'OBLA 2.5': `Fixed lactate threshold at 2.5 mmol/L, representing a moderate-intensity marker. This level 
    often corresponds to the intensity that can be sustained for longer endurance events and serves as 
    a reference point for tempo training.`,
    
    'OBLA 3.0': `A fixed threshold at 3.0 mmol/L, commonly used to approximate the anaerobic threshold in 
    endurance athletes. This intensity typically represents the upper limit of steady-state exercise 
    and is useful for determining threshold training zones.`,
    
    'OBLA 3.5': `Fixed threshold at 3.5 mmol/L, typically used for well-trained athletes who show lactate 
    deflection points at higher concentrations. This level often corresponds to high-intensity interval 
    training zones.`,
    
    'Bsln + 0.5': `An individualized method that identifies the power/pace where lactate rises 0.5 mmol/L 
    above the athlete's baseline. This approach accounts for individual variations in resting lactate 
    levels and metabolic efficiency.`,
    
    'Bsln + 1.0': `Power/pace where lactate is 1.0 mmol/L above individual baseline. This threshold often 
    corresponds to moderate-intensity training zones and provides a personalized reference point for 
    training intensity.`,
    
    'Bsln + 1.5': `Identifies the point where lactate is 1.5 mmol/L above baseline. This higher threshold 
    typically indicates the transition to more intensive training zones and helps define upper limits 
    of steady-state exercise.`,
    
    'LTP1': `First Lactate Turn Point (LTP1) is identified using the D-max method on the first portion 
    of the lactate curve. It represents the aerobic threshold and the transition from low to moderate 
    exercise intensity. (Hofmann & Tschakert, 2017)
    
    **How it's calculated:** The D-max method finds the point with the maximum perpendicular distance 
    from a straight line connecting the first and last points of the curve segment.
    
    **Important notes:** 
    - Results are estimates and may vary based on test protocol and individual physiology
    - If LTP1 seems too low or high, consider using fixed thresholds (e.g., OBLA 2.0, Bsln + 0.5) 
      or consult with a sports scientist
    - For training zones, you may find that fixed lactate values (e.g., OBLA 3.5) provide more 
      consistent and practical guidance`,
    
    'LTP2': `Second Lactate Turn Point (LTP2) is determined using the D-max method on the entire lactate 
    curve or the second half. It marks the anaerobic threshold and represents the highest sustainable 
    steady-state exercise intensity. (Hofmann & Tschakert, 2017)
    
    **How it's calculated:** The D-max method finds the point with the maximum perpendicular distance 
    from a straight line connecting the first and last points of the curve. For LTP2, we focus on 
    the second half of the curve where lactate values are typically 3.5-5.0 mmol/L.
    
    **Important notes:**
    - Results are estimates and may not always match your perceived threshold
    - If LTP2 seems too low (e.g., 2.9 mmol/L) but OBLA 3.5 shows a faster pace that feels more 
      appropriate, consider using OBLA 3.5 for your training zones
    - Fixed thresholds (OBLA 3.0, OBLA 3.5) often provide more practical and consistent guidance 
      for interval training, especially for well-trained athletes
    - The D-max method can be sensitive to test protocol and data quality - always compare with 
      other methods and your subjective perception`,
    
    'LTRatio': `The ratio between LTP2 and LTP1 powers/paces (typically 1.15-1.25). This metric helps 
    monitor training adaptations and assess the relationship between aerobic and anaerobic thresholds 
    over time.`
  };
  
  // Context pro správu aktivního tooltipu
  const TooltipContext = createContext();

  // Provider pro tooltip context
  const TooltipProvider = ({ children }) => {
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [isLocked, setIsLocked] = useState(false);

    return (
      <TooltipContext.Provider value={{ activeTooltip, setActiveTooltip, isLocked, setIsLocked }}>
        {children}
      </TooltipContext.Provider>
    );
  };

  // Vlastní jednoduchý Tooltip komponent – renderuje přes portal na document.body,
  // takže není oříznutý žádným overflow-x-auto kontejnerem.
  const CustomTooltip = ({ children, title, methodName }) => {
    const triggerRef = useRef(null);
    const tooltipNodeRef = useRef(null);
    const { activeTooltip, setActiveTooltip, isLocked, setIsLocked } = useContext(TooltipContext);
    const isVisible = activeTooltip === methodName;
    const [coords, setCoords] = useState({ top: 0, left: 0, arrowTop: 0, side: 'right' });

    // Spočítat polohu tooltippu podle triggeru
    const recalcCoords = useCallback(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipW = 300;
      const viewportW = window.innerWidth;
      // Preferovat pravou stranu; pokud se nevejde, jít doleva
      const spaceRight = viewportW - rect.right;
      const side = spaceRight >= tooltipW + 12 ? 'right' : 'left';
      const left = side === 'right'
        ? rect.right + 8
        : rect.left - tooltipW - 8;
      // Vertikálně zarovnat na střed triggeru, nepřetékat přes viewport
      const centerY = rect.top + rect.height / 2;
      const tooltipH = tooltipNodeRef.current?.offsetHeight || 200;
      const maxTop = window.innerHeight - tooltipH - 8;
      const top = Math.max(8, Math.min(centerY - tooltipH / 2, maxTop));
      // Šipka: relativní pozice od top tooltipu ke středu triggeru
      const arrowTop = centerY - top;
      setCoords({ top, left, arrowTop, side });
    }, []);

    // Přepočítat při každém otevření a při scrollu/resize
    useEffect(() => {
      if (!isVisible) return;
      recalcCoords();
      window.addEventListener('scroll', recalcCoords, true);
      window.addEventListener('resize', recalcCoords);
      return () => {
        window.removeEventListener('scroll', recalcCoords, true);
        window.removeEventListener('resize', recalcCoords);
      };
    }, [isVisible, recalcCoords]);

    // Zavřít při kliknutí mimo
    useEffect(() => {
      if (!isVisible || !isLocked) return;
      const handleClickOutside = (e) => {
        const clickedTrigger = triggerRef.current?.contains(e.target);
        const clickedTooltip = tooltipNodeRef.current?.contains(e.target);
        if (!clickedTrigger && !clickedTooltip) {
          setActiveTooltip(null);
          setIsLocked(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isVisible, isLocked, setActiveTooltip, setIsLocked]);

    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isVisible) {
        setActiveTooltip(null);
        setIsLocked(false);
      } else {
        setActiveTooltip(methodName);
        setIsLocked(true);
      }
    };

    const handleMouseEnter = () => {
      if (!isLocked) setActiveTooltip(methodName);
    };

    const handleMouseLeave = (e) => {
      if (isLocked) return;
      // Don't hide if the cursor moved onto the tooltip itself.
      // e.relatedTarget can be null (leaving the window) or non-Node
      // (synthetic / SVG cases) — Node.contains() throws on non-Node args.
      const related = e.relatedTarget;
      if (related instanceof Node && tooltipNodeRef.current?.contains(related)) return;
      setActiveTooltip(null);
    };

    const tooltipContent = isVisible ? ReactDOM.createPortal(
      <div
        ref={tooltipNodeRef}
        onMouseLeave={() => { if (!isLocked) setActiveTooltip(null); }}
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          width: 300,
          zIndex: 9999,
        }}
      >
        <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
          {/* Šipka */}
          <div
            style={{
              position: 'absolute',
              top: Math.max(8, coords.arrowTop - 8),
              ...(coords.side === 'right'
                ? { left: -8, borderRight: '8px solid white', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', width: 0, height: 0 }
                : { right: -8, borderLeft: '8px solid white', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', width: 0, height: 0 }
              ),
            }}
          />
          {/* Nadpis */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-gray-800 font-semibold tracking-wide text-sm">{methodName}</h3>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTooltip(null); setIsLocked(false); }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          {/* Obsah */}
          <div className="p-4">
            <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
              {title.split('**').map((part, index) => {
                if (index % 2 === 1) {
                  return <strong key={index} className="font-semibold text-gray-800">{part}</strong>;
                }
                return <span key={index}>{part}</span>;
              })}
            </div>
          </div>
          {/* Reference */}
          {(methodName === 'LTP1' || methodName === 'LTP2') && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-500 italic">Reference: Hofmann & Tschakert, 2017</p>
            </div>
          )}
        </div>
      </div>,
      document.body
    ) : null;

    return (
      <div
        ref={triggerRef}
        className="relative cursor-pointer"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {tooltipContent}
      </div>
    );
  };
  
  const TableCell = ({ children, isHeader, description, methodName }) => {
    const baseClasses = "py-1 md:pl-5 md:pr-4 sm:pr-2 sm:pl-2  w-full border-b border-gray-200";
    const headerClasses = isHeader ? "text-sm font-semibold text-gray-900 bg-white border-t" : "";
    
    if (description) {
      return (
        <CustomTooltip title={description} methodName={methodName}>
          <div className={`${baseClasses} ${headerClasses} cursor-help`}>
            {children}
          </div>
        </CustomTooltip>
      );
    }
  
    return (
      <div className={`${baseClasses} ${headerClasses}`}>
        {children}
      </div>
    );
  };
  
  const DataTable = ({ mockData }) => {
    const [showInfoBox, setShowInfoBox] = useState(false);
    
    // Get user from context for unitSystem
    let user = null;
    try {
      const authHook = useAuth();
      user = authHook?.user;
    } catch (e) {
      // If useAuth hook is not available (e.g., outside AuthProvider), continue without it
    }
    
    const thresholds = calculateThresholds(mockData);
    let sport = mockData?.sport || 'bike';
    const sLow = String(sport).toLowerCase();
    if (sLow === 'cycling' || sLow === 'cycle') sport = 'bike';
    else if (sLow === 'running') sport = 'run';
    else if (sLow === 'swimming') sport = 'swim';
    const unitSystem = resolveDistanceUnitSystem(user, mockData?.unitSystem || 'metric');
    const storageMode = getEffectiveLactateInputMode(mockData);
    const displayMode = getLactateDisplayMode(mockData, user);
    const rawTestUnit = String(mockData?.unitSystem ?? '').trim().toLowerCase();
    const testRunPerMileStorage =
      sport === 'run' &&
      (rawTestUnit === 'imperial' ||
        rawTestUnit === 'us' ||
        rawTestUnit === 'mile' ||
        rawTestUnit === 'miles' ||
        rawTestUnit === 'mi' ||
        rawTestUnit === 'mph');
  
    // Seznam metod, včetně Log-log
    const methods = [
      'Log-log',
      ...Object.keys(thresholds).filter(k =>
        k !== 'Log-log' &&
        k !== 'heartRates' &&
        k !== 'lactates' &&
        k !== 'testAnalysis'
      )
    ];
  
    // Definice sloupců (Method, Power/Pace, HR, La)
    const columns = [
      {
        header: 'Method',
        data: methods,
        descriptions: methods.map(method => methodDescriptions[method])
      },
      {
        header: sport === 'bike' ? 'Pwr (W)' : 
                (sport === 'run' || sport === 'swim') ? 
                  (displayMode === 'pace' ? 
                    (sport === 'swim' ? 
                      (unitSystem === 'imperial' ? 'Pace (/100yd)' : 'Pace (/100m)') :
                      (unitSystem === 'imperial' ? 'Pace(/mile)' : 'Pace(/km)')
                    ) :
                    (unitSystem === 'imperial' ? 'Speed(mph)' : 'Speed(km/h)')
                  ) : 'Pace (km)',
        data: methods.map((method) => {
          // LTRatio je poměr, ne hodnota power/pace, takže ho nezobrazovat v tomto sloupci
          if (method === 'LTRatio') {
            return 'N/A';
          }
          const value = thresholds[method];
          return value
            ? formatPowerOrPace(value, sport, unitSystem, displayMode, {
                testRunPerMileStorage,
                dataIsSpeed: storageMode === 'speed',
              })
            : 'N/A';
        })
      },
      {
        header: 'HR (bpm)',
        data: methods.map((method) => {
          // LTRatio nemá HR hodnotu
          if (method === 'LTRatio') {
            return 'N/A';
          }
          return thresholds.heartRates[method]
            ? Math.round(thresholds.heartRates[method])
            : 'N/A';
        })
      },
      {
        header: 'La (mmol) ',
        data: methods.map((method) => {
          // LTRatio je poměr, zobrazit ho v tomto sloupci jako poměr
          if (method === 'LTRatio') {
            const ratio = thresholds[method];
            if (ratio && typeof ratio === 'string') {
              // Zkontrolovat, že ratio je v rozumném rozsahu (1.0-3.0)
              const ratioNum = parseFloat(ratio);
              if (!isNaN(ratioNum) && ratioNum >= 1.0 && ratioNum <= 3.0) {
                return ratio;
              }
            }
            return 'N/A';
          }
          const value = thresholds.lactates[method];
          return value && typeof value === 'number' && !isNaN(value)
            ? value.toFixed(2)
            : 'N/A';
        })
      }
    ];
  
    return (
      <TooltipProvider>
        <div className="flex flex-col items-start w-full max-w-[400px] text-sm gap-3">
          {/* Info box about threshold interpretation */}
          {(thresholds['LTP1'] || thresholds['LTP2']) && (
            <>
              {!showInfoBox && (
                <button
                  onClick={() => setShowInfoBox(true)}
                  className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                  aria-label="Show info about threshold values"
                  title="Show info"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">Understanding Threshold Values</span>
                </button>
              )}
              {showInfoBox && (
            <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs relative">
              <button
                onClick={() => setShowInfoBox(false)}
                className="absolute top-2 right-2 text-blue-600 hover:text-blue-800 transition-colors"
                aria-label="Close info box"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="font-semibold text-blue-900 mb-1 flex items-center gap-1 pr-6">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Understanding Threshold Values
              </div>
              <div className="text-blue-800 space-y-1">
                <p>
                  <strong>LTP1 and LTP2 are calculated estimates</strong> using the D-max method. 
                  Results may vary based on test protocol, data quality, and individual physiology.
                </p>
                <p>
                  <strong>Practical guidance:</strong> If LTP2 seems too low but OBLA 3.5 shows a 
                  faster pace that feels more appropriate for your training, consider using OBLA 3.5 
                  for interval training zones. Fixed thresholds (OBLA 2.0, 2.5, 3.0, 3.5) often 
                  provide more consistent and practical guidance.
                </p>
                <p>
                  <strong>Always compare</strong> multiple methods and use the value that best 
                  matches your perceived effort and training goals.
                </p>
              </div>
            </div>
              )}
            </>
          )}
          
          <div className="w-full overflow-x-auto -mx-1 px-1">
            <div style={{ minWidth: '280px' }}>
            <div className="grid grid-cols-4">
              {columns.map((column, colIndex) => (
                <div key={`hdr-${colIndex}`} className="min-w-[64px]">
                  <TableCell isHeader>{column.header}</TableCell>
                </div>
              ))}
            </div>
            {methods.map((method, rowIndex) => {
              const methodDescription = columns[0]?.descriptions?.[rowIndex];
              const pwrValue = columns[1]?.data?.[rowIndex] ?? 'N/A';
              const hrValue = columns[2]?.data?.[rowIndex] ?? 'N/A';
              const laValue = columns[3]?.data?.[rowIndex] ?? 'N/A';
              return (
                <div key={`row-${method}-${rowIndex}`} className="grid grid-cols-4">
                  <div className="min-w-[64px]">
                    <TableCell description={methodDescription} methodName={method}>
                      {method}
                    </TableCell>
                  </div>
                  <div className="min-w-[64px]">
                    <TableCell>{pwrValue}</TableCell>
                  </div>
                  <div className="min-w-[64px]">
                    <TableCell>{hrValue}</TableCell>
                  </div>
                  <div className="min-w-[64px]">
                    <TableCell>{laValue}</TableCell>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  };
  
  // Pomocné funkce pro formátování
  const formatSecondsToMMSS = (seconds) => {
    if (!seconds || isNaN(seconds)) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPowerOrPace = (
    value,
    sport,
    unitSystem = 'metric',
    inputMode = 'pace',
    extras = {}
  ) => {
    if (!value || value === 'N/A') return 'N/A';
    const testRunPerMileStorage = extras.testRunPerMileStorage === true;
    
    if (sport === 'bike') {
      return `${Math.round(value)} W`;
    } else if (sport === 'run' || sport === 'swim') {
      const dataIsSpeed = extras.dataIsSpeed === true;
      if (inputMode === 'pace') {
        const KM_PER_MILE = 1.609344;
        const M_PER_YARD = 0.9144;
        let displaySeconds = Number(value);
        if (dataIsSpeed) {
          const kmh = displaySeconds;
          displaySeconds = sport === 'swim' ? 360 / kmh : 3600 / kmh;
        }
        const displayImperial = unitSystem === 'imperial';
        if (!dataIsSpeed) {
          if (sport === 'swim') {
            if (displayImperial) displaySeconds = displaySeconds * M_PER_YARD;
          } else {
            if (displayImperial && !testRunPerMileStorage) displaySeconds = displaySeconds * KM_PER_MILE;
            if (!displayImperial && testRunPerMileStorage) displaySeconds = displaySeconds / KM_PER_MILE;
          }
        } else if (sport === 'run' && displayImperial && !testRunPerMileStorage) {
          displaySeconds = displaySeconds * KM_PER_MILE;
        }
        const paceStr = formatSecondsToMMSS(displaySeconds);
        if (sport === 'swim') {
          const unit = unitSystem === 'imperial' ? '/100yd' : '/100m';
          return `${paceStr}${unit}`;
        }
        const unit = unitSystem === 'imperial' ? '/mile' : '/km';
        return `${paceStr}${unit}`;
      }
      if (dataIsSpeed) {
        const kmh = Number(value);
        if (unitSystem === 'imperial') {
          return `${(kmh * 0.621371).toFixed(1)} mph`;
        }
        return `${kmh.toFixed(1)} km/h`;
      }
      const s = Number(value);
      if (sport === 'swim') {
        const kmh = 360 / s;
        if (unitSystem === 'imperial') {
          return `${(kmh * 0.621371).toFixed(1)} mph`;
        }
        return `${kmh.toFixed(1)} km/h`;
      }
      const speedOut = 3600 / s;
      if (unitSystem === 'imperial') {
        return `${speedOut.toFixed(1)} mph`;
      }
      return `${speedOut.toFixed(1)} km/h`;
    }
    return 'N/A';
  };
  
  const calculatePolynomialRegression = (results) => {
    if (!results || !Array.isArray(results) || results.length < 4) return [];
    const xVals = results.map(r => Number(String(r.power ?? '').replace(',', '.')));
    const yVals = results.map(r => Number(String(r.lactate ?? '').replace(',', '.')));
    if (xVals.some(v => isNaN(v)) || yVals.some(v => isNaN(v))) return [];
    const distinctX = new Set(xVals).size;
    if (distinctX < 4) return []; // cubic needs at least 4 distinct x values

    // Log-linear transform: fit cubic polynomial on log(lactate) for better accuracy.
    // Lactate curves are exponential in nature — log-space fit avoids overshoot artefacts.
    const allPositive = yVals.every(v => v > 0);
    const fitYVals = allPositive ? yVals.map(v => Math.log(v)) : yVals;

    try {
    const polyRegression = (() => {
      const n = xVals.length;
      const X = [];
      const Y = [];
      for (let i = 0; i < n; i++) {
        X.push([1, xVals[i], Math.pow(xVals[i], 2), Math.pow(xVals[i], 3)]);
        Y.push(fitYVals[i]);
      }
      const XT = math.transpose(X);
      const XTX = math.multiply(XT, X);
      const XTY = math.multiply(XT, Y);
      const coefficients = math.lusolve(XTX, XTY).flat();
      const rawFn = (x) =>
        coefficients[0] +
        coefficients[1] * x +
        coefficients[2] * Math.pow(x, 2) +
        coefficients[3] * Math.pow(x, 3);
      // Back-transform from log space if we fitted on log(lactate)
      return allPositive ? (x) => Math.exp(rawFn(x)) : rawFn;
    })();

    const minPower = Math.min(...xVals);
    const maxPower = Math.max(...xVals);
      const step = Math.max((maxPower - minPower) / 100, 1e-6);
    const polyPoints = [];
    for (let x = minPower; x <= maxPower; x += step) {
        const y = polyRegression(x);
        if (isNaN(y) || !isFinite(y)) continue;
        polyPoints.push({ x, y: Math.max(0, y) });
    }
    return polyPoints;
    } catch (e) {
      console.warn('[DataTable] Polynomial regression failed (singular matrix or invalid data):', e?.message);
      return [];
    }
  };

  /** Polynomial regression for HR vs lactate (x = heartRate bpm, y = lactate). Uses only results with valid heartRate. */
  const calculatePolynomialRegressionHR = (results) => {
    if (!results || !Array.isArray(results)) return [];
    const valid = results.filter(r => {
      const hr = r.heartRate;
      if (hr == null || hr === '') return false;
      const lactate = r.lactate;
      if (lactate == null || lactate === '') return false;
      const hrNum = Number(String(hr).replace(',', '.'));
      const laNum = Number(String(lactate).replace(',', '.'));
      return !isNaN(hrNum) && hrNum >= 40 && hrNum <= 220 && !isNaN(laNum);
    });
    if (valid.length < 4) return [];
    const xVals = valid.map(r => Number(String(r.heartRate).replace(',', '.')));
    const yVals = valid.map(r => Number(String(r.lactate).replace(',', '.')));
    if (new Set(xVals).size < 4) return [];
    try {
    const n = xVals.length;
    const X = [];
    const Y = [];
    for (let i = 0; i < n; i++) {
      X.push([1, xVals[i], Math.pow(xVals[i], 2), Math.pow(xVals[i], 3)]);
      Y.push(yVals[i]);
    }
    const XT = math.transpose(X);
    const XTX = math.multiply(XT, X);
    const XTY = math.multiply(XT, Y);
    const coefficients = math.lusolve(XTX, XTY).flat();
    const polyRegression = (x) =>
      coefficients[0] + coefficients[1] * x + coefficients[2] * Math.pow(x, 2) + coefficients[3] * Math.pow(x, 3);
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const step = (maxX - minX) / 100 || 1;
    const polyPoints = [];
    for (let x = minX; x <= maxX; x += step) {
      const y = polyRegression(x);
      if (!isNaN(y) && isFinite(y) && y >= 0) polyPoints.push({ x, y });
    }
    return polyPoints;
    } catch (e) {
      console.warn('[DataTable] Polynomial regression HR failed:', e?.message);
      return [];
    }
  };

  /** Polynomial regression for lactate (x) -> HR (y). For chart with X = lactate, Y = heart rate (tepy). */
  const calculatePolynomialRegressionLactateToHR = (results) => {
    if (!results || !Array.isArray(results)) return [];
    const valid = results.filter(r => {
      const hr = r.heartRate;
      if (hr == null || hr === '') return false;
      const lactate = r.lactate;
      if (lactate == null || lactate === '') return false;
      const hrNum = Number(String(hr).replace(',', '.'));
      const laNum = Number(String(lactate).replace(',', '.'));
      return !isNaN(hrNum) && hrNum >= 40 && hrNum <= 220 && !isNaN(laNum);
    });
    if (valid.length < 4) return [];
    const xVals = valid.map(r => Number(String(r.lactate).replace(',', '.')));
    const yVals = valid.map(r => Number(String(r.heartRate).replace(',', '.')));
    if (new Set(xVals).size < 4) return [];
    try {
    const n = xVals.length;
    const X = [];
    const Y = [];
    for (let i = 0; i < n; i++) {
      X.push([1, xVals[i], Math.pow(xVals[i], 2), Math.pow(xVals[i], 3)]);
      Y.push(yVals[i]);
    }
    const XT = math.transpose(X);
    const XTX = math.multiply(XT, X);
    const XTY = math.multiply(XT, Y);
    const coefficients = math.lusolve(XTX, XTY).flat();
    const polyRegression = (x) =>
      coefficients[0] + coefficients[1] * x + coefficients[2] * Math.pow(x, 2) + coefficients[3] * Math.pow(x, 3);
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const step = (maxX - minX) / 100 || 0.01;
    const polyPoints = [];
    for (let x = minX; x <= maxX; x += step) {
      const y = polyRegression(x);
      if (!isNaN(y) && isFinite(y) && y >= 0 && y <= 250) polyPoints.push({ x, y });
    }
    return polyPoints;
    } catch (e) {
      console.warn('[DataTable] Polynomial regression LactateToHR failed:', e?.message);
      return [];
    }
  };

  export default DataTable;
  export { calculateThresholds, calculatePolynomialRegression, calculatePolynomialRegressionHR, calculatePolynomialRegressionLactateToHR };
  export { analyzeLactateTest } from './lactateTestAnalysis';

  