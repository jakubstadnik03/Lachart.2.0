// Helper function to calculate training zones from test data
// Similar to TrainingZonesGenerator logic

import { calculateThresholds } from './DataTable';

const formatPace = (seconds) => {
  if (!seconds || seconds === 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const calculateZonesFromTest = (testData) => {
  if (!testData || !testData.results || testData.results.length < 3) {
    return null;
  }
  
  const sport = testData.sport || 'bike';
  const thresholds = calculateThresholds(testData);
  
  const lt1_value = thresholds['LTP1'];
  const lt2_value = thresholds['LTP2'];
  const hr1 = thresholds.heartRates['LTP1'];
  const hr2 = thresholds.heartRates['LTP2'];
  
  if (!lt1_value || !lt2_value || !hr1 || !hr2) {
    return null;
  }
  
  // Validation
  if (sport === 'bike') {
    if (lt2_value <= lt1_value) return null;
  } else {
    if (lt2_value >= lt1_value) return null;
  }
  
  if (sport === 'bike') {
    const lt1_watts = lt1_value;
    const lt2_watts = lt2_value;
    
    return {
      power: {
        zone1: { min: Math.round(lt1_watts * 0.70), max: Math.round(lt1_watts * 0.90) },
        zone2: { min: Math.round(lt1_watts * 0.90), max: Math.round(lt1_watts * 1.00) },
        zone3: { min: Math.round(lt1_watts * 1.00), max: Math.round(lt2_watts * 0.95) },
        zone4: { min: Math.round(lt2_watts * 0.96), max: Math.round(lt2_watts * 1.04) },
        zone5: { min: Math.round(lt2_watts * 1.05), max: Math.round(lt2_watts * 1.20) },
      },
      heartRate: {
        zone1: { min: Math.round(hr1*0.70), max: Math.round(hr1*0.90) },
        zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
        zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
        zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
        zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.20) },
      }
    };
  } else {
    // Run/Swim - pace in seconds
    const lt1_sec = lt1_value;
    const lt2_sec = lt2_value;
    const fmt = s => formatPace(s);
    
    return {
      pace: {
        zone1: { min: fmt(lt1_sec / 0.70), max: fmt(lt1_sec / 0.90) },
        zone2: { min: fmt(lt1_sec / 0.90), max: fmt(lt1_sec / 1.00) },
        zone3: { min: fmt(lt1_sec / 1.00), max: fmt(lt2_sec / 0.95) },
        zone4: { min: fmt(lt2_sec / 0.96), max: fmt(lt2_sec / 1.04) },
        zone5: { min: fmt(lt2_sec / 1.05), max: fmt(lt2_sec / 1.20) },
      },
      heartRate: {
        zone1: { min: Math.round(hr1*0.70), max: Math.round(hr1*0.90) },
        zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
        zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
        zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
        zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.20) },
      }
    };
  }
};


