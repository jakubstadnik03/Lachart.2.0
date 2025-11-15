// DataTable.jsx
// =============

import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import * as math from 'mathjs';

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
    
    // Najít první a poslední bod (po seřazení)
    const firstPoint = sortedPoints[0];
    const lastPoint = sortedPoints[sortedPoints.length - 1];
    
    // Validace: první a poslední bod by neměly být stejné
    if (firstPoint.power === lastPoint.power) {
      console.warn('[D-max] First and last points have same power, cannot calculate D-max');
      return null;
    }
    
    // Vypočítat přímku mezi prvním a posledním bodem
    const slope = (lastPoint.lactate - firstPoint.lactate) / 
                  (lastPoint.power - firstPoint.power);
    const intercept = firstPoint.lactate - slope * firstPoint.power;
    
    // Najít bod s největší kolmou vzdáleností od přímky
    // Ignorovat první a poslední bod (mohou být outliery)
    let maxDistance = 0;
    let dmaxPoint = null;
    let dmaxIndex = -1;
    
    for (let i = 1; i < sortedPoints.length - 1; i++) {
      const point = sortedPoints[i];
      // Vypočítat vzdálenost bodu od přímky
      const distance = Math.abs(
        point.lactate - (slope * point.power + intercept)
      ) / Math.sqrt(1 + slope * slope);
      
      if (distance > maxDistance) {
        maxDistance = distance;
        dmaxPoint = point;
        dmaxIndex = i;
      }
    }
    
    // Pokud se nenašel žádný bod (málo dat), použít střední bod
    if (!dmaxPoint && sortedPoints.length >= 2) {
      const midIndex = Math.floor(sortedPoints.length / 2);
      dmaxPoint = sortedPoints[midIndex];
      dmaxIndex = midIndex;
      console.warn('[D-max] No point found with max distance, using middle point');
    }
    
    if (dmaxPoint) {
      console.log(`[D-max] Found point at index ${dmaxIndex}/${sortedPoints.length - 1}:`, {
        power: dmaxPoint.power,
        lactate: dmaxPoint.lactate,
        hr: dmaxPoint.heartRate,
        maxDistance: maxDistance.toFixed(4),
        firstPoint: { power: firstPoint.power, lactate: firstPoint.lactate },
        lastPoint: { power: lastPoint.power, lactate: lastPoint.lactate }
      });
    }
    
    return dmaxPoint;
  };
  
  // Individual Anaerobic Threshold (IAT)
  const calculateIAT = (points) => {
    if (!points || points.length < 3) return null;
    
    // Seřadit body podle výkonu
    const sortedPoints = [...points].sort((a, b) => a.power - b.power);
    
    // Najít bod s největším nárůstem laktátu
    let maxIncrease = 0;
    let iatPoint = null;
    
    for (let i = 1; i < sortedPoints.length; i++) {
      const increase = (sortedPoints[i].lactate - sortedPoints[i-1].lactate) /
                      (sortedPoints[i].power - sortedPoints[i-1].power);
      
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
  
  // Vylepšená funkce pro nalezení LTP bodů
  const findLactateThresholds = (results, baseLactate, sport = 'bike') => {
    if (!results || results.length < 3) {
      return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
    }

    const isPaceSport = sport === 'run' || sport === 'swim';

    console.log(`[findLactateThresholds] Calculating for sport: ${sport}, isPaceSport: ${isPaceSport}, points: ${results.length}`);
    
    // Použít D-max pro LTP2 (na celé křivce)
    let ltp2Point = calculateDmax(results, isPaceSport);
    
    if (!ltp2Point) {
      console.warn('[findLactateThresholds] Could not find LTP2 using D-max');
      return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
    }
    
    console.log(`[findLactateThresholds] LTP2 found: power=${ltp2Point.power}, lactate=${ltp2Point.lactate}, hr=${ltp2Point.heartRate}`);
    
    // Validace LTP2: měl by mít laktát vyšší než base lactate (typicky 1.5-3x base), ale ne příliš vysoký
    const effectiveBaseLactate = baseLactate || 1.0;
    const minLactateForLTP2 = effectiveBaseLactate * 1.5;
    const maxLactateForLTP2 = 5.5; // Maximální rozumný laktát pro LTP2 (anaerobní threshold)
    
    if (ltp2Point.lactate < minLactateForLTP2) {
      console.warn(`[findLactateThresholds] LTP2 lactate (${ltp2Point.lactate}) is too low compared to base (${effectiveBaseLactate}). D-max may have found wrong point.`);
      // Zkusit najít bod s laktátem alespoň 1.5x base lactate
      const sortedResults = [...results].sort((a, b) => {
        if (isPaceSport) return b.power - a.power;
        return a.power - b.power;
      });
      // Najít bod nejblíže ideálnímu rozsahu (3.5-5.5 mmol/L)
      const idealLactate = 4.5;
      const candidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2 && p.lactate <= maxLactateForLTP2);
      let betterLTP2Point = null;
      if (candidates.length > 0) {
        // Najít bod nejblíže ideálnímu laktátu (4.5 mmol/L)
        betterLTP2Point = candidates.reduce((best, current) => {
          const bestDiff = Math.abs(best.lactate - idealLactate);
          const currentDiff = Math.abs(current.lactate - idealLactate);
          return currentDiff < bestDiff ? current : best;
        });
      } else {
        // Pokud není žádný kandidát v ideálním rozsahu, najít nejbližší nad minLactateForLTP2
        const fallbackCandidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2);
        if (fallbackCandidates.length > 0) {
          betterLTP2Point = fallbackCandidates.reduce((best, current) => {
            const bestDiff = Math.abs(best.lactate - idealLactate);
            const currentDiff = Math.abs(current.lactate - idealLactate);
            return currentDiff < bestDiff ? current : best;
          });
        }
      }
      if (betterLTP2Point) {
        console.log(`[findLactateThresholds] Using alternative LTP2 point with lactate >= ${minLactateForLTP2}:`, betterLTP2Point);
        // Použít D-max na části křivky od tohoto bodu dál (rychlejší část)
        const fasterPoints = isPaceSport
          ? sortedResults.filter(p => p.power <= betterLTP2Point.power)
          : sortedResults.filter(p => p.power >= betterLTP2Point.power);
        if (fasterPoints.length >= 3) {
          const altLTP2Point = calculateDmax(fasterPoints, isPaceSport);
          if (altLTP2Point && altLTP2Point.lactate >= minLactateForLTP2 && altLTP2Point.lactate <= maxLactateForLTP2) {
            console.log(`[findLactateThresholds] Using improved LTP2:`, altLTP2Point);
            if (altLTP2Point.lactate > ltp2Point.lactate) {
              ltp2Point = altLTP2Point;
            }
          }
        }
      }
    } else if (ltp2Point.lactate > maxLactateForLTP2) {
      console.warn(`[findLactateThresholds] LTP2 lactate (${ltp2Point.lactate}) is too high (>${maxLactateForLTP2} mmol/L). This may result in training zones that are too hard. Looking for a better point.`);
      // Pokud je laktát příliš vysoký, najít bod s laktátem kolem 4-5 mmol/L (typický anaerobní threshold)
      const sortedResults = [...results].sort((a, b) => {
        if (isPaceSport) return b.power - a.power;
        return a.power - b.power;
      });
      // Najít bod s laktátem mezi 3.5 a 5.5 mmol/L (ideální rozsah pro LTP2)
      // Preferovat bod nejblíže 4.5 mmol/L (střed ideálního rozsahu)
      const idealLactate = 4.5;
      const candidates = sortedResults.filter(p => p.lactate >= 3.5 && p.lactate <= 5.5);
      let idealLTP2Point = null;
      if (candidates.length > 0) {
        // Najít bod nejblíže ideálnímu laktátu
        idealLTP2Point = candidates.reduce((best, current) => {
          const bestDiff = Math.abs(best.lactate - idealLactate);
          const currentDiff = Math.abs(current.lactate - idealLactate);
          return currentDiff < bestDiff ? current : best;
        });
      }
      if (idealLTP2Point) {
        console.log(`[findLactateThresholds] Found ideal LTP2 point with lactate in range 3.5-5.5:`, idealLTP2Point);
        // Použít D-max na části křivky od tohoto bodu dál (rychlejší část)
        const fasterPoints = isPaceSport
          ? sortedResults.filter(p => p.power <= idealLTP2Point.power)
          : sortedResults.filter(p => p.power >= idealLTP2Point.power);
        if (fasterPoints.length >= 3) {
          const altLTP2Point = calculateDmax(fasterPoints, isPaceSport);
          // Použít alternativní bod, pokud má laktát v rozumném rozsahu
          if (altLTP2Point && altLTP2Point.lactate >= 3.5 && altLTP2Point.lactate <= 5.5) {
            console.log(`[findLactateThresholds] Using improved LTP2 with reasonable lactate:`, altLTP2Point);
            ltp2Point = altLTP2Point;
          } else if (idealLTP2Point.lactate < ltp2Point.lactate) {
            // Pokud D-max nenašel lepší, použít přímo ideální bod
            console.log(`[findLactateThresholds] Using ideal LTP2 point directly:`, idealLTP2Point);
            ltp2Point = idealLTP2Point;
          }
        } else if (idealLTP2Point.lactate < ltp2Point.lactate) {
          // Pokud není dostatek bodů pro D-max, použít přímo ideální bod
          console.log(`[findLactateThresholds] Not enough points for D-max, using ideal LTP2 point directly:`, idealLTP2Point);
          ltp2Point = idealLTP2Point;
        }
      }
    }
    
    // Pro LTP1: najít první bod po poklesu, kde laktát začíná stabilně růst
    // Seřadit data podle power/pace
    const sortedForLTP1 = [...results].sort((a, b) => {
      if (isPaceSport) {
        return b.power - a.power; // Sestupně pro pace (pomalejší -> rychlejší)
      }
      return a.power - b.power; // Vzestupně pro power (nižší -> vyšší)
    });
    
    // Najít nejnižší laktát v křivce (nejhlubší pokles)
    let minLactate = Infinity;
    let minLactateIndex = -1;
    for (let i = 0; i < sortedForLTP1.length; i++) {
      if (sortedForLTP1[i].lactate < minLactate) {
        minLactate = sortedForLTP1[i].lactate;
        minLactateIndex = i;
      }
    }
    
    console.log(`[findLactateThresholds] Minimum lactate found at index ${minLactateIndex}: ${minLactate} mmol/L`);
    
    // Najít první bod PO poklesu, kde laktát začíná stabilně růst
    // LTP1 by měl být první bod, kde laktát >= base lactate a už neklesá
    let ltp1Point = null;
    let ltp1StartIndex = minLactateIndex + 1; // Začít hledat po poklesu
    
    // Najít první bod, kde laktát >= base lactate * 0.9 a už stabilně roste
    for (let i = ltp1StartIndex; i < sortedForLTP1.length; i++) {
      const point = sortedForLTP1[i];
      // Kontrola, že laktát je alespoň 0.9x base lactate
      if (point.lactate >= effectiveBaseLactate * 0.9) {
        // Kontrola, že následující body také rostou (nebo jsou stabilní)
        let isStableRising = true;
        if (i < sortedForLTP1.length - 1) {
          // Zkontrolovat následující 2-3 body, zda laktát roste nebo je stabilní
          for (let j = i + 1; j < Math.min(i + 3, sortedForLTP1.length); j++) {
            if (sortedForLTP1[j].lactate < point.lactate - 0.3) {
              // Pokud následující bod má laktát o více než 0.3 mmol/L nižší, není to stabilní růst
              isStableRising = false;
              break;
            }
          }
        }
        
        if (isStableRising) {
          ltp1Point = point;
          console.log(`[findLactateThresholds] LTP1 found after lactate drop: power=${ltp1Point.power}, lactate=${ltp1Point.lactate}, hr=${ltp1Point.heartRate}, index=${i}`);
          break;
        }
      }
    }
    
    // Pokud se nenašel bod po poklesu, použít D-max na první polovině
    if (!ltp1Point) {
      console.warn('[findLactateThresholds] Could not find LTP1 after lactate drop, using D-max on first half');
      const firstHalfIndex = Math.ceil(sortedForLTP1.length / 2);
      const firstHalfPoints = sortedForLTP1.slice(0, firstHalfIndex);
      
      if (firstHalfPoints.length >= 3) {
        ltp1Point = calculateDmax(firstHalfPoints, isPaceSport);
      } else {
        // Fallback: použít první bod s laktátem >= base lactate
        ltp1Point = sortedForLTP1.find(p => p.lactate >= effectiveBaseLactate * 0.9) || sortedForLTP1[0];
      }
    }
    
    if (ltp1Point) {
      console.log(`[findLactateThresholds] LTP1 found: power=${ltp1Point.power}, lactate=${ltp1Point.lactate}, hr=${ltp1Point.heartRate}`);
      
      // Validace LTP1: měl by mít laktát alespoň kolem base lactate nebo mírně vyšší
      if (ltp1Point.lactate < effectiveBaseLactate * 0.8) {
        console.warn(`[findLactateThresholds] LTP1 lactate (${ltp1Point.lactate}) is too low compared to base (${effectiveBaseLactate}). Trying to find better point.`);
        // Najít bod s laktátem nejblíže base lactate (ideálně mezi 0.9x a 1.3x base lactate)
        // Použít body po poklesu (od minLactateIndex dál)
        const pointsAfterDrop = sortedForLTP1.slice(minLactateIndex + 1);
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
          console.log(`[findLactateThresholds] Found alternative LTP1 point:`, betterLTP1Point);
          // Použít D-max na části od tohoto bodu
          const slowerPoints = isPaceSport
            ? sortedForLTP1.filter(p => p.power >= betterLTP1Point.power)
            : sortedForLTP1.filter(p => p.power <= betterLTP1Point.power);
          if (slowerPoints.length >= 3) {
            const altLTP1Point = calculateDmax(slowerPoints, isPaceSport);
            if (altLTP1Point && altLTP1Point.lactate >= effectiveBaseLactate * 0.8) {
              console.log(`[findLactateThresholds] D-max on slower section found:`, altLTP1Point);
              // Použít bod s lepším laktátem (blíže k base lactate nebo vyšší)
              if (altLTP1Point.lactate > ltp1Point.lactate) {
                console.log(`[findLactateThresholds] Using improved LTP1 from D-max:`, altLTP1Point);
                ltp1Point = altLTP1Point;
              } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
                // Pokud D-max nenašel lepší, použít přímo alternativní bod
                console.log(`[findLactateThresholds] Using alternative LTP1 point directly:`, betterLTP1Point);
                ltp1Point = betterLTP1Point;
              }
            } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
              // Pokud D-max selhal, použít přímo alternativní bod
              console.log(`[findLactateThresholds] D-max failed, using alternative LTP1 point directly:`, betterLTP1Point);
              ltp1Point = betterLTP1Point;
            }
          } else if (betterLTP1Point.lactate > ltp1Point.lactate) {
            // Pokud není dostatek bodů pro D-max, použít přímo alternativní bod
            console.log(`[findLactateThresholds] Not enough points for D-max, using alternative LTP1 point directly:`, betterLTP1Point);
            ltp1Point = betterLTP1Point;
          }
        }
      }
    }

    // Záložní metoda pomocí derivací, pokud D-max selže
    if (!ltp1Point) {
      console.warn('[findLactateThresholds] D-max failed for LTP1, trying derivatives');
      const { secondDerivative } = calculateDerivatives(results);
      const ltp1Candidate = secondDerivative.find(d => d.value > 0.0005);
      if (ltp1Candidate) {
        // Najít odpovídající bod v results
        const matchingPoint = results.find(r => Math.abs(r.power - ltp1Candidate.power) < 0.1) || results[0];
        return {
          ltp1: ltp1Candidate.power,
          ltp2: ltp2Point.power,
          ltp1Point: matchingPoint,
          ltp2Point: ltp2Point
        };
      }
      // Úplný fallback: použít první bod
      return {
        ltp1: results[0].power,
        ltp2: ltp2Point.power,
        ltp1Point: results[0],
        ltp2Point: ltp2Point
      };
    }

    // Validace: Pro bike musí být LTP2 > LTP1, pro run/swim musí být LTP2 < LTP1
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

    return {
      ltp1: ltp1Point.power,
      ltp2: ltp2Point.power,
      ltp1Point: ltp1Point,
      ltp2Point: ltp2Point
    };
  };

  
  // Hlavní funkce pro výpočet všech thresholdů
  const calculateThresholds = (mockData) => {
    const baseLactate = mockData.baseLactate;
    const { results, sport } = mockData;
  
    if (!results || results.length < 3) {
      return {
        heartRates: {},
        lactates: {}
      };
    }
  
    // Pro běh a plavání necháme hodnoty v sekundách (nebudeme je převádět)
    const sortedResults = [...results].sort((a, b) => {
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
  
    // IAT threshold
    const iatThreshold = calculateIAT(sortedResults);
    if (iatThreshold) {
      thresholds['IAT'] = iatThreshold.power;
      thresholds.heartRates['IAT'] = iatThreshold.heartRate;
      thresholds.lactates['IAT'] = iatThreshold.lactate;
    }
  
    // Najít LTP body pomocí D-max metody (PŘED interpolací, aby měly prioritu)
    const { ltp1, ltp2, ltp1Point, ltp2Point } = findLactateThresholds(sortedResults, baseLactate, sport);
    
    // Definice cílových laktátů (použít baseLactate pokud je definováno, jinak použít výchozí hodnoty)
    const effectiveBaseLactate = baseLactate || 1.0; // Fallback na 1.0 pokud není definováno
    
    // Nejdřív použít D-max body pro LTP1 a LTP2 (mají prioritu před interpolací)
    if (ltp1 && ltp1Point) {
      thresholds['LTP1'] = ltp1;
      thresholds.heartRates['LTP1'] = ltp1Point.heartRate || null;
      thresholds.lactates['LTP1'] = ltp1Point.lactate || null;
      console.log('[calculateThresholds] Using D-max LTP1:', { 
        power: ltp1, 
        hr: thresholds.heartRates['LTP1'],
        lactate: thresholds.lactates['LTP1']
      });
    }
    
    if (ltp2 && ltp2Point) {
      thresholds['LTP2'] = ltp2;
      thresholds.heartRates['LTP2'] = ltp2Point.heartRate || null;
      thresholds.lactates['LTP2'] = ltp2Point.lactate || null;
      console.log('[calculateThresholds] Using D-max LTP2:', { 
        power: ltp2, 
        hr: thresholds.heartRates['LTP2'],
        lactate: thresholds.lactates['LTP2']
      });
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
      
      console.log('[calculateThresholds] Interpolated HR for LTP1:', { 
        ltp1, 
        hr: thresholds.heartRates['LTP1']
      });
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
      
      console.log('[calculateThresholds] Interpolated HR for LTP2:', { 
        ltp2, 
        hr: thresholds.heartRates['LTP2']
      });
    }
  
    // Výpočet LTRatio pouze pokud máme oba LTP body
    if (ltp1 && ltp2 && ltp1 > 0 && ltp2 > 0) {
      const isPaceSport = sport === 'run' || sport === 'swim';
      // Pro bike: LTP2 > LTP1, takže ratio = LTP2/LTP1 (typicky 1.1-1.3)
      // Pro run/swim: LTP2 < LTP1 (pace), takže ratio = LTP1/LTP2 (typicky 1.1-1.6, může být i vyšší)
      const ratio = isPaceSport ? ltp1 / ltp2 : ltp2 / ltp1;
      // Kontrola, zda je poměr v rozumném rozsahu
      // Pro bike: 1.1-1.3, pro pace: 1.1-1.8 (může být vyšší u méně trénovaných)
      const minRatio = 1.1;
      const maxRatio = isPaceSport ? 1.8 : 1.3;
      if (ratio >= minRatio && ratio <= maxRatio) {
        thresholds['LTRatio'] = ratio.toFixed(2);
      } else {
        // Pro pace sporty může být ratio vyšší, takže jen varování, ne chyba
        if (isPaceSport && ratio > maxRatio) {
          console.log(`[calculateThresholds] LTRatio is high (${ratio.toFixed(2)}) for pace sport - this may be normal for less trained athletes.`);
          thresholds['LTRatio'] = ratio.toFixed(2); // Stále uložit, i když je vyšší
        } else {
          console.warn('[calculateThresholds] LTRatio out of expected range:', {
            ratio: ratio.toFixed(2),
            ltp1,
            ltp2,
            sport,
            isPaceSport,
            expectedRange: `${minRatio}-${maxRatio}`
          });
        }
      }
    }
  
    // Debug logging
    if (!thresholds['LTP1'] || !thresholds['LTP2']) {
      console.warn('[calculateThresholds] Missing LTP values:', {
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
    exercise intensity. (Hofmann & Tschakert, 2017)`,
    
    'LTP2': `Second Lactate Turn Point (LTP2) is determined using the D-max method on the entire lactate 
    curve. It marks the anaerobic threshold and represents the highest sustainable steady-state exercise 
    intensity. (Hofmann & Tschakert, 2017)`,
    
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

  // Vlastní jednoduchý Tooltip komponent
  const CustomTooltip = ({ children, title, methodName }) => {
    const tooltipRef = useRef(null);
    const { activeTooltip, setActiveTooltip, isLocked, setIsLocked } = useContext(TooltipContext);
    const isVisible = activeTooltip === methodName;

    // Přidáme event listener pro kliknutí mimo tooltip
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
          setActiveTooltip(null);
          setIsLocked(false);
        }
      };

      if (isVisible && isLocked) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
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
      if (!isLocked) {
        setActiveTooltip(methodName);
      }
    };

    const handleMouseLeave = () => {
      if (!isLocked) {
        setActiveTooltip(null);
      }
    };

    return (
      <div 
        ref={tooltipRef}
        className="relative cursor-pointer"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {isVisible && (
          <div className="absolute left-full ml-0 top-0 z-50 w-[300px]">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
              {/* Nadpis */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-gray-800 font-semibold tracking-wide">{methodName}</h3>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(null);
                    setIsLocked(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              {/* Obsah */}
              <div className="p-4">
                <p className="text-gray-600 text-sm leading-relaxed">
                  {title}
                </p>
              </div>
              {/* Reference pokud existuje */}
              {(methodName === 'LTP1' || methodName === 'LTP2') && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                  <p className="text-xs text-gray-500 italic">
                    Reference: Hofmann & Tschakert, 2017
                  </p>
                </div>
              )}
              {/* Šipka */}
              <div 
                className="absolute left-0 top-4 -ml-2 w-0 h-0 
                border-t-[8px] border-t-transparent 
                border-r-[8px] border-r-white
                border-b-[8px] border-b-transparent
                filter drop-shadow-sm"
              />
            </div>
          </div>
        )}
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
    const thresholds = calculateThresholds(mockData);
    const sport = mockData?.sport || 'bike';
    const unitSystem = mockData?.unitSystem || 'metric';
    const inputMode = mockData?.inputMode || 'pace';
  
    // Seznam metod, včetně Log-log
    const methods = [
      'Log-log',
      ...Object.keys(thresholds).filter(k =>
        k !== 'Log-log' && k !== 'heartRates' && k !== 'lactates'
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
                  (inputMode === 'pace' ? 
                    (sport === 'swim' ? 
                      (unitSystem === 'imperial' ? 'Pace (/100yd)' : 'Pace (/100m)') :
                      (unitSystem === 'imperial' ? 'Pace(/mile)' : 'Pace(/km)')
                    ) :
                    (unitSystem === 'imperial' ? 'Speed(mph)' : 'Speed(km/h)')
                  ) : 'Pace (km)',
        data: methods.map((method) => {
          const value = thresholds[method];
          return value ? formatPowerOrPace(value, sport, unitSystem, inputMode) : 'N/A';
        })
      },
      {
        header: 'HR (bpm)',
        data: methods.map((method) => {
          return thresholds.heartRates[method]
            ? Math.round(thresholds.heartRates[method])
            : 'N/A';
        })
      },
      {
        header: 'La (mmol)',
        data: methods.map((method) => {
          const value = thresholds.lactates[method];
          return value && typeof value === 'number' && !isNaN(value)
            ? value.toFixed(2)
            : 'N/A';
        })
      }
    ];
  
    return (
      <TooltipProvider>
        <div className="flex flex-col items-start w-full max-w-[400px] text-sm">
          <div className="flex justify-between items-start w-full">
            {columns.map((column, colIndex) => (
              <div key={colIndex} className="md:w-[100px] sm:w-[100px]">
                <TableCell isHeader>{column.header}</TableCell>
                {column.data.map((item, rowIndex) => (
                  <TableCell 
                    key={rowIndex}
                    description={colIndex === 0 ? column.descriptions[rowIndex] : null}
                    methodName={colIndex === 0 ? methods[rowIndex] : null}
                  >
                    {item}
                  </TableCell>
                ))}
              </div>
            ))}
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

  const formatPowerOrPace = (value, sport, unitSystem = 'metric', inputMode = 'pace') => {
    if (!value || value === 'N/A') return 'N/A';
    
    if (sport === 'bike') {
      return `${Math.round(value)} W`;
    } else if (sport === 'run' || sport === 'swim') {
      if (inputMode === 'pace') {
        const paceStr = formatSecondsToMMSS(value);
        if (sport === 'swim') {
          const unit = unitSystem === 'imperial' ? '/100yd' : '/100m';
          return `${paceStr}${unit}`;
        } else {
          const unit = unitSystem === 'imperial' ? '/mile' : '/km';
          return `${paceStr}${unit}`;
        }
      } else {
        // Speed mode - convert seconds to speed
        const speed = 3600 / value; // Convert seconds per km to km/h
        if (unitSystem === 'imperial') {
          const mph = speed * 0.621371; // Convert km/h to mph
          return `${mph.toFixed(1)} mph`;
        } else {
          return `${speed.toFixed(1)} km/h`;
        }
      }
    }
    return 'N/A';
  };
  
  export default DataTable;
  export { calculateThresholds };
  
  export const calculatePolynomialRegression = (results) => {
    const xVals = results.map(r => r.power);
    const yVals = results.map(r => r.lactate);
    
    const polyRegression = (() => {
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

      return (x) =>
        coefficients[0] +
        coefficients[1] * x +
        coefficients[2] * Math.pow(x, 2) +
        coefficients[3] * Math.pow(x, 3);
    })();

    // Generate points for polynomial curve
    const minPower = Math.min(...xVals);
    const maxPower = Math.max(...xVals);
    const step = (maxPower - minPower) / 100;

    const polyPoints = [];
    for (let x = minPower; x <= maxPower; x += step) {
      polyPoints.push({ x, y: polyRegression(x) });
    }

    return polyPoints;
  };
  