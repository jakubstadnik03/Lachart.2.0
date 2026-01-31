// DataTable.jsx
// =============

import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import * as math from 'mathjs';
import { useAuth } from '../../context/AuthProvider';

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
    
    for (let i = 1; i < sortedPoints.length - 1; i++) {
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
  const findLactateThresholds = (results, baseLactate, sport = 'bike') => {
    if (!results || results.length < 3) {
      return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
    }

    const isPaceSport = sport === 'run' || sport === 'swim';
    const effectiveBaseLactate = baseLactate || 1.0;
    
    // Seřadit data podle power/pace
    const sortedResults = [...results].sort((a, b) => {
      if (isPaceSport) {
        return b.power - a.power; // Sestupně pro pace (pomalejší -> rychlejší)
      }
      return a.power - b.power; // Vzestupně pro power (nižší -> vyšší)
    });
    
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
    
    // Validace LTP2: měl by mít laktát vyšší než base lactate, ale ne příliš vysoký
    // LTP2 (anaerobic threshold) by měl být typicky kolem 4.0-4.5 mmol/L
    const minLactateForLTP2 = Math.max(effectiveBaseLactate * 2.0, 3.5); // Alespoň 2x base nebo 3.5 mmol/L
    const maxLactateForLTP2 = 5.0; // Maximální rozumný laktát pro LTP2 (anaerobic threshold) - sníženo z 6.0
    const idealLTP2Lactate = 4.0; // Ideální hodnota pro LTP2 - sníženo z 4.5 na 4.0
    
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
          const fallbackCandidates = sortedResults.filter(p => p.lactate >= minLactateForLTP2 && p.lactate <= 5.0);
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
    
    // Finální validace: pokud je LTP2 stále příliš vysoký (>4.5), najít nižší bod
    if (ltp2Point && ltp2Point.lactate > 4.5) {
      console.warn(`[findLactateThresholds] LTP2 lactate (${ltp2Point.lactate}) is still too high (>4.5 mmol/L). Looking for lower point.`);
      const lowerCandidates = sortedResults.filter(p => p.lactate >= 3.5 && p.lactate <= 4.5);
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
    let ltp1Point = null;
    
    // Rozdělit křivku na dvě části - první polovina pro LTP1, druhá pro LTP2
    // midIndex už je deklarováno výše pro LTP2
    const firstHalfPoints = sortedResults.slice(0, midIndex);
    
    // Zkusit D-max na první polovině
    if (firstHalfPoints.length >= 3) {
      ltp1Point = calculateDmax(firstHalfPoints, isPaceSport);
    }
    
    // Pokud D-max nenašel dobrý bod, použít alternativní metody
    // LTP1 by měl být v první polovině s laktátem kolem 1.5-2.5 mmol/L
    const maxLactateForLTP1 = 2.8; // Maximální laktát pro LTP1
    
    if (!ltp1Point || ltp1Point.lactate < effectiveBaseLactate * 0.7 || ltp1Point.lactate > maxLactateForLTP1) {
      // Metoda 1: Najít bod s prvním významným nárůstem laktátu
      // Hledat bod, kde laktát poprvé stoupne o více než 0.3 mmol/L oproti předchozímu
      for (let i = 1; i < sortedResults.length; i++) {
        const prev = sortedResults[i - 1];
        const curr = sortedResults[i];
        const lactateIncrease = curr.lactate - prev.lactate;
        
        // Pokud laktát stoupne o více než 0.3 mmol/L a je v rozumném rozsahu pro LTP1
        if (lactateIncrease > 0.3 && curr.lactate >= effectiveBaseLactate * 0.8 && curr.lactate <= maxLactateForLTP1) {
          ltp1Point = curr;
          break;
        }
      }
      
      // Metoda 2: Pokud stále nemáme bod, použít bod s laktátem nejblíže base lactate až 2.5 mmol/L
      if (!ltp1Point || ltp1Point.lactate < effectiveBaseLactate * 0.7 || ltp1Point.lactate > maxLactateForLTP1) {
        const idealLTP1Lactate = Math.max(effectiveBaseLactate * 1.2, 2.0); // Ideálně kolem 1.2x base nebo 2.0 mmol/L
        const candidates = sortedResults.filter(p => 
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
          // Fallback: použít první bod s laktátem >= base lactate
          ltp1Point = sortedResults.find(p => p.lactate >= effectiveBaseLactate * 0.8 && p.lactate <= maxLactateForLTP1) || sortedResults[0];
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
      const { secondDerivative } = calculateDerivatives(results);
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
        // Najít LTP1 v první třetině křivky (pomalejší část)
        const firstThird = Math.floor(sortedResults.length / 3);
        const firstThirdPoints = sortedResults.slice(0, firstThird + 1);
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
          
          const newLTP1Point = sortedResults.reduce((best, current) => {
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
        // Najít LTP1 v první třetině křivky (nižší power)
        const firstThird = Math.floor(sortedResults.length / 3);
        const firstThirdPoints = sortedResults.slice(0, firstThird + 1);
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
          
          const newLTP1Point = sortedResults.reduce((best, current) => {
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
        // které splňují základní podmínky
        const validLTP1Candidates = sortedResults.filter(p => 
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
      // Debug logging removed
    }
    
    if (ltp2 && ltp2Point) {
      thresholds['LTP2'] = ltp2;
      thresholds.heartRates['LTP2'] = ltp2Point.heartRate || null;
      thresholds.lactates['LTP2'] = ltp2Point.lactate || null;
      // Debug logging removed
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
        console.warn('[calculateThresholds] LTP values are out of reasonable range, skipping LTRatio:', {
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
          console.warn('[calculateThresholds] LTP1 and LTP2 are too close together, skipping LTRatio calculation:', {
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
            console.warn('[calculateThresholds] LTRatio is not a valid number, skipping:', {
              ratio,
              ltp1,
              ltp2
            });
          } else if (ratio >= minRatio && ratio <= maxRatio) {
            thresholds['LTRatio'] = ratio.toFixed(2);
          } else {
            // Pokud je ratio mimo rozsah, nezobrazit ho vůbec
            console.warn('[calculateThresholds] LTRatio out of reasonable range, not displaying:', {
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
      console.warn('[calculateThresholds] Cannot calculate LTRatio - missing LTP values:', {
        hasLTP1: !!ltp1,
        hasLTP2: !!ltp2,
        hasLTP1Point: !!ltp1Point,
        hasLTP2Point: !!ltp2Point
      });
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
                <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                  {title.split('**').map((part, index) => {
                    if (index % 2 === 1) {
                      // Bold text between **
                      return <strong key={index} className="font-semibold text-gray-800">{part}</strong>;
                    }
                    return <span key={index}>{part}</span>;
                  })}
                </div>
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
    const [showInfoBox, setShowInfoBox] = useState(true);
    
    // Get user from context for unitSystem
    let user = null;
    try {
      const authHook = useAuth();
      user = authHook?.user;
    } catch (e) {
      // If useAuth hook is not available (e.g., outside AuthProvider), continue without it
    }
    
    const thresholds = calculateThresholds(mockData);
    const sport = mockData?.sport || 'bike';
    const unitSystem = user?.units?.distance === 'imperial' ? 'imperial' : (mockData?.unitSystem || 'metric');
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
          // LTRatio je poměr, ne hodnota power/pace, takže ho nezobrazovat v tomto sloupci
          if (method === 'LTRatio') {
            return 'N/A';
          }
          const value = thresholds[method];
          return value ? formatPowerOrPace(value, sport, unitSystem, inputMode) : 'N/A';
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
          {(thresholds['LTP1'] || thresholds['LTP2']) && showInfoBox && (
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
  
  const calculatePolynomialRegression = (results) => {
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
  };

  export default DataTable;
  export { calculateThresholds, calculatePolynomialRegression, calculatePolynomialRegressionHR, calculatePolynomialRegressionLactateToHR };

  