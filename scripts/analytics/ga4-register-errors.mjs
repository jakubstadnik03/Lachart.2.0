#!/usr/bin/env node
/** Rozpad register_error podle typu chyby + signup funnel. */
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new BetaAnalyticsDataClient({
  keyFilename: path.join(__dirname, 'secrets', 'ga4-service-account.json'),
});
const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '509206827';
const dateRanges = [{ startDate: '90daysAgo', endDate: 'today' }];

async function run(dimensions, metrics, dimensionFilter, limit = 25) {
  const [res] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges,
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter,
    limit,
  });
  return res.rows || [];
}

async function main() {
  console.log('\n📊 Registrační chyby — posledních 90 dní\n');

  // Funnel
  const funnelEvents = ['form_start', 'user_registration', 'register_error', 'login_success', 'conversion_funnel'];
  console.log('── FUNNEL (90 dní) ──');
  for (const ev of funnelEvents) {
    const rows = await run(['eventName'], ['eventCount'], {
      filter: { fieldName: 'eventName', stringFilter: { value: ev } },
    }, 1);
    console.log(`${(rows[0]?.metricValues[0].value || '0').padStart(6)}  ${ev}`);
  }

  // Rozpad register_error podle parametru "error" (custom dimension)
  console.log('\n── register_error podle typu (pokud je custom dimension registrovaná) ──');
  try {
    const rows = await run(
      ['customEvent:error'],
      ['eventCount'],
      { filter: { fieldName: 'eventName', stringFilter: { value: 'register_error' } } },
    );
    if (!rows.length) console.log('(žádná data — parametr "error" možná není registrovaný jako custom dimension)');
    rows.forEach((r) =>
      console.log(`${r.metricValues[0].value.padStart(6)}  ${r.dimensionValues[0].value}`)
    );
  } catch (e) {
    console.log(`(nelze načíst rozpad: ${e.message})`);
    console.log('→ Parametr "error" není v GA4 registrovaný jako custom dimension.');
  }

  // Rozpad podle metody (email vs google)
  console.log('\n── register_error podle metody ──');
  try {
    const rows = await run(
      ['customEvent:method'],
      ['eventCount'],
      { filter: { fieldName: 'eventName', stringFilter: { value: 'register_error' } } },
    );
    if (!rows.length) console.log('(parametr "method" není registrovaný jako custom dimension)');
    rows.forEach((r) =>
      console.log(`${r.metricValues[0].value.padStart(6)}  ${r.dimensionValues[0].value}`)
    );
  } catch (e) {
    console.log(`(nelze načíst: ${e.message})`);
  }

  console.log('');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
