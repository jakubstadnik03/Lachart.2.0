/**
 * Training zones from a lactate test (server-side)
 * Mirrors client `client/src/components/Testing-page/zoneCalculator.js`
 */

const { calculateThresholds } = require('./lactateThresholds');

function formatPace(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function calculateZonesFromTest(testData) {
  if (!testData || !Array.isArray(testData.results) || testData.results.length < 3) return null;

  const sport = testData.sport || 'bike';
  const thresholds = calculateThresholds(testData);

  const lt1 = Number(thresholds['LTP1'] || 0);
  const lt2 = Number(thresholds['LTP2'] || 0);
  const hr1 = Number(thresholds.heartRates?.['LTP1'] || 0);
  const hr2 = Number(thresholds.heartRates?.['LTP2'] || 0);

  if (!lt1 || !lt2 || !hr1 || !hr2) return null;

  // Validation
  if (sport === 'bike') {
    if (lt2 <= lt1) return null;
  } else {
    // pace sports: LTP2 is faster => lower seconds => lt2 < lt1
    if (lt2 >= lt1) return null;
  }

  const heartRate = {
    zone1: { min: Math.round(hr1 * 0.70), max: Math.round(hr1 * 0.90) },
    zone2: { min: Math.round(hr1 * 0.90), max: Math.round(hr1 * 1.00) },
    zone3: { min: Math.round(hr1 * 1.00), max: Math.round(hr2 * 0.95) },
    zone4: { min: Math.round(hr2 * 0.96), max: Math.round(hr2 * 1.04) },
    zone5: { min: Math.round(hr2 * 1.05), max: Math.round(hr2 * 1.20) }
  };

  if (sport === 'bike') {
    return {
      sport,
      lt1,
      lt2,
      power: {
        zone1: { min: Math.round(lt1 * 0.70), max: Math.round(lt1 * 0.90) },
        zone2: { min: Math.round(lt1 * 0.90), max: Math.round(lt1 * 1.00) },
        zone3: { min: Math.round(lt1 * 1.00), max: Math.round(lt2 * 0.95) },
        zone4: { min: Math.round(lt2 * 0.96), max: Math.round(lt2 * 1.04) },
        zone5: { min: Math.round(lt2 * 1.05), max: Math.round(lt2 * 1.20) }
      },
      heartRate
    };
  }

  // run/swim: pace seconds
  const paceSeconds = {
    zone1: { min: lt1 / 0.70, max: lt1 / 0.90 },
    zone2: { min: lt1 / 0.90, max: lt1 / 1.00 },
    zone3: { min: lt1 / 1.00, max: lt2 / 0.95 },
    zone4: { min: lt2 / 0.96, max: lt2 / 1.04 },
    zone5: { min: lt2 / 1.05, max: lt2 / 1.20 }
  };

  return {
    sport,
    lt1,
    lt2,
    pace: {
      zone1: { min: formatPace(paceSeconds.zone1.min), max: formatPace(paceSeconds.zone1.max), minSeconds: paceSeconds.zone1.min, maxSeconds: paceSeconds.zone1.max },
      zone2: { min: formatPace(paceSeconds.zone2.min), max: formatPace(paceSeconds.zone2.max), minSeconds: paceSeconds.zone2.min, maxSeconds: paceSeconds.zone2.max },
      zone3: { min: formatPace(paceSeconds.zone3.min), max: formatPace(paceSeconds.zone3.max), minSeconds: paceSeconds.zone3.min, maxSeconds: paceSeconds.zone3.max },
      zone4: { min: formatPace(paceSeconds.zone4.min), max: formatPace(paceSeconds.zone4.max), minSeconds: paceSeconds.zone4.min, maxSeconds: paceSeconds.zone4.max },
      zone5: { min: formatPace(paceSeconds.zone5.min), max: formatPace(paceSeconds.zone5.max), minSeconds: paceSeconds.zone5.min, maxSeconds: paceSeconds.zone5.max }
    },
    heartRate
  };
}

module.exports = {
  calculateZonesFromTest,
  formatPace
};


