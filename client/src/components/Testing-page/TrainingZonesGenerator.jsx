
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { calculateThresholds, calculatePolynomialRegression } from './DataTable';
import EditProfileModal from '../Profile/EditProfileModal';
import api, { updateUserProfile, updateTest } from '../../services/api';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';
import { useAuth } from '../../context/AuthProvider';
import { getEffectiveLactateInputMode, getLactateDisplayMode } from '../../utils/lactateTestInputMode';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';

const TrainingZonesGenerator = ({ mockData, demoMode = false }) => {
  const { user } = useAuth();
  const [zones, setZones] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [ltValues, setLtValues] = useState({ lt1: null, lt2: null });
  const [testZoneOverrides, setTestZoneOverrides] = useState(null);
  /** Zone model: '5zone' (classic LT-based) or 'seiler' (polarized 3-zone) */
  const [zoneModel, setZoneModel] = useState('5zone');

  const getLocalTestOverrides = (testId) => {
    if (!testId) return null;
    try {
      const raw = localStorage.getItem(`lachart:testZoneOverrides:${testId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const setLocalTestOverrides = (testId, overrides) => {
    if (!testId) return;
    try {
      localStorage.setItem(`lachart:testZoneOverrides:${testId}`, JSON.stringify(overrides));
    } catch {}
  };
  
  // Get unit system and input mode from user profile, mockData, or default to metric/pace
  const unitSystem = resolveDistanceUnitSystem(user, mockData?.unitSystem || 'metric');
  const storageMode = getEffectiveLactateInputMode(mockData);
  const displayMode = getLactateDisplayMode(mockData, user);
  const selectedTestDate = mockData?.date || mockData?.createdAt || mockData?.timestamp;

  const formatPace = (seconds) => {
    if (!seconds || seconds === 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Convert pace string (M:SS) or seconds to speed (km/h or mph)
  const convertPaceToSpeed = (paceValue, unitSystem) => {
    if (!paceValue) return 0;
    
    // Parse pace string (M:SS) to seconds
    let seconds;
    if (typeof paceValue === 'string' && paceValue.includes(':')) {
      const parts = paceValue.split(':');
      if (parts.length === 2) {
        seconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      } else {
        seconds = parseFloat(paceValue);
      }
    } else if (typeof paceValue === 'string') {
      seconds = parseFloat(paceValue);
    } else {
      seconds = paceValue;
    }
    
    if (isNaN(seconds) || seconds <= 0) return 0;

    const sport = mockData?.sport;
    if (sport === 'swim') {
      const kmh = 360 / seconds;
      if (unitSystem === 'imperial') return kmh * 0.621371;
      return kmh;
    }
    // Run: sec/km (metric) or sec/mile (imperial)
    return 3600 / seconds;
  };

  const toDisplaySpeed = useCallback((kmh) => {
    if (!Number.isFinite(kmh)) return 0;
    const v = unitSystem === 'imperial' ? kmh * 0.621371 : kmh;
    return Number(v.toFixed(1));
  }, [unitSystem]);

  const mapSportToProfileKey = (sport) => (
    sport === 'bike' ? 'cycling' :
    sport === 'run' ? 'running' :
    sport === 'swim' ? 'swimming' : sport
  );

  const applyTestZoneOverrides = useCallback((calculatedZones, sport) => {
    const profileSport = mapSportToProfileKey(sport);
    const overrideRoot = testZoneOverrides || mockData?.zoneOverrides;
    const overridePower = overrideRoot?.powerZones?.[profileSport];
    const overrideHr = overrideRoot?.heartRateZones?.[profileSport];
    if (!overridePower && !overrideHr) return calculatedZones;

    const isSpeedRun = sport !== 'bike' && getEffectiveLactateInputMode(mockData) === 'speed';
    const next = { ...(calculatedZones || {}) };
    const paceOrPowerKey = sport === 'bike' ? 'power' : (isSpeedRun ? 'speed' : 'pace');
    if (!next[paceOrPowerKey]) next[paceOrPowerKey] = {};
    if (!next.heartRate) next.heartRate = {};

    for (let i = 1; i <= 5; i += 1) {
      const zoneKey = `zone${i}`;
      const existing = next[paceOrPowerKey][zoneKey] || {};
      const pz = overridePower?.[zoneKey];
      if (pz) {
        const minVal = Number(pz.min);
        const maxVal = Number(pz.max);
        next[paceOrPowerKey][zoneKey] = {
          ...existing,
          min: sport === 'bike' || isSpeedRun
            ? (Number.isFinite(minVal) ? minVal : existing.min)
            : (Number.isFinite(minVal) ? formatPace(minVal) : existing.min),
          max: sport === 'bike' || isSpeedRun
            ? (Number.isFinite(maxVal) ? maxVal : existing.max)
            : (Number.isFinite(maxVal) ? formatPace(maxVal) : existing.max),
          description: pz.description || existing.description,
          lactate: (Number.isFinite(Number(pz?.lactate?.min)) || Number.isFinite(Number(pz?.lactate?.max)))
            ? `${Number.isFinite(Number(pz?.lactate?.min)) ? Number(pz.lactate.min).toFixed(1) : '0.0'}–${Number.isFinite(Number(pz?.lactate?.max)) ? Number(pz.lactate.max).toFixed(1) : '0.0'}`
            : existing.lactate
        };
      }

      const hz = overrideHr?.[zoneKey];
      if (hz) {
        const hrMin = Number(hz.min);
        const hrMax = Number(hz.max);
        next.heartRate[zoneKey] = {
          min: Number.isFinite(hrMin) ? hrMin : next.heartRate?.[zoneKey]?.min,
          max: Number.isFinite(hrMax) ? hrMax : next.heartRate?.[zoneKey]?.max
        };
      }
    }

    return next;
  }, [mockData, testZoneOverrides]);

  useEffect(() => {
    const testId = mockData?._id;
    const localOverrides = getLocalTestOverrides(testId);
    // Local overrides should win, so user edits persist even if backend schema isn't updated yet.
    setTestZoneOverrides(localOverrides || mockData?.zoneOverrides || null);
  }, [mockData?.zoneOverrides, mockData?._id]);

  // Helper function to interpolate lactate value for a given power/pace using polynomial regression
  const getLactateForPower = (powerValue, results, sport, isSpeedStorage = false) => {
    if (!results || results.length === 0) return null;
    
    try {
      // Use polynomial regression for more accurate lactate values
      const polyPoints = calculatePolynomialRegression(results);
      
      // Find the closest point or interpolate between two points
      let closestPoint = polyPoints[0];
      let minDist = Math.abs(closestPoint.x - powerValue);
      
      for (let i = 1; i < polyPoints.length; i++) {
        const dist = Math.abs(polyPoints[i].x - powerValue);
        if (dist < minDist) {
          minDist = dist;
          closestPoint = polyPoints[i];
        }
      }
      
      // If we have points on both sides, interpolate
      const index = polyPoints.findIndex(p => p.x >= powerValue);
      if (index > 0 && index < polyPoints.length) {
        const prev = polyPoints[index - 1];
        const next = polyPoints[index];
        const ratio = (powerValue - prev.x) / (next.x - prev.x);
        const interpolatedLactate = prev.y + (next.y - prev.y) * ratio;
        return Math.max(0, interpolatedLactate);
      }
      
      return Math.max(0, closestPoint.y);
    } catch (e) {
      console.warn('Could not calculate lactate for power using polynomial regression:', powerValue, e);
      
      // Fallback to linear interpolation from actual results
      const sortedResults = [...results].sort((a, b) => {
        if (sport === 'bike' || isSpeedStorage) {
          return a.power - b.power;
        }
        return b.power - a.power;
      });
      
      // Check boundaries
      if (sport === 'bike' || isSpeedStorage) {
        if (powerValue <= sortedResults[0].power) {
          return sortedResults[0].lactate;
        }
        if (powerValue >= sortedResults[sortedResults.length - 1].power) {
          return sortedResults[sortedResults.length - 1].lactate;
        }
      } else {
        if (powerValue >= sortedResults[0].power) {
          return sortedResults[0].lactate;
        }
        if (powerValue <= sortedResults[sortedResults.length - 1].power) {
          return sortedResults[sortedResults.length - 1].lactate;
        }
      }
      
      // Linear interpolation
      for (let i = 0; i < sortedResults.length - 1; i++) {
        const prev = sortedResults[i];
        const next = sortedResults[i + 1];
        
        const isBetween = (sport === 'bike' || isSpeedStorage)
          ? (prev.power <= powerValue && next.power >= powerValue)
          : (prev.power >= powerValue && next.power <= powerValue);
        
        if (isBetween) {
          const ratio = (powerValue - prev.power) / (next.power - prev.power);
          const lactate = prev.lactate + (next.lactate - prev.lactate) * ratio;
          return Math.max(0, lactate);
        }
      }
      
      return null;
    }
  };

  // Convert zones to profile format and merge with existing user profile
  const getProfileDataWithZones = () => {
    if (!zones || !userProfile) return userProfile;
    
    // Map sport names: bike -> cycling, run -> running, swim -> swimming
    const sport = selectedSport === 'bike' ? 'cycling' : 
                  selectedSport === 'run' ? 'running' : 
                  selectedSport === 'swim' ? 'swimming' : selectedSport;
    const mergedData = { ...userProfile };
    // Add sport info to help EditProfileModal auto-select the right sport
    mergedData._selectedSport = sport;
    
    // Merge power zones
    if (!mergedData.powerZones) mergedData.powerZones = {};
    if (!mergedData.powerZones[sport]) mergedData.powerZones[sport] = {};

    const parseLactateRange = (value) => {
      if (!value || typeof value !== 'string') return { min: '', max: '' };
      const normalized = value.replace('mmol/L', '').replace('–', '-').trim();
      const [minRaw, maxRaw] = normalized.split('-').map((v) => v?.trim());
      const min = Number(minRaw);
      const max = Number(maxRaw);
      return {
        min: Number.isFinite(min) ? min : '',
        max: Number.isFinite(max) ? max : ''
      };
    };

    const getPersistedOrCalculatedLactate = (existingZone, calculatedLactate) => {
      const existingMin = Number(existingZone?.lactate?.min);
      const existingMax = Number(existingZone?.lactate?.max);
      if (Number.isFinite(existingMin) || Number.isFinite(existingMax)) {
        return {
          min: Number.isFinite(existingMin) ? existingMin : '',
          max: Number.isFinite(existingMax) ? existingMax : ''
        };
      }
      return parseLactateRange(calculatedLactate);
    };
    
    if (zones.power) {
      mergedData.powerZones.cycling = {
        ...mergedData.powerZones.cycling,
        zone1: { min: zones.power.zone1?.min || 0, max: zones.power.zone1?.max || 0, description: zones.power.zone1?.description || '', lactate: getPersistedOrCalculatedLactate(mergedData.powerZones.cycling?.zone1, zones.power.zone1?.lactate) },
        zone2: { min: zones.power.zone2?.min || 0, max: zones.power.zone2?.max || 0, description: zones.power.zone2?.description || '', lactate: getPersistedOrCalculatedLactate(mergedData.powerZones.cycling?.zone2, zones.power.zone2?.lactate) },
        zone3: { min: zones.power.zone3?.min || 0, max: zones.power.zone3?.max || 0, description: zones.power.zone3?.description || '', lactate: getPersistedOrCalculatedLactate(mergedData.powerZones.cycling?.zone3, zones.power.zone3?.lactate) },
        zone4: { min: zones.power.zone4?.min || 0, max: zones.power.zone4?.max || 0, description: zones.power.zone4?.description || '', lactate: getPersistedOrCalculatedLactate(mergedData.powerZones.cycling?.zone4, zones.power.zone4?.lactate) },
        zone5: { min: zones.power.zone5?.min || 0, max: zones.power.zone5?.max === Infinity ? Infinity : (zones.power.zone5?.max || 0), description: zones.power.zone5?.description || '', lactate: getPersistedOrCalculatedLactate(mergedData.powerZones.cycling?.zone5, zones.power.zone5?.lactate) },
        lt1: ltValues.lt1 ? Math.round(ltValues.lt1) : '',
        lt2: ltValues.lt2 ? Math.round(ltValues.lt2) : ''
      };
    } else if (zones.pace) {
      // Run/Swim zones - convert pace from mm:ss format to seconds
      const parsePaceToSeconds = (paceStr) => {
        if (!paceStr) return 0;
        if (typeof paceStr === 'number') return paceStr;
        // Handle mm:ss format
        if (typeof paceStr === 'string' && paceStr.includes(':')) {
          const parts = paceStr.split(':');
          if (parts.length === 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            return minutes * 60 + seconds;
          }
        }
        // Try to parse as number
        const num = parseFloat(paceStr);
        return isNaN(num) ? 0 : num;
      };
      
      mergedData.powerZones[sport] = {
        ...mergedData.powerZones[sport],
        zone1: { 
          min: parsePaceToSeconds(zones.pace.zone1?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone1?.max) || 0,
          description: zones.pace.zone1?.description || '',
          lactate: getPersistedOrCalculatedLactate(mergedData.powerZones[sport]?.zone1, zones.pace.zone1?.lactate)
        },
        zone2: { 
          min: parsePaceToSeconds(zones.pace.zone2?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone2?.max) || 0,
          description: zones.pace.zone2?.description || '',
          lactate: getPersistedOrCalculatedLactate(mergedData.powerZones[sport]?.zone2, zones.pace.zone2?.lactate)
        },
        zone3: { 
          min: parsePaceToSeconds(zones.pace.zone3?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone3?.max) || 0,
          description: zones.pace.zone3?.description || '',
          lactate: getPersistedOrCalculatedLactate(mergedData.powerZones[sport]?.zone3, zones.pace.zone3?.lactate)
        },
        zone4: { 
          min: parsePaceToSeconds(zones.pace.zone4?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone4?.max) || 0,
          description: zones.pace.zone4?.description || '',
          lactate: getPersistedOrCalculatedLactate(mergedData.powerZones[sport]?.zone4, zones.pace.zone4?.lactate)
        },
        zone5: { 
          min: parsePaceToSeconds(zones.pace.zone5?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone5?.max) || 0,
          description: zones.pace.zone5?.description || '',
          lactate: getPersistedOrCalculatedLactate(mergedData.powerZones[sport]?.zone5, zones.pace.zone5?.lactate)
        },
        lt1: ltValues.lt1 ? Math.round(ltValues.lt1) : '',
        lt2: ltValues.lt2 ? Math.round(ltValues.lt2) : ''
      };
    }
    
    // Merge heart rate zones
    if (!mergedData.heartRateZones) mergedData.heartRateZones = {};
    if (!mergedData.heartRateZones[sport]) mergedData.heartRateZones[sport] = {};
    
    if (zones.heartRate) {
      mergedData.heartRateZones[sport] = {
        ...mergedData.heartRateZones[sport],
        zone1: { min: zones.heartRate.zone1?.min || 0, max: zones.heartRate.zone1?.max || 0 },
        zone2: { min: zones.heartRate.zone2?.min || 0, max: zones.heartRate.zone2?.max || 0 },
        zone3: { min: zones.heartRate.zone3?.min || 0, max: zones.heartRate.zone3?.max || 0 },
        zone4: { min: zones.heartRate.zone4?.min || 0, max: zones.heartRate.zone4?.max || 0 },
        zone5: { min: zones.heartRate.zone5?.min || 0, max: zones.heartRate.zone5?.max || 0 }
      };
    }
    
    return mergedData;
  };


  const calculateTrainingZones = useCallback(() => {
    if (!mockData || !mockData.results || mockData.results.length < 3) {
      console.warn('[Zones] Not enough data for zone calculation:', {
        hasMockData: !!mockData,
        resultsCount: mockData?.results?.length || 0,
        required: 3
      });
      setZones(null);
      return;
    }
    const sport = mockData.sport || 'bike';
    setSelectedSport(sport);
    
    const thresholds = calculateThresholds(mockData);
    
    const lt1_value = thresholds['LTP1'];
    const lt2_value = thresholds['LTP2'];
    const hr1 = thresholds.heartRates['LTP1'];
    const hr2 = thresholds.heartRates['LTP2'];
    const lt1_lactate = thresholds.lactates?.['LTP1'];
    const lt2_lactate = thresholds.lactates?.['LTP2'];
    const baseLactate = mockData.baseLactate || 1.0;

    setLtValues({ lt1: lt1_value || null, lt2: lt2_value || null });
    
    // Check if we have at least LTP1 and LTP2 (HR is optional)
    if (!lt1_value || !lt2_value) {
      console.warn('[Zones] Nelze vypočítat zóny protože LTP1/LTP2 není dostupné!', { 
        lt1_value, 
        lt2_value,
        allThresholds: Object.keys(thresholds),
        availableHRs: Object.keys(thresholds.heartRates || {})
      });
      setZones(null);
      return;
    }
    
    // HR is optional - if not available, we'll show zones without HR
    const hasHR = hr1 && hr2;
    
    // Validace: Pro bike (power) musí být LTP2 > LTP1, pro run/swim (pace) musí být LTP2 < LTP1
    if (sport === 'bike') {
      if (lt2_value <= lt1_value) {
        console.warn('[Zones] LTP2 <= LTP1, invalid combination for bike', { lt1_value, lt2_value, sport });
        setZones(null);
        return;
      }
    } else {
      const isSpeed = storageMode === 'speed';
      if (isSpeed) {
        if (lt2_value <= lt1_value) {
          console.warn('[Zones] LTP2 <= LTP1, invalid combination for run/swim (speed)', { lt1_value, lt2_value, sport });
          setZones(null);
          return;
        }
      } else if (lt2_value >= lt1_value) {
        console.warn('[Zones] LTP2 >= LTP1, invalid combination for run/swim (pace)', { lt1_value, lt2_value, sport });
      setZones(null);
      return;
    }
    }
    
    // ── Seiler polarized 3-zone model ──────────────────────────────────────
    if (zoneModel === 'seiler') {
      const isPaceSport = sport === 'run' || sport === 'swim';
      const isSpeed = isPaceSport && storageMode === 'speed';
      const fmt = s => formatPace(s);

      const seilerZones = isPaceSport ? (
        isSpeed ? {
          speed: {
            zone1: {
              min: toDisplaySpeed(lt1_value * 0.50),
              max: toDisplaySpeed(lt1_value * 1.00),
              description: 'Polarized Base (< LT1)',
              hr: hasHR ? `${Math.round(hr1 * 0.50)}–${Math.round(hr1 * 1.00)} BPM` : 'N/A',
              percent: '< LT1',
              lactate: lt1_lactate ? `< ${Number(lt1_lactate).toFixed(1)}` : '-',
            },
            zone2: {
              min: toDisplaySpeed(lt1_value * 1.00),
              max: toDisplaySpeed(lt2_value * 1.00),
              description: 'Tempo / Threshold (LT1–LT2)',
              hr: hasHR ? `${Math.round(hr1 * 1.00)}–${Math.round(hr2 * 1.00)} BPM` : 'N/A',
              percent: 'LT1–LT2',
              lactate: (lt1_lactate && lt2_lactate) ? `${Number(lt1_lactate).toFixed(1)}–${Number(lt2_lactate).toFixed(1)}` : '-',
            },
            zone3: {
              min: toDisplaySpeed(lt2_value * 1.00),
              max: toDisplaySpeed(lt2_value * 1.20),
              description: 'High Intensity (> LT2)',
              hr: hasHR ? `> ${Math.round(hr2 * 1.00)} BPM` : 'N/A',
              percent: '> LT2',
              lactate: lt2_lactate ? `> ${Number(lt2_lactate).toFixed(1)}` : '-',
            },
          },
          heartRate: hasHR ? {
            zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 1.00) },
            zone2: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 1.00) },
            zone3: { min: Math.round(hr2 * 1.00), max: Math.round(hr2 * 1.15) },
          } : null,
        } : {
        pace: {
          zone1: {
            min: fmt(lt1_value / 0.50),
            max: fmt(lt1_value / 1.00),
            description: 'Polarized Base (< LT1)',
            hr: hasHR ? `${Math.round(hr1 * 0.50)}–${Math.round(hr1 * 1.00)} BPM` : 'N/A',
            percent: '< LT1',
            lactate: lt1_lactate ? `< ${Number(lt1_lactate).toFixed(1)}` : '-',
          },
          zone2: {
            min: fmt(lt1_value / 1.00),
            max: fmt(lt2_value / 1.00),
            description: 'Tempo / Threshold (LT1–LT2)',
            hr: hasHR ? `${Math.round(hr1 * 1.00)}–${Math.round(hr2 * 1.00)} BPM` : 'N/A',
            percent: 'LT1–LT2',
            lactate: (lt1_lactate && lt2_lactate) ? `${Number(lt1_lactate).toFixed(1)}–${Number(lt2_lactate).toFixed(1)}` : '-',
          },
          zone3: {
            min: fmt(lt2_value / 1.00),
            max: fmt(lt2_value / 1.20),
            description: 'High Intensity (> LT2)',
            hr: hasHR ? `> ${Math.round(hr2 * 1.00)} BPM` : 'N/A',
            percent: '> LT2',
            lactate: lt2_lactate ? `> ${Number(lt2_lactate).toFixed(1)}` : '-',
          },
        },
        heartRate: hasHR ? {
          zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 1.00) },
          zone2: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 1.00) },
          zone3: { min: Math.round(hr2 * 1.00), max: Math.round(hr2 * 1.15) },
        } : null,
      }
      ) : {
        power: {
          zone1: {
            min: Math.round(lt1_value * 0.50),
            max: Math.round(lt1_value * 1.00),
            description: 'Polarized Base (< LT1)',
            hr: hasHR ? `${Math.round(hr1 * 0.50)}–${Math.round(hr1 * 1.00)} BPM` : 'N/A',
            percent: '< LT1',
            lactate: lt1_lactate ? `< ${Number(lt1_lactate).toFixed(1)}` : '-',
          },
          zone2: {
            min: Math.round(lt1_value * 1.00),
            max: Math.round(lt2_value * 1.00),
            description: 'Tempo / Threshold (LT1–LT2)',
            hr: hasHR ? `${Math.round(hr1 * 1.00)}–${Math.round(hr2 * 1.00)} BPM` : 'N/A',
            percent: 'LT1–LT2',
            lactate: (lt1_lactate && lt2_lactate) ? `${Number(lt1_lactate).toFixed(1)}–${Number(lt2_lactate).toFixed(1)}` : '-',
          },
          zone3: {
            min: Math.round(lt2_value * 1.00),
            max: Math.round(lt2_value * 1.20),
            description: 'High Intensity (> LT2)',
            hr: hasHR ? `> ${Math.round(hr2 * 1.00)} BPM` : 'N/A',
            percent: '> LT2',
            lactate: lt2_lactate ? `> ${Number(lt2_lactate).toFixed(1)}` : '-',
          },
        },
        heartRate: hasHR ? {
          zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 1.00) },
          zone2: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 1.00) },
          zone3: { min: Math.round(hr2 * 1.00), max: Math.round(hr2 * 1.15) },
        } : null,
      };
      setZones(seilerZones);
      return;
    }
    // ── End Seiler 3-zone ───────────────────────────────────────────────────

    // Pro bike: použít power hodnoty (watty), pro run/swim: použít tempo (sekundy)
    if (sport === 'bike') {
      // Pro bike jsou LTP1 a LTP2 už v power hodnotách (watty)
      const lt1_watts = lt1_value;
      const lt2_watts = lt2_value;
      
      console.log(`[Zones Bike] LTP1: ${lt1_watts}W LTP2: ${lt2_watts}W`);
      
      // Calculate lactate values for each zone based on actual test data
      // Z1: intenzita pod 90 % LT1 (spodní hranice ~50 % LT1 pro tabulku)
      const zone1_min_power = Math.round(lt1_watts * 0.50);
      const zone1_max_power = Math.round(lt1_watts * 0.90);
      const zone2_min_power = Math.round(lt1_watts * 0.90);
      const zone2_max_power = Math.round(lt1_watts * 1.00);
      const zone3_min_power = Math.round(lt1_watts * 1.00);
      const zone3_max_power = Math.round(lt2_watts * 0.95);
      const zone4_min_power = Math.round(lt2_watts * 0.96);
      const zone4_max_power = Math.round(lt2_watts * 1.04);
      const zone5_min_power = Math.round(lt2_watts * 1.05);
      const zone5_max_power = Math.round(lt2_watts * 1.20);
      
      // Calculate lactate values based on LTP1 and LTP2 lactate values
      // If we have lactate values from thresholds, use them; otherwise interpolate from test data
      const lt1_lactate_value = lt1_lactate || getLactateForPower(lt1_watts, mockData.results, sport) || 2.0;
      const lt2_lactate_value = lt2_lactate || getLactateForPower(lt2_watts, mockData.results, sport) || 4.0;
      
      // Physiological lactate zoning:
      // - wider Z2 (endurance/aerobic work)
      // - smoother transitions around LT1/LT2
      // - avoid overly narrow bands when LT1 and LT2 are close
      const ltGap = Math.max(0.4, lt2_lactate_value - lt1_lactate_value);
      const z2Headroom = Math.max(0.5, Math.min(1.2, ltGap * 0.45)); // wider Z2 span

      // Zone 1: base -> clearly below LT1
      const zone1_min_lactate = Math.max(0.7, baseLactate);
      const zone1_max_lactate = Math.max(zone1_min_lactate + 0.2, lt1_lactate_value - z2Headroom);
      
      // Zone 2: broad aerobic range up to LT1
      const zone2_min_lactate = zone1_max_lactate;
      const zone2_max_lactate = lt1_lactate_value;
      
      // Zone 3: LT1 to near LT2
      const zone3_min_lactate = lt1_lactate_value;
      const zone3_max_lactate = Math.max(zone3_min_lactate + 0.4, lt2_lactate_value - Math.max(0.2, ltGap * 0.15));
      
      // Zone 4: around LT2 (threshold band)
      const zone4_min_lactate = Math.max(zone3_max_lactate, lt2_lactate_value - Math.max(0.2, ltGap * 0.08));
      const zone4_max_lactate = lt2_lactate_value + Math.max(0.2, ltGap * 0.12);
      
      // Zone 5: above LT2
      const zone5_min_lactate = zone4_max_lactate;
      const zone5_max_lactate = Math.max(zone5_min_lactate + 0.6, lt2_lactate_value + Math.max(0.8, ltGap * 0.8));
      
      // Ensure proper ordering and reasonable ranges
      const finalZone1 = {
        min: Math.max(0.5, Math.min(zone1_min_lactate, zone1_max_lactate)),
        max: Math.max(zone1_min_lactate, zone1_max_lactate, 1.0)
      };
      const finalZone2 = {
        min: Math.max(finalZone1.max, Math.min(zone2_min_lactate, zone2_max_lactate)),
        max: Math.max(zone2_min_lactate, zone2_max_lactate)
      };
      const finalZone3 = {
        min: Math.max(finalZone2.max, Math.min(zone3_min_lactate, zone3_max_lactate)),
        max: Math.min(lt2_lactate_value * 0.95, Math.max(zone3_min_lactate, zone3_max_lactate)) // Cap at 95% of LT2
      };
      const finalZone4 = {
        min: Math.max(finalZone3.max, Math.min(zone4_min_lactate, zone4_max_lactate)),
        max: Math.max(zone4_min_lactate, zone4_max_lactate)
      };
      const finalZone5 = {
        min: Math.max(finalZone4.max, Math.min(zone5_min_lactate, zone5_max_lactate)),
        max: Math.max(zone5_min_lactate, zone5_max_lactate)
      };
      
      const calculated = {
        power: {
          zone1: {
            min: zone1_min_power,
            max: zone1_max_power,
            description: '< 90% LT1 (recovery / easy)',
            hr: hasHR ? `${Math.round(hr1*0.50)}–${Math.round(hr1*0.90)} BPM` : 'N/A',
            percent: '< 90% LT1',
            lactate: `${finalZone1.min.toFixed(1)}–${finalZone1.max.toFixed(1)}`,
          },
          zone2: {
            min: zone2_min_power,
            max: zone2_max_power,
            description: '90%–100% LT1',
            hr: hasHR ? `${Math.round(hr1*0.90)}–${Math.round(hr1*1.00)} BPM` : 'N/A',
            percent: '90–100% LT1',
            lactate: `${finalZone2.min.toFixed(1)}–${finalZone2.max.toFixed(1)}`,
          },
          zone3: {
            min: zone3_min_power,
            max: zone3_max_power,
            description: '100% LT1 – 95% LT2',
            hr: hasHR ? `${Math.round(hr1*1.00)}–${Math.round(hr2*0.95)} BPM` : 'N/A',
            percent: '100% LT1 – 95% LT2',
            lactate: `${finalZone3.min.toFixed(1)}–${finalZone3.max.toFixed(1)}`,
          },
          zone4: {
            min: zone4_min_power,
            max: zone4_max_power,
            description: '96%–104% LT2 (threshold)',
            hr: hasHR ? `${Math.round(hr2*0.96)}–${Math.round(hr2*1.04)} BPM` : 'N/A',
            percent: '96–104% LT2',
            // Use the calculated range for this specific test (no hardcoded 4.0 anchor)
            lactate: `${finalZone4.min.toFixed(1)}–${finalZone4.max.toFixed(1)}`,
          },
          zone5: {
            min: zone5_min_power,
            max: zone5_max_power,
            description: '> 105% LT2 (VO₂max+ / sprint)',
            hr: hasHR ? `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.30)} BPM` : 'N/A',
            percent: '> 105% LT2',
            // Use the calculated range for this specific test (no hardcoded 4.0 anchor)
            lactate: `${finalZone5.min.toFixed(1)}–${finalZone5.max.toFixed(1)}`,
          },
        },
        heartRate: hasHR ? {
          zone1: { min: Math.round(hr1*0.50), max: Math.round(hr1*0.90) },
          zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
          zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
          zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
          zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.30) },
        } : null
      };
      setZones(applyTestZoneOverrides(calculated, sport));
    } else if (storageMode === 'speed') {
      const lt1_kmh = lt1_value;
      const lt2_kmh = lt2_value;

      console.log(`[Zones Run/Swim Speed] LTP1: ${lt1_kmh} km/h LTP2: ${lt2_kmh} km/h`);

      const zone1_min_speed = lt1_kmh * 0.50;
      const zone1_max_speed = lt1_kmh * 0.90;
      const zone2_min_speed = lt1_kmh * 0.90;
      const zone2_max_speed = lt1_kmh * 1.00;
      const zone3_min_speed = lt1_kmh * 1.00;
      const zone3_max_speed = lt2_kmh * 0.95;
      const zone4_min_speed = lt2_kmh * 0.96;
      const zone4_max_speed = lt2_kmh * 1.04;
      const zone5_min_speed = lt2_kmh * 1.05;
      const zone5_max_speed = lt2_kmh * 1.30;

      const lt1_lactate_value_speed = lt1_lactate || getLactateForPower(lt1_kmh, mockData.results, sport, true) || 2.0;
      const lt2_lactate_value_speed = lt2_lactate || getLactateForPower(lt2_kmh, mockData.results, sport, true) || 4.0;

      const ltGapSpeed = Math.max(0.4, lt2_lactate_value_speed - lt1_lactate_value_speed);
      const z2HeadroomSpeed = Math.max(0.5, Math.min(1.2, ltGapSpeed * 0.45));

      const zone1_min_lactate_speed = Math.max(0.7, baseLactate);
      const zone1_max_lactate_speed = Math.max(zone1_min_lactate_speed + 0.2, lt1_lactate_value_speed - z2HeadroomSpeed);
      const zone2_min_lactate_speed = zone1_max_lactate_speed;
      const zone2_max_lactate_speed = lt1_lactate_value_speed;
      const zone3_min_lactate_speed = lt1_lactate_value_speed;
      const zone3_max_lactate_speed = Math.max(zone3_min_lactate_speed + 0.4, lt2_lactate_value_speed - Math.max(0.2, ltGapSpeed * 0.15));
      const zone4_min_lactate_speed = Math.max(zone3_max_lactate_speed, lt2_lactate_value_speed - Math.max(0.2, ltGapSpeed * 0.08));
      const zone4_max_lactate_speed = lt2_lactate_value_speed + Math.max(0.2, ltGapSpeed * 0.12);
      const zone5_min_lactate_speed = zone4_max_lactate_speed;
      const zone5_max_lactate_speed = Math.max(zone5_min_lactate_speed + 0.6, lt2_lactate_value_speed + Math.max(0.8, ltGapSpeed * 0.8));

      const finalZone1Speed = {
        min: Math.max(0.5, Math.min(zone1_min_lactate_speed, zone1_max_lactate_speed)),
        max: Math.max(zone1_min_lactate_speed, zone1_max_lactate_speed, 1.0),
      };
      const finalZone2Speed = {
        min: Math.max(finalZone1Speed.max, Math.min(zone2_min_lactate_speed, zone2_max_lactate_speed)),
        max: Math.max(zone2_min_lactate_speed, zone2_max_lactate_speed),
      };
      const finalZone3Speed = {
        min: Math.max(finalZone2Speed.max, Math.min(zone3_min_lactate_speed, zone3_max_lactate_speed)),
        max: Math.min(lt2_lactate_value_speed * 0.95, Math.max(zone3_min_lactate_speed, zone3_max_lactate_speed)),
      };
      const finalZone4Speed = {
        min: Math.max(finalZone3Speed.max, Math.min(zone4_min_lactate_speed, zone4_max_lactate_speed)),
        max: Math.max(zone4_min_lactate_speed, zone4_max_lactate_speed),
      };
      const finalZone5Speed = {
        min: Math.max(finalZone4Speed.max, Math.min(zone5_min_lactate_speed, zone5_max_lactate_speed)),
        max: Math.max(zone5_min_lactate_speed, zone5_max_lactate_speed),
      };

      const calculated = {
        speed: {
          zone1: {
            min: toDisplaySpeed(zone1_min_speed),
            max: toDisplaySpeed(zone1_max_speed),
            description: '< 90% LT1 (recovery / easy)',
            hr: hasHR ? `${Math.round(hr1 * 0.50)}–${Math.round(hr1 * 0.90)} BPM` : 'N/A',
            percent: '< 90% LT1',
            lactate: `${finalZone1Speed.min.toFixed(1)}–${finalZone1Speed.max.toFixed(1)}`,
          },
          zone2: {
            min: toDisplaySpeed(zone2_min_speed),
            max: toDisplaySpeed(zone2_max_speed),
            description: '90%–100% LT1',
            hr: hasHR ? `${Math.round(hr1 * 0.90)}–${Math.round(hr1 * 1.00)} BPM` : 'N/A',
            percent: '90–100% LT1',
            lactate: `${finalZone2Speed.min.toFixed(1)}–${finalZone2Speed.max.toFixed(1)}`,
          },
          zone3: {
            min: toDisplaySpeed(zone3_min_speed),
            max: toDisplaySpeed(zone3_max_speed),
            description: '100% LT1 – 95% LT2',
            hr: hasHR ? `${Math.round(hr1 * 1.00)}–${Math.round(hr2 * 0.95)} BPM` : 'N/A',
            percent: '100% LT1 – 95% LT2',
            lactate: `${finalZone3Speed.min.toFixed(1)}–${finalZone3Speed.max.toFixed(1)}`,
          },
          zone4: {
            min: toDisplaySpeed(zone4_min_speed),
            max: toDisplaySpeed(zone4_max_speed),
            description: '96%–104% LT2 (threshold)',
            hr: hasHR ? `${Math.round(hr2 * 0.96)}–${Math.round(hr2 * 1.04)} BPM` : 'N/A',
            percent: '96–104% LT2',
            lactate: `${finalZone4Speed.min.toFixed(1)}–${finalZone4Speed.max.toFixed(1)}`,
          },
          zone5: {
            min: toDisplaySpeed(zone5_min_speed),
            max: toDisplaySpeed(zone5_max_speed),
            description: '> 105% LT2 (VO₂max+ / sprint)',
            hr: hasHR ? `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.30)} BPM` : 'N/A',
            percent: '> 105% LT2',
            lactate: `${finalZone5Speed.min.toFixed(1)}–${finalZone5Speed.max.toFixed(1)}`,
          },
        },
        heartRate: hasHR ? {
          zone1: { min: Math.round(hr1 * 0.50), max: Math.round(hr1 * 0.90) },
          zone2: { min: Math.round(hr1 * 0.90), max: Math.round(hr1 * 1.00) },
          zone3: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 0.95) },
          zone4: { min: Math.round(hr2 * 0.96), max: Math.round(hr2 * 1.04) },
          zone5: { min: Math.round(hr2 * 1.05), max: Math.round(hr2 * 1.30) },
        } : null,
      };
      setZones(applyTestZoneOverrides(calculated, sport));
    } else {
      // Pro run/swim: použít tempo (sekundy)
      const lt1_sec = lt1_value;
      const lt2_sec = lt2_value;
    const fmt = s => formatPace(s);
      
      console.log(`[Zones Run/Swim] LTP1: ${lt1_sec} (${fmt(lt1_sec)}) LTP2: ${lt2_sec} (${fmt(lt2_sec)})`);
      
    // NOVÁ LOGIKA: dělení pro tempo, násobení pro HR
      // Pro pace: min = pomalejší (více sekund), max = rychlejší (méně sekund)
      const zone1_min_pace_sec = lt1_sec / 0.50; // pomalejší (více sekund) — spodek < 90 % LT1
      const zone1_max_pace_sec = lt1_sec / 0.90; // rychlejší = hranice 90 % LT1
      const zone2_min_pace_sec = lt1_sec / 0.90;
      const zone2_max_pace_sec = lt1_sec / 1.00;
      const zone3_min_pace_sec = lt1_sec / 1.00;
      const zone3_max_pace_sec = lt2_sec / 0.95;
      const zone4_min_pace_sec = lt2_sec / 0.96;
      const zone4_max_pace_sec = lt2_sec / 1.04;
      const zone5_min_pace_sec = lt2_sec / 1.05;
      const zone5_max_pace_sec = lt2_sec / 1.30;
      
      // Calculate lactate values based on LTP1 and LTP2 lactate values (for pace)
      // If we have lactate values from thresholds, use them; otherwise interpolate from test data
      const lt1_lactate_value_pace = lt1_lactate || getLactateForPower(lt1_sec, mockData.results, sport) || 2.0;
      const lt2_lactate_value_pace = lt2_lactate || getLactateForPower(lt2_sec, mockData.results, sport) || 4.0;
      
      // Same physiological shaping for run/swim pace zones.
      const ltGapPace = Math.max(0.4, lt2_lactate_value_pace - lt1_lactate_value_pace);
      const z2HeadroomPace = Math.max(0.5, Math.min(1.2, ltGapPace * 0.45));

      const zone1_min_lactate_pace = Math.max(0.7, baseLactate);
      const zone1_max_lactate_pace = Math.max(zone1_min_lactate_pace + 0.2, lt1_lactate_value_pace - z2HeadroomPace);
      
      const zone2_min_lactate_pace = zone1_max_lactate_pace;
      const zone2_max_lactate_pace = lt1_lactate_value_pace;
      
      const zone3_min_lactate_pace = lt1_lactate_value_pace;
      const zone3_max_lactate_pace = Math.max(zone3_min_lactate_pace + 0.4, lt2_lactate_value_pace - Math.max(0.2, ltGapPace * 0.15));
      
      const zone4_min_lactate_pace = Math.max(zone3_max_lactate_pace, lt2_lactate_value_pace - Math.max(0.2, ltGapPace * 0.08));
      const zone4_max_lactate_pace = lt2_lactate_value_pace + Math.max(0.2, ltGapPace * 0.12);
      
      const zone5_min_lactate_pace = zone4_max_lactate_pace;
      const zone5_max_lactate_pace = Math.max(zone5_min_lactate_pace + 0.6, lt2_lactate_value_pace + Math.max(0.8, ltGapPace * 0.8));
      
      // Ensure proper ordering and reasonable ranges
      const finalZone1Pace = {
        min: Math.max(0.5, Math.min(zone1_min_lactate_pace, zone1_max_lactate_pace)),
        max: Math.max(zone1_min_lactate_pace, zone1_max_lactate_pace, 1.0)
      };
      const finalZone2Pace = {
        min: Math.max(finalZone1Pace.max, Math.min(zone2_min_lactate_pace, zone2_max_lactate_pace)),
        max: Math.max(zone2_min_lactate_pace, zone2_max_lactate_pace)
      };
      const finalZone3Pace = {
        min: Math.max(finalZone2Pace.max, Math.min(zone3_min_lactate_pace, zone3_max_lactate_pace)),
        max: Math.min(lt2_lactate_value_pace * 0.95, Math.max(zone3_min_lactate_pace, zone3_max_lactate_pace)) // Cap at 95% of LT2
      };
      const finalZone4Pace = {
        min: Math.max(finalZone3Pace.max, Math.min(zone4_min_lactate_pace, zone4_max_lactate_pace)),
        max: Math.max(zone4_min_lactate_pace, zone4_max_lactate_pace)
      };
      const finalZone5Pace = {
        min: Math.max(finalZone4Pace.max, Math.min(zone5_min_lactate_pace, zone5_max_lactate_pace)),
        max: Math.max(zone5_min_lactate_pace, zone5_max_lactate_pace)
      };
      
    const calculated = {
      pace: {
        zone1: {
            min: fmt(zone1_min_pace_sec), // pomalejší (více sekund)
            max: fmt(zone1_max_pace_sec), // rychlejší (méně sekund)
          description: '< 90% LT1 (recovery / easy)',
          hr: `${Math.round(hr1*0.50)}–${Math.round(hr1*0.90)} BPM`,
          percent: '< 90% LT1',
          lactate: `${finalZone1Pace.min.toFixed(1)}–${finalZone1Pace.max.toFixed(1)}`,
        },
        zone2: {
            min: fmt(zone2_min_pace_sec), // pomalejší
            max: fmt(zone2_max_pace_sec), // rychlejší
          description: '90%–100% LT1',
          hr: `${Math.round(hr1*0.90)}–${Math.round(hr1*1.00)} BPM`,
          percent: '90–100% LT1',
          lactate: `${finalZone2Pace.min.toFixed(1)}–${finalZone2Pace.max.toFixed(1)}`,
        },
        zone3: {
            min: fmt(zone3_min_pace_sec), // pomalejší
            max: fmt(zone3_max_pace_sec), // rychlejší
          description: '100% LT1 – 95% LT2',
          hr: `${Math.round(hr1*1.00)}–${Math.round(hr2*0.95)} BPM`,
          percent: '100% LT1 – 95% LT2',
          lactate: `${finalZone3Pace.min.toFixed(1)}–${finalZone3Pace.max.toFixed(1)}`,
        },
        zone4: {
            min: fmt(zone4_min_pace_sec), // pomalejší
            max: fmt(zone4_max_pace_sec), // rychlejší
          description: '96%–104% LT2 (threshold)',
          hr: `${Math.round(hr2*0.96)}–${Math.round(hr2*1.04)} BPM`,
          percent: '96–104% LT2',
          // Use the calculated range for this specific test (no hardcoded 4.0 anchor)
          lactate: `${finalZone4Pace.min.toFixed(1)}–${finalZone4Pace.max.toFixed(1)}`,
        },
        zone5: {
            min: fmt(zone5_min_pace_sec), // pomalejší
            max: fmt(zone5_max_pace_sec), // rychlejší
          description: '> 105% LT2 (VO₂max+ / sprint)',
          hr: `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.30)} BPM`,
          percent: '> 105% LT2',
          // Use the calculated range for this specific test (no hardcoded 4.0 anchor)
          lactate: `${finalZone5Pace.min.toFixed(1)}–${finalZone5Pace.max.toFixed(1)}`,
        },
      },
      heartRate: {
        zone1: { min: Math.round(hr1*0.50), max: Math.round(hr1*0.90) },
        zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
        zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
        zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
        zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.30) },
      }
    };
    setZones(applyTestZoneOverrides(calculated, sport));
    }
  }, [mockData, applyTestZoneOverrides, zoneModel, storageMode, toDisplaySpeed]);

  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [mockData, calculateTrainingZones]);

  // Recompute zones when user overrides are saved for this test
  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [testZoneOverrides, mockData, calculateTrainingZones]);

  // Load user profile for EditProfileModal (only when not in demo mode)
  useEffect(() => {
    if (demoMode) {
      return; // Don't load user profile in demo mode
    }
    
    const loadUserProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        setUserProfile(response.data);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();
  }, [demoMode]);




  // Check if baseLactate is missing or zero
  const hasBaseLactate = mockData?.baseLactate && mockData.baseLactate > 0;

  if (!zones) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No valid test data available for zone calculation</div>
        {!hasBaseLactate && (
          <div className="mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm max-w-full">
            <div className="space-y-1">
              <p>⚠️ <strong>Base lactate is missing or zero.</strong></p>
              <p>Please edit the test and add base lactate value for accurate zone calculations.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">



      {/* Combined Training Zones Table */}
      <div className="relative flex flex-col gap-2 sm:gap-4 p-2 sm:p-4 bg-white/60 backdrop-blur-lg rounded-2xl sm:rounded-3xl border border-white/30 shadow-xl mt-3 sm:mt-5 overflow-hidden">
        {!hasBaseLactate && (
          <div className="px-3 sm:px-4 py-2 bg-red-50 border-l-4 border-red-500 rounded-lg mb-3 max-w-full">
            <div className="flex items-start gap-2">
              <span className="text-red-600 font-bold flex-shrink-0 mt-0.5">⚠️</span>
              <div className="text-sm text-red-700 break-words space-y-1">
                <p><strong>Base lactate is missing or zero.</strong></p>
                <p>Please edit the test and add base lactate value for accurate threshold and zone calculations.</p>
              </div>
            </div>
          </div>
        )}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-white/20 bg-white/20 rounded-t-2xl sm:rounded-t-3xl backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 drop-shadow-[0_1px_8px_rgba(0,0,30,0.10)]">
                  Training Zones Table
                </h4>
                <p className="text-xs sm:text-sm text-gray-700 mt-1">
                  Training zones from selected test
                </p>
                {selectedTestDate && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    Date: {new Date(selectedTestDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowGlossary(true)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Show glossary"
                title="Training Glossary"
              >
                <InformationCircleIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Zone model toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shadow-sm">
                <button
                  onClick={() => setZoneModel('5zone')}
                  className={`px-2.5 py-1.5 transition-colors ${zoneModel === '5zone' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Classic 5-zone LT-based model"
                >
                  5-Zone
                </button>
                <button
                  onClick={() => setZoneModel('seiler')}
                  className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${zoneModel === 'seiler' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Seiler polarized 3-zone model"
                >
                  Seiler 3
                </button>
              </div>
              {!demoMode && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-sm hover:shadow-md text-sm font-medium"
                >
                  Set Zones
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0 max-w-[320px] sm:max-w-full mx-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="w-full min-w-[300px] sm:min-w-full md:min-w-full select-text">
            <thead className="bg-white/10">
              <tr>
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Zone</th>
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20 hidden sm:table-cell">Description</th>
                {selectedSport === 'bike' && (
                    <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Power (W)</th>
                )}
                {(selectedSport === 'run' || selectedSport === 'swim') && (
                    <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">
                    {displayMode === 'pace' ? 
                      (selectedSport === 'swim' ? 
                        (unitSystem === 'imperial' ? 'Pace /100yd' : 'Pace /100m') :
                        (unitSystem === 'imperial' ? 'Pace /mile' : 'Pace /km')
                      ) :
                      (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
                    }
                  </th>
                )}
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">HR</th>
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Lactate</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-white/30 rounded-b-3xl">
              {Object.entries(zones.power || zones.speed || zones.pace || zones.heartRate).map(([zoneKey, zone], index) => {
                const zoneNumber = parseInt(zoneKey.replace('zone', ''));
                const currentZones = zones;
                const powerZone = currentZones.power || currentZones.speed || currentZones.pace;
                const hrZone = currentZones.heartRate;

                // Use actual lactate values from zone calculation if available
                const lactateValue = zone.lactate || null;

                return (
                  <motion.tr
                    key={zoneKey}
                    className={
                      `transition-all duration-200 ` +
                      'hover:bg-white/40 hover:backdrop-blur pb-1 '
                    }
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.07, duration: 0.25 }}
                  >
                    {/* ZONE NUMBER + DOT */}
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20">
                      <div className="flex items-center">
                        <span className={
                          `w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 rounded-full mr-1 sm:mr-2 md:mr-3 inline-block border border-white/70 shadow ` +
                          (zoneModel === 'seiler'
                            ? [
                                'bg-blue-400/70',   // Z1 Base – modrá (klid)
                                'bg-amber-400/70',  // Z2 Tempo – oranžová
                                'bg-red-500/70',    // Z3 High – červená
                              ][zoneNumber - 1] || 'bg-gray-200/60'
                            : [
                                'bg-blue-400/70',   // Z1 Recovery – modrá
                                'bg-green-400/70',  // Z2 Base – zelená
                                'bg-yellow-400/70', // Z3 Tempo – žlutá
                                'bg-orange-400/70', // Z4 Threshold – oranžová
                                'bg-red-500/70',    // Z5 VO2max – červená
                              ][zoneNumber - 1] || 'bg-gray-200/60')
                        } />
                        <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 tracking-wide drop-shadow-[0_0.5px_2px_rgba(0,0,20,0.06)]">
                          {zoneNumber}
                        </span>
                      </div>
                    </td>
                    {/* DESCRIPTION */}
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20 hidden sm:table-cell">
                      <span className="text-xs sm:text-sm font-normal text-gray-700">{zone.description}</span>
                    </td>
                    {/* POWER/PASTE/SPEED column */}
                    {selectedSport === 'bike' && powerZone && (
                      <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20">
                          <span className="text-xs sm:text-sm text-gray-900 font-mono font-normal tracking-tight">
                            {powerZone[zoneKey] ? `${powerZone[zoneKey].min}-${powerZone[zoneKey].max}W` : '-'}
                          </span>
                      </td>
                    )}
                    {(selectedSport === 'run' || selectedSport === 'swim') && powerZone && (
                      <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20">
                          <span className="text-xs sm:text-sm text-gray-900 font-mono font-normal tracking-tight break-words">
                            {powerZone[zoneKey] ? 
                              (displayMode === 'speed' ? 
                                (() => {
                                  const z = powerZone[zoneKey];
                                  const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                                  if (currentZones.speed && typeof z.min === 'number') {
                                    return `${Number(z.min).toFixed(1)}–${Number(z.max).toFixed(1)} ${speedUnit}`;
                                  }
                                  const minSpeed = convertPaceToSpeed(z.min, unitSystem);
                                  const maxSpeed = convertPaceToSpeed(z.max, unitSystem);
                                  return `${minSpeed.toFixed(1)}–${maxSpeed.toFixed(1)} ${speedUnit}`;
                                })() :
                                (powerZone[zoneKey].max && powerZone[zoneKey].min) ?
                                  `${powerZone[zoneKey].min}–${powerZone[zoneKey].max}` :
                                  powerZone[zoneKey].min ?
                                    `>${powerZone[zoneKey].min}` :
                                  powerZone[zoneKey].max ?
                                    `<${powerZone[zoneKey].max}` :
                                  '-'
                              ) : '-'
                            }
                          </span>
                      </td>
                    )}
                    {/* HR COLUMN */}
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20">
                        <span className="text-xs sm:text-sm text-gray-900 font-mono font-normal tracking-tight">
                          {hrZone && hrZone[zoneKey] ? `${hrZone[zoneKey].min}-${hrZone[zoneKey].max}` : '-'}
                        </span>
                    </td>
                    {/* LACTATE */}
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4">
                      <span className="text-xs sm:text-sm text-gray-900 font-mono font-normal tracking-tight">
                        {lactateValue ? `${lactateValue} mmol/L` : '-'}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile description tooltip */}
        <div className="sm:hidden px-3 py-2 text-xs text-gray-600 bg-white/30 rounded-lg mx-3 mb-3">
          <p className="font-medium mb-1">Tip:</p>
          <p>Scroll horizontally to see all columns. Tap zone numbers to see descriptions.</p>
        </div>
      </div>
      {/* Recommendations - minimalist card only */}
      <div className="rounded-xl sm:rounded-xl px-3 sm:px-4 py-3 sm:py-4 bg-white/40 backdrop-blur-sm mt-4 shadow text-gray-700">
        <h4 className="text-sm sm:text-base font-semibold text-blue-900 mb-2">Training Zone Reference</h4>
        {zoneModel === 'seiler' ? (
          <ul className="text-xs sm:text-sm space-y-1.5 sm:space-y-1">
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 1 (Polarized Base):</span> <span className="hidden sm:inline text-gray-500">&lt; LT1 · </span>Easy aerobic — bulk of training volume (≥80%)</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-amber-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 2 (Tempo):</span> <span className="hidden sm:inline text-gray-500">LT1–LT2 · </span>Threshold work — use sparingly (~5%)</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-red-500/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 3 (High Intensity):</span> <span className="hidden sm:inline text-gray-500">&gt; LT2 · </span>VO₂max intervals — targeted quality (~15%)</span></li>
          </ul>
        ) : (
          <ul className="text-xs sm:text-sm space-y-1.5 sm:space-y-1">
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 1 (Recovery/Easy):</span> <span className="hidden sm:inline text-gray-500">&lt;90% LT1 · </span>Long easy runs &amp; recovery</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-green-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 2 (Base):</span> <span className="hidden sm:inline text-gray-500">90–100% LT1 · </span>Aerobic base building</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-yellow-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 3 (Tempo):</span> <span className="hidden sm:inline text-gray-500">LT1–LT2 · </span>Marathon / sweet spot</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-orange-400/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 4 (Threshold):</span> <span className="hidden sm:inline text-gray-500">~LT2 · </span>Threshold / interval, high aerobic</span></li>
            <li className="flex items-start gap-2"><span className="mt-1 w-2.5 h-2.5 rounded-full bg-red-500/70 border border-white/70 shadow flex-shrink-0" /><span><span className="font-medium text-gray-900">Zone 5 (VO2max+):</span> <span className="hidden sm:inline text-gray-500">&gt;105% LT2 · </span>Fast repeats, <b>max</b> zone</span></li>
          </ul>
        )}
      </div>

     
      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        zonesOnly={true}
        onSubmit={async (formData) => {
          try {
            const testId = mockData?._id || '';
            const testDateRaw = mockData?.date || mockData?.createdAt || mockData?.timestamp || '';
            const testDate = testDateRaw ? new Date(testDateRaw).toISOString() : '';
            const sportTag = selectedSport === 'bike' ? 'cycling' : selectedSport === 'run' ? 'running' : selectedSport === 'swim' ? 'swimming' : selectedSport;
            const zonesNote = [`testId=${testId || 'n/a'}`, `sport=${sportTag}`, `date=${testDate || 'n/a'}`].join(' | ');
            await updateUserProfile({
              ...formData,
              zonesSource: 'test',
              zonesNote,
            });
            if (testId) {
              const newOverrides = {
                powerZones: formData.powerZones,
                heartRateZones: formData.heartRateZones,
                source: 'set-zones',
                updatedAt: new Date().toISOString()
              };
              await updateTest(testId, {
                zoneOverrides: newOverrides
              });
              setTestZoneOverrides(newOverrides);
              setLocalTestOverrides(testId, newOverrides);
            }
            setIsEditModalOpen(false);
            const profileResponse = await api.get('/user/profile');
            setUserProfile(profileResponse.data);
          } catch (error) {
            console.error('Error updating profile:', error);
            alert('Error updating profile');
          }
        }}
        userData={getProfileDataWithZones()}
      />

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Training Zones"
        initialCategory="Lactate"
      />
    </div>
  );
};

export default TrainingZonesGenerator;
