/**
 * Rule-based training load / recovery alerts (server + mirrored on client).
 */

function baseline(values, excludeLast = true) {
  const pool = excludeLast ? values.slice(0, -1) : values;
  const nums = pool.filter((v) => v != null && v > 0);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function normSport(sport) {
  const v = String(sport || '').toLowerCase();
  if (v.includes('ride') || v.includes('bike') || v.includes('cycle')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

/**
 * @param {Array<{ date, Form, Fatigue, Fitness }>} series chronological PMC rows
 * @param {Array<{ date, hrvMs?, restingHeartRate? }>} wellness chronological
 */
function evaluateTrainingAlerts(series = [], wellness = [], { complianceStreak = 0 } = {}) {
  const alerts = [];
  if (!series.length) return { alerts, highSeverity: false };

  const latest = series[series.length - 1];
  const form = latest?.Form != null ? Number(latest.Form) : null;
  const fatigue = latest?.Fatigue != null ? Number(latest.Fatigue) : null;

  const last3Form = series.slice(-3).map((d) => d.Form);
  if (last3Form.length === 3 && last3Form.every((f) => f != null && f < -30)) {
    alerts.push({
      id: 'acute_fatigue',
      severity: 'warning',
      title: 'Form velmi nízká',
      body: 'TSB pod −30 tři dny po sobě — zvaž recovery den.',
      push: false,
    });
  }

  const weekAgo = series.length >= 8 ? series[series.length - 8] : null;
  if (fatigue != null && weekAgo?.Fatigue > 0) {
    const growth = (fatigue - weekAgo.Fatigue) / weekAgo.Fatigue;
    if (growth > 0.3) {
      alerts.push({
        id: 'atl_spike',
        severity: 'watch',
        title: 'Náhlý skok zátěže',
        body: `ATL narost o ${Math.round(growth * 100)} % za 7 dní — pozor na zranění.`,
        push: false,
      });
    }
  }

  const hrvVals = wellness.map((d) => d.hrvMs).filter((v) => v > 0);
  const hrvBase = baseline(hrvVals);
  const latestWell = wellness.length ? wellness[wellness.length - 1] : null;
  let hrvBad = false;
  if (hrvBase && latestWell?.hrvMs > 0) {
    const delta = (latestWell.hrvMs - hrvBase) / hrvBase;
    if (delta < -0.15) hrvBad = true;
    if (delta < -0.15 && form != null && form < -15) {
      alerts.push({
        id: 'hrv_load',
        severity: 'watch',
        title: 'HRV + zátěž',
        body: `HRV ${Math.round(Math.abs(delta) * 100)} % pod baseline a Form ${Math.round(form)} — dnes spíš Z1/Z2.`,
        push: false,
      });
    }
  }

  if (complianceStreak >= 3) {
    alerts.push({
      id: 'compliance',
      severity: 'watch',
      title: 'Plán vs. realita',
      body: `${complianceStreak}× po sobě Short/Missed — plán je možná moc ambiciózní.`,
      push: false,
    });
  }

  const highSeverity = form != null && form < -35 && hrvBad;
  if (highSeverity) {
    alerts.push({
      id: 'high_overreach',
      severity: 'warning',
      title: 'Vysoké riziko přetížení',
      body: `Form ${Math.round(form)} a potlačené HRV — prioritizuj regeneraci.`,
      push: true,
    });
  }

  return { alerts, highSeverity };
}

module.exports = { evaluateTrainingAlerts, baseline, normSport };
