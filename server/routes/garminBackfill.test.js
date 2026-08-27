/**
 * Garmin history backfill: does it ask for the traces, or only the summaries?
 * Plain Node, no jest — run with:
 *
 *   node server/routes/garminBackfill.test.js
 *
 * This exists because the answer used to be "only the summaries". Garmin
 * delivers a re-imported history through two separate backfill endpoints, and
 * the per-second samples that become GarminStream arrive only from
 * `activityDetails`. Requesting `activities` alone produced accounts with a
 * full activity list and almost no traces — 76 activities against 13 streams
 * for one athlete — which silently degraded time-in-zones, peak efforts and
 * threshold drift to whatever had happened to land as a live push.
 *
 * axios is stubbed; nothing here talks to Garmin.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const assert = require('assert');
const axios = require('axios');

// Patch before the route module runs its job — it calls axios.get at request
// time, so replacing the method on the shared module object is enough.
const realGet = axios.get;
let calls = [];
let responder = () => ({ status: 202, data: {} });
axios.get = async (url, config) => {
  calls.push({ url, params: config?.params });
  const r = responder(url, config, calls.length);
  if (r instanceof Error) throw r;
  return r;
};

const routes = require('./integrationsRoutes');
const { triggerGarminBackfillQueued, GARMIN_BACKFILL_ENDPOINTS } = routes;

let passed = 0;
function test(name, fn) {
  return fn().then(
    () => { passed += 1; console.log(`  ok  ${name}`); },
    (err) => {
      console.error(`FAIL  ${name}`);
      console.error(`      ${err.message}`);
      process.exitCode = 1;
    },
  );
}

const NOW = Math.floor(Date.now() / 1000);
/** A token that getValidGarminToken returns without any network call. */
const user = (id) => ({
  _id: id,
  garmin: { accessToken: 'tok', refreshToken: null, expiresAt: NOW + 86400 },
});

async function runJob(u, startSec, endSec) {
  const job = triggerGarminBackfillQueued(u, startSec, endSec);
  const deadline = Date.now() + 60000;
  while (job.running && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(!job.running, 'job did not finish in time');
  return job;
}

function httpError(status, body) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data: body };
  return e;
}

(async () => {
  await test('asks for both endpoints, not just the summaries', async () => {
    calls = [];
    responder = () => ({ status: 202, data: {} });
    const job = await runJob(user('u-both'), NOW - 20 * 86400, NOW);

    assert.strictEqual(calls.length, 2, `expected 2 requests, got ${calls.length}`);
    const paths = calls.map((c) => c.url.replace(/^.*\/rest\/backfill\//, ''));
    assert.deepStrictEqual(paths, ['activities', 'activityDetails']);
    // The details request is the one that produces GarminStream.
    assert.ok(paths.includes('activityDetails'), 'activityDetails was never requested');
    assert.strictEqual(job.requested, 2);
    assert.strictEqual(job.failed, 0);
  });

  await test('asks both endpoints for the identical window', async () => {
    calls = [];
    responder = () => ({ status: 202, data: {} });
    await runJob(user('u-window'), NOW - 20 * 86400, NOW);
    const [a, b] = calls;
    assert.strictEqual(a.params.summaryStartTimeInSeconds, b.params.summaryStartTimeInSeconds);
    assert.strictEqual(a.params.summaryEndTimeInSeconds, b.params.summaryEndTimeInSeconds);
    assert.ok(a.params.summaryEndTimeInSeconds > a.params.summaryStartTimeInSeconds);
  });

  await test('counts progress in requests, not windows', async () => {
    calls = [];
    responder = () => ({ status: 202, data: {} });
    const job = await runJob(user('u-total'), NOW - 20 * 86400, NOW);
    assert.strictEqual(job.chunks, 1);
    assert.strictEqual(job.total, GARMIN_BACKFILL_ENDPOINTS.length);
    assert.deepStrictEqual(job.endpoints, ['activities', 'activityDetails']);
  });

  await test('treats 409 (window already queued) as success', async () => {
    calls = [];
    responder = () => ({ status: 409, data: {} });
    const job = await runJob(user('u-409'), NOW - 20 * 86400, NOW);
    assert.strictEqual(job.requested, 2);
    assert.strictEqual(job.failed, 0);
  });

  await test('a window older than the key minimum skips both endpoints, not one', async () => {
    calls = [];
    // Garmin refuses the whole window, whichever endpoint asks. Answering the
    // sibling request anyway would burn quota on a request already known to be
    // refused — and on a shared consumer key that is somebody else's sync.
    const minStart = new Date((NOW - 5 * 86400) * 1000).toISOString();
    responder = (url) => (
      url.endsWith('/activities')
        ? httpError(400, { errorMessage: `start ... before min start time of ${minStart}` })
        : { status: 202, data: {} }
    );
    const job = await runJob(user('u-min'), NOW - 300 * 86400, NOW);

    const firstWindowStart = calls[0].params.summaryStartTimeInSeconds;
    const askedForRefusedWindow = calls.filter(
      (c) => c.params.summaryStartTimeInSeconds === firstWindowStart,
    );
    assert.strictEqual(
      askedForRefusedWindow.length, 1,
      'the out-of-range window should be asked for once, then abandoned for both endpoints',
    );
    assert.ok(job.skippedBeforeMin >= 1, 'the skip should be recorded on the job');
    // Having skipped ahead, it must still go on to cover the allowed window.
    assert.ok(calls.length > 1, 'the job stopped instead of resuming inside the allowed window');
  });

  await test('an ordinary failure on the summaries still lets the traces through', async () => {
    calls = [];
    // A 500 on `activities` says nothing about `activityDetails`. Blocking the
    // sibling there would mean one flaky endpoint costs the athlete every
    // per-second trace in the window, which is the more valuable half.
    responder = (url) => (
      url.endsWith('/activities') ? httpError(500, { error: 'boom' }) : { status: 202, data: {} }
    );
    const job = await runJob(user('u-partial'), NOW - 20 * 86400, NOW);
    const paths = calls.map((c) => c.url.replace(/^.*\/rest\/backfill\//, ''));
    assert.ok(paths.includes('activityDetails'), 'traces were skipped because the summaries failed');
    assert.strictEqual(job.failed, 1);
    assert.strictEqual(job.requested, 1);
  });

  await test('records which endpoint failed', async () => {
    calls = [];
    responder = (url) => (
      url.endsWith('/activityDetails') ? httpError(500, { error: 'boom' }) : { status: 202, data: {} }
    );
    const job = await runJob(user('u-fail'), NOW - 20 * 86400, NOW);
    assert.strictEqual(job.failed, 1);
    assert.strictEqual(job.lastError.endpoint, 'activityDetails');
  });

  axios.get = realGet;
  console.log(`\n${passed} passed`);
  process.exit(process.exitCode || 0);
})();
