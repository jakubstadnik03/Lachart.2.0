const nodemailer = require('nodemailer');
const User = require('../models/UserModel');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
const { calculateThresholds } = require('../utils/lactateThresholds');
const { calculateZonesFromTest, formatPace } = require('../utils/lactateZones');
const { buildLactateCurveSvg, buildStagesSvg, escapeHtml } = require('../utils/lactateReportSvgs');

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

function formatDateShort(dateLike, locale = 'cs-CZ') {
  try {
    return new Date(dateLike).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatIntensity(value, { sport, unitSystem, inputMode }) {
  if (!Number.isFinite(value)) return '—';
  if (sport === 'bike') return `${Math.round(value)} W`;

  // run/swim: value is seconds when inputMode=pace in this app
  if (inputMode === 'pace') {
    const pace = formatPace(value);
    if (sport === 'swim') return `${pace}${unitSystem === 'imperial' ? '/100yd' : '/100m'}`;
    return `${pace}${unitSystem === 'imperial' ? '/mile' : '/km'}`;
  }

  // speed mode (value may still be seconds in data depending on UI; keep generic)
  return `${value.toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`;
}

function pickPreviousTest(tests, currentTest) {
  const curDate = new Date(currentTest.date || currentTest.createdAt || 0).getTime();
  const prev = (tests || [])
    .filter(t => String(t._id) !== String(currentTest._id))
    .filter(t => (t.sport === currentTest.sport))
    .filter(t => new Date(t.date || t.createdAt || 0).getTime() < curDate)
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))[0];
  return prev || null;
}

function buildFocusRecommendation({ sport, cur, prev }) {
  // cur/prev are threshold objects from calculateThresholds()
  const curLt1 = Number(cur?.['LTP1'] || 0);
  const curLt2 = Number(cur?.['LTP2'] || 0);
  const prevLt1 = Number(prev?.['LTP1'] || 0);
  const prevLt2 = Number(prev?.['LTP2'] || 0);

  const isPaceSport = sport === 'run' || sport === 'swim';
  // For pace sports: lower seconds is better. We'll convert "improvement" to percent better.
  const delta = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0) ? ((a - b) / b) : null;

  const lt1Change = prevLt1 && curLt1 ? delta(curLt1, prevLt1) : null;
  const lt2Change = prevLt2 && curLt2 ? delta(curLt2, prevLt2) : null;

  const bullets = [];
  const push = (title, body) => bullets.push({ title, body });

  if (prev && prevLt1 && prevLt2 && curLt1 && curLt2) {
    // For bike, higher watts is better; for pace, lower seconds is better.
    const lt1Improved = isPaceSport ? (curLt1 < prevLt1) : (curLt1 > prevLt1);
    const lt2Improved = isPaceSport ? (curLt2 < prevLt2) : (curLt2 > prevLt2);

    if (lt2Improved && !lt1Improved) {
      push('Threshold build', 'Your LT2 moved in the right direction while LT1 stayed similar. Emphasize tempo/threshold intervals (Z3–Z4) + sufficient recovery.');
    } else if (lt1Improved && !lt2Improved) {
      push('Aerobic base', 'Your LT1 improved more than LT2. Keep building aerobic volume (Z1–Z2) + long steady sessions.');
    } else if (lt1Improved && lt2Improved) {
      push('Balanced progress', 'Both LT1 and LT2 improved. Maintain a balanced mix: mostly Z1–Z2, plus 1–2 quality sessions per week.');
    } else {
      push('Consistency', 'No clear improvement vs previous test. Consider more consistent weeks and repeat the test under similar conditions.');
    }
  } else {
    push('Next steps', 'This is your first recorded test (or no older test found). Use these zones for 3–6 weeks, then re-test to measure progress.');
  }

  // Add a ratio-based hint (works for both, ratio computed in thresholds as string)
  const ratio = Number(cur?.['LTRatio'] || 0);
  if (ratio) {
    if (!isPaceSport && ratio < 1.15) push('Durability', 'LTRatio is on the lower side. Add longer steady endurance and progressive tempo to widen the aerobic-to-threshold gap.');
    if (isPaceSport && ratio > 1.6) push('Aerobic foundation', 'LTRatio is relatively high. Focus on aerobic consistency and controlled tempo work before very hard intervals.');
  }

  return bullets.slice(0, 3);
}

