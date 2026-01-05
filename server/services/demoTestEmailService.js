const nodemailer = require('nodemailer');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');
const { calculateThresholds } = require('../utils/lactateThresholds');
const { calculateZonesFromTest, formatPace } = require('../utils/lactateZones');

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

function formatDateShort(dateLike) {
  try {
    const date = new Date(dateLike);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return String(dateLike || '');
  }
}

function renderResultsTable(test, { sport, unitSystem, inputMode }) {
  const rows = (test.results || []).map((r, idx) => {
    const power = Number(r.power) || 0;
    let powerDisplay = '';
    
    if (sport === 'run' || sport === 'swim') {
      powerDisplay = formatPace(power);
    } else {
      powerDisplay = `${Math.round(power)}W`;
    }

    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; text-align: center; font-weight: 600;">${idx + 1}</td>
        <td style="padding: 10px; text-align: center;">${powerDisplay}</td>
        <td style="padding: 10px; text-align: center;">${r.heartRate ? Math.round(r.heartRate) : '-'} Bpm</td>
        <td style="padding: 10px; text-align: center;">${r.lactate ? Number(r.lactate).toFixed(1) : '-'} mmol/L</td>
        ${r.glucose ? `<td style="padding: 10px; text-align: center;">${Number(r.glucose).toFixed(1)} mmol/L</td>` : ''}
        ${r.RPE ? `<td style="padding: 10px; text-align: center;">${r.RPE}</td>` : ''}
      </tr>
    `;
  }).join('');

  const headers = `
    <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
      <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Stage</th>
      <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">${sport === 'run' || sport === 'swim' ? 'Pace' : 'Power'}</th>
      <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Heart Rate</th>
      <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Lactate</th>
      ${test.results?.[0]?.glucose ? '<th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Glucose</th>' : ''}
      ${test.results?.[0]?.RPE ? '<th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">RPE</th>' : ''}
    </tr>
  `;

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      ${headers}
      ${rows}
    </table>
  `;
}

function renderThresholdsTable(thresholds, { sport, unitSystem, inputMode }) {
  if (!thresholds || !thresholds.lt1 || !thresholds.lt2) {
    return '<p style="color: #6b7280;">Thresholds could not be calculated from this test data.</p>';
  }

  const formatPower = (value) => {
    if (!value) return '-';
    if (sport === 'run' || sport === 'swim') {
      return formatPace(value);
    }
    return `${Math.round(value)}W`;
  };

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
        <th style="padding: 12px; text-align: left; font-weight: 700; color: #111827;">Threshold</th>
        <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Value</th>
        <th style="padding: 12px; text-align: center; font-weight: 700; color: #111827;">Lactate</th>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; font-weight: 600; color: #3b82f6;">LT1 (Aerobic Threshold)</td>
        <td style="padding: 10px; text-align: center;">${formatPower(thresholds.lt1)}</td>
        <td style="padding: 10px; text-align: center;">${thresholds.lt1Lactate ? Number(thresholds.lt1Lactate).toFixed(1) : '-'} mmol/L</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; font-weight: 600; color: #ef4444;">LT2 (Anaerobic Threshold / OBLA)</td>
        <td style="padding: 10px; text-align: center;">${formatPower(thresholds.lt2)}</td>
        <td style="padding: 10px; text-align: center;">${thresholds.lt2Lactate ? Number(thresholds.lt2Lactate).toFixed(1) : '-'} mmol/L</td>
      </tr>
      ${thresholds.dmax ? `
      <tr>
        <td style="padding: 10px; font-weight: 600; color: #8b5cf6;">Dmax</td>
        <td style="padding: 10px; text-align: center;">${formatPower(thresholds.dmax)}</td>
        <td style="padding: 10px; text-align: center;">${thresholds.dmaxLactate ? Number(thresholds.dmaxLactate).toFixed(1) : '-'} mmol/L</td>
      </tr>
      ` : ''}
    </table>
  `;
}

async function sendDemoTestEmail({ testData, email, name }) {
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

  // Calculate thresholds
  const thresholds = calculateThresholds(testData);
  const zones = calculateZonesFromTest(testData);

  const title = `Your Lactate Test Results - ${testData.title || 'Demo Test'}`;
  
  const content = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <p>Hi ${name},</p>
      <p>Thank you for using LaChart's lactate curve calculator! Here are your test results:</p>
      
      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Test Information</div>
        <p style="margin: 5px 0;"><strong>Sport:</strong> ${sport.charAt(0).toUpperCase() + sport.slice(1)}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${formatDateShort(testData.date)}</p>
        ${testData.weight ? `<p style="margin: 5px 0;"><strong>Weight:</strong> ${testData.weight} ${unitSystem === 'metric' ? 'kg' : 'lbs'}</p>` : ''}
        ${testData.baseLactate ? `<p style="margin: 5px 0;"><strong>Base Lactate:</strong> ${Number(testData.baseLactate).toFixed(1)} mmol/L</p>` : ''}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Thresholds</div>
        ${renderThresholdsTable(thresholds, { sport, unitSystem, inputMode })}
      </div>

      <div style="border:1px solid #eef2f7;border-radius:10px;padding:14px;background:#ffffff;">
        <div style="font-weight:800;color:#111827;font-size:16px;margin-bottom:10px;">Stage Results</div>
        ${renderResultsTable(testData, { sport, unitSystem, inputMode })}
      </div>

      <p style="margin-top: 20px;">To save your tests and access advanced features like progress tracking and training zone generation, <a href="${clientUrl}/signup" style="color: #767EB5; text-decoration: none; font-weight: 600;">create a free account</a>.</p>
    </div>
  `.trim();

  try {
    await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: email.toLowerCase(),
      subject: title,
      html: generateEmailTemplate({
        title: 'Your Lactate Test Results',
        content,
        buttonText: 'Create Free Account',
        buttonUrl: `${clientUrl}/signup`,
        footerText: 'This is a demo test. Create an account to save and track your tests over time.'
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

