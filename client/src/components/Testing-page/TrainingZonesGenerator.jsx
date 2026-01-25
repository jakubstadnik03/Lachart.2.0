
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { calculateThresholds, calculatePolynomialRegression } from './DataTable';
import EditProfileModal from '../Profile/EditProfileModal';
import api from '../../services/api';
import { updateUserProfile } from '../../services/api';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';
import { useAuth } from '../../context/AuthProvider';

const TrainingZonesGenerator = ({ mockData, demoMode = false }) => {
  const { user } = useAuth();
  const [zones, setZones] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  
  // Get unit system and input mode from user profile, mockData, or default to metric/pace
  const unitSystem = user?.units?.distance === 'imperial' ? 'imperial' : (mockData?.unitSystem || 'metric');
  const inputMode = mockData?.inputMode || 'pace';

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
    
    // Convert seconds per km to speed
    if (unitSystem === 'imperial') {
      // Convert pace (seconds per km) to speed (mph)
      // First convert to km/h, then to mph
      const kmh = 3600 / seconds;
      return kmh * 0.621371; // Convert km/h to mph
    } else {
      // Convert pace (seconds per km) to speed (km/h)
      return 3600 / seconds;
    }
  };

  // Helper function to interpolate lactate value for a given power/pace using polynomial regression
  const getLactateForPower = (powerValue, results, sport) => {
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
        if (sport === 'bike') {
          return a.power - b.power;
        } else {
          return b.power - a.power;
        }
      });
      
      // Check boundaries
      if (sport === 'bike') {
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
        
        const isBetween = sport === 'bike'
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
    
    if (zones.power) {
      // Bike zones - power is already in watts
      mergedData.powerZones.cycling = {
        ...mergedData.powerZones.cycling,
        zone1: { min: zones.power.zone1?.min || 0, max: zones.power.zone1?.max || 0 },
        zone2: { min: zones.power.zone2?.min || 0, max: zones.power.zone2?.max || 0 },
        zone3: { min: zones.power.zone3?.min || 0, max: zones.power.zone3?.max || 0 },
        zone4: { min: zones.power.zone4?.min || 0, max: zones.power.zone4?.max || 0 },
        zone5: { min: zones.power.zone5?.min || 0, max: zones.power.zone5?.max === Infinity ? Infinity : (zones.power.zone5?.max || 0) }
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
          max: parsePaceToSeconds(zones.pace.zone1?.max) || 0 
        },
        zone2: { 
          min: parsePaceToSeconds(zones.pace.zone2?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone2?.max) || 0 
        },
        zone3: { 
          min: parsePaceToSeconds(zones.pace.zone3?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone3?.max) || 0 
        },
        zone4: { 
          min: parsePaceToSeconds(zones.pace.zone4?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone4?.max) || 0 
        },
        zone5: { 
          min: parsePaceToSeconds(zones.pace.zone5?.min) || 0, 
          max: parsePaceToSeconds(zones.pace.zone5?.max) || 0 
        }
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
      // Pro run/swim: pace v sekundách, takže LTP2 (rychlejší tempo) musí být < LTP1 (pomalejší tempo)
      if (lt2_value >= lt1_value) {
        console.warn('[Zones] LTP2 >= LTP1, invalid combination for run/swim (pace)', { lt1_value, lt2_value, sport });
      setZones(null);
      return;
    }
    }
    
    // Pro bike: použít power hodnoty (watty), pro run/swim: použít tempo (sekundy)
    if (sport === 'bike') {
      // Pro bike jsou LTP1 a LTP2 už v power hodnotách (watty)
      const lt1_watts = lt1_value;
      const lt2_watts = lt2_value;
      
      console.log(`[Zones Bike] LTP1: ${lt1_watts}W LTP2: ${lt2_watts}W`);
      
      // Calculate lactate values for each zone based on actual test data
      const zone1_min_power = Math.round(lt1_watts * 0.70);
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
      
      // Calculate lactate ranges based on percentage of LTP1/LTP2
      // Zone 1: 70-90% LT1 -> 70-90% of LT1 lactate
      const zone1_min_lactate = baseLactate;
      const zone1_max_lactate = lt1_lactate_value * 0.9;
      
      // Zone 2: 90-100% LT1 -> 90-100% of LT1 lactate
      const zone2_min_lactate = lt1_lactate_value * 0.9;
      const zone2_max_lactate = lt1_lactate_value;
      
      // Zone 3: 100% LT1 - 95% LT2 -> interpolate between LT1 and 95% of LT2
      // This should end around 3.8 mmol/L if LT2 is 4.0
      const zone3_min_lactate = lt1_lactate_value;
      const zone3_max_lactate = lt2_lactate_value * 0.95; // 95% of LT2
      
      // Zone 4: 96-104% LT2 -> 96-104% of LT2 lactate (threshold zone)
      const zone4_min_lactate = lt2_lactate_value * 0.96;
      const zone4_max_lactate = lt2_lactate_value * 1.04;
      
      // Zone 5: 105-120% LT2 -> 105-120% of LT2 lactate
      const zone5_min_lactate = lt2_lactate_value * 1.05;
      const zone5_max_lactate = lt2_lactate_value * 1.20;
      
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
        max: Math.max(zone5_min_lactate, zone5_max_lactate, 8.0)
      };
      
      setZones({
        power: {
          zone1: {
            min: zone1_min_power,
            max: zone1_max_power,
            description: '70–90% LT1 (recovery, reference wide zone)',
            hr: hasHR ? `${Math.round(hr1*0.70)}–${Math.round(hr1*0.90)} BPM` : 'N/A',
            percent: '70–90% LT1',
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
            lactate: `${lt2_lactate_value.toFixed(1)}–4.0`,
          },
          zone5: {
            min: zone5_min_power,
            max: zone5_max_power,
            description: '105–120% LT2 (sprint/VO2max+ reference)',
            hr: hasHR ? `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.20)} BPM` : 'N/A',
            percent: '105–120% LT2',
            lactate: `4.0–${finalZone5.max.toFixed(1)}`,
          },
        },
        heartRate: hasHR ? {
          zone1: { min: Math.round(hr1*0.70), max: Math.round(hr1*0.90) },
          zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
          zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
          zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
          zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.20) },
        } : null
      });
    } else {
      // Pro run/swim: použít tempo (sekundy)
      const lt1_sec = lt1_value;
      const lt2_sec = lt2_value;
    const fmt = s => formatPace(s);
      
      console.log(`[Zones Run/Swim] LTP1: ${lt1_sec} (${fmt(lt1_sec)}) LTP2: ${lt2_sec} (${fmt(lt2_sec)})`);
      
    // NOVÁ LOGIKA: dělení pro tempo, násobení pro HR
      // Pro pace: min = pomalejší (více sekund), max = rychlejší (méně sekund)
      const zone1_min_pace_sec = lt1_sec / 0.70; // pomalejší (více sekund)
      const zone1_max_pace_sec = lt1_sec / 0.90; // rychlejší (méně sekund)
      const zone2_min_pace_sec = lt1_sec / 0.90;
      const zone2_max_pace_sec = lt1_sec / 1.00;
      const zone3_min_pace_sec = lt1_sec / 1.00;
      const zone3_max_pace_sec = lt2_sec / 0.95;
      const zone4_min_pace_sec = lt2_sec / 0.96;
      const zone4_max_pace_sec = lt2_sec / 1.04;
      const zone5_min_pace_sec = lt2_sec / 1.05;
      const zone5_max_pace_sec = lt2_sec / 1.20;
      
      // Calculate lactate values based on LTP1 and LTP2 lactate values (for pace)
      // If we have lactate values from thresholds, use them; otherwise interpolate from test data
      const lt1_lactate_value_pace = lt1_lactate || getLactateForPower(lt1_sec, mockData.results, sport) || 2.0;
      const lt2_lactate_value_pace = lt2_lactate || getLactateForPower(lt2_sec, mockData.results, sport) || 4.0;
      
      // Calculate lactate ranges based on percentage of LTP1/LTP2
      // Zone 1: 70-90% LT1 -> 70-90% of LT1 lactate
      const zone1_min_lactate_pace = baseLactate;
      const zone1_max_lactate_pace = lt1_lactate_value_pace * 0.9;
      
      // Zone 2: 90-100% LT1 -> 90-100% of LT1 lactate
      const zone2_min_lactate_pace = lt1_lactate_value_pace * 0.9;
      const zone2_max_lactate_pace = lt1_lactate_value_pace;
      
      // Zone 3: 100% LT1 - 95% LT2 -> interpolate between LT1 and 95% of LT2
      // This should end around 3.8 mmol/L if LT2 is 4.0
      const zone3_min_lactate_pace = lt1_lactate_value_pace;
      const zone3_max_lactate_pace = lt2_lactate_value_pace * 0.95; // 95% of LT2
      
      // Zone 4: 96-104% LT2 -> 96-104% of LT2 lactate (threshold zone)
      const zone4_min_lactate_pace = lt2_lactate_value_pace * 0.96;
      const zone4_max_lactate_pace = lt2_lactate_value_pace * 1.04;
      
      // Zone 5: 105-120% LT2 -> 105-120% of LT2 lactate
      const zone5_min_lactate_pace = lt2_lactate_value_pace * 1.05;
      const zone5_max_lactate_pace = lt2_lactate_value_pace * 1.20;
      
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
        max: Math.max(zone5_min_lactate_pace, zone5_max_lactate_pace, 8.0)
      };
      
    setZones({
      pace: {
        zone1: {
            min: fmt(zone1_min_pace_sec), // pomalejší (více sekund)
            max: fmt(zone1_max_pace_sec), // rychlejší (méně sekund)
          description: '70–90% LT1 (recovery, reference wide zone)',
          hr: `${Math.round(hr1*0.90)}–${Math.round(hr1*0.70)} BPM`,
          percent: '70–90% LT1',
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
          lactate: `${lt2_lactate_value_pace.toFixed(1)}–4.0`,
        },
        zone5: {
            min: fmt(zone5_min_pace_sec), // pomalejší
            max: fmt(zone5_max_pace_sec), // rychlejší
          description: '105–120% LT2 (sprint/VO2max+ reference)',
          hr: `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.20)} BPM`,
          percent: '105–120% LT2',
          lactate: `4.0–${finalZone5Pace.max.toFixed(1)}`,
        },
      },
      heartRate: {
        zone1: { min: Math.round(hr1*0.70), max: Math.round(hr1*0.90) },
        zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
        zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
        zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
        zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.20) },
      }
    });
    }
  }, [mockData]);

  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [mockData, calculateTrainingZones]);

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
                    {inputMode === 'pace' ? 
                      (selectedSport === 'swim' ? 
                        (unitSystem === 'imperial' ? 'Pace /100yd' : 'Pace /100m') :
                        (unitSystem === 'imperial' ? 'Pace /mile' : 'Pace /km')
                      ) :
                      (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
                    }
                  </th>
                )}
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">HR</th>
                  <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20 hidden md:table-cell">Lactate</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-white/30 rounded-b-3xl">
              {Object.entries(zones.power || zones.pace || zones.speed || zones.heartRate).map(([zoneKey, zone], index) => {
                const zoneNumber = parseInt(zoneKey.replace('zone', ''));
                const currentZones = zones;
                const powerZone = currentZones.power || currentZones.pace || currentZones.speed;
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
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.09 }}
                  >
                    {/* ZONE NUMBER + DOT */}
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 border-r border-white/20">
                      <div className="flex items-center">
                        <span className={
                          `w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 rounded-full mr-1 sm:mr-2 md:mr-3 inline-block border border-white/70 shadow ` +
                          [
                            'bg-[#22c55e]/60', // 1 Bright Green - Recovery (matches LactateCurveCalculator)
                            'bg-[#3b82f6]/60', // 2 Blue - Aerobic (matches LactateCurveCalculator)
                            'bg-[#fbbf24]/60', // 3 Amber/Yellow - Tempo (matches LactateCurveCalculator)
                            'bg-[#ef4444]/60', // 4 Red - Threshold (matches LactateCurveCalculator)
                            'bg-[#8b5cf6]/60', // 5 Purple - VO2max (matches LactateCurveCalculator)
                          ][zoneNumber - 1] || 'bg-gray-200/60'
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
                              (inputMode === 'speed' ? 
                                (() => {
                                  // Convert pace to speed
                                  // Note: For pace zones, min is slower (higher seconds), max is faster (lower seconds)
                                  // For speed display: min should be slower (lower speed), max should be faster (higher speed)
                                  // So: slower pace (zone.min, higher seconds) -> lower speed
                                  //     faster pace (zone.max, lower seconds) -> higher speed
                                  const minSpeed = convertPaceToSpeed(powerZone[zoneKey].min, unitSystem); // Slower pace (higher seconds) = lower speed
                                  const maxSpeed = convertPaceToSpeed(powerZone[zoneKey].max, unitSystem); // Faster pace (lower seconds) = higher speed
                                  const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                                  // Display: slower speed first, then faster speed (e.g., "10.0–15.0 km/h")
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
                    <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 hidden md:table-cell">
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
        <ul className="text-xs sm:text-sm pl-2 sm:pl-3 space-y-1.5 sm:space-y-1">
          <li><span className="font-medium text-gray-900">Zone 1 (Recovery/Easy):</span> <span className="hidden sm:inline">&gt;110% LT1 : </span>Long easy runs &amp; recovery</li>
          <li><span className="font-medium text-gray-900">Zone 2 (Base):</span> <span className="hidden sm:inline">100–110% LT1 : </span>Aerobic base building</li>
          <li><span className="font-medium text-gray-900">Zone 3 (Tempo):</span> <span className="hidden sm:inline">LT1–LT2 : </span>Marathon/sweet spot/steady state</li>
          <li><span className="font-medium text-gray-900">Zone 4 (Threshold):</span> <span className="hidden sm:inline">95–100% LT2 : </span>Threshold/interval, high aerobic</li>
          <li><span className="font-medium text-gray-900">Zone 5 (VO2max+):</span> <span className="hidden sm:inline">&lt;95% LT2 : </span>Fast repeats, <b>max</b> zone</li>
        </ul>
      </div>

     
      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={async (formData) => {
          // Handle profile update with zones
          try {
            await updateUserProfile(formData);
            setIsEditModalOpen(false);
            // Reload user profile
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