function renderZonesTable(zones, { sport }) {
  if (!zones) return '<p style="margin:0;color:#6b7280;">Zones could not be calculated from this test (missing LTP/HR).</p>';

  const rows = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'].map((z, idx) => {
    const zn = idx + 1;
    const hr = zones.heartRate?.[z];
    const main = (sport === 'bike') ? zones.power?.[z] : zones.pace?.[z];
    const mainText = sport === 'bike'
      ? `${main?.min ?? '—'}–${main?.max ?? '—'} W`
      : `${main?.min ?? '—'}–${main?.max ?? '—'}`;
    const hrText = hr ? `${hr.min}–${hr.max}` : '—';

    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;font-weight:700;">Z${zn}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;">${escapeHtml(mainText)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(hrText)}</td>
      </tr>
    `;
  }).join('');

  const mainHeader = sport === 'bike' ? 'Power' : 'Pace';

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Zone</th>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">${escapeHtml(mainHeader)}</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">HR</th>
      </tr>
      ${rows}
    </table>
  `.trim();
}

function renderThresholdsTable(thresholds, { sport, unitSystem, inputMode }) {
  const methods = [
    'Log-log', 'IAT',
    'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5',
    'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5',
    'LTP1', 'LTP2', 'LTRatio'
  ];

  const rows = methods.map(m => {
    const v = thresholds?.[m];
    const hr = thresholds?.heartRates?.[m];
    const la = thresholds?.lactates?.[m];

    const valueText = (m === 'LTRatio')
      ? (v ? String(v) : '—')
      : (v ? formatIntensity(Number(v), { sport, unitSystem, inputMode }) : '—');

    const hrText = (m === 'LTRatio') ? '—' : (hr ? String(Math.round(hr)) : '—');
    const laText = (m === 'LTRatio') ? '—' : (la ? Number(la).toFixed(2) : '—');

    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;font-weight:700;">${escapeHtml(m)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;">${escapeHtml(valueText)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(hrText)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(laText)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Method</th>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Value</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">HR</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">La</th>
      </tr>
      ${rows}
    </table>
  `.trim();
}

function renderResultsTable(test, { sport, unitSystem, inputMode }) {
  const rows = (test.results || []).map((r, idx) => {
    const stage = r.interval ?? (idx + 1);
    const p = formatIntensity(Number(r.power), { sport, unitSystem, inputMode });
    const hr = Number.isFinite(Number(r.heartRate)) ? Math.round(Number(r.heartRate)) : '—';
    const la = Number.isFinite(Number(r.lactate)) ? Number(r.lactate).toFixed(2) : '—';
    const rpe = Number.isFinite(Number(r.RPE)) ? Number(r.RPE) : '—';
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;font-weight:700;">${escapeHtml(stage)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;">${escapeHtml(p)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(hr)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(la)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;text-align:right;">${escapeHtml(rpe)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Stage</th>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Intensity</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">HR</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">La</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">RPE</th>
      </tr>
      ${rows || `<tr><td colspan="5" style="padding:10px 0;color:#6b7280;">No results</td></tr>`}
    </table>
  `.trim();
}

function renderUserInfo(user) {
  const dob = user?.dateOfBirth ? formatDateShort(user.dateOfBirth) : '—';
  const hw = [
    Number.isFinite(user?.height) ? `${user.height} cm` : null,
    Number.isFinite(user?.weight) ? `${user.weight} kg` : null
  ].filter(Boolean).join(' • ') || '—';

  return `
    <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
      <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:6px;">Athlete</div>
      <div style="color:#111827;font-weight:700;">${escapeHtml(`${user?.name || ''} ${user?.surname || ''}`.trim() || '—')}</div>
      <div style="color:#6b7280;font-size:13px;margin-top:2px;">
        Email: ${escapeHtml(user?.email || '—')}<br/>
        DOB: ${escapeHtml(dob)}<br/>
        Height/Weight: ${escapeHtml(hw)}<br/>
        Sport: ${escapeHtml(user?.sport || '—')} ${user?.specialization ? `• ${escapeHtml(user.specialization)}` : ''}
      </div>
    </div>
  `.trim();
}

function renderComparisonBlock({ sport, unitSystem, inputMode, currentTest, prevTest, curThr, prevThr }) {
  if (!prevTest) {
    return `<p style="margin:0;color:#6b7280;">No previous test found to compare.</p>`;
  }

  const curLt1 = Number(curThr?.['LTP1'] || 0);
  const curLt2 = Number(curThr?.['LTP2'] || 0);
  const prevLt1 = Number(prevThr?.['LTP1'] || 0);
  const prevLt2 = Number(prevThr?.['LTP2'] || 0);

  const curLabel = formatDateShort(currentTest.date);
  const prevLabel = formatDateShort(prevTest.date);

  const row = (name, curV, prevV) => {
    if (!curV || !prevV) return '';
    const isPace = sport === 'run' || sport === 'swim';
    const improved = isPace ? (curV < prevV) : (curV > prevV);
    const delta = isPace ? (prevV - curV) : (curV - prevV);
    const pct = prevV ? Math.round((delta / prevV) * 100) : 0;
    const color = improved ? '#16a34a' : '#ef4444';
    const arrow = improved ? '▲' : '▼';

    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;font-weight:800;">${escapeHtml(name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;">${escapeHtml(formatIntensity(curV, { sport, unitSystem, inputMode }))}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#111827;">${escapeHtml(formatIntensity(prevV, { sport, unitSystem, inputMode }))}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7;text-align:right;color:${color};font-weight:800;">${arrow} ${escapeHtml(String(pct))}%</td>
      </tr>
    `;
  };

  const rows = [
    row('LTP1', curLt1, prevLt1),
    row('LTP2', curLt2, prevLt2)
  ].filter(Boolean).join('');

  return `
    <div style="color:#6b7280;font-size:13px;margin-bottom:10px;">Comparing <strong style="color:#111827;">${escapeHtml(prevLabel)}</strong> → <strong style="color:#111827;">${escapeHtml(curLabel)}</strong></div>
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Metric</th>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Current</th>
        <th style="text-align:left;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Previous</th>
        <th style="text-align:right;padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;">Change</th>
      </tr>
      ${rows || `<tr><td colspan="4" style="padding:10px 0;color:#6b7280;">Not enough data to compare</td></tr>`}
    </table>
  `.trim();
}

function renderFocusBlock(bullets) {
  const items = (bullets || []).map(b => `
    <div style="margin:0 0 10px;">
      <div style="font-weight:800;color:#111827;">${escapeHtml(b.title)}</div>
      <div style="color:#4b5563;line-height:1.5;">${escapeHtml(b.body)}</div>
    </div>
  `).join('');
  return items || `<p style="margin:0;color:#6b7280;">No recommendations.</p>`;
}

async function sendDemoTestEmail({ testData, email, name, userId = null }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const clientUrl = getClientUrl();
  const sport = testData.sport || 'bike';
  const unitSystem = testData.unitSystem || 'metric';
  const inputMode = testData.inputMode || (sport === 'run' || sport === 'swim' ? 'pace' : 'power');

  // If userId is provided, load user data from database
  let user = null;
  if (userId) {
    try {
      user = await User.findById(userId).select('name surname email dateOfBirth height weight sport specialization units powerZones heartRateZones');
    } catch (error) {
      console.error('[DemoTestEmailService] Error loading user:', error);
    }
  }

  // If no user from DB, create a minimal user object from provided name
  if (!user) {
    const nameParts = (name || '').split(' ');
    user = {
      name: nameParts[0] || '',
      surname: nameParts.slice(1).join(' ') || '',
      email: email || '',
      dateOfBirth: null,
      height: null,
      weight: null,
      sport: sport,
      specialization: null
    };
  }

  // Calculate thresholds and zones
  const curThr = calculateThresholds(testData);
  const curZones = calculateZonesFromTest(testData);

  // For demo tests, we don't have previous tests, so prevTest and prevThr are null
  const prevTest = null;
  const prevThr = null;

  const focus = buildFocusRecommendation({ sport, cur: curThr, prev: prevThr });

  const xLabel = sport === 'bike'
    ? 'Power (W)'
    : (sport === 'run' || sport === 'swim')
      ? `Pace (${sport === 'swim'
          ? (unitSystem === 'imperial' ? 'min/100yd' : 'min/100m')
          : (unitSystem === 'imperial' ? 'min/mile' : 'min/km')})`
      : 'Intensity';

  const lactateSvg = buildLactateCurveSvg({
    results: testData.results || [],
    sportLabel: `${sport.toUpperCase()} • Lactate Curve`,
    xLabel,
    sport,
    unitSystem,
    inputMode
  });
  const stagesSvg = buildStagesSvg({ results: testData.results || [], sport, unitSystem, inputMode });

  const title = `Lactate Test Report • ${sport.toUpperCase()} • ${formatDateShort(testData.date || new Date())}`;

  const content = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      ${renderUserInfo(user)}

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;color:#111827;font-size:16px;">Test</div>
            <div style="color:#4b5563;font-size:13px;margin-top:2px;">
              Title: <strong style="color:#111827;">${escapeHtml(testData.title || '—')}</strong><br/>
              Date: <strong style="color:#111827;">${escapeHtml(formatDateShort(testData.date || new Date()))}</strong><br/>
              Baseline lactate: <strong style="color:#111827;">${escapeHtml(Number(testData.baseLactate || 0).toFixed(2))}</strong>
            </div>
          </div>
          <div style="color:#6b7280;font-size:12px;text-align:right;">
            Generated by LaChart
          </div>
        </div>
      </div>

      ${stagesSvg ? `<div>${stagesSvg}</div>` : ''}
      ${lactateSvg ? `<div>${lactateSvg}</div>` : ''}

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:6px;">Zones</div>
        <div style="color:#6b7280;font-size:12px;margin-bottom:10px;">(calculated from this test)</div>
        ${renderZonesTable(curZones, { sport })}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Thresholds</div>
        ${renderThresholdsTable(curThr, { sport, unitSystem, inputMode })}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Stage results</div>
        ${renderResultsTable(testData, { sport, unitSystem, inputMode })}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Comparison</div>
        ${renderComparisonBlock({ sport, unitSystem, inputMode, currentTest: testData, prevTest, curThr, prevThr })}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">What to focus on</div>
        ${renderFocusBlock(focus)}
      </div>
    </div>
  `.trim();

  try {
    await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: email.toLowerCase(),
      subject: title,
      html: generateEmailTemplate({
        title,
        content,
        buttonText: 'Open LaChart',
        buttonUrl: `${clientUrl}/`,
        loginButtonText: userId ? 'Login to LaChart' : null,
        loginButtonUrl: userId ? `${clientUrl}/login` : null,
        footerText: userId ? 'Tip: Repeat the test under similar conditions for best comparisons.' : 'This is a demo test. Create an account to save and track your tests over time.'
      })
    });

    return { sent: true };
  } catch (error) {
    console.error('[DemoTestEmailService] Error sending email:', error);
    return { sent: false, reason: 'send_failed', error: error.message };
  }
}

module.exports = {
  sendDemoTestEmail
};
