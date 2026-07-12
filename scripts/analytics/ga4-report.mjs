#!/usr/bin/env node
/**
 * LaChart — GA4 marketing report
 *
 * Stáhne klíčová marketingová data z Google Analytics 4 přes Data API.
 * Potřebuje:
 *   - service account JSON klíč v ./secrets/ga4-service-account.json
 *   - GA4_PROPERTY_ID (číselné Property ID, NE měřicí ID G-XXXX)
 *
 * Spuštění:
 *   cd scripts/analytics
 *   npm install
 *   GA4_PROPERTY_ID=123456789 node ga4-report.mjs
 *   # nebo si nastav rozsah:
 *   GA4_PROPERTY_ID=123456789 node ga4-report.mjs --days 30
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, 'secrets', 'ga4-service-account.json');

// ── Args ──────────────────────────────────────────────────────────────────
const daysArg = process.argv.indexOf('--days');
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 28;
// LaChart property ID (přepíšeš přes GA4_PROPERTY_ID=... když chceš jinou službu)
const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '509206827';

// ── Preflight ───────────────────────────────────────────────────────────────
if (!PROPERTY_ID) {
  console.error('❌ Chybí GA4_PROPERTY_ID. Najdeš ho v GA4 → Admin → Property Settings (číslo, ne G-XXXX).');
  process.exit(1);
}
if (!fs.existsSync(KEY_PATH)) {
  console.error(`❌ Chybí klíč: ${KEY_PATH}\n   Ulož service account JSON sem a spusť znovu.`);
  process.exit(1);
}

const client = new BetaAnalyticsDataClient({ keyFilename: KEY_PATH });
const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }];

const num = (v) => Number(v).toLocaleString('cs-CZ');
const section = (t) => console.log(`\n\x1b[1m\x1b[36m── ${t} ──────────────────────────────\x1b[0m`);

async function run(dimensions, metrics, limit = 15, orderByMetric = null) {
  const [res] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges,
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    limit,
    orderBys: orderByMetric
      ? [{ metric: { metricName: orderByMetric }, desc: true }]
      : undefined,
  });
  return res.rows || [];
}

async function main() {
  console.log(`\n📊 LaChart GA4 report — posledních ${DAYS} dní (property ${PROPERTY_ID})`);

  // 1) Přehled
  section('PŘEHLED');
  const totals = await run([], ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'averageSessionDuration', 'bounceRate']);
  if (totals[0]) {
    const m = totals[0].metricValues.map((x) => x.value);
    console.log(`Aktivní uživatelé: ${num(m[0])}`);
    console.log(`Noví uživatelé:    ${num(m[1])}`);
    console.log(`Návštěvy:          ${num(m[2])}`);
    console.log(`Zobrazení stránek: ${num(m[3])}`);
    console.log(`Prům. délka návštěvy: ${Math.round(m[4])} s`);
    console.log(`Bounce rate:       ${(Number(m[5]) * 100).toFixed(1)} %`);
  }

  // 2) Zdroje návštěvnosti
  section('ODKUD CHODÍ NÁVŠTĚVNÍCI (kanály)');
  const channels = await run(['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], 15, 'sessions');
  channels.forEach((r) =>
    console.log(`${(r.dimensionValues[0].value || '(none)').padEnd(20)} ${num(r.metricValues[0].value).padStart(8)} návštěv`)
  );

  // 3) Zdroj / médium
  section('ZDROJ / MÉDIUM');
  const sm = await run(['sessionSource', 'sessionMedium'], ['sessions'], 15, 'sessions');
  sm.forEach((r) =>
    console.log(`${(r.dimensionValues[0].value + ' / ' + r.dimensionValues[1].value).padEnd(32)} ${num(r.metricValues[0].value).padStart(8)}`)
  );

  // 4) Nejnavštěvovanější stránky (klíčové pro funnel kalkulaček)
  section('TOP STRÁNKY');
  const pages = await run(['pagePath'], ['screenPageViews', 'activeUsers'], 25, 'screenPageViews');
  pages.forEach((r) =>
    console.log(`${num(r.metricValues[0].value).padStart(8)}  ${r.dimensionValues[0].value}`)
  );

  // 5) Vstupní stránky (kde lidé přistávají)
  section('VSTUPNÍ STRÁNKY (landing)');
  const landing = await run(['landingPage'], ['sessions', 'activeUsers'], 20, 'sessions');
  landing.forEach((r) =>
    console.log(`${num(r.metricValues[0].value).padStart(8)}  ${r.dimensionValues[0].value}`)
  );

  // 6) Země
  section('ZEMĚ');
  const geo = await run(['country'], ['activeUsers'], 12, 'activeUsers');
  geo.forEach((r) =>
    console.log(`${(r.dimensionValues[0].value).padEnd(20)} ${num(r.metricValues[0].value).padStart(8)}`)
  );

  // 7) Zařízení
  section('ZAŘÍZENÍ');
  const dev = await run(['deviceCategory'], ['activeUsers', 'sessions'], 5, 'activeUsers');
  dev.forEach((r) =>
    console.log(`${(r.dimensionValues[0].value).padEnd(12)} ${num(r.metricValues[0].value).padStart(8)} uživatelů`)
  );

  // 8) Události (konverze — registrace, kliky na CTA…)
  section('UDÁLOSTI (events)');
  const events = await run(['eventName'], ['eventCount'], 25, 'eventCount');
  events.forEach((r) =>
    console.log(`${num(r.metricValues[0].value).padStart(8)}  ${r.dimensionValues[0].value}`)
  );

  console.log('\n✅ Hotovo. Zkopíruj tento výstup a pošli mi ho do chatu — udělám z něj marketingový rozbor.\n');
}

main().catch((err) => {
  console.error('\n❌ Chyba při volání GA4 API:', err.message);
  if (String(err.message).includes('PERMISSION_DENIED')) {
    console.error('   → Přidal jsi e-mail service accountu jako Viewer v GA4 (Admin → Property Access Management)?');
  }
  if (String(err.message).includes('has not been used') || String(err.message).includes('SERVICE_DISABLED')) {
    console.error('   → Zapni "Google Analytics Data API" v Google Cloud Console → APIs & Services.');
  }
  process.exit(1);
});
