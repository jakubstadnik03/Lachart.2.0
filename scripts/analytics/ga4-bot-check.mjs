#!/usr/bin/env node
/** Bot check: engagement per country. Bots = high users, ~0 engagement/conversions. */
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new BetaAnalyticsDataClient({
  keyFilename: path.join(__dirname, 'secrets', 'ga4-service-account.json'),
});
const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '509206827';

const [res] = await client.runReport({
  property: `properties/${PROPERTY_ID}`,
  dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'country' }],
  metrics: [
    { name: 'activeUsers' },
    { name: 'engagementRate' },
    { name: 'averageSessionDuration' },
    { name: 'eventCount' },
    { name: 'userEngagementDuration' },
  ],
  orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  limit: 15,
});

console.log('\nZapojení podle země (28 dní) — bot = hodně uživatelů + ~0 engagement\n');
console.log('Země'.padEnd(20), 'Uživ.'.padStart(7), 'Engag%'.padStart(8), 'Ø délka'.padStart(9), 'Události/uživ'.padStart(13));
console.log('─'.repeat(62));
for (const r of (res.rows || [])) {
  const country = r.dimensionValues[0].value;
  const users = Number(r.metricValues[0].value);
  const eng = (Number(r.metricValues[1].value) * 100).toFixed(0) + '%';
  const dur = Math.round(Number(r.metricValues[2].value)) + 's';
  const events = Number(r.metricValues[3].value);
  const evPerUser = (events / Math.max(1, users)).toFixed(1);
  const flag = (Number(r.metricValues[1].value) < 0.4 || Number(r.metricValues[2].value) < 30) ? '  ⚠️ podezřelé' : '';
  console.log(country.padEnd(20), String(users).padStart(7), eng.padStart(8), dur.padStart(9), evPerUser.padStart(13), flag);
}
console.log('\n⚠️ = nízký engagement / krátká návštěva → možný bot/datacentrum. Porovnej s USA/UK (reální lidé).\n');
