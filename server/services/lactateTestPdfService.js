/**
 * Generate PDF for a lactate test report (same content as email report, including previous test comparison).
 * Uses Puppeteer to render the report HTML to PDF.
 */
const { getReportHtml } = require('./lactateTestReportEmailService');

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // Puppeteer not installed – PDF generation will return an error
}

/**
 * Generate PDF buffer for the given test.
 * @param {string} requesterUserId - Authenticated user ID
 * @param {string} testId - Test ID
 * @returns {{ pdf: Buffer, title: string }} or {{ error: true, reason: string }}
 */
async function generateTestReportPdf(requesterUserId, testId) {
  const result = await getReportHtml(requesterUserId, testId, { promo: false });
  if (result.error) {
    return { error: true, reason: result.reason };
  }

  if (!puppeteer) {
    return { error: true, reason: 'pdf_not_available' };
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setContent(result.html, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
    });
    await browser.close();
    return { pdf: Buffer.from(pdf), title: result.title };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[LactateTestPdfService] PDF generation error:', err);
    return { error: true, reason: 'pdf_generation_failed', message: err.message };
  }
}

module.exports = {
  generateTestReportPdf
};
